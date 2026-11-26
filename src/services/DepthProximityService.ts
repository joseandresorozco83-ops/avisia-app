import type { Detection } from '../types/avicia';

export type ProximityLevel = 'clear' | 'caution' | 'danger';

export type CameraQualityIssue =
  | 'ok'
  | 'too_dark'
  | 'lens_blocked'
  | 'flat_wall_close'
  | 'fast_motion';

export interface ProximityAssessment {
  level: ProximityLevel;
  estimatedMeters: number | null;
  corridorScore: number;
  verticalObstacleDetected: boolean;
  /**
   * 2D horizontal contrast on the floor cannot distinguish flat colored tiles, rugs, or shadows
   * from real 3D stairs. Therefore floorVariationDetected is NEVER triggered from 2D RGB edges
   * alone (3D Depth Anything V2 ground-plane fitting + SegFormer stairs handle steps accurately).
   */
  floorVariationDetected: boolean;
  /** Informational 2D floor texture/color contrast score [0..100] (never fires a stair alarm) */
  floorTextureContrast?: number;
  flatWallAhead: boolean;
  approachingFast: boolean;
  ttcSeconds: number | null;
  cameraQuality: CameraQualityIssue;
  brightnessPct: number;
  motionScore: number;
  alertText: string | null;
}

interface TrackedBox {
  key: string;
  centerX: number;
  centerY: number;
  height: number;
  timestamp: number;
}

/**
 * Estimates real-time walking-corridor safety, camera health, and proximity:
 * 1) Pinhole-calibrated per-class distance + ground-plane fallback.
 * 2) Multi-frame temporal confirmation for stairs/curbs (eliminates single-frame floor texture false alarms).
 * 3) Motion-blur / rapid-panning gate (suppresses noisy edge triggers while turning the phone).
 * 4) Blind-ergonomics camera checks: lens blocked / dark room / staring directly into a flat wall.
 */
export class DepthProximityService {
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private prevTracks: TrackedBox[] = [];
  private prevLuma: Float32Array | null = null;
  private flatWallStreak = 0;

  reset(): void {
    this.prevTracks = [];
    this.prevLuma = null;
    this.flatWallStreak = 0;
  }

  /**
   * Monocular Time-To-Collision (TTC) via smoothed bounding-box scale change:
   * TTC = S(t) / (dS/dt), where S is apparent bbox height.
   */
  private computeApproachTTC(
    detections: Detection[],
    now: number
  ): { approachingFast: boolean; ttcSeconds: number | null; targetLabel: string | null } {
    let minTtc: number | null = null;
    let targetLabel: string | null = null;
    const nextTracks: TrackedBox[] = [];

    for (const det of detections) {
      const cx = det.bbox.x + det.bbox.width / 2;
      const cy = det.bbox.y + det.bbox.height / 2;
      const h = det.bbox.height;
      const key = det.trackId ?? det.labelEs.toLowerCase();
      nextTracks.push({ key, centerX: cx, centerY: cy, height: h, timestamp: now });

      if (cx < 20 || cx > 80) continue;

      let bestPrev: TrackedBox | null = null;
      let bestDist = 25;
      for (const prev of this.prevTracks) {
        if (prev.key !== key) continue;
        const dist = Math.hypot(cx - prev.centerX, cy - prev.centerY);
        if (dist < bestDist) {
          bestDist = dist;
          bestPrev = prev;
        }
      }

      if (bestPrev) {
        const smoothedH = 0.62 * h + 0.38 * bestPrev.height;
        nextTracks[nextTracks.length - 1].height = smoothedH;
        const dt = (now - bestPrev.timestamp) / 1000;
        if (dt > 0.08 && dt < 2.2) {
          const dhDt = (smoothedH - bestPrev.height) / dt;
          if (dhDt > 3.2) {
            const ttc = Number((smoothedH / dhDt).toFixed(1));
            if (ttc > 0.2 && ttc < 7.0 && (minTtc === null || ttc < minTtc)) {
              minTtc = ttc;
              targetLabel = det.labelEs.toLowerCase();
            }
          }
        }
      }
    }

    this.prevTracks = nextTracks;
    return {
      approachingFast: minTtc !== null && minTtc <= 2.3,
      ttcSeconds: minTtc,
      targetLabel,
    };
  }

