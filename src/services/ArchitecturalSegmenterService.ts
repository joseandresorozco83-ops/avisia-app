import type { ArchModelVariant, Detection, ObjectCategory } from '../types/avicia';
import { computeClockPosition, estimatePinholeMeters } from './DetectorService';
import { visionWorkerClient } from './VisionWorkerClient';

export interface ArchitecturalStatus {
  ready: boolean;
  loading: boolean;
  variant: ArchModelVariant;
  modelName: string;
  backend: 'webgpu' | 'wasm' | null;
  error: string | null;
  inferenceMs: number | null;
}

export interface RawSegmentMask {
  data: Uint8Array | Uint8ClampedArray | number[];
  width: number;
  height: number;
}

export interface RawSegmentItem {
  label: string;
  score?: number | null;
  mask: RawSegmentMask;
}

export interface ArchitecturalAnalysis {
  detections: Detection[];
  walkableCorridorPct: number; // 0..100 (% of lower-center corridor that is floor/sidewalk/path)
  wallCorridorPct: number; // 0..100 (% of center corridor blocked by wall)
  /** Per-sector continuous floor reach [0..100] from bottom upward for 5 sectors (10h, 11h, 12h, 1h, 2h) */
  sectorFloorReachPct: [number, number, number, number, number];
  /** Per-sector wall occupancy [0..100] in middle band (y: 25%..85%) for open-doorway detection */
  sectorWallPct: [number, number, number, number, number];
  /** True when floor penetrates forward between two flanking wall sectors (geometric open doorway) */
  openDoorwayDetected: boolean;
  /** Estimated center sector index (1..3) of geometric open doorway, if found */
  openDoorwaySectorIdx: number | null;
  /** True when SegFormer explicitly segments stairs / stairway / step pixels */
  hasStairsMask: boolean;
  pathVisuallyClear: boolean;
  detectedLabelsEs: string[];
  inferenceMs: number;
}

interface ArchClassConfig {
  labelEs: string;
  category: ObjectCategory;
  priority: number;
  isInanimateObstacle: boolean;
  minAreaPct: number;
  typicalHeightMeters: number;
}

const ARCH_MODEL_IDS: Record<ArchModelVariant, string> = {
  segformer_b0: 'Xenova/segformer-b0-finetuned-ade-512-512',
  segformer_b1: 'Xenova/segformer-b1-finetuned-ade-512-512',
};

const ARCH_MODEL_NAMES: Record<ArchModelVariant, string> = {
  segformer_b0: 'SegFormer-B0 ADE20K (37.4% mIoU · Rápido)',
  segformer_b1: 'SegFormer-B1 ADE20K (42.2% mIoU · Puertas+)',
};

