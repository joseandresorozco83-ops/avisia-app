import React, { useRef, useState, useEffect } from 'react';
import { Upload, Cpu, AlertCircle, Volume2, SlidersHorizontal, Sparkles, FileText, Loader2 } from 'lucide-react';
import type { Detection, DetectorStatus } from '../types/avicia';
import { detectorService } from '../services/DetectorService';
import { assistiveVisionService } from '../services/AssistiveVisionService';
import { formatDistanceSteps } from '../services/MessagePolicy';

interface VisionLabPanelProps {
  threshold: number;
  onThresholdChange: (value: number) => void;
  onDetectionsReady: (detections: Detection[], inferenceMs: number) => void;
  onSpeakDescription: (text: string) => void;
}

export const VisionLabPanel: React.FC<VisionLabPanelProps> = ({
  threshold,
  onThresholdChange,
  onDetectionsReady,
  onSpeakDescription,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<DetectorStatus>(() => detectorService.getStatus());
  const [detections, setDetections] = useState<Detection[]>([]);
  const [running, setRunning] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistText, setAssistText] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const drawBoxes = (dets: Detection[]) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const det of dets) {
      const x = (det.bbox.x / 100) * canvas.width;
      const y = (det.bbox.y / 100) * canvas.height;
      const w = (det.bbox.width / 100) * canvas.width;
      const h = (det.bbox.height / 100) * canvas.height;

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = Math.max(2, canvas.width * 0.004);
      ctx.strokeRect(x, y, w, h);

      const label = `${det.labelEs} ${Math.round((det.confidence ?? 0) * 100)}%`;
      ctx.font = `bold ${Math.max(13, Math.round(canvas.width * 0.02))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const boxHeight = Math.max(22, Math.round(canvas.width * 0.032));

      ctx.fillStyle = '#34d399';
      ctx.fillRect(x, Math.max(0, y - boxHeight), textWidth + 12, boxHeight);
      ctx.fillStyle = '#060d18';
      ctx.fillText(label, x + 6, Math.max(boxHeight - 6, y - 6));
    }
  };

  const runDetection = async () => {
    if (!imgRef.current) return;
    setRunning(true);
    try {
      const result = await detectorService.detectOnImage(imgRef.current, threshold);
      setStatus(detectorService.getStatus());
      setDetections(result.detections);
      drawBoxes(result.detections);
      onDetectionsReady(result.detections, result.inferenceTimeMs);
    } catch {
      setStatus(detectorService.getStatus());
      setDetections([]);
      drawBoxes([]);
      onDetectionsReady([], 0);
    } finally {
      setRunning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const nextUrl = URL.createObjectURL(file);
    setImageUrl(nextUrl);
    setDetections([]);
  };

  const buildSimpleDescription = (): string => {
    if (detections.length === 0) {
      return 'No se encontraron objetos sobre el umbral de confianza seleccionado.';
    }
    const items = detections.slice(0, 4).map((d) => {
      const pos = d.clockPosition ?? 'al frente';
      const dist = formatDistanceSteps(d.estimatedMeters);
      return dist ? `${d.labelEs.toLowerCase()} ${pos} (${dist})` : `${d.labelEs.toLowerCase()} ${pos}`;
    });
    return `Detección real en imagen: ${items.join('; ')}.`;
  };

  const handleDescribeImageAi = async () => {
    if (!imgRef.current) return;
    setAssistBusy(true);
    try {
      const res = await assistiveVisionService.describeScene(
        imgRef.current,
        detections,
        null,
        null
      );
      setAssistText(res.text);
      onSpeakDescription(res.text);
    } finally {
      setAssistBusy(false);
    }
  };

  const handleReadImageText = async () => {
    if (!imgRef.current) return;
    setAssistBusy(true);
    try {
      const res = await assistiveVisionService.readText(imgRef.current);
      setAssistText(res.text);
      onSpeakDescription(res.text);
    } finally {
      setAssistBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          Cargar imagen local
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Umbral: {Math.round(threshold * 100)}%</span>
          <input
            type="range"
            min="0.2"
            max="0.9"
            step="0.05"
            value={threshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
            className="accent-cyan-400 w-24"
          />
        </label>

        <button
          type="button"
          disabled={!imageUrl || running}
          onClick={runDetection}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors"
        >
          <Cpu className="w-4 h-4" />
          {running ? 'Analizando...' : 'Ejecutar detector'}
        </button>
      </div>

      {/* Status / Error banner */}
      {status.error && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <div className="font-semibold">Integración pendiente / Modelo no disponible</div>
            <p className="mt-0.5 opacity-90">{status.error}</p>
            <p className="mt-1 text-[11px] text-amber-300/80">
              AVISIA nunca muestra cajas simuladas como si fueran inferencias reales.
            </p>
          </div>
        </div>
      )}

      {/* Image + Canvas container */}
      <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-slate-800 bg-[#071120] flex items-center justify-center">
        {!imageUrl ? (
          <div className="text-center p-6 max-w-sm">
            <Upload className="w-8 h-8 text-cyan-400/70 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-200">
              Laboratorio de Visión Artificial (Modo B)
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Carga una fotografía local para ejecutar el detector{' '}
              <code className="text-cyan-300">{status.modelName}</code>, leer texto OCR o describir la escena con IA.
            </p>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Imagen cargada para detección"
              onLoad={runDetection}
              className="max-w-full max-h-full object-contain"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          </div>
        )}

        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-950/85 border border-emerald-500/40 text-[11px] text-emerald-200">
          Modo B · Inferencia real en navegador
        </div>
      </div>

      {/* Real inference summary + speak / Scene AI / OCR buttons */}
      {imageUrl && !status.error && (
        <div className="space-y-2 p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-slate-300">
              <span className="font-semibold text-emerald-300">
                {detections.length} detecciones reales
              </span>
              {status.inferenceTimeMs !== null && (
                <span className="text-slate-400 ml-2">
                  · {status.inferenceTimeMs} ms
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={assistBusy}
                onClick={() => void handleDescribeImageAi()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#22d3ee] hover:bg-[#8aebff] disabled:opacity-50 text-[#00363e] font-semibold"
              >
                {assistBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Escena IA
              </button>
              <button
                type="button"
                disabled={assistBusy}
                onClick={() => void handleReadImageText()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#4edea3] hover:bg-[#6ffbbe] disabled:opacity-50 text-[#003824] font-semibold"
              >
                <FileText className="w-3.5 h-3.5" />
                Leer texto
              </button>
              <button
                type="button"
                onClick={() => onSpeakDescription(buildSimpleDescription())}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-medium"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Escuchar
              </button>
            </div>
          </div>
          {assistText && (
            <p className="p-2 rounded-lg bg-slate-950/80 border border-slate-700/60 text-slate-200 leading-relaxed">
              {assistText}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

