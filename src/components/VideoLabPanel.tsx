import React, { useEffect, useRef, useState } from 'react';
import { Film, Play, Pause, AlertCircle, SlidersHorizontal, Volume2 } from 'lucide-react';
import type { Detection, DetectorStatus } from '../types/avicia';
import { detectorService } from '../services/DetectorService';
import {
  architecturalSegmenterService,
  type ArchitecturalAnalysis,
} from '../services/ArchitecturalSegmenterService';
import {
  depthModelService,
  type DepthMapSummary,
} from '../services/DepthModelService';
import { depthProximityService } from '../services/DepthProximityService';
import {
  archTemporalTrackerService,
  temporalTrackerService,
} from '../services/TemporalTrackerService';
import {
  cameraCalibrationService,
  type CameraPoseCalibration,
} from '../services/CameraCalibrationService';
import {
  pedestrianNavigationService,
  type PedestrianMotionState,
} from '../services/PedestrianNavigationService';
import {
  computeStixelCorridor,
  enrichDoorsWithDepth,
  type StixelNavigationPlan,
} from '../services/DoorAndStixelService';

interface VideoLabPanelProps {
  threshold: number;
  onThresholdChange: (value: number) => void;
  onDetectionsReady: (detections: Detection[]) => void;
  onSpeakDescription: (text: string) => void;
}

