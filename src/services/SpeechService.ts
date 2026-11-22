import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import type { SpeechSettings } from '../types/avicia';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export class SpeechService {
  private lastSpokenText = '';
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private fallbackTimer: number | null = null;
  private sharedAudioCtx: AudioContext | null = null;
  private speechEpoch = 0;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.sharedAudioCtx || this.sharedAudioCtx.state === 'closed') {
      this.sharedAudioCtx = new AudioCtx();
    }
    if (this.sharedAudioCtx.state === 'suspended') {
      void this.sharedAudioCtx.resume().catch(() => {});
    }
    return this.sharedAudioCtx;
  }

  unlockAudio(): void {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  isSynthesisSupported(): boolean {
    if (Capacitor.isNativePlatform()) return true;
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  isRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as Record<string, unknown>;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  /**
   * Returns Spanish voices sorted by naturalness:
   * Neural/Natural/Online & Google voices first, legacy offline voices last.
   */
  getSpanishVoices(): SpeechSynthesisVoice[] {
    if (!this.isSynthesisSupported()) return [];
    const voices = window.speechSynthesis.getVoices();
    const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
    const pool = spanish.length > 0 ? spanish : voices;

    const scoreVoice = (v: SpeechSynthesisVoice): number => {
      const name = v.name.toLowerCase();
      let score = 0;
      if (name.includes('natural') || name.includes('neural')) score += 50;
      if (name.includes('online')) score += 35;
      if (name.includes('google')) score += 30;
      if (name.includes('dalia') || name.includes('jorge') || name.includes('paloma') || name.includes('alvaro')) {
        score += 20;
      }
      if (v.lang.toLowerCase().includes('ni') || v.lang.toLowerCase().includes('mx') || v.lang.toLowerCase().includes('419')) {
        score += 10;
      }
      if (!v.localService) score += 10;
      return score;
    };

    return [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  }

  /**
   * Plays a gentle dual-tone acoustic proximity chime via Web Audio API
   * when an inanimate obstacle is detected in front of the user.
   */
  playObstacleChime(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      playTone(587.33, now, 0.14); // D5
      playTone(880.0, now + 0.13, 0.18); // A5
    } catch {
      // Ignore Web Audio errors if blocked
    }
  }

  /**
   * Plays a directional stereo sonar pulse panned left (-1) to right (+1)
   * with pitch/duration scaled by proximity urgency.
   */
  playStereoSonarPing(pan: number, urgency: 'caution' | 'danger'): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const clampedPan = Math.max(-1, Math.min(1, pan));

      osc.type = 'sine';
      osc.frequency.setValueAtTime(urgency === 'danger' ? 880 : 520, now);

      const dur = urgency === 'danger' ? 0.08 : 0.11;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(urgency === 'danger' ? 0.13 : 0.07, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(clampedPan, now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start(now);
      osc.stop(now + dur);
    } catch {
      // Ignore Web Audio errors
    }
  }

  /**
   * Plays a brief confirmation chime when wake word ("Avisia") is recognized.
   */
  playWakeConfirmTone(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.11);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignore Web Audio errors
    }
  }

  /**
   * Seeing AI-inspired light detector musical tone:
   * pitch rises smoothly with ambient luminance (220Hz dark -> 880Hz bright).
   */
  playLightTone(brightnessPct: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const clamped = Math.max(0, Math.min(100, brightnessPct));
      const freq = 220 + (clamped / 100) * 660;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {
      // Ignore Web Audio errors
    }
  }

  /**
   * Envision AI-inspired directional radar beep for Find-Object channel.
   * Higher pitch when the target is centered at 12 o'clock.
   */
  playRadarBeep(pan: number, alignment0to1: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const clampedAlign = Math.max(0, Math.min(1, alignment0to1));
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480 + clampedAlign * 540, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore Web Audio errors
    }
  }

  /**
   * Gentle, low-volume ascending chime indicating the forward path is verified clear.
   * Designed not to mask environmental sounds (traffic, voices).
   */
  playClearPathTone(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const playNote = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.065, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };
      playNote(523.25, now, 0.11); // C5
      playNote(659.25, now + 0.1, 0.14); // E5
    } catch {
      // Ignore Web Audio errors
    }
  }

  /** Distinct tactile haptic patterns for blind non-visual signaling */
  vibratePattern(pattern: 'danger' | 'step' | 'caution' | 'confirm' | 'blocked'): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      switch (pattern) {
        case 'danger':
          navigator.vibrate([120, 55, 120, 55, 180]);
          break;
        case 'step':
          navigator.vibrate([220, 80, 120]);
          break;
        case 'caution':
          navigator.vibrate([70]);
          break;
        case 'blocked':
          navigator.vibrate([300]);
          break;
        case 'confirm':
          navigator.vibrate([45]);
          break;
      }
    } catch {
      // Ignore vibration API errors
    }
  }

  speak(
    text: string,
    settings: SpeechSettings,
    callbacks?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: () => void;
    }
  ): void {
    this.lastSpokenText = text;
    if (!settings.enabled || !text.trim()) {
      callbacks?.onEnd?.();
      return;
    }

    const myEpoch = ++this.speechEpoch;
    const naturalText = this.prepareNaturalProsody(text);

    // Native Android / Capacitor TextToSpeech with strict epoch guard so audios never mix
    if (Capacitor.isNativePlatform()) {
      callbacks?.onStart?.();
      void TextToSpeech.stop()
        .catch(() => {})
        .then(() => {
          if (this.speechEpoch !== myEpoch) return;
          return TextToSpeech.speak({
            text: naturalText,
            lang: 'es-ES',
            rate: Math.min(1.4, Math.max(0.75, settings.rate)),
            pitch: 1.03,
            volume: 1.0,
            category: 'playback',
          });
        })
        .then(() => {
          if (this.speechEpoch === myEpoch) {
            callbacks?.onEnd?.();
          }
        })
        .catch(() => {
          if (this.speechEpoch === myEpoch) {
            callbacks?.onError?.();
          }
        });
      return;
    }

    if (!this.isSynthesisSupported()) {
      callbacks?.onEnd?.();
      return;
    }

    if (this.fallbackTimer !== null) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(naturalText);
    this.activeUtterance = utterance;
    utterance.lang = 'es-419';
    // Slightly warmer pitch & smooth cadence to reduce robotic feel
    utterance.pitch = 1.03;
    utterance.rate = Math.min(1.3, Math.max(0.75, settings.rate));
    utterance.volume = 0.98;

    const voices = this.getSpanishVoices();
    if (settings.voiceURI) {
      const selected = voices.find((v) => v.voiceURI === settings.voiceURI);
      if (selected) utterance.voice = selected;
    } else if (voices.length > 0) {
      utterance.voice = voices[0];
    }

    let settled = false;
    const finish = (isError: boolean) => {
      if (settled) return;
      settled = true;
      if (this.fallbackTimer !== null) {
        window.clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      if (this.activeUtterance === utterance) {
        this.activeUtterance = null;
      }
      if (isError) {
        callbacks?.onError?.();
      } else {
        callbacks?.onEnd?.();
      }
    };

    utterance.onstart = () => callbacks?.onStart?.();
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(true);

    // Safety fallback in case browser speechSynthesis stalls without firing onend
    const maxWaitMs = Math.max(4500, naturalText.length * 115);
    this.fallbackTimer = window.setTimeout(() => finish(false), maxWaitMs);

    window.speechSynthesis.speak(utterance);
  }

  repeatLast(
    settings: SpeechSettings,
    callbacks?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: () => void;
    }
  ): string {
    if (!this.lastSpokenText) {
      return 'Aún no hay un mensaje previo para repetir.';
    }
    this.speak(this.lastSpokenText, settings, callbacks);
    return this.lastSpokenText;
  }

  cancel(): void {
    this.speechEpoch++;
    if (this.fallbackTimer !== null) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (Capacitor.isNativePlatform()) {
      void TextToSpeech.stop().catch(() => {});
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  startListening(
    onResult: (transcript: string) => void,
    onError: (message: string) => void,
    onEnd: () => void
  ): (() => void) | null {
    if (!this.isRecognitionSupported()) {
      onError('El reconocimiento de voz no está disponible en este navegador. Usa la entrada de texto.');
      onEnd();
      return null;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      onEnd();
      return null;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        onResult(transcript);
      }
    };

    recognition.onerror = (event) => {
      onError(`Reconocimiento de voz interrumpido (${event.error}). Puedes escribir tu pregunta.`);
    };

    recognition.onend = () => {
      onEnd();
    };

    recognition.start();
    return () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors if already ended
      }
    };
  }

  /**
   * Continuous hands-free listener for harness use.
   * Triggers on wake word ("avisia" / "avicia") + optional inline question.
   */
  startWakeWordListener(
    onQuestion: (question: string) => void,
    onWakeDetected: () => void,
    onError: (message: string) => void
  ): (() => void) | null {
    if (!this.isRecognitionSupported()) {
      onError('El reconocimiento de voz continuo no está disponible en este navegador.');
      return null;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) return null;

    let stopped = false;
    let awaitingFollowUp = false;
    const recognition = new RecognitionCtor();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const results = event.results;
      const lastIdx = results.length - 1;
      const raw = results[lastIdx]?.[0]?.transcript?.trim() ?? '';
      if (!raw) return;

      const norm = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      const wakeMatch = norm.match(/(?:oye\s+)?(?:avisia|avicia)\b(.*)$/);
      if (wakeMatch) {
        this.playWakeConfirmTone();
        const trailing = (wakeMatch[1] ?? '').trim();
        if (trailing.length >= 3) {
          awaitingFollowUp = false;
          onQuestion(trailing);
        } else {
          awaitingFollowUp = true;
          onWakeDetected();
        }
        return;
      }

      if (awaitingFollowUp) {
        awaitingFollowUp = false;
        onQuestion(raw);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopped = true;
        onError('Permiso de micrófono denegado para el modo manos libres.');
      }
    };

    recognition.onend = () => {
      if (!stopped) {
        window.setTimeout(() => {
          if (!stopped) {
            try {
              recognition.start();
            } catch {
              // Ignore restart race
            }
          }
        }, 350);
      }
    };

    try {
      recognition.start();
    } catch {
      onError('No se pudo iniciar la escucha manos libres.');
      return null;
    }

    return () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors
      }
    };
  }

  private prepareNaturalProsody(text: string): string {
    return text
      .replace(/\bAVISIA\b/g, 'Avisia')
      .replace(/\bAVICIA\b/g, 'Avisia')
      .replace(/\bUAM\b/g, 'Universidad Americana')
      .replace(/\bC00\b/g, 'política C cero cero')
      .replace(/\bC01\b/g, 'política C cero uno')
      .replace(/\bun\/a\b/gi, 'un')
      .replace(/[\/|_#*·—]+/g, ' ')
      .replace(/:\s+/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

export const speechService = new SpeechService();
