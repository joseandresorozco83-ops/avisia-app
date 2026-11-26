import React, { useRef, useState, useEffect } from 'react';
import { Upload, Cpu, AlertCircle, Volume2, SlidersHorizontal, Sparkles, FileText, Loader2, Banknote } from 'lucide-react';
import type { Detection, DetectorStatus } from '../types/avicia';
import { detectorService } from '../services/DetectorService';
import { architecturalSegmenterService } from '../services/ArchitecturalSegmenterService';
import { depthModelService } from '../services/DepthModelService';
import {
  computeStixelCorridor,
  enrichDoorsWithDepth,
  type StixelNavigationPlan,
} from '../services/DoorAndStixelService';
import { assistiveVisionService } from '../services/AssistiveVisionService';
import { currencyRecognitionService } from '../services/CurrencyRecognitionService';
import { formatDistanceSteps } from '../services/MessagePolicy';

interface VisionLabPanelProps {
  threshold: number;
  autoEscalateLowConfVlm?: boolean;
  offlineVlmEnabled?: boolean;
  onThresholdChange: (value: number) => void;
  onDetectionsReady: (detections: Detection[], inferenceMs: number) => void;
  onSpeakDescription: (text: string) => void;
}

export const VisionLabPanel: React.FC<VisionLabPanelProps> = ({
  threshold,
  autoEscalateLowConfVlm = true,
  offlineVlmEnabled = false,
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
  const [assistBadge, setAssistBadge] = useState<string | null>(null);
  const [stixelPlan, setStixelPlan] = useState<StixelNavigationPlan | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const drawBoxes = (dets: Detection[], plan?: StixelNavigationPlan | null) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (plan) {
      const sectorW = canvas.width / 5;
      const maxBarH = canvas.height * 0.24;
      const baseY = canvas.height - 6;
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
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, baseY - barH, sw, barH);
      }
      ctx.restore();
    }

    for (const det of dets) {
      const x = (det.bbox.x / 100) * canvas.width;
      const y = (det.bbox.y / 100) * canvas.height;
      const w = (det.bbox.width / 100) * canvas.width;
      const h = (det.bbox.height / 100) * canvas.height;

      const color =
        det.doorState === 'open'
          ? '#34d399'
          : det.doorState === 'semi_open'
            ? '#fb7185'
            : det.doorState === 'closed'
              ? '#f59e0b'
              : det.id.startsWith('arch-')
                ? '#c084fc'
                : '#22d3ee';

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, canvas.width * 0.004);
      ctx.strokeRect(x, y, w, h);

      const label = `${det.labelEs} ${Math.round((det.confidence ?? 0) * 100)}%`;
      ctx.font = `bold ${Math.max(13, Math.round(canvas.width * 0.02))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const boxHeight = Math.max(22, Math.round(canvas.width * 0.032));

      ctx.fillStyle = color;
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
      let merged = [...result.detections];
      let archResult = null;
      let depthResult = null;
      try {
        archResult = await architecturalSegmenterService.analyzeSource(imgRef.current);
        if (archResult) {
          const existing = new Set(merged.map((d) => d.labelEs.toLowerCase()));
          for (const ad of archResult.detections) {
            if (!existing.has(ad.labelEs.toLowerCase())) {
              merged.push({ ...ad, source: 'real_image' });
              existing.add(ad.labelEs.toLowerCase());
            }
          }
        }
      } catch {
        // Architectural segmentation is best-effort enrichment
      }
      if (depthModelService.getStatus().ready) {
        try {
          depthResult = await depthModelService.estimateFromSource(imgRef.current);
        } catch {
          // Optional depth enrichment
        }
      }
      merged = enrichDoorsWithDepth(merged, archResult, depthResult).map((d) => ({
        ...d,
        source: 'real_image',
      }));
      const plan = computeStixelCorridor(merged, archResult, depthResult, null);
      setStixelPlan(plan);
      setStatus(detectorService.getStatus());
      setDetections(merged);
      drawBoxes(merged, plan);
      onDetectionsReady(merged, result.inferenceTimeMs);

      // v5.0 Auto-escalation to Structured VLM when local detector has 0 hits or low confidence (< 0.55)
      const maxConf = merged.reduce((m, d) => Math.max(m, d.confidence ?? 0), 0);
      if (autoEscalateLowConfVlm && (merged.length === 0 || maxConf < 0.55) && imgRef.current) {
        setAssistBusy(true);
        try {
          const vlm = await assistiveVisionService.describeScene(
            imgRef.current,
            merged,
            null,
            depthResult,
            archResult,
            plan,
            { allowOfflineVlm: offlineVlmEnabled }
          );
          setAssistText(vlm.text);
          setAssistBadge(
            vlm.engine === 'gemini'
              ? `Verificación Semántica IA · ${vlm.elapsedMs}ms${vlm.structured?.confidence ? ` (${vlm.structured.confidence})` : ''}`
              : vlm.engine === 'offline_vlm'
                ? `${vlm.modelLabel ?? 'VLM Offline'} · ${vlm.elapsedMs}ms`
                : `Síntesis local · ${vlm.elapsedMs}ms`
          );
        } finally {
          setAssistBusy(false);
        }
      }
    } catch {
      setStatus(detectorService.getStatus());
      setDetections([]);
      setStixelPlan(null);
      drawBoxes([], null);
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
        null,
        null,
        stixelPlan,
        { allowOfflineVlm: offlineVlmEnabled }
      );
      setAssistText(res.text);
      setAssistBadge(
        res.engine === 'gemini'
          ? `VLM Estructurado · ${res.elapsedMs}ms`
          : res.engine === 'offline_vlm'
            ? `${res.modelLabel ?? 'VLM Offline'} · ${res.elapsedMs}ms`
            : `Síntesis local · ${res.elapsedMs}ms`
      );
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

  const handleIdentifyImageBanknote = async () => {
    if (!imgRef.current) return;
    setAssistBusy(true);
    try {
      const res = await currencyRecognitionService.identifyBanknote(imgRef.current);
      setAssistText(res.spokenText);
      onSpeakDescription(res.spokenText);
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
                disabled={assistBusy}
                onClick={() => void handleIdentifyImageBanknote()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-semibold"
              >
                <Banknote className="w-3.5 h-3.5" />
                ¿Qué billete es?
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
          {stixelPlan && (
            <p className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 font-medium">
              Stixel 5 sectores: {stixelPlan.guidanceText}
            </p>
          )}
          {assistText && (
            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-700/60 text-slate-200 leading-relaxed space-y-1">
              {assistBadge && (
                <div className="text-[10px] font-mono text-cyan-300">{assistBadge}</div>
              )}
              <p>{assistText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

