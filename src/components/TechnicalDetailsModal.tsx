import React from 'react';
import { Cpu, Layers } from 'lucide-react';
import type {
  DetectorStatus,
  OperationMode,
  PolicyType,
  TechnicalStatusItem,
} from '../types/avicia';

interface TechnicalDetailsSectionProps {
  mode: OperationMode;
  policy: PolicyType;
  cameraActive: boolean;
  detectorStatus: DetectorStatus;
  speechSupported: boolean;
}

const DEVELOPMENT_MATRIX: TechnicalStatusItem[] = [
  {
    component: 'Interfaz web interactiva y vista móvil (React + TypeScript + Tailwind)',
    status: 'Implementado y probado',
    detail: 'Diseño accesible con vista dual (Smartphone 30% + Ecosistema 70%).',
  },
  {
    component: 'Motor de Simulación Guiada (Modo A - 5 escenarios de Managua)',
    status: 'Simulado',
    detail: 'Escenas POV, cajas delimitadoras y secuencia autónoma.',
  },
  {
    component: 'Motor de Mensajes (Políticas C00 y C01)',
    status: 'Implementado y probado',
    detail: 'Módulo independiente de priorización, novedad y antirepetición.',
  },
  {
    component: 'Síntesis y reconocimiento de voz (Web Speech API)',
    status: 'Implementado y probado',
    detail: 'Voces en español, velocidad ajustable y respaldo por texto.',
  },
  {
    component: 'Asistente conversacional por intenciones (Hablar con AVISIA)',
    status: 'Implementado y probado',
    detail: 'Respuestas acotadas a evidencia disponible sin inventar datos.',
  },
  {
    component: 'Mapa contextual de Managua (Leaflet + OpenStreetMap)',
    status: 'Simulado',
    detail: 'Cartografía funcional con referencias y destinos demostrativos.',
  },
  {
    component: 'Laboratorio de Imagen y Video IA (EfficientDet-Lite0 / MediaPipe)',
    status: 'Implementado, pendiente de validación',
    detail: 'Inferencia local en navegador sobre imágenes y videos proporcionados.',
  },
  {
    component: 'Cámara en vivo y detección continua (getUserMedia)',
    status: 'Implementado, pendiente de validación',
    detail: 'Sujeto a permisos explícitos y hardware disponible.',
  },
  {
    component: 'Lectura de rutas de autobuses y navegación autónoma real',
    status: 'Planificado',
    detail: 'Capacidad conceptual futura sujeta a datos verificados y validación.',
  },
];

export const TechnicalDetailsSection: React.FC<TechnicalDetailsSectionProps> = ({
  mode,
  policy,
  cameraActive,
  detectorStatus,
  speechSupported,
}) => {
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

  return (
    <section
      aria-label="Detalles técnicos y estado del desarrollo"
      className="rounded-2xl bg-[#0a1628]/80 backdrop-blur-xl border border-white/10 p-4 shadow-2xl space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
            <Cpu className="w-4 h-4" />
            Detalles técnicos y estado del desarrollo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Telemetría en tiempo real y matriz de madurez del proyecto (UAM Managua)
          </p>
        </div>
      </div>

      {/* Live Telemetry */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Modo activo</div>
          <div className="font-semibold text-cyan-300 mt-0.5">
            {mode === 'simulation'
              ? 'Escenas (A)'
              : mode === 'vision_lab'
                ? 'Imagen IA (B)'
                : mode === 'video_lab'
                  ? 'Video IA (C)'
                  : 'Cámara (D)'}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Política</div>
          <div className="font-semibold text-slate-100 mt-0.5">{policy}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Cámara</div>
          <div className="font-semibold text-slate-100 mt-0.5">
            {cameraActive ? 'Activa' : 'Inactiva'}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
          <div className="text-slate-400 text-[11px]">Inferencia real</div>
          <div className="font-semibold text-slate-100 mt-0.5">
            {detectorStatus.inferenceTimeMs !== null
              ? `${detectorStatus.inferenceTimeMs} ms`
              : 'Sin ejecutar'}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-900/70 border border-white/5 text-xs text-slate-300 flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <strong className="text-slate-100">Stack:</strong> React 18 · TypeScript · Vite · Tailwind · Leaflet · Web Speech ({speechSupported ? 'Sí' : 'No'})
        </span>
        <span>
          <strong className="text-slate-100">Modelo:</strong> {detectorStatus.modelName}
        </span>
      </div>

      {/* Development Maturity Matrix */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          Estado del desarrollo
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
