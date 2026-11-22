import { Capacitor } from '@capacitor/core';

const PRODUCTION_PROXY_URL = 'https://avisia-app.vercel.app/api/gemini-vision';

export type BanknoteCurrency = 'NIO' | 'USD' | 'unknown';

export interface BanknoteInfo {
  detected: boolean;
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
): {
  detected: boolean;
  currency: BanknoteCurrency;
  denomination: number | null;
  spokenText: string;
  badgeText: string;
} {
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

  // Repair common OCR digit confusions inside numeric tokens (e.g., "10O" -> "100", "5O0" -> "500", "2O" -> "20", "l00" -> "100")
  const digitRepaired = norm.replace(/\b[0-9oilqs|]{2,4}\b/g, (tok) =>
    tok
      .replace(/[oq]/g, '0')
      .replace(/[il|]/g, '1')
      .replace(/s/g, '5')
  );

  const nums = new Set<number>();
  const numMatches =
    digitRepaired.match(/\b(1000|500|200|100|50|20|10|5|2|1)\b/g) ?? [];
  for (const m of numMatches) {
    nums.add(parseInt(m, 10));
  }

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

  if (norm.includes('franklin')) nums.add(100);
  if (norm.includes('grant')) nums.add(50);
  if (norm.includes('jackson')) nums.add(20);
  if (norm.includes('hamilton')) nums.add(10);
  if (norm.includes('lincoln')) nums.add(5);
  if (norm.includes('jefferson')) nums.add(2);
  if (norm.includes('washington')) nums.add(1);

  const isNioOnlyDenom = nums.has(1000) || nums.has(500) || nums.has(200);
  const isUsdOnlyDenom = nums.has(1) || nums.has(2) || nums.has(5);

  if (hasNioCue || (isNioOnlyDenom && !hasUsdCue)) {
    for (const d of [1000, 500, 200, 100, 50, 20, 10]) {
      if (nums.has(d)) {
        const info = NIO_DETAILS[d];
        return {
          detected: true,
          currency: 'NIO',
          denomination: d,
          spokenText: `Billete de ${d} córdobas (${info.color}).`,
          badgeText: `C$ ${d} córdobas`,
        };
      }
    }
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
        detected: true,
        currency: 'NIO',
        denomination: hueDenom,
        spokenText: `Posible billete de ${hueDenom} córdobas (${info.color}).`,
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
          detected: true,
          currency: 'USD',
          denomination: d,
          spokenText: `Billete de ${d} ${unit} estadounidenses (${info.portrait}).`,
          badgeText: `$ ${d} USD`,
        };
      }
    }
  }

  if (
    !hasUsdCue &&
    (dominantHue === 'orange' ||
      dominantHue === 'purple' ||
      dominantHue === 'blue' ||
      dominantHue === 'red' ||
      dominantHue === 'brown')
  ) {
    for (const d of [500, 200, 100, 50, 20, 10]) {
      if (nums.has(d)) {
        const info = NIO_DETAILS[d];
        return {
          detected: true,
          currency: 'NIO',
          denomination: d,
          spokenText: `Billete de ${d} córdobas (${info.color}).`,
          badgeText: `C$ ${d} córdobas`,
        };
      }
    }
  }

  return {
    detected: false,
    currency: 'unknown',
    denomination: null,
    spokenText:
      'No pude confirmar con seguridad el billete. Acércalo a unos 20 centímetros, sin doblarlo y con buena luz.',
    badgeText: 'No confirmado',
  };
}

/**
 * Pure parser for cloud Vision replies in automatic continuous scan mode.
 * Returns detected=false cleanly when the model replies "NONE" (no banknote visible).
 */
