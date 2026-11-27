import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Play,
  Square,
  Eye,
  MapPin,
  Video,
  FlaskConical,
  Film,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  Volume2,
  VolumeX,
  MessageSquare,
  Sparkles,
  Wifi,
  WifiOff,
  BatteryCharging,
  ShieldAlert,
  ShieldCheck,
  GitBranch,
  Cpu,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Bluetooth,
  Home,
  Footprints,
  Crosshair,
  BellOff,
  Check,
  Banknote,
} from 'lucide-react';
import type {
  AppPresetId,
  AudioVerbosity,
  ConversationMessage,
  Detection,
  DetectorEngineId,
  OperationMode,
  PolicyEvaluation,
  PolicyType,
  SpeechSettings,
  StreetAssistFeatures,
} from './types/avicia';
import type { StixelNavigationPlan } from './services/DoorAndStixelService';
import { scenarioManager } from './services/ScenarioManager';
import { simulationEngine } from './services/SimulationEngine';
import {
  messagePolicy,
  shouldSpeakDeltaHazard,
  type DeltaNarrationState,
} from './services/MessagePolicy';
import { speechService } from './services/SpeechService';
import { conversationService } from './services/ConversationService';
import { detectorService } from './services/DetectorService';
import { assistiveVisionService } from './services/AssistiveVisionService';
import { isBanknoteQuestion } from './services/CurrencyRecognitionService';
import { APP_PRESETS, applyAppPreset, getPresetById } from './services/AppPresets';
import { locationService, type RealGpsPosition } from './services/LocationService';
import { telemetryService } from './services/TelemetryService';
import { SimulatedSceneCanvas } from './components/SimulatedSceneCanvas';
import { LiveCameraPanel } from './components/LiveCameraPanel';
import { ProcessingPanel } from './components/ProcessingPanel';
import { VoiceAssistantPanel } from './components/VoiceAssistantPanel';
import { SafetyConsentModal } from './components/SafetyConsentModal';
import { DEMO_STEPS, GuidedDemoBanner } from './components/GuidedDemoBanner';
import { AvisiaLogo } from './components/AvisiaLogo';

const VisionLabPanel = lazy(() =>
  import('./components/VisionLabPanel').then((m) => ({ default: m.VisionLabPanel }))
);
const VideoLabPanel = lazy(() =>
  import('./components/VideoLabPanel').then((m) => ({ default: m.VideoLabPanel }))
);
const PipelineSection = lazy(() =>
  import('./components/PipelineModal').then((m) => ({ default: m.PipelineSection }))
);
const ManaguaMapSection = lazy(() =>
  import('./components/ManaguaMapModal').then((m) => ({ default: m.ManaguaMapSection }))
);
const ManaguaWazeMobile = lazy(() =>
  import('./components/ManaguaMapModal').then((m) => ({ default: m.ManaguaWazeMobile }))
);
const TechnicalDetailsSection = lazy(() =>
  import('./components/TechnicalDetailsModal').then((m) => ({
    default: m.TechnicalDetailsSection,
  }))
);

const SETTINGS_STORAGE_KEY = 'avicia_simulator_settings_v1';
const STREET_FEATURES_STORAGE_KEY = 'avicia_street_features_v5_1';
const CONSENT_STORAGE_KEY = 'avisia_safety_consent_v1';

const DEFAULT_STREET_FEATURES: StreetAssistFeatures = {
  streetMode: false,
  stereoSonar: false,
  soundOnlyMode: false,
  handsFreeWakeWord: false,
  headsetButton: false,
  depthAnythingEnabled: true,
  architecturalVisionEnabled: true,
  archModelVariant: 'segformer_b1',
  showStixelOverlay: true,
  audioVerbosity: 'essential',
  activePreset: 'indoor',
  detectorEngine: 'dfine_s_obj365',
  clockFaceDirections: true,
  offlineVlmEnabled: false,
  autoEscalateLowConfVlm: true,
};

type MobileTab = 'vision' | 'assistant' | 'analysis' | 'map';
type EcosystemTab = 'core' | 'pipeline' | 'map' | 'tech';

