import React, { useState } from 'react';
import { Cpu, Layers, ClipboardCheck, Download, ShieldCheck, RotateCcw } from 'lucide-react';
import type {
  DetectorStatus,
  OperationMode,
  PolicyType,
  TechnicalStatusItem,
} from '../types/avicia';
import {
  calculateNasaTlxScore,
  calculateSusScore,
  classifySusGrade,
  classifyWorkload,
  telemetryService,
  type NasaTlxRatings,
} from '../services/TelemetryService';

interface TechnicalDetailsSectionProps {
  mode: OperationMode;
  policy: PolicyType;
  cameraActive: boolean;
  detectorStatus: DetectorStatus;
  speechSupported: boolean;
}

const SUS_QUESTIONS: string[] = [
  '1. Creo que me gustaría usar AVISIA con frecuencia.',
  '2. Encontré la aplicación innecesariamente compleja.',
  '3. Pensé que la aplicación era fácil de usar.',
  '4. Creo que necesitaría ayuda técnica para usar la aplicación.',
  '5. Encontré que las funciones están bien integradas.',
  '6. Pensé que había demasiada inconsistencia en la aplicación.',
  '7. Imagino que la mayoría aprendería a usarla muy rápido.',
  '8. Encontré la aplicación muy engorrosa de usar.',
  '9. Me sentí muy seguro/a usando la aplicación.',
  '10. Tuve que aprender muchas cosas antes de poder usarla.',
];

const DEVELOPMENT_MATRIX: TechnicalStatusItem[] = [
  {
    component: 'Interfaz accesible WCAG 2.2 AA (Web 40/60 + App Android Capacitor 8)',
    status: 'Implementado y probado',
    detail: '5 modos de uso con 1 toque en Web y Android, emulador 40%×100%, TalkBack-safe y Wake Lock.',
  },
  {
    component: 'Fusión Neuronal 366 Clases + Planificador de Prioridad (D-FINE-Obj365 + SegFormer)',
    status: 'Implementado y probado',
    detail: 'Detección de escritorios, pizarras, cortinas, puertas, paredes y extintores con normalización multi-sinónimo ADE20K.',
  },
  {
    component: 'Calibración 3D Autorregulada de Altura, Postura, Inclinación y Rumbo (v5.2/v5.3)',
    status: 'Implementado y probado',
    detail: 'Autocalibra la altura sobre el piso (0.85–1.75 m), detecta postura vertical/horizontal, compensa ángulo de inclinación y avisa solo en ángulos extremos.',
  },
  {
    component: 'Odometría GPS + Podómetro Inercial de Pasos con Invalidación de Cola de Voz (v5.3)',
    status: 'Implementado y probado',
    detail: 'Fusiona GPS Haversine + acelerómetro 3D (<60 ms por paso) + giroscopio para descartar frames y audios atrasados de la posición anterior.',
  },
  {
    component: 'Geometría 3D de piso y puertas (Depth V2 plano 1/Z + SegFormer 9:16 + Stixels 10h..2h)',
    status: 'Implementado y probado',
    detail: 'Confirmación rápida de Camino Despejado (~400 ms), puertas abiertas/cerradas y veto de falsas gradas en pisos planos.',
  },
  {
    component: 'VLM Estructurado JSON + Respaldo Offline (Gemini / SmolVLM-256M WebGPU)',
    status: 'Implementado y probado',
    detail: 'Escalado automático ante baja confianza (<55%) en imágenes y Narración por Delta sin pausa de 3 s entre pasos.',
  },
  {
    component: 'Reconocimiento de billetes (Córdobas 10–1000 y Dólares $1–$100)',
    status: 'Implementado y probado',
    detail: 'Detección automática manos libres + voz ("¿De cuánto es este billete?") con respaldo OCR local.',
  },
  {
    component: 'Seguridad API & Móvil (OWASP API/Mobile + CSP + CORS + Rate Limit)',
    status: 'Implementado y probado',
    detail: 'Proxy serverless con catálogo cerrado de tareas (anti-prompt-injection), Secret en Vercel, allowBackup=false y TLS estricto.',
  },
  {
    component: 'Protocolo ético y telemetría de piloto académico (SUS + NASA-TLX)',
    status: 'Implementado y probado',
    detail: 'Consentimiento informado accesible, métricas p50/p95, alertas/min y exportación anónima JSON/CSV (46 pruebas automatizadas).',
  },
];

