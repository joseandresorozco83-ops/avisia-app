import { FilesetResolver, ObjectDetector, type Detection as MpDetection } from '@mediapipe/tasks-vision';
import type { AppPresetId, Detection, DetectorEngineId, DetectorStatus, ObjectCategory } from '../types/avicia';
import { cameraCalibrationService } from './CameraCalibrationService';
import { pedestrianNavigationService } from './PedestrianNavigationService';
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
  'hair dryer': { category: 'unknown', labelEs: 'Secadora', priority: 55, typicalHeightMeters: 0.24 },
  toothbrush: { category: 'unknown', labelEs: 'Cepillo', priority: 48, typicalHeightMeters: 0.18 },

  // Objects365 indoor, office & urban mobility classes (D-FINE-S Objects365 366-class ontology)
  desk: { category: 'obstacle', labelEs: 'Escritorio', priority: 91, isInanimateObstacle: true, typicalHeightMeters: 0.78 },
  'cabinet/shelf': { category: 'obstacle', labelEs: 'Mueble o estante', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 1.40 },
  'monitor/tv': { category: 'obstacle', labelEs: 'Monitor', priority: 82, isInanimateObstacle: true, typicalHeightMeters: 0.46 },
  telephone: { category: 'unknown', labelEs: 'Teléfono fijo', priority: 72, typicalHeightMeters: 0.16 },
  'blackboard/whiteboard': { category: 'obstacle', labelEs: 'Pizarra', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 1.15 },
  'fire extinguisher': { category: 'obstacle', labelEs: 'Extintor', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 0.62 },
  'storage box': { category: 'obstacle', labelEs: 'Caja', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.48 },
  'trash bin can': { category: 'obstacle', labelEs: 'Basurero', priority: 87, isInanimateObstacle: true, typicalHeightMeters: 0.62 },
  table: { category: 'obstacle', labelEs: 'Mesa', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 0.78 },
  'table tennis': { category: 'obstacle', labelEs: 'Mesa', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 0.76 },
  'dinning table': { category: 'obstacle', labelEs: 'Mesa', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 0.78 },
  'coffee table': { category: 'obstacle', labelEs: 'Mesa baja', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 0.48 },
  'side table': { category: 'obstacle', labelEs: 'Mesa lateral', priority: 88, isInanimateObstacle: true, typicalHeightMeters: 0.65 },
  nightstand: { category: 'obstacle', labelEs: 'Mesa lateral', priority: 88, isInanimateObstacle: true, typicalHeightMeters: 0.65 },
  curtain: { category: 'obstacle', labelEs: 'Cortina', priority: 92, isInanimateObstacle: true, typicalHeightMeters: 2.0 },
  blinds: { category: 'obstacle', labelEs: 'Cortina', priority: 92, isInanimateObstacle: true, typicalHeightMeters: 1.85 },
  door: { category: 'obstacle', labelEs: 'Puerta', priority: 94, isInanimateObstacle: true, typicalHeightMeters: 2.05 },
  stool: { category: 'chair', labelEs: 'Taburete', priority: 88, isInanimateObstacle: true, typicalHeightMeters: 0.65 },
  wheelchair: { category: 'obstacle', labelEs: 'Silla de ruedas', priority: 93, isInanimateObstacle: true, typicalHeightMeters: 0.95 },
  'traffic cone': { category: 'obstacle', labelEs: 'Cono', priority: 91, isInanimateObstacle: true, typicalHeightMeters: 0.70 },
  'traffic sign': { category: 'stop_sign', labelEs: 'Señal', priority: 85, isInanimateObstacle: true, typicalHeightMeters: 0.80 },
  'crosswalk sign': { category: 'traffic_light', labelEs: 'Señal peatonal', priority: 88, isInanimateObstacle: true, typicalHeightMeters: 0.80 },
  'street lights': { category: 'pole', labelEs: 'Poste de luz', priority: 90, isInanimateObstacle: true, typicalHeightMeters: 2.50 },
  'handbag/satchel': { category: 'obstacle', labelEs: 'Bolso', priority: 78, isInanimateObstacle: true, typicalHeightMeters: 0.35 },
  luggage: { category: 'obstacle', labelEs: 'Maleta', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 0.65 },
  trolley: { category: 'obstacle', labelEs: 'Carrito', priority: 89, isInanimateObstacle: true, typicalHeightMeters: 0.90 },
  stroller: { category: 'obstacle', labelEs: 'Cochecito', priority: 91, isInanimateObstacle: true, typicalHeightMeters: 0.95 },
  ladder: { category: 'obstacle', labelEs: 'Escalera de mano', priority: 91, isInanimateObstacle: true, typicalHeightMeters: 1.60 },
  printer: { category: 'unknown', labelEs: 'Impresora', priority: 72, typicalHeightMeters: 0.35 },
  'computer box': { category: 'unknown', labelEs: 'Computadora', priority: 72, typicalHeightMeters: 0.42 },
  fan: { category: 'obstacle', labelEs: 'Ventilador', priority: 84, isInanimateObstacle: true, typicalHeightMeters: 1.10 },
  'gas stove': { category: 'obstacle', labelEs: 'Estufa', priority: 86, isInanimateObstacle: true, typicalHeightMeters: 0.90 },
  mirror: { category: 'obstacle', labelEs: 'Espejo', priority: 85, isInanimateObstacle: true, typicalHeightMeters: 1.25 },
  lamp: { category: 'obstacle', labelEs: 'Lámpara', priority: 80, isInanimateObstacle: true, typicalHeightMeters: 1.30 },
  radiator: { category: 'obstacle', labelEs: 'Radiador', priority: 85, isInanimateObstacle: true, typicalHeightMeters: 0.70 },
};

