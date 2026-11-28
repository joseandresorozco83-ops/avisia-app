export type MovementTriggerReason = 'none' | 'step' | 'gps' | 'turn' | 'visual';

export type SensorActionDecision =
  | 'stationary_hold'
  | 'step_advance'
  | 'turn_new_view'
  | 'camera_panning_wait';

export interface PedestrianMotionState {
  /** Monotonically increasing epoch incremented whenever the user steps, turns, or moves via GPS */
  movementEpoch: number;
  /** True when the user has stepped, turned, or translated within the last 1.8 seconds */
  isMoving: boolean;
  /** True when the camera is currently panning/sweeping rapidly (hold voice until camera settles) */
  isPanningFast?: boolean;
  /** Current sensor-driven action decision governing message frequency */
  sensorDecision?: SensorActionDecision;
  /** Recommended minimum cooldown (ms) between automatic voice messages based on current sensor activity */
  recommendedVoiceCooldownMs?: number;
  /** Physical steps detected via accelerometer pedometer + visual gait cadence */
  totalSteps: number;
  /** Estimated cumulative walking distance in meters (fusing GPS Haversine + 0.70m/step odometry) */
  estimatedMetersMoved: number;
  /** Distance moved in meters since the last spoken audio notification */
  metersSinceLastNotification: number;
  /** Steps taken since the last spoken audio notification */
  stepsSinceLastNotification: number;
  /** Real-time GPS status */
  gpsActive: boolean;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAccuracyMeters: number | null;
  gpsSpeedMps: number | null;
  /** What triggered the most recent position update */
  lastTrigger: MovementTriggerReason;
  lastMovedAt: number;
  /** Concise status badge for live camera HUD */
  statusBadge: string;
}

type MovementListener = (state: PedestrianMotionState) => void;

/**
 * Computes Haversine distance in meters between two WGS84 GPS coordinates.
 */
export function computeHaversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Real-Time GPS + Inertial Step Pedometer + Compass Heading Fusion Service (v5.3.0).
 *
 * Solves stale/delayed audio notifications when walking step-by-step:
 * 1) Outdoors: High-accuracy GPS (`navigator.geolocation.watchPosition`) measures real-time
 *    displacement (Haversine meters) and Doppler walking speed (m/s).
 * 2) Indoors & Outdoors: 3-axis accelerometer step detector (`DeviceMotionEvent`) detects each
 *    physical step (~0.70m) in <60ms even inside buildings where satellite GPS has ±10m multipath error.
 * 3) Rotations & Visual Flow: Gyroscope/compass heading changes (>=20°) and camera optical flow
 *    detect immediate changes in line-of-sight.
 * 4) Epoch Invalidation: Every step, turn, or GPS displacement increments `movementEpoch`,
 *    allowing the vision pipeline and TTS speech queue to discard in-flight worker frames and
 *    queued notifications that belonged to the previous spatial position.
 */
export class PedestrianNavigationService {
  private movementEpoch = 1;
  private totalSteps = 0;
  private estimatedMetersMoved = 0;
  private lastNotificationSteps = 0;
  private lastNotificationMeters = 0;

  private gpsActive = false;
  private gpsWatchId: number | null = null;
  private lastGpsLat: number | null = null;
  private lastGpsLng: number | null = null;
  private gpsAccuracyMeters: number | null = null;
  private gpsSpeedMps: number | null = null;

  private gravityMagEma = 9.81;
  private lastStepAt = 0;
  private lastTurnAt = 0;
  private lastMovedAt = 0;
  private lastHeadingDeg: number | null = null;
  private lastTrigger: MovementTriggerReason = 'none';
  private mobileBridgeActive = false;
  private currentMotionScore = 0;
  private highMotionStreak = 0;

  private trackingActive = false;
  private listeners = new Set<MovementListener>();

  private boundOnDeviceMotion = (e: DeviceMotionEvent) => this.handleDeviceMotion(e);
  private boundOnDeviceOrientation = (e: DeviceOrientationEvent) => this.handleDeviceOrientation(e);

  reset(): void {
    this.movementEpoch = 1;
    this.totalSteps = 0;
    this.estimatedMetersMoved = 0;
    this.lastNotificationSteps = 0;
    this.lastNotificationMeters = 0;
    this.lastGpsLat = null;
    this.lastGpsLng = null;
    this.gpsAccuracyMeters = null;
    this.gpsSpeedMps = null;
    this.gravityMagEma = 9.81;
    this.lastStepAt = 0;
    this.lastTurnAt = 0;
    this.lastMovedAt = 0;
    this.lastHeadingDeg = null;
    this.lastTrigger = 'none';
    this.mobileBridgeActive = false;
    this.currentMotionScore = 0;
    this.highMotionStreak = 0;
  }

