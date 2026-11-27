import type { BoundingBox, Detection, DoorState } from '../types/avicia';
import type { ArchitecturalAnalysis } from './ArchitecturalSegmenterService';
import type { DepthGrid, DepthMapSummary } from './DepthModelService';
import type { ProximityAssessment } from './DepthProximityService';

export interface StixelSector {
  index: number; // 0..4
  clockLabel: 'a las 10' | 'a las 11' | 'a las 12' | 'a las 1' | 'a las 2';
  shortLabel: '10h' | '11h' | '12h' | '1h' | '2h';
  sideLabel: 'izquierda' | 'centro-izquierda' | 'al frente' | 'centro-derecha' | 'derecha';
  /** Continuous traversable reach from user feet forward [0..100] */
  reachPct: number;
  /** Intuitive walking clearance in steps (0..4) */
  freeSteps: number;
  status: 'clear' | 'caution' | 'blocked';
}

export interface StixelNavigationPlan {
  sectors: [StixelSector, StixelSector, StixelSector, StixelSector, StixelSector];
  centerClear: boolean;
  centerFreeSteps: number;
  bestSector: StixelSector;
  recommendedDetour: {
    direction: 'left' | 'right';
    clockLabel: string;
    sideLabel: string;
    freeSteps: number;
  } | null;
  openDoorwayAhead: {
    clockLabel: string;
    labelEs: string;
  } | null;
  guidanceText: string;
  shortDetourHint: string | null;
}

const SECTOR_META: Array<{
  clockLabel: StixelSector['clockLabel'];
  shortLabel: StixelSector['shortLabel'];
  sideLabel: StixelSector['sideLabel'];
}> = [
  { clockLabel: 'a las 10', shortLabel: '10h', sideLabel: 'izquierda' },
  { clockLabel: 'a las 11', shortLabel: '11h', sideLabel: 'centro-izquierda' },
  { clockLabel: 'a las 12', shortLabel: '12h', sideLabel: 'al frente' },
  { clockLabel: 'a las 1', shortLabel: '1h', sideLabel: 'centro-derecha' },
  { clockLabel: 'a las 2', shortLabel: '2h', sideLabel: 'derecha' },
];

