import { FilesetResolver, ObjectDetector, type Detection as MpDetection } from '@mediapipe/tasks-vision';
import type { Detection, DetectorEngineId, DetectorStatus, ObjectCategory } from '../types/avicia';
import { visionWorkerClient, type WorkerDetectionItem } from './VisionWorkerClient';

export interface ClassMeta {
  category: ObjectCategory;
  labelEs: string;
  priority: number;
  isInanimateObstacle?: boolean;
  /** Typical real-world vertical height in meters for pinhole distance estimation */
  typicalHeightMeters: number;
}

/**
 * Complete 80-class COCO Spanish mapping with realistic physical heights (m)
 * and obstacle priority weights for blind mobility assistance.
 */
export const CATEGORY_MAP: Record<string, ClassMeta> = {
  // People & transport (high mobility relevance)
  person: { category: 'person', labelEs: 'Persona', priority: 93, typicalHeightMeters: 1.68 },
  bicycle: { category: 'obstacle', labelEs: 'Bicicleta', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 1.05 },
  car: { category: 'car', labelEs: 'Automóvil', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 1.50 },
  motorcycle: { category: 'motorcycle', labelEs: 'Motocicleta', priority: 91, isInanimateObstacle: true, typicalHeightMeters: 1.15 },
  airplane: { category: 'unknown', labelEs: 'Avión', priority: 40, typicalHeightMeters: 10.0 },
  bus: { category: 'bus', labelEs: 'Autobús', priority: 96, isInanimateObstacle: true, typicalHeightMeters: 3.10 },
  train: { category: 'bus', labelEs: 'Tren', priority: 94, isInanimateObstacle: true, typicalHeightMeters: 3.60 },
  truck: { category: 'car', labelEs: 'Camión', priority: 92, isInanimateObstacle: true, typicalHeightMeters: 2.80 },
  boat: { category: 'unknown', labelEs: 'Bote', priority: 60, typicalHeightMeters: 1.80 },

  // Street furniture & urban hazards
  'traffic light': { category: 'traffic_light', labelEs: 'Semáforo', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.90 },
  'fire hydrant': { category: 'fire_hydrant', labelEs: 'Hidrante', priority: 92, isInanimateObstacle: true, typicalHeightMeters: 0.78 },
  'stop sign': { category: 'stop_sign', labelEs: 'Señal de alto', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.75 },
  'parking meter': { category: 'pole', labelEs: 'Parquímetro', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 1.35 },
  bench: { category: 'bench', labelEs: 'Banca', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 0.82 },

  // Animals
  bird: { category: 'unknown', labelEs: 'Ave', priority: 65, typicalHeightMeters: 0.25 },
  cat: { category: 'unknown', labelEs: 'Gato', priority: 82, typicalHeightMeters: 0.30 },
  dog: { category: 'unknown', labelEs: 'Perro', priority: 88, typicalHeightMeters: 0.55 },
  horse: { category: 'unknown', labelEs: 'Caballo', priority: 90, typicalHeightMeters: 1.65 },
  sheep: { category: 'unknown', labelEs: 'Oveja', priority: 75, typicalHeightMeters: 0.80 },
  cow: { category: 'unknown', labelEs: 'Vaca', priority: 86, typicalHeightMeters: 1.45 },
  elephant: { category: 'unknown', labelEs: 'Elefante', priority: 88, typicalHeightMeters: 2.80 },
  bear: { category: 'unknown', labelEs: 'Oso', priority: 88, typicalHeightMeters: 1.40 },
  zebra: { category: 'unknown', labelEs: 'Cebra', priority: 75, typicalHeightMeters: 1.40 },
  giraffe: { category: 'unknown', labelEs: 'Jirafa', priority: 75, typicalHeightMeters: 4.50 },

  // Personal items & trip hazards
  backpack: { category: 'obstacle', labelEs: 'Mochila', priority: 85, isInanimateObstacle: true, typicalHeightMeters: 0.48 },
  umbrella: { category: 'obstacle', labelEs: 'Paraguas', priority: 78, isInanimateObstacle: true, typicalHeightMeters: 0.85 },
  handbag: { category: 'obstacle', labelEs: 'Bolso', priority: 78, isInanimateObstacle: true, typicalHeightMeters: 0.35 },
  tie: { category: 'unknown', labelEs: 'Corbata', priority: 45, typicalHeightMeters: 0.45 },
  suitcase: { category: 'obstacle', labelEs: 'Maleta', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 0.65 },
  frisbee: { category: 'unknown', labelEs: 'Disco', priority: 50, typicalHeightMeters: 0.25 },
  skis: { category: 'obstacle', labelEs: 'Esquís', priority: 72, isInanimateObstacle: true, typicalHeightMeters: 1.60 },
  snowboard: { category: 'obstacle', labelEs: 'Tabla', priority: 72, isInanimateObstacle: true, typicalHeightMeters: 1.50 },
  'sports ball': { category: 'obstacle', labelEs: 'Pelota', priority: 76, isInanimateObstacle: true, typicalHeightMeters: 0.24 },
  kite: { category: 'unknown', labelEs: 'Cometa', priority: 45, typicalHeightMeters: 0.60 },
  'baseball bat': { category: 'unknown', labelEs: 'Bate', priority: 60, typicalHeightMeters: 0.85 },
  'baseball glove': { category: 'unknown', labelEs: 'Guante', priority: 50, typicalHeightMeters: 0.25 },
  skateboard: { category: 'obstacle', labelEs: 'Patineta', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.20 },
  surfboard: { category: 'obstacle', labelEs: 'Tabla de surf', priority: 75, isInanimateObstacle: true, typicalHeightMeters: 1.80 },
  'tennis racket': { category: 'unknown', labelEs: 'Raqueta', priority: 55, typicalHeightMeters: 0.68 },

  // Kitchen / tabletop objects
  bottle: { category: 'unknown', labelEs: 'Botella', priority: 68, typicalHeightMeters: 0.25 },
  'wine glass': { category: 'unknown', labelEs: 'Copa', priority: 64, typicalHeightMeters: 0.20 },
  cup: { category: 'unknown', labelEs: 'Taza', priority: 66, typicalHeightMeters: 0.12 },
  fork: { category: 'unknown', labelEs: 'Tenedor', priority: 50, typicalHeightMeters: 0.18 },
  knife: { category: 'unknown', labelEs: 'Cuchillo', priority: 72, typicalHeightMeters: 0.22 },
  spoon: { category: 'unknown', labelEs: 'Cuchara', priority: 50, typicalHeightMeters: 0.18 },
  bowl: { category: 'unknown', labelEs: 'Tazón', priority: 62, typicalHeightMeters: 0.14 },
  banana: { category: 'unknown', labelEs: 'Banano', priority: 52, typicalHeightMeters: 0.18 },
  apple: { category: 'unknown', labelEs: 'Manzana', priority: 52, typicalHeightMeters: 0.09 },
  sandwich: { category: 'unknown', labelEs: 'Sándwich', priority: 52, typicalHeightMeters: 0.10 },
  orange: { category: 'unknown', labelEs: 'Naranja', priority: 52, typicalHeightMeters: 0.09 },
  broccoli: { category: 'unknown', labelEs: 'Brócoli', priority: 48, typicalHeightMeters: 0.15 },
  carrot: { category: 'unknown', labelEs: 'Zanahoria', priority: 48, typicalHeightMeters: 0.18 },
  'hot dog': { category: 'unknown', labelEs: 'Perro caliente', priority: 50, typicalHeightMeters: 0.15 },
  pizza: { category: 'unknown', labelEs: 'Pizza', priority: 52, typicalHeightMeters: 0.25 },
  donut: { category: 'unknown', labelEs: 'Dona', priority: 50, typicalHeightMeters: 0.10 },
  cake: { category: 'unknown', labelEs: 'Pastel', priority: 55, typicalHeightMeters: 0.18 },

  // Indoor furniture & static obstacles (crucial for blind navigation)
  chair: { category: 'chair', labelEs: 'Silla', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 0.85 },
  couch: { category: 'obstacle', labelEs: 'Sillón', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 0.85 },
  'potted plant': { category: 'potted_plant', labelEs: 'Maceta', priority: 88, isInanimateObstacle: true, typicalHeightMeters: 0.90 },
  bed: { category: 'obstacle', labelEs: 'Cama', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.70 },
  'dining table': { category: 'obstacle', labelEs: 'Mesa', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 0.78 },
  toilet: { category: 'obstacle', labelEs: 'Inodoro', priority: 84, isInanimateObstacle: true, typicalHeightMeters: 0.78 },
  tv: { category: 'obstacle', labelEs: 'Pantalla', priority: 78, isInanimateObstacle: true, typicalHeightMeters: 0.65 },
  laptop: { category: 'unknown', labelEs: 'Computadora', priority: 70, typicalHeightMeters: 0.26 },
  mouse: { category: 'unknown', labelEs: 'Ratón', priority: 55, typicalHeightMeters: 0.06 },
  remote: { category: 'unknown', labelEs: 'Control remoto', priority: 58, typicalHeightMeters: 0.18 },
  keyboard: { category: 'unknown', labelEs: 'Teclado', priority: 64, typicalHeightMeters: 0.15 },
  'cell phone': { category: 'unknown', labelEs: 'Teléfono', priority: 70, typicalHeightMeters: 0.15 },
  microwave: { category: 'obstacle', labelEs: 'Microondas', priority: 76, isInanimateObstacle: true, typicalHeightMeters: 0.34 },
  oven: { category: 'obstacle', labelEs: 'Estufa', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.90 },
  toaster: { category: 'unknown', labelEs: 'Tostadora', priority: 60, typicalHeightMeters: 0.22 },
  sink: { category: 'obstacle', labelEs: 'Lavabo', priority: 84, isInanimateObstacle: true, typicalHeightMeters: 0.85 },
  refrigerator: { category: 'obstacle', labelEs: 'Refrigerador', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 1.75 },
  book: { category: 'unknown', labelEs: 'Libro', priority: 60, typicalHeightMeters: 0.24 },
  clock: { category: 'unknown', labelEs: 'Reloj', priority: 60, typicalHeightMeters: 0.32 },
  vase: { category: 'obstacle', labelEs: 'Florero', priority: 78, isInanimateObstacle: true, typicalHeightMeters: 0.32 },
  scissors: { category: 'unknown', labelEs: 'Tijeras', priority: 66, typicalHeightMeters: 0.18 },
  'teddy bear': { category: 'unknown', labelEs: 'Peluche', priority: 55, typicalHeightMeters: 0.35 },
  'hair drier': { category: 'unknown', labelEs: 'Secadora', priority: 55, typicalHeightMeters: 0.24 },
  toothbrush: { category: 'unknown', labelEs: 'Cepillo', priority: 48, typicalHeightMeters: 0.18 },
};

