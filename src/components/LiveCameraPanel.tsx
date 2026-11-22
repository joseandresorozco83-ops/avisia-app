import React, { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, AlertTriangle, Radar, SwitchCamera } from 'lucide-react';
import { cameraService, type CameraDeviceInfo } from '../services/CameraService';
import { detectorService } from '../services/DetectorService';
import {
  depthProximityService,
  type ProximityAssessment,
} from '../services/DepthProximityService';
import {
  depthModelService,
  type DepthMapSummary,
} from '../services/DepthModelService';
import { telemetryService } from '../services/TelemetryService';
import { speechService } from '../services/SpeechService';
import type { Detection } from '../types/avicia';

interface LiveCameraPanelProps {
  threshold: number;
  autoStart?: boolean;
  expandedView?: boolean;
  fastMode?: boolean;
  depthAnythingEnabled?: boolean;
  onCameraStateChange: (active: boolean) => void;
  onDetectionsReady: (detections: Detection[]) => void;
}

export const LiveCameraPanel: React.FC<LiveCameraPanelProps> = ({
  threshold,
  autoStart = false,
  expandedView = false,
  fastMode = false,
  depthAnythingEnabled = false,
  onCameraStateChange,
  onDetectionsReady,
}) => {
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectorPendingNote, setDetectorPendingNote] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState<number>(0);
  const [corridorSensorOn, setCorridorSensorOn] = useState<boolean>(true);
  const [proximity, setProximity] = useState<ProximityAssessment | null>(null);
  const [switchingCamera, setSwitchingCamera] = useState<boolean>(false);
  const [depthSummary, setDepthSummary] = useState<DepthMapSummary | null>(null);
  const [depthLoading, setDepthLoading] = useState<boolean>(false);
  const depthSummaryRef = useRef<DepthMapSummary | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<number | null>(null);

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
    }, 450);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [depthAnythingEnabled, cameraActive]);

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

  const drawBoxes = (dets: Detection[], prox?: ProximityAssessment | null) => {
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

    // Draw walking-corridor guide (lower-center zone)
    if (corridorSensorOn) {
      const cx1 = width * 0.32;
      const cx2 = width * 0.68;
      const cy1 = height * 0.48;
      const cy2 = height * 0.94;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle =
        prox?.level === 'danger'
          ? 'rgba(244, 63, 94, 0.85)'
          : prox?.level === 'caution'
            ? 'rgba(245, 158, 11, 0.8)'
            : 'rgba(34, 211, 238, 0.35)';
      ctx.strokeRect(cx1, cy1, cx2 - cx1, cy2 - cy1);
      ctx.restore();
    }

    for (const det of dets) {
      const x = (det.bbox.x / 100) * width;
      const y = (det.bbox.y / 100) * height;
      const w = (det.bbox.width / 100) * width;
      const h = (det.bbox.height / 100) * height;

      const isFrontObstacle =
        det.isInanimateObstacle && det.proximityZone !== 'side';
      const strokeColor = isFrontObstacle ? '#f59e0b' : '#22d3ee';

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(3, width * 0.005);
      ctx.strokeRect(x, y, w, h);

      const confPct =
        typeof det.confidence === 'number'
          ? ` ${Math.round(det.confidence * 100)}%`
          : '';
      const label = `${det.labelEs}${confPct}`;
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
      cameraService.stopCamera(videoRef.current);
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

  const handleStart = async () => {
    if (!videoRef.current) return;
    setError(null);
    setDetectorPendingNote(null);
    speechService.unlockAudio();

    try {
      await cameraService.startCamera(videoRef.current, selectedDeviceId || undefined);
      setCameraActive(true);
      onCameraStateChange(true);
      await refreshDevices();

      const detStatus = await detectorService.initialize(threshold);
      if (!detStatus.ready) {
        setDetectorPendingNote(
          detStatus.error ??
            'Cámara activa. El modelo de visión no está disponible en este momento; no se superponen cajas ficticias.'
        );
        return;
      }

      const runFrame = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const res = await detectorService.detectOnVideoFrame(videoRef.current, threshold);
          const prox = corridorSensorOn
            ? depthProximityService.analyzeVideoCorridor(videoRef.current, res.detections)
            : null;
          setProximity(prox);

          const combinedDetections = [...res.detections];
          const hasFrontObstacle = combinedDetections.some(
            (d) => d.isInanimateObstacle && d.proximityZone !== 'side'
          );

          if (
            corridorSensorOn &&
            prox &&
            !hasFrontObstacle &&
            (prox.verticalObstacleDetected ||
              prox.floorVariationDetected ||
              depthSummaryRef.current?.closeObstacleAhead)
          ) {
            const depthDist = depthSummaryRef.current?.estimatedMeters;
            combinedDetections.push({
              id: `corridor-${Date.now()}`,
              category: 'obstacle',
              labelEs: depthSummaryRef.current?.closeObstacleAhead
                ? `Obstáculo a ${depthDist} m`
                : prox.verticalObstacleDetected
                  ? 'Obstáculo vertical adelante'
                  : 'Variación en el suelo',
              source: 'real_video',
              confidence: Math.min(0.94, Math.max(0.55, prox.corridorScore / 100)),
              bbox: { x: 34, y: 50, width: 32, height: 40 },
              confirmationStatus: 'confirmed',
              priority: 91,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              isNew: true,
              isInanimateObstacle: true,
              proximityZone: depthSummaryRef.current?.closeObstacleAhead
                ? 'front_close'
                : 'front_mid',
            });
          }

          setLiveCount(combinedDetections.length);
          drawBoxes(combinedDetections, prox);
          telemetryService.record({
            timestamp: Date.now(),
            mode: fastMode ? 'street_fast' : 'live_camera',
            inferenceMs: res.inferenceTimeMs,
            detectionsCount: combinedDetections.length,
            frontObstacle: combinedDetections.find((d) => d.isInanimateObstacle)?.labelEs ?? null,
            ttcSeconds: prox?.ttcSeconds ?? null,
            policy: 'live',
          });
          onDetectionsReady(combinedDetections);
        } catch {
          // Ignore transient frame error
        }
      };

      void runFrame();
      loopRef.current = window.setInterval(() => {
        void runFrame();
      }, fastMode ? 220 : 650);
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
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    clearCanvas();
    setLiveCount(0);
    setProximity(null);
    cameraService.stopCamera(videoRef.current);
    setCameraActive(false);
    onCameraStateChange(false);
    onDetectionsReady([]);
  };

  return (
    <div className={expandedView ? 'flex flex-col h-full min-h-0 gap-2' : 'space-y-2.5'}>
      {/* Controls */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-[#181c24] border border-[#3c494c]/40">
        <div className="flex items-center gap-2">
          {!cameraActive ? (
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] font-bold text-sm transition-colors"
            >
              <Video className="w-4 h-4" />
              Activar cámara
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#93000a] hover:bg-[#b91c1c] text-[#ffdad6] font-bold text-sm transition-colors"
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
              title="Cambiar entre cámaras disponibles"
              className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl bg-[#262a33] hover:bg-[#31353e] border border-[#3c494c]/50 text-[#8aebff] font-semibold text-xs transition-colors disabled:opacity-50"
            >
              <SwitchCamera className={`w-4 h-4 ${switchingCamera ? 'animate-spin' : ''}`} />
              Cambiar ({devices.length})
            </button>
          )}
        </div>

        <select
          aria-label="Seleccionar cámara"
          value={selectedDeviceId}
          onChange={(e) => void handleSwitchToDevice(e.target.value)}
          disabled={switchingCamera}
          className="h-11 bg-[#0a0e16] border border-[#3c494c]/50 rounded-xl px-2.5 text-xs text-[#dfe2ee] max-w-[140px]"
        >
          {devices.length === 0 ? (
            <option value="">Cámara predeterminada</option>
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
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {detectorPendingNote && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>{detectorPendingNote}</span>
        </div>
      )}

      {/* Video + Bounding Box Canvas Overlay */}
      <div
        className={`relative w-full rounded-2xl overflow-hidden border border-[#3c494c]/40 bg-[#05080f] flex items-center justify-center ${
          expandedView ? 'flex-1 min-h-[240px]' : 'aspect-[16/10]'
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
          <div className="text-center p-5 max-w-xs">
            <Video className="w-8 h-8 text-cyan-400/70 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-200">
              Cámara en vivo
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Activa la cámara para detectar objetos en tiempo real con cajas delimitadoras y avisos de voz.
            </p>
          </div>
        )}

        {cameraActive && (
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
            <span className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-emerald-400/40 text-[10px] font-semibold text-emerald-300 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              En vivo
            </span>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={handleCycleCamera}
                  disabled={switchingCamera}
                  aria-label="Cambiar cámara"
                  className="p-1.5 rounded-full bg-slate-950/80 border border-cyan-400/40 text-cyan-200 hover:bg-slate-900 transition-colors"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-white/15 text-[10px] font-medium text-slate-200">
                {liveCount} {liveCount === 1 ? 'objeto' : 'objetos'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Corridor Depth & Proximity Bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#181c24] border border-[#3c494c]/40 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Radar
            className={`w-4 h-4 shrink-0 ${
              proximity?.level === 'danger'
                ? 'text-rose-400'
                : proximity?.level === 'caution'
                  ? 'text-amber-400'
                  : 'text-cyan-400'
            }`}
          />
          <span className="text-slate-200 truncate">
            {!cameraActive
              ? 'Sensor de profundidad y camino listo'
              : depthLoading
                ? 'Cargando Depth Anything V2 (WebGPU/WASM)...'
                : depthSummary
                  ? `Depth V2 (${depthSummary.backend.toUpperCase()} · ${depthSummary.inferenceMs}ms): ~${depthSummary.estimatedMeters} m`
                  : proximity?.alertText
                    ? proximity.alertText
                    : proximity?.estimatedMeters !== null && proximity?.estimatedMeters !== undefined
                      ? `Objeto más cercano: ~${proximity.estimatedMeters} m`
                      : 'Camino despejado frente a ti'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCorridorSensorOn((v) => !v)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
            corridorSensorOn
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
              : 'bg-slate-800 border-white/10 text-slate-400'
          }`}
        >
          {corridorSensorOn ? 'Sensor camino: ON' : 'Sensor camino: OFF'}
        </button>
      </div>
    </div>
  );
};
