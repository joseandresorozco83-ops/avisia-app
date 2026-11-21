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
    title: 'Cámara',
    icon: <Camera className="w-4 h-4" />,
    plainDescription:
      'Captura la escena visual frente a la persona usuaria mediante escenas preparadas, imágenes, video local o cámara en vivo.',
    simStatus: 'Escena urbana preparada en el escenario.',
    realStatus: 'Imagen local, video local o flujo getUserMedia.',
  },
  {
    id: 'vision',
    title: 'Reconocimiento',
    icon: <Eye className="w-4 h-4" />,
    plainDescription:
      'El modelo EfficientDet-Lite0 en el navegador identifica categorías clave: persona, automóvil, motocicleta y autobús.',
    simStatus: 'Cajas y categorías predefinidas del escenario.',
    realStatus: 'Inferencia WASM/WebGL con puntuaciones reales.',
  },
  {
    id: 'confirmation',
    title: 'Confirmación',
    icon: <ShieldCheck className="w-4 h-4" />,
    plainDescription:
      'Verifica estabilidad temporal y umbral de confianza antes de emitir un aviso. Si falta evidencia, evita adivinar.',
    simStatus: 'Estados confirmado, pendiente o insuficiente.',
    realStatus: 'Filtrado por umbral de confianza configurable.',
  },
  {
    id: 'selection',
    title: 'Selección',
    icon: <MessageSquareCode className="w-4 h-4" />,
    plainDescription:
      'La política de mensajes (C00 o C01) prioriza la información útil y suprime repeticiones continuas.',
    simStatus: 'Motor independiente C00 / C01 activo.',
    realStatus: 'Motor independiente C00 / C01 activo.',
  },
  {
    id: 'speech',
    title: 'Síntesis de voz',
    icon: <Volume2 className="w-4 h-4" />,
    plainDescription:
      'Convierte el mensaje seleccionado en audio en español mediante la Web Speech API del navegador.',
    simStatus: 'Síntesis en español mediante Web Speech API.',
    realStatus: 'Síntesis en español mediante Web Speech API.',
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
