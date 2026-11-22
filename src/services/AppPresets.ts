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
 * 4 high-level, jargon-free general modes designed for the Android mobile app.
 * Each mode automatically configures the underlying vision engines, segmentation,
 * depth fusion, and audio ergonomics in a single tap.
 */
export const APP_PRESETS: AppPresetDefinition[] = [
  {
    id: 'indoor',
    title: 'Interiores',
    shortTitle: 'Interiores',
    description: 'Puertas, cortinas, muebles y camino libre con avisos tranquilos.',
    spokenConfirm: 'Modo Interiores activado. Avisos tranquilos para puertas y muebles.',
    features: {
      activePreset: 'indoor',
      detectorEngine: 'efficientdet_lite2',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b1',
      depthAnythingEnabled: false,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      clockFaceDirections: true,
      showStixelOverlay: true,
    },
  },
  {
    id: 'street',
    title: 'Calle / Exterior',
    shortTitle: 'Calle',
    description: 'Alertas rápidas, sonar direccional y control manos libres.',
    spokenConfirm: 'Modo Calle activado. Alertas rápidas y guía por sonido.',
    features: {
      activePreset: 'street',
      detectorEngine: 'efficientdet_lite2',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: false,
      audioVerbosity: 'essential',
      streetMode: true,
      stereoSonar: true,
      soundOnlyMode: false,
      handsFreeWakeWord: true,
      headsetButton: true,
      clockFaceDirections: true,
      showStixelOverlay: true,
    },
  },
  {
    id: 'currency',
    title: 'Billetes (Automático)',
    shortTitle: 'Billetes',
    description: 'Detecta automáticamente córdobas (10–1000) y dólares ($1–$100) solo al mostrarlos.',
    spokenConfirm: 'Modo Billetes automático activado. Muestra cualquier billete en córdobas o dólares frente a la cámara.',
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
    description: 'Puertas abiertas o cerradas con profundidad IA y narración detallada.',
    spokenConfirm: 'Modo Máxima Precisión activado. Profundidad e identificación detallada.',
    features: {
      activePreset: 'precision',
      detectorEngine: 'efficientdet_lite2',
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
    },
  },
  {
    id: 'silent',
    title: 'Solo Tonos y Vibración',
    shortTitle: 'Tonos',
    description: 'Guía discreta con tonos y vibración, sin voz automática.',
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
