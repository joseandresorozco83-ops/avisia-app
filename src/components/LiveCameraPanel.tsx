import React, { useEffect, useRef, useState } from 'react';
import {
  Video,
  VideoOff,
  AlertTriangle,
  Radar,
  SwitchCamera,
  Sparkles,
  FileText,
  Crosshair,
  Sun,
  Eye,
  Volume2,
  Loader2,
} from 'lucide-react';
import { cameraService, type CameraDeviceInfo } from '../services/CameraService';
import { detectorService } from '../services/DetectorService';
import { temporalTrackerService } from '../services/TemporalTrackerService';
import {
  depthProximityService,
  type ProximityAssessment,
} from '../services/DepthProximityService';
import {
  depthModelService,
  type DepthMapSummary,
} from '../services/DepthModelService';
import {
  architecturalSegmenterService,
  type ArchitecturalAnalysis,
} from '../services/ArchitecturalSegmenterService';
import {
  computeStixelCorridor,
  enrichDoorsWithDepth,
  type StixelNavigationPlan,
} from '../services/DoorAndStixelService';
import { assistiveVisionService } from '../services/AssistiveVisionService';
import { telemetryService } from '../services/TelemetryService';
import { speechService } from '../services/SpeechService';
import { formatDistanceSteps } from '../services/MessagePolicy';
import type {
  ArchModelVariant,
  AssistiveChannel,
  Detection,
  DetectorEngineId,
} from '../types/avicia';

interface LiveCameraPanelProps {
  threshold: number;
  autoStart?: boolean;
  expandedView?: boolean;
  fastMode?: boolean;
  depthAnythingEnabled?: boolean;
  architecturalVisionEnabled?: boolean;
  archModelVariant?: ArchModelVariant;
  showStixelOverlay?: boolean;
  detectorEngine?: DetectorEngineId;
  onCameraStateChange: (active: boolean) => void;
  onDetectionsReady: (detections: Detection[]) => void;
  onPathClearChange?: (clear: boolean) => void;
  onStixelGuidanceChange?: (plan: StixelNavigationPlan | null) => void;
  onSpeakNow?: (text: string) => void;
  onVideoElementChange?: (video: HTMLVideoElement | null) => void;
}

const FIND_TARGETS = [
  { key: 'puerta', label: 'Puerta' },
  { key: 'cortina', label: 'Cortina' },
  { key: 'persona', label: 'Persona' },
  { key: 'silla', label: 'Silla' },
  { key: 'mesa', label: 'Mesa' },
  { key: 'escaleras', label: 'Escaleras' },
  { key: 'autobús', label: 'Autobús' },
  { key: 'automóvil', label: 'Auto' },
  { key: 'teléfono', label: 'Teléfono' },
  { key: 'botella', label: 'Botella' },
  { key: 'mochila', label: 'Mochila' },
  { key: 'perro', label: 'Perro' },
] as const;