// Domestic kitchen/bedroom/bathroom appliances that should ONLY be allowed in "home" (Casa y Hogar) mode
const DOMESTIC_KITCHEN_BEDROOM_CLASSES = new Set([
  'oven',
  'gas stove',
  'microwave',
  'toaster',
  'refrigerator',
  'sink',
  'toilet',
  'bed',
  'bathtub',
  'washing machine/drying machine',
  'dishwasher',
  'induction cooker',
  'rice cooker',
  'hair drier',
  'hair dryer',
  'toothbrush',
]);

// Indoor-only furniture & electronics that should NEVER fire in "street" (Calle y Exterior) mode
const INDOOR_ONLY_CLASSES = new Set([
  ...DOMESTIC_KITCHEN_BEDROOM_CLASSES,
  'blackboard/whiteboard',
  'desk',
  'cabinet/shelf',
  'nightstand',
  'coffee table',
  'side table',
  'dining table',
  'dinning table',
  'table',
  'table tennis',
  'couch',
  'tv',
  'monitor/tv',
  'laptop',
  'computer box',
  'printer',
  'keyboard',
  'mouse',
  'remote',
  'book',
  'mirror',
  'lamp',
  'radiator',
  'fan',
  'curtain',
  'blinds',
]);

const RARE_OUTDOOR_ONLY_CLASSES = new Set([
  'airplane',
  'boat',
  'train',
  'surfboard',
  'skis',
  'snowboard',
  'kite',
  'giraffe',
  'zebra',
  'elephant',
  'bear',
  'cow',
  'sheep',
  'horse',
  'hot-air balloon',
  'ship',
  'saxophone',
  'skiboard',
]);

// Wearable personal accessories in Objects365 that clutter indoor navigation without being obstacles
const IGNORED_WEARABLE_CLUTTER = new Set([
  'glasses',
  'hat',
  'earphone',
  'head phone',
  'watch',
  'belt',
  'tie',
  'bow tie',
  'necklace',
  'ring',
  'bracelet',
  'slippers',
  'sneakers',
  'leather shoes',
  'high heels',
  'boots',
  'sandals',
  'socks',
  'glove',
]);

/**
 * Context & geometric sanity gate to suppress classic COCO/Objects365 false positives
 * in indoor navigation (e.g., wooden door + carpet misclassified as "bed" at 40–49%,
 * wearable accessories like eyeglasses/hats, or user's own shoes at bottom frame border).
 */
export function isPlausibleDetection(
  rawCategoryName: string,
  score: number,
  bbox: { x: number; y: number; width: number; height: number },
  activePreset: AppPresetId = 'indoor'
): boolean {
  const rawName = (rawCategoryName || '').toLowerCase().trim();
  if (!rawName) return false;

  if (IGNORED_WEARABLE_CLUTTER.has(rawName)) {
    return false;
  }

  if (RARE_OUTDOOR_ONLY_CLASSES.has(rawName) && score < 0.78) {
    return false;
  }

  // Street Mode ("Calle y Exterior"): block all indoor furniture, kitchen appliances, and office electronics
  if (activePreset === 'street' && INDOOR_ONLY_CLASSES.has(rawName)) {
    return false;
  }

  // Suppress "bed" hallucinations on wooden doors / carpet floors
  if (rawName === 'bed') {
    if (activePreset === 'street') return false;
    if (activePreset !== 'home' && score < 0.78) return false;
    if (score < 0.64) return false;
    if (bbox.width >= 55 && bbox.height >= 40 && score < 0.78) return false;
  }

  // Suppress low-confidence "bench" hallucinations on indoor tables / floor borders
  if (rawName === 'bench' && score < 0.56) {
    return false;
  }

  // Suppress noisy tabletop clutter labels ("book", "laptop") when confidence is weak
  if ((rawName === 'book' || rawName === 'tie' || rawName === 'toothbrush') && score < 0.54) {
    return false;
  }

  // Suppress phantom "person" detections at the extreme bottom border (user's own feet / floor shadow)
  if (rawName === 'person') {
    if (bbox.y >= 72 && bbox.height <= 30 && score < 0.76) {
      return false;
    }
    if (bbox.y + bbox.height >= 97 && bbox.height <= 24 && score < 0.78) {
      return false;
    }
  }

  if (disambiguateIndoorClass(rawCategoryName, score, bbox, activePreset) === null) {
    return false;
  }

  return true;
}

