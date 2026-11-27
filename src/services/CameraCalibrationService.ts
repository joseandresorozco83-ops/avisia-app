import type { BoundingBox } from '../types/avicia';

export type DevicePosture = 'vertical' | 'horizontal' | 'diagonal';

export interface CameraPoseCalibration {
  /** Whether the phone is held vertically (portrait), horizontally (landscape), or crooked (diagonal) */
  posture: DevicePosture;
  /** Downward pitch angle in degrees (+10 deg = healthy forward walking tilt; < -8 deg = pointing at ceiling; > 40 deg = pointing at shoes) */
  pitchDownDeg: number;
  /** Sideways roll tilt in degrees (0 deg = upright) */
  rollDeg: number;
  /** Self-calibrated height of the camera lens above the floor in meters (default 1.28m, refined via floor objects & depth plane) */
  cameraHeightMeters: number;
  /** Projective image row [10..82] (%) where the horizontal floor plane meets the horizon */
  horizonRowPct: number;
  /** Dynamic starting row [42..80] (%) of the near-field walkable floor zone based on current camera pitch */
  floorZoneStartPct: number;
  /** Normalized vertical focal length (0.72 in 9:16 vertical portrait, 1.16 in 16:9 horizontal landscape) */
  focalLengthY: number;
  /** True when the camera is pointing forward along the user's walking direction (not panning rapidly or turned sharply sideways) */
  aimingForward: boolean;
  /** Angular deviation in degrees from the user's smoothed forward walking heading */
  headingDeviationDeg: number;
  /** True when pitch/roll are within the automatic mathematical compensation range ([-8 deg, +36 deg]) */
  autoRegulated: boolean;
  /** Compact human-readable telemetry label for the UI badge (e.g. "Alt 1.3m · Vertical · Frente") */
  statusBadge: string;
  /** Polite corrective prompt ONLY when the camera pose exceeds automatic compensation limits */
  correctionPrompt: string | null;
}

/**
 * Self-regulating 3D Projective & Inertial Camera Calibration Service (v5.2):
 * 1) Determines whether the smartphone is Vertical (portrait), Horizontal (landscape), or crooked (diagonal)
 *    from both video aspect geometry and IMU gravity vector (beta/gamma).
 * 2) Tracks camera pitch angle (theta_down) and computes the exact projective horizon row v_h(theta)
 *    and dynamic floor walking zone.
 * 3) Self-calibrates the phone's physical height above the floor (H_cam in meters, 0.85m..1.75m)
 *    using the projective cross-ratio of reference objects resting on the floor (people, doors, chairs, desks).
 * 4) Tracks compass/gyro yaw heading (alpha) during walking to determine whether the camera is aimed
 *    straight ahead along the walking path or turned sideways.
 * 5) Automatically compensates object distance and height classification within [-8°, +36°] pitch,
 *    and emits a calm correction prompt only when aimed at the ceiling, shoes, or held diagonally.
 */
export class CameraCalibrationService {
  private posture: DevicePosture = 'vertical';
  private pitchDownDeg = 12; // Default natural chest/hand forward tilt (+12° below horizontal)
  private rollDeg = 0;
  private cameraHeightMeters = 1.28; // Default chest/hand height for an adult pedestrian
  private baselineHeadingDeg: number | null = null;
  private headingDeviationDeg = 0;
  private hasImuSample = false;

  reset(): void {
    this.posture = 'vertical';
    this.pitchDownDeg = 12;
    this.rollDeg = 0;
    this.cameraHeightMeters = 1.28;
    this.baselineHeadingDeg = null;
    this.headingDeviationDeg = 0;
    this.hasImuSample = false;
  }

  /**
   * Updates inertial attitude from browser/WebView DeviceOrientationEvent (alpha, beta, gamma).
   * - In portrait upright holding: beta ~ 78°..85° means pointing forward with +5°..+12° downward pitch.
   * - beta = 90° is dead-level horizontal (0° pitch); beta = 60° is +30° downward pitch; beta = 110° is -20° upward pitch.
   */
  updateFromDeviceOrientation(
    alpha: number | null,
    beta: number | null,
    gamma: number | null
  ): CameraPoseCalibration {
    if (beta !== null && Number.isFinite(beta)) {
      this.hasImuSample = true;
      const absGamma = gamma !== null && Number.isFinite(gamma) ? Math.abs(gamma) : 0;

      if (absGamma >= 52 && Math.abs(beta) < 45) {
        this.posture = 'horizontal';
        // In landscape mode, pitch comes from beta/gamma combination
        const rawPitch = 90 - Math.min(130, Math.max(20, absGamma));
        this.pitchDownDeg = Number((0.75 * this.pitchDownDeg + 0.25 * rawPitch).toFixed(1));
        this.rollDeg = Math.round(beta);
      } else {
        this.rollDeg = gamma !== null && Number.isFinite(gamma) ? Math.round(gamma) : 0;
        this.posture = Math.abs(this.rollDeg) >= 34 ? 'diagonal' : 'vertical';
        // beta=90 -> 0° pitch; beta=78 -> +12° downward pitch; beta=105 -> -15° upward pitch
        const clampedBeta = Math.max(-20, Math.min(150, beta));
        const rawPitchDown = 90 - clampedBeta;
        this.pitchDownDeg = Number((0.72 * this.pitchDownDeg + 0.28 * rawPitchDown).toFixed(1));
      }
    }

    if (alpha !== null && Number.isFinite(alpha)) {
      if (this.baselineHeadingDeg === null) {
        this.baselineHeadingDeg = alpha;
      } else {
        // Compute shortest circular angle difference [-180..+180]
        let diff = ((alpha - this.baselineHeadingDeg + 540) % 360) - 180;
        this.headingDeviationDeg = Math.round(Math.abs(diff));
        // Slowly adapt forward walking heading baseline when user walks steadily forward
        if (Math.abs(diff) <= 35) {
          this.baselineHeadingDeg = (this.baselineHeadingDeg + 0.08 * diff + 360) % 360;
        } else {
          // If user permanently turned into a new corridor, adapt baseline smoothly
          this.baselineHeadingDeg = (this.baselineHeadingDeg + 0.03 * diff + 360) % 360;
        }
      }
    }

    return this.getCalibration();
  }