export const LiveCameraPanel: React.FC<LiveCameraPanelProps> = ({
  threshold,
  autoStart = false,
  expandedView = false,
  fastMode = false,
  depthAnythingEnabled = false,
  architecturalVisionEnabled = true,
  archModelVariant = 'segformer_b0',
  showStixelOverlay = true,
  detectorEngine = 'efficientdet_lite2',
  onCameraStateChange,
  onDetectionsReady,
  onPathClearChange,
  onStixelGuidanceChange,
  onSpeakNow,
  onVideoElementChange,
}) => {
  const [channel, setChannel] = useState<AssistiveChannel>('explore');
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectorPendingNote, setDetectorPendingNote] = useState<string | null>(null);
  const [modelBadge, setModelBadge] = useState<string>(() => detectorService.getStatus().modelName);
  const [liveCount, setLiveCount] = useState<number>(0);
  const [corridorSensorOn, setCorridorSensorOn] = useState<boolean>(true);
  const [proximity, setProximity] = useState<ProximityAssessment | null>(null);
  const [switchingCamera, setSwitchingCamera] = useState<boolean>(false);
  const [depthSummary, setDepthSummary] = useState<DepthMapSummary | null>(null);
  const [depthLoading, setDepthLoading] = useState<boolean>(false);
  const [archLoading, setArchLoading] = useState<boolean>(false);
  const [pathClearConfirmed, setPathClearConfirmed] = useState<boolean>(false);
  const [stixelPlan, setStixelPlan] = useState<StixelNavigationPlan | null>(null);

  // Assistive channel states (Be My AI / Seeing AI / Envision parity)
  const [assistiveBusy, setAssistiveBusy] = useState<boolean>(false);
  const [assistiveResultText, setAssistiveResultText] = useState<string | null>(null);
  const [assistiveEngineLabel, setAssistiveEngineLabel] = useState<string | null>(null);
  const [findTarget, setFindTarget] = useState<string>('puerta');
  const [findMatchedText, setFindMatchedText] = useState<string>('Mueve la cámara despacio para buscar.');
  const [lightToneOn, setLightToneOn] = useState<boolean>(false);
  const [tiltWarning, setTiltWarning] = useState<string | null>(null);

  const depthSummaryRef = useRef<DepthMapSummary | null>(null);
  const archSummaryRef = useRef<ArchitecturalAnalysis | null>(null);
  const stixelPlanRef = useRef<StixelNavigationPlan | null>(null);
  const showStixelOverlayRef = useRef<boolean>(showStixelOverlay);
  const clearPathStreakRef = useRef<number>(0);
  const latestDetectionsRef = useRef<Detection[]>([]);
  const latestProximityRef = useRef<ProximityAssessment | null>(null);
  const channelRef = useRef<AssistiveChannel>('explore');
  const findTargetRef = useRef<string>('puerta');
  const lightToneOnRef = useRef<boolean>(false);
  const lastTiltWarnAtRef = useRef<number>(0);
  const lastQualityWarnAtRef = useRef<number>(0);
  const lastRadarSpeakAtRef = useRef<number>(0);
  const lastTapAtRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<number | null>(null);
  const runningRef = useRef<boolean>(false);

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  useEffect(() => {
    findTargetRef.current = findTarget;
  }, [findTarget]);

  useEffect(() => {
    lightToneOnRef.current = lightToneOn;
  }, [lightToneOn]);

  useEffect(() => {
    showStixelOverlayRef.current = showStixelOverlay;
  }, [showStixelOverlay]);

  // Hot-switch detector engine when user changes setting
  useEffect(() => {
    if (detectorService.getEngine() !== detectorEngine) {
      setModelBadge(`Cargando ${detectorEngine}...`);
      void detectorService.setEngine(detectorEngine, threshold).then((st) => {
        setModelBadge(st.modelName);
        if (!st.ready && st.error) {
          setDetectorPendingNote(st.error);
        } else {
          setDetectorPendingNote(null);
        }
      });
    }
  }, [detectorEngine, threshold]);

  // Device orientation tilt ergonomics guard for blind users
  useEffect(() => {
    if (!cameraActive || typeof window === 'undefined') {
      setTiltWarning(null);
      return;
    }

    const onOrientation = (event: DeviceOrientationEvent) => {
      const beta = event.beta;
      if (beta === null || beta === undefined || !Number.isFinite(beta)) return;
      // Upright forward-facing phone has beta ~ 60..115 degrees
      if (beta > 125) {
        const msg = 'Teléfono muy inclinado hacia arriba. Bájalo un poco para ver el camino.';
        setTiltWarning(msg);
        const now = Date.now();
        if (now - lastTiltWarnAtRef.current > 14000) {
          lastTiltWarnAtRef.current = now;
          speechService.vibratePattern('caution');
        }
      } else if (beta < 26 && beta > -20) {
        const msg = 'Teléfono apuntando muy al suelo. Levántalo un poco hacia el frente.';
        setTiltWarning(msg);
        const now = Date.now();
        if (now - lastTiltWarnAtRef.current > 14000) {
          lastTiltWarnAtRef.current = now;
          speechService.vibratePattern('caution');
        }
      } else {
        setTiltWarning(null);
      }
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [cameraActive]);

  // Optional Depth Anything V2 neural depth loop
  useEffect(() => {
    if (!depthAnythingEnabled || !cameraActive) {
      setDepthSummary(null);
      depthSummaryRef.current = null;
      setDepthLoading(false);
      return;
    }

    let cancelled = false;
    let busy = false;

    const initAndRun = async () => {
      if (!depthModelService.getStatus().ready) {
        setDepthLoading(true);
        await depthModelService.initialize();
        if (!cancelled) setDepthLoading(false);
      }
    };

    void initAndRun();

    const timer = window.setInterval(() => {
      if (cancelled || busy || !videoRef.current || videoRef.current.readyState < 2) return;
      if (!depthModelService.getStatus().ready) return;
      busy = true;
      void depthModelService
        .estimateFromVideo(videoRef.current)
        .then((summary) => {
          if (!cancelled && summary) {
            depthSummaryRef.current = summary;
            setDepthSummary(summary);
          }
        })
        .catch(() => {
          // Ignore transient depth frame errors
        })
        .finally(() => {
          busy = false;
        });
    }, 520);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [depthAnythingEnabled, cameraActive]);

  // Decoupled Architectural Semantic Segmenter (SegFormer B0/B1 ADE20K: doors, curtains, stairs, walls, walkable floor)
  useEffect(() => {
    if (!architecturalVisionEnabled || !cameraActive) {
      archSummaryRef.current = null;
      setArchLoading(false);
      return;
    }

    let cancelled = false;
    let busy = false;

    const initSeg = async () => {
      if (
        !architecturalSegmenterService.getStatus().ready ||
        architecturalSegmenterService.getVariant() !== archModelVariant
      ) {
        setArchLoading(true);
        await architecturalSegmenterService.setVariant(archModelVariant);
        if (!cancelled) setArchLoading(false);
      }
    };

    void initSeg();

    const timer = window.setInterval(() => {
      if (cancelled || busy || !videoRef.current || videoRef.current.readyState < 2) return;
      if (!architecturalSegmenterService.getStatus().ready) return;
      busy = true;
      void architecturalSegmenterService
        .analyzeSource(videoRef.current)
        .then((analysis) => {
          if (!cancelled && analysis) {
            archSummaryRef.current = analysis;
          }
        })
        .catch(() => {
          // Ignore transient segmentation frame errors
        })
        .finally(() => {
          busy = false;
        });
    }, archModelVariant === 'segformer_b1' ? 1450 : 1100);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [architecturalVisionEnabled, archModelVariant, cameraActive]);

  const refreshDevices = async () => {
    try {
      const list = await cameraService.listCameras();
      setDevices(list);
      if (list.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(list[0].deviceId);
      }
    } catch {
      // Ignore device enumeration errors prior to permission
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const drawBoxes = (
    dets: Detection[],
    prox?: ProximityAssessment | null,
    plan?: StixelNavigationPlan | null
  ) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // 5-Sector Stixel Free-Space Corridor Visual Overlay (10h, 11h, 12h, 1h, 2h)
    if (showStixelOverlayRef.current && plan && channelRef.current === 'explore') {
      const sectorW = width / 5;
      const maxBarH = height * 0.28;
      const baseY = height - 6;

      ctx.save();
      for (const sec of plan.sectors) {
        const sx = sec.index * sectorW + 4;
        const sw = sectorW - 8;
        const barH = Math.max(12, (sec.reachPct / 100) * maxBarH);
        const fillColor =
          sec.status === 'clear'
            ? 'rgba(52, 211, 153, 0.28)'
            : sec.status === 'caution'
              ? 'rgba(251, 191, 36, 0.28)'
              : 'rgba(244, 63, 94, 0.32)';
        const borderColor =
          sec.status === 'clear'
            ? 'rgba(52, 211, 153, 0.85)'
            : sec.status === 'caution'
              ? 'rgba(251, 191, 36, 0.85)'
              : 'rgba(244, 63, 94, 0.9)';

        ctx.fillStyle = fillColor;
        ctx.fillRect(sx, baseY - barH, sw, barH);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = sec.index === 2 ? 2.5 : 1.5;
        ctx.strokeRect(sx, baseY - barH, sw, barH);

        const fontSize = Math.max(11, Math.round(width * 0.018));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        const stepTxt = sec.freeSteps >= 4 ? '3+p' : `${sec.freeSteps}p`;
        ctx.fillText(`${sec.shortLabel}·${stepTxt}`, sx + sw / 2, baseY - 6);
      }
      ctx.restore();
    }

    if (corridorSensorOn && channelRef.current === 'explore') {
      const cx1 = width * 0.28;
      const cx2 = width * 0.72;
      const cy1 = height * 0.48;
      const cy2 = height * 0.92;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle =
        prox?.level === 'danger'
          ? 'rgba(244, 63, 94, 0.9)'
          : prox?.level === 'caution'
            ? 'rgba(245, 158, 11, 0.85)'
            : 'rgba(34, 211, 238, 0.35)';
      ctx.strokeRect(cx1, cy1, cx2 - cx1, cy2 - cy1);
      ctx.restore();
    }

    for (const det of dets) {
      const x = (det.bbox.x / 100) * width;
      const y = (det.bbox.y / 100) * height;
      const w = (det.bbox.width / 100) * width;
      const h = (det.bbox.height / 100) * height;

      const isTargetMatch =
        channelRef.current === 'find_object' &&
        det.labelEs.toLowerCase().includes(findTargetRef.current);
      const isArchitectural = det.id.startsWith('arch-');
      const isFrontObstacle =
        det.isInanimateObstacle && det.proximityZone !== 'side';
      const strokeColor = isTargetMatch
        ? '#4edea3'
        : det.doorState === 'open'
          ? '#34d399'
          : det.doorState === 'semi_open'
            ? '#fb7185'
            : det.doorState === 'closed'
              ? '#f59e0b'
              : isArchitectural
                ? '#c084fc'
                : isFrontObstacle
                  ? '#f59e0b'
                  : '#22d3ee';

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(3, width * (isTargetMatch ? 0.008 : 0.005));
      ctx.strokeRect(x, y, w, h);

      const confPct =
        typeof det.confidence === 'number'
          ? ` ${Math.round(det.confidence * 100)}%`
          : '';
      const distPart =
        typeof det.estimatedMeters === 'number' ? ` · ${det.estimatedMeters}m` : '';
      const label = `${det.labelEs}${distPart}${confPct}`;
      ctx.font = `bold ${Math.max(14, Math.round(width * 0.024))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const boxHeight = Math.max(24, Math.round(width * 0.038));

      ctx.fillStyle = strokeColor;
      ctx.fillRect(x, Math.max(0, y - boxHeight), textWidth + 14, boxHeight);
      ctx.fillStyle = '#040914';
      ctx.fillText(label, x + 7, Math.max(boxHeight - 7, y - 7));
    }
  };

  useEffect(() => {
    void refreshDevices();
    const onDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      if (loopRef.current !== null) {
        window.clearInterval(loopRef.current);
      }
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      cameraService.stopCamera(videoRef.current);
      onVideoElementChange?.(null);
      onCameraStateChange(false);
    };
  }, []);

  const handleSwitchToDevice = async (nextDeviceId: string) => {
    setSelectedDeviceId(nextDeviceId);
    if (!cameraActive || !videoRef.current) return;

    setSwitchingCamera(true);
    setError(null);
    try {
      await cameraService.startCamera(videoRef.current, nextDeviceId || undefined);
      await refreshDevices();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo cambiar a la cámara seleccionada.';
      setError(msg);
    } finally {
      setSwitchingCamera(false);
    }
  };

  const handleCycleCamera = () => {
    if (devices.length < 2) return;
    const currentIdx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % devices.length : 1;
    void handleSwitchToDevice(devices[nextIdx].deviceId);
  };

  useEffect(() => {
    if (autoStart && !cameraActive) {
      void handleStart();
    }
  }, [autoStart]);

  const speakFeedback = (text: string) => {
    if (onSpeakNow) {
      onSpeakNow(text);
    } else {
      speechService.speak(text, { enabled: true, rate: 1.0, voiceURI: null });
    }
  };

  const handleDescribeSceneNow = async () => {
    speechService.unlockAudio();
    speechService.vibratePattern('confirm');
    setAssistiveBusy(true);
    setAssistiveResultText('Analizando la escena frente a ti...');
    try {
      const res = await assistiveVisionService.describeScene(
        cameraActive ? videoRef.current : null,
        latestDetectionsRef.current,
        latestProximityRef.current,
        depthSummaryRef.current,
        archSummaryRef.current,
        stixelPlanRef.current
      );
      setAssistiveResultText(res.text);
      setAssistiveEngineLabel(
        res.engine === 'gemini'
          ? `Gemini 2.5 Flash · ${res.elapsedMs}ms`
          : `Síntesis local · ${res.elapsedMs}ms`
      );
      speakFeedback(res.text);
    } finally {
      setAssistiveBusy(false);
    }
  };

  const handleReadTextNow = async () => {
    speechService.unlockAudio();
    speechService.vibratePattern('confirm');
    if (!cameraActive || !videoRef.current) {
      const msg = 'Activa la cámara primero para leer texto.';
      setAssistiveResultText(msg);
      speakFeedback(msg);
      return;
    }
    setAssistiveBusy(true);
    setAssistiveResultText('Leyendo texto, mantén firme el teléfono...');
    speakFeedback('Leyendo texto, mantén firme el teléfono.');
    try {
      const res = await assistiveVisionService.readText(videoRef.current);
      setAssistiveResultText(res.text);
      setAssistiveEngineLabel(
        res.engine === 'gemini'
          ? `OCR Gemini 2.5 Flash · ${res.elapsedMs}ms`
          : `OCR Offline Español · ${res.elapsedMs}ms`
      );
      speechService.vibratePattern('confirm');
      speakFeedback(res.text);
    } finally {
      setAssistiveBusy(false);
    }
  };

  const handleSpeakLightNow = () => {
    speechService.unlockAudio();
    const pct = latestProximityRef.current?.brightnessPct ?? 0;
    const text = cameraActive
      ? assistiveVisionService.describeLightLevel(pct)
      : 'Activa la cámara para medir la luz ambiental.';
    setAssistiveResultText(text);
    speakFeedback(text);
  };

  // Blind-accessible full-screen viewfinder tap gesture:
  // Single tap -> Describe right now | Double tap -> Immediate silence
  const handleViewportTap = () => {
    if (!cameraActive) return;
    speechService.unlockAudio();
    const now = Date.now();
    if (now - lastTapAtRef.current < 340) {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapAtRef.current = 0;
      speechService.cancel();
      speechService.vibratePattern('confirm');
      return;
    }
    lastTapAtRef.current = now;
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      if (channelRef.current === 'read_text') {
        void handleReadTextNow();
      } else if (channelRef.current === 'light') {
        handleSpeakLightNow();
      } else {
        void handleDescribeSceneNow();
      }
    }, 340);
  };

  const handleStart = async () => {
    if (!videoRef.current) return;
    setError(null);
    setDetectorPendingNote(null);
    speechService.unlockAudio();
    temporalTrackerService.reset();
    depthProximityService.reset();

    try {
      runningRef.current = true;
      await cameraService.startCamera(videoRef.current, selectedDeviceId || undefined);
      if (!runningRef.current) return;
      setCameraActive(true);
      onVideoElementChange?.(videoRef.current);
      onCameraStateChange(true);
      await refreshDevices();

      const detStatus = await detectorService.setEngine(detectorEngine, threshold);
      setModelBadge(detStatus.modelName);
      if (!runningRef.current) return;
      if (!detStatus.ready) {
        setDetectorPendingNote(
          detStatus.error ??
            'Cámara activa. El modelo de visión no está disponible en este momento; no se superponen cajas ficticias.'
        );
        return;
      }

      let frameBusy = false;

      const runFrame = async () => {
        if (
          frameBusy ||
          !runningRef.current ||
          !videoRef.current ||
          videoRef.current.readyState < 2
        ) {
          return;
        }
        frameBusy = true;
        try {
          const res = await detectorService.detectOnVideoFrame(videoRef.current, threshold);
          if (!runningRef.current) return;

          // Multi-frame temporal stabilization: rejects 1-frame noisy hallucinations
          const stabilizedCoco = temporalTrackerService.update(res.detections, Date.now());

          // Fuse SegFormer ADE20K architectural detections + Depth open/closed/semi-open door classification & open doorways
          const archDets = archSummaryRef.current?.detections ?? [];
          const existingLabels = new Set(stabilizedCoco.map((d) => d.labelEs.toLowerCase()));
          const rawMerged: Detection[] = [...stabilizedCoco];
          for (const ad of archDets) {
            if (!existingLabels.has(ad.labelEs.toLowerCase())) {
              rawMerged.push(ad);
              existingLabels.add(ad.labelEs.toLowerCase());
            }
          }
          const mergedBaseDetections = enrichDoorsWithDepth(
            rawMerged,
            archSummaryRef.current,
            depthSummaryRef.current
          );

          const prox = corridorSensorOn
            ? depthProximityService.analyzeVideoCorridor(videoRef.current, mergedBaseDetections)
            : null;
          setProximity(prox);
          latestProximityRef.current = prox;

          // Light channel musical tone (Seeing AI style)
          if (channelRef.current === 'light' && lightToneOnRef.current && prox) {
            speechService.playLightTone(prox.brightnessPct);
          }

          // Camera blocked / too dark ergonomic guard
          if (prox && (prox.cameraQuality === 'lens_blocked' || prox.cameraQuality === 'too_dark')) {
            const now = Date.now();
            if (now - lastQualityWarnAtRef.current > 10000 && channelRef.current === 'explore') {
              lastQualityWarnAtRef.current = now;
              speechService.vibratePattern('blocked');
            }
          }

          // Find-Object Radar channel (Envision AI style — now includes Puerta, Cortina, Escaleras!)
          if (channelRef.current === 'find_object') {
            const targetKey = findTargetRef.current;
            const match = mergedBaseDetections.find((d) =>
              d.labelEs.toLowerCase().includes(targetKey)
            );
            if (match) {
              const cx = match.bbox.x + match.bbox.width / 2;
              const pan = (cx - 50) / 50;
              const alignment = Math.max(0, 1 - Math.abs(cx - 50) / 50);
              speechService.playRadarBeep(pan, alignment);
              if (alignment > 0.72) {
                speechService.vibratePattern('confirm');
              }
              const dist = formatDistanceSteps(match.estimatedMeters);
              const statusTxt = `${match.labelEs} ${match.clockPosition ?? 'al frente'}${dist ? `, ${dist}` : ''}.`;
              setFindMatchedText(statusTxt);
              const now = Date.now();
              if (alignment > 0.65 && now - lastRadarSpeakAtRef.current > 3500) {
                lastRadarSpeakAtRef.current = now;
                speakFeedback(`Encontrado: ${statusTxt}`);
              }
            } else {
              setFindMatchedText(`Buscando "${targetKey}"... mueve despacio la cámara.`);
            }
          }

          const combinedDetections = [...mergedBaseDetections];
          const hasFrontObstacle = combinedDetections.some(
            (d) => d.isInanimateObstacle && d.proximityZone !== 'side'
          );
          const hasClosePersonOrVehicle = combinedDetections.some(
            (d) =>
              (d.category === 'person' || d.category === 'car' || d.category === 'bus' || d.category === 'motorcycle') &&
              d.proximityZone === 'front_close'
          );

          const depthWallOrObstacle =
            depthSummaryRef.current?.wallAhead || depthSummaryRef.current?.closeObstacleAhead;
          const depthStep = depthSummaryRef.current?.stepDetectedInDepth;

          if (
            corridorSensorOn &&
            channelRef.current === 'explore' &&
            prox &&
            (prox.flatWallAhead ||
              prox.floorVariationDetected ||
              depthStep ||
              (!hasFrontObstacle && (prox.verticalObstacleDetected || depthWallOrObstacle)))
          ) {
            const depthDist = depthSummaryRef.current?.estimatedMeters;
            const isStep = prox.floorVariationDetected || Boolean(depthStep);
            const isWall = prox.flatWallAhead || Boolean(depthSummaryRef.current?.wallAhead);
            const clearHint =
              depthSummaryRef.current?.clearSide === 'left'
                ? ' (libre izquierda)'
                : depthSummaryRef.current?.clearSide === 'right'
                  ? ' (libre derecha)'
                  : '';

            combinedDetections.push({
              id: `corridor-${Date.now()}`,
              category: 'obstacle',
              labelEs: isWall
                ? `Pared muy cerca${clearHint}`
                : isStep
                  ? 'Grada o desnivel'
                  : depthWallOrObstacle && depthDist
                    ? `Obstáculo a ${depthDist} m${clearHint}`
                    : 'Obstáculo inmóvil',
              source: 'real_video',
              confidence: Math.min(0.95, Math.max(0.65, prox.corridorScore / 100)),
              bbox: { x: 30, y: isStep ? 58 : 42, width: 40, height: isStep ? 34 : 46 },
              confirmationStatus: 'confirmed',
              priority: 97,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              isNew: true,
              isInanimateObstacle: true,
              estimatedMeters: isWall ? 0.6 : depthDist ?? 1.2,
              clockPosition: 'a las 12',
              proximityZone:
                isWall || prox.level === 'danger' || depthWallOrObstacle
                  ? 'front_close'
                  : 'front_mid',
            });
          }

          // 5-Sector Semantic Stixel Navigation Plan (free steps ahead + left/right detour + open doorway)
          const currentStixelPlan = computeStixelCorridor(
            combinedDetections,
            archSummaryRef.current,
            depthSummaryRef.current,
            prox
          );
          stixelPlanRef.current = currentStixelPlan;
          setStixelPlan(currentStixelPlan);
          onStixelGuidanceChange?.(currentStixelPlan);

          // Safety-verified Clear Path check (requires >= 3 calm, illuminated, obstacle-free frames)
          const archBlocked =
            archSummaryRef.current !== null &&
            !archSummaryRef.current.openDoorwayDetected &&
            (archSummaryRef.current.wallCorridorPct >= 46 ||
              combinedDetections.some(
                (d) =>
                  d.id.startsWith('arch-') &&
                  d.isInanimateObstacle &&
                  d.doorState !== 'open' &&
                  d.proximityZone === 'front_close'
              ));
          const isFrameClear =
            channelRef.current === 'explore' &&
            currentStixelPlan.centerClear &&
            prox !== null &&
            prox.cameraQuality === 'ok' &&
            prox.level === 'clear' &&
            !prox.flatWallAhead &&
            !prox.floorVariationDetected &&
            !prox.verticalObstacleDetected &&
            !depthWallOrObstacle &&
            !depthStep &&
            !hasFrontObstacle &&
            !hasClosePersonOrVehicle &&
            !archBlocked;

          if (isFrameClear) {
            clearPathStreakRef.current = Math.min(10, clearPathStreakRef.current + 1);
          } else {
            clearPathStreakRef.current = 0;
          }
          const isClearConfirmed = clearPathStreakRef.current >= 3;
          setPathClearConfirmed(isClearConfirmed);
          onPathClearChange?.(isClearConfirmed);

          // Differentiated haptic signaling (Explore mode only)
          if (channelRef.current === 'explore' && prox) {
            if (prox.floorVariationDetected || depthStep) {
              speechService.vibratePattern('step');
            } else if (prox.flatWallAhead || prox.level === 'danger') {
              speechService.vibratePattern('danger');
            }
          }

          if (!runningRef.current) return;
          latestDetectionsRef.current = combinedDetections;
          setLiveCount(combinedDetections.length);
          drawBoxes(combinedDetections, prox, currentStixelPlan);
          telemetryService.record({
            timestamp: Date.now(),
            mode: fastMode ? 'street_fast' : 'live_camera',
            inferenceMs: res.inferenceTimeMs,
            detectionsCount: combinedDetections.length,
            frontObstacle:
              combinedDetections.find((d) => d.isInanimateObstacle)?.labelEs ?? null,
            ttcSeconds: prox?.ttcSeconds ?? null,
            policy: 'live',
          });

          // Only push live detections into auto-speech when in Explore channel
          if (channelRef.current === 'explore') {
            onDetectionsReady(combinedDetections);
          }
        } catch {
          // Ignore transient frame error
        } finally {
          frameBusy = false;
        }
      };

      void runFrame();
      const intervalMs =
        detectorEngine === 'yolov10n' ? 420 : fastMode ? 240 : 480;
      loopRef.current = window.setInterval(() => {
        void runFrame();
      }, intervalMs);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo acceder a la cámara. Verifica los permisos del navegador.';
      setError(msg);
      setCameraActive(false);
      onCameraStateChange(false);
    }
  };

  const handleStop = () => {
    runningRef.current = false;
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    temporalTrackerService.reset();
    depthProximityService.reset();
    speechService.cancel();
    clearCanvas();
    latestDetectionsRef.current = [];
    latestProximityRef.current = null;
    archSummaryRef.current = null;
    stixelPlanRef.current = null;
    clearPathStreakRef.current = 0;
    setStixelPlan(null);
    setPathClearConfirmed(false);
    onPathClearChange?.(false);
    onStixelGuidanceChange?.(null);
    setLiveCount(0);
    setProximity(null);
    setTiltWarning(null);
    cameraService.stopCamera(videoRef.current);
    onVideoElementChange?.(null);
    setCameraActive(false);
    onCameraStateChange(false);
    onDetectionsReady([]);
  };

  const selectChannel = (next: AssistiveChannel, spokenName: string) => {
    speechService.unlockAudio();
    speechService.vibratePattern('confirm');
    setChannel(next);
    setAssistiveResultText(null);
    if (next !== 'explore') {
      onDetectionsReady([]);
    }
    speakFeedback(`Canal ${spokenName}`);
  };

  return (
    <div className={expandedView ? 'flex flex-col h-full min-h-0 gap-1.5' : 'space-y-2.5'}>
      {/* Seeing AI / Lookout-style Assistive Channel Bar */}
      <div
        role="tablist"
        aria-label="Canales de asistencia visual"
        className="shrink-0 grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#141821] border border-[#3c494c]/40"
      >
        {(
          [
            { id: 'explore', label: 'Explorar', spoken: 'Explorar camino', icon: Eye },
            { id: 'scene_ai', label: 'Escena', spoken: 'Describir escena con inteligencia artificial', icon: Sparkles },
            { id: 'read_text', label: 'Texto', spoken: 'Leer texto', icon: FileText },
            { id: 'find_object', label: 'Buscar', spoken: 'Buscar objeto', icon: Crosshair },
            { id: 'light', label: 'Luz', spoken: 'Detector de luz', icon: Sun },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = channel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tab.spoken}
              onClick={() => selectChannel(tab.id, tab.spoken)}
              className={`min-h-[42px] px-1 py-1 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors ${
                active
                  ? 'bg-[#22d3ee] text-[#00363e] shadow-sm'
                  : 'text-[#bbc9cd] hover:bg-[#262a33]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Camera Power & Device Controls */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5 p-1.5 rounded-xl bg-[#181c24] border border-[#3c494c]/40">
        <div className="flex items-center gap-1.5">
          {!cameraActive ? (
            <button
              type="button"
              onClick={handleStart}
              aria-label="Activar cámara en vivo"
              className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] font-bold text-xs transition-colors"
            >
              <Video className="w-4 h-4" />
              Activar cámara
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              aria-label="Detener cámara y silenciar avisos"
              className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6] font-bold text-xs transition-colors"
            >
              <VideoOff className="w-4 h-4" />
              Detener
            </button>
          )}

          {devices.length > 1 && (
            <button
              type="button"
              onClick={handleCycleCamera}
              disabled={switchingCamera}
              aria-label="Cambiar entre cámara frontal y trasera"
              className="inline-flex items-center gap-1 h-11 px-2.5 rounded-xl bg-[#262a33] hover:bg-[#31353e] border border-[#3c494c]/50 text-[#8aebff] font-semibold text-xs transition-colors disabled:opacity-50"
            >
              <SwitchCamera className={`w-4 h-4 ${switchingCamera ? 'animate-spin' : ''}`} />
              <span>{devices.length}</span>
            </button>
          )}
        </div>

        <select
          aria-label="Seleccionar cámara"
          value={selectedDeviceId}
          onChange={(e) => void handleSwitchToDevice(e.target.value)}
          disabled={switchingCamera}
          className="h-11 bg-[#0a0e16] border border-[#3c494c]/50 rounded-xl px-2 text-xs text-[#dfe2ee] max-w-[130px]"
        >
          {devices.length === 0 ? (
            <option value="">Cámara trasera</option>
          ) : (
            devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))
          )}
        </select>
      </div>

      {error && (
        <div
          role="alert"
          className="shrink-0 p-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {detectorPendingNote && (
        <div className="shrink-0 p-2 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>{detectorPendingNote}</span>
        </div>
      )}

      {tiltWarning && cameraActive && (
        <div
          role="status"
          className="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-[11px] font-semibold text-amber-200 flex items-center gap-1.5"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span className="truncate">{tiltWarning}</span>
        </div>
      )}

      {/* Video + Bounding Box Canvas Overlay (1-tap = describe, 2-tap = silence) */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Visor de cámara. Toca una vez para describir el entorno o toca dos veces para silenciar el audio."
        onClick={handleViewportTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleViewportTap();
          }
        }}
        className={`relative w-full rounded-2xl overflow-hidden border border-[#3c494c]/40 bg-[#05080f] flex items-center justify-center cursor-pointer select-none ${
          expandedView ? 'flex-1 min-h-[175px]' : 'aspect-[16/10]'
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${
            cameraActive ? 'block' : 'hidden'
          }`}
        />

        {!cameraActive && (
          <div className="text-center p-4 max-w-xs">
            <Video className="w-8 h-8 text-cyan-400/70 mx-auto mb-1.5" />
            <p className="text-sm font-semibold text-slate-200">
              AVISIA v3.2 · Cámara Asistiva
            </p>
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
              Activa la cámara para explorar obstáculos estabilizados, leer texto, buscar objetos o describir escenas.
            </p>
            <p className="text-[10px] text-amber-300/80 mt-1.5">
              Complementa —no reemplaza— tu bastón blanco o perro guía.
            </p>
          </div>
        )}

        {cameraActive && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-slate-950/80 border border-emerald-400/40 text-[10px] font-semibold text-emerald-300 flex items-center gap-1 truncate max-w-[65%]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate">{modelBadge.split(' ')[0]}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-950/80 border border-white/15 text-[10px] font-medium text-slate-200 shrink-0">
              {liveCount} {liveCount === 1 ? 'confirm.' : 'confirm.'}
            </span>
          </div>
        )}

        {cameraActive && channel === 'explore' && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-col items-center gap-1 pointer-events-none">
            {pathClearConfirmed && (
              <span className="px-3 py-1 rounded-full bg-emerald-500/90 text-slate-950 font-extrabold text-xs shadow-md">
                {stixelPlan?.openDoorwayAhead
                  ? `✓ Puerta abierta ${stixelPlan.openDoorwayAhead.clockLabel} · paso libre`
                  : `✓ Despejado a las 12 · ${
                      stixelPlan && stixelPlan.centerFreeSteps >= 4
                        ? '3+ pasos'
                        : `${stixelPlan?.centerFreeSteps ?? 2} pasos`
                    }`}
              </span>
            )}
            {!pathClearConfirmed && stixelPlan?.shortDetourHint && (
              <span className="px-3 py-1 rounded-full bg-cyan-400/90 text-slate-950 font-extrabold text-[11px] shadow-md">
                ↪ {stixelPlan.shortDetourHint}
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full bg-slate-950/75 border border-white/10 text-[10px] text-slate-300">
              1 toque: describir ahora · 2 toques: silenciar
            </span>
          </div>
        )}
      </div>

      {/* Channel-Specific Accessible Action Panel */}
      {channel === 'scene_ai' && (
        <div className="shrink-0 p-2 rounded-xl bg-[#181c24] border border-[#22d3ee]/40 space-y-1.5">
          <button
            type="button"
            disabled={assistiveBusy}
            onClick={() => void handleDescribeSceneNow()}
            className="w-full h-12 rounded-xl bg-[#22d3ee] hover:bg-[#8aebff] disabled:opacity-60 text-[#00363e] font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            {assistiveBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {assistiveBusy
              ? 'Describiendo escena...'
              : assistiveVisionService.hasGeminiApiKey()
                ? 'Describir escena (Gemini IA)'
                : 'Describir escena (Modo Local)'}
          </button>
          {assistiveResultText && (
            <div className="p-2 rounded-lg bg-[#0f131c] border border-[#3c494c]/40 text-xs text-[#dfe2ee] leading-snug">
              <p>{assistiveResultText}</p>
              {assistiveEngineLabel && (
                <span className="block mt-1 text-[10px] font-mono text-[#8aebff]">
                  {assistiveEngineLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {channel === 'read_text' && (
        <div className="shrink-0 p-2 rounded-xl bg-[#181c24] border border-[#4edea3]/40 space-y-1.5">
          <button
            type="button"
            disabled={assistiveBusy}
            onClick={() => void handleReadTextNow()}
            className="w-full h-12 rounded-xl bg-[#4edea3] hover:bg-[#6ffbbe] disabled:opacity-60 text-[#003824] font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            {assistiveBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {assistiveBusy ? 'Leyendo texto...' : 'Leer texto ahora (OCR)'}
          </button>
          {assistiveResultText && (
            <div className="p-2 rounded-lg bg-[#0f131c] border border-[#3c494c]/40 text-xs text-[#dfe2ee] leading-snug max-h-20 overflow-y-auto">
              <p>{assistiveResultText}</p>
              {assistiveEngineLabel && (
                <span className="block mt-1 text-[10px] font-mono text-[#4edea3]">
                  {assistiveEngineLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {channel === 'find_object' && (
        <div className="shrink-0 p-2 rounded-xl bg-[#181c24] border border-[#4edea3]/40 space-y-1.5">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {FIND_TARGETS.map((item) => {
              const selected = findTarget === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setFindTarget(item.key);
                    speechService.vibratePattern('confirm');
                    speakFeedback(`Buscando ${item.label}`);
                  }}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    selected
                      ? 'bg-[#4edea3] text-[#003824] border-[#4edea3]'
                      : 'bg-[#0f131c] text-[#bbc9cd] border-[#3c494c]/50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#6ffbbe] font-semibold truncate px-1">
            {findMatchedText}
          </p>
        </div>
      )}

      {channel === 'light' && (
        <div className="shrink-0 p-2 rounded-xl bg-[#181c24] border border-amber-400/40 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sun className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-xs font-bold text-[#dfe2ee] truncate">
                Luz ambiental: {cameraActive ? `${proximity?.brightnessPct ?? 0}%` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setLightToneOn((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                  lightToneOn
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-[#0f131c] text-amber-200 border-amber-400/40'
                }`}
              >
                {lightToneOn ? 'Tono: ON' : 'Tono: OFF'}
              </button>
              <button
                type="button"
                onClick={handleSpeakLightNow}
                aria-label="Escuchar nivel de luz"
                className="p-1.5 rounded-lg bg-[#22d3ee] text-[#00363e]"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#0f131c] overflow-hidden border border-[#3c494c]/40">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-yellow-200 transition-all duration-200"
              style={{ width: `${cameraActive ? proximity?.brightnessPct ?? 0 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Corridor Depth & Proximity Status Bar (Explore channel) */}
      {channel === 'explore' && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#181c24] border border-[#3c494c]/40 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Radar
              className={`w-4 h-4 shrink-0 ${
                proximity?.level === 'danger' || proximity?.cameraQuality === 'lens_blocked'
                  ? 'text-rose-400'
                  : proximity?.level === 'caution'
                    ? 'text-amber-400'
                    : 'text-cyan-400'
              }`}
            />
            <span className="text-slate-200 truncate text-[11px]">
              {!cameraActive
                ? 'Stixel 5 sectores + puertas abiertas/cerradas listo'
                : archLoading
                  ? `Cargando ${archModelVariant === 'segformer_b1' ? 'SegFormer-B1' : 'SegFormer-B0'} (puertas y piso)...`
                  : depthLoading
                    ? 'Cargando Depth Anything V2...'
                    : proximity?.alertText
                      ? proximity.alertText
                      : stixelPlan
                        ? stixelPlan.guidanceText
                        : depthSummary
                          ? `Depth V2 (~${depthSummary.estimatedMeters}m)`
                          : proximity?.estimatedMeters !== null &&
                              proximity?.estimatedMeters !== undefined
                            ? `Más cercano: ~${proximity.estimatedMeters} m`
                            : 'Analizando camino frente a ti...'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCorridorSensorOn((v) => !v)}
            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
              corridorSensorOn
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                : 'bg-slate-800 border-white/10 text-slate-400'
            }`}
          >
            {corridorSensorOn ? 'Camino: ON' : 'Camino: OFF'}
          </button>
        </div>
      )}
    </div>
  );
};