/**
 * Resolves systematic indoor class confusions using the active usage mode ("indoor" Office, "home" House, "street" Street),
 * 3D camera calibration (horizon & floor contact), and aspect ratio geometry:
 * 1) Mode-Based Appliance Filtering:
 *    - In Office ("indoor"), Precision, or Silent mode: "oven" ("Estufa"), "gas stove", "microwave", "sink",
 *      "toilet", and "toaster" are blocked or reclassified as "desk" ("Escritorio") when waist-high.
 *    - In Home ("home") mode: "oven" ("Estufa") and "refrigerator" ("Refrigerador") are allowed when confidence >= 0.56.
 * 2) "Pizarra" vs "Refrigerador": In Office mode, any "refrigerator" mounted on a wall or upper/mid frame
 *    is reclassified as "blackboard/whiteboard" ("Pizarra"), and low-confidence refrigerators are suppressed.
 * 3) "Mesa / Escritorio" vs "Mueble": waist-level surfaces classified as "cabinet/shelf"
 *    are reclassified as "desk" ("Escritorio").
 */
export function disambiguateIndoorClass(
  rawCategoryName: string,
  score: number,
  bbox: { x: number; y: number; width: number; height: number },
  activePreset: AppPresetId = 'indoor'
): string | null {
  const rawName = (rawCategoryName || '').toLowerCase().trim();
  if (!rawName) return null;

  if (activePreset === 'street' && INDOOR_ONLY_CLASSES.has(rawName)) {
    return null;
  }

  // Handle "Estufa" (oven / gas stove), "Microondas", "Lavabo", "Inodoro", "Tostadora":
  // Strictly allowed ONLY in "home" (Casa y Hogar) mode with solid confidence (>= 56%); blocked in Office & Street modes!
  if (
    rawName === 'oven' ||
    rawName === 'gas stove' ||
    rawName === 'microwave' ||
    rawName === 'sink' ||
    rawName === 'toaster' ||
    rawName === 'toilet'
  ) {
    if (activePreset === 'home') {
      return score >= 0.56 ? rawName : null;
    }
    return null;
  }

  if (rawName === 'refrigerator') {
    const isWallMounted =
      cameraCalibrationService.isWallMountedAboveFloor(bbox) ||
      (bbox.y <= 52 && bbox.y + bbox.height < 86);
    const isWideBoardShape = bbox.width >= bbox.height * 0.52;

    if (activePreset === 'home') {
      // In Home mode, wall-mounted wide rectangles are still whiteboards/frames, but tall floor-standing boxes >= 56% are Refrigerators
      if (isWallMounted && isWideBoardShape) {
        return score >= 0.36 ? 'blackboard/whiteboard' : null;
      }
      return score >= 0.56 ? 'refrigerator' : null;
    }

    // In Office / Classroom mode ("indoor"), never announce "Refrigerador" unless >= 88% confidence and floor-standing;
    // wall-mounted or wide white panels are Whiteboards ("Pizarra")
    if (isWallMounted || isWideBoardShape) {
      return score >= 0.32 ? 'blackboard/whiteboard' : null;
    }
    return score >= 0.88 ? 'refrigerator' : 'blackboard/whiteboard';
  }

  if (rawName === 'cabinet/shelf') {
    // A waist-high surface in the lower/middle frame is a table/desk ("Escritorio"), not a tall wall cabinet ("Mueble")
    if (bbox.y >= 20 && (bbox.width >= bbox.height * 0.55 || bbox.y >= 32)) {
      return 'desk';
    }
  }

  return rawName;
}

const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

const MODEL_URLS: Record<'efficientdet_lite2' | 'efficientdet_lite0', string> = {
  efficientdet_lite2:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/latest/efficientdet_lite2.tflite',
  efficientdet_lite0:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
};

const MODEL_DISPLAY_NAMES: Record<DetectorEngineId, string> = {
  dfine_s_obj365: 'D-FINE-Obj365 ONNX (366 clases interiores · Apache 2.0)',
  dfine_n: 'D-FINE-Nano ONNX (42.8% mAP · Apache 2.0)',
  dfine_s: 'D-FINE-Small ONNX (48.5% mAP · Apache 2.0)',
  yolov10n: 'YOLOv10n ONNX (38.5% mAP)',
  efficientdet_lite2: 'EfficientDet-Lite2 448px (34% mAP · MediaPipe)',
  efficientdet_lite0: 'EfficientDet-Lite0 320px (Rápido · MediaPipe)',
};