const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

const MODEL_URLS: Record<'efficientdet_lite2' | 'efficientdet_lite0', string> = {
  efficientdet_lite2:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/latest/efficientdet_lite2.tflite',
  efficientdet_lite0:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
};

const MODEL_DISPLAY_NAMES: Record<DetectorEngineId, string> = {
  dfine_n: 'D-FINE-Nano ONNX (42.8% mAP · Apache 2.0)',
  dfine_s: 'D-FINE-Small ONNX (48.5% mAP · Apache 2.0)',
  yolov10n: 'YOLOv10n ONNX (38.5% mAP)',
  efficientdet_lite2: 'EfficientDet-Lite2 448px (34% mAP · MediaPipe)',
  efficientdet_lite0: 'EfficientDet-Lite0 320px (Rápido · MediaPipe)',
};

const ONNX_DETECTOR_MODELS: Partial<
  Record<DetectorEngineId, { repoId: string; shortLabel: string; mAp: string }>
> = {
  dfine_n: {
    repoId: 'onnx-community/dfine_n_coco-ONNX',
    shortLabel: 'D-FINE-N',
    mAp: '42.8% mAP',
  },
  dfine_s: {
    repoId: 'onnx-community/dfine_s_coco-ONNX',
    shortLabel: 'D-FINE-S',
    mAp: '48.5% mAP',
  },
  yolov10n: {
    repoId: 'onnx-community/yolov10n',
    shortLabel: 'YOLOv10n',
    mAp: '38.5% mAP',
  },
};

