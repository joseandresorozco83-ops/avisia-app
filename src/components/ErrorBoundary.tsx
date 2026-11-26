import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { speechService } from '../services/SpeechService';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado en la aplicación.',
    };
  }

  componentDidCatch(error: Error): void {
    try {
      speechService.speak(
        'Avisia encontró un error inesperado. Toca el botón reiniciar para volver a la aplicación.',
        { enabled: true, rate: 1.0, voiceURI: null }
      );
    } catch {
      // Never throw inside error handler
    }
    void error;
  }

  handleRecover = () => {
    speechService.cancel();
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleHardReload = () => {
    speechService.cancel();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        role="alert"
        aria-live="assertive"
        className="min-h-[100dvh] bg-[#0f131c] text-[#dfe2ee] flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md rounded-3xl bg-[#181c24] border border-rose-500/40 p-6 shadow-2xl space-y-5 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-300">
            <AlertTriangle className="w-8 h-8" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-extrabold text-white">
              AVISIA se detuvo por seguridad
            </h1>
            <p className="text-sm text-[#bbc9cd] leading-relaxed">
              Ocurrió un fallo inesperado en un módulo de la pantalla. Puedes reiniciar la sesión con un solo toque.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={this.handleRecover}
              className="w-full min-h-[52px] px-4 rounded-2xl bg-[#22d3ee] hover:bg-[#8aebff] text-[#00363e] font-extrabold text-base flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
              Reiniciar AVISIA
            </button>
            <button
              type="button"
              onClick={this.handleHardReload}
              className="w-full min-h-[48px] px-4 rounded-2xl bg-[#262a33] hover:bg-[#31353e] border border-[#3c494c]/60 text-[#dfe2ee] font-semibold text-sm transition-colors"
            >
              Recargar aplicación completa
            </button>
          </div>
          {this.state.errorMessage && (
            <details className="text-left text-xs text-slate-400 bg-[#0f131c] rounded-xl p-3 border border-white/10">
              <summary className="cursor-pointer font-mono text-[11px] text-slate-300">
                Detalle técnico
              </summary>
              <p className="mt-2 font-mono break-words">{this.state.errorMessage}</p>
            </details>
          )}
        </div>
      </main>
    );
  }
}
