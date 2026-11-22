export type OperationMode = 'simulation' | 'vision_lab' | 'video_lab' | 'live_camera';

export type DetectorEngineId = 'efficientdet_lite2' | 'yolov10n' | 'efficientdet_lite0';

export type AssistiveChannel = 'explore' | 'scene_ai' | 'read_text' | 'find_object' | 'light';

export type DetectionSource = 'simulated' | 'real_image' | 'real_video';

export type ObjectCategory =
  | 'person'
  | 'car'
  | 'motorcycle'
  | 'bus'
  | 'sidewalk'
  | 'building'
  | 'bus_stop'
  | 'pole'
  | 'bench'
  | 'fire_hydrant'
  | 'traffic_light'
  | 'stop_sign'
  | 'chair'
  | 'potted_plant'
  | 'obstacle'
  | 'unknown';

export type PolicyType = 'C00' | 'C01';

export type ConfirmationStatus = 'pending' | 'confirmed' | 'insufficient';

export interface BoundingBox {
  /** Normalized coordinates [0..100] as percentage of scene width/height */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  id: string;
  category: ObjectCategory;
  labelEs: string;
  source: DetectionSource;
  bbox: BoundingBox;
  /** Real confidence score [0..1] ONLY when source is real_image or real_video */
  confidence?: number;
  /** Confirmation state in temporal buffer */
  confirmationStatus: ConfirmationStatus;
  /** Priority weight for message selection (higher = more urgent) */
  priority: number;
  /** Timestamp (ms) when first seen */
  firstSeenAt: number;
  /** Timestamp (ms) when last updated */
  lastSeenAt: number;
  /** Whether this detection is newly appearing or changed state */
  isNew?: boolean;
  /** True when the object is a static/inanimate obstacle (pole, bench, hydrant, chair, etc.) */
  isInanimateObstacle?: boolean;
  /** Spatial zone relative to the user's forward path */
  proximityZone?: 'front_close' | 'front_mid' | 'side';
  /** Estimated distance in meters (pinhole geometry or depth fusion) */
  estimatedMeters?: number | null;
  /** Clock-face direction relative to user (e.g., "a las 12", "a las 10") */
  clockPosition?: string;
  /** Stable temporal track identifier across video frames */
  trackId?: string;
  /** Number of consecutive frames confirming this object */
  framesConfirmed?: number;
}

export interface ObstacleAlert {
  labelEs: string;
  zone: 'front_close' | 'front_mid';
  message: string;
}

export interface PolicyEvaluation {
  policy: PolicyType;
  selectedDetectionIds: string[];
  discardedDetectionIds: string[];
  generatedMessage: string;
  reason: string;
  suppressedDuplicate: boolean;
  timestamp: number;
  obstacleAlert?: ObstacleAlert | null;
}

export interface SimulatedLocation {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  nearbyReferences: string[];
  simulatedDestination?: {
    name: string;
    lat: number;
    lng: number;
  };
}

export interface ScenarioStep {
  timeSec: number;
  detections: Omit<Detection, 'firstSeenAt' | 'lastSeenAt'>[];
  c00Message: string;
  c01Message: string;
  c00Reason: string;
  c01Reason: string;
}

export interface Scenario {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  sceneType: 'walking_managua' | 'waiting_bus' | 'exploring_place' | 'multiple_detections' | 'insufficient_info';
  location: SimulatedLocation;
  defaultMessage: string;
  insufficientEvidence?: boolean;
  steps: ScenarioStep[];
  qaKnowledge: {
    whatIsInFront: string;
    hasBus: string;
    hasPeople: string;
    whereAmI: string;
    whatNearby: string;
    busRouteReply?: string;
    detectionMeaning: string;
  };
}

export interface ConversationMessage {
  id: string;
  sender: 'user' | 'avicia' | 'system';
  text: string;
  timestamp: number;
  source: DetectionSource | 'intent_engine' | 'demo';
  spoken?: boolean;
}

export interface SpeechSettings {
  enabled: boolean;
  rate: number;
  voiceURI: string | null;
}

export type DevelopmentMaturity =
  | 'Implementado y probado'
  | 'Implementado, pendiente de validación'
  | 'Simulado'
  | 'Planificado';

export interface TechnicalStatusItem {
  component: string;
  status: DevelopmentMaturity;
  detail: string;
}

export interface DetectorStatus {
  ready: boolean;
  loading: boolean;
  error: string | null;
  modelName: string;
  engineId?: DetectorEngineId;
  inferenceTimeMs: number | null;
}

export interface StreetAssistFeatures {
  streetMode: boolean;
  stereoSonar: boolean;
  soundOnlyMode: boolean;
  handsFreeWakeWord: boolean;
  headsetButton: boolean;
  depthAnythingEnabled: boolean;
  architecturalVisionEnabled: boolean;
  detectorEngine: DetectorEngineId;
  clockFaceDirections: boolean;
}