const ARCH_CLASS_MAP: Record<string, ArchClassConfig> = {
  door: {
    labelEs: 'Puerta',
    category: 'obstacle',
    priority: 95,
    isInanimateObstacle: true,
    minAreaPct: 3.0,
    typicalHeightMeters: 2.05,
  },
  'screen door': {
    labelEs: 'Puerta de malla',
    category: 'obstacle',
    priority: 94,
    isInanimateObstacle: true,
    minAreaPct: 3.0,
    typicalHeightMeters: 2.05,
  },
  curtain: {
    labelEs: 'Cortina',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
    typicalHeightMeters: 2.1,
  },
  stairs: {
    labelEs: 'Escaleras',
    category: 'obstacle',
    priority: 98,
    isInanimateObstacle: true,
    minAreaPct: 2.8,
    typicalHeightMeters: 1.2,
  },
  stairway: {
    labelEs: 'Escaleras',
    category: 'obstacle',
    priority: 98,
    isInanimateObstacle: true,
    minAreaPct: 2.8,
    typicalHeightMeters: 1.2,
  },
  step: {
    labelEs: 'Grada',
    category: 'obstacle',
    priority: 98,
    isInanimateObstacle: true,
    minAreaPct: 2.4,
    typicalHeightMeters: 0.45,
  },
  escalator: {
    labelEs: 'Escalera eléctrica',
    category: 'obstacle',
    priority: 92,
    isInanimateObstacle: true,
    minAreaPct: 14.0,
    typicalHeightMeters: 1.4,
  },
  windowpane: {
    labelEs: 'Ventana',
    category: 'obstacle',
    priority: 74,
    isInanimateObstacle: false,
    minAreaPct: 6.0,
    typicalHeightMeters: 1.35,
  },
  column: {
    labelEs: 'Columna',
    category: 'pole',
    priority: 93,
    isInanimateObstacle: true,
    minAreaPct: 2.8,
    typicalHeightMeters: 2.4,
  },
  pillar: {
    labelEs: 'Columna',
    category: 'pole',
    priority: 93,
    isInanimateObstacle: true,
    minAreaPct: 2.8,
    typicalHeightMeters: 2.4,
  },
  pole: {
    labelEs: 'Poste',
    category: 'pole',
    priority: 94,
    isInanimateObstacle: true,
    minAreaPct: 2.0,
    typicalHeightMeters: 2.2,
  },
  streetlight: {
    labelEs: 'Poste de luz',
    category: 'pole',
    priority: 92,
    isInanimateObstacle: true,
    minAreaPct: 2.0,
    typicalHeightMeters: 2.5,
  },
  railing: {
    labelEs: 'Baranda',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 3.8,
    typicalHeightMeters: 1.0,
  },
  banister: {
    labelEs: 'Baranda',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 3.8,
    typicalHeightMeters: 1.0,
  },
  bannister: {
    labelEs: 'Baranda',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 3.8,
    typicalHeightMeters: 1.0,
  },
  fence: {
    labelEs: 'Reja o cerca',
    category: 'obstacle',
    priority: 91,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.4,
  },
  cabinet: {
    labelEs: 'Armario o mueble',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.35,
  },
  wardrobe: {
    labelEs: 'Clóset o armario',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 5.0,
    typicalHeightMeters: 1.9,
  },
  'chest of drawers': {
    labelEs: 'Mueble',
    category: 'obstacle',
    priority: 88,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.0,
  },
  bookcase: {
    labelEs: 'Estante',
    category: 'obstacle',
    priority: 87,
    isInanimateObstacle: true,
    minAreaPct: 5.0,
    typicalHeightMeters: 1.7,
  },
  shelf: {
    labelEs: 'Estante',
    category: 'obstacle',
    priority: 86,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.3,
  },
  counter: {
    labelEs: 'Mostrador',
    category: 'obstacle',
    priority: 91,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
    typicalHeightMeters: 0.95,
  },
  countertop: {
    labelEs: 'Mostrador',
    category: 'obstacle',
    priority: 91,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
    typicalHeightMeters: 0.95,
  },
  booth: {
    labelEs: 'Mostrador o módulo',
    category: 'obstacle',
    priority: 91,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.25,
  },
  desk: {
    labelEs: 'Escritorio',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
    typicalHeightMeters: 0.78,
  },
  table: {
    labelEs: 'Mesa',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
    typicalHeightMeters: 0.78,
  },
  'coffee table': {
    labelEs: 'Mesa baja',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 3.8,
    typicalHeightMeters: 0.48,
  },
  chair: {
    labelEs: 'Silla',
    category: 'chair',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 3.2,
    typicalHeightMeters: 0.85,
  },
  'swivel chair': {
    labelEs: 'Silla',
    category: 'chair',
    priority: 91,
    isInanimateObstacle: true,
    minAreaPct: 3.0,
    typicalHeightMeters: 0.90,
  },
  armchair: {
    labelEs: 'Sillón',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 3.8,
    typicalHeightMeters: 0.88,
  },
  sofa: {
    labelEs: 'Sillón',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 4.2,
    typicalHeightMeters: 0.88,
  },
  seat: {
    labelEs: 'Asiento',
    category: 'chair',
    priority: 88,
    isInanimateObstacle: true,
    minAreaPct: 3.5,
    typicalHeightMeters: 0.82,
  },
  stool: {
    labelEs: 'Taburete',
    category: 'chair',
    priority: 88,
    isInanimateObstacle: true,
    minAreaPct: 3.0,
    typicalHeightMeters: 0.65,
  },
  box: {
    labelEs: 'Caja',
    category: 'obstacle',
    priority: 86,
    isInanimateObstacle: true,
    minAreaPct: 3.2,
    typicalHeightMeters: 0.50,
  },
  case: {
    labelEs: 'Gabinete o caja',
    category: 'obstacle',
    priority: 86,
    isInanimateObstacle: true,
    minAreaPct: 3.2,
    typicalHeightMeters: 0.60,
  },
  ashcan: {
    labelEs: 'Basurero',
    category: 'obstacle',
    priority: 87,
    isInanimateObstacle: true,
    minAreaPct: 2.5,
    typicalHeightMeters: 0.60,
  },
  monitor: {
    labelEs: 'Monitor',
    category: 'unknown',
    priority: 76,
    isInanimateObstacle: false,
    minAreaPct: 2.8,
    typicalHeightMeters: 0.45,
  },
  computer: {
    labelEs: 'Computadora',
    category: 'unknown',
    priority: 76,
    isInanimateObstacle: false,
    minAreaPct: 2.8,
    typicalHeightMeters: 0.42,
  },
  'crt screen': {
    labelEs: 'Pantalla',
    category: 'unknown',
    priority: 75,
    isInanimateObstacle: false,
    minAreaPct: 3.0,
    typicalHeightMeters: 0.48,
  },
  screen: {
    labelEs: 'Pantalla',
    category: 'unknown',
    priority: 75,
    isInanimateObstacle: false,
    minAreaPct: 3.5,
    typicalHeightMeters: 0.55,
  },
  'bulletin board': {
    labelEs: 'Pizarra',
    category: 'unknown',
    priority: 68,
    isInanimateObstacle: false,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.05,
  },
  signboard: {
    labelEs: 'Rótulo',
    category: 'unknown',
    priority: 68,
    isInanimateObstacle: false,
    minAreaPct: 3.5,
    typicalHeightMeters: 0.65,
  },
  radiator: {
    labelEs: 'Radiador',
    category: 'obstacle',
    priority: 85,
    isInanimateObstacle: true,
    minAreaPct: 3.5,
    typicalHeightMeters: 0.70,
  },
  mirror: {
    labelEs: 'Espejo',
    category: 'obstacle',
    priority: 86,
    isInanimateObstacle: true,
    minAreaPct: 5.0,
    typicalHeightMeters: 1.4,
  },
  glass: {
    labelEs: 'Vidrio',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 1.8,
  },
};

