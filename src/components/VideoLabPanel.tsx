import React, { useEffect, useRef, useState } from 'react';
import { Film, Play, Pause, AlertCircle, SlidersHorizontal, Volume2 } from 'lucide-react';
import type { Detection, DetectorStatus } from '../types/avicia';
import { detectorService } from '../services/DetectorService';

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (loopRef.current !== null) {
        window.clearInterval(loopRef.current);
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const drawBoxes = (dets: Detection[]) => {
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

    for (const det of dets) {
      const x = (det.bbox.x / 100) * width;
      const y = (det.bbox.y / 100) * height;
      const w = (det.bbox.width / 100) * width;
      const h = (det.bbox.height / 100) * height;

      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(2, width * 0.004);
      ctx.strokeRect(x, y, w, h);

      const label = `${det.labelEs} ${Math.round((det.confidence ?? 0) * 100)}%`;
      ctx.font = `bold ${Math.max(13, Math.round(width * 0.022))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const boxHeight = Math.max(22, Math.round(width * 0.035));

      ctx.fillStyle = '#22d3ee';
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
    setAnalyzing(false);
  };

  const analyzeSingleFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    try {
      const res = await detectorService.detectOnVideoFrame(video, threshold);
      setStatus(detectorService.getStatus());
      setDetections(res.detections);
      drawBoxes(res.detections);
      onDetectionsReady(res.detections);
    } catch {
      setStatus(detectorService.getStatus());
      drawBoxes([]);
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
    await analyzeSingleFrame();
    loopRef.current = window.setInterval(() => {
      void analyzeSingleFrame();
    }, 650);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopAnalysisLoop();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);
    setDetections([]);
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
      return 'No se detectan objetos sobre el umbral en el cuadro actual del video.';
    }
    const labels = Array.from(new Set(detections.map((d) => d.labelEs.toLowerCase())));
    return `En el video proporcionado identifico: ${labels.join(', ')}.`;
  };

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-white/10">
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
            onClick={togglePlay}
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

      {/* Video + Canvas Overlay */}
      <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden border border-white/10 bg-[#050b14] flex items-center justify-center">
        {!videoUrl ? (
          <div className="text-center p-5 max-w-xs">
            <Film className="w-8 h-8 text-cyan-400/70 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-200">
              Análisis de Video Local
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Selecciona un video MP4 o WebM para analizarlo cuadro por cuadro con{' '}
              <code className="text-cyan-300">EfficientDet-Lite0</code> en tu navegador.
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

        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-950/80 border border-cyan-500/40 text-[11px] text-cyan-200 pointer-events-none">
          {analyzing ? 'Analizando cuadros...' : 'Modo Video IA'}
        </div>
      </div>

      {/* Real-time Video Summary */}
      {videoUrl && !status.error && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/75 border border-white/10 text-xs">
          <div className="text-slate-300">
            <span className="font-semibold text-cyan-300">
              {detections.length} objetos en cuadro
            </span>
            {status.inferenceTimeMs !== null && (
              <span className="text-slate-400 ml-2">· {status.inferenceTimeMs} ms</span>
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