type OnnxPipelineFn = (
  input: unknown,
  options?: { threshold?: number; percentage?: boolean }
) => Promise<WorkerDetectionItem[]>;

export function computeClockPosition(centerX: number): string {
  if (centerX < 20) return 'a las 9';
  if (centerX < 38) return 'a las 10';
  if (centerX <= 62) return 'a las 12';
  if (centerX <= 80) return 'a las 2';
  return 'a las 3';
}

export function estimatePinholeMeters(
  bboxHeightPct: number,
  typicalHeightMeters: number
): number {
  // Standard smartphone vertical FOV ~55 deg => normalized focal length ~0.96
  const heightFrac = Math.max(0.06, bboxHeightPct / 100);
  const rawMeters = (typicalHeightMeters * 0.96) / heightFrac;
  return Number(Math.min(14.0, Math.max(0.4, rawMeters)).toFixed(1));
}

export class DetectorService {
  private detector: ObjectDetector | null = null;
  private onnxPipeline: OnnxPipelineFn | null = null;
  private onnxEngineLoaded: DetectorEngineId | null = null;
  private usingWorker = false;
  private onnxCanvas: HTMLCanvasElement | null = null;
  private activeEngine: DetectorEngineId = 'dfine_n';
  private currentRunningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';
  private lastScoreThreshold = 0.36;
  private status: DetectorStatus = {
    ready: false,
    loading: false,
    error: null,
    modelName: MODEL_DISPLAY_NAMES.dfine_n,
    engineId: 'dfine_n',
    inferenceTimeMs: null,
  };

