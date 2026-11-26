import { visionWorkerClient } from './VisionWorkerClient';

export interface DepthModelStatus {
  ready: boolean;
  loading: boolean;
  backend: 'webgpu' | 'wasm' | null;
  usingWorker?: boolean;
  error: string | null;
  inferenceMs: number | null;
}

export interface DepthGrid {
  width: number;
  height: number;
  /** Row-major normalized inverse depth (disparity) in [0..1]: 1.0 = closest, 0.0 = farthest */
  values: Float32Array;
}

export type GroundHazardType = 'none' | 'ascending_stairs' | 'descending_dropoff';

export interface GroundPlaneAnalysis {
  /** True when lower-center inverse depth fits a smooth linear ground plane 1/Z(v) = a*v + b */
  isFlatFloor: boolean;
  /** Linear fit coefficient of determination R^2 in [0..1] */
  planarityR2: number;
  /** Maximum absolute residual from the linear ground-plane fit */
  maxResidual: number;
  /** True ONLY when a coherent 3D step or drop-off breaks the flat floor model */
  stepDetected: boolean;
  hazardType: GroundHazardType;
}

export interface DepthMapSummary {
  leftCloseness: number; // 0..100
  centerCloseness: number; // 0..100
  rightCloseness: number; // 0..100
  estimatedMeters: number;
  closeObstacleAhead: boolean;
  wallAhead: boolean;
  stepDetectedInDepth: boolean;
  groundHazardType?: GroundHazardType;
  groundPlanarityR2?: number;
  clearSide: 'left' | 'right' | 'center' | null;
  /** Compact 24x18 normalized inverse-depth grid for door-state, ground-plane & Stixel fusion */
  grid?: DepthGrid;
  inferenceMs: number;
  backend: 'webgpu' | 'wasm';
}

const DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small';