const ONNX_DETECTOR_MODELS: Partial<
  Record<DetectorEngineId, { repoId: string; shortLabel: string; mAp: string }>
> = {
  dfine_s_obj365: {
    repoId: 'onnx-community/dfine_s_obj365-ONNX',
    shortLabel: 'D-FINE-Obj365',
    mAp: '366 clases',
  },
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
  typicalHeightMeters: number,
  bboxWidthPct?: number,
  bottomYPct?: number
): number {
  // Portrait smartphone wide-angle vertical FOV (~68 deg) => normalized vertical focal length ~0.72.
  // Use effective apparent size (considering width for angled/partially occluded furniture like chairs & desks)
  const effectivePct =
    typeof bboxWidthPct === 'number'
      ? Math.max(bboxHeightPct, Math.min(bboxHeightPct * 1.45, bboxWidthPct * 0.78))
      : bboxHeightPct;
  const heightFrac = Math.max(0.08, effectivePct / 100);
  let rawMeters = (typicalHeightMeters * 0.72) / heightFrac;

  // Ground-plane perspective constraint: objects whose bottom edge rests lower in the frame cannot be 8m away
  if (typeof bottomYPct === 'number' && bottomYPct >= 45 && typicalHeightMeters <= 1.85) {
    // At bottomY=95% -> ~1.1m max; at bottomY=75% -> ~2.2m max; at bottomY=55% -> ~3.4m max
    const perspectiveCap = Math.max(1.0, 4.6 - ((bottomYPct - 40) / 55) * 3.4);
    rawMeters = Math.min(rawMeters, perspectiveCap);
  }

  return Number(Math.min(6.5, Math.max(0.4, rawMeters)).toFixed(1));
}

export class DetectorService {
  private detector: ObjectDetector | null = null;
  private onnxPipeline: OnnxPipelineFn | null = null;
  private onnxEngineLoaded: DetectorEngineId | null = null;
  private usingWorker = false;
  private onnxCanvas: HTMLCanvasElement | null = null;
  private activeEngine: DetectorEngineId = 'dfine_s_obj365';
  private activePreset: AppPresetId = 'indoor';
  private currentRunningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';
  private lastScoreThreshold = 0.36;
  private initPromise: Promise<DetectorStatus> | null = null;
  private bgOnnxUpgradeEngine: DetectorEngineId | null = null;
  private bgOnnxUpgradePromise: Promise<boolean> | null = null;
  private onnxBusy = false;
  private latestOnnxDetections: Detection[] = [];
  private latestOnnxAt = 0;
  private latestOnnxEpoch = 0;
  private statusListeners = new Set<(status: DetectorStatus) => void>();

  setActivePreset(preset: AppPresetId): void {
    if (this.activePreset !== preset) {
      this.activePreset = preset;
      this.clearTransientCache();
    }
  }

  getActivePreset(): AppPresetId {
    return this.activePreset;
  }

  clearTransientCache(): void {
    this.latestOnnxDetections = [];
    this.latestOnnxAt = 0;
    this.latestOnnxEpoch = 0;
  }
  private status: DetectorStatus = {
    ready: false,
    loading: false,
    error: null,
    modelName: MODEL_DISPLAY_NAMES.dfine_s_obj365,
    engineId: 'dfine_s_obj365',
    inferenceTimeMs: null,
  };

