import { FilesetResolver, ObjectDetector, type Detection as MpDetection } from '@mediapipe/tasks-vision';
import type { Detection, DetectorStatus, ObjectCategory } from '../types/avicia';

const CATEGORY_MAP: Record<
  string,
  { category: ObjectCategory; labelEs: string; priority: number; isInanimateObstacle?: boolean }
> = {
  person: { category: 'person', labelEs: 'Persona', priority: 92 },
  car: { category: 'car', labelEs: 'Automóvil', priority: 80 },
  motorcycle: { category: 'motorcycle', labelEs: 'Motocicleta', priority: 85 },
  bus: { category: 'bus', labelEs: 'Autobús', priority: 95 },
  bench: { category: 'bench', labelEs: 'Banca', priority: 88, isInanimateObstacle: true },
  'fire hydrant': { category: 'fire_hydrant', labelEs: 'Hidrante', priority: 90, isInanimateObstacle: true },
  'traffic light': { category: 'traffic_light', labelEs: 'Semáforo', priority: 84, isInanimateObstacle: true },
  'stop sign': { category: 'stop_sign', labelEs: 'Señal de alto', priority: 84, isInanimateObstacle: true },
  chair: { category: 'chair', labelEs: 'Silla', priority: 88, isInanimateObstacle: true },
  'potted plant': { category: 'potted_plant', labelEs: 'Maceta', priority: 86, isInanimateObstacle: true },
  bicycle: { category: 'obstacle', labelEs: 'Bicicleta detenida', priority: 86, isInanimateObstacle: true },
  suitcase: { category: 'obstacle', labelEs: 'Obstáculo en el paso', priority: 87, isInanimateObstacle: true },
  backpack: { category: 'obstacle', labelEs: 'Objeto en el suelo', priority: 85, isInanimateObstacle: true },
  'dining table': { category: 'obstacle', labelEs: 'Mesa', priority: 87, isInanimateObstacle: true },
  couch: { category: 'obstacle', labelEs: 'Sillón', priority: 86, isInanimateObstacle: true },
  bed: { category: 'obstacle', labelEs: 'Cama', priority: 84, isInanimateObstacle: true },
  tv: { category: 'obstacle', labelEs: 'Pantalla', priority: 75 },
  laptop: { category: 'unknown', labelEs: 'Computadora', priority: 70 },
  'cell phone': { category: 'unknown', labelEs: 'Teléfono', priority: 70 },
  bottle: { category: 'unknown', labelEs: 'Botella', priority: 68 },
  cup: { category: 'unknown', labelEs: 'Taza', priority: 68 },
  book: { category: 'unknown', labelEs: 'Libro', priority: 65 },
  dog: { category: 'unknown', labelEs: 'Perro', priority: 88 },
  cat: { category: 'unknown', labelEs: 'Gato', priority: 82 },
  truck: { category: 'car', labelEs: 'Camión', priority: 88, isInanimateObstacle: true },
  train: { category: 'bus', labelEs: 'Tren', priority: 90, isInanimateObstacle: true },
  refrigerator: { category: 'obstacle', labelEs: 'Refrigerador', priority: 86, isInanimateObstacle: true },
  oven: { category: 'obstacle', labelEs: 'Estufa', priority: 84, isInanimateObstacle: true },
  microwave: { category: 'obstacle', labelEs: 'Microondas', priority: 75, isInanimateObstacle: true },
  sink: { category: 'obstacle', labelEs: 'Lavabo', priority: 82, isInanimateObstacle: true },
  toilet: { category: 'obstacle', labelEs: 'Inodoro', priority: 84, isInanimateObstacle: true },
  handbag: { category: 'obstacle', labelEs: 'Bolso', priority: 76, isInanimateObstacle: true },
  umbrella: { category: 'obstacle', labelEs: 'Paraguas', priority: 74 },
  remote: { category: 'unknown', labelEs: 'Control remoto', priority: 60 },
  keyboard: { category: 'unknown', labelEs: 'Teclado', priority: 65 },
  mouse: { category: 'unknown', labelEs: 'Ratón', priority: 60 },
  clock: { category: 'unknown', labelEs: 'Reloj', priority: 62 },
  vase: { category: 'obstacle', labelEs: 'Florero', priority: 76, isInanimateObstacle: true },
  bowl: { category: 'unknown', labelEs: 'Tazón', priority: 64 },
  'wine glass': { category: 'unknown', labelEs: 'Copa', priority: 64 },
  scissors: { category: 'unknown', labelEs: 'Tijeras', priority: 62 },
  skateboard: { category: 'obstacle', labelEs: 'Patineta', priority: 85, isInanimateObstacle: true },
  'sports ball': { category: 'obstacle', labelEs: 'Pelota', priority: 74 },
  'teddy bear': { category: 'unknown', labelEs: 'Peluche', priority: 60 },
  bird: { category: 'unknown', labelEs: 'Ave', priority: 70 },
  horse: { category: 'unknown', labelEs: 'Caballo', priority: 88 },
};

