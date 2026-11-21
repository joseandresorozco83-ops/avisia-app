export interface DepthModelStatus {
  ready: boolean;
  loading: boolean;
  backend: 'webgpu' | 'wasm' | null;
  error: string | null;
  inferenceMs: number | null;
}

export interface DepthMapSummary {
  leftCloseness: number; // 0..100
  centerCloseness: number; // 0..100
  rightCloseness: number; // 0..100
  estimatedMeters: number;
  closeObstacleAhead: boolean;
  inferenceMs: number;
  backend: 'webgpu' | 'wasm';
}

type DepthPipelineFn = (
  input: unknown
) => Promise<{
  predicted_depth?: { data: Float32Array | number[]; dims: number[] };
  depth?: { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
}>;

/**
 * Lazy-loaded monocular depth estimator powered by Depth Anything V2 Small
 * via @huggingface/transformers (WebGPU primary, WASM fallback).
 */
export class DepthModelService {
  private estimator: DepthPipelineFn | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private status: DepthModelStatus = {
    ready: false,
    loading: false,
    backend: null,
    error: null,
    inferenceMs: null,
  };

  getStatus(): DepthModelStatus {
    return { ...this.status };
  }

  private async detectBackend(): Promise<'webgpu' | 'wasm'> {
    try {
      const nav = navigator as unknown as {
        gpu?: { requestAdapter?: () => Promise<unknown | null> };
      };
      if (nav.gpu && typeof nav.gpu.requestAdapter === 'function') {
        const adapter = await nav.gpu.requestAdapter();
        if (adapter) return 'webgpu';
      }
    } catch {
      // Fallback to WASM
    }
    return 'wasm';
  }

  async initialize(): Promise<DepthModelStatus> {
    if (this.estimator) return this.getStatus();
    if (this.status.loading) return this.getStatus();

    this.status = { ...this.status, loading: true, error: null };

    try {
      const backend = await this.detectBackend();
      const transformers = await import('@huggingface/transformers');
      const createPipeline = transformers.pipeline as unknown as (
        task: string,
        model: string,
        opts?: Record<string, unknown>
      ) => Promise<DepthPipelineFn>;

      this.estimator = await createPipeline(
        'depth-estimation',
        'onnx-community/depth-anything-v2-small',
        {
          device: backend,
          dtype: backend === 'webgpu' ? 'fp16' : 'q8',
        }
      );

      this.status = {
        ready: true,
        loading: false,
        backend,
        error: null,
        inferenceMs: null,
      };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar Depth Anything V2 Small.';
      this.status = {
        ready: false,
        loading: false,
        backend: null,
        error: msg,
        inferenceMs: null,
      };
    }

    return this.getStatus();
  }

  async estimateFromVideo(video: HTMLVideoElement): Promise<DepthMapSummary | null> {
    if (video.readyState < 2) return null;

    if (!this.estimator) {
      const st = await this.initialize();
      if (!st.ready || !this.estimator) return null;
    }

    if (!this.captureCanvas) {
      this.captureCanvas = document.createElement('canvas');
      this.captureCanvas.width = 224;
      this.captureCanvas.height = 168;
    }

    const w = this.captureCanvas.width;
    const h = this.captureCanvas.height;
    const ctx = this.captureCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);

    const start = performance.now();
    const { RawImage } = await import('@huggingface/transformers');
    const rawImg = RawImage.fromCanvas(this.captureCanvas);
    const out = await this.estimator(rawImg);
    const inferenceMs = Math.round(performance.now() - start);
    this.status.inferenceMs = inferenceMs;

    const tensor = out.predicted_depth;
    if (!tensor || !tensor.data || tensor.data.length === 0) return null;

    const dims = tensor.dims;
    const mapH = dims[dims.length - 2] || h;
    const mapW = dims[dims.length - 1] || w;
    const data = tensor.data;

    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = Number(data[i]);
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    const span = Math.max(1e-5, maxVal - minVal);

    // Sample lower-middle band (y: 35%..80%) split into left, center, right
    const yStart = Math.floor(mapH * 0.35);
    const yEnd = Math.floor(mapH * 0.8);

    const avgZone = (xFrom: number, xTo: number): number => {
      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xFrom; x < xTo; x++) {
          const norm = (Number(data[y * mapW + x]) - minVal) / span;
          sum += norm;
          count++;
        }
      }
      return count > 0 ? Math.round((sum / count) * 100) : 0;
    };

    const third = Math.floor(mapW / 3);
    const leftCloseness = avgZone(0, third);
    const centerCloseness = avgZone(third, third * 2);
    const rightCloseness = avgZone(third * 2, mapW);

    // Approximate relative distance in meters from normalized closeness
    const estimatedMeters = Number(
      Math.max(0.5, 4.2 - (centerCloseness / 100) * 3.5).toFixed(1)
    );

    return {
      leftCloseness,
      centerCloseness,
      rightCloseness,
      estimatedMeters,
      closeObstacleAhead: centerCloseness >= 68,
      inferenceMs,
      backend: this.status.backend ?? 'wasm',
    };
  }
}

export const depthModelService = new DepthModelService();
