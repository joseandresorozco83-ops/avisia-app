export interface TelemetrySample {
  timestamp: number;
  mode: string;
  inferenceMs: number;
  detectionsCount: number;
  frontObstacle: string | null;
  ttcSeconds: number | null;
  policy: string;
}

class TelemetryService {
  private samples: TelemetrySample[] = [];
  private readonly maxSamples = 300;

  record(sample: TelemetrySample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getSamples(): TelemetrySample[] {
    return [...this.samples];
  }

  getStats(): {
    count: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    obstacleAlerts: number;
  } {
    if (this.samples.length === 0) {
      return { count: 0, avgLatencyMs: 0, p95LatencyMs: 0, obstacleAlerts: 0 };
    }
    const latencies = this.samples.map((s) => s.inferenceMs).sort((a, b) => a - b);
    const sum = latencies.reduce((acc, v) => acc + v, 0);
    const p95Idx = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
    const obstacleAlerts = this.samples.filter((s) => s.frontObstacle !== null).length;
    return {
      count: this.samples.length,
      avgLatencyMs: Math.round(sum / latencies.length),
      p95LatencyMs: latencies[p95Idx],
      obstacleAlerts,
    };
  }

  clear(): void {
    this.samples = [];
  }

  exportCsv(): string {
    const header = 'timestamp,mode,inferenceMs,detectionsCount,frontObstacle,ttcSeconds,policy';
    const rows = this.samples.map(
      (s) =>
        `${s.timestamp},${s.mode},${s.inferenceMs},${s.detectionsCount},"${
          s.frontObstacle ?? ''
        }",${s.ttcSeconds ?? ''},${s.policy}`
    );
    return [header, ...rows].join('\n');
  }
}

export const telemetryService = new TelemetryService();
