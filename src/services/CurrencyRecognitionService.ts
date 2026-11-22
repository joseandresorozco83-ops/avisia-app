import { Capacitor } from '@capacitor/core';

const PRODUCTION_PROXY_URL = 'https://avisia-app.vercel.app/api/gemini-vision';

export type BanknoteCurrency = 'NIO' | 'USD' | 'unknown';

export interface BanknoteInfo {
  currency: BanknoteCurrency;
  denomination: number | null;
  spokenText: string;
  badgeText: string;
  engine: 'gemini' | 'offline_ocr';
  elapsedMs: number;
}

export const NIO_DENOMINATIONS = [10, 20, 50, 100, 200, 500, 1000] as const;
export const USD_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100] as const;

const NIO_DETAILS: Record<number, { color: string; landmark: string }> = {
  10: { color: 'verde claro', landmark: 'Puerto Salvador Allende' },
  20: { color: 'naranja', landmark: 'Laguna de Perlas' },
  50: { color: 'morado', landmark: 'Mercado de Artesanías de Masaya' },
  100: { color: 'azul', landmark: 'Catedral de Granada' },
  200: { color: 'marrón', landmark: 'Teatro Nacional Rubén Darío' },
  500: { color: 'rojo', landmark: 'Catedral de León' },
  1000: { color: 'verde oscuro', landmark: 'Rubén Darío' },
};

const USD_DETAILS: Record<number, { portrait: string }> = {
  1: { portrait: 'George Washington' },
  2: { portrait: 'Thomas Jefferson' },
  5: { portrait: 'Abraham Lincoln' },
  10: { portrait: 'Alexander Hamilton' },
  20: { portrait: 'Andrew Jackson' },
  50: { portrait: 'Ulysses S. Grant' },
  100: { portrait: 'Benjamin Franklin' },
};

/**
 * Checks whether a spoken or typed Spanish query is asking to identify a banknote.
 */
export function isBanknoteQuestion(rawQuestion: string): boolean {
  const q = rawQuestion
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  return (
    q.includes('billete') ||
    q.includes('de cuanto es este') ||
    q.includes('cuanto vale este') ||
    q.includes('cuantos cordobas') ||
    q.includes('cuantos dolares') ||
    q.includes('denominacion') ||
    q.includes('identificar dinero') ||
    q.includes('reconocer dinero')
  );
}

export type DominantBanknoteHue =
  | 'green_light'
  | 'orange'
  | 'purple'
  | 'blue'
  | 'brown'
  | 'red'
  | 'green_dark'
  | 'neutral';

/**
 * Pure, unit-testable parser that extracts Nicaraguan Córdobas (NIO: 10..1000)
 * or US Dollars (USD: 1..100) from OCR text + optional dominant banknote hue.
 */
