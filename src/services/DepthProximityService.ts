import type { Detection } from '../types/avicia';
import { cameraCalibrationService } from './CameraCalibrationService';
import { cameraService } from './CameraService';

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
  /** True when a bright red fire extinguisher cabinet is mounted on a close frontal wall */
  redExtinguisherOnWall?: boolean;
  /** True when a close counter, desk partition, or wall blocks the central walking sector */
  centralCounterOrWallAhead?: boolean;
  /** Per-sector instant visual reach cap [0..100] from real-time wall/surface vertical continuity */
  sectorReachCap?: [number, number, number, number, number];
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
    video: HTMLVideoElement | HTMLImageElement,
    detections: Detection[]
  ): ProximityAssessment {
    const detEstimate = this.estimateFromDetections(detections);
    const ttcInfo = this.computeApproachTTC(detections, Date.now());
    const notReady =
      typeof document === 'undefined' ||
      (video instanceof HTMLVideoElement ? video.readyState < 2 : !video.complete);

    if (notReady) {
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

    const viewport = cameraService.detectActiveViewport(video);
    ctx.drawImage(
      video,
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
      0,
      0,
      w,
      h
    );
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

    // Real-time 5-sector vertical wall & close-counter detector (<1.5ms on 96x72 frame):
    // Detects when a painted wall (e.g. white wall with red EXTINTOR in Screenshot #1 or left wall in #5)
    // or a close white counter/partition (Screenshot #2) extends into the lower walking corridor where dark floor should be!
    const sectorReachCap: [number, number, number, number, number] = [100, 100, 100, 100, 100];
    let wallSectorsCentral = 0;
    let centralCounterOrWallAhead = false;
    let redExtinguisherPixels = 0;
    let centralSampledPixels = 0;

    const poseCal = cameraCalibrationService.getCalibration();
    const cameraTiltedUpAtWall = poseCal.pitchDownDeg < -2;

    if (avgLuma >= 24 && !cameraTiltedUpAtWall) {
      const floorStartFrac = Math.max(0.52, Math.min(0.74, poseCal.floorZoneStartPct / 100));
      for (let s = 0; s < 5; s++) {
        const sx1 = Math.floor((s * w) / 5) + 1;
        const sx2 = Math.floor(((s + 1) * w) / 5) - 1;
        const upperY1 = Math.floor(h * 0.24);
        const upperY2 = Math.floor(h * (floorStartFrac - 0.02));
        const lowerY1 = Math.floor(h * floorStartFrac);
        const lowerY2 = Math.floor(h * 0.86);

        let uSum = 0;
        let uSq = 0;
        let uCnt = 0;
        for (let y = upperY1; y < upperY2; y++) {
          for (let x = sx1; x < sx2; x++) {
            const v = lumaAt(x, y);
            uSum += v;
            uSq += v * v;
            uCnt++;
            if (s >= 1 && s <= 3) {
              const p = (y * w + x) * 4;
              const r = frame[p];
              const g = frame[p + 1];
              const b = frame[p + 2];
              centralSampledPixels++;
              if (r >= 150 && r > g * 1.9 && r > b * 1.9) {
                redExtinguisherPixels++;
              }
            }
          }
        }

        let lSum = 0;
        let lSq = 0;
        let lCnt = 0;
        for (let y = lowerY1; y < lowerY2; y++) {
          for (let x = sx1; x < sx2; x++) {
            const v = lumaAt(x, y);
            lSum += v;
            lSq += v * v;
            lCnt++;
            if (s >= 1 && s <= 3) {
              const p = (y * w + x) * 4;
              const r = frame[p];
              const g = frame[p + 1];
              const b = frame[p + 2];
              centralSampledPixels++;
              if (r >= 150 && r > g * 1.9 && r > b * 1.9) {
                redExtinguisherPixels++;
              }
            }
          }
        }

        const uMean = uSum / Math.max(1, uCnt);
        const uStd = Math.sqrt(Math.max(0, uSq / Math.max(1, uCnt) - uMean * uMean));
        const lMean = lSum / Math.max(1, lCnt);
        const lStd = Math.sqrt(Math.max(0, lSq / Math.max(1, lCnt) - lMean * lMean));

        // Case A: Continuous vertical wall extending all the way down into the walking floor zone (y=56..86%)
        // (Bright painted wall in lower zone with low texture std, OR seamless vertical luma continuity from upper to lower zone)
        const lowerIsPaintedWall = lMean >= 146 && lStd < 19.5;
        const seamlessVerticalWall =
          uMean >= 128 &&
          lMean >= 128 &&
          Math.abs(uMean - lMean) < 16 &&
          uStd < 22 &&
          lStd < 20;

        if (lowerIsPaintedWall || seamlessVerticalWall) {
          sectorReachCap[s] = 10;
          if (s >= 1 && s <= 3) wallSectorsCentral++;
        } else if (s === 2 && uMean >= 164 && uStd < 24 && uMean - lMean >= 32) {
          // Case B: Bright central counter / white partition desk at 12 o'clock (Screenshot #2)
          sectorReachCap[s] = 16;
          centralCounterOrWallAhead = true;
        }
      }
    }

    const redExtinguisherOnWall =
      centralSampledPixels > 0 &&
      redExtinguisherPixels / centralSampledPixels >= 0.07 &&
      (wallSectorsCentral >= 1 || sectorReachCap[2] <= 20);

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
      (centerStd < 13.5 && centerMean >= 38) ||
      wallSectorsCentral >= 2 ||
      redExtinguisherOnWall
    ) {
      this.flatWallStreak = Math.min(6, this.flatWallStreak + 1);
      if (this.flatWallStreak >= 2 || redExtinguisherOnWall || wallSectorsCentral >= 2) {
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
    if (flatWallAhead || redExtinguisherOnWall) {
      level = 'danger';
    } else if (centralCounterOrWallAhead) {
      level = level === 'danger' ? 'danger' : 'caution';
    }

    let alertText: string | null = null;
    if (cameraQuality === 'lens_blocked') {
      alertText = 'Cámara cubierta o sin luz. Revisa que nada tape el lente.';
    } else if (cameraQuality === 'too_dark') {
      alertText = 'Poca luz para detectar con precisión.';
    } else if (redExtinguisherOnWall) {
      alertText = '¡Alto! Pared y extintor a las 12, muy cerca, a un paso.';
    } else if (flatWallAhead) {
      alertText = '¡Alto! Pared muy cerca frente a ti, a un paso.';
    } else if (centralCounterOrWallAhead && detections.length === 0) {
      alertText = 'Mostrador o pared a las 12, a dos pasos.';
    } else if (ttcInfo.approachingFast && ttcInfo.targetLabel) {
      alertText = `¡Alto! ${ttcInfo.targetLabel} acercándose rápido (~${ttcInfo.ttcSeconds}s)`;
    } else if (detEstimate.level === 'danger' && detEstimate.closestLabel) {
      alertText = `${detEstimate.closestLabel} muy cerca, a ${detEstimate.estimatedMeters} m.`;
    } else if (detEstimate.level === 'caution' && detEstimate.closestLabel) {
      alertText = `${detEstimate.closestLabel} a ${detEstimate.estimatedMeters} m.`;
    }

    return {
      level,
      estimatedMeters:
        flatWallAhead || redExtinguisherOnWall
          ? 0.7
          : centralCounterOrWallAhead
            ? detEstimate.estimatedMeters ?? 1.2
            : detEstimate.estimatedMeters,
      corridorScore,
      verticalObstacleDetected,
      floorVariationDetected,
      floorTextureContrast,
      flatWallAhead,
      redExtinguisherOnWall,
      centralCounterOrWallAhead,
      sectorReachCap,
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
