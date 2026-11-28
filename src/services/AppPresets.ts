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
 * 6 context-aware human-centered usage modes (v5.4.0):
 * Each mode automatically configures the neural models, audio cadence, AND filters the allowed
 * object ontology (e.g. Office mode blocks Stove/Fridge/Bed; Home mode allows them; Street mode blocks all indoor appliances).
 */
export const APP_PRESETS: AppPresetDefinition[] = [
  {
    id: 'indoor',
    title: '1. Oficina y Aula (UAM / Trabajo)',
    shortTitle: 'Oficina',
    subtitle: 'Aulas y pasillos',
    description:
      'Optimizado para oficinas y aulas: detecta escritorios, sillas, puertas, cortinas, pizarras, paredes y extintores. Bloquea falsas alarmas de cocina (estufas o refrigeradores).',
    includedSummary: [
      'Filtro contextual de oficina (sin estufas ni refris)',
      'Puertas, cortinas, pizarras, escritorios y camino libre',
      'Orientación directa (al frente / izquierda / derecha)',
    ],
    spokenConfirm:
      'Modo Oficina y Aula activado. Filtro de objetos de oficina, puertas, paredes y camino despejado.',
    features: {
      activePreset: 'indoor',
      detectorEngine: 'dfine_s_obj365',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: true,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: false,
      showStixelOverlay: true,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'home',
    title: '2. Casa y Hogar (Vivienda)',
    shortTitle: 'Casa',
    subtitle: 'Sala, cocina y cuartos',
    description:
      'Para el hogar: habilita electrodomésticos y muebles domésticos (refrigerador, estufa, microondas, cama, sillón, mesa, silla, puertas y cortinas) con alta confianza.',
    includedSummary: [
      'Habilita refrigerador, estufa, cama y sillón',
      'Detecta puertas, cortinas, mesas y escaleras',
      'Orientación directa (al frente / izquierda / derecha)',
    ],
    spokenConfirm:
      'Modo Casa y Hogar activado. Detección de muebles domésticos, cocina, puertas y camino libre.',
    features: {
      activePreset: 'home',
      detectorEngine: 'dfine_s_obj365',
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: true,
      audioVerbosity: 'essential',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: false,
      showStixelOverlay: true,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'street',
    title: '3. Calle y Exterior (Manos Libres)',
    shortTitle: 'Calle',
    subtitle: 'Caminata en aceras',
    description:
      'Exclusivo para exteriores: detecta vehículos, autobuses, motos, peatones, postes, bancas y gradas. Bloquea por completo electrodomésticos y objetos de oficina.',
    includedSummary: [
      'Filtro exterior (solo vehículos, peatones y postes)',
      'Desniveles 3D + Sonar izquierda/derecha',
      'Manos libres "Oye Avisia" y botón Bluetooth',
    ],
    spokenConfirm:
      'Modo Calle activado. Filtro de objetos exteriores, alertas rápidas y manos libres.',
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
      clockFaceDirections: false,
      showStixelOverlay: true,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'currency',
    title: '4. Lector de Billetes (Automático)',
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
      clockFaceDirections: false,
      showStixelOverlay: false,
      offlineVlmEnabled: false,
      autoEscalateLowConfVlm: false,
    },
  },
  {
    id: 'precision',
    title: '5. Exploración Detallada (Todo)',
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
      archModelVariant: 'segformer_b0',
      depthAnythingEnabled: true,
      audioVerbosity: 'detailed',
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      clockFaceDirections: false,
      showStixelOverlay: true,
      offlineVlmEnabled: true,
      autoEscalateLowConfVlm: true,
    },
  },
  {
    id: 'silent',
    title: '6. Modo Discreto (Tonos y Vibración)',
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
      clockFaceDirections: false,
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