  /**
   * Enables higher sensitivity visual gait & turn detection when the phone camera is streamed
   * to the laptop via Iriun Webcam (where the phone's physical IMU is not wired to the desktop browser).
   */
  setMobileBridgeActive(active: boolean): void {
    this.mobileBridgeActive = active;
  }

  getMovementEpoch(): number {
    return this.movementEpoch;
  }

  isActivelyMoving(now = Date.now()): boolean {
    return (
      (this.lastMovedAt > 0 && now - this.lastMovedAt <= 1850) ||
      (this.gpsSpeedMps !== null && this.gpsSpeedMps >= 0.5)
    );
  }

  /**
   * Requests mobile browser permissions for DeviceMotionEvent & DeviceOrientationEvent
   * when required by the mobile OS/browser (e.g., iOS Safari / mobile WebViews).
   */
  async requestSensorPermissions(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const MotionCtor = (window as unknown as {
        DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
      }).DeviceMotionEvent;
      if (MotionCtor && typeof MotionCtor.requestPermission === 'function') {
        await MotionCtor.requestPermission();
      }
    } catch {
      // Ignore permission rejection
    }
    try {
      const OrientCtor = (window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
      }).DeviceOrientationEvent;
      if (OrientCtor && typeof OrientCtor.requestPermission === 'function') {
        await OrientCtor.requestPermission();
      }
    } catch {
      // Ignore permission rejection
    }
  }

  /**
   * Starts real-time GPS watch (`enableHighAccuracy: true`) and inertial step/turn sensors.
   */
  startTracking(): void {
    if (this.trackingActive || typeof window === 'undefined') return;
    this.trackingActive = true;
    void this.requestSensorPermissions();

    window.addEventListener('devicemotion', this.boundOnDeviceMotion);
    window.addEventListener('deviceorientation', this.boundOnDeviceOrientation);

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        this.gpsWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            this.updateFromGpsPosition(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
              pos.coords.speed,
              pos.timestamp || Date.now()
            );
          },
          () => {
            this.gpsActive = false;
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
          }
        );
      } catch {
        this.gpsActive = false;
      }
    }
  }

  stopTracking(): void {
    this.trackingActive = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.boundOnDeviceMotion);
      window.removeEventListener('deviceorientation', this.boundOnDeviceOrientation);
    }
    if (
      this.gpsWatchId !== null &&
      typeof navigator !== 'undefined' &&
      'geolocation' in navigator
    ) {
      try {
        navigator.geolocation.clearWatch(this.gpsWatchId);
      } catch {
        // Ignore clearWatch errors
      }
      this.gpsWatchId = null;
    }
    this.gpsActive = false;
  }

  onMovementChange(listener: MovementListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    const snap = this.getState();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private advanceEpoch(reason: MovementTriggerReason, now: number): void {
    this.movementEpoch++;
    this.lastTrigger = reason;
    this.lastMovedAt = now;
    this.emitChange();
  }

  /**
   * Processes a real-time GPS coordinate update.
   * Rejects stationary multipath noise by comparing Haversine distance against horizontal accuracy
   * and Doppler speed.
   */
  updateFromGpsPosition(
    lat: number,
    lng: number,
    accuracyMeters: number | null = 8,
    speedMps: number | null = null,
    now = Date.now()
  ): PedestrianMotionState {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return this.getState(now);
    this.gpsActive = true;
    this.gpsAccuracyMeters =
      accuracyMeters !== null && Number.isFinite(accuracyMeters)
        ? Math.round(accuracyMeters)
        : null;
    this.gpsSpeedMps =
      speedMps !== null && Number.isFinite(speedMps) && speedMps >= 0
        ? Number(speedMps.toFixed(2))
        : null;

    if (this.lastGpsLat !== null && this.lastGpsLng !== null) {
      const distMeters = computeHaversineMeters(this.lastGpsLat, this.lastGpsLng, lat, lng);
      // Require displacement beyond GPS noise floor (or confirmed Doppler speed >= 0.55 m/s)
      const noiseFloor =
        this.gpsAccuracyMeters !== null
          ? Math.max(0.75, Math.min(2.2, this.gpsAccuracyMeters * 0.25))
          : 0.85;
      const confirmedMove =
        (distMeters >= noiseFloor && distMeters <= 25) ||
        (this.gpsSpeedMps !== null && this.gpsSpeedMps >= 0.55 && distMeters >= 0.45);

      if (confirmedMove) {
        this.lastGpsLat = lat;
        this.lastGpsLng = lng;
        this.estimatedMetersMoved = Number((this.estimatedMetersMoved + distMeters).toFixed(2));
        const inferredSteps = Math.max(1, Math.round(distMeters / 0.72));
        if (now - this.lastStepAt > 550) {
          this.totalSteps += inferredSteps;
          this.lastStepAt = now;
        }
        this.advanceEpoch('gps', now);
        return this.getState(now);
      }
    } else {
      this.lastGpsLat = lat;
      this.lastGpsLng = lng;
    }

    return this.getState(now);
  }

  /**
   * Processes 3-axis accelerometer samples (`DeviceMotionEvent`) to detect each physical footstep
   * in <60ms (works both indoors and outdoors).
   */
  updateFromAccelerometer(
    ax: number | null,
    ay: number | null,
    az: number | null,
    includesGravity = true,
    now = Date.now()
  ): PedestrianMotionState {
    if (ax === null || ay === null || az === null) return this.getState(now);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) {
      return this.getState(now);
    }

    const mag = Math.hypot(ax, ay, az);
    let dynamicLinearAccel = mag;
    if (includesGravity) {
      this.gravityMagEma = 0.88 * this.gravityMagEma + 0.12 * mag;
      dynamicLinearAccel = Math.abs(mag - this.gravityMagEma);
    }

    // Human walking step peak: >= 1.25 m/s^2 above gravity baseline, cadence 360ms..2000ms
    if (dynamicLinearAccel >= 1.25 && now - this.lastStepAt >= 360) {
      this.lastStepAt = now;
      this.totalSteps += 1;
      this.estimatedMetersMoved = Number((this.estimatedMetersMoved + 0.7).toFixed(2));
      this.advanceEpoch('step', now);
    }

    return this.getState(now);
  }

  /**
   * Processes compass/gyroscope yaw heading (`alpha`) to invalidate queued notifications
   * immediately when the user turns the camera to a new direction (>= 20°).
   */
  updateFromHeading(alphaDeg: number | null, now = Date.now()): PedestrianMotionState {
    if (alphaDeg === null || !Number.isFinite(alphaDeg)) return this.getState(now);
    if (this.lastHeadingDeg === null) {
      this.lastHeadingDeg = alphaDeg;
      return this.getState(now);
    }

    const diff = Math.abs(((alphaDeg - this.lastHeadingDeg + 540) % 360) - 180);
    if (diff >= 20 && now - this.lastTurnAt >= 320) {
      this.lastHeadingDeg = alphaDeg;
      this.lastTurnAt = now;
      this.advanceEpoch('turn', now);
    }
    return this.getState(now);
  }

  /**
   * Integrates camera visual motion score (frame-to-frame luminance flux in [0..100]).
   * - Filters out hand tremor and minor scene motion (< 18) so stationary users are not spammed.
   * - Requires sustained gait/translation motion (>= 18 for 2+ frames, cooldown >= 1.8s) to register a visual step
   *   when physical IMU events are unavailable (e.g. Iriun Webcam on PC).
   * - Flags rapid camera sweeps (`motionScore >= 28`) so voice announcements wait ~300ms for the view to settle.
   */
  updateFromVisualMotion(motionScore: number, now = Date.now()): PedestrianMotionState {
    if (!Number.isFinite(motionScore)) return this.getState(now);
    this.currentMotionScore = motionScore;

    const moveThreshold = this.mobileBridgeActive ? 17.5 : 19.5;
    const stepThreshold = this.mobileBridgeActive ? 19.0 : 21.5;

    if (motionScore >= moveThreshold) {
      this.highMotionStreak++;
    } else {
      this.highMotionStreak = 0;
    }

    // Require 2 consecutive moving frames and at least 1800ms since last visual trigger
    // so hand tremor or a person walking past never cuts off sentences or resets cooldowns every 400ms!
    if (this.highMotionStreak >= 2 && now - this.lastMovedAt >= 1800) {
      if (motionScore >= stepThreshold && now - this.lastStepAt >= 1650) {
        this.totalSteps += 1;
        this.estimatedMetersMoved = Number((this.estimatedMetersMoved + 0.7).toFixed(2));
        this.lastStepAt = now;
      }
      this.advanceEpoch('visual', now);
    }
    return this.getState(now);
  }

  /**
   * Marks that an audio notification was just spoken at the current user position.
   */
  recordNotificationSpoken(now = Date.now()): void {
    void now;
    this.lastNotificationSteps = this.totalSteps;
    this.lastNotificationMeters = this.estimatedMetersMoved;
  }

  /**
   * Evaluates whether a queued notification or in-flight worker inference captured at
   * `(capturedEpoch, capturedAtMs)` is still valid for the user's current spatial position.
   * Returns `false` if the user took a step, moved >= 0.65m via GPS, turned >= 20°, or if
   * the frame is older than `maxAgeMs`.
   */
  isNotificationStillUseful(
    capturedEpoch: number,
    capturedAtMs: number,
    now = Date.now(),
    maxAgeMs = 750
  ): boolean {
    if (capturedEpoch !== this.movementEpoch) {
      return false;
    }
    if (now - capturedAtMs > maxAgeMs) {
      return false;
    }
    return true;
  }

  private handleDeviceMotion(event: DeviceMotionEvent): void {
    const lin = event.acceleration;
    if (lin && lin.x !== null && lin.y !== null && lin.z !== null) {
      const mag = Math.hypot(lin.x, lin.y, lin.z);
      if (mag > 0.05) {
        this.updateFromAccelerometer(lin.x, lin.y, lin.z, false);
        return;
      }
    }
    const acc = event.accelerationIncludingGravity;
    if (acc) {
      this.updateFromAccelerometer(acc.x, acc.y, acc.z, true);
    }
  }

  private handleDeviceOrientation(event: DeviceOrientationEvent): void {
    this.updateFromHeading(event.alpha);
  }

  getState(now = Date.now()): PedestrianMotionState {
    const isMoving = this.isActivelyMoving(now);
    const isPanningFast = this.currentMotionScore >= 29;
    const metersSinceLastNotification = Number(
      Math.max(0, this.estimatedMetersMoved - this.lastNotificationMeters).toFixed(2)
    );
    const stepsSinceLastNotification = Math.max(0, this.totalSteps - this.lastNotificationSteps);

    const recentTurn = this.lastTrigger === 'turn' && now - this.lastTurnAt <= 2200;
    const sensorDecision: SensorActionDecision = isPanningFast
      ? 'camera_panning_wait'
      : recentTurn
        ? 'turn_new_view'
        : isMoving || stepsSinceLastNotification >= 1 || metersSinceLastNotification >= 0.65
          ? 'step_advance'
          : 'stationary_hold';

    // Sensor-regulated voice cadence:
    // - When turning to a new view: speak promptly (2.2s gap)
    // - When walking step-by-step: speak every 2.8s as distances change
    // - When standing still (stationary_hold): wait 10.5s before repeating the same scene
    const recommendedVoiceCooldownMs =
      sensorDecision === 'turn_new_view'
        ? 2200
        : sensorDecision === 'step_advance'
          ? 2800
          : 10500;

    const sensorTag = this.gpsActive ? 'GPS+IMU' : this.mobileBridgeActive ? 'Iriun+IMU' : 'Paso IMU';
    const stateTag = isPanningFast
      ? 'Enfocando giro...'
      : recentTurn
        ? 'Nueva vista'
        : isMoving
          ? `En marcha · ${this.totalSteps}p`
          : this.totalSteps > 0
            ? `Estático · ${this.totalSteps}p`
            : 'Estático';

    return {
      movementEpoch: this.movementEpoch,
      isMoving,
      isPanningFast,
      sensorDecision,
      recommendedVoiceCooldownMs,
      totalSteps: this.totalSteps,
      estimatedMetersMoved: this.estimatedMetersMoved,
      metersSinceLastNotification,
      stepsSinceLastNotification,
      gpsActive: this.gpsActive,
      gpsLat: this.lastGpsLat,
      gpsLng: this.lastGpsLng,
      gpsAccuracyMeters: this.gpsAccuracyMeters,
      gpsSpeedMps: this.gpsSpeedMps,
      lastTrigger: this.lastTrigger,
      lastMovedAt: this.lastMovedAt,
      statusBadge: `${sensorTag} · ${stateTag}`,
    };
  }
}

export const pedestrianNavigationService = new PedestrianNavigationService();