  getStatus(): DetectorStatus {
    return { ...this.status };
  }

  getEngine(): DetectorEngineId {
    return this.activeEngine;
  }

  async setEngine(engine: DetectorEngineId, scoreThreshold = this.lastScoreThreshold): Promise<DetectorStatus> {
    if (engine === this.activeEngine && this.status.ready) {
      return this.getStatus();
    }
    this.activeEngine = engine;
    if (this.detector) {
      try {
        this.detector.close();
      } catch {
        // Ignore close errors
      }
      this.detector = null;
    }
    if (this.onnxEngineLoaded !== engine) {
      this.onnxPipeline = null;
      this.onnxEngineLoaded = null;
      this.usingWorker = false;
    }
    this.status = {
      ready: false,
      loading: false,
      error: null,
      modelName: MODEL_DISPLAY_NAMES[engine],
      engineId: engine,
      inferenceTimeMs: null,
    };
    return this.initialize(scoreThreshold);
  }

  private async detectOnnxBackend(): Promise<'webgpu' | 'wasm'> {
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

  private async initOnnxEngine(engine: DetectorEngineId): Promise<boolean> {
    const spec = ONNX_DETECTOR_MODELS[engine];
    if (!spec) return false;

    // 1. Primary: Dedicated off-main-thread Web Worker
    if (visionWorkerClient.isAvailable()) {
      try {
        const res = await visionWorkerClient.initDetector(spec.repoId);
        this.usingWorker = true;
        this.onnxEngineLoaded = engine;
        this.activeEngine = engine;
        this.status = {
          ready: true,
          loading: false,
          error: null,
          modelName: `${spec.shortLabel} (${res.backend.toUpperCase()} Worker · ${spec.mAp})`,
          engineId: engine,
          inferenceTimeMs: null,
        };
        return true;
      } catch {
        this.usingWorker = false;
      }
    }

    // 2. Fallback: Main-thread Transformers.js ONNX pipeline
    try {
      const backend = await this.detectOnnxBackend();
      const transformers = await import('@huggingface/transformers');
      const createPipeline = transformers.pipeline as unknown as (
        task: string,
        model: string,
        opts?: Record<string, unknown>
      ) => Promise<OnnxPipelineFn>;

      this.onnxPipeline = await createPipeline('object-detection', spec.repoId, {
        device: backend,
        dtype: backend === 'webgpu' ? 'fp16' : 'q8',
      });
      this.usingWorker = false;
      this.onnxEngineLoaded = engine;
      this.activeEngine = engine;
      this.status = {
        ready: true,
        loading: false,
        error: null,
        modelName: `${spec.shortLabel} (${backend.toUpperCase()} · ${spec.mAp})`,
        engineId: engine,
        inferenceTimeMs: null,
      };
      return true;
    } catch {
      this.onnxPipeline = null;
      this.onnxEngineLoaded = null;
      return false;
    }
  }

  private async initMediaPipeModel(
    engine: 'efficientdet_lite2' | 'efficientdet_lite0',
    scoreThreshold: number
  ): Promise<boolean> {
    const url = MODEL_URLS[engine];
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        this.detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: url,
            delegate,
          },
          scoreThreshold,
          maxResults: 12,
          runningMode: 'IMAGE',
        });
        this.currentRunningMode = 'IMAGE';
        this.lastScoreThreshold = scoreThreshold;
        this.activeEngine = engine;
        this.status = {
          ready: true,
          loading: false,
          error: null,
          modelName: `${MODEL_DISPLAY_NAMES[engine]} · ${delegate}`,
          engineId: engine,
          inferenceTimeMs: null,
        };
        return true;
      } catch {
        // Try next delegate or fallback model
      }
    }
    return false;
  }

  async initialize(scoreThreshold = 0.36): Promise<DetectorStatus> {
    this.lastScoreThreshold = scoreThreshold;

    const isOnnxEngine = Boolean(ONNX_DETECTOR_MODELS[this.activeEngine]);
    if (
      isOnnxEngine &&
      this.onnxEngineLoaded === this.activeEngine &&
      (this.usingWorker || this.onnxPipeline)
    ) {
      return this.getStatus();
    }
    if (!isOnnxEngine && this.detector) {
      await this.detector.setOptions({ scoreThreshold });
      return this.getStatus();
    }

    this.status = {
      ...this.status,
      loading: true,
      error: null,
      modelName: MODEL_DISPLAY_NAMES[this.activeEngine],
      engineId: this.activeEngine,
    };

    // Smart graceful fallback chain: dfine_s -> dfine_n -> efficientdet_lite2 -> efficientdet_lite0
    const fallbackChain: DetectorEngineId[] =
      this.activeEngine === 'dfine_s'
        ? ['dfine_s', 'dfine_n', 'efficientdet_lite2', 'efficientdet_lite0']
        : this.activeEngine === 'dfine_n'
          ? ['dfine_n', 'efficientdet_lite2', 'efficientdet_lite0']
          : this.activeEngine === 'yolov10n'
            ? ['yolov10n', 'dfine_n', 'efficientdet_lite2', 'efficientdet_lite0']
            : this.activeEngine === 'efficientdet_lite2'
              ? ['efficientdet_lite2', 'efficientdet_lite0']
              : ['efficientdet_lite0'];

    for (const candidate of fallbackChain) {
      if (ONNX_DETECTOR_MODELS[candidate]) {
        const ok = await this.initOnnxEngine(candidate);
        if (ok) return this.getStatus();
      } else {
        const ok = await this.initMediaPipeModel(
          candidate as 'efficientdet_lite2' | 'efficientdet_lite0',
          scoreThreshold
        );
        if (ok) return this.getStatus();
      }
    }

    this.status = {
      ready: false,
      loading: false,
      error:
        'Sin conectividad para descargar pesos del modelo visual (D-FINE / EfficientDet WASM).',
      modelName: MODEL_DISPLAY_NAMES[this.activeEngine],
      engineId: this.activeEngine,
      inferenceTimeMs: null,
    };
    return this.getStatus();
  }

  private async runOnnxOnSource(
    sourceEl: HTMLImageElement | HTMLVideoElement,
    scoreThreshold: number,
    sourceType: 'real_image' | 'real_video'
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    const spec = ONNX_DETECTOR_MODELS[this.activeEngine];
    if (!spec) {
      throw new Error('Modelo ONNX no seleccionado.');
    }

    if (!this.onnxCanvas) {
      this.onnxCanvas = document.createElement('canvas');
    }
    const srcW =
      sourceEl instanceof HTMLVideoElement
        ? sourceEl.videoWidth || 640
        : sourceEl.naturalWidth || sourceEl.width || 640;
    const srcH =
      sourceEl instanceof HTMLVideoElement
        ? sourceEl.videoHeight || 480
        : sourceEl.naturalHeight || sourceEl.height || 480;

    // Aspect-ratio-preserving downscale (never squashes portrait 9:16 mobile frames!)
    const maxDim = this.activeEngine === 'dfine_s' ? 640 : 512;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    this.onnxCanvas.width = Math.max(64, Math.round(srcW * scale));
    this.onnxCanvas.height = Math.max(64, Math.round(srcH * scale));
    const ctx = this.onnxCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { detections: [], inferenceTimeMs: 0 };
    ctx.drawImage(sourceEl, 0, 0, this.onnxCanvas.width, this.onnxCanvas.height);

    let results: WorkerDetectionItem[] = [];
    let elapsed = 0;

    if (this.usingWorker && visionWorkerClient.isAvailable()) {
      const rgba = ctx.getImageData(0, 0, this.onnxCanvas.width, this.onnxCanvas.height).data;
      const out = await visionWorkerClient.runDetect(
        spec.repoId,
        rgba,
        this.onnxCanvas.width,
        this.onnxCanvas.height,
        scoreThreshold
      );
      results = out.results ?? [];
      elapsed = out.elapsedMs;
    } else if (this.onnxPipeline) {
      const start = performance.now();
      const { RawImage } = await import('@huggingface/transformers');
      const rawImg = RawImage.fromCanvas(this.onnxCanvas);
      results = await this.onnxPipeline(rawImg, {
        threshold: scoreThreshold,
        percentage: true,
      });
      elapsed = Math.round(performance.now() - start);
    }

    this.status.inferenceTimeMs = elapsed;

    const now = Date.now();
    const mapped: Detection[] = results.slice(0, 12).map((item, idx) => {
      // Handle both normalized [0..1] percentage boxes and pixel-space boxes defensively
      const needsNorm = item.box.xmax > 1.5 || item.box.ymax > 1.5;
      const wScale = needsNorm ? 100 / Math.max(1, this.onnxCanvas!.width) : 100;
      const hScale = needsNorm ? 100 / Math.max(1, this.onnxCanvas!.height) : 100;
      const x = Math.max(0, Math.min(100, item.box.xmin * wScale));
      const y = Math.max(0, Math.min(100, item.box.ymin * hScale));
      const width = Math.max(1, Math.min(100 - x, (item.box.xmax - item.box.xmin) * wScale));
      const height = Math.max(1, Math.min(100 - y, (item.box.ymax - item.box.ymin) * hScale));
      return this.buildDetection(item.label, item.score, { x, y, width, height }, idx, now, sourceType);
    });

    return { detections: mapped, inferenceTimeMs: elapsed };
  }

  async detectOnImage(
    imageElement: HTMLImageElement,
    scoreThreshold = 0.36
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    if (!this.status.ready) {
      const initStatus = await this.initialize(scoreThreshold);
      if (!initStatus.ready) {
        throw new Error(initStatus.error ?? 'Detector no disponible.');
      }
    }

    if (ONNX_DETECTOR_MODELS[this.activeEngine] && (this.usingWorker || this.onnxPipeline)) {
      return this.runOnnxOnSource(imageElement, scoreThreshold, 'real_image');
    }

    if (!this.detector) {
      throw new Error('Detector no disponible.');
    }

    if (this.currentRunningMode !== 'IMAGE' || this.lastScoreThreshold !== scoreThreshold) {
      await this.detector.setOptions({ runningMode: 'IMAGE', scoreThreshold });
      this.currentRunningMode = 'IMAGE';
      this.lastScoreThreshold = scoreThreshold;
    }

    const start = performance.now();
    const result = this.detector.detect(imageElement);
    const elapsed = Math.round(performance.now() - start);
    this.status.inferenceTimeMs = elapsed;

    const width = imageElement.naturalWidth || imageElement.width || 1;
    const height = imageElement.naturalHeight || imageElement.height || 1;

    const detections = this.mapDetections(result.detections, width, height, 'real_image');
    return { detections, inferenceTimeMs: elapsed };
  }

  async detectOnVideoFrame(
    videoElement: HTMLVideoElement,
    scoreThreshold = 0.36
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    if (!this.status.ready) {
      throw new Error('El modelo visual no está inicializado.');
    }

    if (ONNX_DETECTOR_MODELS[this.activeEngine] && (this.usingWorker || this.onnxPipeline)) {
      return this.runOnnxOnSource(videoElement, scoreThreshold, 'real_video');
    }

    if (!this.detector) {
      throw new Error('El modelo EfficientDet no está inicializado.');
    }

    if (this.currentRunningMode !== 'VIDEO' || this.lastScoreThreshold !== scoreThreshold) {
      await this.detector.setOptions({ runningMode: 'VIDEO', scoreThreshold });
      this.currentRunningMode = 'VIDEO';
      this.lastScoreThreshold = scoreThreshold;
    }

    const start = performance.now();
    const result = this.detector.detectForVideo(videoElement, performance.now());
    const elapsed = Math.round(performance.now() - start);
    this.status.inferenceTimeMs = elapsed;

    const width = videoElement.videoWidth || 1;
    const height = videoElement.videoHeight || 1;

    const detections = this.mapDetections(result.detections, width, height, 'real_video');
    return { detections, inferenceTimeMs: elapsed };
  }

  private buildDetection(
    rawCategoryName: string,
    score: number,
    bbox: { x: number; y: number; width: number; height: number },
    idx: number,
    now: number,
    source: 'real_image' | 'real_video'
  ): Detection {
    const rawName = (rawCategoryName || '').toLowerCase().trim();
    const known = CATEGORY_MAP[rawName];
    const labelEs = known ? known.labelEs : rawName;
    const category: ObjectCategory = known ? known.category : 'unknown';
    const priority = known ? known.priority : 55;
    const typicalHeight = known ? known.typicalHeightMeters : 0.85;

    const centerX = bbox.x + bbox.width / 2;
    const bottomY = bbox.y + bbox.height;
    const overlapsCenterCorridor = bbox.x + bbox.width >= 26 && bbox.x <= 74;
    const isCentered = (centerX >= 22 && centerX <= 78) || overlapsCenterCorridor;

    const estimatedMeters = estimatePinholeMeters(bbox.height, typicalHeight);
    const clockPosition = computeClockPosition(centerX);

    const proximityZone: Detection['proximityZone'] = isCentered
      ? estimatedMeters <= 1.8 || bbox.height >= 34 || (bottomY >= 78 && bbox.width >= 26)
        ? 'front_close'
        : 'front_mid'
      : 'side';

    return {
      id: `real-${idx}-${now}`,
      category,
      labelEs: labelEs.charAt(0).toUpperCase() + labelEs.slice(1),
      source,
      confidence: score,
      bbox,
      confirmationStatus: 'confirmed',
      priority,
      firstSeenAt: now,
      lastSeenAt: now,
      isNew: true,
      isInanimateObstacle: Boolean(known?.isInanimateObstacle),
      proximityZone,
      estimatedMeters,
      clockPosition,
    };
  }

  private mapDetections(
    mpDetections: MpDetection[],
    imgWidth: number,
    imgHeight: number,
    source: 'real_image' | 'real_video'
  ): Detection[] {
    const now = Date.now();
    const mapped: Detection[] = [];

    mpDetections.forEach((det, idx) => {
      const topCat = det.categories[0];
      if (!topCat || !det.boundingBox) return;

      const x = Math.max(0, (det.boundingBox.originX / imgWidth) * 100);
      const y = Math.max(0, (det.boundingBox.originY / imgHeight) * 100);
      const width = Math.min(100 - x, (det.boundingBox.width / imgWidth) * 100);
      const height = Math.min(100 - y, (det.boundingBox.height / imgHeight) * 100);

      mapped.push(
        this.buildDetection(
          topCat.categoryName || '',
          topCat.score,
          { x, y, width, height },
          idx,
          now,
          source
        )
      );
    });

    return mapped;
  }
}

export const detectorService = new DetectorService();
