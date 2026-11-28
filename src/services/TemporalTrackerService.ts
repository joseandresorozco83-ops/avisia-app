import type { BoundingBox, Detection } from '../types/avicia';
import type { DepthGrid } from './DepthModelService';
import { computeClockPosition } from './DetectorService';

interface ActiveTrack {
  trackId: string;
  detection: Detection;
  hits: number;
  missedFrames: number;
  lastUpdatedAt: number;
}

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;
  const areaA = Math.max(1e-4, a.width * a.height);
  const areaB = Math.max(1e-4, b.width * b.height);
  return interArea / (areaA + areaB - interArea);
}

function centerDistance(a: BoundingBox, b: BoundingBox): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Stabilizes clock-face direction with ±4% boundary hysteresis so an object near a
 * sector border (e.g., 37%–39% between 10h and 12h) never flaps verbal announcements.
 */
export function stabilizeClockPosition(
  prevClock: string | undefined,
  centerX: number
): string {
  const fresh = computeClockPosition(centerX);
  if (!prevClock || prevClock === fresh) return fresh;

  const H = 4; // 4% deadband hysteresis
  if (prevClock === 'a las 9' && centerX < 20 + H) return prevClock;
  if (prevClock === 'a las 10' && centerX >= 20 - H && centerX < 38 + H) return prevClock;
  if (prevClock === 'a las 12' && centerX >= 38 - H && centerX <= 62 + H) return prevClock;
  if (prevClock === 'a las 2' && centerX > 62 - H && centerX <= 80 + H) return prevClock;
  if (prevClock === 'a las 3' && centerX > 80 - H) return prevClock;
  return fresh;
}

/**
 * Fuses pinhole vertical distance with Depth Anything V2 inverse-depth inside the
 * detection's center region, correcting pinhole overestimation when objects are clipped
 * by the top/bottom camera border.
 */
export function fuseDepthAndPinholeMeters(
  det: Detection,
  depthGrid?: DepthGrid
): number | null {
  const pinhole = det.estimatedMeters ?? null;
  if (!depthGrid) return pinhole;

  const padX = det.bbox.width * 0.25;
  const padY = det.bbox.height * 0.25;
  const gx1 = Math.max(
    0,
    Math.min(depthGrid.width - 1, Math.floor(((det.bbox.x + padX) / 100) * depthGrid.width))
  );
  const gx2 = Math.max(
    gx1 + 1,
    Math.min(
      depthGrid.width,
      Math.ceil(((det.bbox.x + det.bbox.width - padX) / 100) * depthGrid.width)
    )
  );
  const gy1 = Math.max(
    0,
    Math.min(depthGrid.height - 1, Math.floor(((det.bbox.y + padY) / 100) * depthGrid.height))
  );
  const gy2 = Math.max(
    gy1 + 1,
    Math.min(
      depthGrid.height,
      Math.ceil(((det.bbox.y + det.bbox.height - padY) / 100) * depthGrid.height)
    )
  );

  const samples: number[] = [];
  for (let y = gy1; y < gy2; y++) {
    for (let x = gx1; x < gx2; x++) {
      samples.push(depthGrid.values[y * depthGrid.width + x]);
    }
  }
  if (samples.length === 0) return pinhole;

  // Use 80th-percentile closest disparity (p80) so background pixels or far edges of a wall/door
  // never dilute the closest surface facing the blind user (eliminates the "a tres pasos" 2.3m clamp!)
  samples.sort((a, b) => a - b);
  const p80Idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.8));
  const p80Disparity = samples[p80Idx]; // 1.0 = closest (~0.45m), 0.0 = far (~4.8m)

  // Non-linear reciprocal inverse-depth curve: Z(d) = 0.45 + 4.35 * (1 - d)^1.75
  const depthMeters = Math.max(
    0.45,
    Number((0.45 + 4.35 * Math.pow(Math.max(0, 1 - p80Disparity), 1.75)).toFixed(1))
  );
  if (pinhole === null) return depthMeters;

  // Explicit architectural walls never inflate beyond their geometric corridor distance when depth is close
  if (det.id.startsWith('arch-wall-') || det.labelEs.toLowerCase().startsWith('pared')) {
    return Number(Math.min(pinhole, depthMeters).toFixed(1));
  }

  // Never let a relative depth map inflate the distance of a visibly large foreground object
  // (e.g., a chair covering 58% of screen height is ~1.2m away, never 3.5m!)
  const cappedDepthMeters =
    det.bbox.height >= 26 ? Math.min(depthMeters, pinhole * 1.15) : depthMeters;

  // Only treat large foreground boxes touching the bottom walking border as close border-clipped obstacles
  const isForegroundBottomClipped =
    det.bbox.height >= 36 && det.bbox.y + det.bbox.height >= 92;
  const depthWeight = isForegroundBottomClipped ? 0.65 : 0.35;
  const blended = depthWeight * cappedDepthMeters + (1 - depthWeight) * pinhole;
  return Number(Math.max(0.4, Math.min(6.5, blended)).toFixed(1));
}

/**
 * Multi-frame temporal tracker & anti-flicker hysteresis filter (v5.0):
 * - Eliminates single-frame misclassifications (requires 2+ frames or very high confidence >= 0.84).
 * - Stabilizes BOTH object detections (D-FINE/EfficientDet) AND architectural detections (SegFormer).
 * - Smooths bounding boxes via EMA, applies clock-face hysteresis, and fuses Depth + Pinhole distances.
 */
