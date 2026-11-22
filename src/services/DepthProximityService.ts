import type { Detection } from '../types/avicia';

export type ProximityLevel = 'clear' | 'caution' | 'danger';

export interface ProximityAssessment {
  level: ProximityLevel;
  estimatedMeters: number | null;
  corridorScore: number;
  verticalObstacleDetected: boolean;
  floorVariationDetected: boolean;
  approachingFast: boolean;
  ttcSeconds: number | null;
  alertText: string | null;
}

interface TrackedBox {
  category: string;
  centerX: number;
  centerY: number;
  height: number;
  timestamp: number;
}

/**
 * Estimates relative proximity and walking-corridor variations in real time:
 * 1) Geometric ground-contact + apparent size for detected objects.
 * 2) Offscreen luminance-gradient analysis in the lower-center walking corridor
 *    to spot unlabeled vertical obstacles (poles, columns) or floor variations (curbs, steps).
 */
export class DepthProximityService {
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private prevTracks: TrackedBox[] = [];

  /**
   * Monocular Time-To-Collision (TTC) via bounding-box scale change:
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
      nextTracks.push({ category: det.category, centerX: cx, centerY: cy, height: h, timestamp: now });

      if (cx < 20 || cx > 80) continue;

      // Match closest previous track of the same category
      let bestPrev: TrackedBox | null = null;
      let bestDist = 25; // max % shift between frames
      for (const prev of this.prevTracks) {
        if (prev.category !== det.category) continue;
        const dist = Math.hypot(cx - prev.centerX, cy - prev.centerY);
        if (dist < bestDist) {
          bestDist = dist;
          bestPrev = prev;
        }
      }

      if (bestPrev) {
        // EMA smoothing to reduce frame-to-frame bounding box jitter
        const smoothedH = 0.65 * h + 0.35 * bestPrev.height;
        nextTracks[nextTracks.length - 1].height = smoothedH;
        const dt = (now - bestPrev.timestamp) / 1000;
        if (dt > 0.05 && dt < 2.0) {
          const dhDt = (smoothedH - bestPrev.height) / dt;
          if (dhDt > 2.5) {
            const ttc = Number((smoothedH / dhDt).toFixed(1));
            if (ttc > 0.2 && ttc < 8.0 && (minTtc === null || ttc < minTtc)) {
              minTtc = ttc;
              targetLabel = det.labelEs.toLowerCase();
            }
          }
        }
      }
    }

    this.prevTracks = nextTracks;
    return {
      approachingFast: minTtc !== null && minTtc <= 2.5,
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
      const inCorridor = centerX >= 22 && centerX <= 78;
      if (!inCorridor) continue;

      // Ground-plane heuristic: objects lower in frame & taller are closer
      const heightFactor = Math.max(0.12, det.bbox.height / 100);
      const bottomFactor = Math.max(0.25, bottomY / 100);
      const approxMeters = Number((1.15 / (heightFactor * 0.7 + bottomFactor * 0.35)).toFixed(1));

      if (minMeters === null || approxMeters < minMeters) {
        minMeters = approxMeters;
        closestLabel = det.labelEs.toLowerCase();
      }
    }

    if (minMeters === null) {
      return { level: 'clear', estimatedMeters: null, closestLabel: null };
    }

    const level: ProximityLevel =
      minMeters <= 1.6 ? 'danger' : minMeters <= 2.8 ? 'caution' : 'clear';

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
        corridorScore: detEstimate.level === 'danger' ? 85 : detEstimate.level === 'caution' ? 50 : 15,
        verticalObstacleDetected: false,
        floorVariationDetected: false,
        approachingFast: ttcInfo.approachingFast,
        ttcSeconds: ttcInfo.ttcSeconds,
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
        approachingFast: ttcInfo.approachingFast,
        ttcSeconds: ttcInfo.ttcSeconds,
        alertText: null,
      };
    }

    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h).data;

    const lumaAt = (x: number, y: number): number => {
      const i = (y * w + x) * 4;
      return 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
    };

    // Analyze central walking corridor: x in [28%..72%], y in [48%..92%]
    const xStart = Math.floor(w * 0.28);
    const xEnd = Math.floor(w * 0.72);
    const yStart = Math.floor(h * 0.48);
    const yEnd = Math.floor(h * 0.92);

    let strongVerticalEdges = 0;
    let strongHorizontalEdges = 0;
    let stepRows = 0;
    let samples = 0;

    for (let y = yStart + 1; y < yEnd - 1; y++) {
      let rowDySum = 0;
      let rowDxSum = 0;
      let rowCount = 0;
      for (let x = xStart + 1; x < xEnd - 1; x++) {
        const dx = Math.abs(lumaAt(x + 1, y) - lumaAt(x - 1, y));
        const dy = Math.abs(lumaAt(x, y + 1) - lumaAt(x, y - 1));
        if (dx > 40 && dx > dy * 1.25) strongVerticalEdges++;
        if (dy > 38 && dy > dx * 1.25) strongHorizontalEdges++;
        rowDySum += dy;
        rowDxSum += dx;
        rowCount++;
        samples++;
      }
      // Row-wise horizontal band detector for stairs / curbs (gradas / escalones)
      if (y >= Math.floor(h * 0.56) && rowCount > 0) {
        const avgDy = rowDySum / rowCount;
        const avgDx = rowDxSum / rowCount;
        if (avgDy > 18 && avgDy > avgDx * 1.15) {
          stepRows++;
        }
      }
    }

    const verticalRatio = samples > 0 ? strongVerticalEdges / samples : 0;
    const horizontalRatio = samples > 0 ? strongHorizontalEdges / samples : 0;

    const verticalObstacleDetected = verticalRatio > 0.11;
    const floorVariationDetected = stepRows >= 2 || horizontalRatio > 0.11;

    const corridorScore = Math.min(
      100,
      Math.round(Math.max(verticalRatio * 340, horizontalRatio * 340, stepRows * 14))
    );

    let level: ProximityLevel = ttcInfo.approachingFast ? 'danger' : detEstimate.level;
    if (stepRows >= 2 || verticalRatio > 0.16) {
      level = 'danger';
    } else if (verticalObstacleDetected || floorVariationDetected) {
      level = level === 'danger' ? 'danger' : 'caution';
    }

    let alertText: string | null = null;
    if (ttcInfo.approachingFast && ttcInfo.targetLabel) {
      alertText = `Acercamiento rápido: ${ttcInfo.targetLabel} (~${ttcInfo.ttcSeconds}s)`;
    } else if (detEstimate.level === 'danger' && detEstimate.closestLabel) {
      alertText = `Cuidado: ${detEstimate.closestLabel} muy cerca, a ${detEstimate.estimatedMeters} metros.`;
    } else if (stepRows >= 2 || (floorVariationDetected && detections.length === 0)) {
      alertText = 'Cuidado: grada o desnivel adelante.';
    } else if (verticalObstacleDetected && detections.length === 0) {
      alertText = 'Cuidado: obstáculo inmóvil frente a ti.';
    } else if (detEstimate.level === 'caution' && detEstimate.closestLabel) {
      alertText = `Atención: ${detEstimate.closestLabel} a ${detEstimate.estimatedMeters} metros.`;
    }

    return {
      level,
      estimatedMeters: detEstimate.estimatedMeters,
      corridorScore,
      verticalObstacleDetected,
      floorVariationDetected,
      approachingFast: ttcInfo.approachingFast,
      ttcSeconds: ttcInfo.ttcSeconds,
      alertText,
    };
  }
}

export const depthProximityService = new DepthProximityService();

