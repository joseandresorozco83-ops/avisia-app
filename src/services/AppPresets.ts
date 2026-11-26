import type { AppPresetId, StreetAssistFeatures } from '../types/avicia';

export interface AppPresetDefinition {
  id: AppPresetId;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  includedSummary: string[];
  spokenConfirm: string;
  features: StreetAssistFeatures;
}

/**
 * 5 human-centered general modes (v5.1) that consolidate all 15+ technical vision,
 * depth, segmentation, and audio switches into simple one-tap buttons for both Web and Android.
 */
export const APP_PRESETS: AppPresetDefinition[] = [
  {
    id: 'indoor',
    title: '1. Interiores (Casa y Oficina)',
    shortTitle: 'Interiores',
    subtitle: 'Recomendado bajo techo',
    description:
      'Detecta puertas abiertas o cerradas, paredes, escritorios, sillas y gradas, y avisa cuando el pasillo está despejado.',
    includedSummary: [
      '366 objetos interiores + Puertas y Paredes',
      'Detector 3D de camino despejado y gradas',
      'Voz tranquila (solo avisa lo importante)',
    ],
    spokenConfirm:
      'Modo Interiores activado. Detección de puertas, paredes, muebles y camino despejado.',
    features: {
      activePreset: 'indoor',
      detectorEngine: 'dfine_s_obj365',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b1',
      depthAnythingEnabled: true,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: true,
      showStixelOverlay: true,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'street',
    title: '2. Calle y Exterior (Manos Libres)',
    shortTitle: 'Calle',
    subtitle: 'Caminata en aceras',
    description:
      'Alertas cortas y rápidas para vehículos, peatones, postes y desniveles, con sonar direccional y voz "Oye Avisia".',
    includedSummary: [
      'Alertas rápidas (2–3 palabras) + Reloj',
      'Desniveles 3D + Sonar izquierda/derecha',
      'Manos libres "Oye Avisia" y botón Bluetooth',
    ],
    spokenConfirm:
      'Modo Calle activado. Alertas rápidas, detector de desniveles y manos libres.',
    features: {
      activePreset: 'street',
      detectorEngine: 'dfine_n',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: true,
      audioVerbosity: 'essential',
      streetMode: true,
      stereoSonar: true,
      soundOnlyMode: false,
      handsFreeWakeWord: true,
      headsetButton: true,
      clockFaceDirections: true,
      showStixelOverlay: true,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'currency',
    title: '3. Lector de Billetes (Automático)',
    shortTitle: 'Billetes',
    subtitle: 'Córdobas y dólares',
    description:
      'Identifica automáticamente billetes de Nicaragua (C$10 a C$1000) y dólares ($1 a $100) al mostrarlos frente a la cámara.',
    includedSummary: [
      'Lectura automática sin tocar botones',
      'Córdobas (10–1000) y Dólares ($1–$100)',
      'Silencia alertas de paredes mientras cuentas',
    ],
    spokenConfirm:
      'Modo Billetes automático activado. Muestra cualquier billete en córdobas o dólares frente a la cámara.',
    features: {
      activePreset: 'currency',
      detectorEngine: 'efficientdet_lite2',
      architecturalVisionEnabled: false,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: false,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: true,
      showStixelOverlay: false,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: false,
    },
  },
  {
    id: 'precision',
    title: '4. Exploración Detallada (Todo)',
    shortTitle: 'Detallado',
    subtitle: 'Máxima descripción',
    description:
      'Narra todos los objetos y muebles del entorno con el motor de 366 clases, profundidad 3D, puertas e inteligencia artificial.',
    includedSummary: [
      'Narra todos los objetos cercanos y medios',
      'Máxima precisión (366 clases + Puertas+)',
      'Apoyo IA en escenas complejas + Offline',
    ],
    spokenConfirm:
      'Modo Exploración Detallada activado. Reconocimiento completo e identificación detallada.',
    features: {
      activePreset: 'precision',
      detectorEngine: 'dfine_s_obj365',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b1',
      depthAnythingEnabled: true,
      audioVerbosity: 'detailed',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: true,
      showStixelOverlay: true,
      offlineVlmEnabled: true,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'silent',
    title: '5. Modo Discreto (Tonos y Vibración)',
    shortTitle: 'Discreto',
    subtitle: 'Sin voz en público',
    description:
      'Guía silenciosa para reuniones o lugares públicos: avisa obstáculos con tonos espaciales y vibración, sin hablar.',
    includedSummary: [
      'Sin voz automática (100% discreto)',
      'Tonos estéreo (izquierda / centro / derecha)',
      'Vibración háptica según cercanía y puertas',
    ],
    spokenConfirm: 'Modo discreto activado. Solo tonos y vibración.',
    features: {
      activePreset: 'silent',
      detectorEngine: 'dfine_n',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: true,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: true,
      soundOnlyMode: true,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: true,
      showStixelOverlay: true,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: false,
    },
  },
];

export function applyAppPreset(
  current: StreetAssistFeatures,
  presetId: AppPresetId
): StreetAssistFeatures {
  const preset = APP_PRESETS.find((p) => p.id === presetId) ?? APP_PRESETS[0];
  return {
    ...current,
    ...preset.features,
    activePreset: preset.id,
  };
}

export function getPresetById(presetId?: AppPresetId): AppPresetDefinition {
  return APP_PRESETS.find((p) => p.id === presetId) ?? APP_PRESETS[0];
}