export class TemporalTrackerService {
  private tracks: ActiveTrack[] = [];
  private nextId = 1;
  private readonly emaAlpha = 0.58;
  private readonly minHitsToConfirm = 2;
  /** Confirm plausible detections (>= 48% confidence) immediately on frame 1 so walking people and close obstacles never require holding the phone still for 2 worker cycles */
  private readonly highConfidenceInstantConfirm = 0.48;
  private readonly maxMissedFrames = 1;

  reset(): void {
    this.tracks = [];
  }

  update(
    rawDetections: Detection[],
    now: number = Date.now(),
    depthGrid?: DepthGrid
  ): Detection[] {
    const matchedTrackIds = new Set<string>();
    const nextTracks: ActiveTrack[] = [];

    for (const det of rawDetections) {
      let bestTrack: ActiveTrack | null = null;
      let bestScore = -1;

      for (const track of this.tracks) {
        if (matchedTrackIds.has(track.trackId)) continue;
        if (track.detection.labelEs.toLowerCase() !== det.labelEs.toLowerCase()) continue;

        const iou = computeIoU(track.detection.bbox, det.bbox);
        const dist = centerDistance(track.detection.bbox, det.bbox);

        if (iou >= 0.12 || dist <= 32) {
          const score = iou * 2 - dist / 100;
          if (score > bestScore) {
            bestScore = score;
            bestTrack = track;
          }
        }
      }

      if (bestTrack) {
        matchedTrackIds.add(bestTrack.trackId);
        const prev = bestTrack.detection;
        const a = this.emaAlpha;

        const smoothedBbox: BoundingBox = {
          x: a * det.bbox.x + (1 - a) * prev.bbox.x,
          y: a * det.bbox.y + (1 - a) * prev.bbox.y,
          width: a * det.bbox.width + (1 - a) * prev.bbox.width,
          height: a * det.bbox.height + (1 - a) * prev.bbox.height,
        };

        const smoothedConf =
          typeof det.confidence === 'number' && typeof prev.confidence === 'number'
            ? a * det.confidence + (1 - a) * prev.confidence
            : det.confidence ?? prev.confidence;

        const hits = bestTrack.hits + 1;
        const confirmed =
          hits >= this.minHitsToConfirm ||
          (typeof smoothedConf === 'number' && smoothedConf >= this.highConfidenceInstantConfirm);

        const cx = smoothedBbox.x + smoothedBbox.width / 2;
        const stableClock = stabilizeClockPosition(prev.clockPosition, cx);
        const rawFusedMeters = fuseDepthAndPinholeMeters(
          { ...det, bbox: smoothedBbox },
          depthGrid
        );
        // Temporal distance smoothing + 0.15m deadband hysteresis prevents step-count oscillation
        let fusedMeters = rawFusedMeters;
        if (typeof rawFusedMeters === 'number' && typeof prev.estimatedMeters === 'number') {
          const blended = Number((0.52 * rawFusedMeters + 0.48 * prev.estimatedMeters).toFixed(1));
          fusedMeters =
            Math.abs(blended - prev.estimatedMeters) < 0.15 ? prev.estimatedMeters : blended;
        }

        const updatedDet: Detection = {
          ...det,
          id: det.id.startsWith('arch-') ? `arch-${bestTrack.trackId}` : bestTrack.trackId,
          trackId: bestTrack.trackId,
          bbox: smoothedBbox,
          confidence: smoothedConf,
          clockPosition: stableClock,
          estimatedMeters: fusedMeters,
          confirmationStatus: confirmed ? 'confirmed' : 'pending',
          firstSeenAt: prev.firstSeenAt,
          lastSeenAt: now,
          isNew: hits === this.minHitsToConfirm,
          framesConfirmed: hits,
        };

        nextTracks.push({
          trackId: bestTrack.trackId,
          detection: updatedDet,
          hits,
          missedFrames: 0,
          lastUpdatedAt: now,
        });
      } else {
        const trackId = `trk-${this.nextId++}`;
        const instantConfirm =
          typeof det.confidence === 'number' &&
          det.confidence >= this.highConfidenceInstantConfirm;

        const fusedMeters = fuseDepthAndPinholeMeters(det, depthGrid);
        const newDet: Detection = {
          ...det,
          id: det.id.startsWith('arch-') ? `arch-${trackId}` : trackId,
          trackId,
          estimatedMeters: fusedMeters,
          confirmationStatus: instantConfirm ? 'confirmed' : 'pending',
          firstSeenAt: now,
          lastSeenAt: now,
          isNew: instantConfirm,
          framesConfirmed: 1,
        };

        nextTracks.push({
          trackId,
          detection: newDet,
          hits: 1,
          missedFrames: 0,
          lastUpdatedAt: now,
        });
      }
    }

    // Brief persistence for confirmed tracks that blinked out for 1 frame
    for (const track of this.tracks) {
      if (matchedTrackIds.has(track.trackId)) continue;
      if (
        track.detection.confirmationStatus === 'confirmed' &&
        track.missedFrames < this.maxMissedFrames &&
        now - track.lastUpdatedAt < 1400
      ) {
        nextTracks.push({
          ...track,
          missedFrames: track.missedFrames + 1,
          detection: {
            ...track.detection,
            isNew: false,
            lastSeenAt: now,
          },
        });
      }
    }

    this.tracks = nextTracks;

    return this.tracks
      .filter((t) => t.detection.confirmationStatus === 'confirmed')
      .map((t) => t.detection);
  }
}

export const temporalTrackerService = new TemporalTrackerService();
export const archTemporalTrackerService = new TemporalTrackerService();
