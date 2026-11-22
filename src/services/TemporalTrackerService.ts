import type { BoundingBox, Detection } from '../types/avicia';

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
 * Multi-frame temporal tracker & anti-flicker hysteresis filter.
 * Eliminates single-frame hallucinations ("boy who cried wolf") by requiring
 * multi-frame consistency (or high confidence >= 0.72) before confirming an object,
 * and smooths bounding boxes via Exponential Moving Average (EMA).
 */
export class TemporalTrackerService {
  private tracks: ActiveTrack[] = [];
  private nextId = 1;
  private readonly emaAlpha = 0.58;
  private readonly minHitsToConfirm = 2;
  private readonly highConfidenceInstantConfirm = 0.72;
  private readonly maxMissedFrames = 1;

  reset(): void {
    this.tracks = [];
  }

  update(rawDetections: Detection[], now: number = Date.now()): Detection[] {
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

        // Match if overlapping (IoU >= 0.18) or nearby center (< 22% of frame)
        if (iou >= 0.18 || dist <= 22) {
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

        const updatedDet: Detection = {
          ...det,
          id: bestTrack.trackId,
          trackId: bestTrack.trackId,
          bbox: smoothedBbox,
          confidence: smoothedConf,
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

        const newDet: Detection = {
          ...det,
          id: trackId,
          trackId,
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

    // Return confirmed detections first; keep pending only for subtle visual HUD if needed
    return this.tracks
      .filter((t) => t.detection.confirmationStatus === 'confirmed')
      .map((t) => t.detection);
  }
}

export const temporalTrackerService = new TemporalTrackerService();
