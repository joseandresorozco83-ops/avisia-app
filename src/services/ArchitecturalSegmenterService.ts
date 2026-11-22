import type { Detection, ObjectCategory } from '../types/avicia';
import { computeClockPosition, estimatePinholeMeters } from './DetectorService';

export interface ArchitecturalStatus {
  ready: boolean;
  loading: boolean;
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

const ARCH_CLASS_MAP: Record<string, ArchClassConfig> = {
  door: {
    labelEs: 'Puerta',
    category: 'obstacle',
    priority: 95,
    isInanimateObstacle: true,
    minAreaPct: 3.5,
    typicalHeightMeters: 2.05,
  },
  'screen door': {
    labelEs: 'Puerta de malla',
    category: 'obstacle',
    priority: 94,
    isInanimateObstacle: true,
    minAreaPct: 3.5,
    typicalHeightMeters: 2.05,
  },
  curtain: {
    labelEs: 'Cortina',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 4.5,
    typicalHeightMeters: 2.1,
  },
  stairs: {
    labelEs: 'Escaleras',
    category: 'obstacle',
    priority: 98,
    isInanimateObstacle: true,
    minAreaPct: 3.0,
    typicalHeightMeters: 1.2,
  },
  stairway: {
    labelEs: 'Escaleras',
    category: 'obstacle',
    priority: 98,
    isInanimateObstacle: true,
    minAreaPct: 3.0,
    typicalHeightMeters: 1.2,
  },
  step: {
    labelEs: 'Grada',
    category: 'obstacle',
    priority: 98,
    isInanimateObstacle: true,
    minAreaPct: 2.5,
    typicalHeightMeters: 0.45,
  },
  escalator: {
    labelEs: 'Escalera eléctrica',
    category: 'obstacle',
    priority: 96,
    isInanimateObstacle: true,
    minAreaPct: 3.5,
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
    minAreaPct: 3.2,
    typicalHeightMeters: 2.4,
  },
  pillar: {
    labelEs: 'Columna',
    category: 'pole',
    priority: 93,
    isInanimateObstacle: true,
    minAreaPct: 3.2,
    typicalHeightMeters: 2.4,
  },
  pole: {
    labelEs: 'Poste',
    category: 'pole',
    priority: 94,
    isInanimateObstacle: true,
    minAreaPct: 2.2,
    typicalHeightMeters: 2.2,
  },
  streetlight: {
    labelEs: 'Poste de luz',
    category: 'pole',
    priority: 92,
    isInanimateObstacle: true,
    minAreaPct: 2.2,
    typicalHeightMeters: 2.5,
  },
  railing: {
    labelEs: 'Baranda',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
    typicalHeightMeters: 1.0,
  },
  banister: {
    labelEs: 'Baranda',
    category: 'obstacle',
    priority: 90,
    isInanimateObstacle: true,
    minAreaPct: 4.0,
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
    priority: 88,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 1.35,
  },
  wardrobe: {
    labelEs: 'Clóset o armario',
    category: 'obstacle',
    priority: 88,
    isInanimateObstacle: true,
    minAreaPct: 6.0,
    typicalHeightMeters: 1.9,
  },
  'chest of drawers': {
    labelEs: 'Mueble',
    category: 'obstacle',
    priority: 87,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 1.0,
  },
  bookcase: {
    labelEs: 'Estante',
    category: 'obstacle',
    priority: 87,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 1.7,
  },
  shelf: {
    labelEs: 'Estante',
    category: 'obstacle',
    priority: 86,
    isInanimateObstacle: true,
    minAreaPct: 5.0,
    typicalHeightMeters: 1.3,
  },
  counter: {
    labelEs: 'Mostrador',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 0.95,
  },
  desk: {
    labelEs: 'Escritorio',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 0.78,
  },
  mirror: {
    labelEs: 'Espejo',
    category: 'obstacle',
    priority: 86,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 1.4,
  },
  'glass': {
    labelEs: 'Vidrio',
    category: 'obstacle',
    priority: 89,
    isInanimateObstacle: true,
    minAreaPct: 5.5,
    typicalHeightMeters: 1.8,
  },
};

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
 * Pure helper to convert ADE20K semantic segmentation masks (from SegFormer-B0)
 * into architectural detections (doors, curtains, stairs, walls, columns, cabinets)
 * and compute whether the lower-center walking corridor is visually clear.
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

    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        totalSampled++;
        const inCorr = x >= corrX1 && x <= corrX2 && y >= corrY1 && y <= corrY2;
        const inFloorCorr = x >= corrX1 && x <= corrX2 && y >= floorY1 && y <= corrY2;
        if (inCorr) corrTotal++;
        if (inFloorCorr) floorTotal++;