export function App() {
  const isNativeApp = Capacitor.isNativePlatform();
  const isMobileExperience =
    isNativeApp || (typeof window !== 'undefined' && window.innerWidth < 1024);
  const scenarios = useMemo(() => scenarioManager.getAllScenarios(), []);

  const [mobileTab, setMobileTab] = useState<MobileTab>('vision');
  const [androidMenuOpen, setAndroidMenuOpen] = useState<boolean>(false);
  const [showAdvancedTech, setShowAdvancedTech] = useState<boolean>(false);
  const [ecosystemTab, setEcosystemTab] = useState<EcosystemTab>('core');
  const [mode, setMode] = useState<OperationMode>(
    isMobileExperience ? 'live_camera' : 'simulation'
  );
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0].id);
  const [simStepIndex, setSimStepIndex] = useState<number>(0);
  const [simPlaying, setSimPlaying] = useState<boolean>(false);

  const [policy, setPolicy] = useState<PolicyType>('C01');
  const [threshold, setThreshold] = useState<number>(isMobileExperience ? 0.36 : 0.45);
  const [highlightedDetectionId, setHighlightedDetectionId] = useState<string | null>(null);

  const [realDetections, setRealDetections] = useState<Detection[]>([]);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [pathClearConfirmed, setPathClearConfirmed] = useState<boolean>(false);
  const stixelPlanRef = useRef<StixelNavigationPlan | null>(null);
  const [autoStartCamera, setAutoStartCamera] = useState<boolean>(false);
  const [banknoteTriggerCount, setBanknoteTriggerCount] = useState<number>(0);
  const [presetSyncKey, setPresetSyncKey] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [consentAccepted, setConsentAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONSENT_STORAGE_KEY) === 'accepted_v4';
    } catch {
      return false;
    }
  });
  const [consentModalOpen, setConsentModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONSENT_STORAGE_KEY) !== 'accepted_v4';
    } catch {
      return true;
    }
  });
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    telemetryService.configureSession({
      platform: isNativeApp ? 'android' : 'web',
    });
  }, [isNativeApp]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && androidMenuOpen) {
        setAndroidMenuOpen(false);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [androidMenuOpen]);

  const [streetFeatures, setStreetFeatures] = useState<StreetAssistFeatures>(() => {
    try {
      const saved = localStorage.getItem(STREET_FEATURES_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_STREET_FEATURES, ...(JSON.parse(saved) as Partial<StreetAssistFeatures>) };
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_STREET_FEATURES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STREET_FEATURES_STORAGE_KEY, JSON.stringify(streetFeatures));
    } catch {
      // Ignore storage errors
    }
  }, [streetFeatures]);

  const [realGps, setRealGps] = useState<RealGpsPosition | null>(null);
  const [gpsActive, setGpsActive] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const stopGpsWatchRef = useRef<(() => void) | null>(null);

  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  isSpeakingRef.current = isSpeaking;
  const [isListening, setIsListening] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as SpeechSettings;
      }
    } catch {
      // Ignore storage errors
    }
    return { enabled: true, rate: 1.0, voiceURI: null };
  });

  const [history, setHistory] = useState<ConversationMessage[]>([
    {
      id: 'init-1',
      sender: 'system',
      text: 'Bienvenido a AVISIA. Inicia la demostración autónoma o selecciona un modo para interactuar.',
      timestamp: Date.now(),
      source: 'demo',
    },
  ]);

  const [demoActive, setDemoActive] = useState<boolean>(false);
  const [demoPaused, setDemoPaused] = useState<boolean>(false);
  const [demoCompleted, setDemoCompleted] = useState<boolean>(false);
  const [demoStepIndex, setDemoStepIndex] = useState<number>(0);

  const stopListeningRef = useRef<(() => void) | null>(null);

  const activeScenario = useMemo(
    () => scenarioManager.getScenarioById(scenarioId) ?? scenarios[0],
    [scenarioId, scenarios]
  );

  const activeScenarioIndex = useMemo(
    () => scenarios.findIndex((s) => s.id === activeScenario.id),
    [scenarios, activeScenario]
  );

  useEffect(() => {
    const loadVoices = () => {
      setAvailableVoices(speechService.getSpanishVoices());
    };
    loadVoices();
    if (speechService.isSynthesisSupported()) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (speechService.isSynthesisSupported()) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(speechSettings));
    } catch {
      // Ignore storage errors
    }
  }, [speechSettings]);

  useEffect(() => {
    if (mode !== 'simulation' || !simPlaying) return;
    const timer = window.setInterval(() => {
      setSimStepIndex((prev) => {
        if (activeScenario.steps.length <= 1) return 0;
        return (prev + 1) % activeScenario.steps.length;
      });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [mode, simPlaying, activeScenario]);

  // Autonomous Demo orchestration: advances ONLY after speech completes (+ natural pause)
  useEffect(() => {
    if (!demoActive || demoPaused || demoCompleted) return;
    const stepInfo = DEMO_STEPS[demoStepIndex];
    if (!stepInfo) return;

    let cancelled = false;
    let pauseTimer: number | null = null;
    let safetyTimer: number | null = null;

    const scheduleAdvance = (delayMs: number) => {
      if (cancelled) return;
      pauseTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (demoStepIndex < DEMO_STEPS.length - 1) {
          setDemoStepIndex((prev) => prev + 1);
        } else {
          setDemoCompleted(true);
        }
      }, delayMs);
    };

    setAndroidMenuOpen(false);
    let narrationToSpeak = stepInfo.narration;

    if (demoStepIndex === 0) {
      setMode('simulation');
      setScenarioId(scenarios[0].id);
      setSimStepIndex(0);
      setPolicy('C01');
      setMobileTab('vision');
      setEcosystemTab('core');
    } else if (demoStepIndex === 1) {
      setScenarioId('caminando-managua');
      setSimStepIndex(0);
      setMobileTab('vision');
      setEcosystemTab('core');
    } else if (demoStepIndex === 2) {
      setScenarioId('caminando-managua');
      setSimStepIndex(1);
    } else if (demoStepIndex === 3) {
      setScenarioId('esperando-autobus');
      setSimStepIndex(0);
    } else if (demoStepIndex === 4) {
      setScenarioId('detecciones-multiples');
      setSimStepIndex(0);
      setPolicy('C01');
      setMobileTab('analysis');
      setEcosystemTab('core');
    } else if (demoStepIndex === 5) {
      setScenarioId('esperando-autobus');
      setMobileTab('assistant');
      setEcosystemTab('core');
      const sampleQ = '¿Qué ruta es?';
      appendHistory({ sender: 'user', text: sampleQ, source: 'demo' });
      const sampleA =
        'Veo el autobús, pero no puedo confirmar su ruta.';
      appendHistory({ sender: 'avicia', text: sampleA, source: 'demo', spoken: true });
      narrationToSpeak = `${stepInfo.narration} ${sampleA}`;
    } else if (demoStepIndex === 6) {
      setScenarioId('informacion-insuficiente');
      setSimStepIndex(0);
      setMobileTab('vision');
      setEcosystemTab('core');
    } else if (demoStepIndex === 7) {
      setEcosystemTab('pipeline');
    } else if (demoStepIndex === 8) {
      setMobileTab('map');
      setEcosystemTab('map');
    } else if (demoStepIndex === 9) {
      setMobileTab('vision');
      setEcosystemTab('core');
      setScenarioId('caminando-managua');
      setSimStepIndex(0);
    }

    if (speechSettings.enabled && speechService.isSynthesisSupported()) {
      // Safety fallback in case browser speechSynthesis never fires onend
      safetyTimer = window.setTimeout(() => {
        scheduleAdvance(400);
      }, 22000);

      speakText(narrationToSpeak, () => {
        if (safetyTimer !== null) window.clearTimeout(safetyTimer);
        if (demoStepIndex === DEMO_STEPS.length - 1) {
          setDemoCompleted(true);
        } else {
          scheduleAdvance(1100);
        }
      });
    } else {
      scheduleAdvance(4500);
    }

    return () => {
      cancelled = true;
      if (pauseTimer !== null) window.clearTimeout(pauseTimer);
      if (safetyTimer !== null) window.clearTimeout(safetyTimer);
    };
  }, [demoActive, demoPaused, demoCompleted, demoStepIndex]);

  const currentStep = useMemo(
    () => simulationEngine.getStepForTime(activeScenario, simStepIndex),
    [activeScenario, simStepIndex]
  );

  const simulatedDetections = useMemo(
    () => simulationEngine.materializeStepDetections(currentStep),
    [currentStep]
  );

  const activeDetections = mode === 'simulation' ? simulatedDetections : realDetections;

  const evaluation: PolicyEvaluation = useMemo(() => {
    if (mode === 'simulation') {
      return messagePolicy.evaluateSimulatedStep(currentStep, simulatedDetections, policy);
    }
    return messagePolicy.evaluateRealDetections(
      realDetections,
      policy,
      Date.now(),
      streetFeatures.streetMode,
      streetFeatures.clockFaceDirections
    );
  }, [
    mode,
    currentStep,
    simulatedDetections,
    realDetections,
    policy,
    streetFeatures.streetMode,
    streetFeatures.clockFaceDirections,
  ]);

  const lastChimedObstacleRef = useRef<string | null>(null);
  const lastAutoSpokenAtRef = useRef<number>(0);
  const lastSpokenLiveMsgRef = useRef<{ text: string; at: number } | null>(null);
  const lastSpokenLabelMapRef = useRef<Map<string, number>>(new Map());
  const deltaNarrationMapRef = useRef<Map<string, DeltaNarrationState>>(new Map());
  const obstacleSpeakTimerRef = useRef<number | null>(null);
  const wasPathClearRef = useRef<boolean>(false);
  const lastClearSpokenAtRef = useRef<number>(0);

  useEffect(() => {
    if (mode === 'live_camera' && !cameraActive) {
      if (obstacleSpeakTimerRef.current !== null) {
        window.clearTimeout(obstacleSpeakTimerRef.current);
        obstacleSpeakTimerRef.current = null;
      }
      lastChimedObstacleRef.current = null;
      lastSpokenLabelMapRef.current.clear();
      deltaNarrationMapRef.current.clear();
      wasPathClearRef.current = false;
      setPathClearConfirmed(false);
      speechService.cancel();
      setIsSpeaking(false);
      return;
    }

    const alert = evaluation.obstacleAlert;
    if (!alert) {
      lastChimedObstacleRef.current = null;
      return;
    }
    if (!speechSettings.enabled) return;

    // Normalize obstacle base label (strip dynamic meter numbers/hints so jitter never re-triggers)
    const normLabel = alert.labelEs
      .toLowerCase()
      .replace(/a \d+(\.\d+)? m.*/g, '')
      .replace(/\(.*\)/g, '')
      .trim();

    const isLiveCamera = mode === 'live_camera' && cameraActive;
    const isCriticalHazard =
      alert.zone === 'front_close' ||
      normLabel.includes('pared') ||
      normLabel.includes('grada') ||
      normLabel.includes('bajada') ||
      normLabel.includes('desnivel') ||
      normLabel.includes('escalera');

    // In calm "essential" mode, ignore distant front_mid objects in live camera (user can tap screen anytime)
    if (isLiveCamera && streetFeatures.audioVerbosity === 'essential' && !isCriticalHazard) {
      return;
    }

    const now = Date.now();
    const perLabelCooldownMs = streetFeatures.audioVerbosity === 'essential' ? 10500 : 7500;
    const globalMinGapMs = isCriticalHazard ? 2600 : 4500;

    // Resolve live distance & clock for Parsimonious Delta Narration
    const matchedDet = realDetections.find(
      (d) =>
        (d.isInanimateObstacle || d.category === 'person') &&
        d.labelEs.toLowerCase().includes(normLabel.slice(0, 8))
    );
    const nextDelta = {
      meters: matchedDet?.estimatedMeters ?? null,
      zone: alert.zone,
      clock: matchedDet?.clockPosition ?? 'a las 12',
    };

    if (isLiveCamera) {
      const prevDelta = deltaNarrationMapRef.current.get(normLabel);
      if (!shouldSpeakDeltaHazard(prevDelta, nextDelta, now, perLabelCooldownMs)) return;
      if (now - lastAutoSpokenAtRef.current < globalMinGapMs) return;
      if (isSpeakingRef.current && !isCriticalHazard) return;
    }

    const alertKey = `${normLabel}-${alert.zone}`;
    if (alertKey === lastChimedObstacleRef.current && !isLiveCamera) return;

    lastChimedObstacleRef.current = alertKey;
    lastSpokenLabelMapRef.current.set(normLabel, now);
    deltaNarrationMapRef.current.set(normLabel, { ...nextDelta, spokenAt: now });
    lastAutoSpokenAtRef.current = now;

    // Play proximity chime ONLY for truly close hazards (or simulated demo steps)
    if (!isLiveCamera || isCriticalHazard) {
      speechService.playObstacleChime();
    }

    if (
      !demoActive &&
      !streetFeatures.soundOnlyMode &&
      (isLiveCamera || mode === 'video_lab')
    ) {
      if (obstacleSpeakTimerRef.current !== null) {
        window.clearTimeout(obstacleSpeakTimerRef.current);
      }
      const detourHint = stixelPlanRef.current?.shortDetourHint;
      const msgToSpeak =
        detourHint && isLiveCamera
          ? `${alert.message} ${detourHint}.`
          : alert.message;
      obstacleSpeakTimerRef.current = window.setTimeout(() => {
        const spokenAt = Date.now();
        lastAutoSpokenAtRef.current = spokenAt;
        lastSpokenLiveMsgRef.current = { text: msgToSpeak, at: spokenAt };
        appendHistory({
          sender: 'avicia',
          text: msgToSpeak,
          source: 'real_video',
          spoken: true,
        });
        telemetryService.recordEvent({
          type: 'spoken_alert',
          detail: normLabel,
          success: true,
        });
        speakText(msgToSpeak);
      }, isCriticalHazard ? 200 : 80);
    }
  }, [
    evaluation.obstacleAlert,
    speechSettings.enabled,
    mode,
    cameraActive,
    demoActive,
    streetFeatures.audioVerbosity,
    streetFeatures.soundOnlyMode,
  ]);

  useEffect(() => {
    return () => {
      if (obstacleSpeakTimerRef.current !== null) {
        window.clearTimeout(obstacleSpeakTimerRef.current);
      }
    };
  }, []);

  // Auto-speak general detections: in Detailed mode speaks all; in Essential mode speaks close foreground items (<= 2.4m) calmly
  useEffect(() => {
    const isLiveStreamMode =
      (mode === 'live_camera' && cameraActive) || mode === 'video_lab';
    if (
      !isLiveStreamMode ||
      !speechSettings.enabled ||
      demoActive ||
      streetFeatures.soundOnlyMode
    ) {
      return;
    }
    if (realDetections.length === 0 || evaluation.obstacleAlert || isSpeakingRef.current) return;

    const topDet = realDetections[0];
    if (
      streetFeatures.audioVerbosity === 'essential' &&
      ((topDet?.estimatedMeters ?? 3.5) > 2.4 || topDet?.proximityZone === 'side')
    ) {
      return;
    }

    const now = Date.now();
    const cooldownMs =
      streetFeatures.audioVerbosity === 'essential'
        ? 9500
        : streetFeatures.streetMode
          ? 4500
          : 7500;
    if (now - lastAutoSpokenAtRef.current < cooldownMs) return;

    const topLabel = realDetections[0]?.labelEs.toLowerCase().trim() ?? '';
    const lastForLabel = topLabel ? (lastSpokenLabelMapRef.current.get(topLabel) ?? 0) : 0;
    if (topLabel && now - lastForLabel < 12000) return;

    const lastMsg = lastSpokenLiveMsgRef.current;
    if (lastMsg && lastMsg.text === evaluation.generatedMessage && now - lastMsg.at < 12000) {
      return;
    }

    lastAutoSpokenAtRef.current = now;
    if (topLabel) lastSpokenLabelMapRef.current.set(topLabel, now);
    lastSpokenLiveMsgRef.current = { text: evaluation.generatedMessage, at: now };
    appendHistory({
      sender: 'avicia',
      text: evaluation.generatedMessage,
      source: 'real_video',
      spoken: true,
    });
    speakText(evaluation.generatedMessage);
  }, [
    mode,
    cameraActive,
    realDetections,
    evaluation.generatedMessage,
    evaluation.obstacleAlert,
    speechSettings.enabled,
    demoActive,
    streetFeatures.audioVerbosity,
    streetFeatures.streetMode,
    streetFeatures.soundOnlyMode,
  ]);

  // Verified "Camino despejado" calm spoken confirmation (once on clear transition + gentle 20s heartbeat)
  useEffect(() => {
    if (
      mode !== 'live_camera' ||
      !cameraActive ||
      demoActive ||
      !speechSettings.enabled
    ) {
      wasPathClearRef.current = false;
      return;
    }

    if (!pathClearConfirmed) {
      wasPathClearRef.current = false;
      return;
    }

    const announceClear = (phrase: string, minGapMs: number) => {
      const now = Date.now();
      if (isSpeakingRef.current) return;
      if (now - lastClearSpokenAtRef.current < minGapMs) return;
      if (now - lastAutoSpokenAtRef.current < 4000) return;
      lastClearSpokenAtRef.current = now;
      lastAutoSpokenAtRef.current = now;
      speechService.playClearPathTone();
      if (!streetFeatures.soundOnlyMode) {
        appendHistory({
          sender: 'avicia',
          text: phrase,
          source: 'real_video',
          spoken: true,
        });
        speakText(phrase);
      }
    };

    const buildClearPhrase = (short: boolean): string => {
      const plan = stixelPlanRef.current;
      if (plan?.openDoorwayAhead) {
        return `Puerta abierta ${plan.openDoorwayAhead.clockLabel}, paso libre.`;
      }
      if (!short && plan?.guidanceText) {
        return plan.guidanceText;
      }
      if (plan && plan.centerFreeSteps >= 4) {
        return 'Camino despejado, más de tres pasos libres.';
      }
      return short ? 'Camino despejado.' : 'Camino despejado al frente.';
    };

    if (!wasPathClearRef.current) {
      wasPathClearRef.current = true;
      announceClear(buildClearPhrase(false), 12000);
    }

    const timer = window.setInterval(() => {
      announceClear(buildClearPhrase(true), 19000);
    }, 20000);

    return () => window.clearInterval(timer);
  }, [
    mode,
    cameraActive,
    pathClearConfirmed,
    demoActive,
    speechSettings.enabled,
    streetFeatures.soundOnlyMode,
  ]);

  // v2.5 Stereo Sonar Ping in Live Camera mode (when stereoSonar or soundOnlyMode is ON)
  useEffect(() => {
    if (
      (!streetFeatures.stereoSonar && !streetFeatures.soundOnlyMode) ||
      !speechSettings.enabled ||
      mode !== 'live_camera' ||
      !cameraActive ||
      demoActive
    ) {
      return;
    }

    const frontItems = realDetections.filter(
      (d) => d.proximityZone === 'front_close' || d.proximityZone === 'front_mid'
    );
    if (frontItems.length === 0) return;

    const closest =
      frontItems.find((d) => d.proximityZone === 'front_close') ?? frontItems[0];
    const centerX = closest.bbox.x + closest.bbox.width / 2;
    const pan = (centerX - 50) / 50; // -1 (left) .. +1 (right)
    const urgency: 'danger' | 'caution' =
      closest.proximityZone === 'front_close' ? 'danger' : 'caution';
    const intervalMs = urgency === 'danger' ? 380 : 780;

    speechService.playStereoSonarPing(pan, urgency);
    const id = window.setInterval(() => {
      speechService.playStereoSonarPing(pan, urgency);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [
    streetFeatures.stereoSonar,
    streetFeatures.soundOnlyMode,
    speechSettings.enabled,
    mode,
    cameraActive,
    demoActive,
    realDetections,
  ]);

  // v2.5 Hands-Free Wake Word ("Avisia" / "Oye Avisia") for harness mounting
  const handleSendQuestionRef = useRef<(q: string) => void>(() => { });
  useEffect(() => {
    if (!streetFeatures.handsFreeWakeWord || demoActive) return;

    const stopWake = speechService.startWakeWordListener(
      (question) => {
        handleSendQuestionRef.current(question);
      },
      () => {
        speakText('Te escucho.');
      },
      (errMsg) => {
        appendHistory({
          sender: 'system',
          text: errMsg,
          source: 'intent_engine',
        });
        setStreetFeatures((f) => ({ ...f, handsFreeWakeWord: false }));
      }
    );

    return () => {
      stopWake?.();
    };
  }, [streetFeatures.handsFreeWakeWord, demoActive]);

  // v2.5 Headset / MediaSession Button handler (Bluetooth / wired earbuds)
  useEffect(() => {
    if (
      !streetFeatures.headsetButton ||
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator)
    ) {
      return;
    }

    const triggerVoice = () => {
      speechService.playWakeConfirmTone();
      handleToggleListening();
    };

    try {
      navigator.mediaSession.setActionHandler('play', triggerVoice);
      navigator.mediaSession.setActionHandler('pause', triggerVoice);
      navigator.mediaSession.setActionHandler('nexttrack', triggerVoice);
    } catch {
      // Ignore unsupported MediaSession actions
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [streetFeatures.headsetButton, isListening]);

  const appendHistory = (msg: Omit<ConversationMessage, 'id' | 'timestamp'>) => {
    setHistory((prev) => [
      ...prev.slice(-24),
      {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      },
    ]);
  };

  const speakText = (text: string, onFinished?: () => void) => {
    const effectiveSettings: SpeechSettings = streetFeatures.streetMode
      ? { ...speechSettings, rate: Math.max(speechSettings.rate, 1.18) }
      : speechSettings;
    speechService.speak(text, effectiveSettings, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        onFinished?.();
      },
      onError: () => {
        setIsSpeaking(false);
        onFinished?.();
      },
    });
  };

  const handleModeChange = (nextMode: OperationMode) => {
    speechService.cancel();
    setIsSpeaking(false);
    setMode(nextMode);
    setRealDetections([]);
    setHighlightedDetectionId(null);
    setAndroidMenuOpen(false);
    if (mobileTab === 'map') setMobileTab('vision');
    messagePolicy.resetHistory();
  };

  const handleSelectScenario = (id: string) => {
    speechService.cancel();
    setIsSpeaking(false);
    setScenarioId(id);
    setSimStepIndex(0);
    setSimPlaying(false);
    setHighlightedDetectionId(null);
    setAndroidMenuOpen(false);
    messagePolicy.resetHistory();
  };

  const cycleScenario = (dir: -1 | 1) => {
    const nextIdx = (activeScenarioIndex + dir + scenarios.length) % scenarios.length;
    handleSelectScenario(scenarios[nextIdx].id);
  };

  const handleSpeakCurrent = () => {
    const msg = evaluation.generatedMessage;
    appendHistory({
      sender: 'avicia',
      text: msg,
      source: mode === 'simulation' ? 'simulated' : mode === 'vision_lab' ? 'real_image' : 'real_video',
      spoken: true,
    });
    speakText(msg);
  };

  const handleRepeatLast = () => {
    const text = speechService.repeatLast(speechSettings, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
    appendHistory({
      sender: 'avicia',
      text: `(Repetido) ${text}`,
      source: 'intent_engine',
      spoken: true,
    });
  };

  const handleCancelSpeech = () => {
    speechService.cancel();
    setIsSpeaking(false);
  };

  const handleToggleGps = () => {
    if (gpsActive) {
      stopGpsWatchRef.current?.();
      stopGpsWatchRef.current = null;
      setGpsActive(false);
      setGpsLoading(false);
      setRealGps(null);
      setGpsError(null);
      return;
    }

    setGpsError(null);
    setGpsLoading(true);
    setGpsActive(true);

    stopGpsWatchRef.current = locationService.watchPosition(
      async (pos) => {
        setGpsLoading(false);
        setGpsError(null);
        const geo = await locationService.reverseGeocode(pos.lat, pos.lng);
        setRealGps({
          ...pos,
          placeName: geo.placeName,
          roadName: geo.roadName,
          neighbourhood: geo.neighbourhood,
          city: geo.city,
        });
      },
      (errMsg) => {
        setGpsLoading(false);
        setGpsError(errMsg);
        setGpsActive(false);
      }
    );
  };

  useEffect(() => {
    return () => {
      stopGpsWatchRef.current?.();
    };
  }, []);

  const handleSendQuestion = (question: string) => {
    telemetryService.recordEvent({
      type: 'voice_query',
      detail: question.slice(0, 60),
      success: true,
    });
    appendHistory({
      sender: 'user',
      text: question,
      source: 'intent_engine',
    });

    // Dedicated currency identification trigger: "¿De cuánto es este billete?"
    if (isBanknoteQuestion(question)) {
      setDemoActive(false);
      setMode('live_camera');
      setMobileTab('vision');
      setAutoStartCamera(true);
      setBanknoteTriggerCount((c) => c + 1);
      if (!cameraActive) {
        const msg = 'Activando cámara para identificar el billete. Muéstralo frente al lente con buena luz.';
        appendHistory({
          sender: 'avicia',
          text: msg,
          source: 'real_video',
          spoken: speechSettings.enabled,
        });
        speakText(msg);
      }
      return;
    }

    const normalizedQ = question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const isCrossingSafetyQuery =
      normalizedQ.includes('puedo cruzar') ||
      normalizedQ.includes('cruzar la calle') ||
      normalizedQ.includes('es seguro caminar') ||
      normalizedQ.includes('puedo avanzar');

    if (
      !isCrossingSafetyQuery &&
      mode === 'live_camera' &&
      cameraActive &&
      liveVideoRef.current
    ) {
      void assistiveVisionService
        .answerVisualQuestion(liveVideoRef.current, question)
        .then((visualReply) => {
          const finalReply =
            visualReply ??
            conversationService.answerQuestion(question, {
              mode,
              scenario: activeScenario,
              activeDetections,
              lastMessage: evaluation.generatedMessage,
              realGps,
            });
          appendHistory({
            sender: 'avicia',
            text: finalReply,
            source: visualReply ? 'real_video' : 'intent_engine',
            spoken: speechSettings.enabled,
          });
          speakText(finalReply);
        });
      return;
    }

    const answer = conversationService.answerQuestion(question, {
      mode,
      scenario: activeScenario,
      activeDetections,
      lastMessage: evaluation.generatedMessage,
      realGps,
    });

    appendHistory({
      sender: 'avicia',
      text: answer,
      source: 'intent_engine',
      spoken: speechSettings.enabled,
    });

    speakText(answer);
  };
  handleSendQuestionRef.current = handleSendQuestion;

  const handleToggleListening = () => {
    if (isListening) {
      stopListeningRef.current?.();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    stopListeningRef.current = speechService.startListening(
      (transcript) => {
        handleSendQuestion(transcript);
      },
      (errMsg) => {
        appendHistory({
          sender: 'system',
          text: errMsg,
          source: 'intent_engine',
        });
      },
      () => {
        setIsListening(false);
      }
    );
  };

  const startGuidedDemo = () => {
    speechService.cancel();
    setMode('simulation');
    setScenarioId(scenarios[0].id);
    setSimStepIndex(0);
    setDemoStepIndex(0);
    setDemoPaused(false);
    setDemoCompleted(false);
    setDemoActive(true);
    setMobileTab('vision');
    setEcosystemTab('core');
    setAndroidMenuOpen(false);
  };

  const stopGuidedDemo = () => {
    speechService.cancel();
    setIsSpeaking(false);
    setDemoActive(false);
    setDemoPaused(false);
    setDemoCompleted(false);
    setAndroidMenuOpen(false);
    if (isMobileExperience) {
      setMode('live_camera');
    }
  };

  const renderEnvironmentContent = () => (
    <div
      className={
        mode === 'live_camera'
          ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
          : 'space-y-2.5 overflow-x-hidden'
      }
    >
      {mode === 'simulation' && (
        <>
          {/* Compact Zero-Scroll Scenario Selector with Hamburger Trigger */}
          <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-xl bg-[#181c24] border border-[#3c494c]/40">
            <button
              type="button"
              onClick={() => cycleScenario(-1)}
              aria-label="Escenario anterior"
              className="p-1.5 rounded-lg hover:bg-[#262a33] text-[#bbc9cd]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAndroidMenuOpen(true)}
              className="flex-1 text-center text-xs font-semibold text-[#dfe2ee] truncate px-1"
            >
              {activeScenario.number}. {activeScenario.title}
            </button>
            <button
              type="button"
              onClick={() => cycleScenario(1)}
              aria-label="Siguiente escenario"
              className="p-1.5 rounded-lg hover:bg-[#262a33] text-[#bbc9cd]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <SimulatedSceneCanvas
            scenario={activeScenario}
            detections={simulatedDetections}
            selectedDetectionIds={evaluation.selectedDetectionIds}
            highlightedDetectionId={highlightedDetectionId}
            onSelectDetection={(id) =>
              setHighlightedDetectionId((prev) => (prev === id ? null : id))
            }
          />

          <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-[#181c24] border border-[#3c494c]/40">
            <p className="text-[11px] text-[#bbc9cd] flex-1 line-clamp-2 leading-snug">
              {activeScenario.description}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {activeScenario.steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSimPlaying((p) => !p)}
                  aria-label={simPlaying ? 'Pausar secuencia' : 'Reproducir secuencia'}
                  className="p-1.5 rounded-lg bg-[#262a33] hover:bg-[#31353e] border border-[#3c494c]/40 text-[#dfe2ee]"
                >
                  {simPlaying ? (
                    <PauseCircle className="w-4 h-4 text-[#ffb147]" />
                  ) : (
                    <PlayCircle className="w-4 h-4 text-[#8aebff]" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSimStepIndex(0);
                  setSimPlaying(false);
                  setHighlightedDetectionId(null);
                }}
                aria-label="Reiniciar escenario"
                className="p-1.5 rounded-lg bg-[#262a33] hover:bg-[#31353e] border border-[#3c494c]/40 text-[#dfe2ee]"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'vision_lab' && (
        <Suspense fallback={<div className="p-6 text-center text-xs text-slate-400">Cargando laboratorio de imagen...</div>}>
          <VisionLabPanel
            threshold={threshold}
            autoEscalateLowConfVlm={streetFeatures.autoEscalateLowConfVlm !== false}
            offlineVlmEnabled={Boolean(streetFeatures.offlineVlmEnabled)}
            onThresholdChange={setThreshold}
            onDetectionsReady={(dets) => setRealDetections(dets)}
            onSpeakDescription={(text) => {
              appendHistory({
                sender: 'avicia',
                text,
                source: 'real_image',
                spoken: true,
              });
              speakText(text);
            }}
          />
        </Suspense>
      )}

      {mode === 'video_lab' && (
        <Suspense fallback={<div className="p-6 text-center text-xs text-slate-400">Cargando laboratorio de video...</div>}>
          <VideoLabPanel
            threshold={threshold}
            onThresholdChange={setThreshold}
            onDetectionsReady={(dets) => setRealDetections(dets)}
            onSpeakDescription={(text) => {
              appendHistory({
                sender: 'avicia',
                text,
                source: 'real_video',
                spoken: true,
              });
              speakText(text);
            }}
          />
        </Suspense>
      )}

      {mode === 'live_camera' && (
        <LiveCameraPanel
          threshold={threshold}
          autoStart={autoStartCamera}
          expandedView
          fastMode={
            streetFeatures.streetMode ||
            streetFeatures.stereoSonar ||
            streetFeatures.soundOnlyMode
          }
          depthAnythingEnabled={streetFeatures.depthAnythingEnabled}
          architecturalVisionEnabled={streetFeatures.architecturalVisionEnabled}
          archModelVariant={streetFeatures.archModelVariant}
          showStixelOverlay={streetFeatures.showStixelOverlay}
          simplifiedControls={isNativeApp}
          detectorEngine={streetFeatures.detectorEngine}
          offlineVlmEnabled={Boolean(streetFeatures.offlineVlmEnabled)}
          preferredChannel={streetFeatures.activePreset === 'currency' ? 'currency' : 'explore'}
          presetSyncKey={presetSyncKey}
          banknoteTriggerCount={banknoteTriggerCount}
          onCameraStateChange={setCameraActive}
          onDetectionsReady={(dets) => setRealDetections(dets)}
          onPathClearChange={setPathClearConfirmed}
          onStixelGuidanceChange={(plan) => {
            stixelPlanRef.current = plan;
          }}
          onVideoElementChange={(el) => {
            liveVideoRef.current = el;
          }}
          onSpeakNow={(text) => {
            appendHistory({
              sender: 'avicia',
              text,
              source: 'real_video',
              spoken: true,
            });
            speakText(text);
          }}
        />
      )}
    </div>
  );

  const handleAcceptConsent = () => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted_v4');
    } catch {
      // Ignore storage errors
    }
    setConsentAccepted(true);
    setConsentModalOpen(false);
    speechService.unlockAudio();
  };

  return (
    <div className="h-[100dvh] lg:h-screen overflow-hidden bg-[#0f131c] text-[#dfe2ee] flex flex-col">
      <SafetyConsentModal
        open={consentModalOpen}
        canDismiss={consentAccepted}
        onAccept={handleAcceptConsent}
        onSpeakNotice={(text) => {
          speechService.unlockAudio();
          speakText(text);
        }}
      />
      {/* Desktop Telemetry Header (hidden on native Android app and mobile screens) */}
      {!isNativeApp && (
        <header className="hidden lg:block shrink-0 z-30 border-b border-[#3c494c]/40 bg-[#0a0e16]/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
          <div className="max-w-[1680px] mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center p-0.5 rounded-full bg-white border border-[#8aebff]/50 shadow-[0_0_15px_rgba(138,235,255,0.25)] shrink-0">
                  <AvisiaLogo className="w-10 h-10" variant="dark" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-[#8aebff] uppercase">
                      AVISIA
                    </h1>
                    <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#8aebff]/10 text-[#8aebff] border border-[#8aebff]/25 font-mono text-[10px] font-semibold">
                      v5.1.0 Neuronal
                    </span>
                  </div>
                  <p className="text-[11px] text-[#bbc9cd] leading-none mt-0.5">
                    Asistencia Visual Inteligente para Movilidad
                  </p>
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-[#3c494c]/50">
                <div className="bg-white/95 px-2.5 py-1 rounded-lg shadow-sm flex items-center">
                  <img
                    src="/uam-logo.png"
                    alt="Universidad Americana UAM"
                    className="h-6 w-auto object-contain"
                  />
                </div>
                <span className="font-mono text-[10px] text-[#bbc9cd] uppercase tracking-wider">
                  UAM Managua
                </span>
              </div>

              <div
                className={`hidden md:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full bg-[#181c24] border ${isOnline
                    ? 'border-[#4edea3]/25 shadow-[0_0_12px_rgba(78,222,163,0.12)]'
                    : 'border-amber-400/40'
                  }`}
              >
                {isOnline ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4edea3] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4edea3]" />
                  </span>
                ) : (
                  <WifiOff className="w-3 h-3 text-amber-300" aria-hidden="true" />
                )}
                <span
                  className={`font-mono text-[10px] font-semibold tracking-wide uppercase ${isOnline ? 'text-[#4edea3]' : 'text-amber-300'
                    }`}
                >
                  {!isOnline
                    ? 'Sin conexión · Modo local'
                    : demoActive
                      ? 'Demo Autónoma'
                      : cameraActive
                        ? 'Cámara En Vivo'
                        : 'En línea · Web IA'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setConsentModalOpen(true)}
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#262a33] hover:bg-[#31353e] text-[#bbc9cd] hover:text-white font-mono text-[10px] border border-[#3c494c]/40 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#4edea3] shrink-0" />
                <span>Seguridad y Privacidad · UAM</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (speechSettings.enabled) {
                    speechService.cancel();
                    setIsSpeaking(false);
                  }
                  setSpeechSettings((s) => ({ ...s, enabled: !s.enabled }));
                }}
                aria-label={speechSettings.enabled ? 'Silenciar audio' : 'Activar audio'}
                title={speechSettings.enabled ? 'Silenciar audio' : 'Activar audio'}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#262a33] hover:bg-[#31353e] text-[#bbc9cd] hover:text-white border border-[#3c494c]/40 transition-colors"
              >
                {speechSettings.enabled ? (
                  <Volume2 className="w-4 h-4 text-[#8aebff]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#ffb147]" />
                )}
              </button>

              <button
                type="button"
                onClick={startGuidedDemo}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#22d3ee] hover:bg-[#8aebff] active:scale-95 text-[#00363e] font-semibold text-xs transition-all shadow-[0_0_18px_rgba(34,211,238,0.35)]"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Iniciar Demo Autónoma
              </button>
            </div>
          </div>
        </header>
      )}

      {/* SPLIT-SCREEN ON DESKTOP, FULL-SCREEN NATIVE APP ON ANDROID/MOBILE */}
      <div
        className={`flex-1 min-h-0 w-full mx-auto flex flex-col lg:flex-row items-stretch ${isNativeApp ? 'p-0' : 'max-w-[1680px] lg:px-5 lg:py-3 lg:gap-4'
          }`}
      >
        {/* LEFT 30% ON DESKTOP / FULL-SCREEN ON ANDROID APP */}
        <aside
          aria-label="Vista móvil AVISIA"
          className={`w-full h-full flex flex-col items-center justify-center relative ${isNativeApp ? '' : 'lg:w-[32%] xl:w-[30%]'
            }`}
        >
          <div
            className={`w-full h-full flex flex-col relative ${isNativeApp
                ? ''
                : 'lg:rounded-[40px] lg:bg-slate-900 lg:p-[9px] lg:ring-1 lg:ring-white/15 lg:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)]'
              }`}
          >
            {/* Physical side hardware button accents (desktop simulator only) */}
            {!isNativeApp && (
              <>
                <div className="hidden lg:block absolute -left-[3px] top-24 w-[3px] h-9 bg-slate-700/70 rounded-l" />
                <div className="hidden lg:block absolute -left-[3px] top-36 w-[3px] h-11 bg-slate-700/70 rounded-l" />
                <div className="hidden lg:block absolute -right-[3px] top-28 w-[3px] h-12 bg-slate-700/70 rounded-r" />
              </>
            )}

            <div
              className={`w-full h-full flex flex-col bg-[#0f131c] text-[#dfe2ee] overflow-hidden relative ${isNativeApp ? '' : 'lg:rounded-[32px]'
                }`}
            >
              {/* Simulated Android Status Bar (desktop simulator only, never on real phone) */}
              {!isNativeApp && (
                <div className="hidden lg:flex items-center justify-between px-5 pt-2 pb-1 text-[10px] font-mono font-semibold text-[#bbc9cd] bg-[#0a0e16] select-none">
                  <span>10:42</span>
                  <div className="w-3.5 h-3.5 rounded-full bg-black border border-[#3c494c]/50 flex items-center justify-center" aria-hidden="true">
                    {cameraActive && <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[#bbc9cd]">
                    <span className="text-[9px] text-[#859397]">5G</span>
                    <Wifi className="w-3 h-3" />
                    <BatteryCharging className="w-3.5 h-3.5 text-[#4edea3]" />
                  </div>
                </div>
              )}

              {/* Minimalist Native Top AppBar with Visible Bluetooth & Audio Controls */}
              <div className="shrink-0 h-14 px-3 bg-[#181c24] border-b border-[#3c494c]/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setAndroidMenuOpen((o) => !o)}
                    aria-label="Menú principal"
                    aria-expanded={androidMenuOpen}
                    className="w-12 h-12 rounded-full bg-[#1c2028] hover:bg-[#262a33] text-[#dfe2ee] flex items-center justify-center transition-colors active:scale-95 shrink-0"
                  >
                    {androidMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-0.5 rounded-full bg-white border border-[#8aebff]/40 flex items-center justify-center shrink-0">
                      <AvisiaLogo className="w-7 h-7" variant="dark" />
                    </div>
                    <div className="flex flex-col leading-none min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-bold text-[#8aebff] tracking-tight">AVISIA</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-[#22d3ee]/15 border border-[#8aebff]/35 font-mono text-[9px] font-bold text-[#8aebff]">
                          v5.1.0
                        </span>
                        {!isOnline && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 font-mono text-[9px] font-bold text-amber-300">
                            Offline
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAndroidMenuOpen((o) => !o)}
                        className="text-left font-mono text-[11px] text-[#4edea3] font-semibold truncate py-0.5"
                      >
                        {mode === 'live_camera'
                          ? `Modo: ${getPresetById(streetFeatures.activePreset).shortTitle} ▾`
                          : mode === 'simulation'
                            ? `Escena ${activeScenario.number}: ${activeScenario.title} ▾`
                            : mode === 'vision_lab'
                              ? 'Laboratorio: Foto ▾'
                              : 'Laboratorio: Video ▾'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Dedicated Visible Bluetooth Button */}
                  <button
                    type="button"
                    aria-pressed={streetFeatures.headsetButton}
                    onClick={() => {
                      speechService.unlockAudio();
                      const next = !streetFeatures.headsetButton;
                      setStreetFeatures((prev) => ({ ...prev, headsetButton: next }));
                      speakText(next ? 'Bluetooth activado.' : 'Bluetooth desactivado.');
                    }}
                    aria-label={
                      streetFeatures.headsetButton
                        ? 'Desactivar botón Bluetooth'
                        : 'Activar botón Bluetooth'
                    }
                    className={`h-11 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold border transition-colors ${streetFeatures.headsetButton
                        ? 'bg-[#22d3ee]/20 border-[#22d3ee] text-[#8aebff]'
                        : 'bg-[#262a33] border-[#3c494c]/50 text-[#bbc9cd]'
                      }`}
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>{streetFeatures.headsetButton ? 'BT ON' : 'BT'}</span>
                  </button>

                  {/* Quick Sound Mute/Unmute */}
                  <button
                    type="button"
                    aria-pressed={!speechSettings.enabled}
                    onClick={() => {
                      speechService.unlockAudio();
                      if (speechSettings.enabled) {
                        speechService.cancel();
                        setIsSpeaking(false);
                      }
                      setSpeechSettings((s) => ({ ...s, enabled: !s.enabled }));
                    }}
                    aria-label={speechSettings.enabled ? 'Silenciar voz' : 'Activar voz'}
                    className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${speechSettings.enabled
                        ? 'bg-[#262a33] border-[#3c494c]/50 text-[#4edea3]'
                        : 'bg-[#93000a]/60 border-[#ffb4ab]/40 text-[#ffdad6]'
                      }`}
                  >
                    {speechSettings.enabled ? (
                      <Volume2 className="w-4 h-4" />
                    ) : (
                      <VolumeX className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Unified Human-Centered Hamburger Menu (Simple 1-Tap Modes & Scenes on both Web and Android) */}
              {androidMenuOpen && (
                <div className="absolute inset-x-0 top-[56px] bottom-[62px] z-40 bg-[#181c24]/98 backdrop-blur-md p-3.5 overflow-y-auto space-y-4 border-b border-[#3c494c]/40">
                  {/* 1. SELECCIÓN DE MODO DE USO EN VIVO (1 TOQUE CONFIGURA TODO) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-extrabold text-[#8aebff]">
                          1. Modos de Cámara en Vivo
                        </h2>
                        <p className="text-[11px] text-[#bbc9cd]">
                          Elige para qué vas a usar AVISIA; cada botón activa los modelos y el audio ideales.
                        </p>
                      </div>
                      {mode === 'live_camera' && cameraActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setAutoStartCamera(false);
                            setCameraActive(false);
                            setRealDetections([]);
                            setMode('simulation');
                            setAndroidMenuOpen(false);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6] text-[11px] font-bold shrink-0"
                        >
                          Apagar cámara
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {APP_PRESETS.map((preset) => {
                        const selected =
                          mode === 'live_camera' &&
                          (streetFeatures.activePreset ?? 'indoor') === preset.id;
                        const PresetIcon =
                          preset.id === 'indoor'
                            ? Home
                            : preset.id === 'street'
                              ? Footprints
                              : preset.id === 'currency'
                                ? Banknote
                                : preset.id === 'precision'
                                  ? Crosshair
                                  : BellOff;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              speechService.unlockAudio();
                              speechService.vibratePattern('confirm');
                              setStreetFeatures((prev) =>
                                applyAppPreset(prev, preset.id as AppPresetId)
                              );
                              setPresetSyncKey((k) => k + 1);
                              setDemoActive(false);
                              setMode('live_camera');
                              setMobileTab('vision');
                              setAutoStartCamera(true);
                              telemetryService.recordEvent({
                                type: 'preset_change',
                                detail: preset.id,
                                success: true,
                              });
                              setAndroidMenuOpen(false);
                              speakText(preset.spokenConfirm);
                            }}
                            className={`w-full p-3 rounded-2xl border text-left flex items-start gap-3 transition-all active:scale-[0.98] ${selected
                                ? 'bg-[#22d3ee]/16 border-[#22d3ee] shadow-md'
                                : 'bg-[#1c2028] border-[#3c494c]/50 hover:border-[#8aebff]/50'
                              }`}
                          >
                            <div
                              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${selected
                                  ? 'bg-[#22d3ee] text-[#00363e]'
                                  : 'bg-[#0f131c] text-[#8aebff]'
                                }`}
                            >
                              <PresetIcon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs sm:text-sm font-extrabold text-[#dfe2ee] truncate">
                                  {preset.title}
                                </span>
                                {selected ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4edea3]/20 text-[#4edea3] text-[10px] font-bold shrink-0">
                                    <Check className="w-3 h-3" />
                                    Activo
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-[#0f131c] text-[#8aebff] text-[10px] font-medium shrink-0">
                                    {preset.subtitle}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#bbc9cd] mt-1 leading-snug">
                                {preset.description}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {preset.includedSummary.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-md bg-[#0f131c]/90 border border-[#3c494c]/40 text-[10px] text-[#8aebff]"
                                  >
                                    ✓ {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. ESCENAS SIMULADAS DE MANAGUA Y DEMOSTRACIÓN GUIADA */}
                  <div className="pt-3 border-t border-[#3c494c]/40 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-extrabold text-[#8aebff]">
                          2. Escenas de Prueba (Managua)
                        </h2>
                        <p className="text-[11px] text-[#bbc9cd]">
                          Toca una escena para evaluar cómo responde AVISIA o inicia el recorrido guiado.
                        </p>
                      </div>
                    </div>

                    {demoActive ? (
                      <button
                        type="button"
                        onClick={stopGuidedDemo}
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        Detener Recorrido Guiado
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          speechService.unlockAudio();
                          startGuidedDemo();
                        }}
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Iniciar Recorrido Guiado Automático
                      </button>
                    )}

                    <div className="space-y-1.5">
                      {scenarios.map((s) => {
                        const isCurrentScene = mode === 'simulation' && s.id === activeScenario.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setDemoActive(false);
                              setMode('simulation');
                              setMobileTab('vision');
                              handleSelectScenario(s.id);
                            }}
                            className={`w-full p-2.5 rounded-xl text-left border flex items-center justify-between gap-2 transition-colors ${isCurrentScene
                                ? 'bg-[#22d3ee]/16 border-[#22d3ee] text-[#8aebff]'
                                : 'bg-[#1c2028] border-[#3c494c]/40 text-[#dfe2ee] hover:border-[#859397]'
                              }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                Escena {s.number}: {s.title}
                              </div>
                              <div className="text-[11px] text-[#bbc9cd] truncate">{s.subtitle}</div>
                            </div>
                            {isCurrentScene && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4edea3]/20 text-[#4edea3] text-[10px] font-bold shrink-0">
                                <Check className="w-3 h-3" />
                                Activa
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. LABORATORIO DE ARCHIVOS (SUBIR FOTO / VIDEO) Y SEGURIDAD */}
                  <div className="pt-3 border-t border-[#3c494c]/40 space-y-2">
                    <div className="text-xs font-extrabold text-[#8aebff]">
                      3. Evaluar con Foto o Video Guardado
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleModeChange('vision_lab')}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${mode === 'vision_lab'
                            ? 'bg-[#4edea3]/20 border-[#4edea3] text-[#6ffbbe]'
                            : 'bg-[#1c2028] border-[#3c494c]/50 text-[#dfe2ee]'
                          }`}
                      >
                        <FlaskConical className="w-4 h-4 shrink-0" />
                        Subir Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('video_lab')}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${mode === 'video_lab'
                            ? 'bg-[#22d3ee]/20 border-[#22d3ee] text-[#8aebff]'
                            : 'bg-[#1c2028] border-[#3c494c]/50 text-[#dfe2ee]'
                          }`}
                      >
                        <Film className="w-4 h-4 shrink-0" />
                        Subir Video
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAndroidMenuOpen(false);
                        setConsentModalOpen(true);
                      }}
                      className="w-full min-h-[42px] py-2 px-3 rounded-xl bg-[#0f131c] border border-[#3c494c]/60 text-[#bbc9cd] font-semibold text-xs flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#4edea3]" />
                      Aviso de Seguridad y Privacidad · UAM
                    </button>
                  </div>

                  {/* 4. AJUSTES TÉCNICOS AVANZADOS (COLAPSADOS POR DEFECTO PARA NO CONFUNDIR) */}
                  {!isNativeApp && (
                    <div className="pt-2 border-t border-[#3c494c]/30">
                      <button
                        type="button"
                        aria-expanded={showAdvancedTech}
                        onClick={() => setShowAdvancedTech((v) => !v)}
                        className="w-full py-2 px-3 rounded-xl bg-[#0f131c] border border-[#3c494c]/40 text-[11px] font-semibold text-[#859397] hover:text-[#dfe2ee] flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-[#8aebff]" />
                          Ajustes técnicos manuales (se configuran solos con el modo)
                        </span>
                        <span>{showAdvancedTech ? 'Ocultar ▲' : 'Mostrar ▼'}</span>
                      </button>

                      {showAdvancedTech && (
                        <div className="mt-2 p-3 rounded-2xl border border-[#3c494c]/40 bg-[#141821] space-y-2.5">
                          <div className="space-y-1">
                            <span className="text-[10px] text-[#bbc9cd] block">
                              Motor detector neuronal:
                            </span>
                            <div className="grid grid-cols-3 gap-1">
                              {(
                                [
                                  { id: 'dfine_s_obj365', label: 'Obj365 · 366cl' },
                                  { id: 'dfine_n', label: 'D-FINE-N · 43%' },
                                  { id: 'dfine_s', label: 'D-FINE-S · 49%' },
                                  { id: 'yolov10n', label: 'YOLOv10n' },
                                  { id: 'efficientdet_lite2', label: 'Lite2 · 34%' },
                                  { id: 'efficientdet_lite0', label: 'Lite0 Ráp.' },
                                ] as Array<{ id: DetectorEngineId; label: string }>
                              ).map((eng) => {
                                const selected = streetFeatures.detectorEngine === eng.id;
                                return (
                                  <button
                                    key={eng.id}
                                    type="button"
                                    onClick={() =>
                                      setStreetFeatures((prev) => ({
                                        ...prev,
                                        detectorEngine: eng.id,
                                      }))
                                    }
                                    className={`py-1.5 px-1.5 rounded-lg text-[10px] font-bold border transition-colors ${selected
                                        ? 'bg-[#22d3ee] text-[#00363e] border-[#22d3ee]'
                                        : 'bg-[#0f131c] text-[#bbc9cd] border-[#3c494c]/50'
                                      }`}
                                  >
                                    {eng.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1">
                            {(
                              [
                                { id: 'essential', label: 'Voz: Esencial (Tranquilo)' },
                                { id: 'detailed', label: 'Voz: Detallada' },
                              ] as Array<{ id: AudioVerbosity; label: string }>
                            ).map((opt) => {
                              const selected = streetFeatures.audioVerbosity === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    setStreetFeatures((prev) => ({
                                      ...prev,
                                      audioVerbosity: opt.id,
                                    }))
                                  }
                                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border ${selected
                                      ? 'bg-[#4edea3] text-[#003824] border-[#4edea3]'
                                      : 'bg-[#0f131c] text-[#bbc9cd] border-[#3c494c]/50'
                                    }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>

                          {(
                            [
                              {
                                key: 'architecturalVisionEnabled',
                                label: 'Puertas, paredes y piso libre (SegFormer)',
                              },
                              {
                                key: 'depthAnythingEnabled',
                                label: 'Profundidad 3D (Depth Anything V2)',
                              },
                              {
                                key: 'showStixelOverlay',
                                label: 'Barras visuales de espacio libre (10h..2h)',
                              },
                              {
                                key: 'clockFaceDirections',
                                label: 'Direcciones tipo reloj (a las 10 / 12 / 2)',
                              },
                              {
                                key: 'stereoSonar',
                                label: 'Sonar direccional (Izquierda / Centro / Derecha)',
                              },
                              {
                                key: 'soundOnlyMode',
                                label: 'Solo sonidos y vibración (sin voz)',
                              },
                              {
                                key: 'handsFreeWakeWord',
                                label: 'Comando manos libres ("Oye Avisia")',
                              },
                            ] as const
                          ).map((item) => {
                            const enabled = Boolean(streetFeatures[item.key]);
                            return (
                              <button
                                key={item.key}
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                onClick={() =>
                                  setStreetFeatures((prev) => ({
                                    ...prev,
                                    [item.key]: !prev[item.key],
                                  }))
                                }
                                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0f131c] border border-[#3c494c]/40 text-left"
                              >
                                <span className="text-[11px] font-medium text-[#dfe2ee]">
                                  {item.label}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${enabled
                                      ? 'bg-[#4edea3]/20 text-[#4edea3]'
                                      : 'bg-[#262a33] text-[#859397]'
                                    }`}
                                >
                                  {enabled ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Android Viewport (Zero Scroll on Main Vision Screen) */}
              <div
                className={`flex-1 min-h-0 px-3 py-2 ${mobileTab === 'vision'
                    ? 'flex flex-col overflow-hidden'
                    : 'overflow-y-auto overflow-x-hidden space-y-2.5'
                  }`}
              >
                {mobileTab === 'vision' && (
                  <div className="flex-1 min-h-0 flex flex-col gap-2">
                    {isMobileExperience && demoActive && (
                      <div className="shrink-0 px-3 py-2 rounded-xl bg-[#22d3ee]/15 border border-[#22d3ee]/50 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#8aebff] truncate">
                          Demo Autónoma activa
                        </span>
                        <button
                          type="button"
                          onClick={stopGuidedDemo}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6] font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          Detener Demo
                        </button>
                      </div>
                    )}

                    {evaluation.obstacleAlert && (
                      <div
                        role="alert"
                        className={`shrink-0 px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${evaluation.obstacleAlert.zone === 'front_close'
                            ? 'bg-[#93000a]/85 border-[#ffb4ab]/40 text-[#ffdad6]'
                            : 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                          }`}
                      >
                        <ShieldAlert
                          className={`w-4 h-4 shrink-0 ${evaluation.obstacleAlert.zone === 'front_close'
                              ? 'text-[#ffb4ab]'
                              : 'text-amber-300'
                            }`}
                        />
                        <span className="font-semibold truncate">{evaluation.obstacleAlert.message}</span>
                      </div>
                    )}

                    <div className="flex-1 min-h-0 flex flex-col">
                      {renderEnvironmentContent()}
                    </div>

                    {/* Minimalist Accessible Voice Bar (TalkBack-safe: avoids double narration when AVISIA TTS is enabled) */}
                    <div className="shrink-0 p-2.5 rounded-2xl bg-[#1c2028] border border-[#3c494c]/30 space-y-2">
                      <div
                        role="status"
                        aria-live={speechSettings.enabled ? 'off' : 'polite'}
                        className="px-2.5 py-2 rounded-xl bg-[#181c24] border border-[#3c494c]/25"
                      >
                        <p className="text-sm text-[#dfe2ee] font-medium leading-snug line-clamp-2">
                          {evaluation.generatedMessage}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            speechService.unlockAudio();
                            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                              navigator.vibrate([80, 50, 80]);
                            }
                            handleSpeakCurrent();
                          }}
                          className="h-12 px-3 rounded-full bg-[#31353e] hover:bg-[#353942] text-[#dfe2ee] flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-all"
                        >
                          <Volume2 className="w-5 h-5 text-[#8aebff]" />
                          Repetir
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            speechService.unlockAudio();
                            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                              navigator.vibrate(120);
                            }
                            setMobileTab('assistant');
                          }}
                          className="h-12 px-3 rounded-full bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-all shadow-md"
                        >
                          <MessageSquare className="w-5 h-5" />
                          Consultar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {mobileTab === 'assistant' && (
                  <VoiceAssistantPanel
                    isSpeaking={isSpeaking}
                    isListening={isListening}
                    lastMessage={evaluation.generatedMessage}
                    history={history}
                    speechSettings={speechSettings}
                    availableVoices={availableVoices}
                    recognitionSupported={speechService.isRecognitionSupported()}
                    onSpeakCurrent={handleSpeakCurrent}
                    onRepeatLast={handleRepeatLast}
                    onCancelSpeech={handleCancelSpeech}
                    onToggleMute={() => {
                      if (speechSettings.enabled) {
                        speechService.cancel();
                        setIsSpeaking(false);
                      }
                      setSpeechSettings((s) => ({ ...s, enabled: !s.enabled }));
                    }}
                    onChangeRate={(rate) => setSpeechSettings((s) => ({ ...s, rate }))}
                    onChangeVoice={(voiceURI) =>
                      setSpeechSettings((s) => ({ ...s, voiceURI: voiceURI || null }))
                    }
                    onSendQuestion={handleSendQuestion}
                    onToggleListening={handleToggleListening}
                  />
                )}

                {mobileTab === 'analysis' && (
                  <ProcessingPanel
                    mode={mode}
                    detections={activeDetections}
                    policy={policy}
                    evaluation={evaluation}
                    highlightedDetectionId={highlightedDetectionId}
                    detectorModelName={detectorService.getStatus().modelName}
                    onChangePolicy={setPolicy}
                    onHighlightDetection={setHighlightedDetectionId}
                  />
                )}

                {mobileTab === 'map' && (
                  <Suspense fallback={<div className="p-6 text-center text-xs text-slate-400">Cargando mapa GPS...</div>}>
                    <ManaguaWazeMobile
                      scenario={activeScenario}
                      realGps={realGps}
                      gpsActive={gpsActive}
                      gpsLoading={gpsLoading}
                      gpsError={gpsError}
                      onToggleGps={handleToggleGps}
                      onSpeakText={(text) => {
                        appendHistory({
                          sender: 'avicia',
                          text,
                          source: 'simulated',
                          spoken: true,
                        });
                        speakText(text);
                      }}
                    />
                  </Suspense>
                )}
              </div>

              {/* Android Material 3 Bottom Navigation + Gesture Pill (Stitch Dark Mode) */}
              <nav
                aria-label="Navegación Android"
                className="border-t border-[#3c494c]/30 bg-[#1c2028]/95 backdrop-blur-xl px-2 pt-1.5 pb-1"
              >
                <div className="grid grid-cols-4">
                  <button
                    type="button"
                    aria-current={mobileTab === 'vision' ? 'page' : undefined}
                    onClick={() => {
                      setMobileTab('vision');
                      setAndroidMenuOpen(false);
                    }}
                    className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 py-0.5"
                  >
                    <span
                      className={`px-3.5 py-1 rounded-full transition-colors ${mobileTab === 'vision'
                          ? 'bg-[#22d3ee] text-[#005763]'
                          : 'text-[#bbc9cd]'
                        }`}
                    >
                      <Eye className="w-4 h-4" />
                    </span>
                    <span
                      className={`font-mono text-[10px] ${mobileTab === 'vision' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                        }`}
                    >
                      Visión
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-current={mobileTab === 'assistant' ? 'page' : undefined}
                    onClick={() => {
                      setMobileTab('assistant');
                      setAndroidMenuOpen(false);
                    }}
                    className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 py-0.5"
                  >
                    <span
                      className={`px-3.5 py-1 rounded-full transition-colors ${mobileTab === 'assistant'
                          ? 'bg-[#22d3ee] text-[#005763]'
                          : 'text-[#bbc9cd]'
                        }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </span>
                    <span
                      className={`font-mono text-[10px] ${mobileTab === 'assistant' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                        }`}
                    >
                      Asistente
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-current={mobileTab === 'analysis' ? 'page' : undefined}
                    onClick={() => {
                      setMobileTab('analysis');
                      setAndroidMenuOpen(false);
                    }}
                    className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 py-0.5"
                  >
                    <span
                      className={`px-3.5 py-1 rounded-full transition-colors ${mobileTab === 'analysis'
                          ? 'bg-[#22d3ee] text-[#005763]'
                          : 'text-[#bbc9cd]'
                        }`}
                    >
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <span
                      className={`font-mono text-[10px] ${mobileTab === 'analysis' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                        }`}
                    >
                      Telemetría
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-current={mobileTab === 'map' ? 'page' : undefined}
                    onClick={() => {
                      setMobileTab('map');
                      setEcosystemTab('map');
                      setAndroidMenuOpen(false);
                      if (!gpsActive && locationService.isGeolocationSupported()) {
                        handleToggleGps();
                      }
                    }}
                    className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 py-0.5"
                  >
                    <span
                      className={`px-3.5 py-1 rounded-full transition-colors ${mobileTab === 'map'
                          ? 'bg-[#22d3ee] text-[#005763]'
                          : 'text-[#bbc9cd]'
                        }`}
                    >
                      <MapPin className="w-4 h-4" />
                    </span>
                    <span
                      className={`font-mono text-[10px] ${mobileTab === 'map' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                        }`}
                    >
                      GPS Managua
                    </span>
                  </button>
                </div>
                <div className="flex justify-center pt-1.5 pb-0.5">
                  <div className="w-24 h-1 rounded-full bg-[#3c494c]" />
                </div>
              </nav>
            </div>
          </div>
        </aside>

        {/* RIGHT 70%: DESKTOP TELEMETRY ECOSYSTEM (hidden on native Android app and mobile screens) */}
        {!isNativeApp && (
          <main className="hidden lg:flex w-full lg:w-[68%] xl:w-[70%] lg:h-full flex-col gap-3 min-h-0">
            <div className="shrink-0">
              <GuidedDemoBanner
                active={demoActive}
                paused={demoPaused}
                completed={demoCompleted}
                stepIndex={demoStepIndex}
                onPauseToggle={() => setDemoPaused((p) => !p)}
                onRestart={startGuidedDemo}
                onExit={() => {
                  speechService.cancel();
                  setDemoActive(false);
                }}
              />
            </div>

            {/* Stitch Telemetry Console Mode & Ecosystem View Switcher */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-[#181c24] border border-[#3c494c]/40 shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleModeChange('simulation')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${mode === 'simulation'
                      ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Escenas
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('vision_lab')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${mode === 'vision_lab'
                      ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Imagen IA
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('video_lab')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${mode === 'video_lab'
                      ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  Video IA
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('live_camera')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${mode === 'live_camera'
                      ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  Cámara
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-[#0a0e16] p-1 rounded-lg border border-[#3c494c]/40">
                <button
                  type="button"
                  onClick={() => setEcosystemTab('core')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${ecosystemTab === 'core'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Núcleo en Vivo
                </button>
                <button
                  type="button"
                  onClick={() => setEcosystemTab('pipeline')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${ecosystemTab === 'pipeline'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Cómo Piensa
                </button>
                <button
                  type="button"
                  onClick={() => setEcosystemTab('map')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${ecosystemTab === 'map'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Mapa Managua
                </button>
                <button
                  type="button"
                  onClick={() => setEcosystemTab('tech')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${ecosystemTab === 'tech'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Técnico
                </button>
              </div>
            </div>

            {/* Active Ecosystem Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {ecosystemTab === 'core' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 h-full items-stretch">
                  <div className="xl:col-span-5 h-full min-h-0">
                    <VoiceAssistantPanel
                      isSpeaking={isSpeaking}
                      isListening={isListening}
                      lastMessage={evaluation.generatedMessage}
                      history={history}
                      speechSettings={speechSettings}
                      availableVoices={availableVoices}
                      recognitionSupported={speechService.isRecognitionSupported()}
                      onSpeakCurrent={handleSpeakCurrent}
                      onRepeatLast={handleRepeatLast}
                      onCancelSpeech={handleCancelSpeech}
                      onToggleMute={() => {
                        if (speechSettings.enabled) {
                          speechService.cancel();
                          setIsSpeaking(false);
                        }
                        setSpeechSettings((s) => ({ ...s, enabled: !s.enabled }));
                      }}
                      onChangeRate={(rate) => setSpeechSettings((s) => ({ ...s, rate }))}
                      onChangeVoice={(voiceURI) =>
                        setSpeechSettings((s) => ({ ...s, voiceURI: voiceURI || null }))
                      }
                      onSendQuestion={handleSendQuestion}
                      onToggleListening={handleToggleListening}
                    />
                  </div>

                  <div className="xl:col-span-7 h-full min-h-0">
                    <ProcessingPanel
                      mode={mode}
                      detections={activeDetections}
                      policy={policy}
                      evaluation={evaluation}
                      highlightedDetectionId={highlightedDetectionId}
                      detectorModelName={detectorService.getStatus().modelName}
                      onChangePolicy={setPolicy}
                      onHighlightDetection={setHighlightedDetectionId}
                    />
                  </div>
                </div>
              )}

              {ecosystemTab === 'pipeline' && (
                <Suspense fallback={<div className="p-6 text-center text-xs text-slate-400">Cargando arquitectura...</div>}>
                  <PipelineSection mode={mode} />
                </Suspense>
              )}

              {ecosystemTab === 'map' && (
                <Suspense fallback={<div className="p-6 text-center text-xs text-slate-400">Cargando mapa de Managua...</div>}>
                  <ManaguaMapSection
                    scenario={activeScenario}
                    realGps={realGps}
                    gpsActive={gpsActive}
                    gpsLoading={gpsLoading}
                    gpsError={gpsError}
                    onToggleGps={handleToggleGps}
                    onSpeakText={(text) => {
                      appendHistory({
                        sender: 'avicia',
                        text,
                        source: 'simulated',
                        spoken: true,
                      });
                      speakText(text);
                    }}
                  />
                </Suspense>
              )}

              {ecosystemTab === 'tech' && (
                <Suspense fallback={<div className="p-6 text-center text-xs text-slate-400">Cargando consola técnica y piloto...</div>}>
                  <TechnicalDetailsSection
                    mode={mode}
                    policy={policy}
                    cameraActive={cameraActive}
                    detectorStatus={detectorService.getStatus()}
                    speechSupported={speechService.isSynthesisSupported()}
                  />
                </Suspense>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
