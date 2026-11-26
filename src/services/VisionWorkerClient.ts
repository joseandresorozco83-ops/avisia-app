import type { RawSegmentItem } from './ArchitecturalSegmenterService';
import type { DepthGrid } from './DepthModelService';

export interface WorkerDetectionItem {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

/**
 * Manages the dedicated off-main-thread Vision Web Worker for ONNX/Transformers.js
 * inference (D-FINE, YOLOv10, SegFormer, Depth Anything V2, optional Offline VLM).
 * Falls back transparently when Web Workers are unavailable (e.g., Node/Vitest).
 */
export class VisionWorkerClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  isAvailable(): boolean {
    return typeof Worker !== 'undefined' && typeof window !== 'undefined' && !this.workerFailed;
  }

  private getWorker(): Worker | null {
    if (!this.isAvailable()) return null;
    if (this.worker) return this.worker;

    try {
      const w = new Worker(new URL('../workers/visionWorker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (event: MessageEvent<{ id: number; ok: boolean; error?: string }>) => {
        const msg = event.data;
        const req = this.pending.get(msg.id);
        if (!req) return;
        this.pending.delete(msg.id);
        window.clearTimeout(req.timer);
        if (msg.ok) {
          req.resolve(msg);
        } else {
          req.reject(new Error(msg.error || 'Vision worker error'));
        }
      };
      w.onerror = () => {
        this.workerFailed = true;
        this.rejectAll('Vision worker crashed; falling back to main thread.');
        try {
          w.terminate();
        } catch {
          // Ignore
        }
        this.worker = null;
      };
      this.worker = w;
      return w;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  private rejectAll(message: string): void {
    for (const [, req] of this.pending.entries()) {
      window.clearTimeout(req.timer);
      req.reject(new Error(message));
    }
    this.pending.clear();
  }

  private call<T>(
    payload: Record<string, unknown>,
    transferables: Transferable[] = [],
    timeoutMs = 60_000
  ): Promise<T> {
    const worker = this.getWorker();
    if (!worker) {
      return Promise.reject(new Error('Web Worker no disponible.'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Tiempo de espera agotado en Vision Worker.'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      worker.postMessage({ ...payload, id }, transferables);
    });
  }

  initDetector(modelId: string): Promise<{ backend: 'webgpu' | 'wasm' }> {
    return this.call({ kind: 'init_detect', modelId }, [], 90_000);
  }

  runDetect(
    modelId: string,
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    threshold: number
  ): Promise<{ backend: 'webgpu' | 'wasm'; elapsedMs: number; results: WorkerDetectionItem[] }> {
    const copy = new Uint8ClampedArray(rgba);
    return this.call(
      { kind: 'detect', modelId, rgba: copy.buffer, width, height, threshold },
      [copy.buffer],
      30_000
    );
  }

  initSegmenter(modelId: string): Promise<{ backend: 'webgpu' | 'wasm' }> {
    return this.call({ kind: 'init_segment', modelId }, [], 90_000);
  }

  runSegment(
    modelId: string,
    rgba: Uint8ClampedArray,
    width: number,
    height: number
  ): Promise<{ backend: 'webgpu' | 'wasm'; elapsedMs: number; segments: RawSegmentItem[] }> {
    const copy = new Uint8ClampedArray(rgba);
    return this.call(
      { kind: 'segment', modelId, rgba: copy.buffer, width, height },
      [copy.buffer],
      30_000
    );
  }

  initDepth(modelId: string): Promise<{ backend: 'webgpu' | 'wasm' }> {
    return this.call({ kind: 'init_depth', modelId }, [], 90_000);
  }

  runDepth(
    modelId: string,
    rgba: Uint8ClampedArray,
    width: number,
    height: number
  ): Promise<{ backend: 'webgpu' | 'wasm'; elapsedMs: number; grid: DepthGrid | null }> {
    const copy = new Uint8ClampedArray(rgba);
    return this.call(
      { kind: 'depth', modelId, rgba: copy.buffer, width, height },
      [copy.buffer],
      30_000
    );
  }

  runOfflineVlm(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    prompt?: string
  ): Promise<{ elapsedMs: number; text: string; model: string }> {
    const copy = new Uint8ClampedArray(rgba);
    return this.call(
      { kind: 'offline_vlm', rgba: copy.buffer, width, height, prompt },
      [copy.buffer],
      120_000
    );
  }
}

export const visionWorkerClient = new VisionWorkerClient();