export function parseBanknoteFromOcrText(
  rawText: string,
  dominantHue: DominantBanknoteHue = 'neutral'
): { currency: BanknoteCurrency; denomination: number | null; spokenText: string; badgeText: string } {
  const norm = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasNioCue =
    norm.includes('nicaragua') ||
    norm.includes('cordoba') ||
    norm.includes('banco central') ||
    norm.includes('dario') ||
    norm.includes('masaya') ||
    norm.includes('granada') ||
    norm.includes('leon') ||
    norm.includes('momotombo') ||
    norm.includes('gueguense') ||
    norm.includes('c$');

  const hasUsdCue =
    norm.includes('united states') ||
    norm.includes('federal reserve') ||
    norm.includes('dollar') ||
    norm.includes('in god we trust') ||
    norm.includes('washington') ||
    norm.includes('jefferson') ||
    norm.includes('lincoln') ||
    norm.includes('hamilton') ||
    norm.includes('jackson') ||
    norm.includes('grant') ||
    norm.includes('franklin') ||
    norm.includes('usa');

  // Extract explicit numeric tokens
  const nums = new Set<number>();
  const numMatches = norm.match(/\b(1000|500|200|100|50|20|10|5|2|1)\b/g) ?? [];
  for (const m of numMatches) {
    nums.add(parseInt(m, 10));
  }

  // Extract Spanish & English denomination words
  if (/\bmil\b/.test(norm)) nums.add(1000);
  if (/\bquinientos\b/.test(norm)) nums.add(500);
  if (/\bdoscientos\b/.test(norm)) nums.add(200);
  if (/\bcien\b|\bciento\b|\bone hundred\b|\bhundred\b/.test(norm)) nums.add(100);
  if (/\bcincuenta\b|\bfifty\b/.test(norm)) nums.add(50);
  if (/\bveinte\b|\btwenty\b/.test(norm)) nums.add(20);
  if (/\bdiez\b|\bten\b/.test(norm)) nums.add(10);
  if (/\bfive\b/.test(norm)) nums.add(5);
  if (/\btwo\b/.test(norm)) nums.add(2);
  if (/\bone dollar\b|\bone\b/.test(norm) && hasUsdCue) nums.add(1);

  // Portrait cues for USD
  if (norm.includes('franklin')) nums.add(100);
  if (norm.includes('grant')) nums.add(50);
  if (norm.includes('jackson')) nums.add(20);
  if (norm.includes('hamilton')) nums.add(10);
  if (norm.includes('lincoln')) nums.add(5);
  if (norm.includes('jefferson')) nums.add(2);
  if (norm.includes('washington')) nums.add(1);

  // Decide currency cleanly
  const isNioOnlyDenom = nums.has(1000) || nums.has(500) || nums.has(200);
  const isUsdOnlyDenom = nums.has(1) || nums.has(2) || nums.has(5);

  if (hasNioCue || (isNioOnlyDenom && !hasUsdCue)) {
    for (const d of [1000, 500, 200, 100, 50, 20, 10]) {
      if (nums.has(d)) {
        const info = NIO_DETAILS[d];
        return {
          currency: 'NIO',
          denomination: d,
          spokenText: `Billete de ${d} córdobas (${info.color}).`,
          badgeText: `C$ ${d} córdobas`,
        };
      }
    }
    // Hue fallback when "Banco Central de Nicaragua" is clearly read
    const hueToNio: Partial<Record<DominantBanknoteHue, number>> = {
      red: 500,
      brown: 200,
      blue: 100,
      purple: 50,
      orange: 20,
      green_light: 10,
      green_dark: 1000,
    };
    const hueDenom = hueToNio[dominantHue];
    if (hueDenom) {
      const info = NIO_DETAILS[hueDenom];
      return {
        currency: 'NIO',
        denomination: hueDenom,
        spokenText: `Posible billete de ${hueDenom} córdobas (${info.color}). Muéstralo con más luz para confirmar el número.`,
        badgeText: `~ C$ ${hueDenom} córdobas`,
      };
    }
  }

  if (hasUsdCue || (isUsdOnlyDenom && !hasNioCue)) {
    for (const d of [100, 50, 20, 10, 5, 2, 1]) {
      if (nums.has(d)) {
        const info = USD_DETAILS[d];
        const unit = d === 1 ? 'dólar' : 'dólares';
        return {
          currency: 'USD',
          denomination: d,
          spokenText: `Billete de ${d} ${unit} estadounidenses (${info.portrait}).`,
          badgeText: `$ ${d} USD`,
        };
      }
    }
  }

  // Shared denominations (10, 20, 50, 100) without explicit country text: use polymer hue cues
  if (!hasUsdCue && (dominantHue === 'orange' || dominantHue === 'purple' || dominantHue === 'blue' || dominantHue === 'red' || dominantHue === 'brown')) {
    for (const d of [500, 200, 100, 50, 20, 10]) {
      if (nums.has(d)) {
        const info = NIO_DETAILS[d];
        return {
          currency: 'NIO',
          denomination: d,
          spokenText: `Billete de ${d} córdobas (${info.color}).`,
          badgeText: `C$ ${d} córdobas`,
        };
      }
    }
  }

  return {
    currency: 'unknown',
    denomination: null,
    spokenText:
      'No pude confirmar con seguridad el billete. Acércalo a unos 20 centímetros, sin doblarlo y con buena luz.',
    badgeText: 'No confirmado',
  };
}

/**
 * Currency Recognition Service specialized for Nicaragua:
 * Recognizes ALL 7 Nicaraguan Córdoba denominations (C$10, 20, 50, 100, 200, 500, 1000)
 * and ALL 7 common US Dollar denominations ($1, $2, $5, $10, $20, $50, $100).
 * Uses the private server-side Gemini Vision proxy first, with offline Tesseract OCR + color fallback.
 */
export class CurrencyRecognitionService {
  private captureCanvas: HTMLCanvasElement | null = null;

