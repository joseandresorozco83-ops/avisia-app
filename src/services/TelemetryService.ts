export interface TelemetrySample {
  timestamp: number;
  mode: string;
  inferenceMs: number;
  detectionsCount: number;
  frontObstacle: string | null;
  ttcSeconds: number | null;
  policy: string;
}

export type TelemetryEventType =
  | 'banknote_scan'
  | 'scene_ai'
  | 'ocr_text'
  | 'spoken_alert'
  | 'voice_query'
  | 'preset_change'
  | 'error';

export interface TelemetryEvent {
  timestamp: number;
  type: TelemetryEventType;
  engine?: string;
  elapsedMs?: number;
  success?: boolean;
  detail?: string;
}

export interface NasaTlxRatings {
  mental: number;
  physical: number;
  temporal: number;
  performance: number;
  effort: number;
  frustration: number;
}

export interface PilotEvaluationSummary {
  participantCode: string;
  susAnswers?: number[];
  susScore?: number;
  susGrade?: string;
  nasaTlx?: NasaTlxRatings;
  nasaTlxScore?: number;
  notes?: string;
}

/**
 * Pure Brooke (1996) System Usability Scale (SUS) calculator.
 * Accepts 10 Likert responses in [1..5] and returns score in [0..100].
 */
export function calculateSusScore(answers: number[]): number {
  if (!Array.isArray(answers) || answers.length !== 10) {
    throw new Error('SUS requiere exactamente 10 respuestas en escala 1 a 5.');
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const val = Math.min(5, Math.max(1, Number(answers[i]) || 3));
    sum += i % 2 === 0 ? val - 1 : 5 - val;
  }
  return Number((sum * 2.5).toFixed(1));
}

export function classifySusGrade(score: number): string {
  if (score >= 80.3) return 'A (Excelente)';
  if (score >= 74) return 'B (Muy buena)';
  if (score >= 68) return 'C (Aceptable / Promedio)';
  if (score >= 51) return 'D (Mejorable)';
  return 'F (Deficiente)';
}

/**
 * Raw NASA-TLX workload index (0..100 scale, unweighted mean across 6 dimensions).
 */
export function calculateNasaTlxScore(ratings: NasaTlxRatings): number {
  const vals = [
    ratings.mental,
    ratings.physical,
    ratings.temporal,
    ratings.performance,
    ratings.effort,
    ratings.frustration,
  ].map((v) => Math.min(100, Math.max(0, Number(v) || 0)));
  const avg = vals.reduce((acc, v) => acc + v, 0) / vals.length;
  return Number(avg.toFixed(1));
}

export function classifyWorkload(score: number): string {
  if (score <= 35) return 'Carga cognitiva baja';
  if (score <= 60) return 'Carga cognitiva moderada';
  return 'Carga cognitiva alta (riesgo de fatiga)';
}

/**
 * Prevents CSV Formula Injection (=, +, -, @, tab, CR) and escapes RFC 4180 quotes.
 */