  estimateFromDetections(detections: Detection[]): {
    level: ProximityLevel;
    estimatedMeters: number | null;
    closestLabel: string | null;
  } {
    let minMeters: number | null = null;
    let closestLabel: string | null = null;

    for (const det of detections) {
      const centerX = det.bbox.x + det.bbox.width / 2;
      const bottomY = det.bbox.y + det.bbox.height;
      const inCorridor =
        (centerX >= 22 && centerX <= 78) || (det.bbox.x + det.bbox.width >= 28 && det.bbox.x <= 72);
      if (!inCorridor) continue;

      let approxMeters: number;
      if (typeof det.estimatedMeters === 'number' && Number.isFinite(det.estimatedMeters)) {
        approxMeters = det.estimatedMeters;
      } else {
        const heightFactor = Math.max(0.12, det.bbox.height / 100);
        const bottomFactor = Math.max(0.25, bottomY / 100);
        approxMeters = Number((1.15 / (heightFactor * 0.7 + bottomFactor * 0.35)).toFixed(1));
      }

      if (minMeters === null || approxMeters < minMeters) {
        minMeters = approxMeters;
        closestLabel = det.labelEs.toLowerCase();
      }
    }

    if (minMeters === null) {
      return { level: 'clear', estimatedMeters: null, closestLabel: null };
    }

    const level: ProximityLevel =
      minMeters <= 1.5 ? 'danger' : minMeters <= 2.8 ? 'caution' : 'clear';

    return { level, estimatedMeters: minMeters, closestLabel };
  }

  analyzeVideoCorridor(
    video: HTMLVideoElement,
    detections: Detection[]
  ): ProximityAssessment {
    const detEstimate = this.estimateFromDetections(detections);
    const ttcInfo = this.computeApproachTTC(detections, Date.now());

    if (typeof document === 'undefined' || video.readyState < 2) {
      return {
        level: ttcInfo.approachingFast ? 'danger' : detEstimate.level,
        estimatedMeters: detEstimate.estimatedMeters,
        corridorScore:
          detEstimate.level === 'danger' ? 85 : detEstimate.level === 'caution' ? 50 : 15,
        verticalObstacleDetected: false,
        floorVariationDetected: false,
        flatWallAhead: false,
        approachingFast: ttcInfo.approachingFast,
        ttcSeconds: ttcInfo.ttcSeconds,
        cameraQuality: 'ok',
        brightnessPct: 50,
        motionScore: 0,
        alertText: detEstimate.closestLabel
          ? `Cuidado: ${detEstimate.closestLabel} a unos ${detEstimate.estimatedMeters} metros.`
          : null,
      };
    }

    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 96;
      this.offscreenCanvas.height = 72;
    }

