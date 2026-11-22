import { Capacitor } from '@capacitor/core';
import type { Detection } from '../types/avicia';
import type { ArchitecturalAnalysis } from './ArchitecturalSegmenterService';
import type { DepthMapSummary } from './DepthModelService';
import type { ProximityAssessment } from './DepthProximityService';
import type { StixelNavigationPlan } from './DoorAndStixelService';
import { formatDistanceSteps } from './MessagePolicy';

const PRODUCTION_PROXY_URL = 'https://avisia-app.vercel.app/api/gemini-vision';

export interface AssistiveResult {
  text: string;
  engine: 'gemini' | 'local' | 'tesseract';
  elapsedMs: number;
  error?: string;
}

export class AssistiveVisionService {
  private captureCanvas: HTMLCanvasElement | null = null;
  private cloudAvailable: boolean | null = null;

  /**
   * Resolves the secure server-side proxy endpoint.
   * The Gemini API key NEVER lives in the web bundle, Android APK, or GitHub repo;
   * it is stored strictly as an encrypted environment variable on Vercel.
   */
  private getProxyUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return PRODUCTION_PROXY_URL;
    }
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return PRODUCTION_PROXY_URL;
    }
    return '/api/gemini-vision';
  }

  async checkCloudAvailability(): Promise<boolean> {
    if (this.cloudAvailable !== null) return this.cloudAvailable;
    if (typeof fetch !== 'function') {
      this.cloudAvailable = false;
      return false;
    }
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3500);
      const res = await fetch(this.getProxyUrl(), {
        method: 'GET',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok) {
        this.cloudAvailable = false;
        return false;
      }
      const data = (await res.json()) as { configured?: boolean };
      this.cloudAvailable = Boolean(data.configured);
      return this.cloudAvailable;
    } catch {
      this.cloudAvailable = false;
      return false;
    }
  }

  isCloudReady(): boolean {
    return this.cloudAvailable === true;
  }

  describeLightLevel(brightnessPct: number): string {
    if (brightnessPct <= 10) {
      return `Muy oscuro (${brightnessPct}%). Es probable que la luz esté apagada o el lente esté cubierto.`;
    }
    if (brightnessPct <= 26) {
      return `Poca luz (${brightnessPct}%). Iluminación tenue.`;
    }
    if (brightnessPct <= 58) {
      return `Iluminación moderada (${brightnessPct}%).`;
    }
    if (brightnessPct <= 82) {
      return `Bien iluminado (${brightnessPct}%).`;
    }
    return `Luz muy intensa (${brightnessPct}%), posible ventana o luz directa.`;
  }

  private captureFrameToCanvas(
    source: HTMLVideoElement | HTMLImageElement,
    maxWidth = 768,
    highContrastGray = false
  ): HTMLCanvasElement | null {
    const srcW =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source.naturalWidth || source.width;
    const srcH =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source.naturalHeight || source.height;

    if (!srcW || !srcH) return null;

    const scale = Math.min(1, maxWidth / srcW);
    const outW = Math.max(64, Math.round(srcW * scale));
    const outH = Math.max(64, Math.round(srcH * scale));

    if (!this.captureCanvas) {
      this.captureCanvas = document.createElement('canvas');
    }
    this.captureCanvas.width = outW;
    this.captureCanvas.height = outH;

    const ctx = this.captureCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0, outW, outH);

    if (highContrastGray) {
      const imgData = ctx.getImageData(0, 0, outW, outH);
      const d = imgData.data;
      let minL = 255;
      let maxL = 0;
      const lumas = new Uint8Array(outW * outH);
      for (let i = 0; i < lumas.length; i++) {
        const p = i * 4;
        const l = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
        lumas[i] = l;
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
      }
      const range = Math.max(20, maxL - minL);
      for (let i = 0; i < lumas.length; i++) {
        const p = i * 4;
        const stretched = Math.min(
          255,
          Math.max(0, Math.round(((lumas[i] - minL) / range) * 255))
        );
        d[p] = stretched;
        d[p + 1] = stretched;
        d[p + 2] = stretched;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    return this.captureCanvas;
  }

  private async callCloudVisionProxy(
    canvas: HTMLCanvasElement,
    prompt: string
  ): Promise<string> {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const imageBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 14000);
    try {
      const response = await fetch(this.getProxyUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          prompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 503) {
          this.cloudAvailable = false;
        }
        throw new Error(`Proxy HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { text?: string };
      const text = (payload.text ?? '').trim();
      if (!text) {
        throw new Error('Respuesta vacía del servidor de visión.');
      }
      this.cloudAvailable = true;
      return text;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  /**
   * Holistic scene description:
   * Uses the private server-side Gemini 2.5 Flash proxy seamlessly when available;
   * otherwise synthesizes an honest, clock-face + Stixel local spatial report offline.
   */
  async describeScene(
    source: HTMLVideoElement | HTMLImageElement | null,
    detections: Detection[],
    proximity: ProximityAssessment | null,
    depthSummary: DepthMapSummary | null,
    archSummary: ArchitecturalAnalysis | null = null,
    stixelPlan: StixelNavigationPlan | null = null
  ): Promise<AssistiveResult> {
    const start = performance.now();

    if (source && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      const canvas = this.captureFrameToCanvas(source, 768, false);
      if (canvas) {
        try {
          const prompt = [
            'Eres AVISIA, un asistente visual para una persona ciega en Latinoamérica. Responde en español claro, directo y sin adornos (máximo 3 frases cortas).',
            '1) Primero indica claramente si el camino inmediato al frente (a las 12) está despejado y cuántos pasos libres hay, o hacia qué dirección (a las 10 izquierda o a las 2 derecha) hay espacio libre para rodear.',
            '2) Si hay puertas, especifica si están ABIERTAS (paso libre), CERRADAS (obstáculo) o ENTREABIERTAS (riesgo de golpe con el canto); menciona también cortinas, paredes muy cerca, gradas, muebles o personas con posición de reloj y pasos.',
            '3) Menciona cualquier texto o número de bus claramente legible y el nivel de luz.',
            'Reglas estrictas: nunca inventes objetos si la imagen está borrosa u oscura (dilo honestamente); nunca digas que es seguro cruzar una calle.',
          ].join(' ');
          const text = await this.callCloudVisionProxy(canvas, prompt);
          return {
            text,
            engine: 'gemini',
            elapsedMs: Math.round(performance.now() - start),
          };
        } catch {
          // Graceful transparent fallback to local spatial synthesis
        }
      }
    }

    return {
      text: this.buildLocalSceneSummary(
        detections,
        proximity,
        depthSummary,
        archSummary,
        stixelPlan
      ),
      engine: 'local',
      elapsedMs: Math.round(performance.now() - start),
    };
  }

  buildLocalSceneSummary(
    detections: Detection[],
    proximity: ProximityAssessment | null,
    depthSummary: DepthMapSummary | null,
    archSummary: ArchitecturalAnalysis | null = null,
    stixelPlan: StixelNavigationPlan | null = null
  ): string {
    const parts: string[] = [];

    if (proximity?.cameraQuality === 'lens_blocked') {
      return 'La cámara parece cubierta o sin luz. Verifica que nada tape el lente.';
    }
    if (proximity?.cameraQuality === 'too_dark') {
      parts.push('Hay poca luz, la precisión es limitada.');
    }
    if (proximity?.flatWallAhead || depthSummary?.wallAhead) {
      parts.push('¡Cuidado! Hay una pared o superficie plana muy cerca a las 12.');
    } else if (proximity?.floorVariationDetected || depthSummary?.stepDetectedInDepth) {
      parts.push('¡Cuidado! Se detecta posible grada o desnivel adelante.');
    }

    const confirmed = detections.filter(
      (d) => d.confirmationStatus === 'confirmed' && !d.id.startsWith('corridor-')
    );

    if (stixelPlan) {
      parts.push(stixelPlan.guidanceText);
    } else {
      const hasFrontBlocker =
        Boolean(proximity?.flatWallAhead) ||
        Boolean(proximity?.floorVariationDetected) ||
        Boolean(depthSummary?.wallAhead) ||
        Boolean(depthSummary?.stepDetectedInDepth) ||
        confirmed.some((d) => d.isInanimateObstacle && d.proximityZone === 'front_close');

      if (!hasFrontBlocker && proximity?.cameraQuality === 'ok') {
        if (archSummary?.pathVisuallyClear || confirmed.length === 0) {
          parts.push('El camino al frente se ve despejado.');
        }
      }
    }

    if (confirmed.length > 0) {
      const sorted = [...confirmed].sort((a, b) => {
        const am = a.estimatedMeters ?? 99;
        const bm = b.estimatedMeters ?? 99;
        return am - bm;
      });
      const items = sorted.slice(0, 4).map((d) => {
        const pos = d.clockPosition ?? 'al frente';
        const dist = formatDistanceSteps(d.estimatedMeters);
        return dist
          ? `${d.labelEs.toLowerCase()} ${pos} (${dist})`
          : `${d.labelEs.toLowerCase()} ${pos}`;
      });
      parts.push(`Detecto: ${items.join('; ')}.`);
    } else if (parts.length === 0) {
      parts.push('Camino despejado al frente, sin obstáculos detectados.');
    }

    if (!stixelPlan) {
      if (depthSummary?.clearSide === 'left') {
        parts.push('Hay más espacio libre hacia tu izquierda.');
      } else if (depthSummary?.clearSide === 'right') {
        parts.push('Hay más espacio libre hacia tu derecha.');
      }
    }

    if (proximity && proximity.cameraQuality === 'ok') {
      if (proximity.brightnessPct < 30) {
        parts.push('Iluminación tenue.');
      } else if (proximity.brightnessPct > 78) {
        parts.push('Buena iluminación.');
      }
    }

    return parts.join(' ');
  }

  /**
   * Seeing AI / Lookout-inspired Text Reader (OCR):
   * Uses the private server-side Gemini proxy when online/configured,
   * otherwise runs 100% free & offline Tesseract.js Spanish OCR in a Web Worker.
   */
  async readText(source: HTMLVideoElement | HTMLImageElement | null): Promise<AssistiveResult> {
    const start = performance.now();
    if (!source) {
      return {
        text: 'Activa la cámara o carga una imagen antes de leer texto.',
        engine: 'local',
        elapsedMs: 0,
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      const canvas = this.captureFrameToCanvas(source, 960, false);
      if (canvas) {
        try {
          const prompt =
            'Lee en voz alta y con exactitud todo texto legible en esta imagen (letreros, números de ruta de autobús, etiquetas, documentos, precios). Responde solo con el texto leído en orden natural en español, sin explicaciones extra. Si no hay texto legible, responde exactamente: No se detecta texto legible frente a la cámara.';
          const text = await this.callCloudVisionProxy(canvas, prompt);
          return {
            text,
            engine: 'gemini',
            elapsedMs: Math.round(performance.now() - start),
          };
        } catch {
          // Fall back cleanly to local Tesseract.js OCR
        }
      }
    }

    const canvas = this.captureFrameToCanvas(source, 900, true);
    if (!canvas) {
      return {
        text: 'No se pudo capturar la imagen de la cámara.',
        engine: 'tesseract',
        elapsedMs: Math.round(performance.now() - start),
      };
    }

    let worker: {
      recognize: (img: string | HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>;
      terminate: () => Promise<unknown>;
    } | null = null;
    try {
      const tesseract = await import('tesseract.js');
      worker = await tesseract.createWorker('spa');
      const result = await worker.recognize(canvas.toDataURL('image/png'));
      const rawText = (result.data.text ?? '')
        .replace(/[^\p{L}\p{N}\s.,;:¿?¡!%$/-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const elapsedMs = Math.round(performance.now() - start);
      if (!rawText || rawText.length < 2 || (result.data.confidence ?? 0) < 28) {
        return {
          text: 'No se detectó texto claro. Mantén el teléfono firme, acércate un poco y busca buena luz.',
          engine: 'tesseract',
          elapsedMs,
        };
      }

      return {
        text: `Texto leído: ${rawText}`,
        engine: 'tesseract',
        elapsedMs,
      };
    } catch (err) {
      return {
        text: 'No se pudo iniciar el lector OCR en este dispositivo. Verifica tu conexión la primera vez para descargar el idioma español.',
        engine: 'tesseract',
        elapsedMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'Error OCR',
      };
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
  }

  /**
   * Answers open-ended user questions about the current live camera view via the private
   * server-side proxy when available (otherwise returns null so ConversationService answers locally).
   */
  async answerVisualQuestion(
    source: HTMLVideoElement | HTMLImageElement | null,
    question: string
  ): Promise<string | null> {
    if (!source || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    const canvas = this.captureFrameToCanvas(source, 768, false);
    if (!canvas) return null;

    try {
      const prompt = `Eres AVISIA, asistente visual para una persona ciega. Responde en español en máximo 2 frases claras y honestas a la pregunta del usuario basándote SOLO en la imagen. Nunca inventes información ni confirmes si es seguro cruzar una calle. Pregunta: "${question}"`;
      return await this.callCloudVisionProxy(canvas, prompt);
    } catch {
      return null;
    }
  }
}

export const assistiveVisionService = new AssistiveVisionService();
