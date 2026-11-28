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
} from 'lucide-react';
import type { Detection, OperationMode, PolicyEvaluation, PolicyType } from '../types/avicia';
import { telemetryService } from '../services/TelemetryService';

interface ProcessingPanelProps {
  mode: OperationMode;
  detections: Detection[];
  policy: PolicyType;
  evaluation: PolicyEvaluation | null;
  highlightedDetectionId: string | null;
  detectorModelName?: string;
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
      className="flex flex-col h-full min-h-0 gap-2 overflow-hidden"
    >
      {/* 1. Stitch Safety Protocol & Policy Banner (C00 / C01) */}
      <div
        className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-sm ${
          isAlert
            ? 'bg-gradient-to-r from-[#ffb147]/15 via-[#1c2028] to-[#1c2028] border-[#ffb147]/45'
            : 'bg-gradient-to-r from-[#22d3ee]/12 via-[#1c2028] to-[#1c2028] border-[#3c494c]/50'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              isAlert
                ? 'bg-[#ffb147]/20 text-[#ffddb8]'
                : 'bg-[#22d3ee]/15 text-[#8aebff]'
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
                className={`font-mono text-xs font-bold uppercase tracking-wide ${
                  isAlert ? 'text-[#ffb147]' : 'text-[#8aebff]'
                }`}
              >
                POLÍTICA {policy} ACTIVADA:{' '}
                {policy === 'C01' ? 'Prioridad y Novedad' : 'Orden de Llegada'}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-black uppercase ${
                  isAlert
                    ? 'bg-[#ffb147] text-[#2a1700]'
                    : 'bg-[#4edea3]/20 text-[#4edea3]'
                }`}
              >
                {isAlert ? 'Obstáculo Frontal' : mode === 'simulation' ? 'Simulado' : 'En Vivo'}
              </span>
            </div>
            <p className="text-xs text-[#dfe2ee] mt-1 leading-relaxed">
              {evaluation?.obstacleAlert
                ? evaluation.obstacleAlert.message
                : evaluation?.reason ?? 'Evaluando contexto espacial.'}
            </p>
          </div>
        </div>

        {/* Policy Switcher Pills (C00 / C01) */}
        <div
          className="flex items-center gap-1 bg-[#0a0e16] p-1 rounded-lg border border-[#3c494c]/40 shrink-0"
          role="radiogroup"
          aria-label="Política de selección"
        >
          <button
            type="button"
            role="radio"
            aria-checked={policy === 'C00'}
            onClick={() => onChangePolicy('C00')}
            className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors ${
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
            className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors ${
              policy === 'C01'
                ? 'bg-[#22d3ee] text-[#00363e]'
                : 'text-[#bbc9cd] hover:text-white'
            }`}
          >
            C01
          </button>
        </div>
      </div>