export function parseCloudBanknoteReply(text: string): {
  detected: boolean;
  currency: BanknoteCurrency;
  denomination: number | null;
  badgeText: string;
} {
  const cleaned = text.trim();
  const norm = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    !norm ||
    norm === 'none' ||
    norm.startsWith('none') ||
    norm.includes('no puedo confirmar') ||
    norm.includes('no hay ningun billete') ||
    norm.includes('no se ve ningun billete') ||
    norm.includes('ningun billete')
  ) {
    return { detected: false, currency: 'unknown', denomination: null, badgeText: '' };
  }

  const m = norm.match(/\b(1000|500|200|100|50|20|10|5|2|1)\b/);
  const denom = m ? parseInt(m[1], 10) : null;

  if (norm.includes('cordoba') && denom !== null) {
    return { detected: true, currency: 'NIO', denomination: denom, badgeText: `C$ ${denom} córdobas` };
  }
  if (norm.includes('dolar') && denom !== null) {
    return { detected: true, currency: 'USD', denomination: denom, badgeText: `$ ${denom} USD` };
  }
  return { detected: false, currency: 'unknown', denomination: null, badgeText: '' };
}

/**
 * Currency Recognition Service specialized for Nicaragua:
 * - Automatic continuous hands-free scanning (Seeing AI / Google Lookout Currency style)
 * - Manual / voice on-demand scanning ("¿De cuánto es este billete?")
 * - Recognizes ALL 7 Nicaraguan Córdoba denominations (10..1000) & ALL 7 US Dollar denominations ($1..$100).
 * - Reuses a single offline OCR worker while continuous scanning is active for fast response.
 */
export class CurrencyRecognitionService {
  private captureCanvas: HTMLCanvasElement | null = null;
  private reusableWorker: {
    recognize: (img: string | HTMLCanvasElement) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<unknown>;
  } | null = null;
  private workerInitPromise: Promise<void> | null = null;
  private serverNotConfigured = false;