export const TechnicalDetailsSection: React.FC<TechnicalDetailsSectionProps> = ({
  mode,
  policy,
  cameraActive,
  detectorStatus,
  speechSupported,
}) => {
  const [participantCode, setParticipantCode] = useState(
    () => telemetryService.getSessionMeta().participantCode
  );
  const [susAnswers, setSusAnswers] = useState<number[]>([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]);
  const [nasaTlx, setNasaTlx] = useState<NasaTlxRatings>({
    mental: 35,
    physical: 20,
    temporal: 25,
    performance: 25,
    effort: 30,
    frustration: 20,
  });
  const [pilotNotes, setPilotNotes] = useState('');
  const [exportedBanner, setExportedBanner] = useState<string | null>(null);

  const stats = telemetryService.getStats();
  const susScore = calculateSusScore(susAnswers);
  const susGrade = classifySusGrade(susScore);
  const nasaScore = calculateNasaTlxScore(nasaTlx);
  const workloadLabel = classifyWorkload(nasaScore);

  const badgeClass = (status: TechnicalStatusItem['status']) => {
    switch (status) {
      case 'Implementado y probado':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
      case 'Implementado, pendiente de validación':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35';
      case 'Simulado':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
      case 'Planificado':
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
    }
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPilotJson = () => {
    telemetryService.configureSession({ participantCode });
    const json = telemetryService.exportJson({
      participantCode,
      susAnswers,
      susScore,
      susGrade,
      nasaTlx,
      nasaTlxScore: nasaScore,
      notes: pilotNotes.trim().slice(0, 500) || undefined,
    });
    downloadFile(
      json,
      `avisia-piloto-${participantCode || 'ANON'}-${Date.now()}.json`,
      'application/json;charset=utf-8;'
    );
    setExportedBanner('Paquete anónimo JSON (telemetría + SUS + NASA-TLX) exportado.');
  };

  const handleExportPilotCsv = () => {
    telemetryService.configureSession({ participantCode });
    const csv = telemetryService.exportCsv();
    downloadFile(
      csv,
      `avisia-muestras-${participantCode || 'ANON'}-${Date.now()}.csv`,
      'text/csv;charset=utf-8;'
    );
    setExportedBanner('Archivo CSV sanitizado de latencias y detecciones exportado.');
  };

  return (
    <section
      aria-label="Detalles técnicos y protocolo de evaluación piloto"
      className="rounded-2xl bg-[#0a1628]/80 backdrop-blur-xl border border-white/10 p-4 shadow-2xl space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
            <Cpu className="w-4 h-4" />
            Arquitectura, Seguridad y Piloto Académico (v5.3.0)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Telemetría empírica, matriz de madurez e instrumentos SUS / NASA-TLX — UAM Managua
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[11px] font-mono text-emerald-300">
          <ShieldCheck className="w-3.5 h-3.5" />
          OWASP + WCAG 2.2 Ready
        </span>
      </div>

      {/* Live Telemetry KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Modo / Política</div>
          <div className="font-semibold text-cyan-300 mt-0.5">
            {mode === 'simulation'
              ? 'Escenas (A)'
              : mode === 'vision_lab'
                ? 'Imagen IA (B)'
                : mode === 'video_lab'
                  ? 'Video IA (C)'
                  : 'Cámara (D)'}{' '}
            · {policy}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Latencia (p50 / p95)</div>
          <div className="font-semibold text-slate-100 mt-0.5">
            {stats.count > 0
              ? `${stats.p50LatencyMs} / ${stats.p95LatencyMs} ms`
              : detectorStatus.inferenceTimeMs !== null
                ? `${detectorStatus.inferenceTimeMs} ms`
                : 'Sin muestras'}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Fatiga auditiva</div>
          <div className="font-semibold text-emerald-300 mt-0.5">
            {stats.alertsPerMinute} alertas/min ({stats.spokenAlerts})
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Billetes (aciertos)</div>
          <div className="font-semibold text-amber-300 mt-0.5">
            {stats.banknoteHits}/{stats.banknoteScans}
            {stats.banknoteAvgMs > 0 ? ` · ${stats.banknoteAvgMs}ms` : ''}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-900/70 border border-white/5 text-xs text-slate-300 flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <strong className="text-slate-100">Stack:</strong> React 18 · TypeScript · Vite · Capacitor 8 · MediaPipe · ONNX · SegFormer · Gemini Proxy ({speechSupported ? 'Voz Sí' : 'Voz No'})
        </span>
        <span>
          <strong className="text-slate-100">Detector activo:</strong> {detectorStatus.modelName} · Cámara: {cameraActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {/* Academic Pilot Evaluation Toolkit: SUS + NASA-TLX + Anonymous Export */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4" />
              Instrumento de Piloto con Usuarios (SUS + NASA-TLX)
            </h3>
            <p className="text-[11px] text-slate-400">
              Registra evaluaciones anónimas al finalizar cada recorrido (cero fotos, cero GPS, cero PII).
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-slate-300 flex items-center gap-1.5">
              <span>Participante:</span>
              <input
                type="text"
                value={participantCode}
                maxLength={20}
                onChange={(e) => {
                  setParticipantCode(e.target.value);
                  telemetryService.configureSession({ participantCode: e.target.value });
                }}
                className="w-24 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-200"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                telemetryService.clear();
                setExportedBanner('Contadores de sesión reiniciados para el siguiente participante.');
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
              title="Reiniciar métricas de sesión"
              aria-label="Reiniciar métricas de sesión"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* SUS 10-item Quick Form */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">
                System Usability Scale (SUS · 1–5)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 font-mono text-[11px] text-emerald-300 font-bold">
                {susScore} / 100 · {susGrade}
              </span>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {SUS_QUESTIONS.map((q, idx) => (
                <div key={q} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-300 leading-tight flex-1">{q}</span>
                  <select
                    aria-label={q}
                    value={susAnswers[idx]}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSusAnswers((prev) => prev.map((v, i) => (i === idx ? val : v)));
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-xs text-cyan-200 shrink-0"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* NASA-TLX 6-subscale Workload */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">
                NASA-TLX (Carga de Trabajo · 0–100)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/35 font-mono text-[11px] text-cyan-200 font-bold">
                {nasaScore} · {workloadLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {(
                [
                  { key: 'mental', label: 'Demanda mental' },
                  { key: 'physical', label: 'Demanda física' },
                  { key: 'temporal', label: 'Presión temporal' },
                  { key: 'performance', label: 'Esfuerzo rendimiento' },
                  { key: 'effort', label: 'Esfuerzo total' },
                  { key: 'frustration', label: 'Frustración' },
                ] as const
              ).map((item) => (
                <label key={item.key} className="flex flex-col gap-0.5 text-slate-300">
                  <span className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-mono text-cyan-300">{nasaTlx[item.key]}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={nasaTlx[item.key]}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNasaTlx((prev) => ({ ...prev, [item.key]: val }));
                    }}
                    className="accent-cyan-400"
                  />
                </label>
              ))}
            </div>
            <input
              type="text"
              value={pilotNotes}
              onChange={(e) => setPilotNotes(e.target.value)}
              placeholder="Observaciones del evaluador (ej. bastón + pasillo interior, sin incidentes)..."
              aria-label="Observaciones anónimas del piloto"
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPilotJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] font-bold text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Sesión Piloto (JSON)
            </button>
            <button
              type="button"
              onClick={handleExportPilotCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Latencias (CSV)
            </button>
          </div>
          {exportedBanner && (
            <span className="text-[11px] text-emerald-300 font-medium" role="status">
              {exportedBanner}
            </span>
          )}
        </div>
      </div>

      {/* Development Maturity Matrix */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          Matriz de madurez v5.0.0 (Producción y Piloto)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {DEVELOPMENT_MATRIX.map((item) => (
            <div
              key={item.component}
              className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs"
            >
              <div>
                <div className="font-semibold text-slate-100 leading-snug">{item.component}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{item.detail}</div>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${badgeClass(
                  item.status
                )}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