  onStatusChange(listener: (status: DetectorStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private emitStatus(): void {
    const snap = this.getStatus();
    for (const fn of this.statusListeners) {
      try {
        fn(snap);
      } catch {
        // Ignore listener errors
      }
    }
  }

  getStatus(): DetectorStatus {
    return { ...this.status };
  }

  getEngine(): DetectorEngineId {
    return this.activeEngine;
  }

  async setEngine(engine: DetectorEngineId, scoreThreshold = this.lastScoreThreshold): Promise<DetectorStatus> {
    this.lastScoreThreshold = scoreThreshold;
    const isTargetOnnx = Boolean(ONNX_DETECTOR_MODELS[engine]);
    if (
      engine === this.activeEngine &&
      this.status.ready &&
      (!isTargetOnnx || this.onnxEngineLoaded === engine || this.bgOnnxUpgradeEngine === engine)
    ) {
      return this.getStatus();
    }
    this.activeEngine = engine;
    if (!isTargetOnnx) {
      this.onnxPipeline = null;
      this.onnxEngineLoaded = null;
      this.usingWorker = false;
      this.bgOnnxUpgradeEngine = null;
      if (this.detector) {
        try {
          this.detector.close();
        } catch {
          // Ignore close errors
        }
        this.detector = null;
      }
      this.status = {
        ready: false,
        loading: false,
        error: null,
        modelName: MODEL_DISPLAY_NAMES[engine],
        engineId: engine,
        inferenceTimeMs: null,
      };
    } else if (this.onnxEngineLoaded !== engine) {
      this.onnxPipeline = null;
      this.onnxEngineLoaded = null;
      this.usingWorker = false;
    }
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
        dtype: 'q8',
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
      this.emitStatus();
      return true;
    } catch {
      this.onnxPipeline = null;
      this.onnxEngineLoaded = null;
      return false;
    }
  }

  private promoteToOnnxInBackground(targetEngine: DetectorEngineId): void {
    const spec = ONNX_DETECTOR_MODELS[targetEngine];
    if (!spec) return;
    if (this.bgOnnxUpgradeEngine === targetEngine || this.onnxEngineLoaded === targetEngine) {
      return;
    }
    this.bgOnnxUpgradeEngine = targetEngine;

    this.bgOnnxUpgradePromise = (async () => {
      try {
        const ok = await this.initOnnxEngine(targetEngine);
        if (ok) {
          this.emitStatus();
          return true;
        } else if (targetEngine === 'dfine_s_obj365') {
          // Try lighter dfine_n if dfine_s_obj365 couldn't download
          const okNano = await this.initOnnxEngine('dfine_n');
          if (okNano) {
            this.emitStatus();
            return true;
          }
        }
        return false;
      } finally {
        if (this.bgOnnxUpgradeEngine === targetEngine) {
          this.bgOnnxUpgradeEngine = null;
        }
        this.bgOnnxUpgradePromise = null;
      }
    })();
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
    const targetEngine = this.activeEngine;
    const isOnnxEngine = Boolean(ONNX_DETECTOR_MODELS[targetEngine]);

    if (
      isOnnxEngine &&
      this.onnxEngineLoaded === targetEngine &&
      (this.usingWorker || this.onnxPipeline)
    ) {
      return this.getStatus();
    }
    if (!isOnnxEngine && this.detector) {
      await this.detector.setOptions({ scoreThreshold });
      return this.getStatus();
    }

    // If an ONNX engine is requested and we already have a warm MediaPipe detector,
    // return ready immediately and promote to ONNX in the background (zero cold-start wait!)
    if (isOnnxEngine && this.detector) {
      this.promoteToOnnxInBackground(targetEngine);
      return this.getStatus();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      this.status = {
        ...this.status,
        loading: true,
        error: null,
        modelName: MODEL_DISPLAY_NAMES[targetEngine],
        engineId: targetEngine,
      };
      this.emitStatus();

      // Instant Warm-Start Architecture:
      // 1) First bring up fast MediaPipe detector (~1s) so live camera detects objects immediately on 4G/mobile!
      // 2) If target is ONNX (D-FINE-Obj365 / D-FINE-N), upgrade seamlessly in the background Web Worker!
      const mpEngines: Array<'efficientdet_lite2' | 'efficientdet_lite0'> =
        targetEngine === 'efficientdet_lite0'
          ? ['efficientdet_lite0']
          : ['efficientdet_lite2', 'efficientdet_lite0'];

      for (const mpCandidate of mpEngines) {
        const ok = await this.initMediaPipeModel(mpCandidate, scoreThreshold);
        if (ok) {
          if (isOnnxEngine) {
            const spec = ONNX_DETECTOR_MODELS[targetEngine];
            this.activeEngine = targetEngine;
            this.status = {
              ...this.status,
              ready: true,
              loading: false,
              modelName: `${spec?.shortLabel ?? 'D-FINE'} (Activo · Cargando 366cl)`,
              engineId: targetEngine,
            };
            this.emitStatus();
            this.promoteToOnnxInBackground(targetEngine);
          } else {
            this.emitStatus();
          }
          return this.getStatus();
        }
      }

      // If MediaPipe CDN wasn't reachable, load ONNX directly
      if (isOnnxEngine) {
        const ok = await this.initOnnxEngine(targetEngine);
        if (ok) {
          this.emitStatus();
          return this.getStatus();
        }
      }

      this.status = {
        ready: false,
        loading: false,
        error:
          'Sin conectividad para descargar pesos del modelo visual (D-FINE / EfficientDet WASM).',
        modelName: MODEL_DISPLAY_NAMES[targetEngine],
        engineId: targetEngine,
        inferenceTimeMs: null,
      };
      this.emitStatus();
      return this.getStatus();
    })();

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async runOnnxOnSource(
    sourceEl: HTMLImageElement | HTMLVideoElement,
    scoreThreshold: number,
    sourceType: 'real_image' | 'real_video'
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    const loadedOnnx = this.onnxEngineLoaded;
    const spec = loadedOnnx ? ONNX_DETECTOR_MODELS[loadedOnnx] : null;
    if (!spec) {
      throw new Error('Modelo ONNX no cargado aún.');
    }

    // Unified Web & App threshold (0.35 floor prevents low-confidence 27% kitchen/appliance hallucinations on Web!)
    const effectiveThreshold =
      loadedOnnx === 'dfine_s_obj365'
        ? Math.max(0.35, Math.min(scoreThreshold, 0.36))
        : scoreThreshold;

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
    const maxDim = loadedOnnx === 'dfine_s' || loadedOnnx === 'dfine_s_obj365' ? 576 : 512;
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
        effectiveThreshold
      );
      results = out.results ?? [];
      elapsed = out.elapsedMs;
    } else if (this.onnxPipeline) {
      const start = performance.now();
      const { RawImage } = await import('@huggingface/transformers');
      const rawImg = RawImage.fromCanvas(this.onnxCanvas);
      results = await this.onnxPipeline(rawImg, {
        threshold: effectiveThreshold,
        percentage: true,
      });
      elapsed = Math.round(performance.now() - start);
    }