        const val = mask.data[y * w + x];
        if (val > 127) {
          activePixels++;
          if (inCorr) corrActive++;
          if (inFloorCorr) floorActive++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (activePixels === 0 || totalSampled === 0) continue;

    const areaPct = (activePixels / totalSampled) * 100;
    const corrPct = corrTotal > 0 ? (corrActive / corrTotal) * 100 : 0;
    const floorPct = floorTotal > 0 ? (floorActive / floorTotal) * 100 : 0;

    if (WALKABLE_LABELS.has(labelRaw)) {
      walkableCorridorSum += floorPct;
      continue;
    }

    const bx = Math.max(0, (minX / w) * 100);
    const by = Math.max(0, (minY / h) * 100);
    const bw = Math.min(100 - bx, Math.max(2, ((maxX - minX + stride) / w) * 100));
    const bh = Math.min(100 - by, Math.max(2, ((maxY - minY + stride) / h) * 100));

    if (labelRaw === 'wall') {
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
    const overlapsCenter = bx + bw >= 26 && bx <= 74;
    const isCentered = (centerX >= 22 && centerX <= 78) || overlapsCenter;

    let proximityZone: Detection['proximityZone'] = 'side';
    if (isCentered) {
      if (corrPct >= 26 || estimatedMeters <= 1.8 || bh >= 62) {
        proximityZone = 'front_close';
      } else {
        proximityZone = 'front_mid';
      }
    }

    if (cfg.isInanimateObstacle && corrPct >= 20) {
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
      isInanimateObstacle: cfg.isInanimateObstacle,
      proximityZone,
      estimatedMeters,
      clockPosition,
    });
  }

  const walkableCorridorPct = Math.min(100, Math.round(walkableCorridorSum));

  // Emit "Pared" only when a wall truly blocks the immediate forward corridor (and floor is almost absent)
  if (wallCorridorPct >= 52 && walkableCorridorPct < 14 && wallBbox) {
    corridorBlockedByArch = true;
    seenLabels.add('Pared');
    detections.push({
      id: `arch-wall-${now}`,
      category: 'obstacle',
      labelEs: 'Pared',
      source: 'real_video',
      confidence: 0.86,
      bbox: wallBbox,
      confirmationStatus: 'confirmed',
      priority: 96,
      firstSeenAt: now,
      lastSeenAt: now,
      isNew: true,
      isInanimateObstacle: true,
      proximityZone: wallCorridorPct >= 68 ? 'front_close' : 'front_mid',
      estimatedMeters: wallCorridorPct >= 70 ? 0.9 : 1.7,
      clockPosition: 'a las 12',
    });
  }

  const pathVisuallyClear =
    !corridorBlockedByArch && walkableCorridorPct >= 22 && wallCorridorPct < 48;

  return {
    detections,
    walkableCorridorPct,
    wallCorridorPct,
    pathVisuallyClear,
    detectedLabelsEs: Array.from(seenLabels),
    inferenceMs,
  };
}

/**
 * Local 100%-free Architectural Semantic Segmenter powered by
 * Xenova/segformer-b0-finetuned-ade-512-512 (~4 MB quantized ONNX).
 * Recognizes doors (puertas), curtains (cortinas), stairs (escaleras),
 * windows (ventanas), walls (paredes), columns, cabinets, and walkable floor/sidewalk!
 */
export class ArchitecturalSegmenterService {
  private segmenter: SegmentPipelineFn | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private status: ArchitecturalStatus = {
    ready: false,
    loading: false,
    backend: null,
    error: null,
    inferenceMs: null,
  };

  getStatus(): ArchitecturalStatus {
    return { ...this.status };
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

  async initialize(): Promise<ArchitecturalStatus> {
    if (this.segmenter) return this.getStatus();
    if (this.status.loading) return this.getStatus();

    this.status = { ...this.status, loading: true, error: null };

    const preferredBackend = await this.detectBackend();
    const attempts: Array<'webgpu' | 'wasm'> =
      preferredBackend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];

    for (const backend of attempts) {
      try {
        const transformers = await import('@huggingface/transformers');
        const createPipeline = transformers.pipeline as unknown as (
          task: string,
          model: string,
          opts?: Record<string, unknown>
        ) => Promise<SegmentPipelineFn>;

        this.segmenter = await createPipeline(
          'image-segmentation',
          'Xenova/segformer-b0-finetuned-ade-512-512',
          {
            device: backend,
            dtype: 'q8',
          }
        );

        this.status = {
          ready: true,
          loading: false,
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

    this.status = {
      ready: false,
      loading: false,
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

    if (!this.segmenter) {
      const st = await this.initialize();
      if (!st.ready || !this.segmenter) return null;
    }

    if (!this.captureCanvas) {
      this.captureCanvas = document.createElement('canvas');
      this.captureCanvas.width = 256;
      this.captureCanvas.height = 192;
    }

    const w = this.captureCanvas.width;
    const h = this.captureCanvas.height;
    const ctx = this.captureCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0, w, h);

    const start = performance.now();
    const { RawImage } = await import('@huggingface/transformers');
    const rawImg = RawImage.fromCanvas(this.captureCanvas);
    const segments = await this.segmenter(rawImg);
    const elapsed = Math.round(performance.now() - start);
    this.status.inferenceMs = elapsed;

    return parseArchitecturalSegments(segments, elapsed, Date.now());
  }
}

export const architecturalSegmenterService = new ArchitecturalSegmenterService();