const BACKGROUND_LANDMARK_LABELS = new Set([
  'curtain',
  'cabinet',
  'wardrobe',
  'chest of drawers',
  'bookcase',
  'shelf',
  'mirror',
]);

const WALKABLE_LABELS = new Set([
  'floor',
  'sidewalk',
  'path',
  'rug',
  'road',
  'earth',
  'runway',
  'dirt track',
  'grass',
  'field',
]);

type SegmentPipelineFn = (input: unknown) => Promise<RawSegmentItem[]>;

/**
 * Pure helper to convert ADE20K semantic segmentation masks (from SegFormer B0/B1)
 * into architectural detections (doors, curtains, stairs, walls, columns, cabinets),
 * compute 5-sector bottom-to-top floor reach (Stixels), and detect geometric open doorways
 * (walkable floor penetrating between flanking wall sectors).
 */
export function parseArchitecturalSegments(
  segments: RawSegmentItem[],
  inferenceMs = 0,
  now = Date.now()
): ArchitecturalAnalysis {
  const detections: Detection[] = [];
  const seenLabels = new Set<string>();
  let walkableCorridorSum = 0;
  let wallCorridorPct = 0;
  let wallBbox: { x: number; y: number; width: number; height: number } | null = null;
  let corridorBlockedByArch = false;

  // Compact 5-sector x 20-row occupancy grids for Stixel floor reach & flanking wall/doorway detection
  // NOTE: cellTotalSamples is counted ONCE per pixel so multiple walkable classes (e.g. floor + rug)
  // never divide the walkable ratio!
  const NUM_SECTORS = 5;
  const NUM_ROWS = 20; // row 0 = top (0%), row 19 = bottom (100%)
  const walkableGrid = new Float32Array(NUM_SECTORS * NUM_ROWS);
  const wallGrid = new Float32Array(NUM_SECTORS * NUM_ROWS);
  const doorFlankGrid = new Float32Array(NUM_SECTORS * NUM_ROWS);
  const cellSampleCount = new Float32Array(NUM_SECTORS * NUM_ROWS);
  let gridSamplesInitialized = false;

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const labelRaw = (seg.label || '').toLowerCase().trim();
    const mask = seg.mask;
    if (!mask || !mask.data || mask.width <= 0 || mask.height <= 0) continue;

    const w = mask.width;
    const h = mask.height;
    const stride = w >= 256 ? 2 : 1;

    const corrX1 = Math.floor(w * 0.25);
    const corrX2 = Math.floor(w * 0.75);
    const corrY1 = Math.floor(h * 0.42);
    const corrY2 = Math.floor(h * 0.95);
    const floorY1 = Math.floor(h * 0.54);

    const isWalkable = WALKABLE_LABELS.has(labelRaw);
    const isWall = labelRaw === 'wall';
    const isDoorLeafOrFrame =
      isWall ||
      labelRaw === 'door' ||
      labelRaw === 'screen door' ||
      labelRaw === 'cabinet' ||
      labelRaw === 'wardrobe' ||
      labelRaw === 'booth';

    let totalSampled = 0;
    let activePixels = 0;
    let corrTotal = 0;
    let corrActive = 0;
    let floorTotal = 0;
    let floorActive = 0;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    const countCellSamplesThisPass = !gridSamplesInitialized;

    for (let y = 0; y < h; y += stride) {
      const rBin = Math.min(NUM_ROWS - 1, Math.floor((y / h) * NUM_ROWS));
      for (let x = 0; x < w; x += stride) {
        totalSampled++;
        const inCorr = x >= corrX1 && x <= corrX2 && y >= corrY1 && y <= corrY2;
        const inFloorCorr = x >= corrX1 && x <= corrX2 && y >= floorY1 && y <= corrY2;
        if (inCorr) corrTotal++;
        if (inFloorCorr) floorTotal++;

        const sBin = Math.min(NUM_SECTORS - 1, Math.floor((x / w) * NUM_SECTORS));
        const cellIdx = sBin * NUM_ROWS + rBin;
        if (countCellSamplesThisPass) {
          cellSampleCount[cellIdx]++;
        }

        const val = mask.data[y * w + x];
        if (val > 127) {
          activePixels++;
          if (inCorr) corrActive++;
          if (inFloorCorr) floorActive++;
          if (isWalkable) walkableGrid[cellIdx]++;
          if (isWall) wallGrid[cellIdx]++;
          if (isDoorLeafOrFrame) doorFlankGrid[cellIdx]++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (countCellSamplesThisPass && totalSampled > 0) {
      gridSamplesInitialized = true;
    }

    if (activePixels === 0 || totalSampled === 0) continue;

    const areaPct = (activePixels / totalSampled) * 100;
    const corrPct = corrTotal > 0 ? (corrActive / corrTotal) * 100 : 0;
    const floorPct = floorTotal > 0 ? (floorActive / floorTotal) * 100 : 0;

    if (isWalkable) {
      walkableCorridorSum += floorPct;
      continue;
    }

    const bx = Math.max(0, (minX / w) * 100);
    const by = Math.max(0, (minY / h) * 100);
    const bw = Math.min(100 - bx, Math.max(2, ((maxX - minX + stride) / w) * 100));
    const bh = Math.min(100 - by, Math.max(2, ((maxY - minY + stride) / h) * 100));

    if (isWall) {
      wallCorridorPct = Math.max(wallCorridorPct, Math.round(corrPct));
      wallBbox = { x: bx, y: by, width: bw, height: bh };
      continue;
    }

    const cfg = ARCH_CLASS_MAP[labelRaw];
    if (!cfg || areaPct < cfg.minAreaPct) continue;
    if (seenLabels.has(cfg.labelEs)) continue;
    seenLabels.add(cfg.labelEs);

    const centerX = bx + bw / 2;
    const clockPosition = computeClockPosition(centerX);
    const estimatedMeters = estimatePinholeMeters(bh, cfg.typicalHeightMeters);
    const centerOverlapWidth = Math.max(0, Math.min(bx + bw, 66) - Math.max(bx, 34));
    const isCentered = (centerX >= 30 && centerX <= 70) || centerOverlapWidth >= 14;

    let proximityZone: Detection['proximityZone'] = 'side';
    if (isCentered) {
      if (corrPct >= 26 || estimatedMeters <= 1.8 || bh >= 62) {
        proximityZone = 'front_close';
      } else {
        proximityZone = 'front_mid';
      }
    }

    // Background wall/room items (curtains, shelves, cabinets) are only urgent obstacles when very close
    const effectiveObstacle =
      cfg.isInanimateObstacle &&
      (!BACKGROUND_LANDMARK_LABELS.has(labelRaw) || proximityZone === 'front_close');

    if (effectiveObstacle && corrPct >= 22 && isCentered) {
      corridorBlockedByArch = true;
    }

    detections.push({
      id: `arch-${labelRaw.replace(/\s+/g, '_')}-${sIdx}-${now}`,
      category: cfg.category,
      labelEs: cfg.labelEs,
      source: 'real_video',
      confidence: Math.min(0.95, Math.max(0.62, 0.58 + areaPct / 60)),
      bbox: { x: bx, y: by, width: bw, height: bh },
      confirmationStatus: 'confirmed',
      priority: cfg.priority,
      firstSeenAt: now,
      lastSeenAt: now,
      isNew: true,
      isInanimateObstacle: effectiveObstacle,
      proximityZone,
      estimatedMeters,
      clockPosition,
      doorState: labelRaw === 'door' || labelRaw === 'screen door' ? 'unknown' : undefined,
    });
  }

  // Compute bottom-to-top continuous floor reach & mid-band wall/door-flank occupancy per sector (0..4)
  const sectorFloorReachPct: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const sectorWallPct: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const sectorFlankPct: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (let s = 0; s < NUM_SECTORS; s++) {
    // Walk bottom-up from row 19 (bottom) to row 7 (35% from top) allowing up to 2 brief noise/shadow gaps
    let consecutiveWalkableRows = 0;
    let gaps = 0;
    for (let r = NUM_ROWS - 1; r >= 7; r--) {
      const idx = s * NUM_ROWS + r;
      const denom = cellSampleCount[idx];
      const ratio = denom > 0 ? Math.min(1, walkableGrid[idx] / denom) : 0;
      if (ratio >= 0.25) {
        consecutiveWalkableRows++;
        gaps = 0;
      } else if (r >= NUM_ROWS - 2 && consecutiveWalkableRows === 0) {
        // Allow bottom-most row (r=19 or 18) to have a shadow without aborting floor scan
        continue;
      } else if (consecutiveWalkableRows > 0 && gaps < 2) {
        gaps++;
      } else if (consecutiveWalkableRows > 0) {
        break;
      }
    }
    // Max possible rows from 19 down to 7 = 13 rows -> map to 0..100%
    sectorFloorReachPct[s] = Math.min(100, Math.round((consecutiveWalkableRows / 11) * 100));

    // Mid-band wall & door-flank percentage (rows 5..16 = y 25%..85%)
    let wSum = 0;
    let fSum = 0;
    let wTot = 0;
    for (let r = 5; r <= 16; r++) {
      const idx = s * NUM_ROWS + r;
      wSum += wallGrid[idx];
      fSum += doorFlankGrid[idx];
      wTot += cellSampleCount[idx];
    }
    sectorWallPct[s] = wTot > 0 ? Math.min(100, Math.round((wSum / wTot) * 100)) : 0;
    sectorFlankPct[s] = wTot > 0 ? Math.min(100, Math.round((fSum / wTot) * 100)) : 0;
  }

  const walkableCorridorPct = Math.min(100, Math.round(walkableCorridorSum));

  // Geometric Open Doorway Detection:
  // A central sector (1, 2, or 3) has strong floor penetration (>= 42%) and low wall (<= 38%)
  // while BOTH left and right flanking sectors have wall OR open door-leaf structure (>= 30%)!
  let openDoorwayDetected = false;
  let openDoorwaySectorIdx: number | null = null;
  for (const s of [2, 1, 3]) {
    const leftFlank = Math.max(sectorFlankPct[s - 1], s >= 2 ? sectorFlankPct[0] : 0);
    const rightFlank = Math.max(sectorFlankPct[s + 1], s <= 2 ? sectorFlankPct[4] : 0);
    const hasAtLeastOneWall =
      Math.max(sectorWallPct[s - 1], s >= 2 ? sectorWallPct[0] : 0) >= 24 ||
      Math.max(sectorWallPct[s + 1], s <= 2 ? sectorWallPct[4] : 0) >= 24;
    const centerFloor = sectorFloorReachPct[s];
    const sideFloorAvg = (sectorFloorReachPct[s - 1] + sectorFloorReachPct[s + 1]) / 2;
    if (
      centerFloor >= 42 &&
      sectorWallPct[s] <= 38 &&
      hasAtLeastOneWall &&
      leftFlank >= 30 &&
      rightFlank >= 30 &&
      centerFloor >= sideFloorAvg + 10
    ) {
      openDoorwayDetected = true;
      openDoorwaySectorIdx = s;
      break;
    }
  }

  // Emit "Pared" when a wall blocks the forward corridor (even if some floor is still visible at bottom of 9:16 frame)
  const wallBlocksCenter =
    (wallCorridorPct >= 44 && wallCorridorPct >= walkableCorridorPct) ||
    (wallCorridorPct >= 36 && sectorFloorReachPct[2] <= 38);
  if (!openDoorwayDetected && wallBlocksCenter && wallBbox) {
    corridorBlockedByArch = true;
    seenLabels.add('Pared');
    const veryCloseWall = wallCorridorPct >= 62 || (wallCorridorPct >= 48 && walkableCorridorPct < 24);
    const closeWall = wallCorridorPct >= 44 || sectorFloorReachPct[2] <= 34;
    detections.push({
      id: `arch-wall-${now}`,
      category: 'obstacle',
      labelEs: 'Pared',
      source: 'real_video',
      confidence: 0.88,
      bbox: wallBbox,
      confirmationStatus: 'confirmed',
      priority: 96,
      firstSeenAt: now,
      lastSeenAt: now,
      isNew: true,
      isInanimateObstacle: true,
      proximityZone: veryCloseWall || closeWall ? 'front_close' : 'front_mid',
      estimatedMeters: veryCloseWall ? 0.7 : closeWall ? 1.2 : 1.8,
      clockPosition: 'a las 12',
    });
  }

  const pathVisuallyClear =
    openDoorwayDetected ||
    (!corridorBlockedByArch && walkableCorridorPct >= 22 && wallCorridorPct < 48);

  const hasStairsMask = detections.some((d) => {
    const l = d.labelEs.toLowerCase();
    return l.includes('escalera') || l.includes('grada');
  });

  return {
    detections,
    walkableCorridorPct,
    wallCorridorPct,
    sectorFloorReachPct,
    sectorWallPct,
    openDoorwayDetected,
    openDoorwaySectorIdx,
    hasStairsMask,
    pathVisuallyClear,
    detectedLabelsEs: Array.from(seenLabels),
    inferenceMs,
  };
}

/**
 * Local 100%-free Architectural Semantic Segmenter powered by
 * SegFormer-B0 (37.4% mIoU) or SegFormer-B1 (42.2% mIoU, +4.8 pts on doors/curtains/floor)
 * running off-main-thread in the Vision Web Worker with exact portrait/landscape aspect preservation.
 */
export class ArchitecturalSegmenterService {
  private segmenter: SegmentPipelineFn | null = null;
  private usingWorker = false;
  private captureCanvas: HTMLCanvasElement | null = null;
  private activeVariant: ArchModelVariant = 'segformer_b0';
  private status: ArchitecturalStatus = {
    ready: false,
    loading: false,
    variant: 'segformer_b0',
    modelName: ARCH_MODEL_NAMES.segformer_b0,
    backend: null,
    error: null,
    inferenceMs: null,
  };

  getStatus(): ArchitecturalStatus {
    return { ...this.status };
  }

  getVariant(): ArchModelVariant {
    return this.activeVariant;
  }

  async setVariant(variant: ArchModelVariant): Promise<ArchitecturalStatus> {
    if (variant === this.activeVariant && this.status.ready && (this.usingWorker || this.segmenter)) {
      return this.getStatus();
    }
    this.activeVariant = variant;
    this.segmenter = null;
    this.usingWorker = false;
    this.status = {
      ready: false,
      loading: false,
      variant,
      modelName: ARCH_MODEL_NAMES[variant],
      backend: null,
      error: null,
      inferenceMs: null,
    };
    return this.initialize(variant);
  }

  private async detectBackend(): Promise<'webgpu' | 'wasm'> {
    try {
      const nav = navigator as unknown as {
        gpu?: { requestAdapter?: () => Promise<unknown | null> };
      };
      if (nav.gpu && typeof nav.gpu.requestAdapter === 'function') {
        const adapter = await nav.gpu.requestAdapter();
        if (adapter) return 'webgpu';
      }
    } catch {
      // Fallback to WASM
    }
    return 'wasm';
  }

  async initialize(variant: ArchModelVariant = this.activeVariant): Promise<ArchitecturalStatus> {
    if ((this.usingWorker || this.segmenter) && this.activeVariant === variant && this.status.ready) {
      return this.getStatus();
    }
    if (this.status.loading) return this.getStatus();

    this.activeVariant = variant;
    this.status = {
      ...this.status,
      loading: true,
      variant,
      modelName: ARCH_MODEL_NAMES[variant],
      error: null,
    };

    const variantChain: ArchModelVariant[] =
      variant === 'segformer_b1' ? ['segformer_b1', 'segformer_b0'] : ['segformer_b0'];

    // 1. Primary: Dedicated Web Worker (zero UI/TTS blocking)
    if (visionWorkerClient.isAvailable()) {
      for (const candidate of variantChain) {
        try {
          const res = await visionWorkerClient.initSegmenter(ARCH_MODEL_IDS[candidate]);
          this.usingWorker = true;
          this.activeVariant = candidate;
          this.status = {
            ready: true,
            loading: false,
            variant: candidate,
            modelName: `${ARCH_MODEL_NAMES[candidate]} · ${res.backend.toUpperCase()} Worker`,
            backend: res.backend,
            error: null,
            inferenceMs: null,
          };
          return this.getStatus();
        } catch {
          this.usingWorker = false;
        }
      }
    }

    // 2. Fallback: Main-thread pipeline
    const preferredBackend = await this.detectBackend();
    for (const candidate of variantChain) {
      const backends: Array<'webgpu' | 'wasm'> =
        preferredBackend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];
      for (const backend of backends) {
        try {
          const transformers = await import('@huggingface/transformers');
          const createPipeline = transformers.pipeline as unknown as (
            task: string,
            model: string,
            opts?: Record<string, unknown>
          ) => Promise<SegmentPipelineFn>;

          this.segmenter = await createPipeline('image-segmentation', ARCH_MODEL_IDS[candidate], {
            device: backend,
            dtype: 'q8',
          });

          this.usingWorker = false;
          this.activeVariant = candidate;
          this.status = {
            ready: true,
            loading: false,
            variant: candidate,
            modelName: `${ARCH_MODEL_NAMES[candidate]} · ${backend.toUpperCase()}`,
            backend,
            error: null,
            inferenceMs: null,
          };
          return this.getStatus();
        } catch (err) {
          this.status.error =
            err instanceof Error ? err.message : 'Error cargando SegFormer ADE20K.';
        }
      }
    }

    this.status = {
      ready: false,
      loading: false,
      variant: this.activeVariant,
      modelName: ARCH_MODEL_NAMES[this.activeVariant],
      backend: null,
      error: this.status.error ?? 'No se pudo cargar SegFormer ADE20K.',
      inferenceMs: null,
    };
    return this.getStatus();
  }

  async analyzeSource(
    source: HTMLVideoElement | HTMLImageElement
  ): Promise<ArchitecturalAnalysis | null> {
    if (source instanceof HTMLVideoElement && source.readyState < 2) return null;

    if (!this.status.ready) {
      const st = await this.initialize(this.activeVariant);
      if (!st.ready) return null;
    }

    // Preserve exact portrait (9:16) or landscape (16:9) aspect ratio (fixes vertical squashing on Android!)
    const srcW =
      source instanceof HTMLVideoElement
        ? source.videoWidth || 640
        : source.naturalWidth || source.width || 640;
    const srcH =
      source instanceof HTMLVideoElement
        ? source.videoHeight || 480
        : source.naturalHeight || source.height || 480;
    if (!srcW || !srcH) return null;

    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const w = Math.max(96, Math.round(srcW * scale));
    const h = Math.max(96, Math.round(srcH * scale));

    if (!this.captureCanvas) {
      this.captureCanvas = document.createElement('canvas');
    }
    this.captureCanvas.width = w;
    this.captureCanvas.height = h;
    const ctx = this.captureCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0, w, h);

    let segments: RawSegmentItem[] = [];
    let elapsed = 0;

    if (this.usingWorker && visionWorkerClient.isAvailable()) {
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const out = await visionWorkerClient.runSegment(ARCH_MODEL_IDS[this.activeVariant], rgba, w, h);
      segments = out.segments;
      elapsed = out.elapsedMs;
    } else if (this.segmenter) {
      const start = performance.now();
      const { RawImage } = await import('@huggingface/transformers');
      const rawImg = RawImage.fromCanvas(this.captureCanvas);
      segments = await this.segmenter(rawImg);
      elapsed = Math.round(performance.now() - start);
    } else {
      return null;
    }

    this.status.inferenceMs = elapsed;
    return parseArchitecturalSegments(segments, elapsed, Date.now());
  }
}

export const architecturalSegmenterService = new ArchitecturalSegmenterService();