    this.status.inferenceTimeMs = elapsed;

    const now = Date.now();
    const mapped: Detection[] = [];
    for (let idx = 0; idx < results.length && mapped.length < 12; idx++) {
      const item = results[idx];
      // Handle both normalized [0..1] percentage boxes and pixel-space boxes defensively
      const needsNorm = item.box.xmax > 1.5 || item.box.ymax > 1.5;
      const wScale = needsNorm ? 100 / Math.max(1, this.onnxCanvas!.width) : 100;
      const hScale = needsNorm ? 100 / Math.max(1, this.onnxCanvas!.height) : 100;
      const x = Math.max(0, Math.min(100, item.box.xmin * wScale));
      const y = Math.max(0, Math.min(100, item.box.ymin * hScale));
      const width = Math.max(1, Math.min(100 - x, (item.box.xmax - item.box.xmin) * wScale));
      const height = Math.max(1, Math.min(100 - y, (item.box.ymax - item.box.ymin) * hScale));
      const bbox = { x, y, width, height };
      if (!isPlausibleDetection(item.label, item.score, bbox, this.activePreset)) continue;
      mapped.push(this.buildDetection(item.label, item.score, bbox, idx, now, sourceType));
    }

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

    // For static image evaluation on Web ("Imagen IA"), if D-FINE-Obj365 is finishing its background load,
    // wait for it so the image gets the full 366-class indoor/urban model + MediaPipe hybrid fusion!
    if (this.bgOnnxUpgradePromise) {
      try {
        await this.bgOnnxUpgradePromise;
      } catch {
        // Proceed with available detector
      }
    }

    const width = imageElement.naturalWidth || imageElement.width || 640;
    const height = imageElement.naturalHeight || imageElement.height || 480;

    let onnxDetections: Detection[] = [];
    let onnxElapsed = 0;
    if (this.onnxEngineLoaded && (this.usingWorker || this.onnxPipeline)) {
      try {
        const onnxRes = await this.runOnnxOnSource(imageElement, scoreThreshold, 'real_image');
        onnxDetections = onnxRes.detections;
        onnxElapsed = onnxRes.inferenceTimeMs;
      } catch {
        // Fallback transparently to warm MediaPipe detector if ONNX frame fails
        this.usingWorker = false;
        this.onnxEngineLoaded = null;
      }
    }

    let mpDetections: Detection[] = [];
    let mpElapsed = 0;
    if (this.detector) {
      try {
        if (this.currentRunningMode !== 'IMAGE' || this.lastScoreThreshold !== scoreThreshold) {
          await this.detector.setOptions({ runningMode: 'IMAGE', scoreThreshold });
          this.currentRunningMode = 'IMAGE';
          this.lastScoreThreshold = scoreThreshold;
        }
        const start = performance.now();
        const result = this.detector.detect(imageElement);
        mpElapsed = Math.round(performance.now() - start);
        mpDetections = this.mapDetections(result.detections, width, height, 'real_image');
      } catch {
        // Ignore if MediaPipe not active
      }
    }

    if (onnxDetections.length === 0 && mpDetections.length === 0 && !this.detector && !this.onnxEngineLoaded) {
      throw new Error('Detector no disponible.');
    }

