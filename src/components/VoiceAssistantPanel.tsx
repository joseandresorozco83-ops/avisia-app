import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Square,
  Mic,
  MicOff,
  Send,
  MessageSquare,
} from 'lucide-react';
import type { ConversationMessage, SpeechSettings } from '../types/avicia';

interface VoiceAssistantPanelProps {
  isSpeaking: boolean;
  isListening: boolean;
  lastMessage: string;
  history: ConversationMessage[];
  speechSettings: SpeechSettings;
  availableVoices: SpeechSynthesisVoice[];
  recognitionSupported: boolean;
  onSpeakCurrent: () => void;
  onRepeatLast: () => void;
  onCancelSpeech: () => void;
  onToggleMute: () => void;
  onChangeRate: (rate: number) => void;
  onChangeVoice: (voiceURI: string) => void;
  onSendQuestion: (question: string) => void;
  onToggleListening: () => void;
}

const QUICK_QUESTIONS = [
  '¿De cuánto es este billete?',
  '¿Qué hay frente a mí?',
  '¿Ves algún autobús?',
  '¿Qué ruta es?',
  '¿Hay personas cerca?',
  '¿Dónde estoy?',
  '¿Qué objetos identificaste?',
];

export const VoiceAssistantPanel: React.FC<VoiceAssistantPanelProps> = ({
  isSpeaking,
  isListening,
  lastMessage,
  history,
  speechSettings,
  availableVoices,
  recognitionSupported,
  onSpeakCurrent,
  onRepeatLast,
  onCancelSpeech,
  onToggleMute,
  onChangeRate,
  onChangeVoice,
  onSendQuestion,
  onToggleListening,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed) return;
    onSendQuestion(trimmed);
    setQuestionInput('');
  };

  return (
    <section
      aria-label="Asistente de voz Hablar con AVISIA"
      className="flex flex-col h-full rounded-xl bg-[#181c24] border border-[#3c494c]/40 p-4 shadow-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#3c494c]/30">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8aebff] flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" />
            Hablar con AVISIA
          </h2>
          <p className="text-xs text-[#bbc9cd] mt-0.5">
            Asistente semántico espacial por voz o texto
          </p>
        </div>

        {/* Active voice indicator with equalizer bars */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
            isSpeaking
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
              : speechSettings.enabled
                ? 'bg-slate-900/80 border-white/10 text-slate-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
          }`}
          aria-live="polite"
        >
          {isSpeaking ? (
            <span className="flex items-end gap-0.5 h-3" aria-hidden="true">
              <span className="w-0.5 h-3 bg-emerald-400 rounded-full origin-bottom animate-eq-1" />
              <span className="w-0.5 h-3 bg-emerald-400 rounded-full origin-bottom animate-eq-2" />
              <span className="w-0.5 h-3 bg-emerald-400 rounded-full origin-bottom animate-eq-3" />
              <span className="w-0.5 h-3 bg-emerald-400 rounded-full origin-bottom animate-eq-4" />
            </span>
          ) : (
            <span
              className={`h-2 w-2 rounded-full ${
                speechSettings.enabled ? 'bg-cyan-400' : 'bg-amber-400'
              }`}
            />
          )}
          {isSpeaking ? 'Hablando' : speechSettings.enabled ? 'Voz lista' : 'Silenciado'}
        </div>
      </div>

      {/* Current spoken message + Audio controls */}
      <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-cyan-500/25">
        <div className="text-[11px] uppercase tracking-wider text-cyan-300/80 mb-1">
          Mensaje comunicado
        </div>
        <p className="text-sm text-slate-100 font-medium leading-relaxed min-h-[2.75rem]">
          {lastMessage || 'Presiona «Escuchar» para reproducir el mensaje del escenario actual.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSpeakCurrent}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            Escuchar
          </button>
          <button
            type="button"
            onClick={onRepeatLast}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Repetir
          </button>
          {isSpeaking && (
            <button
              type="button"
              onClick={onCancelSpeech}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium text-xs border border-rose-500/40 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              Detener
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={!speechSettings.enabled}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors ml-auto"
          >
            {speechSettings.enabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                Voz activa
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                Silenciado
              </>
            )}
          </button>
        </div>

        {/* Voice speed and Spanish voice selector */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            <span>Velocidad ({speechSettings.rate.toFixed(1)}x)</span>
            <input
              type="range"
              min="0.7"
              max="1.8"
              step="0.1"
              value={speechSettings.rate}
              onChange={(e) => onChangeRate(parseFloat(e.target.value))}
              className="accent-cyan-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            <span>Voz en español</span>
            <select
              value={speechSettings.voiceURI ?? ''}
              onChange={(e) => onChangeVoice(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
            >
              {availableVoices.length === 0 ? (
                <option value="">Voz predeterminada</option>
              ) : (
                availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </div>

      {/* Interaction History */}
      <div
        className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]"
        aria-live="polite"
        aria-label="Historial de conversación"
      >
        {history.map((item) => (
          <div
            key={item.id}
            className={`p-2.5 rounded-xl text-xs leading-relaxed ${
              item.sender === 'user'
                ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-100 ml-6'
                : item.sender === 'system'
                  ? 'bg-slate-800/70 border border-slate-700 text-slate-300'
                  : 'bg-slate-900/80 border border-slate-800 text-slate-200 mr-4'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider opacity-70 mb-1">
              <span>
                {item.sender === 'user'
                  ? 'Usuario'
                  : item.sender === 'system'
                    ? 'Sistema'
                    : 'AVISIA'}
              </span>
              <span>{new Date(item.timestamp).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p>{item.text}</p>
          </div>
        ))}
        <div ref={historyEndRef} />
      </div>

      {/* Quick Questions */}
      <div className="mt-2 pt-2 border-t border-slate-800">
        <div className="text-[11px] text-slate-400 mb-1.5">Preguntas rápidas:</div>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSendQuestion(q)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Text & Optional Voice Input */}
      <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-2">
        <input
          type="text"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder="Escribe tu pregunta a AVISIA..."
          aria-label="Escribe tu pregunta a AVISIA"
          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
        />
        {recognitionSupported && (
          <button
            type="button"
            onClick={onToggleListening}
            aria-label={isListening ? 'Detener micrófono' : 'Hablar por micrófono'}
            className={`p-2 rounded-xl border transition-colors ${
              isListening
                ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
        <button
          type="submit"
          aria-label="Enviar pregunta"
          className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </section>
  );
};

