import React, { useState } from 'react';
import { Camera, Eye, ShieldCheck, MessageSquareCode, Volume2, ArrowRight, GitBranch } from 'lucide-react';
import type { OperationMode } from '../types/avicia';

interface PipelineSectionProps {
  mode: OperationMode;
}

interface PipelineNode {
  id: string;
  title: string;
  icon: React.ReactNode;
  plainDescription: string;
  simStatus: string;
  realStatus: string;
}

const PIPELINE_NODES: PipelineNode[] = [
  {
    id: 'camera',
    title: 'Cámara + Calibración 3D',
    icon: <Camera className="w-4 h-4" />,
    plainDescription:
      'Captura la escena y autocalibra en tiempo real la altura del celular sobre el piso (0.85–1.75 m), su postura (vertical/horizontal), el ángulo de inclinación y la dirección de avance.',
    simStatus: 'Escena urbana preparada en el escenario.',
    realStatus: 'Imagen local, video local o cámara en vivo + IMU/GPS.',
  },
  {
    id: 'vision',
    title: 'Fusión Neuronal (366 cl + ADE20K)',
    icon: <Eye className="w-4 h-4" />,
    plainDescription:
      'D-FINE-Obj365 (366 clases interiores/urbanas: escritorio, pizarra, extintor, silla, persona) + SegFormer ADE20K (puerta, cortina, pared, piso libre) + Depth Anything V2 en Web Worker con planificador de prioridad.',
    simStatus: 'Cajas y categorías predefinidas del escenario.',
    realStatus: 'Fusión híbrida GPU/WASM con desambiguación Pizarra/Cortina/Escritorio.',
  },
  {
    id: 'confirmation',
    title: 'Odometría GPS + Pasos (v5.3)',
    icon: <ShieldCheck className="w-4 h-4" />,
    plainDescription:
      'Fusiona GPS en tiempo real (Haversine) + podómetro inercial 3D (cada paso ~0.70 m en <60 ms) + giroscopio. Si das un paso o giras, invalida al instante los frames e inferencias de la posición anterior.',
    simStatus: 'Estados confirmado, pendiente o insuficiente.',
    realStatus: 'Invalidación por movementEpoch + confirmación en ~400 ms.',
  },
  {
    id: 'selection',
    title: 'Política C01 + Stixels 5 Sectores',
    icon: <MessageSquareCode className="w-4 h-4" />,
    plainDescription:
      'Calcula el corredor libre en 5 sectores horarios (10h..2h), confirma "Camino despejado" o sugiere desvío, y aplica narración por delta sin bloqueo de 3 segundos entre pasos.',
    simStatus: 'Motor independiente C00 / C01 activo.',
    realStatus: 'Motor C00 / C01 + Stixels 10h..2h activo.',
  },
  {
    id: 'speech',
    title: 'Voz sin Cola Atrasada',
    icon: <Volume2 className="w-4 h-4" />,
    plainDescription:
      'Al detectar un nuevo paso o desplazamiento GPS, cancela avisos encolados de la posición previa, interrumpe locuciones obsoletas y anuncia la nueva posición al instante.',
    simStatus: 'Síntesis en español mediante Web Speech API.',
    realStatus: 'Preempción por paso/GPS y cadencia dinámica 1.18x en marcha.',
  },
];

export const PipelineSection: React.FC<PipelineSectionProps> = ({ mode }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('camera');
  const activeNode =
    PIPELINE_NODES.find((n) => n.id === selectedNodeId) ?? PIPELINE_NODES[0];

  return (
    <section
      aria-label="Cómo piensa el sistema"
      className="rounded-2xl bg-[#0a1628]/80 backdrop-blur-xl border border-white/10 p-4 shadow-2xl space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
            <GitBranch className="w-4 h-4" />
            Cómo piensa el sistema
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Flujo de procesamiento completo en tiempo real: selecciona cada nodo para inspeccionarlo
          </p>
        </div>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          Modo:{' '}
          {mode === 'simulation'
            ? 'Escenas'
            : mode === 'vision_lab'
              ? 'Imagen IA'
              : mode === 'video_lab'
                ? 'Video IA'
                : 'Cámara en vivo'}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
        {PIPELINE_NODES.map((node, idx) => {
          const isSelected = node.id === selectedNodeId;
          return (
            <React.Fragment key={node.id}>
              <button
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
                className={`w-full sm:w-auto flex-1 flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                    : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <div
                  className={`p-2 rounded-full ${
                    isSelected
                      ? 'bg-cyan-400 text-slate-950 animate-pulse-flow'
                      : 'bg-slate-800 text-cyan-300'
                  }`}
                >
                  {node.icon}
                </div>
                <span className="text-[11px] font-semibold text-center">{node.title}</span>
              </button>
              {idx < PIPELINE_NODES.length - 1 && (
                <ArrowRight className="w-4 h-4 text-cyan-400/60 shrink-0 rotate-90 sm:rotate-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
        <div className="text-xs font-bold text-slate-100">{activeNode.title}</div>
        <p className="text-xs text-slate-300 leading-relaxed">{activeNode.plainDescription}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
          <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5">
            <span className="text-cyan-300 font-semibold block">En Escenas (Modo A):</span>
            <span className="text-slate-300">{activeNode.simStatus}</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5">
            <span className="text-emerald-300 font-semibold block">En Visión Real (B/C/D):</span>
            <span className="text-slate-300">{activeNode.realStatus}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
