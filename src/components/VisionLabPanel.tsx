import React, { useRef, useState, useEffect } from 'react';
import { Upload, Cpu, AlertCircle, Volume2, SlidersHorizontal, Sparkles, FileText, Loader2, Banknote } from 'lucide-react';
import type { Detection, DetectorStatus } from '../types/avicia';
import { detectorService } from '../services/DetectorService';
import { architecturalSegmenterService } from '../services/ArchitecturalSegmenterService';
import { depthModelService } from '../services/DepthModelService';
import { depthProximityService } from '../services/DepthProximityService';
import {
  cameraCalibrationService,
  type CameraPoseCalibration,
} from '../services/CameraCalibrationService';
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
  const [poseCal, setPoseCal] = useState<CameraPoseCalibration>(() =>
    cameraCalibrationService.getCalibration()
  );

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const unsub = detectorService.onStatusChange((st) => setStatus(st));
    return unsub;
  }, []);

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
        ctx.lineWidth = sec.index === 2 ? 2.5 : 1.5;
        ctx.strokeRect(sx, baseY - barH, sw, barH);
        const fontSize = Math.max(11, Math.round(canvas.width * 0.018));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        const stepTxt = sec.freeSteps >= 4 ? '3+p' : `${sec.freeSteps}p`;
        ctx.fillText(`${sec.shortLabel}·${stepTxt}`, sx + sw / 2, baseY - 6);
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
                : det.isInanimateObstacle
                  ? '#f59e0b'
                  : '#22d3ee';

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2.5, canvas.width * 0.0045);
      ctx.strokeRect(x, y, w, h);

      const distPart =
        typeof det.estimatedMeters === 'number' ? ` · ${det.estimatedMeters}m` : '';
      const label = `${det.labelEs}${distPart} ${Math.round((det.confidence ?? 0) * 100)}%`;
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
      let rawMerged = [...result.detections];
      let archResult = null;
      let depthResult = null;
      try {
        archResult = await architecturalSegmenterService.analyzeSource(imgRef.current);
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

      if (archResult) {
        const depthConfirmsFlatFloor =
          depthResult !== null &&
          !depthResult.stepDetectedInDepth &&
          (depthResult.groundPlanarityR2 ?? 1) >= 0.82;
        const depthConfirmsRealStep = Boolean(depthResult?.stepDetectedInDepth);

        const existing = new Set(rawMerged.map((d) => d.labelEs.toLowerCase()));
        for (const ad of archResult.detections) {
          const lower = ad.labelEs.toLowerCase();
          if (lower.includes('escalera eléctrica') && !depthConfirmsRealStep) continue;
          if ((lower.includes('escalera') || lower.includes('grada')) && depthConfirmsFlatFloor) {
            continue;
          }
          if (!existing.has(lower)) {
            rawMerged.push({ ...ad, source: 'real_image' });
            existing.add(lower);
          }
        }
      }

      // Cross-modal semantic disambiguation (Cortina vs Puerta, Mesa/Escritorio vs Mueble, Pizarra vs Refrigerador)
      const hasCurtain = rawMerged.some((d) => d.labelEs === 'Cortina');
      const hasTableOrDesk = rawMerged.some(
        (d) => d.labelEs === 'Mesa' || d.labelEs === 'Escritorio' || d.labelEs === 'Mesa baja'
      );
      const hasWhiteboard = rawMerged.some((d) => d.labelEs === 'Pizarra');
      let merged = rawMerged.filter((d) => {
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

      merged = enrichDoorsWithDepth(merged, archResult, depthResult).map((d) => ({
        ...d,
        source: 'real_image',
      }));

      // 3D Camera Calibration + Corridor Wall / Extinguisher / Counter analysis on the uploaded image
      const prox = depthProximityService.analyzeVideoCorridor(imgRef.current, merged);
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
          id: `img-corridor-${Date.now()}`,
          category: 'obstacle',
          labelEs: isExtinguisher
            ? 'Pared y extintor'
            : isWall
              ? 'Pared muy cerca'
              : isCounter
                ? 'Mostrador o pared'
                : 'Obstáculo frontal',
          source: 'real_image',
          confidence: Math.min(0.95, Math.max(0.75, prox.corridorScore / 100)),
          bbox: { x: 28, y: 26, width: 44, height: 56 },
          confirmationStatus: 'confirmed',
          priority: 97,
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          isNew: true,
          isInanimateObstacle: true,
          estimatedMeters: isWall ? 0.8 : 1.2,
          clockPosition: 'a las 12',
          proximityZone: 'front_close',
        });
      }

      const cal = cameraCalibrationService.updateFromVisualScene({
        videoWidth: imgRef.current.naturalWidth || 640,
        videoHeight: imgRef.current.naturalHeight || 480,
        walkableCorridorPct: archResult?.walkableCorridorPct ?? null,
        sectorFloorReachPct: archResult?.sectorFloorReachPct ?? null,
      });
      setPoseCal(cal);

      const plan = computeStixelCorridor(merged, archResult, depthResult, prox);
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
    <div className="flex-1 min-h-0 h-full flex flex-col gap-1.5 overflow-hidden">
      {/* Controls bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/80 border border-slate-800">
        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors">
          <Upload className="w-3.5 h-3.5" />
          Subir foto
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-slate-300">
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

        <button
          type="button"
          disabled={!imageUrl || running}
          onClick={runDetection}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors"
        >
          <Cpu className="w-3.5 h-3.5" />
          {running ? 'Analizando...' : 'Analizar'}
        </button>
      </div>

      {/* Status / Error banner */}
      {status.error && (
        <div className="shrink-0 p-2 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="truncate">{status.error}</div>
        </div>
      )}

      {/* Image + Canvas container (takes ~70% dominant height) */}
      <div className="relative flex-1 min-h-0 w-full rounded-xl overflow-hidden border border-slate-800 bg-[#071120] flex items-center justify-center">
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

        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
          <span className="px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-emerald-500/40 text-[10px] font-semibold text-emerald-200 truncate">
            {status.modelName.split(' ')[0]} · v5.3.0
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-cyan-400/40 text-[10px] font-mono text-cyan-200 truncate">
            {poseCal.statusBadge}
          </span>
        </div>
      </div>

      {/* Real inference summary + speak / Scene AI / OCR buttons */}
      {imageUrl && !status.error && (
        <div className="shrink-0 space-y-1.5 p-2 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
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

