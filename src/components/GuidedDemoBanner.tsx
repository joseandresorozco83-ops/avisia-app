import React from 'react';
import { Play, Pause, RotateCcw, X, CheckCircle2 } from 'lucide-react';

export interface DemoStepInfo {
  step: number;
  title: string;
  description: string;
  narration: string;
}

export const DEMO_STEPS: DemoStepInfo[] = [
  {
    step: 1,
    title: 'Inicio autónomo de AVISIA',
    description:
      'AVISIA transforma información visual del entorno urbano en mensajes auditivos claros para personas con baja visión o ceguera.',
    narration: 'Iniciando Avisia.',
  },
  {
    step: 2,
    title: 'Escenario 1: Caminando por Managua',
    description:
      'Observa la escena urbana en primera persona con detección de persona y automóvil.',
    narration: 'Persona y automóvil al frente.',
  },
  {
    step: 3,
    title: 'Alerta de objeto inanimado frontal',
    description:
      'El sistema detecta un poste en la acera justo frente al usuario y emite una alerta acústica y de voz prioritaria.',
    narration: 'Cuidado: poste frente a ti. Moto cerca.',
  },
  {
    step: 4,
    title: 'Escenario 2: Esperando el autobús',
    description:
      'Detección de transporte colectivo y personas en parada urbana.',
    narration: 'Autobús y personas en parada.',
  },
  {
    step: 5,
    title: 'Comparación de políticas C00 y C01',
    description:
      'En escenas con múltiples objetos, el motor prioriza la información relevante y evita saturar la voz.',
    narration: 'Prioridad activa: autobús y persona.',
  },
  {
    step: 6,
    title: 'Consulta conversacional automática',
    description:
      'El asistente responde preguntas del usuario basándose estrictamente en la escena actual.',
    narration: 'Pregunta: ¿Qué ruta es?',
  },
  {
    step: 7,
    title: 'Manejo responsable de incertidumbre',
    description:
      'Cuando la visibilidad es baja, AVISIA evita adivinar objetos y comunica su limitación.',
    narration: 'Sin información suficiente.',
  },
  {
    step: 8,
    title: 'Arquitectura interna del sistema',
    description:
      'Recorrido visual del flujo: Cámara, Reconocimiento, Confirmación, Selección y Voz.',
    narration: 'Flujo de cámara a voz.',
  },
  {
    step: 9,
    title: 'Exploración contextual de Managua',
    description:
      'Integración cartográfica con referencias urbanas de Managua.',
    narration: 'Mapa de Managua.',
  },
  {
    step: 10,
    title: 'Demostración finalizada',
    description:
      'Ahora puedes explorar libremente Escenas, Imagen IA, Video IA o Cámara en vivo.',
    narration: 'Demostración lista.',
  },
];

interface GuidedDemoBannerProps {
  active: boolean;
  paused: boolean;
  completed: boolean;
  stepIndex: number;
  onPauseToggle: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export const GuidedDemoBanner: React.FC<GuidedDemoBannerProps> = ({
  active,
  paused,
  completed,
  stepIndex,
  onPauseToggle,
  onRestart,
  onExit,
}) => {
  if (!active) return null;

  const current = DEMO_STEPS[stepIndex] ?? DEMO_STEPS[0];
  const progressPct = Math.round(((stepIndex + 1) / DEMO_STEPS.length) * 100);

  return (
    <div
      role="region"
      aria-label="Demostración autónoma"
      className="rounded-2xl bg-gradient-to-r from-cyan-950/90 via-[#0d223c] to-slate-900 border border-cyan-400/45 p-3 shadow-lg space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-bold uppercase tracking-wider">
              {completed ? 'Finalizada' : `Auto ${current.step}/${DEMO_STEPS.length}`}
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-cyan-100 flex items-center gap-1.5">
              {completed && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {current.title}
            </h3>
            {paused && !completed && (
              <span className="text-[10px] text-amber-300 font-medium">(En pausa)</span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-slate-200">{current.description}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!completed && (
            <button
              type="button"
              onClick={onPauseToggle}
              aria-label={paused ? 'Continuar demostración' : 'Pausar demostración'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100"
            >
              {paused ? (
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Pause className="w-3.5 h-3.5 text-amber-300" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            aria-label="Reiniciar demostración"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="Cerrar aviso de demostración"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 border border-white/10 text-slate-300 hover:text-rose-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
};