    const merged = [...onnxDetections];
    for (const mpDet of mpDetections) {
      const overlaps = merged.some((ox) => {
        const x1 = Math.max(ox.bbox.x, mpDet.bbox.x);
        const y1 = Math.max(ox.bbox.y, mpDet.bbox.y);
        const x2 = Math.min(ox.bbox.x + ox.bbox.width, mpDet.bbox.x + mpDet.bbox.width);
        const y2 = Math.min(ox.bbox.y + ox.bbox.height, mpDet.bbox.y + mpDet.bbox.height);
        const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        if (inter <= 0) return false;
        const areaA = Math.max(1, ox.bbox.width * ox.bbox.height);
        const areaB = Math.max(1, mpDet.bbox.width * mpDet.bbox.height);
        return inter / (areaA + areaB - inter) >= 0.3;
      });
      if (!overlaps) {
        merged.push(mpDet);
      }
    }

    // Apply cross-class semantic disambiguation (Mesa/Escritorio vs Mueble, Pizarra vs Refrigerador)
    const tables = merged.filter(
      (d) => d.labelEs === 'Mesa' || d.labelEs === 'Escritorio' || d.labelEs === 'Mesa baja'
    );
    const whiteboards = merged.filter((d) => d.labelEs === 'Pizarra');
    const detections = merged
      .filter((d) => {
        if (d.labelEs.startsWith('Mueble') && tables.length > 0) {
          const cx = d.bbox.x + d.bbox.width / 2;
          if (tables.some((t) => Math.abs(t.bbox.x + t.bbox.width / 2 - cx) <= 28)) {
            return false;
          }
        }
        if (d.labelEs === 'Refrigerador' && whiteboards.length > 0) {
          return false;
        }
        return true;
      })
      .slice(0, 12);

    // Self-calibrate 3D camera height & orientation from floor-contact objects in the image
    cameraCalibrationService.updateFromVisualScene({
      videoWidth: width,
      videoHeight: height,
      referenceObjects: detections.map((d) => {
        const meta = Object.values(CATEGORY_MAP).find((m) => m.labelEs === d.labelEs);
        return {
          bbox: d.bbox,
          typicalHeightMeters: meta?.typicalHeightMeters ?? 0.85,
          confidence: d.confidence,
          isFloorContact:
            d.category === 'person' ||
            d.category === 'chair' ||
            d.labelEs === 'Escritorio' ||
            d.labelEs === 'Mesa',
        };
      }),
    });