export function sanitizeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export class TelemetryService {
  private samples: TelemetrySample[] = [];
  private events: TelemetryEvent[] = [];
  private readonly maxSamples = 600;
  private readonly maxEvents = 500;
  private sessionId = `avs-${Date.now().toString(36)}`;
  private startedAt = Date.now();
  private participantCode = 'ANON-01';
  private platform: 'android' | 'web' = 'web';

  configureSession(meta: { participantCode?: string; platform?: 'android' | 'web' }): void {
    if (meta.participantCode) {
      this.participantCode = meta.participantCode
        .replace(/[^A-Za-z0-9_-]/g, '')
        .slice(0, 24) || 'ANON-01';
    }
    if (meta.platform) {
      this.platform = meta.platform;
    }
  }

  getSessionMeta() {
    return {
      sessionId: this.sessionId,
      participantCode: this.participantCode,
      platform: this.platform,
      startedAt: this.startedAt,
      appVersion: '4.0.0',
    };
  }

  record(sample: TelemetrySample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  recordEvent(event: Omit<TelemetryEvent, 'timestamp'> & { timestamp?: number }): void {
    const cleanDetail = event.detail ? event.detail.slice(0, 120) : undefined;
    this.events.push({
      ...event,
      detail: cleanDetail,
      timestamp: event.timestamp ?? Date.now(),
    });
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  getSamples(): TelemetrySample[] {
    return [...this.samples];
  }

  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  getStats(): {
    count: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    maxLatencyMs: number;
    obstacleAlerts: number;
    spokenAlerts: number;
    alertsPerMinute: number;
    banknoteScans: number;
    banknoteHits: number;
    banknoteAvgMs: number;
    sessionDurationSec: number;
  } {
    const now = Date.now();
    const sessionDurationSec = Math.max(1, Math.round((now - this.startedAt) / 1000));
    const spokenAlerts = this.events.filter((e) => e.type === 'spoken_alert').length;
    const minutes = Math.max(1 / 6, sessionDurationSec / 60);
    const alertsPerMinute = Number((spokenAlerts / minutes).toFixed(1));

    const banknoteEvents = this.events.filter((e) => e.type === 'banknote_scan');
    const banknoteHits = banknoteEvents.filter((e) => e.success).length;
    const banknoteMsVals = banknoteEvents
      .map((e) => e.elapsedMs)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const banknoteAvgMs =
      banknoteMsVals.length > 0
        ? Math.round(banknoteMsVals.reduce((a, b) => a + b, 0) / banknoteMsVals.length)
        : 0;

    if (this.samples.length === 0) {
      return {
        count: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        maxLatencyMs: 0,
        obstacleAlerts: 0,
        spokenAlerts,
        alertsPerMinute,
        banknoteScans: banknoteEvents.length,
        banknoteHits,
        banknoteAvgMs,
        sessionDurationSec,
      };
    }

    const latencies = this.samples.map((s) => s.inferenceMs).sort((a, b) => a - b);
    const sum = latencies.reduce((acc, v) => acc + v, 0);
    const p50Idx = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.5));
    const p95Idx = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
    const obstacleAlerts = this.samples.filter((s) => s.frontObstacle !== null).length;

    return {
      count: this.samples.length,
      avgLatencyMs: Math.round(sum / latencies.length),
      p50LatencyMs: latencies[p50Idx],
      p95LatencyMs: latencies[p95Idx],
      maxLatencyMs: latencies[latencies.length - 1],
      obstacleAlerts,
      spokenAlerts,
      alertsPerMinute,
      banknoteScans: banknoteEvents.length,
      banknoteHits,
      banknoteAvgMs,
      sessionDurationSec,
    };
  }

  clear(): void {
    this.samples = [];
    this.events = [];
    this.sessionId = `avs-${Date.now().toString(36)}`;
    this.startedAt = Date.now();
  }

  exportCsv(): string {
    const header = 'timestamp,mode,inferenceMs,detectionsCount,frontObstacle,ttcSeconds,policy';
    const rows = this.samples.map(
      (s) =>
        `${s.timestamp},${sanitizeCsvCell(s.mode)},${s.inferenceMs},${s.detectionsCount},${sanitizeCsvCell(
          s.frontObstacle ?? ''
        )},${s.ttcSeconds ?? ''},${sanitizeCsvCell(s.policy)}`
    );
    return [header, ...rows].join('\n');
  }

  /**
   * Privacy-preserving research bundle (JSON): zero raw images, zero GPS coordinates, zero PII.
   */
  exportJson(pilotEvaluation?: PilotEvaluationSummary): string {
    return JSON.stringify(
      {
        schema: 'avisia-pilot-telemetry-v1',
        exportedAt: new Date().toISOString(),
        privacyNotice: 'Anonymous session telemetry only. No images, audio, GPS coordinates, or PII.',
        session: this.getSessionMeta(),
        summary: this.getStats(),
        pilotEvaluation: pilotEvaluation ?? null,
        events: this.events,
        samples: this.samples,
      },
      null,
      2
    );
  }
}

export const telemetryService = new TelemetryService();