type DepthPipelineFn = (
  input: unknown
) => Promise<{
  predicted_depth?: { data: Float32Array | number[]; dims: number[] };
  depth?: { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
}>;

/**
 * Pure projective-geometry ground-plane analyzer over Depth Anything V2 inverse depth (1/Z).
 *
 * Projective theorem: On any flat horizontal floor (regardless of ceramic tiles, shadows,
 * carpets, or color changes), inverse depth d(v) = 1/Z(v) is strictly linear in image row v:
 *     d(v) = alpha * v + beta  (with alpha > 0, closer near bottom of image).
 *
 * - Flat patterned floor => R^2 >= 0.88 and tiny residuals => isFlatFloor=true, stepDetected=false.
 * - Ascending stairs => alternating flat risers (dd/dv <= 0.008) & jumps breaking linear fit.
 * - Descending drop-off / curb => sustained drop below expected ground plane (residual < -0.075).
 */
export function analyzeGroundPlaneFromDepth(grid: DepthGrid): GroundPlaneAnalysis {
  const { width, height, values } = grid;
  const xStart = Math.floor(width * 0.28);
  const xEnd = Math.max(xStart + 1, Math.ceil(width * 0.72));
  const yStart = Math.floor(height * 0.52);
  const yEnd = Math.min(height, Math.ceil(height * 0.96));

  const rows: number[] = [];
  const ys: number[] = [];
  const rowMeans: number[] = [];

  for (let y = yStart; y < yEnd; y++) {
    let sum = 0;
    let cnt = 0;
    for (let x = xStart; x < xEnd; x++) {
      sum += values[y * width + x];
      cnt++;
    }
    if (cnt > 0) {
      rows.push(y);
      ys.push(y / Math.max(1, height - 1));
      rowMeans.push(sum / cnt);
    }
  }

  const n = rowMeans.length;
  if (n < 4) {
    return {
      isFlatFloor: true,
      planarityR2: 1,
      maxResidual: 0,
      stepDetected: false,
      hazardType: 'none',
    };
  }

  // Ordinary Least Squares fit: d(y) = slope * y + intercept
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += ys[i];
    sumY += rowMeans[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0;
  let varX = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const dx = ys[i] - meanX;
    const dy = rowMeans[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    ssTot += dy * dy;
  }

  const slope = varX > 1e-6 ? covXY / varX : 0;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let maxResidual = 0;
  let sustainedDropRows = 0;
  let maxDropStreak = 0;
  let riserTransitions = 0;
  let prevDiff = 0;

  for (let i = 0; i < n; i++) {
    const pred = slope * ys[i] + intercept;
    const res = rowMeans[i] - pred;
    ssRes += res * res;
    if (Math.abs(res) > maxResidual) maxResidual = Math.abs(res);

    // Sustained drop below projected floor plane (curb drop-off / stairs going down)
    if (res < -0.075) {
      sustainedDropRows++;
      if (sustainedDropRows > maxDropStreak) maxDropStreak = sustainedDropRows;
    } else {
      sustainedDropRows = 0;
    }

    // Detect bimodal riser/tread oscillation (ascending staircase signature: steep jump alternating with flat riser)
    if (i > 0) {
      const diff = rowMeans[i] - rowMeans[i - 1];
      if (i > 1) {
        const strongContrast =
          (diff > 0.085 && prevDiff < 0.015) || (prevDiff > 0.085 && diff < 0.015);
        if (strongContrast) {
          riserTransitions++;
        }
      }
      prevDiff = diff;
    }
  }

  // When floor depth variation is tiny (e.g., flat distant corridor), treat as planar unless clear drop exists
  const planarityR2 =
    ssTot < 0.0025 ? 1 : Number(Math.max(0, Math.min(1, 1 - ssRes / ssTot)).toFixed(3));
  const roundedResidual = Number(maxResidual.toFixed(3));

  // Flat planar floor check: smooth increasing disparity toward bottom of frame
  const isFlatFloor = planarityR2 >= 0.86 && maxResidual < 0.072 && riserTransitions < 2;

  if (isFlatFloor) {
    return {
      isFlatFloor: true,
      planarityR2,
      maxResidual: roundedResidual,
      stepDetected: false,
      hazardType: 'none',
    };
  }

  // Ascending staircase: non-planar ground with periodic tread/riser transitions
  if (riserTransitions >= 2 && maxResidual >= 0.058) {
    return {
      isFlatFloor: false,
      planarityR2,
      maxResidual: roundedResidual,
      stepDetected: true,
      hazardType: 'ascending_stairs',
    };
  }

  // Descending drop-off / step down: clear negative deviation below linear floor plane
  if (maxDropStreak >= 2 && slope > 0.12 && planarityR2 < 0.84) {
    return {
      isFlatFloor: false,
      planarityR2,
      maxResidual: roundedResidual,
      stepDetected: true,
      hazardType: 'descending_dropoff',
    };
  }

  return {
    isFlatFloor: planarityR2 >= 0.8,
    planarityR2,
    maxResidual: roundedResidual,
    stepDetected: false,
    hazardType: 'none',
  };
}

/**
 * Summarizes a compact 24x18 normalized inverse-depth grid into directional closeness,
 * wall proximity, clear side, and 3D ground-plane step analysis.
 */
export function summarizeDepthGrid(
  grid: DepthGrid,
  inferenceMs: number,
  backend: 'webgpu' | 'wasm',
  confirmedStep: boolean,
  groundPlane: GroundPlaneAnalysis
): DepthMapSummary {
  const { width: mapW, height: mapH, values: data } = grid;

  const avgRegion = (xFrom: number, xTo: number, yFrom: number, yTo: number): number => {
    let sum = 0;
    let count = 0;
    for (let y = yFrom; y < yTo; y++) {
      for (let x = xFrom; x < xTo; x++) {
        sum += data[y * mapW + x];
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

  const leftCloseness = avgRegion(0, third, yMidStart, yMidEnd);
  const centerCloseness = avgRegion(third, third * 2, yMidStart, yMidEnd);
  const rightCloseness = avgRegion(third * 2, mapW, yMidStart, yMidEnd);
  const upperCenterCloseness = avgRegion(third, third * 2, yUpperStart, yUpperEnd);

  const wallAhead = upperCenterCloseness >= 68 && centerCloseness >= 70;
  const closeObstacleAhead =
    wallAhead ||
    (centerCloseness >= 68 && centerCloseness >= Math.min(leftCloseness, rightCloseness) + 10);

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

  const dNorm = Math.max(0, Math.min(1, centerCloseness / 100));
  const estimatedMeters = Number(
    Math.max(0.45, 0.45 + 4.35 * Math.pow(1 - dNorm, 1.75)).toFixed(1)
  );

  return {
    leftCloseness,
    centerCloseness,
    rightCloseness,
    estimatedMeters,
    closeObstacleAhead,
    wallAhead,
    stepDetectedInDepth: confirmedStep,
    groundHazardType: confirmedStep ? groundPlane.hazardType : 'none',
    groundPlanarityR2: groundPlane.planarityR2,
    clearSide,
    grid,
    inferenceMs,
    backend,
  };
}

/**
 * Monocular depth estimator powered by Depth Anything V2 Small (Web Worker primary,
 * main-thread fallback) with aspect-ratio-preserving capture and 3D ground-plane verification.
 */
export class DepthModelService {
  private estimator: DepthPipelineFn | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private usingWorker = false;
  private stepConfirmStreak = 0;
  private status: DepthModelStatus = {
    ready: false,
    loading: false,
    backend: null,
    usingWorker: false,
    error: null,
    inferenceMs: null,
  };

  getStatus(): DepthModelStatus {
    return { ...this.status };
  }

  reset(): void {
    this.stepConfirmStreak = 0;
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
    if (this.status.ready) return this.getStatus();
    if (this.status.loading) return this.getStatus();

    this.status = { ...this.status, loading: true, error: null };

    // 1. Primary: Off-main-thread Web Worker (keeps UI and speech completely stutter-free)
    if (visionWorkerClient.isAvailable()) {
      try {
        const res = await visionWorkerClient.initDepth(DEPTH_MODEL_ID);
        this.usingWorker = true;
        this.status = {
          ready: true,
          loading: false,
          backend: res.backend,
          usingWorker: true,
          error: null,
          inferenceMs: null,
        };
        return this.getStatus();
      } catch {
        this.usingWorker = false;
      }
    }

    // 2. Fallback: Main-thread Transformers.js pipeline
    const preferred = await this.detectBackend();
    const backends: Array<'webgpu' | 'wasm'> =
      preferred === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];

    for (const backend of backends) {
      try {
        const transformers = await import('@huggingface/transformers');
        const createPipeline = transformers.pipeline as unknown as (
          task: string,
          model: string,
          opts?: Record<string, unknown>
        ) => Promise<DepthPipelineFn>;

        this.estimator = await createPipeline('depth-estimation', DEPTH_MODEL_ID, {
          device: backend,
          dtype: backend === 'webgpu' ? 'fp16' : 'q8',
        });

        this.usingWorker = false;
        this.status = {
          ready: true,
          loading: false,
          backend,
          usingWorker: false,
          error: null,
          inferenceMs: null,
        };
        return this.getStatus();
      } catch (err) {
        this.status.error =
          err instanceof Error
            ? err.message
            : 'No se pudo cargar Depth Anything V2 Small.';
      }
    }

    this.status = {
      ready: false,
      loading: false,
      backend: null,
      usingWorker: false,
      error: this.status.error ?? 'No se pudo cargar Depth Anything V2 Small.',
      inferenceMs: null,
    };
    return this.getStatus();
  }

  private capturePreservingAspect(
    source: HTMLVideoElement | HTMLImageElement,
    maxDim = 224
  ): { canvas: HTMLCanvasElement; width: number; height: number } | null {
    const srcW =
      source instanceof HTMLVideoElement
        ? source.videoWidth || 640
        : source.naturalWidth || source.width || 640;
    const srcH =
      source instanceof HTMLVideoElement
        ? source.videoHeight || 480
        : source.naturalHeight || source.height || 480;
    if (!srcW || !srcH) return null;

    // Preserve exact portrait 9:16 or landscape 16:9 geometry (eliminates vertical squashing!)
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
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
    return { canvas: this.captureCanvas, width: outW, height: outH };
  }

  async estimateFromSource(
    source: HTMLVideoElement | HTMLImageElement
  ): Promise<DepthMapSummary | null> {
    if (source instanceof HTMLVideoElement && source.readyState < 2) return null;

    if (!this.status.ready) {
      const st = await this.initialize();
      if (!st.ready) return null;
    }

    const captured = this.capturePreservingAspect(source, 224);
    if (!captured) return null;

    let grid: DepthGrid | null = null;
    let inferenceMs = 0;
    let backend: 'webgpu' | 'wasm' = this.status.backend ?? 'wasm';

    if (this.usingWorker && visionWorkerClient.isAvailable()) {
      const ctx = captured.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const rgba = ctx.getImageData(0, 0, captured.width, captured.height).data;
      const res = await visionWorkerClient.runDepth(
        DEPTH_MODEL_ID,
        rgba,
        captured.width,
        captured.height
      );
      grid = res.grid;
      inferenceMs = res.elapsedMs;
      backend = res.backend;
    } else if (this.estimator) {
      const start = performance.now();
      const { RawImage } = await import('@huggingface/transformers');
      const rawImg = RawImage.fromCanvas(captured.canvas);
      const out = await this.estimator(rawImg);
      inferenceMs = Math.round(performance.now() - start);
      const tensor = out.predicted_depth;
      if (tensor && tensor.data && tensor.data.length > 0) {
        const dims = tensor.dims;
        const mapH = dims[dims.length - 2] || captured.height;
        const mapW = dims[dims.length - 1] || captured.width;
        const data = tensor.data;
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let i = 0; i < data.length; i++) {
          const v = Number(data[i]);
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
        const span = Math.max(1e-5, maxVal - minVal);
        const gridW = 24;
        const gridH = 18;
        const gridValues = new Float32Array(gridW * gridH);
        for (let gy = 0; gy < gridH; gy++) {
          const srcY = Math.min(mapH - 1, Math.floor(((gy + 0.5) / gridH) * mapH));
          for (let gx = 0; gx < gridW; gx++) {
            const srcX = Math.min(mapW - 1, Math.floor(((gx + 0.5) / gridW) * mapW));
            const raw = Number(data[srcY * mapW + srcX]);
            gridValues[gy * gridW + gx] = Math.max(0, Math.min(1, (raw - minVal) / span));
          }
        }
        grid = { width: gridW, height: gridH, values: gridValues };
      }
    }

    if (!grid) return null;
    this.status.inferenceMs = inferenceMs;

    // 3D Ground-plane linearity test + 2-frame temporal confirmation (immune to flat tile/color textures!)
    const groundPlane = analyzeGroundPlaneFromDepth(grid);
    if (groundPlane.stepDetected) {
      this.stepConfirmStreak = Math.min(5, this.stepConfirmStreak + 1);
    } else {
      this.stepConfirmStreak = Math.max(0, this.stepConfirmStreak - 1);
    }
    const confirmedStep =
      source instanceof HTMLImageElement
        ? groundPlane.stepDetected
        : this.stepConfirmStreak >= 2;

    return summarizeDepthGrid(grid, inferenceMs, backend, confirmedStep, groundPlane);
  }

  async estimateFromVideo(video: HTMLVideoElement): Promise<DepthMapSummary | null> {
    return this.estimateFromSource(video);
  }
}

export const depthModelService = new DepthModelService();