      {/* 2. Stitch Real-Time Spatial Detections Table */}
      <div className="flex-1 min-h-0 bg-[#181c24] rounded-xl border border-[#3c494c]/40 flex flex-col overflow-hidden shadow-md">
        <div className="px-3 py-2 bg-[#1c2028] border-b border-[#3c494c]/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#8aebff]" />
            <span className="text-xs sm:text-sm font-semibold text-[#dfe2ee]">
              Registro de Detecciones Espaciales
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#4edea3]">
            {detections.length} {detections.length === 1 ? 'Entidad' : 'Entidades'}
          </span>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto">
          {detections.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#bbc9cd]">
              No hay detecciones registradas en este momento.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0a0e16]/80 text-[#bbc9cd] font-mono text-[10px] uppercase border-b border-[#3c494c]/30">
                  <th className="py-2 px-3 font-semibold">Entidad / Objeto</th>
                  <th className="py-2 px-3 font-semibold">Categoría</th>
                  <th className="py-2 px-3 font-semibold">Zona</th>
                  <th className="py-2 px-3 font-semibold">Confianza</th>
                  <th className="py-2 px-3 font-semibold text-right">Prioridad Audio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3c494c]/20 text-xs text-[#dfe2ee]">
                {detections.map((det) => {
                  const isSelected = evaluation?.selectedDetectionIds.includes(det.id) ?? false;
                  const isHighlighted = highlightedDetectionId === det.id;
                  const isObstacle = det.isInanimateObstacle && det.proximityZone !== 'side';

                  return (
                    <tr
                      key={det.id}
                      onMouseEnter={() => onHighlightDetection(det.id)}
                      onMouseLeave={() => onHighlightDetection(null)}
                      className={`transition-colors cursor-pointer ${
                        isHighlighted
                          ? 'bg-[#22d3ee]/15'
                          : isObstacle
                            ? 'bg-[#ffb147]/8 hover:bg-[#ffb147]/15'
                            : 'hover:bg-[#1c2028]'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isObstacle
                              ? 'bg-[#ffb147] animate-ping'
                              : isSelected
                                ? 'bg-[#4edea3]'
                                : 'bg-[#8aebff]'
                          }`}
                        />
                        <span className={isObstacle ? 'text-[#ffd6a7]' : 'text-[#dfe2ee]'}>
                          {det.labelEs}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#bbc9cd]">
                        {det.category}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#bbc9cd]">
                        {det.proximityZone === 'front_close'
                          ? 'Frontal cerca'
                          : det.proximityZone === 'front_mid'
                            ? 'Frontal medio'
                            : det.proximityZone === 'side'
                              ? 'Lateral'
                              : 'Escena'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#4edea3]">
                        {typeof det.confidence === 'number'
                          ? `${Math.round(det.confidence * 100)}%`
                          : 'Simulado'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isObstacle ? (
                          <span className="px-2 py-0.5 rounded bg-[#ffb147] text-[#2a1700] font-mono text-[10px] font-bold">
                            ALTA / ALERTA
                          </span>
                        ) : isSelected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#4edea3]/15 text-[#4edea3] font-mono text-[10px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            VOCALIZADO
                          </span>
                        ) : det.confirmationStatus === 'pending' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#262a33] text-[#ffb147] font-mono text-[10px]">
                            <Clock className="w-3 h-3" />
                            PENDIENTE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-[#262a33] text-[#bbc9cd] font-mono text-[10px]">
                            SECUNDARIA
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

      {/* 3. Stitch 4 Hardware & Pipeline KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
        <div className="p-2.5 bg-[#181c24] rounded-xl border border-[#3c494c]/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-[10px] uppercase">Motor Visión</span>
            <Gauge className="w-3.5 h-3.5 text-[#4edea3]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-base font-bold text-[#4edea3]">
              {shortModelLabel}
            </span>
            <span className="font-mono text-[10px] text-[#bbc9cd] block">
              {mode === 'simulation'
                ? 'Escenas POV'
                : telemetryStats.count > 0
                  ? `p95 ${telemetryStats.p95LatencyMs}ms · ${telemetryStats.alertsPerMinute}/min`
                  : 'WASM / ONNX Local'}
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1 rounded-full overflow-hidden">
            <div className="bg-[#4edea3] h-full rounded-full w-4/5" />
          </div>
        </div>

        <div className="p-2.5 bg-[#181c24] rounded-xl border border-[#3c494c]/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-[10px] uppercase">Entidades</span>
            <Eye className="w-3.5 h-3.5 text-[#8aebff]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-base font-bold text-[#8aebff]">
              {detections.length}
            </span>
            <span className="font-mono text-[10px] text-[#bbc9cd] block">
              {evaluation?.selectedDetectionIds.length ?? 0} seleccionadas
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1 rounded-full overflow-hidden">
            <div
              className="bg-[#8aebff] h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(15, detections.length * 22))}%` }}
            />
          </div>
        </div>

        <div className="p-2.5 bg-[#181c24] rounded-xl border border-[#3c494c]/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-[10px] uppercase">Confianza</span>
            <Activity className="w-3.5 h-3.5 text-[#2fd9f4]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-base font-bold text-[#2fd9f4]">
              {avgConf !== null ? `${avgConf}%` : 'Demo'}
            </span>
            <span className="font-mono text-[10px] text-[#bbc9cd] block">
              {avgConf !== null ? 'Promedio real' : 'Sin puntaje ficticio'}
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1 rounded-full overflow-hidden">
            <div
              className="bg-[#2fd9f4] h-full rounded-full"
              style={{ width: `${avgConf ?? 85}%` }}
            />
          </div>
        </div>

        <div className="p-2.5 bg-[#181c24] rounded-xl border border-[#3c494c]/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#bbc9cd]">
            <span className="font-mono text-[10px] uppercase">Política</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#6ffbbe]" />
          </div>
          <div className="my-1">
            <span className="font-mono text-base font-bold text-[#6ffbbe]">{policy}</span>
            <span className="font-mono text-[10px] text-[#bbc9cd] block">
              {policy === 'C01' ? 'Prioridad activa' : 'Orden llegada'}
            </span>
          </div>
          <div className="w-full bg-[#31353e] h-1 rounded-full overflow-hidden">
            <div className="bg-[#6ffbbe] h-full rounded-full w-full" />
          </div>
        </div>
      </div>

      {/* 4. Stitch Academic UAM Footer Strip */}
      <div className="px-3 py-2 bg-[#0a0e16] rounded-xl border border-[#3c494c]/35 flex flex-wrap items-center justify-between gap-2 shrink-0 text-[11px] text-[#bbc9cd]">
        <div className="flex items-center gap-2.5">
          <div className="bg-white px-2.5 py-1 rounded-lg flex items-center shrink-0">
            <img
              src="/uam-logo.png"
              alt="Universidad Americana UAM"
              className="h-6 w-auto object-contain"
            />
          </div>
          <div className="leading-tight">
            <span className="text-[#8aebff] font-bold uppercase tracking-wide text-[11px]">
              Proyecto AVISIA
            </span>
            <span className="text-[#bbc9cd] ml-1.5">· Asistencia Visual Inteligente — UAM</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {telemetryStats.count > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#181c24] hover:bg-[#262a33] border border-[#3c494c]/50 text-[#8aebff] font-mono text-[10px] font-semibold transition-colors"
                title="Exportar latencias y detecciones de campo en CSV"
              >
                <Download className="w-3 h-3" />
                CSV ({telemetryStats.avgLatencyMs}ms · n={telemetryStats.count})
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#181c24] hover:bg-[#262a33] border border-[#4edea3]/40 text-[#4edea3] font-mono text-[10px] font-semibold transition-colors"
                title="Exportar paquete anónimo de investigación en JSON"
              >
                <Download className="w-3 h-3" />
                JSON
              </button>
            </>
          )}
          <span className="text-[#4edea3] font-mono text-[10px] flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            Políticas de Seguridad Cumplidas
          </span>
        </div>
      </div>
    </section>
  );
};