export class DetectorService {
  private detector: ObjectDetector | null = null;
  private currentRunningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';
  private lastScoreThreshold = 0.45;
  private status: DetectorStatus = {
    ready: false,
    loading: false,
    error: null,
    modelName: 'EfficientDet-Lite0 (MediaPipe Tasks Vision)',
    inferenceTimeMs: null,
  };

  getStatus(): DetectorStatus {
    return { ...this.status };
  }

  async initialize(scoreThreshold = 0.45): Promise<DetectorStatus> {
    if (this.detector) {
      await this.detector.setOptions({ scoreThreshold });
      return this.getStatus();
    }

    this.status = {
      ...this.status,
      loading: true,
      error: null,
    };

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      this.detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
          delegate: 'GPU',
        },
        scoreThreshold,
        maxResults: 10,
        runningMode: 'IMAGE',
      });

      this.status = {
        ...this.status,
        ready: true,
        loading: false,
        error: null,
      };
    } catch (err) {
      // Fallback to CPU delegate if GPU delegate fails, or report pending integration
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );
        this.detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
            delegate: 'CPU',
          },
          scoreThreshold,
          maxResults: 10,
          runningMode: 'IMAGE',
        });
        this.status = {
          ...this.status,
          ready: true,
          loading: false,
          error: null,
        };
      } catch (innerErr) {
        const msg =
          innerErr instanceof Error
            ? innerErr.message
            : err instanceof Error
              ? err.message
              : 'No se pudo cargar el modelo EfficientDet-Lite0.';
        this.status = {
          ...this.status,
          ready: false,
          loading: false,
          error: `Integración pendiente o sin conectividad para descargar pesos WASM/TFLite (${msg}).`,
        };
      }
    }

    return this.getStatus();
  }

  async detectOnImage(
    imageElement: HTMLImageElement,
    scoreThreshold = 0.45
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    if (!this.detector) {
      const initStatus = await this.initialize(scoreThreshold);
      if (!initStatus.ready || !this.detector) {
        throw new Error(initStatus.error ?? 'Detector no disponible.');
      }
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
    scoreThreshold = 0.45
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    if (!this.detector) {
      throw new Error('El modelo EfficientDet-Lite0 no está inicializado.');
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

      const rawName = (topCat.categoryName || '').toLowerCase();
      const known = CATEGORY_MAP[rawName];
      const labelEs = known ? known.labelEs : rawName;
      const category: ObjectCategory = known ? known.category : 'unknown';
      const priority = known ? known.priority : 50;

      const x = Math.max(0, (det.boundingBox.originX / imgWidth) * 100);
      const y = Math.max(0, (det.boundingBox.originY / imgHeight) * 100);
      const width = Math.min(100, (det.boundingBox.width / imgWidth) * 100);
      const height = Math.min(100, (det.boundingBox.height / imgHeight) * 100);

      const centerX = x + width / 2;
      const bottomY = y + height;
      const overlapsCenterCorridor = x + width >= 28 && x <= 72;
      const isCentered = (centerX >= 22 && centerX <= 78) || overlapsCenterCorridor;
      const proximityZone: Detection['proximityZone'] = isCentered
        ? height >= 28 || bottomY >= 70 || width >= 42
          ? 'front_close'
          : 'front_mid'
        : 'side';

      mapped.push({
        id: `real-${idx}-${now}`,
        category,
        labelEs: labelEs.charAt(0).toUpperCase() + labelEs.slice(1),
        source,
        confidence: topCat.score,
        bbox: { x, y, width, height },
        confirmationStatus: 'confirmed',
        priority,
        firstSeenAt: now,
        lastSeenAt: now,
        isNew: true,
        isInanimateObstacle: Boolean(known?.isInanimateObstacle),
        proximityZone,
      });
    });

    return mapped;
  }
}

export const detectorService = new DetectorService();

