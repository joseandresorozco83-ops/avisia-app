import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  GitBranch,
  Activity,
  Eye,
  ShieldCheck,
  Gauge,
  Download,
  Compass,
  Footprints,
  Filter,
} from 'lucide-react';
import type {
  AppPresetId,
  Detection,
  OperationMode,
  PolicyEvaluation,
  PolicyType,
} from '../types/avicia';
import { telemetryService } from '../services/TelemetryService';
import { cameraCalibrationService } from '../services/CameraCalibrationService';
import { pedestrianNavigationService } from '../services/PedestrianNavigationService';
import { getPresetById } from '../services/AppPresets';
import { formatDistanceSteps } from '../services/MessagePolicy';

interface ProcessingPanelProps {
  mode: OperationMode;
  detections: Detection[];
  policy: PolicyType;
  evaluation: PolicyEvaluation | null;
  highlightedDetectionId: string | null;
  detectorModelName?: string;
  activePreset?: AppPresetId;
  onChangePolicy: (policy: PolicyType) => void;
  onHighlightDetection: (id: string | null) => void;
}

export const ProcessingPanel: React.FC<ProcessingPanelProps> = ({
  mode,
  detections,
  policy,
  evaluation,
  highlightedDetectionId,
  detectorModelName,
  activePreset = 'indoor',
  onChangePolicy,
  onHighlightDetection,
}) => {
  const realScores = detections
    .map((d) => d.confidence)
    .filter((c): c is number => typeof c === 'number');
  const avgConf =
    realScores.length > 0
      ? Math.round((realScores.reduce((acc, v) => acc + v, 0) / realScores.length) * 100)
      : null;

  const isAlert = Boolean(evaluation?.obstacleAlert);
  const telemetryStats = telemetryService.getStats();
  const cal = cameraCalibrationService.getCalibration();
  const nav = pedestrianNavigationService.getState();
  const presetInfo = getPresetById(activePreset);

  const shortModelLabel =
    mode === 'simulation'
      ? 'Simulado'
      : detectorModelName?.includes('Obj365')
        ? 'D-FINE-365'
        : detectorModelName?.includes('D-FINE-S')
          ? 'D-FINE-S'
          : detectorModelName?.includes('D-FINE-N')
            ? 'D-FINE-N'
            : detectorModelName?.includes('YOLOv10')
              ? 'YOLOv10n'
              : detectorModelName?.includes('Lite2')
                ? 'Lite2'
                : 'Lite0';

  const getDirectOrientationLabel = (det: Detection): string => {
    const cx = det.bbox.x + det.bbox.width / 2;
    if (cx < 36) return 'A tu izquierda';
    if (cx > 64) return 'A tu derecha';
    return 'Al frente';
  };

  const handleExportCsv = () => {
    const csv = telemetryService.exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `avisia-telemetria-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const json = telemetryService.exportJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `avisia-piloto-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Procesamiento inteligente"
      className="flex flex-col h-full min-h-0 gap-2.5 overflow-hidden"
    >
      {/* 1. Prominent Policy & Active Vocalization Banner */}
      <div
        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm ${
          isAlert
            ? 'bg-gradient-to-r from-[#ffb147]/20 via-[#1c2028] to-[#1c2028] border-[#ffb147]/50'
            : 'bg-gradient-to-r from-[#22d3ee]/15 via-[#1c2028] to-[#1c2028] border-[#3c494c]/60'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isAlert
                ? 'bg-[#ffb147]/25 text-[#ffddb8]'
                : 'bg-[#22d3ee]/20 text-[#8aebff]'
            }`}
          >
            {isAlert ? (
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            ) : (
              <GitBranch className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wide ${
                  isAlert ? 'text-[#ffb147]' : 'text-[#8aebff]'
                }`}
              >
                POLÍTICA {policy}: {policy === 'C01' ? 'PRIORIDAD Y NOVEDAD' : 'ORDEN DE LLEGADA'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-black uppercase ${
                  isAlert
                    ? 'bg-[#ffb147] text-[#2a1700]'
                    : 'bg-[#4edea3]/20 text-[#4edea3] border border-[#4edea3]/40'
                }`}
              >
                {isAlert ? 'Obstáculo Frontal' : mode === 'simulation' ? 'Simulado' : 'En Vivo'}
              </span>
            </div>
            <p className="text-sm sm:text-base font-semibold text-white mt-0.5 leading-snug truncate">
              {evaluation?.obstacleAlert
                ? evaluation.obstacleAlert.message
                : evaluation?.generatedMessage ?? evaluation?.reason ?? 'Evaluando contexto espacial.'}
            </p>
          </div>
        </div>

        {/* Policy Switcher Pills (C00 / C01) */}
        <div
          className="flex items-center gap-1.5 bg-[#0a0e16] p-1 rounded-xl border border-[#3c494c]/50 shrink-0"
          role="radiogroup"
          aria-label="Política de selección"
        >
          <button
            type="button"
            role="radio"
            aria-checked={policy === 'C00'}
            onClick={() => onChangePolicy('C00')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-extrabold transition-colors ${
              policy === 'C00'
                ? 'bg-[#22d3ee] text-[#00363e]'
                : 'text-[#bbc9cd] hover:text-white'
            }`}
          >
            C00
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={policy === 'C01'}
            onClick={() => onChangePolicy('C01')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-extrabold transition-colors ${
              policy === 'C01'
                ? 'bg-[#22d3ee] text-[#00363e]'
                : 'text-[#bbc9cd] hover:text-white'
            }`}
          >
            C01
          </button>
        </div>
      </div>

      {/* 2. Spatial Detections Table + Live Sensor/Mode Context Grid (Fills 100% height with zero empty void!) */}
      <div className="flex-1 min-h-0 bg-[#181c24] rounded-xl border border-[#3c494c]/50 flex flex-col justify-between overflow-hidden shadow-md">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 bg-[#1c2028] border-b border-[#3c494c]/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#8aebff]" />
              <span className="text-sm sm:text-base font-extrabold text-white">
                Registro de Detecciones Espaciales
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#4edea3]/15 border border-[#4edea3]/40 font-mono text-xs font-bold text-[#4edea3]">
              {detections.length} {detections.length === 1 ? 'Entidad Detectada' : 'Entidades Detectadas'}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
            {detections.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <ShieldCheck className="w-8 h-8 text-[#4edea3] mb-2" />
                <p className="text-base font-bold text-slate-100">
                  Corredor frontal despejado · Sin obstáculos críticos
                </p>
                <p className="text-xs sm:text-sm text-[#bbc9cd] mt-1">
                  El filtro contextual ({presetInfo.title}) está activo y monitoreando el camino.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0a0e16]/90 text-[#8aebff] font-mono text-xs uppercase border-b border-[#3c494c]/40">
                    <th className="py-2.5 px-4 font-bold">Objeto Detectado</th>
                    <th className="py-2.5 px-3 font-bold">Orientación Directa</th>
                    <th className="py-2.5 px-3 font-bold">Distancia / Pasos</th>
                    <th className="py-2.5 px-3 font-bold">Confianza</th>
                    <th className="py-2.5 px-4 font-bold text-right">Estado Audio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3c494c]/25 text-sm text-[#dfe2ee]">
                  {detections.map((det) => {
                    const isSelected = evaluation?.selectedDetectionIds.includes(det.id) ?? false;
                    const isHighlighted = highlightedDetectionId === det.id;
                    const isObstacle = det.isInanimateObstacle && det.proximityZone !== 'side';
                    const stepDesc = formatDistanceSteps(det.estimatedMeters);

                    return (
                      <tr
                        key={det.id}
                        onMouseEnter={() => onHighlightDetection(det.id)}
                        onMouseLeave={() => onHighlightDetection(null)}
                        className={`transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-[#22d3ee]/20'
                            : isObstacle
                              ? 'bg-[#ffb147]/10 hover:bg-[#ffb147]/18'
                              : 'hover:bg-[#1c2028]'
                        }`}
                      >
                        <td className="py-3 px-4 font-extrabold text-sm sm:text-base flex items-center gap-2.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isObstacle
                                ? 'bg-[#ffb147] animate-ping'
                                : isSelected
                                  ? 'bg-[#4edea3]'
                                  : 'bg-[#8aebff]'
                            }`}
                          />
                          <span className={isObstacle ? 'text-[#ffd6a7]' : 'text-white'}>
                            {det.labelEs}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-xs sm:text-sm text-[#8aebff]">
                          {getDirectOrientationLabel(det)}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs sm:text-sm text-slate-200">
                          {typeof det.estimatedMeters === 'number'
                            ? `${det.estimatedMeters} m (${stepDesc})`
                            : det.proximityZone === 'front_close'
                              ? 'Cerca (1–2 pasos)'
                              : 'Escena'}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs sm:text-sm font-bold text-[#4edea3]">
                          {typeof det.confidence === 'number'
                            ? `${Math.round(det.confidence * 100)}%`
                            : 'Escena POV'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isObstacle ? (
                            <span className="px-2.5 py-1 rounded-md bg-[#ffb147] text-[#2a1700] font-mono text-xs font-extrabold">
                              ALERTA FRONTAL
                            </span>
                          ) : isSelected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#4edea3]/20 text-[#4edea3] border border-[#4edea3]/40 font-mono text-xs font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              VOCALIZADO
                            </span>
                          ) : det.confirmationStatus === 'pending' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#262a33] text-[#ffb147] font-mono text-xs font-semibold">
                              <Clock className="w-3.5 h-3.5" />
                              CONFIRMANDO
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md bg-[#262a33] text-[#bbc9cd] font-mono text-xs font-semibold">
                              EN ESCENA
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Live Context, Calibration & Odometry Strip inside the card (eliminates empty black void!) */}
        <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 bg-[#12161f] border-t border-[#3c494c]/40">
          <div className="p-2.5 rounded-xl bg-[#181c24] border border-cyan-500/30 flex items-start gap-2.5">
            <Filter className="w-5 h-5 text-[#22d3ee] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#8aebff] uppercase">
                Filtro Contextual: {presetInfo.shortTitle}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug line-clamp-2">
                {activePreset === 'indoor'
                  ? 'Prioriza escritorios, sillas, puertas, cortinas y pizarras. Bloquea estufas y refrigeradores.'
                  : activePreset === 'home'
                    ? 'Habilita muebles del hogar, cocina (estufa, refrigerador) y dormitorios.'
                    : activePreset === 'street'
                      ? 'Exclusivo para calle: vehículos, peatones, postes y gradas.'
                      : presetInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#181c24] border border-emerald-500/30 flex items-start gap-2.5">
            <Compass className="w-5 h-5 text-[#4edea3] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#4edea3] uppercase">
                Calibración 3D (±45° Auto)
              </div>
              <p className="text-xs text-slate-200 font-semibold mt-0.5">
                {cal.statusBadge} · Inclinación {cal.pitchDownDeg > 0 ? `+${cal.pitchDownDeg}°` : `${cal.pitchDownDeg}°`}
              </p>
              <p className="text-[11px] text-slate-400">
                Horizonte dinámico al {cal.horizonRowPct}% · Autorregulado sin alarmas
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#181c24] border border-amber-500/30 flex items-start gap-2.5">
            <Footprints className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-amber-300 uppercase">
                Decisión por Sensores (GPS + IMU)
              </div>
              <p className="text-xs text-slate-200 font-semibold mt-0.5">
                {nav.statusBadge} · {nav.totalSteps} pasos ({nav.estimatedMetersMoved} m)
              </p>
              <p className="text-[11px] text-slate-400">
                {nav.sensorDecision === 'camera_panning_wait'
                  ? 'Giro rápido detectado: esperando enfoque para hablar'
                  : nav.sensorDecision === 'turn_new_view'
                    ? 'Nuevo rumbo detectado: narración inmediata habilitada'
                    : nav.sensorDecision === 'step_advance'
                      ? 'Paso confirmado: actualiza distancias sin cortar frases'
                      : 'Usuario estático: pausa de 11s para no repetir objetos'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Large, High-Contrast 4 Hardware & Pipeline KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
        <div className="p-3 bg-[#181c24] rounded-xl border border-[#3c494c]/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-xs font-bold uppercase">Motor Visión</span>
            <Gauge className="w-4 h-4 text-[#4edea3]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-lg sm:text-xl font-black text-[#4edea3]">
              {shortModelLabel}
            </span>
            <span className="font-mono text-xs text-slate-300 block">
              {mode === 'simulation'
                ? 'Escenas POV'
                : telemetryStats.count > 0
                  ? `p95 ${telemetryStats.p95LatencyMs}ms · ${telemetryStats.alertsPerMinute}/min`
                  : 'WASM / ONNX Local'}
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#4edea3] h-full rounded-full w-4/5" />
          </div>
        </div>

        <div className="p-3 bg-[#181c24] rounded-xl border border-[#3c494c]/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-xs font-bold uppercase">Entidades</span>
            <Eye className="w-4 h-4 text-[#8aebff]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-lg sm:text-xl font-black text-[#8aebff]">
              {detections.length}
            </span>
            <span className="font-mono text-xs text-slate-300 block">
              {evaluation?.selectedDetectionIds.length ?? 0} vocalizadas
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#8aebff] h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(18, detections.length * 22))}%` }}
            />
          </div>
        </div>

        <div className="p-3 bg-[#181c24] rounded-xl border border-[#3c494c]/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-xs font-bold uppercase">Confianza</span>
            <Activity className="w-4 h-4 text-[#2fd9f4]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-lg sm:text-xl font-black text-[#2fd9f4]">
              {avgConf !== null ? `${avgConf}%` : 'Demo POV'}
            </span>
            <span className="font-mono text-xs text-slate-300 block">
              {avgConf !== null ? 'Promedio real' : 'Escenario validado'}
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#2fd9f4] h-full rounded-full"
              style={{ width: `${avgConf ?? 85}%` }}
            />
          </div>
        </div>

        <div className="p-3 bg-[#181c24] rounded-xl border border-[#3c494c]/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-xs font-bold uppercase">Política</span>
            <ShieldCheck className="w-4 h-4 text-[#6ffbbe]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-lg sm:text-xl font-black text-[#6ffbbe]">{policy}</span>
            <span className="font-mono text-xs text-slate-300 block">
              {policy === 'C01' ? 'Prioridad activa' : 'Orden llegada'}
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#6ffbbe] h-full rounded-full w-full" />
          </div>
        </div>
      </div>

      {/* 4. Prominent Academic UAM Footer Strip */}
      <div className="px-3.5 py-2 bg-[#0a0e16] rounded-xl border border-[#3c494c]/50 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs text-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-white px-3 py-1 rounded-lg flex items-center shrink-0 shadow-sm">
            <img
              src="/uam-logo.png"
              alt="Universidad Americana UAM"
              className="h-6 w-auto object-contain"
            />
          </div>
          <div className="leading-tight">
            <span className="text-[#8aebff] font-extrabold uppercase tracking-wide text-xs sm:text-sm">
              PROYECTO AVISIA v5.4.0
            </span>
            <span className="text-slate-300 font-medium ml-1.5">
              · Asistencia Visual Inteligente — UAM Managua
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {telemetryStats.count > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181c24] hover:bg-[#262a33] border border-[#3c494c]/60 text-[#8aebff] font-mono text-xs font-bold transition-colors"
                title="Exportar latencias y detecciones de campo en CSV"
              >
                <Download className="w-3.5 h-3.5" />
                CSV ({telemetryStats.avgLatencyMs}ms · n={telemetryStats.count})
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181c24] hover:bg-[#262a33] border border-[#4edea3]/50 text-[#4edea3] font-mono text-xs font-bold transition-colors"
                title="Exportar paquete anónimo de investigación en JSON"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </button>
            </>
          )}
          <span className="text-[#4edea3] font-mono text-xs flex items-center gap-1 font-bold">
            <ShieldCheck className="w-4 h-4" />
            Políticas de Seguridad Cumplidas
          </span>
        </div>
      </div>
    </section>
  );
};
