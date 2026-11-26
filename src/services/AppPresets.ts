import type { AppPresetId, StreetAssistFeatures } from '../types/avicia';

export interface AppPresetDefinition {
  id: AppPresetId;
  title: string;
  shortTitle: string;
  description: string;
  spokenConfirm: string;
  features: Partial<StreetAssistFeatures>;
}

/**
 * 5 high-level, jargon-free general modes designed for the Android mobile app (v5.0).
 * Each mode automatically configures D-FINE / EfficientDet, SegFormer, 3D Depth Ground-Plane
 * anti-false-stair verification, and low-cognitive-load Delta Narration in a single tap.
 */
export const APP_PRESETS: AppPresetDefinition[] = [
  {
    id: 'indoor',
    title: 'Interiores',
    shortTitle: 'Interiores',
    description: 'D-FINE Objects365 (366 clases interiores) + puertas, paredes, plano 3D y paso libre.',
    spokenConfirm: 'Modo Interiores activado. Detección precisa de puertas, paredes, muebles y camino despejado.',
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
      clockFaceDirections: true,
      showStixelOverlay: true,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'street',
    title: 'Calle / Exterior',
    shortTitle: 'Calle',
    description: 'D-FINE rápido, desniveles 3D reales, sonar direccional y manos libres.',
    spokenConfirm: 'Modo Calle activado. Alertas rápidas y detector de desniveles 3D.',
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
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'currency',
    title: 'Billetes (Automático)',
    shortTitle: 'Billetes',
    description: 'Detecta automáticamente córdobas (10–1000) y dólares ($1–$100) solo al mostrarlos.',
    spokenConfirm:
      'Modo Billetes automático activado. Muestra cualquier billete en córdobas o dólares frente a la cámara.',
    features: {
      activePreset: 'currency',
      detectorEngine: 'efficientdet_lite2',
      architecturalVisionEnabled: false,
      depthAnythingEnabled: false,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      clockFaceDirections: true,
      showStixelOverlay: false,
    },
  },
  {
    id: 'precision',
    title: 'Máxima Precisión',
    shortTitle: 'Precisión',
    description: 'D-FINE Objects365 (366 clases), profundidad 3D, puertas abiertas/cerradas y narración detallada.',
    spokenConfirm: 'Modo Máxima Precisión activado. Reconocimiento avanzado de 366 clases e identificación detallada.',
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
      clockFaceDirections: true,
      showStixelOverlay: true,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'silent',
    title: 'Solo Tonos y Vibración',
    shortTitle: 'Tonos',
    description: 'Guía discreta de bajo consumo con tonos y vibración, sin voz automática.',
    spokenConfirm: 'Modo discreto activado. Solo tonos y vibración.',
    features: {
      activePreset: 'silent',
      detectorEngine: 'efficientdet_lite2',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: false,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: true,
      soundOnlyMode: true,
      handsFreeWakeWord: false,
      clockFaceDirections: true,
      showStixelOverlay: true,
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