export const VideoLabPanel: React.FC<VideoLabPanelProps> = ({
  threshold,
  onThresholdChange,
  onDetectionsReady,
  onSpeakDescription,
}) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<DetectorStatus>(() => detectorService.getStatus());
  const [detections, setDetections] = useState<Detection[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [stixelPlan, setStixelPlan] = useState<StixelNavigationPlan | null>(null);
  const [poseCal, setPoseCal] = useState<CameraPoseCalibration>(() =>
    cameraCalibrationService.getCalibration()
  );
  const [motionState, setMotionState] = useState<PedestrianMotionState>(() =>
    pedestrianNavigationService.getState()
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<number | null>(null);
  const archLoopRef = useRef<number | null>(null);
  const depthLoopRef = useRef<number | null>(null);
  const archSummaryRef = useRef<ArchitecturalAnalysis | null>(null);
  const depthSummaryRef = useRef<DepthMapSummary | null>(null);
  const frameBusyRef = useRef(false);

  useEffect(() => {
    const unsub = detectorService.onStatusChange((st) => setStatus(st));
    return unsub;
  }, []);

  useEffect(() => {
    return () => {
      stopAnalysisLoop();
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const drawBoxes = (dets: Detection[], plan?: StixelNavigationPlan | null) => {
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

    if (plan) {
      const sectorW = width / 5;
      const maxBarH = height * 0.22;
      const baseY = height - 8;
      ctx.save();
      for (const sec of plan.sectors) {
        const sx = sec.index * sectorW + 4;
        const sw = sectorW - 8;
        const barH = Math.max(12, (sec.reachPct / 100) * maxBarH);
        ctx.fillStyle =
          sec.status === 'clear'
            ? 'rgba(52, 211, 153, 0.28)'
            : sec.status === 'caution'
              ? 'rgba(251, 191, 36, 0.28)'
              : 'rgba(244, 63, 94, 0.32)';
        ctx.fillRect(sx, baseY - barH, sw, barH);
        ctx.strokeStyle =
          sec.status === 'clear'
            ? 'rgba(52, 211, 153, 0.85)'
            : sec.status === 'caution'
              ? 'rgba(251, 191, 36, 0.85)'
              : 'rgba(244, 63, 94, 0.9)';
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

    for (const det of dets) {
      const x = (det.bbox.x / 100) * width;
      const y = (det.bbox.y / 100) * height;
      const w = (det.bbox.width / 100) * width;
      const h = (det.bbox.height / 100) * height;

      const color =
        det.doorState === 'open'
          ? '#34d399'
          : det.doorState === 'semi_open'
            ? '#fb7185'
            : det.doorState === 'closed'
              ? '#f59e0b'
              : det.id.startsWith('arch-')
                ? '#c084fc'
                : det.isInanimateObstacle
                  ? '#f59e0b'
                  : '#22d3ee';

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2.5, width * 0.0045);
      ctx.strokeRect(x, y, w, h);

      const distPart =
        typeof det.estimatedMeters === 'number' ? ` · ${det.estimatedMeters}m` : '';
      const label = `${det.labelEs}${distPart} ${Math.round((det.confidence ?? 0) * 100)}%`;
      ctx.font = `bold ${Math.max(13, Math.round(width * 0.022))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const boxHeight = Math.max(22, Math.round(width * 0.035));

      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - boxHeight), textWidth + 12, boxHeight);
      ctx.fillStyle = '#040914';
      ctx.fillText(label, x + 6, Math.max(boxHeight - 6, y - 6));
    }
  };

  const stopAnalysisLoop = () => {
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    if (archLoopRef.current !== null) {
      window.clearInterval(archLoopRef.current);
      archLoopRef.current = null;
    }
    if (depthLoopRef.current !== null) {
      window.clearInterval(depthLoopRef.current);
      depthLoopRef.current = null;
    }
    setAnalyzing(false);
  };

  const analyzeSingleFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || frameBusyRef.current) return;
    frameBusyRef.current = true;

    try {
      const res = await detectorService.detectOnVideoFrame(video, threshold);
      const nowTs = Date.now();
      const depthGrid = depthSummaryRef.current?.grid;
      const stabilizedCoco = temporalTrackerService.update(res.detections, nowTs, depthGrid);

      const depthConfirmsFlatFloor =
        depthSummaryRef.current !== null &&
        !depthSummaryRef.current.stepDetectedInDepth &&
        (depthSummaryRef.current.groundPlanarityR2 ?? 1) >= 0.82;
      const depthConfirmsRealStep = Boolean(depthSummaryRef.current?.stepDetectedInDepth);

      const rawArchDets = (archSummaryRef.current?.detections ?? []).filter((ad) => {
        const lower = ad.labelEs.toLowerCase();
        if (lower.includes('escalera eléctrica') && !depthConfirmsRealStep) return false;
        if ((lower.includes('escalera') || lower.includes('grada')) && depthConfirmsFlatFloor) {
          return false;
        }
        return true;
      });
      const stabilizedArch = archTemporalTrackerService.update(rawArchDets, nowTs, depthGrid);

      const existingLabels = new Set(stabilizedCoco.map((d) => d.labelEs.toLowerCase()));
      const rawMerged: Detection[] = [...stabilizedCoco];
      for (const ad of stabilizedArch) {
        if (!existingLabels.has(ad.labelEs.toLowerCase())) {
          rawMerged.push(ad);
          existingLabels.add(ad.labelEs.toLowerCase());
        }
      }

      // Cross-modal disambiguation (Cortina vs Puerta, Mesa/Escritorio vs Mueble, Pizarra vs Refrigerador)
      const hasCurtain = rawMerged.some((d) => d.labelEs === 'Cortina');
      const hasTableOrDesk = rawMerged.some(
        (d) => d.labelEs === 'Mesa' || d.labelEs === 'Escritorio' || d.labelEs === 'Mesa baja'
      );
      const hasWhiteboard = rawMerged.some((d) => d.labelEs === 'Pizarra');
      const disambiguated = rawMerged.filter((d) => {
        if (hasCurtain && d.labelEs.startsWith('Puerta')) return false;
        if (
          hasTableOrDesk &&
          (d.labelEs === 'Mueble' ||
            d.labelEs === 'Mueble o estante' ||
            d.labelEs === 'Armario o mueble')
        ) {
          return false;
        }
        if (hasWhiteboard && d.labelEs === 'Refrigerador') return false;
        return true;
      });

      const merged = enrichDoorsWithDepth(
        disambiguated,
        archSummaryRef.current,
        depthSummaryRef.current
      );

      const prox = depthProximityService.analyzeVideoCorridor(video, merged);
      setMotionState(pedestrianNavigationService.updateFromVisualMotion(prox.motionScore));

      const hasFrontObstacle = merged.some(
        (d) => d.isInanimateObstacle && d.proximityZone === 'front_close'
      );
      if (
        prox.flatWallAhead ||
        prox.redExtinguisherOnWall ||
        prox.centralCounterOrWallAhead ||
        (!hasFrontObstacle && prox.verticalObstacleDetected)
      ) {
        const isExtinguisher = Boolean(prox.redExtinguisherOnWall);
        const isCounter = Boolean(prox.centralCounterOrWallAhead) && !prox.flatWallAhead;
        const isWall = prox.flatWallAhead || isExtinguisher;
        merged.push({
          id: `vid-corridor-${nowTs}`,
          category: 'obstacle',
          labelEs: isExtinguisher
            ? 'Pared y extintor'
            : isWall
              ? 'Pared muy cerca'
              : isCounter
                ? 'Mostrador o pared'
                : 'Obstáculo inmóvil',
          source: 'real_video',
          confidence: Math.min(0.95, Math.max(0.74, prox.corridorScore / 100)),
          bbox: { x: 28, y: 28, width: 44, height: 56 },
          confirmationStatus: 'confirmed',
          priority: 97,
          firstSeenAt: nowTs,
          lastSeenAt: nowTs,
          isNew: true,
          isInanimateObstacle: true,
          estimatedMeters: isWall ? 0.7 : 1.2,
          clockPosition: 'a las 12',
          proximityZone: 'front_close',
        });
      }

      const cal = cameraCalibrationService.updateFromVisualScene({
        videoWidth: video.videoWidth || 640,
        videoHeight: video.videoHeight || 480,
        walkableCorridorPct: archSummaryRef.current?.walkableCorridorPct ?? null,
        sectorFloorReachPct: archSummaryRef.current?.sectorFloorReachPct ?? null,
      });
      setPoseCal(cal);

      const plan = computeStixelCorridor(
        merged,
        archSummaryRef.current,
        depthSummaryRef.current,
        prox
      );
      setStixelPlan(plan);
      setStatus(detectorService.getStatus());
      setDetections(merged);
      drawBoxes(merged, plan);
      onDetectionsReady(merged);
    } catch {
      setStatus(detectorService.getStatus());
      drawBoxes([], null);
    } finally {
      frameBusyRef.current = false;
    }
  };

  const startAnalysisLoop = async () => {
    stopAnalysisLoop();
    const initStatus = await detectorService.initialize(threshold);
    setStatus(initStatus);
    if (!initStatus.ready) {
      return;
    }

    setAnalyzing(true);
    void architecturalSegmenterService.initialize('segformer_b0');
    void depthModelService.initialize();

    await analyzeSingleFrame();
    loopRef.current = window.setInterval(() => {
      void analyzeSingleFrame();
    }, 220);

    let archBusy = false;
    archLoopRef.current = window.setInterval(() => {
      if (archBusy || !videoRef.current || videoRef.current.readyState < 2) return;
      archBusy = true;
      void architecturalSegmenterService
        .analyzeSource(videoRef.current)
        .then((res) => {
          if (res) archSummaryRef.current = res;
        })
        .catch(() => {})
        .finally(() => {
          archBusy = false;
        });
    }, 1050);

    let depthBusy = false;
    depthLoopRef.current = window.setInterval(() => {
      if (depthBusy || !videoRef.current || videoRef.current.readyState < 2) return;
      if (!depthModelService.getStatus().ready) return;
      depthBusy = true;
      void depthModelService
        .estimateFromVideo(videoRef.current)
        .then((res) => {
          if (res) depthSummaryRef.current = res;
        })
        .catch(() => {})
        .finally(() => {
          depthBusy = false;
        });
    }, 1100);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopAnalysisLoop();
    temporalTrackerService.reset();
    archTemporalTrackerService.reset();
    depthProximityService.reset();
    archSummaryRef.current = null;
    depthSummaryRef.current = null;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);
    setDetections([]);
    setStixelPlan(null);
    setIsPlaying(false);
    onDetectionsReady([]);
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
      void startAnalysisLoop();
    } else {
      video.pause();
      setIsPlaying(false);
      stopAnalysisLoop();
    }
  };

  const buildSummary = () => {
    if (detections.length === 0) {
      return stixelPlan?.guidanceText ?? 'Camino despejado en el cuadro actual del video.';
    }
    const labels = Array.from(new Set(detections.map((d) => d.labelEs.toLowerCase())));
    return `En el video identifico: ${labels.join(', ')}.`;
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col gap-1.5 overflow-hidden">
      {/* Controls bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/80 border border-white/10">
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors">
          <Film className="w-4 h-4" />
          Cargar video
          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span>{Math.round(threshold * 100)}%</span>
          <input
            type="range"
            min="0.2"
            max="0.9"
            step="0.05"
            value={threshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
            className="accent-cyan-400 w-20"
          />
        </label>

        {videoUrl && (
          <button
            type="button"
            onClick={() => void togglePlay()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pausar
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Analizar video
              </>
            )}
          </button>
        )}
      </div>

      {/* Model status / pending error */}
      {status.error && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <div className="font-semibold">Integración pendiente / Modelo no disponible</div>
            <p className="mt-0.5 opacity-90">{status.error}</p>
          </div>
        </div>
      )}

      {/* Video + Canvas Overlay (takes ~70% dominant height) */}
      <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-white/10 bg-[#050b14] flex items-center justify-center">
        {!videoUrl ? (
          <div className="text-center p-5 max-w-xs">
            <Film className="w-8 h-8 text-cyan-400/70 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-200">
              Análisis Neuronal de Video Local (v5.3.0)
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Selecciona un video MP4 o WebM para analizarlo con{' '}
              <code className="text-cyan-300">D-FINE-Obj365 + SegFormer + Stixels 3D</code> y calibración de altura/pasos.
            </p>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              playsInline
              controls
              onPlay={() => {
                setIsPlaying(true);
                void startAnalysisLoop();
              }}
              onPause={() => {
                setIsPlaying(false);
                stopAnalysisLoop();
              }}
              onEnded={() => {
                setIsPlaying(false);
                stopAnalysisLoop();
              }}
              className="max-w-full max-h-full object-contain"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
          <span className="px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-cyan-500/40 text-[10px] font-semibold text-cyan-200 truncate">
            {analyzing ? `${status.modelName.split(' ')[0]} · En vivo` : 'Video IA v5.3.0'}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-emerald-400/40 text-[10px] font-mono text-emerald-200 truncate">
            {poseCal.statusBadge} · Paso #{motionState.totalSteps}
          </span>
        </div>
      </div>

      {/* Real-time Video Summary */}
      {videoUrl && !status.error && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/75 border border-white/10 text-xs">
          <div className="text-slate-300">
            <span className="font-semibold text-cyan-300">
              {detections.length} objetos en cuadro
            </span>
            {status.inferenceTimeMs !== null && (
              <span className="text-slate-400 ml-2">· {status.inferenceTimeMs} ms</span>
            )}
            {stixelPlan && (
              <span className="text-emerald-300 ml-2 font-medium">
                · {stixelPlan.guidanceText}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSpeakDescription(buildSummary())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-medium"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Escuchar resumen
          </button>
        </div>
      )}
    </div>
  );
};
