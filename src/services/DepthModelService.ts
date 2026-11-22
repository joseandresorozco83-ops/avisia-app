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
  wallAhead: boolean;
  stepDetectedInDepth: boolean;
  clearSide: 'left' | 'right' | 'center' | null;
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
 * Depth Anything V2 predicts inverse depth (disparity): higher values = physically CLOSER.
 * Compares upper-center vs lower-center & left/right zones to avoid false alarms on empty floors.
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

    const avgRegion = (xFrom: number, xTo: number, yFrom: number, yTo: number): number => {
      let sum = 0;
      let count = 0;
      for (let y = yFrom; y < yTo; y++) {
        for (let x = xFrom; x < xTo; x++) {
          const norm = (Number(data[y * mapW + x]) - minVal) / span;
          sum += norm;
          count++;
        }
      }
      return count > 0 ? Math.round((sum / count) * 100) : 0;
    };

    const third = Math.floor(mapW / 3);
    const yMidStart = Math.floor(mapH * 0.25);
    const yMidEnd = Math.floor(mapH * 0.72);
    const yUpperStart = Math.floor(mapH * 0.18);
    const yUpperEnd = Math.floor(mapH * 0.48);

    // Focus on chest/head-level mid corridor rather than bottom floor to avoid floor false alarms
    const leftCloseness = avgRegion(0, third, yMidStart, yMidEnd);
    const centerCloseness = avgRegion(third, third * 2, yMidStart, yMidEnd);
    const rightCloseness = avgRegion(third * 2, mapW, yMidStart, yMidEnd);
    const upperCenterCloseness = avgRegion(third, third * 2, yUpperStart, yUpperEnd);

    // Detect abrupt horizontal depth discontinuity in lower-center corridor (stairs/curbs)
    let abruptDepthRows = 0;
    let prevRowMean = -1;
    const yStepStart = Math.floor(mapH * 0.56);
    const yStepEnd = Math.floor(mapH * 0.88);
    for (let y = yStepStart; y < yStepEnd; y += 2) {
      let rowSum = 0;
      let cnt = 0;
      for (let x = third; x < third * 2; x++) {
        rowSum += (Number(data[y * mapW + x]) - minVal) / span;
        cnt++;
      }
      const rowMean = rowSum / Math.max(1, cnt);
      if (prevRowMean >= 0 && Math.abs(rowMean - prevRowMean) > 0.085) {
        abruptDepthRows++;
      }
      prevRowMean = rowMean;
    }

    const stepDetectedInDepth = abruptDepthRows >= 2;
    const wallAhead = upperCenterCloseness >= 72 && centerCloseness >= 74;
    const closeObstacleAhead =
      wallAhead || (centerCloseness >= 72 && centerCloseness >= Math.min(leftCloseness, rightCloseness) + 12);

    let clearSide: 'left' | 'right' | 'center' | null = null;
    if (closeObstacleAhead) {
      if (leftCloseness + 10 < rightCloseness && leftCloseness < 65) {
        clearSide = 'left';
      } else if (rightCloseness + 10 < leftCloseness && rightCloseness < 65) {
        clearSide = 'right';
      }
    } else if (centerCloseness < 55) {
      clearSide = 'center';
    }

    const estimatedMeters = Number(
      Math.max(0.5, 4.0 - (centerCloseness / 100) * 3.3).toFixed(1)
    );

    return {
      leftCloseness,
      centerCloseness,
      rightCloseness,
      estimatedMeters,
      closeObstacleAhead,
      wallAhead,
      stepDetectedInDepth,
      clearSide,
      inferenceMs,
      backend: this.status.backend ?? 'wasm',
    };
  }
}

export const depthModelService = new DepthModelService();