function sampleDepthRect(
  grid: DepthGrid,
  x1Pct: number,
  y1Pct: number,
  x2Pct: number,
  y2Pct: number
): number | null {
  const gx1 = Math.max(0, Math.min(grid.width - 1, Math.floor((x1Pct / 100) * grid.width)));
  const gx2 = Math.max(gx1 + 1, Math.min(grid.width, Math.ceil((x2Pct / 100) * grid.width)));
  const gy1 = Math.max(0, Math.min(grid.height - 1, Math.floor((y1Pct / 100) * grid.height)));
  const gy2 = Math.max(gy1 + 1, Math.min(grid.height, Math.ceil((y2Pct / 100) * grid.height)));

  let sum = 0;
  let count = 0;
  for (let y = gy1; y < gy2; y++) {
    for (let x = gx1; x < gx2; x++) {
      sum += grid.values[y * grid.width + x];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Classifies a detected door as open (passable doorway), closed (solid obstacle),
 * or semi-open (protruding door edge hazard) using DeepDoors2 depth-discontinuity principles
 * fused with SegFormer floor continuity.
 */
export function classifyDoorState(
  doorBbox: BoundingBox,
  depthGrid: DepthGrid | undefined,
  floorReachAtDoor: number | null
): { state: DoorState; labelEs: string; isInanimateObstacle: boolean } {
  if (depthGrid) {
    // Inner 60% of the door opening
    const padX = doorBbox.width * 0.2;
    const padY = doorBbox.height * 0.2;
    const innerDepth = sampleDepthRect(
      depthGrid,
      doorBbox.x + padX,
      doorBbox.y + padY,
      doorBbox.x + doorBbox.width - padX,
      doorBbox.y + doorBbox.height - padY
    );

    // Adjacent wall/frame strips left and right of the door
    const stripW = Math.max(6, Math.min(14, doorBbox.width * 0.35));
    const leftFrame =
      doorBbox.x >= 4
        ? sampleDepthRect(
            depthGrid,
            Math.max(0, doorBbox.x - stripW),
            doorBbox.y + padY,
            doorBbox.x,
            doorBbox.y + doorBbox.height - padY
          )
        : null;
    const rightFrame =
      doorBbox.x + doorBbox.width <= 96
        ? sampleDepthRect(
            depthGrid,
            doorBbox.x + doorBbox.width,
            doorBbox.y + padY,
            Math.min(100, doorBbox.x + doorBbox.width + stripW),
            doorBbox.y + doorBbox.height - padY
          )
        : null;

    const frameSamples = [leftFrame, rightFrame].filter((v): v is number => v !== null);
    const frameDepth =
      frameSamples.length > 0
        ? frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length
        : null;

    // Horizontal disparity gradient across door leaf (left half vs right half -> semi-open door)
    const midX = doorBbox.x + doorBbox.width / 2;
    const leftHalf = sampleDepthRect(
      depthGrid,
      doorBbox.x + doorBbox.width * 0.1,
      doorBbox.y + padY,
      midX,
      doorBbox.y + doorBbox.height - padY
    );
    const rightHalf = sampleDepthRect(
      depthGrid,
      midX,
      doorBbox.y + padY,
      doorBbox.x + doorBbox.width * 0.9,
      doorBbox.y + doorBbox.height - padY
    );

    if (innerDepth !== null && frameDepth !== null) {
      // Remember: Depth Anything V2 predicts inverse depth (higher = closer, lower = farther)
      const depthDrop = frameDepth - innerDepth;
      const horizSkew =
        leftHalf !== null && rightHalf !== null ? Math.abs(leftHalf - rightHalf) : 0;

      // Interior is significantly deeper than surrounding wall frame => OPEN DOORWAY!
      if (depthDrop >= 0.12 && (floorReachAtDoor === null || floorReachAtDoor >= 30)) {
        return {
          state: 'open',
          labelEs: 'Puerta abierta (paso libre)',
          isInanimateObstacle: false,
        };
      }

      // Strong left-to-right slant across door => SEMI-OPEN DOOR (edge hazard at face height!)
      if (horizSkew >= 0.14) {
        return {
          state: 'semi_open',
          labelEs: 'Puerta entreabierta',
          isInanimateObstacle: true,
        };
      }

      // Flat parity with surrounding wall => CLOSED DOOR (solid obstacle)
      if (Math.abs(depthDrop) <= 0.1) {
        return {
          state: 'closed',
          labelEs: 'Puerta cerrada',
          isInanimateObstacle: true,
        };
      }
    }
  }

  // Fallback without depth map: if walkable floor penetrates deep into a door region, hint open
  if (floorReachAtDoor !== null && floorReachAtDoor >= 55 && doorBbox.y + doorBbox.height < 82) {
    return {
      state: 'open',
      labelEs: 'Puerta abierta (paso libre)',
      isInanimateObstacle: false,
    };
  }

  return {
    state: 'unknown',
    labelEs: 'Puerta',
    isInanimateObstacle: true,
  };
}

/**
 * Enriches architectural door detections with open/closed/semi-open classification
 * and injects a geometric "Puerta abierta (paso libre)" detection when floor continuity
 * penetrates between two flanking walls even without an explicit ADE20K "door" mask.
 */
export function enrichDoorsWithDepth(
  detections: Detection[],
  archAnalysis: ArchitecturalAnalysis | null,
  depthSummary: DepthMapSummary | null,
  now = Date.now()
): Detection[] {
  const depthGrid = depthSummary?.grid;
  let hasDoorOrDoorway = false;

  const enriched = detections.map((det) => {
    const lower = det.labelEs.toLowerCase();
    if (!lower.startsWith('puerta')) return det;
    hasDoorOrDoorway = true;

    const cx = det.bbox.x + det.bbox.width / 2;
    const sIdx = Math.max(0, Math.min(4, Math.floor((cx / 100) * 5)));
    const floorReach = archAnalysis ? archAnalysis.sectorFloorReachPct[sIdx] : null;

    const classified = classifyDoorState(det.bbox, depthGrid, floorReach);
    return {
      ...det,
      labelEs: classified.labelEs,
      doorState: classified.state,
      isInanimateObstacle: classified.isInanimateObstacle,
    };
  });

  // Geometric open doorway injection when SegFormer sees floor penetrating between 2 walls
  if (
    !hasDoorOrDoorway &&
    archAnalysis?.openDoorwayDetected &&
    archAnalysis.openDoorwaySectorIdx !== null
  ) {
    const s = archAnalysis.openDoorwaySectorIdx;
    const bx = s * 20 + 2;
    const bw = 16;

    // If depth is available, verify center is not closer than flanking walls
    let depthConfirmsOpening = true;
    if (depthGrid) {
      const centerD = sampleDepthRect(depthGrid, bx, 25, bx + bw, 75);
      const leftD = sampleDepthRect(depthGrid, Math.max(0, bx - 18), 25, bx, 75);
      const rightD = sampleDepthRect(depthGrid, bx + bw, 25, Math.min(100, bx + bw + 18), 75);
      if (centerD !== null && leftD !== null && rightD !== null) {
        const wallAvg = (leftD + rightD) / 2;
        if (centerD > wallAvg + 0.06) {
          depthConfirmsOpening = false;
        }
      }
    }

    if (depthConfirmsOpening) {
      enriched.push({
        id: `arch-doorway-open-${now}`,
        category: 'obstacle',
        labelEs: 'Puerta abierta (paso libre)',
        source: 'real_video',
        confidence: 0.78,
        bbox: { x: bx, y: 18, width: bw, height: 66 },
        confirmationStatus: 'confirmed',
        priority: 94,
        firstSeenAt: now,
        lastSeenAt: now,
        isNew: true,
        isInanimateObstacle: false,
        proximityZone: 'front_mid',
        estimatedMeters: 2.2,
        clockPosition: SECTOR_META[s].clockLabel,
        doorState: 'open',
      });
    }
  }

  return enriched;
}

/**
 * Computes a 5-sector Semantic Stixel free-space map (10h, 11h, 12h, 1h, 2h)
 * fusing SegFormer walkable floor reach, COCO/architectural obstacles, and Depth Anything V2
 * vertical plane checks, outputting actionable forward & detour guidance for blind users.
 */
export function computeStixelCorridor(
  detections: Detection[],
  archAnalysis: ArchitecturalAnalysis | null,
  depthSummary: DepthMapSummary | null,
  proximity: ProximityAssessment | null
): StixelNavigationPlan {
  const depthGrid = depthSummary?.grid;
  const cameraBad =
    proximity !== null &&
    (proximity.cameraQuality === 'lens_blocked' || proximity.cameraQuality === 'too_dark');

  const sectorsList: StixelSector[] = [];

  for (let s = 0; s < 5; s++) {
    const x1 = s * 20;
    const x2 = x1 + 20;

    // 1. Baseline reach from SegFormer walkable floor (or calm heuristic if SegFormer still loading)
    let reachPct = cameraBad
      ? 0
      : archAnalysis
        ? archAnalysis.sectorFloorReachPct[s]
        : proximity?.cameraQuality === 'ok'
          ? 64
          : 30;

    // If SegFormer sees strong overall walkable corridor floor and low wall blockage, prevent bottom-edge shadows from zeroing center reach
    if (
      !cameraBad &&
      archAnalysis &&
      s >= 1 &&
      s <= 3 &&
      reachPct < 42 &&
      archAnalysis.walkableCorridorPct >= 34 &&
      archAnalysis.wallCorridorPct < 36
    ) {
      reachPct = Math.max(reachPct, Math.min(72, archAnalysis.walkableCorridorPct + 18));
    }

    // 2. Clip reach against blocking detections overlapping this sector
    for (const det of detections) {
      if (det.confirmationStatus !== 'confirmed') continue;
      // Open passable doorways, windows, and non-blocking tabletop items do NOT block walking space
      if (det.doorState === 'open' || det.labelEs.toLowerCase() === 'ventana') continue;
      const isBlockingEntity =
        det.isInanimateObstacle ||
        det.category === 'person' ||
        det.category === 'car' ||
        det.category === 'bus' ||
        det.category === 'motorcycle';
      if (!isBlockingEntity) continue;
      if ((det.estimatedMeters ?? 5) > 3.2) continue;

      const overlaps = det.bbox.x < x2 - 3 && det.bbox.x + det.bbox.width > x1 + 3;
      if (!overlaps) continue;

      const bottomY = det.bbox.y + det.bbox.height;
      // Only objects that reach down into the walking zone (bottomY >= 48%) or are close clip the floor
      if (bottomY < 45 && (det.estimatedMeters ?? 5) > 2.4) continue;

      // Higher bottomY (closer to bottom of frame = closer to user's feet) => shorter free reach
      const clearanceFromBottom = Math.max(0, Math.min(100, Math.round(((96 - bottomY) / 56) * 100)));
      const metersCap =
        typeof det.estimatedMeters === 'number'
          ? Math.max(0, Math.min(100, Math.round((det.estimatedMeters / 3.2) * 100)))
          : clearanceFromBottom;
      // Trust physical distance estimate when object is beyond 1.8m so perspective bottomY doesn't falsely zero out a 3m room
      const effectiveCap =
        typeof det.estimatedMeters === 'number' && det.estimatedMeters > 1.8
          ? metersCap
          : Math.min(clearanceFromBottom, metersCap);
      reachPct = Math.min(reachPct, effectiveCap);
    }

    // 3. Clip reach against Depth Anything V2 column wall / close surface check
    if (depthGrid && !cameraBad) {
      const lowerD = sampleDepthRect(depthGrid, x1 + 2, 72, x2 - 2, 94);
      const midD = sampleDepthRect(depthGrid, x1 + 2, 42, x2 - 2, 68);
      const upperD = sampleDepthRect(depthGrid, x1 + 2, 22, x2 - 2, 44);

      if (midD !== null && upperD !== null) {
        // Wall or closed solid surface very close in this column (high disparity + flat vertical slope)
        const verticalFlat = Math.abs(midD - upperD) < 0.08;
        if (midD >= 0.74 && verticalFlat) {
          reachPct = Math.min(reachPct, 14);
        } else if (midD >= 0.65 && verticalFlat) {
          reachPct = Math.min(reachPct, 36);
        }
      }
      // If floor ramp is healthy (lowerD clearly closer than midD) and SegFormer wasn't loaded yet, boost confidence
      if (!archAnalysis && lowerD !== null && midD !== null && lowerD - midD >= 0.12 && midD < 0.58) {
        reachPct = Math.max(reachPct, 66);
      }
    }

    // 4. Clip sector against real-time 2D/3D wall, counter, or stairs hazard
    if (proximity?.sectorReachCap) {
      reachPct = Math.min(reachPct, proximity.sectorReachCap[s]);
    }
    if (s >= 1 && s <= 3) {
      if (proximity?.flatWallAhead || proximity?.redExtinguisherOnWall || depthSummary?.wallAhead) {
        reachPct = Math.min(reachPct, 8);
      }
      if (proximity?.centralCounterOrWallAhead) {
        reachPct = Math.min(reachPct, 16);
      }
      if (proximity?.floorVariationDetected || depthSummary?.stepDetectedInDepth) {
        reachPct = Math.min(reachPct, 18);
      }
    }

    // Map reachPct [0..100] to intuitive steps (0..4)
    const freeSteps =
      reachPct >= 75 ? 4 : reachPct >= 52 ? 3 : reachPct >= 34 ? 2 : reachPct >= 18 ? 1 : 0;
    const status: StixelSector['status'] =
      freeSteps >= 2 ? 'clear' : freeSteps === 1 ? 'caution' : 'blocked';

    sectorsList.push({
      index: s,
      clockLabel: SECTOR_META[s].clockLabel,
      shortLabel: SECTOR_META[s].shortLabel,
      sideLabel: SECTOR_META[s].sideLabel,
      reachPct,
      freeSteps,
      status,
    });
  }

  const sectors = sectorsList as [
    StixelSector,
    StixelSector,
    StixelSector,
    StixelSector,
    StixelSector,
  ];
  const center = sectors[2];
  const centerClear = center.status === 'clear' && !cameraBad;

  let bestSector = center;
  for (const sec of sectors) {
    if (sec.reachPct > bestSector.reachPct) {
      bestSector = sec;
    }
  }

  // Check if an open passable doorway is right in front (11h..1h)
  const openDoorDet = detections.find(
    (d) =>
      d.doorState === 'open' &&
      (d.clockPosition === 'a las 12' ||
        d.clockPosition === 'a las 11' ||
        d.clockPosition === 'a las 1' ||
        d.proximityZone !== 'side')
  );
  const openDoorwayAhead = openDoorDet
    ? {
        clockLabel: openDoorDet.clockPosition ?? 'a las 12',
        labelEs: openDoorDet.labelEs,
      }
    : null;

  // Compute recommended detour when center (12h) is not clear
  let recommendedDetour: StixelNavigationPlan['recommendedDetour'] = null;
  if (!centerClear && !cameraBad) {
    const leftBest = sectors[0].reachPct >= sectors[1].reachPct ? sectors[0] : sectors[1];
    const rightBest = sectors[4].reachPct >= sectors[3].reachPct ? sectors[4] : sectors[3];
    const sideWinner = leftBest.reachPct >= rightBest.reachPct ? leftBest : rightBest;

    if (sideWinner.status === 'clear' && sideWinner.reachPct >= center.reachPct + 16) {
      recommendedDetour = {
        direction: sideWinner.index < 2 ? 'left' : 'right',
        clockLabel: sideWinner.clockLabel,
        sideLabel: sideWinner.index < 2 ? 'izquierda' : 'derecha',
        freeSteps: sideWinner.freeSteps,
      };
    }
  }

  const stepsPhrase = (n: number) =>
    n >= 4 ? 'más de 3 pasos libres' : n === 1 ? 'un paso libre' : `unos ${n} pasos libres`;

  let guidanceText: string;
  let shortDetourHint: string | null = null;

  if (cameraBad) {
    guidanceText = 'Sin visibilidad clara: revisa la luz o que el lente no esté cubierto.';
  } else if (openDoorwayAhead && center.freeSteps >= 2) {
    guidanceText = `Puerta abierta ${openDoorwayAhead.clockLabel}, paso libre.`;
  } else if (centerClear) {
    guidanceText = `Camino despejado a las 12, ${stepsPhrase(center.freeSteps)}.`;
  } else if (recommendedDetour) {
    shortDetourHint = `Espacio libre ${recommendedDetour.clockLabel} (${recommendedDetour.sideLabel})`;
    guidanceText = `Frente reducido; espacio despejado ${recommendedDetour.clockLabel} (${recommendedDetour.sideLabel}), ${stepsPhrase(recommendedDetour.freeSteps)}.`;
  } else {
    guidanceText = 'Espacio muy reducido al frente; detente y verifica con tu bastón.';
  }

  return {
    sectors,
    centerClear,
    centerFreeSteps: center.freeSteps,
    bestSector,
    recommendedDetour,
    openDoorwayAhead,
    guidanceText,
    shortDetourHint,
  };
}