  /**
   * Refines orientation, visual horizon, and self-calibrated camera height above the floor (H_cam)
   * from video frame dimensions, SegFormer floor reach, and reference objects resting on the floor.
   */
  updateFromVisualScene(params: {
    videoWidth?: number;
    videoHeight?: number;
    walkableCorridorPct?: number | null;
    sectorFloorReachPct?: [number, number, number, number, number] | null;
    referenceObjects?: Array<{
      bbox: BoundingBox;
      typicalHeightMeters: number;
      confidence?: number;
      isFloorContact: boolean;
    }>;
  }): CameraPoseCalibration {
    const { videoWidth, videoHeight, sectorFloorReachPct, referenceObjects } = params;

    // 1. Detect vertical vs horizontal frame geometry when IMU hasn't reported diagonal roll
    if (videoWidth && videoHeight && this.posture !== 'diagonal') {
      if (videoWidth > videoHeight * 1.15) {
        this.posture = 'horizontal';
      } else if (videoHeight >= videoWidth) {
        this.posture = 'vertical';
      }
    }

    // 2. If device has no IMU gyroscope, self-regulate pitch estimate from visual floor reach in center corridor
    if (!this.hasImuSample && sectorFloorReachPct) {
      const maxReach = Math.max(...sectorFloorReachPct);
      if (maxReach >= 85) {
        // Seeing lots of floor up high -> phone tilted slightly more downward (~16°)
        this.pitchDownDeg = Number((0.85 * this.pitchDownDeg + 0.15 * 16).toFixed(1));
      } else if (maxReach >= 45) {
        this.pitchDownDeg = Number((0.85 * this.pitchDownDeg + 0.15 * 12).toFixed(1));
      }
    }

    // 3. Self-calibrate camera height above floor (H_cam) from floor-contact reference objects
    // Projective cross-ratio: for an object of known height H_obj resting on the floor at bottomY
    // with horizon at v_h, H_cam ≈ H_obj * (bottomY - v_h) / max(12, bbox.height)
    if (referenceObjects && referenceObjects.length > 0) {
      const cal = this.getCalibration();
      for (const obj of referenceObjects) {
        if (!obj.isFloorContact || (obj.confidence ?? 0) < 0.52) continue;
        const bottomY = obj.bbox.y + obj.bbox.height;
        // Must clearly rest on the floor below the horizon and not be clipped at top/bottom
        if (
          bottomY < cal.horizonRowPct + 16 ||
          bottomY > 96 ||
          obj.bbox.y < 4 ||
          obj.bbox.height < 18
        ) {
          continue;
        }
        const rawHeight =
          obj.typicalHeightMeters * ((bottomY - cal.horizonRowPct) / obj.bbox.height);
        if (rawHeight >= 0.85 && rawHeight <= 1.75) {
          // Smooth EMA update of camera height above floor
          this.cameraHeightMeters = Number(
            (0.88 * this.cameraHeightMeters + 0.12 * rawHeight).toFixed(2)
          );
        }
      }
    }

    return this.getCalibration();
  }

