import { useEffect, useMemo, useRef, useState } from 'react';
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
  BatteryCharging,
  ShieldAlert,
  GitBranch,
  Cpu,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Power,
  Bluetooth,
} from 'lucide-react';
import type {
  ConversationMessage,
  Detection,
  DetectorEngineId,
  OperationMode,
  PolicyEvaluation,
  PolicyType,
  SpeechSettings,
  StreetAssistFeatures,
} from './types/avicia';
import { scenarioManager } from './services/ScenarioManager';
import { simulationEngine } from './services/SimulationEngine';
import { messagePolicy } from './services/MessagePolicy';
import { speechService } from './services/SpeechService';
import { conversationService } from './services/ConversationService';
import { detectorService } from './services/DetectorService';
import { assistiveVisionService } from './services/AssistiveVisionService';
import { locationService, type RealGpsPosition } from './services/LocationService';
import { SimulatedSceneCanvas } from './components/SimulatedSceneCanvas';
import { VisionLabPanel } from './components/VisionLabPanel';
import { VideoLabPanel } from './components/VideoLabPanel';
import { LiveCameraPanel } from './components/LiveCameraPanel';
import { ProcessingPanel } from './components/ProcessingPanel';
import { VoiceAssistantPanel } from './components/VoiceAssistantPanel';
import { PipelineSection } from './components/PipelineModal';
import { ManaguaMapSection, ManaguaWazeMobile } from './components/ManaguaMapModal';
import { TechnicalDetailsSection } from './components/TechnicalDetailsModal';
import { DEMO_STEPS, GuidedDemoBanner } from './components/GuidedDemoBanner';
import { AvisiaLogo } from './components/AvisiaLogo';

const SETTINGS_STORAGE_KEY = 'avicia_simulator_settings_v1';
const STREET_FEATURES_STORAGE_KEY = 'avicia_street_features_v1';