  private getProxyUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return PRODUCTION_PROXY_URL;
    }
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return PRODUCTION_PROXY_URL;
    }
    return '/api/gemini-vision';
  }

  private captureToCanvas(
    source: HTMLVideoElement | HTMLImageElement,
    maxWidth = 960
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
    return this.captureCanvas;
  }

  private estimateDominantHue(canvas: HTMLCanvasElement): DominantBanknoteHue {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 'neutral';
    const w = canvas.width;
    const h = canvas.height;
    const x1 = Math.floor(w * 0.2);
    const y1 = Math.floor(h * 0.2);
    const rw = Math.max(1, Math.floor(w * 0.6));
    const rh = Math.max(1, Math.floor(h * 0.6));
    const data = ctx.getImageData(x1, y1, rw, rh).data;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
    if (count === 0) return 'neutral';
    const r = rSum / count / 255;
    const g = gSum / count / 255;
    const b = bSum / count / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const sat = max === 0 ? 0 : d / max;
    if (sat < 0.16) return 'neutral';

    let hue = 0;
    if (d > 0) {
      if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) hue = ((b - r) / d + 2) * 60;
      else hue = ((r - g) / d + 4) * 60;
    }

    if (hue >= 340 || hue < 15) return 'red';
    if (hue >= 15 && hue < 42) return max < 0.55 ? 'brown' : 'orange';
    if (hue >= 75 && hue < 165) return max < 0.52 ? 'green_dark' : 'green_light';
    if (hue >= 190 && hue < 255) return 'blue';
    if (hue >= 255 && hue < 335) return 'purple';
    return 'neutral';
  }

  private extractSummaryFromCloudText(text: string): {
    currency: BanknoteCurrency;
    denomination: number | null;
    badgeText: string;
  } {
    const norm = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const m = norm.match(/\b(1000|500|200|100|50|20|10|5|2|1)\b/);
    const denom = m ? parseInt(m[1], 10) : null;

    if (norm.includes('cordoba') && denom !== null) {
      return { currency: 'NIO', denomination: denom, badgeText: `C$ ${denom} córdobas` };
    }
    if (norm.includes('dolar') && denom !== null) {
      return { currency: 'USD', denomination: denom, badgeText: `$ ${denom} USD` };
    }
    return { currency: 'unknown', denomination: null, badgeText: 'Resultado IA' };
  }

  async identifyBanknote(
    source: HTMLVideoElement | HTMLImageElement | null
  ): Promise<BanknoteInfo> {
    const start = performance.now();
    if (!source) {
      return {
        currency: 'unknown',
        denomination: null,
        spokenText: 'Activa la cámara y muestra el billete frente al lente para identificarlo.',
        badgeText: 'Sin cámara',
        engine: 'offline_ocr',
        elapsedMs: 0,
      };
    }

    const canvas = this.captureToCanvas(source, 960);
    if (!canvas) {
      return {
        currency: 'unknown',
        denomination: null,
        spokenText: 'No se pudo capturar la imagen del billete. Intenta nuevamente.',
        badgeText: 'Error de captura',
        engine: 'offline_ocr',
        elapsedMs: Math.round(performance.now() - start),
      };
    }

    // 1. Primary: Secure server-side Gemini Vision proxy (near-human accuracy on NIO + USD)
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        const imageBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

        const prompt = [
          'Eres AVISIA, un asistente para una persona ciega en Nicaragua que necesita identificar billetes con total exactitud.',
          'Examina la imagen e identifica si hay un billete de CÓRDOBAS NICARAGÜENSES (Banco Central de Nicaragua, polímero: 10 verde claro/Puerto Salvador Allende, 20 naranja/Laguna de Perlas, 50 morado/Masaya, 100 azul/Catedral de Granada, 200 marrón/Teatro Nacional o Güegüense, 500 rojo/Catedral de León o Momotombo, 1000 verde/Rubén Darío) o un billete de DÓLARES ESTADOUNIDENSES ($1 Washington, $2 Jefferson, $5 Lincoln, $10 Hamilton, $20 Jackson, $50 Grant, $100 Franklin).',
          'Reglas estrictas de seguridad financiera:',
          '1) Si ves claramente el billete (por número, texto, diseño o retrato), responde en una sola frase directa en español empezando por el valor exacto, por ejemplo: "Es un billete de 100 córdobas (azul)." o "Es un billete de 20 dólares estadounidenses."',
          '2) Si se ven varios billetes claros, indica cada uno brevemente.',
          '3) Si NO hay ningún billete en la imagen, o está demasiado borroso, doblado o sin luz para tener certeza, NUNCA adivines: responde exactamente "No puedo confirmar con seguridad el billete. Acércalo un poco, sin doblarlo y con buena luz."',
        ].join(' ');

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 14000);
        try {
          const response = await fetch(this.getProxyUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64,
              mimeType: 'image/jpeg',
              prompt,
            }),
            signal: controller.signal,
          });

          if (response.ok) {
            const payload = (await response.json()) as { text?: string };
            const text = (payload.text ?? '').trim();
            if (text) {
              const parsed = this.extractSummaryFromCloudText(text);
              return {
                currency: parsed.currency,
                denomination: parsed.denomination,
                spokenText: text,
                badgeText: parsed.badgeText,
                engine: 'gemini',
                elapsedMs: Math.round(performance.now() - start),
              };
            }
          }
        } finally {
          window.clearTimeout(timeout);
        }
      } catch {
        // Gracefully fall back to offline OCR + color heuristics
      }
    }

    // 2. Offline / Free Fallback: Tesseract OCR (Spanish + English) + NIO polymer hue verification
    const dominantHue = this.estimateDominantHue(canvas);
    let worker: {
      recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
      terminate: () => Promise<unknown>;
    } | null = null;
    try {
      const tesseract = await import('tesseract.js');
      worker = await tesseract.createWorker(['spa', 'eng']);
      const ocr = await worker.recognize(canvas);
      const parsed = parseBanknoteFromOcrText(ocr.data.text ?? '', dominantHue);
      return {
        currency: parsed.currency,
        denomination: parsed.denomination,
        spokenText: parsed.spokenText,
        badgeText: parsed.badgeText,
        engine: 'offline_ocr',
        elapsedMs: Math.round(performance.now() - start),
      };
    } catch {
      return {
        currency: 'unknown',
        denomination: null,
        spokenText:
          'No pude leer el billete sin conexión. Acércalo con buena luz o verifica tu acceso a internet.',
        badgeText: 'No confirmado',
        engine: 'offline_ocr',
        elapsedMs: Math.round(performance.now() - start),
      };
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
  }
}

export const currencyRecognitionService = new CurrencyRecognitionService();