  private getProxyUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return PRODUCTION_PROXY_URL;
    }
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return PRODUCTION_PROXY_URL;
    }
    return '/api/gemini-vision';
  }

  async disposeOfflineWorker(): Promise<void> {
    if (this.reusableWorker) {
      const w = this.reusableWorker;
      this.reusableWorker = null;
      this.workerInitPromise = null;
      await w.terminate().catch(() => {});
    }
  }

  private async getOfflineWorker() {
    if (this.reusableWorker) return this.reusableWorker;
    if (!this.workerInitPromise) {
      this.workerInitPromise = (async () => {
        const tesseract = await import('tesseract.js');
        this.reusableWorker = await tesseract.createWorker('spa');
      })().catch((err) => {
        // Never leave a permanently rejected promise cached
        this.workerInitPromise = null;
        this.reusableWorker = null;
        throw err;
      });
    }
    await this.workerInitPromise;
    return this.reusableWorker;
  }

  private captureToCanvas(
    source: HTMLVideoElement | HTMLImageElement,
    maxWidth = 840
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

  private prepareOcrCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    // Center-crop 78% of frame where the user holds the banknote & boost grayscale contrast for Tesseract
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const cx = Math.floor(w * 0.11);
    const cy = Math.floor(h * 0.11);
    const cw = Math.max(64, Math.floor(w * 0.78));
    const ch = Math.max(64, Math.floor(h * 0.78));

    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = cw;
    ocrCanvas.height = ch;
    const ctx = ocrCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return sourceCanvas;

    ctx.drawImage(sourceCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
    const img = ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    let minL = 255;
    let maxL = 0;
    const lumas = new Uint8Array(cw * ch);
    for (let i = 0; i < lumas.length; i++) {
      const p = i * 4;
      const l = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
      lumas[i] = l;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    const span = Math.max(24, maxL - minL);
    for (let i = 0; i < lumas.length; i++) {
      const p = i * 4;
      const stretched = Math.min(255, Math.max(0, Math.round(((lumas[i] - minL) / span) * 255)));
      d[p] = stretched;
      d[p + 1] = stretched;
      d[p + 2] = stretched;
    }
    ctx.putImageData(img, 0, 0);
    return ocrCanvas;
  }

  private estimateDominantHue(canvas: HTMLCanvasElement): DominantBanknoteHue {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 'neutral';
    const w = canvas.width;
    const h = canvas.height;
    const x1 = Math.floor(w * 0.18);
    const y1 = Math.floor(h * 0.18);
    const rw = Math.max(1, Math.floor(w * 0.64));
    const rh = Math.max(1, Math.floor(h * 0.64));
    const data = ctx.getImageData(x1, y1, rw, rh).data;

    // Saturated hue bucket histogram (much more accurate than mean RGB on polymer bills with white margins!)
    const buckets: Record<Exclude<DominantBanknoteHue, 'neutral'>, number> = {
      red: 0,
      orange: 0,
      brown: 0,
      green_light: 0,
      green_dark: 0,
      blue: 0,
      purple: 0,
    };
    let totalSampled = 0;

    for (let i = 0; i < data.length; i += 16) {
      totalSampled++;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const sat = max === 0 ? 0 : d / max;
      if (sat < 0.2 || max < 0.15) continue;

      let hue = 0;
      if (d > 0) {
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) hue = ((b - r) / d + 2) * 60;
        else hue = ((r - g) / d + 4) * 60;
      }

      if (hue >= 340 || hue < 14) buckets.red++;
      else if (hue >= 14 && hue < 42) {
        if (max < 0.54) buckets.brown++;
        else buckets.orange++;
      } else if (hue >= 75 && hue < 168) {
        if (max < 0.5) buckets.green_dark++;
        else buckets.green_light++;
      } else if (hue >= 188 && hue < 252) buckets.blue++;
      else if (hue >= 252 && hue < 340) buckets.purple++;
    }

    let bestHue: DominantBanknoteHue = 'neutral';
    let bestCount = Math.max(8, totalSampled * 0.08);
    for (const [k, cnt] of Object.entries(buckets) as Array<
      [Exclude<DominantBanknoteHue, 'neutral'>, number]
    >) {
      if (cnt > bestCount) {
        bestCount = cnt;
        bestHue = k;
      }
    }
    return bestHue;
  }

  /**
   * Identifies a banknote on demand (`silentWhenAbsent = false`) OR
   * continuously/automatically (`silentWhenAbsent = true`, returning `detected: false` silently when no bill is visible).
   */
  async identifyBanknote(
    source: HTMLVideoElement | HTMLImageElement | null,
    silentWhenAbsent = false
  ): Promise<BanknoteInfo> {
    const start = performance.now();
    if (!source) {
      return {
        detected: false,
        currency: 'unknown',
        denomination: null,
        spokenText: 'Activa la cámara y muestra el billete frente al lente para identificarlo.',
        badgeText: 'Sin cámara',
        engine: 'offline_ocr',
        elapsedMs: 0,
      };
    }

    const canvas = this.captureToCanvas(source, silentWhenAbsent ? 720 : 960);
    if (!canvas) {
      return {
        detected: false,
        currency: 'unknown',
        denomination: null,
        spokenText: 'No se pudo capturar la imagen del billete. Intenta nuevamente.',
        badgeText: 'Error de captura',
        engine: 'offline_ocr',
        elapsedMs: Math.round(performance.now() - start),
      };
    }

    // 1. Primary: Secure server-side Gemini Vision proxy (fast, near-human accuracy on NIO + USD)
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', silentWhenAbsent ? 0.78 : 0.84);
        const imageBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

        const prompt = silentWhenAbsent
          ? [
              'Detector automático de billetes para Nicaragua.',
              'Revisa si en la imagen aparece claramente un billete de CÓRDOBAS NICARAGÜENSES (10 verde claro, 20 naranja, 50 morado, 100 azul, 200 marrón, 500 rojo, 1000 verde Rubén Darío) o DÓLARES ESTADOUNIDENSES ($1, $2, $5, $10, $20, $50, $100).',
              'Si NO hay un billete claramente identificable, responde EXACTAMENTE una sola palabra: NONE',
              'Si SÍ hay un billete claro, responde en máximo 6 palabras el valor exacto en español, por ejemplo: "Billete de 100 córdobas." o "Billete de 20 dólares."',
            ].join(' ')
          : [
              'Eres AVISIA, asistente para una persona ciega en Nicaragua. Identifica con total exactitud si hay un billete de CÓRDOBAS NICARAGÜENSES (Banco Central de Nicaragua: 10 verde claro, 20 naranja, 50 morado, 100 azul, 200 marrón, 500 rojo, 1000 verde Rubén Darío) o DÓLARES ESTADOUNIDENSES ($1 Washington, $2 Jefferson, $5 Lincoln, $10 Hamilton, $20 Jackson, $50 Grant, $100 Franklin).',
              'Si lo ves claramente, responde en una frase corta empezando por el valor exacto: "Billete de 100 córdobas (azul)." o "Billete de 20 dólares estadounidenses."',
              'Si no hay billete o está borroso/doblado, NUNCA adivines: responde exactamente "No puedo confirmar con seguridad el billete. Acércalo un poco, sin doblarlo y con buena luz."',
            ].join(' ');

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 11000);
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

          if (response.status === 503) {
            this.serverNotConfigured = true;
          } else if (response.ok) {
            this.serverNotConfigured = false;
            const payload = (await response.json()) as { text?: string };
            const text = (payload.text ?? '').trim();
            if (text) {
              const parsed = parseCloudBanknoteReply(text);
              return {
                detected: parsed.detected,
                currency: parsed.currency,
                denomination: parsed.denomination,
                spokenText: parsed.detected
                  ? text
                  : silentWhenAbsent
                    ? ''
                    : text,
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
        // Fall through to offline OCR fallback
      }
    }

    // 2. Offline Fallback: Reusable Tesseract worker + Córdoba polymer hue cues
    const dominantHue = this.estimateDominantHue(canvas);
    try {
      const worker = await this.getOfflineWorker();
      if (!worker) {
        return {
          detected: false,
          currency: 'unknown',
          denomination: null,
          spokenText: silentWhenAbsent
            ? ''
            : 'No se pudo iniciar el lector local de billetes.',
          badgeText: 'No confirmado',
          engine: 'offline_ocr',
          elapsedMs: Math.round(performance.now() - start),
        };
      }
      const ocrCanvas = this.prepareOcrCanvas(canvas);
      const ocrDataUrl = ocrCanvas.toDataURL('image/png');
      const ocr = await worker.recognize(ocrDataUrl);
      const parsed = parseBanknoteFromOcrText(ocr.data.text ?? '', dominantHue);
      return {
        detected: parsed.detected,
        currency: parsed.currency,
        denomination: parsed.denomination,
        spokenText: parsed.detected
          ? parsed.spokenText
          : silentWhenAbsent
            ? ''
            : this.serverNotConfigured
              ? 'El servidor aún no tiene activa la clave GEMINI_API_KEY en Vercel y el lector local no distinguió el número. Acércalo con buena luz o activa la clave en Vercel.'
              : parsed.spokenText,
        badgeText: parsed.detected ? parsed.badgeText : '',
        engine: 'offline_ocr',
        elapsedMs: Math.round(performance.now() - start),
      };
    } catch {
      return {
        detected: false,
        currency: 'unknown',
        denomination: null,
        spokenText: silentWhenAbsent
          ? ''
          : this.serverNotConfigured
            ? 'Falta activar la variable GEMINI_API_KEY en Vercel (y hacer Redeploy) para reconocer billetes.'
            : 'No se pudo procesar la imagen del billete. Intenta de nuevo con buena luz.',
        badgeText: this.serverNotConfigured ? 'Falta clave en Vercel' : 'No confirmado',
        engine: 'offline_ocr',
        elapsedMs: Math.round(performance.now() - start),
      };
    }
  }
}

export const currencyRecognitionService = new CurrencyRecognitionService();