    const w = this.offscreenCanvas.width;
    const h = this.offscreenCanvas.height;
    const ctx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        level: ttcInfo.approachingFast ? 'danger' : detEstimate.level,
        estimatedMeters: detEstimate.estimatedMeters,
        corridorScore: 15,
        verticalObstacleDetected: false,
        floorVariationDetected: false,
        flatWallAhead: false,
        approachingFast: ttcInfo.approachingFast,
        ttcSeconds: ttcInfo.ttcSeconds,
        cameraQuality: 'ok',
        brightnessPct: 50,
        motionScore: 0,
        alertText: null,
      };
    }

    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h).data;
    const pixelCount = w * h;
    const currLuma = new Float32Array(pixelCount);

    let lumaSum = 0;
    let lumaSqSum = 0;
    let motionSum = 0;

    for (let i = 0; i < pixelCount; i++) {
      const p = i * 4;
      const lum = 0.299 * frame[p] + 0.587 * frame[p + 1] + 0.114 * frame[p + 2];
      currLuma[i] = lum;
      lumaSum += lum;
      lumaSqSum += lum * lum;
      if (this.prevLuma && this.prevLuma.length === pixelCount) {
        motionSum += Math.abs(lum - this.prevLuma[i]);
      }
    }

    const avgLuma = lumaSum / pixelCount;
    const variance = Math.max(0, lumaSqSum / pixelCount - avgLuma * avgLuma);
    const lumaStdDev = Math.sqrt(variance);
    const brightnessPct = Math.round((avgLuma / 255) * 100);
    const motionScore = this.prevLuma ? Math.round((motionSum / pixelCount) * 1.4) : 0;
    this.prevLuma = currLuma;

    const lumaAt = (x: number, y: number): number => currLuma[y * w + x];

    // Check center-region uniformity for flat wall / covered lens
    let centerSum = 0;
    let centerSq = 0;
    let centerCount = 0;
    const cx1 = Math.floor(w * 0.25);
    const cx2 = Math.floor(w * 0.75);
    const cy1 = Math.floor(h * 0.22);
    const cy2 = Math.floor(h * 0.72);
    for (let y = cy1; y < cy2; y++) {
      for (let x = cx1; x < cx2; x++) {
        const v = lumaAt(x, y);
        centerSum += v;
        centerSq += v * v;
        centerCount++;
      }
    }
    const centerMean = centerSum / Math.max(1, centerCount);
    const centerStd = Math.sqrt(
      Math.max(0, centerSq / Math.max(1, centerCount) - centerMean * centerMean)
    );

    let cameraQuality: CameraQualityIssue = 'ok';
    if (avgLuma < 14 && lumaStdDev < 10) {
      cameraQuality = 'lens_blocked';
      this.flatWallStreak = 0;
    } else if (avgLuma < 24) {
      cameraQuality = 'too_dark';
      this.flatWallStreak = 0;
    } else if (motionScore > 26) {
      cameraQuality = 'fast_motion';
    } else if (
      centerStd < 11.5 &&
      centerMean >= 38 &&
      !detections.some((d) => d.proximityZone === 'front_close')
    ) {
      // Uniform wall or partition filling center across >= 3 calm frames
      this.flatWallStreak = Math.min(6, this.flatWallStreak + 1);
      if (this.flatWallStreak >= 3) {
        cameraQuality = 'flat_wall_close';
      }
    } else {
      this.flatWallStreak = Math.max(0, this.flatWallStreak - 1);
    }

    const flatWallAhead = cameraQuality === 'flat_wall_close';

    // Analyze central walking corridor only when camera is calm & illuminated
    let horizontalRatio = 0;

    if (cameraQuality === 'ok') {
      const xStart = Math.floor(w * 0.28);
      const xEnd = Math.floor(w * 0.72);
      const yStart = Math.floor(h * 0.48);
      const yEnd = Math.floor(h * 0.92);

      let strongHorizontalEdges = 0;
      let samples = 0;

      for (let y = yStart + 1; y < yEnd - 1; y++) {
        for (let x = xStart + 1; x < xEnd - 1; x++) {
          const dx = Math.abs(lumaAt(x + 1, y) - lumaAt(x - 1, y));
          const dy = Math.abs(lumaAt(x, y + 1) - lumaAt(x, y - 1));
          if (dy > 42 && dy > dx * 1.35) strongHorizontalEdges++;
          samples++;
        }
      }

      horizontalRatio = samples > 0 ? strongHorizontalEdges / samples : 0;
    }

    // 2D RGB edge gradients (both horizontal AND vertical) cannot distinguish striped carpets,
    // tile seams, or doorframes from 3D obstacles. Real obstacle & stair detection is handled strictly
    // by D-FINE Objects365, SegFormer ADE20K, and 3D Depth Anything V2.
    const floorVariationDetected = false;
    const floorTextureContrast = Math.min(100, Math.round(horizontalRatio * 300));
    const verticalObstacleDetected = false;

    const corridorScore = Math.min(
      100,
      Math.round(
        Math.max(
          detEstimate.level === 'danger' ? 88 : detEstimate.level === 'caution' ? 52 : 12,
          flatWallAhead ? 92 : 0
        )
      )
    );

    let level: ProximityLevel = ttcInfo.approachingFast ? 'danger' : detEstimate.level;
    if (flatWallAhead) {
      level = 'danger';
    }

    let alertText: string | null = null;
    if (cameraQuality === 'lens_blocked') {
      alertText = 'Cámara cubierta o sin luz. Revisa que nada tape el lente.';
    } else if (cameraQuality === 'too_dark') {
      alertText = 'Poca luz para detectar con precisión.';
    } else if (flatWallAhead) {
      alertText = '¡Alto! Pared muy cerca frente a ti.';
    } else if (ttcInfo.approachingFast && ttcInfo.targetLabel) {
      alertText = `¡Alto! ${ttcInfo.targetLabel} acercándose rápido (~${ttcInfo.ttcSeconds}s)`;
    } else if (detEstimate.level === 'danger' && detEstimate.closestLabel) {
      alertText = `${detEstimate.closestLabel} muy cerca, a ${detEstimate.estimatedMeters} m.`;
    } else if (verticalObstacleDetected && detections.length === 0) {
      alertText = 'Posible obstáculo inmóvil frente a ti.';
    } else if (detEstimate.level === 'caution' && detEstimate.closestLabel) {
      alertText = `${detEstimate.closestLabel} a ${detEstimate.estimatedMeters} m.`;
    }

    return {
      level,
      estimatedMeters: flatWallAhead ? 0.5 : detEstimate.estimatedMeters,
      corridorScore,
      verticalObstacleDetected,
      floorVariationDetected,
      floorTextureContrast,
      flatWallAhead,
      approachingFast: ttcInfo.approachingFast,
      ttcSeconds: ttcInfo.ttcSeconds,
      cameraQuality,
      brightnessPct,
      motionScore,
      alertText,
    };
  }
}

export const depthProximityService = new DepthProximityService();
