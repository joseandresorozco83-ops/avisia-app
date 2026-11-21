import React, { useEffect, useState } from 'react';
import type { Detection, Scenario } from '../types/avicia';

interface SimulatedSceneCanvasProps {
  scenario: Scenario;
  detections: Detection[];
  selectedDetectionIds: string[];
  highlightedDetectionId: string | null;
  onSelectDetection: (id: string) => void;
}

const SCENE_IMAGE_MAP: Record<Scenario['sceneType'], string> = {
  walking_managua: '/scenes/walking_managua.jpg',
  waiting_bus: '/scenes/waiting_bus.jpg',
  exploring_place: '/scenes/exploring_place.jpg',
  multiple_detections: '/scenes/multiple_detections.jpg',
  insufficient_info: '/scenes/insufficient_info.jpg',
};

export const SimulatedSceneCanvas: React.FC<SimulatedSceneCanvasProps> = ({
  scenario,
  detections,
  selectedDetectionIds,
  highlightedDetectionId,
  onSelectDetection,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const imageSrc = SCENE_IMAGE_MAP[scenario.sceneType];

  useEffect(() => {
    setImgFailed(false);
  }, [scenario.sceneType]);

  return (
    <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden border border-white/10 bg-[#050b14] shadow-2xl group">
      {/* Realistic Scene Image */}
      {!imgFailed ? (
        <img
          src={imageSrc}
          alt={`Escena urbana de demostración: ${scenario.title}`}
          onError={() => setImgFailed(true)}
          className={`w-full h-full object-cover select-none transition-transform duration-700 ${
            scenario.insufficientEvidence ? 'brightness-75 contrast-90 blur-[1px]' : 'brightness-95'
          }`}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#0a192f] to-slate-950 flex items-center justify-center text-xs text-slate-400">
          Cargando escena visual...
        </div>
      )}

      {/* Subtle Vignette & Optical HUD Grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at center, transparent 52%, rgba(3, 8, 18, 0.68) 100%)',
        }}
      />

      {/* Projected Podotactile Walking Corridor SVG Overlay (Stitch Design) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
        fill="none"
        viewBox="0 0 360 225"
        preserveAspectRatio="none"
      >
        <polygon fill="rgba(16, 185, 129, 0.12)" points="120,225 240,225 202,125 158,125" />
        <line
          className="animate-pulse"
          stroke="#34d399"
          strokeDasharray="6 4"
          strokeWidth="2.5"
          x1="180"
          x2="180"
          y1="225"
          y2="125"
        />
      </svg>

      {/* Smart-Glasses Viewfinder Reticles */}
      <div className="absolute inset-3 pointer-events-none">
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400/50 rounded-tl-sm" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400/50 rounded-tr-sm" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400/50 rounded-bl-sm" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400/50 rounded-br-sm" />
      </div>

      {/* Bounding Box Overlays with Corner Brackets */}
      <div className="absolute inset-0 pointer-events-none">
        {detections.map((det) => {
          const isSelected = selectedDetectionIds.includes(det.id);
          const isHighlighted = highlightedDetectionId === det.id;

          const accentColor =
            det.confirmationStatus === 'insufficient'
              ? 'border-amber-400/90'
              : det.confirmationStatus === 'pending'
                ? 'border-amber-300/90'
                : isSelected
                  ? 'border-emerald-400'
                  : 'border-cyan-400/80';

          const fillGlow =
            det.confirmationStatus === 'insufficient'
              ? 'bg-amber-500/10'
              : det.confirmationStatus === 'pending'
                ? 'bg-amber-400/10'
                : isSelected
                  ? 'bg-emerald-400/10 shadow-[0_0_24px_rgba(52,211,153,0.22)]'
                  : 'bg-cyan-400/5';

          const pillStyle =
            det.confirmationStatus === 'insufficient'
              ? 'bg-amber-500/90 text-slate-950'
              : det.confirmationStatus === 'pending'
                ? 'bg-amber-400/90 text-slate-950'
                : isSelected
                  ? 'bg-emerald-400/95 text-slate-950'
                  : 'bg-slate-950/85 text-cyan-200 border border-cyan-400/40';

          return (
            <button
              key={det.id}
              type="button"
              onClick={() => onSelectDetection(det.id)}
              style={{
                left: `${det.bbox.x}%`,
                top: `${det.bbox.y}%`,
                width: `${det.bbox.width}%`,
                height: `${det.bbox.height}%`,
              }}
              className={`pointer-events-auto absolute rounded-lg transition-all duration-300 ${fillGlow} ${
                isHighlighted ? 'ring-2 ring-white/90 scale-[1.015]' : ''
              }`}
              aria-label={`Objeto identificado: ${det.labelEs}, estado ${det.confirmationStatus}`}
            >
              {/* Crisp HUD Corner Ticks */}
              <span className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 rounded-tl ${accentColor}`} />
              <span className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 rounded-tr ${accentColor}`} />
              <span className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 rounded-bl ${accentColor}`} />
              <span className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 rounded-br ${accentColor}`} />

              {/* Floating Label Chip */}
              <span
                className={`absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-tight whitespace-nowrap backdrop-blur-md shadow-md ${pillStyle}`}
              >
                {det.labelEs}
                {det.confirmationStatus === 'pending' && ' · Confirmando'}
                {det.confirmationStatus === 'insufficient' && ' · Incierto'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Top-Left HUD Telemetry */}
      <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/75 border border-white/15 backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-[11px] font-medium tracking-wide text-slate-200">
          Escena ilustrativa · Vista POV
        </span>
      </div>

      {/* Bottom-Right Location Tag */}
      <div className="absolute bottom-3 right-3 px-3 py-1 rounded-lg bg-slate-950/75 border border-white/10 backdrop-blur-md text-[11px] text-slate-200 font-medium">
        {scenario.location.name.replace(/\s*—\s*Simulado/gi, '')}
      </div>
    </div>
  );
};