    const elapsed = onnxElapsed || mpElapsed;
    this.status.inferenceTimeMs = elapsed;
    return { detections, inferenceTimeMs: elapsed };
  }

  async detectOnVideoFrame(
    videoElement: HTMLVideoElement,
    scoreThreshold = 0.36
  ): Promise<{ detections: Detection[]; inferenceTimeMs: number }> {
    if (!this.status.ready) {
      throw new Error('El modelo visual no está inicializado.');
    }

    // Real-Time Hybrid Architecture (v5.1.1):
    // 1) If fast GPU MediaPipe detector is available, ALWAYS run it synchronously (~40ms) for zero-lag tracking!
    // 2) Simultaneously poll the 366-class D-FINE ONNX Web Worker asynchronously in the background without blocking the camera loop,
    //    and fuse fresh Objects365 detections (Escritorio, Monitor, Teléfono fijo, Extintor, Silla, Persona) from the last 1.3s!
    if (this.detector) {
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
      const fastDetections = this.mapDetections(result.detections, width, height, 'real_video');

      // Kick off non-blocking background ONNX worker pass if an ONNX engine is loaded and idle
      if (this.onnxEngineLoaded && (this.usingWorker || this.onnxPipeline) && !this.onnxBusy) {
        this.onnxBusy = true;
        const capturedEpoch = pedestrianNavigationService.getMovementEpoch();
        const capturedAt = Date.now();
        void this.runOnnxOnSource(videoElement, scoreThreshold, 'real_video')
          .then((onnxRes) => {
            if (
              pedestrianNavigationService.isNotificationStillUseful(
                capturedEpoch,
                capturedAt,
                Date.now(),
                950
              )
            ) {
              this.latestOnnxDetections = onnxRes.detections;
              this.latestOnnxAt = Date.now();
              this.latestOnnxEpoch = capturedEpoch;
            }
          })
          .catch(() => {
            // Keep fast MediaPipe detections on transient worker error
          })
          .finally(() => {
            this.onnxBusy = false;
          });
      }

      // Fuse fresh background Objects365 detections (<= 680ms old and same movementEpoch) with instant MediaPipe detections
      const now = Date.now();
      const currentEpoch = pedestrianNavigationService.getMovementEpoch();
      let combinedList = fastDetections;
      if (
        this.latestOnnxDetections.length > 0 &&
        this.latestOnnxEpoch === currentEpoch &&
        now - this.latestOnnxAt <= 680
      ) {
        const merged = [...this.latestOnnxDetections];
        for (const mpDet of fastDetections) {
          const overlapsExisting = merged.some((ox) => {
            const x1 = Math.max(ox.bbox.x, mpDet.bbox.x);
            const y1 = Math.max(ox.bbox.y, mpDet.bbox.y);
            const x2 = Math.min(ox.bbox.x + ox.bbox.width, mpDet.bbox.x + mpDet.bbox.width);
            const y2 = Math.min(ox.bbox.y + ox.bbox.height, mpDet.bbox.y + mpDet.bbox.height);
            const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
            if (inter <= 0) return false;
            const areaA = Math.max(1, ox.bbox.width * ox.bbox.height);
            const areaB = Math.max(1, mpDet.bbox.width * mpDet.bbox.height);
            return inter / (areaA + areaB - inter) >= 0.3;
          });
          if (!overlapsExisting) {
            merged.push(mpDet);
          }
        }

        // Cross-class semantic disambiguation:
        // - If "Mesa" or "Escritorio" is present, suppress overlapping "Mueble o estante"
        // - If "Pizarra" is present, suppress overlapping "Refrigerador"
        const tables = merged.filter(
          (d) => d.labelEs === 'Mesa' || d.labelEs === 'Escritorio' || d.labelEs === 'Mesa baja'
        );
        const whiteboards = merged.filter((d) => d.labelEs === 'Pizarra');
        combinedList = merged
          .filter((d) => {
            if (d.labelEs.startsWith('Mueble') && tables.length > 0) {
              const cx = d.bbox.x + d.bbox.width / 2;
              if (
                tables.some(
                  (t) => Math.abs(t.bbox.x + t.bbox.width / 2 - cx) <= 24
                )
              ) {
                return false;
              }
            }
            if (d.labelEs === 'Refrigerador' && whiteboards.length > 0) {
              return false;
            }
            return true;
          })
          .slice(0, 12);
      }

      // Self-calibrate camera height above floor (H_cam) & vertical/horizontal orientation from confirmed floor objects
      cameraCalibrationService.updateFromVisualScene({
        videoWidth: width,
        videoHeight: height,
        referenceObjects: combinedList.map((d) => {
          const meta = Object.values(CATEGORY_MAP).find((m) => m.labelEs === d.labelEs);
          return {
            bbox: d.bbox,
            typicalHeightMeters: meta?.typicalHeightMeters ?? 0.85,
            confidence: d.confidence,
            isFloorContact:
              d.category === 'person' ||
              d.category === 'chair' ||
              d.labelEs === 'Escritorio' ||
              d.labelEs === 'Mesa',
          };
        }),
      });

      return { detections: combinedList, inferenceTimeMs: elapsed };
    }

    if (this.onnxEngineLoaded && (this.usingWorker || this.onnxPipeline)) {
      return this.runOnnxOnSource(videoElement, scoreThreshold, 'real_video');
    }

    throw new Error('El modelo de detección no está inicializado.');
  }

  private buildDetection(
    rawCategoryName: string,
    score: number,
    bbox: { x: number; y: number; width: number; height: number },
    idx: number,
    now: number,
    source: 'real_image' | 'real_video'
  ): Detection {
    const disambiguated = disambiguateIndoorClass(
      rawCategoryName,
      score,
      bbox,
      this.activePreset
    );
    const rawName = (disambiguated ?? rawCategoryName ?? '').toLowerCase().trim();
    const known = CATEGORY_MAP[rawName];
    const labelEs = known ? known.labelEs : rawName;
    const category: ObjectCategory = known ? known.category : 'unknown';
    const priority = known ? known.priority : 55;
    const typicalHeight = known ? known.typicalHeightMeters : 0.85;

    const centerX = bbox.x + bbox.width / 2;
    const bottomY = bbox.y + bbox.height;
    const centerOverlapWidth = Math.max(
      0,
      Math.min(bbox.x + bbox.width, 72) - Math.max(bbox.x, 28)
    );
    const coversCenterPath = centerOverlapWidth >= 10;
    const isCentered = (centerX >= 25 && centerX <= 75) || coversCenterPath;

    const isFloorContact =
      Boolean(known?.isInanimateObstacle) || category === 'person' || category === 'chair';
    const estimatedMeters = cameraCalibrationService.estimateCalibratedMeters(
      bbox,
      typicalHeight,
      isFloorContact
    );
    const clockPosition = computeClockPosition(centerX);

    const proximityZone: Detection['proximityZone'] = isCentered
      ? estimatedMeters <= 1.8 || bbox.height >= 34 || (bottomY >= 78 && bbox.width >= 24)
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
      const bbox = { x, y, width, height };
      if (!isPlausibleDetection(topCat.categoryName || '', topCat.score, bbox, this.activePreset)) {
        return;
      }

      mapped.push(
        this.buildDetection(
          topCat.categoryName || '',
          topCat.score,
          bbox,
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