const DEFAULT_STREET_FEATURES: StreetAssistFeatures = {
  streetMode: false,
  stereoSonar: false,
  soundOnlyMode: false,
  handsFreeWakeWord: false,
  headsetButton: false,
  depthAnythingEnabled: false,
  architecturalVisionEnabled: true,
  detectorEngine: 'efficientdet_lite2',
  clockFaceDirections: true,
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
  const [autoStartCamera, setAutoStartCamera] = useState<boolean>(false);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>(() =>
    assistiveVisionService.getGeminiApiKey()
  );
  const [geminiKeySaved, setGeminiKeySaved] = useState<boolean>(() =>
    assistiveVisionService.hasGeminiApiKey()
  );

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
      wasPathClearRef.current = false;
      setPathClearConfirmed(false);
      speechService.cancel();
      setIsSpeaking(false);
      return;
    }

    const alert = evaluation.obstacleAlert;
    const alertKey = alert ? `${alert.labelEs}-${alert.zone}` : null;

    if (alert && alertKey && alertKey !== lastChimedObstacleRef.current && speechSettings.enabled) {
      lastChimedObstacleRef.current = alertKey;
      speechService.playObstacleChime();

      // Urgent obstacle alerts always speak right after the chime (unless soundOnlyMode is active)
      if (
        !demoActive &&
        !streetFeatures.soundOnlyMode &&
        ((mode === 'live_camera' && cameraActive) || mode === 'video_lab')
      ) {
        if (obstacleSpeakTimerRef.current !== null) {
          window.clearTimeout(obstacleSpeakTimerRef.current);
        }
        const msgToSpeak = alert.message;
        obstacleSpeakTimerRef.current = window.setTimeout(() => {
          lastAutoSpokenAtRef.current = Date.now();
          lastSpokenLiveMsgRef.current = { text: msgToSpeak, at: Date.now() };
          appendHistory({
            sender: 'avicia',
            text: msgToSpeak,
            source: 'real_video',
            spoken: true,
          });
          speakText(msgToSpeak);
        }, 240);
      }
    } else if (!alertKey) {
      lastChimedObstacleRef.current = null;
    }
  }, [evaluation.obstacleAlert, speechSettings.enabled, mode, cameraActive, demoActive]);

  useEffect(() => {
    return () => {
      if (obstacleSpeakTimerRef.current !== null) {
        window.clearTimeout(obstacleSpeakTimerRef.current);
      }
    };
  }, []);

  // Auto-speak general (non-obstacle) detections in Live Camera and Video modes
  useEffect(() => {
    const isLiveStreamMode =
      (mode === 'live_camera' && cameraActive) || mode === 'video_lab';
    if (!isLiveStreamMode || !speechSettings.enabled || demoActive || streetFeatures.soundOnlyMode)
      return;
    if (realDetections.length === 0 || evaluation.obstacleAlert || isSpeaking) return;

    const now = Date.now();
    const cooldownMs = streetFeatures.streetMode ? 1800 : 4200;
    if (now - lastAutoSpokenAtRef.current < cooldownMs) return;

    const lastMsg = lastSpokenLiveMsgRef.current;
    if (lastMsg && lastMsg.text === evaluation.generatedMessage && now - lastMsg.at < 7000) {
      return;
    }

    lastAutoSpokenAtRef.current = now;
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
    isSpeaking,
    demoActive,
  ]);

  // Verified "Camino despejado" spoken confirmation & calm periodic reassurance
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

    const announceClear = (phrase: string) => {
      const now = Date.now();
      if (now - lastClearSpokenAtRef.current < 4500) return;
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

    if (!wasPathClearRef.current && !isSpeaking) {
      wasPathClearRef.current = true;
      announceClear('Camino despejado al frente.');
    }

    const timer = window.setInterval(() => {
      if (!isSpeaking) {
        announceClear('Camino despejado.');
      }
    }, 9000);

    return () => window.clearInterval(timer);
  }, [
    mode,
    cameraActive,
    pathClearConfirmed,
    demoActive,
    speechSettings.enabled,
    streetFeatures.soundOnlyMode,
    isSpeaking,
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
  const handleSendQuestionRef = useRef<(q: string) => void>(() => {});
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
    appendHistory({
      sender: 'user',
      text: question,
      source: 'intent_engine',
    });

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
      liveVideoRef.current &&
      assistiveVisionService.hasGeminiApiKey()
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
        <VisionLabPanel
          threshold={threshold}
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
      )}

      {mode === 'video_lab' && (
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
          detectorEngine={streetFeatures.detectorEngine}
          onCameraStateChange={setCameraActive}
          onDetectionsReady={(dets) => setRealDetections(dets)}
          onPathClearChange={setPathClearConfirmed}
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

  return (
    <div className="h-[100dvh] lg:h-screen overflow-hidden bg-[#0f131c] text-[#dfe2ee] flex flex-col">
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
                    v3.1 Asistiva
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

            <div className="hidden md:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full bg-[#181c24] border border-[#4edea3]/25 shadow-[0_0_12px_rgba(78,222,163,0.12)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4edea3] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4edea3]" />
              </span>
              <span className="font-mono text-[10px] text-[#4edea3] font-semibold tracking-wide uppercase">
                {demoActive ? 'Demo Autónoma' : cameraActive ? 'Cámara En Vivo' : 'En línea · Web IA'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#262a33] text-[#bbc9cd] font-mono text-[10px]">
              <ShieldAlert className="w-3.5 h-3.5 text-[#ffb147] shrink-0" />
              <span>Prototipo académico · UAM Managua</span>
            </div>

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
        className={`flex-1 min-h-0 w-full mx-auto flex flex-col lg:flex-row items-stretch ${
          isNativeApp ? 'p-0' : 'max-w-[1680px] lg:px-5 lg:py-3 lg:gap-4'
        }`}
      >
        {/* LEFT 30% ON DESKTOP / FULL-SCREEN ON ANDROID APP */}
        <aside
          aria-label="Vista móvil AVISIA"
          className={`w-full h-full flex flex-col items-center justify-center relative ${
            isNativeApp ? '' : 'lg:w-[32%] xl:w-[30%]'
          }`}
        >
          <div
            className={`w-full h-full flex flex-col relative ${
              isNativeApp
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
              className={`w-full h-full flex flex-col bg-[#0f131c] text-[#dfe2ee] overflow-hidden relative ${
                isNativeApp ? '' : 'lg:rounded-[32px]'
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
                    className="w-11 h-11 rounded-full bg-[#1c2028] hover:bg-[#262a33] text-[#dfe2ee] flex items-center justify-center transition-colors active:scale-95 shrink-0"
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
                          v3.1
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#bbc9cd] truncate">UAM Managua</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Dedicated Visible Bluetooth Button */}
                  <button
                    type="button"
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
                    className={`h-10 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold border transition-colors ${
                      streetFeatures.headsetButton
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
                    onClick={() => {
                      speechService.unlockAudio();
                      if (speechSettings.enabled) {
                        speechService.cancel();
                        setIsSpeaking(false);
                      }
                      setSpeechSettings((s) => ({ ...s, enabled: !s.enabled }));
                    }}
                    aria-label={speechSettings.enabled ? 'Silenciar voz' : 'Activar voz'}
                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                      speechSettings.enabled
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

            {/* Android Hamburger Drawer Overlay (Stitch Dark Material 3) */}
            {androidMenuOpen && (
              <div className="absolute inset-x-0 top-[76px] bottom-[62px] z-40 bg-[#181c24]/98 backdrop-blur-md p-3.5 overflow-y-auto space-y-4 border-b border-[#3c494c]/40">
                {/* Primera opción: Activar / Desactivar AVISIA (Cámara en vivo) */}
                <div
                  className={`p-3 rounded-2xl border transition-colors ${
                    mode === 'live_camera'
                      ? 'bg-[#4edea3]/12 border-[#4edea3]/60'
                      : 'bg-[#22d3ee]/10 border-[#22d3ee]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#dfe2ee] flex items-center gap-1.5">
                        <Power
                          className={`w-4 h-4 ${
                            mode === 'live_camera' ? 'text-[#4edea3]' : 'text-[#8aebff]'
                          }`}
                        />
                        {mode === 'live_camera' ? 'AVISIA Activo' : 'Activar AVISIA'}
                      </div>
                      <p className="text-[11px] text-[#bbc9cd] mt-0.5">
                        {mode === 'live_camera'
                          ? 'Cámara en vivo y alertas de voz activas'
                          : 'Inicia la cámara en pantalla amplia con alertas de voz'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'live_camera') {
                          setAutoStartCamera(false);
                          setCameraActive(false);
                          setRealDetections([]);
                          setMode('simulation');
                          setAndroidMenuOpen(false);
                        } else {
                          setAutoStartCamera(true);
                          setMode('live_camera');
                          setMobileTab('vision');
                          setAndroidMenuOpen(false);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
                        mode === 'live_camera'
                          ? 'bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6]'
                          : 'bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e]'
                      }`}
                    >
                      {mode === 'live_camera' ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>

                {/* Botón de Demo Autónoma (siempre accesible en móvil y app Android) */}
                {isMobileExperience && (
                  demoActive ? (
                    <button
                      type="button"
                      onClick={stopGuidedDemo}
                      className="w-full py-3 px-4 rounded-2xl bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6] font-bold text-sm flex items-center justify-center gap-2 shadow-md"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      Detener Demo Autónoma
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        speechService.unlockAudio();
                        startGuidedDemo();
                      }}
                      className="w-full py-3 px-4 rounded-2xl bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] font-bold text-sm flex items-center justify-center gap-2 shadow-md"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Iniciar Demo Autónoma
                    </button>
                  )
                )}

                {/* v3.0 · Motor de Visión e IA Multimodal (Be My AI / Seeing AI) */}
                <div className="p-3 rounded-2xl border border-[#22d3ee]/40 bg-[#1c2028] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#8aebff]">
                      v3.0 · Precisión de Visión IA
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#22d3ee]/15 text-[#8aebff]">
                      {geminiKeySaved ? 'Gemini IA ON' : '100% Local'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-[#bbc9cd] block">
                      Motor detector en tiempo real:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'efficientdet_lite2', label: 'Lite2 · 34%' },
                          { id: 'yolov10n', label: 'YOLOv10n' },
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
                            className={`py-1.5 px-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                              selected
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

                  <button
                    type="button"
                    role="switch"
                    aria-checked={streetFeatures.architecturalVisionEnabled}
                    onClick={() =>
                      setStreetFeatures((prev) => ({
                        ...prev,
                        architecturalVisionEnabled: !prev.architecturalVisionEnabled,
                      }))
                    }
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0f131c] border border-[#3c494c]/40 text-left"
                  >
                    <span className="text-[11px] font-medium text-[#dfe2ee]">
                      Puertas, cortinas y piso libre (SegFormer)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        streetFeatures.architecturalVisionEnabled
                          ? 'bg-[#4edea3]/20 text-[#4edea3]'
                          : 'bg-[#262a33] text-[#859397]'
                      }`}
                    >
                      {streetFeatures.architecturalVisionEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={streetFeatures.clockFaceDirections}
                    onClick={() =>
                      setStreetFeatures((prev) => ({
                        ...prev,
                        clockFaceDirections: !prev.clockFaceDirections,
                      }))
                    }
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0f131c] border border-[#3c494c]/40 text-left"
                  >
                    <span className="text-[11px] font-medium text-[#dfe2ee]">
                      Posición tipo reloj (a las 10 / 12 / 2)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        streetFeatures.clockFaceDirections
                          ? 'bg-[#4edea3]/20 text-[#4edea3]'
                          : 'bg-[#262a33] text-[#859397]'
                      }`}
                    >
                      {streetFeatures.clockFaceDirections ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <div className="space-y-1.5 pt-1 border-t border-[#3c494c]/30">
                    <label
                      htmlFor="gemini-key-input"
                      className="text-[10px] text-[#bbc9cd] block leading-snug"
                    >
                      Clave API Gemini Flash (opcional, gratis en AI Studio — desbloquea puertas, gradas, paredes y OCR exacto estilo Be My AI):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="gemini-key-input"
                        type="password"
                        value={geminiKeyInput}
                        onChange={(e) => setGeminiKeyInput(e.target.value)}
                        placeholder="AIza..."
                        className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-[#0f131c] border border-[#3c494c]/50 text-xs text-[#dfe2ee]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          assistiveVisionService.setGeminiApiKey(geminiKeyInput);
                          setGeminiKeySaved(assistiveVisionService.hasGeminiApiKey());
                        }}
                        className="h-8 px-2.5 rounded-lg bg-[#4edea3] text-[#003824] font-bold text-[11px] shrink-0"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                </div>

                {/* v2.5 · Modo Calle y Manos Libres (Interruptores opcionales) */}
                <div className="p-3 rounded-2xl border border-[#3c494c]/40 bg-[#1c2028] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#8aebff]">
                      v2.5 · Modo Calle (Arnés)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const anyOn =
                          streetFeatures.streetMode ||
                          streetFeatures.stereoSonar ||
                          streetFeatures.soundOnlyMode ||
                          streetFeatures.handsFreeWakeWord ||
                          streetFeatures.headsetButton ||
                          streetFeatures.depthAnythingEnabled;
                        setStreetFeatures((prev) => ({
                          ...prev,
                          streetMode: !anyOn,
                          stereoSonar: !anyOn,
                          soundOnlyMode: !anyOn,
                          handsFreeWakeWord: !anyOn,
                          headsetButton: !anyOn,
                          depthAnythingEnabled: !anyOn,
                        }));
                      }}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#262a33] text-[#4edea3] hover:bg-[#31353e]"
                    >
                      {streetFeatures.streetMode ||
                      streetFeatures.stereoSonar ||
                      streetFeatures.soundOnlyMode ||
                      streetFeatures.handsFreeWakeWord ||
                      streetFeatures.headsetButton ||
                      streetFeatures.depthAnythingEnabled
                        ? 'Apagar todo'
                        : 'Activar todo'}
                    </button>
                  </div>

                  {(
                    [
                      {
                        key: 'soundOnlyMode',
                        label: 'Solo sonidos (sin palabras)',
                      },
                      {
                        key: 'depthAnythingEnabled',
                        label: 'Profundidad IA (Depth Anything V2)',
                      },
                      {
                        key: 'streetMode',
                        label: 'Micro-alertas rápidas (2-3 palabras)',
                      },
                      {
                        key: 'stereoSonar',
                        label: 'Sonar estéreo (Izq / Centro / Der)',
                      },
                      {
                        key: 'handsFreeWakeWord',
                        label: 'Voz manos libres ("Oye Avisia")',
                      },
                      {
                        key: 'headsetButton',
                        label: 'Botón de audífonos Bluetooth',
                      },
                    ] as const
                  ).map((item) => {
                    const enabled = streetFeatures[item.key];
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
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            enabled
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

                <div>
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#859397] mb-2">
                    Modos de operación
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleModeChange('simulation')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium text-left border ${
                        mode === 'simulation'
                          ? 'bg-[#22d3ee]/20 border-[#22d3ee] text-[#8aebff]'
                          : 'bg-[#1c2028] border-[#3c494c]/40 text-[#bbc9cd]'
                      }`}
                    >
                      Escenas (A)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('vision_lab')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium text-left border ${
                        mode === 'vision_lab'
                          ? 'bg-[#4edea3]/20 border-[#4edea3] text-[#6ffbbe]'
                          : 'bg-[#1c2028] border-[#3c494c]/40 text-[#bbc9cd]'
                      }`}
                    >
                      Imagen IA (B)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('video_lab')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium text-left border ${
                        mode === 'video_lab'
                          ? 'bg-[#22d3ee]/20 border-[#22d3ee] text-[#8aebff]'
                          : 'bg-[#1c2028] border-[#3c494c]/40 text-[#bbc9cd]'
                      }`}
                    >
                      Video IA (C)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('live_camera')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium text-left border ${
                        mode === 'live_camera'
                          ? 'bg-[#ffb147]/20 border-[#ffb147] text-[#ffd6a7]'
                          : 'bg-[#1c2028] border-[#3c494c]/40 text-[#bbc9cd]'
                      }`}
                    >
                      Cámara (D)
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#859397] mb-2">
                    Escenarios de Managua
                  </div>
                  <div className="space-y-1.5">
                    {scenarios.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setMode('simulation');
                          setMobileTab('vision');
                          handleSelectScenario(s.id);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left border transition-colors ${
                          s.id === activeScenario.id && mode === 'simulation'
                            ? 'bg-[#22d3ee]/15 border-[#22d3ee] text-[#8aebff]'
                            : 'bg-[#1c2028] border-[#3c494c]/40 text-[#dfe2ee] hover:border-[#859397]'
                        }`}
                      >
                        <div className="text-xs font-semibold">
                          {s.number}. {s.title}
                        </div>
                        <div className="text-[11px] text-[#bbc9cd]">{s.subtitle}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Android Viewport (Zero Scroll on Main Vision Screen) */}
            <div
              className={`flex-1 min-h-0 px-3 py-2 ${
                mobileTab === 'vision'
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
                      className="shrink-0 px-3 py-2 rounded-xl bg-[#93000a]/85 border border-[#ffb4ab]/40 text-xs text-[#ffdad6] flex items-center gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 text-[#ffb4ab] shrink-0" />
                      <span className="font-semibold truncate">{evaluation.obstacleAlert.message}</span>
                    </div>
                  )}

                  <div className="flex-1 min-h-0 flex flex-col">
                    {renderEnvironmentContent()}
                  </div>

                  {/* Minimalist Accessible Voice Bar (Large Touch Targets, Zero Scroll) */}
                  <div className="shrink-0 p-2.5 rounded-2xl bg-[#1c2028] border border-[#3c494c]/30 space-y-2">
                    <div
                      aria-live="assertive"
                      role="alert"
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
                  onChangePolicy={setPolicy}
                  onHighlightDetection={setHighlightedDetectionId}
                />
              )}

              {mobileTab === 'map' && (
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
                  onClick={() => {
                    setMobileTab('vision');
                    setAndroidMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-0.5 py-0.5"
                >
                  <span
                    className={`px-3.5 py-1 rounded-full transition-colors ${
                      mobileTab === 'vision'
                        ? 'bg-[#22d3ee] text-[#005763]'
                        : 'text-[#bbc9cd]'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      mobileTab === 'vision' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                    }`}
                  >
                    Visión
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('assistant');
                    setAndroidMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-0.5 py-0.5"
                >
                  <span
                    className={`px-3.5 py-1 rounded-full transition-colors ${
                      mobileTab === 'assistant'
                        ? 'bg-[#22d3ee] text-[#005763]'
                        : 'text-[#bbc9cd]'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      mobileTab === 'assistant' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                    }`}
                  >
                    Asistente
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('analysis');
                    setAndroidMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-0.5 py-0.5"
                >
                  <span
                    className={`px-3.5 py-1 rounded-full transition-colors ${
                      mobileTab === 'analysis'
                        ? 'bg-[#22d3ee] text-[#005763]'
                        : 'text-[#bbc9cd]'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      mobileTab === 'analysis' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
                    }`}
                  >
                    Telemetría
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('map');
                    setEcosystemTab('map');
                    setAndroidMenuOpen(false);
                    if (!gpsActive && locationService.isGeolocationSupported()) {
                      handleToggleGps();
                    }
                  }}
                  className="flex flex-col items-center gap-0.5 py-0.5"
                >
                  <span
                    className={`px-3.5 py-1 rounded-full transition-colors ${
                      mobileTab === 'map'
                        ? 'bg-[#22d3ee] text-[#005763]'
                        : 'text-[#bbc9cd]'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      mobileTab === 'map' ? 'text-[#8aebff] font-semibold' : 'text-[#bbc9cd]'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                  mode === 'simulation'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                  mode === 'vision_lab'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                  mode === 'video_lab'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                  mode === 'live_camera'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  ecosystemTab === 'core'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  ecosystemTab === 'pipeline'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  ecosystemTab === 'map'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  ecosystemTab === 'tech'
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
                    onChangePolicy={setPolicy}
                    onHighlightDetection={setHighlightedDetectionId}
                  />
                </div>
              </div>
            )}

            {ecosystemTab === 'pipeline' && <PipelineSection mode={mode} />}

            {ecosystemTab === 'map' && (
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
            )}

            {ecosystemTab === 'tech' && (
              <TechnicalDetailsSection
                mode={mode}
                policy={policy}
                cameraActive={cameraActive}
                detectorStatus={detectorService.getStatus()}
                speechSupported={speechService.isSynthesisSupported()}
              />
            )}
          </div>
        </main>
        )}
      </div>
    </div>
  );
}

export default App;