  getCalibration(): CameraPoseCalibration {
    const focalLengthY = this.posture === 'horizontal' ? 1.16 : 0.72;
    const pitchRad = (this.pitchDownDeg * Math.PI) / 180;

    // Projective horizon row v_h = 50% - 100% * f_y * tan(pitchDown)
    // When pitchDown = +12° (tilted slightly down), v_h ≈ 35%
    // When pitchDown = 0° (level), v_h = 50%
    // When pitchDown = -12° (pointing up), v_h ≈ 65%
    const horizonRowPct = Math.round(
      Math.max(12, Math.min(82, 50 - 100 * focalLengthY * Math.tan(pitchRad)))
    );

    // Near-field floor zone starts below the horizon (shifts dynamically as camera tilts!)
    const floorZoneStartPct = Math.round(
      Math.max(40, Math.min(78, horizonRowPct + 18))
    );

    const pitchInAutoBand = this.pitchDownDeg >= -8 && this.pitchDownDeg <= 36;
    const rollInAutoBand = this.posture !== 'diagonal' && Math.abs(this.rollDeg) < 34;
    const autoRegulated = pitchInAutoBand && rollInAutoBand;
    const aimingForward =
      autoRegulated && this.headingDeviationDeg <= 32;

    let correctionPrompt: string | null = null;
    if (this.pitchDownDeg < -10) {
      correctionPrompt =
        'Cámara apuntando muy arriba. Bájala un poco hacia el frente para ver tu camino.';
    } else if (this.pitchDownDeg > 38) {
      correctionPrompt =
        'Cámara apuntando muy al suelo. Levántala un poco hacia el frente.';
    } else if (this.posture === 'diagonal') {
      correctionPrompt =
        'Teléfono inclinado de lado. Enderézalo en posición vertical para mayor precisión.';
    }

    const postureLabel =
      this.posture === 'vertical'
        ? 'Vertical'
        : this.posture === 'horizontal'
          ? 'Horizontal'
          : 'Inclinado';
    const aimLabel =
      !pitchInAutoBand
        ? this.pitchDownDeg < -10
          ? 'Mirando arriba'
          : 'Mirando al suelo'
        : aimingForward
          ? 'Al frente'
          : 'Girando';

    const statusBadge = `Alt ${this.cameraHeightMeters.toFixed(1)}m · ${postureLabel} · ${aimLabel}`;

    return {
      posture: this.posture,
      pitchDownDeg: this.pitchDownDeg,
      rollDeg: this.rollDeg,
      cameraHeightMeters: this.cameraHeightMeters,
      horizonRowPct,
      floorZoneStartPct,
      focalLengthY,
      aimingForward,
      headingDeviationDeg: this.headingDeviationDeg,
      autoRegulated,
      statusBadge,
      correctionPrompt,
    };
  }

  /**
   * Computes self-calibrated distance in meters fusing:
   * 1) Pitch- and orientation-compensated pinhole size: Z_pin = H_obj * f_y * cos(pitch) / h_frac
   * 2) Trigonometric ground-plane contact distance from self-calibrated camera height H_cam:
   *    Z_ground = H_cam / tan(pitch_down + atan((v_bottom - 0.5) / f_y))
   */
  estimateCalibratedMeters(
    bbox: BoundingBox,
    typicalHeightMeters: number,
    isFloorContactObstacle = true
  ): number {
    const cal = this.getCalibration();
    const bottomY = bbox.y + bbox.height;
    const pitchRad = (Math.max(-15, Math.min(40, cal.pitchDownDeg)) * Math.PI) / 180;
    const cosPitch = Math.max(0.78, Math.cos(pitchRad));

    // 1. Pitch-compensated pinhole estimate (accounts for width on angled chairs/desks)
    const effectivePct = Math.max(
      bbox.height,
      Math.min(bbox.height * 1.45, bbox.width * 0.78)
    );
    const heightFrac = Math.max(0.08, effectivePct / 100);
    let pinholeMeters = (typicalHeightMeters * cal.focalLengthY * cosPitch) / heightFrac;

    // 2. Trigonometric ground-contact distance from self-calibrated camera height H_cam
    if (isFloorContactObstacle && bottomY > cal.horizonRowPct + 8 && typicalHeightMeters <= 2.15) {
      const vNorm = bottomY / 100;
      const rayAngleRad = Math.atan((vNorm - 0.5) / cal.focalLengthY);
      const totalDepressionRad = Math.max(0.14, Math.min(1.15, pitchRad + rayAngleRad));
      const groundMeters = cal.cameraHeightMeters / Math.tan(totalDepressionRad);

      // Blend pinhole with ground-plane trigonometry (prevents partial chair/desk boxes from jumping to 8m!)
      const groundWeight = bbox.height < 24 ? 0.58 : 0.35;
      pinholeMeters = (1 - groundWeight) * pinholeMeters + groundWeight * groundMeters;
    }

    return Number(Math.min(6.0, Math.max(0.4, pinholeMeters)).toFixed(1));
  }

  /**
   * Uses the self-calibrated horizon and floor contact geometry to determine if a bounding box
   * is mounted high on a wall (e.g., a whiteboard / "Pizarra") vs. standing on the floor (e.g., a "Refrigerador" or "Mesa").
   */
  isWallMountedAboveFloor(bbox: BoundingBox): boolean {
    const cal = this.getCalibration();
    const bottomY = bbox.y + bbox.height;
    // If the bottom of the object sits well above the floor contact band, it is mounted on the wall
    return bottomY < Math.min(76, cal.floorZoneStartPct + 14);
  }
}

export const cameraCalibrationService = new CameraCalibrationService();
