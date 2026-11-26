import React, { useEffect, useRef } from 'react';
import { ShieldCheck, Volume2, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SafetyConsentModalProps {
  open: boolean;
  canDismiss: boolean;
  onAccept: () => void;
  onSpeakNotice: (text: string) => void;
}

export const SAFETY_CONSENT_SPEECH =
  'Bienvenido a Avisia. Aviso importante de seguridad y privacidad. Primero: Avisia complementa, pero nunca reemplaza, tu bastón blanco, perro guía o entrenamiento de orientación y movilidad; tampoco confirma si es seguro cruzar una calle. Segundo: la detección de obstáculos y puertas se procesa localmente en tu dispositivo; solo el lector de billetes y la descripción con inteligencia artificial envían una captura temporal cifrada sin guardar fotos ni datos personales. Toca el botón Entendido para comenzar.';

export const SafetyConsentModal: React.FC<SafetyConsentModalProps> = ({
  open,
  canDismiss,
  onAccept,
  onSpeakNotice,
}) => {
  const acceptBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      acceptBtnRef.current?.focus();
    }, 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canDismiss) {
        onAccept();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, canDismiss, onAccept]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avisia-consent-title"
    >
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl bg-[#181c24] border border-[#22d3ee]/45 p-5 sm:p-6 shadow-2xl space-y-4 text-[#dfe2ee]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-[#22d3ee]/15 border border-[#22d3ee]/40 flex items-center justify-center text-[#8aebff] shrink-0">
              <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="avisia-consent-title"
                className="text-base sm:text-lg font-extrabold text-white leading-tight"
              >
                Seguridad y Privacidad — AVISIA
              </h2>
              <p className="text-xs text-[#bbc9cd]">
                Versión piloto académica · UAM Managua
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSpeakNotice(SAFETY_CONSENT_SPEECH)}
            aria-label="Escuchar aviso de seguridad y privacidad en voz alta"
            className="min-h-[44px] px-3 rounded-xl bg-[#262a33] hover:bg-[#31353e] border border-[#8aebff]/40 text-[#8aebff] font-bold text-xs flex items-center gap-1.5 shrink-0"
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            Escuchar
          </button>
        </div>

        <div className="space-y-3 text-xs sm:text-sm leading-relaxed">
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/35 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-amber-200">
                Complemento asistivo, no sustituto
              </h3>
              <p className="text-[#dfe2ee] mt-0.5">
                AVISIA <strong>no reemplaza</strong> el bastón blanco, el perro guía ni el
                entrenamiento de orientación y movilidad. Nunca confirma si es seguro cruzar
                una calle o intersección.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0f131c] border border-[#3c494c]/50 flex items-start gap-2.5">
            <Lock className="w-5 h-5 text-[#4edea3] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-[#4edea3]">Privacidad por diseño</h3>
              <p className="text-[#bbc9cd] mt-0.5">
                La detección de obstáculos, puertas y distancia se ejecuta{' '}
                <strong className="text-[#dfe2ee]">100% en tu dispositivo</strong>. Solo al usar
                <em> Billetes</em>, <em>Escena IA</em> o <em>Leer texto</em> se envía una captura
                temporal por conexión cifrada HTTPS; no se almacenan fotografías ni identidad personal.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0f131c] border border-[#3c494c]/50 flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#8aebff] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-[#8aebff]">
                Consentimiento para pruebas piloto
              </h3>
              <p className="text-[#bbc9cd] mt-0.5">
                En pruebas con usuarios se recomienda caminar acompañado de un observador de
                seguridad. Puedes pausar, silenciar o salir en cualquier momento; las métricas
                exportables son estrictamente anónimas.
              </p>
            </div>
          </div>
        </div>

        <button
          ref={acceptBtnRef}
          type="button"
          onClick={onAccept}
          className="w-full min-h-[52px] px-4 rounded-2xl bg-[#22d3ee] hover:bg-[#8aebff] active:scale-[0.99] text-[#00363e] font-extrabold text-sm sm:text-base transition-all shadow-lg"
        >
          Entendido, continuar a AVISIA
        </button>
      </div>
    </div>
  );
};
