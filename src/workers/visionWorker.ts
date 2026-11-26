/// <reference lib="webworker" />
import {
  AutoModelForVision2Seq,
  AutoProcessor,
  RawImage,
  pipeline,
} from '@huggingface/transformers';

type DetectReq = {
  id: number;
  kind: 'init_detect' | 'detect';
  modelId: string;
  rgba?: ArrayBuffer;
  width?: number;
  height?: number;
  threshold?: number;
};

type SegmentReq = {
  id: number;
  kind: 'init_segment' | 'segment';
  modelId: string;
  rgba?: ArrayBuffer;
  width?: number;
  height?: number;
};

type DepthReq = {
  id: number;
  kind: 'init_depth' | 'depth';
  modelId: string;
  rgba?: ArrayBuffer;
  width?: number;
  height?: number;
};

type OfflineVlmReq = {
  id: number;
  kind: 'offline_vlm';
  rgba: ArrayBuffer;
  width: number;
  height: number;
  prompt?: string;
};

type WorkerRequest = DetectReq | SegmentReq | DepthReq | OfflineVlmReq;

type GenericPipelineFn = (
  input: unknown,
  options?: Record<string, unknown>
) => Promise<unknown>;

const detectPipelines = new Map<string, { fn: GenericPipelineFn; backend: 'webgpu' | 'wasm' }>();
const segmentPipelines = new Map<string, { fn: GenericPipelineFn; backend: 'webgpu' | 'wasm' }>();
const depthPipelines = new Map<string, { fn: GenericPipelineFn; backend: 'webgpu' | 'wasm' }>();

let smolVlmState: {
  kind: 'smolvlm';
  processor: unknown;
  model: unknown;
  backend: 'webgpu' | 'wasm';
} | {
  kind: 'captioner';
  fn: GenericPipelineFn;
  backend: 'webgpu' | 'wasm';
} | null = null;

async function detectBackend(): Promise<'webgpu' | 'wasm'> {
  try {
    const nav = self.navigator as unknown as {
      gpu?: { requestAdapter?: () => Promise<unknown | null> };
    };
    if (nav?.gpu && typeof nav.gpu.requestAdapter === 'function') {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // Fallback to WASM
  }
  return 'wasm';
}

async function getOrInitPipeline(
  cache: Map<string, { fn: GenericPipelineFn; backend: 'webgpu' | 'wasm' }>,
  task: string,
  modelId: string,
  webgpuDtype: string,
  wasmDtype: string
): Promise<{ fn: GenericPipelineFn; backend: 'webgpu' | 'wasm' }> {
  const existing = cache.get(modelId);
  if (existing) return existing;

  const preferred = await detectBackend();
  const backends: Array<'webgpu' | 'wasm'> =
    preferred === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];

  let lastErr: unknown = null;
  const createPipe = pipeline as unknown as (
    t: string,
    m: string,
    opts?: Record<string, unknown>
  ) => Promise<GenericPipelineFn>;

  for (const backend of backends) {
    try {
      const fn = await createPipe(task, modelId, {
        device: backend,
        dtype: backend === 'webgpu' ? webgpuDtype : wasmDtype,
      });
      const entry = { fn, backend };
      cache.set(modelId, entry);
      return entry;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to initialize ${modelId}`);
}

async function runOfflineVlm(rawImg: RawImage, prompt: string): Promise<{ text: string; model: string }> {
  const preferred = await detectBackend();

  if (!smolVlmState) {
    // Prefer official HuggingFaceTB/SmolVLM-256M-Instruct on WebGPU; compact vit-gpt2 fallback on WASM
    if (preferred === 'webgpu') {
      try {
        const modelId = 'HuggingFaceTB/SmolVLM-256M-Instruct';
        const processor = await AutoProcessor.from_pretrained(modelId);
        const model = await AutoModelForVision2Seq.from_pretrained(modelId, {
          device: 'webgpu',
          dtype: 'q4f16',
        });
        smolVlmState = { kind: 'smolvlm', processor, model, backend: 'webgpu' };
      } catch {
        // Fall through to lightweight captioner
      }
    }

    if (!smolVlmState) {
      const createPipe = pipeline as unknown as (
        t: string,
        m: string,
        opts?: Record<string, unknown>
      ) => Promise<GenericPipelineFn>;
      const fn = await createPipe('image-to-text', 'Xenova/vit-gpt2-image-captioning', {
        device: 'wasm',
        dtype: 'q8',
      });
      smolVlmState = { kind: 'captioner', fn, backend: 'wasm' };
    }
  }

  if (smolVlmState.kind === 'smolvlm') {
    const proc = smolVlmState.processor as {
      apply_chat_template: (msgs: unknown, opts: Record<string, unknown>) => string;
      batch_decode: (ids: unknown, opts: Record<string, unknown>) => string[];
    } & ((text: string, images: RawImage[]) => Promise<Record<string, unknown>>);

    const mod = smolVlmState.model as {
      generate: (opts: Record<string, unknown>) => Promise<unknown>;
    };

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image' },
          { type: 'text', text: prompt },
        ],
      },
    ];
    const textPrompt = proc.apply_chat_template(messages, { add_generation_prompt: true });
    const inputs = await proc(textPrompt, [rawImg]);
    const generated = await mod.generate({
      ...inputs,
      do_sample: false,
      max_new_tokens: 72,
    });
    const decoded = proc.batch_decode(generated, { skip_special_tokens: true })[0] ?? '';
    const cleaned = decoded.split('Assistant:').pop()?.trim() || decoded.trim();
    return { text: cleaned, model: 'SmolVLM-256M (WebGPU Offline)' };
  }

  const captionOut = (await smolVlmState.fn(rawImg, { max_new_tokens: 40 })) as Array<{
    generated_text?: string;
  }>;
  const rawCaption = captionOut?.[0]?.generated_text?.trim() ?? '';
  return { text: rawCaption, model: 'ViT-GPT2 (WASM Offline)' };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === 'init_detect') {
      const entry = await getOrInitPipeline(
        detectPipelines,
        'object-detection',
        req.modelId,
        'fp16',
        'q8'
      );
      self.postMessage({ id: req.id, ok: true, backend: entry.backend });
      return;
    }

    if (req.kind === 'detect') {
      const entry = await getOrInitPipeline(
        detectPipelines,
        'object-detection',
        req.modelId,
        'fp16',
        'q8'
      );
      const pixels = new Uint8ClampedArray(req.rgba!);
      const rawImg = new RawImage(pixels, req.width!, req.height!, 4);
      const start = performance.now();
      const results = await entry.fn(rawImg, {
        threshold: req.threshold ?? 0.36,
        percentage: true,
      });
      const elapsedMs = Math.round(performance.now() - start);
      self.postMessage({
        id: req.id,
        ok: true,
        backend: entry.backend,
        elapsedMs,
        results,
      });
      return;
    }

    if (req.kind === 'init_segment') {
      const entry = await getOrInitPipeline(
        segmentPipelines,
        'image-segmentation',
        req.modelId,
        'q8',
        'q8'
      );
      self.postMessage({ id: req.id, ok: true, backend: entry.backend });
      return;
    }

    if (req.kind === 'segment') {
      const entry = await getOrInitPipeline(
        segmentPipelines,
        'image-segmentation',
        req.modelId,
        'q8',
        'q8'
      );
      const pixels = new Uint8ClampedArray(req.rgba!);
      const rawImg = new RawImage(pixels, req.width!, req.height!, 4);
      const start = performance.now();
      const rawSegments = (await entry.fn(rawImg)) as Array<{
        label: string;
        score?: number | null;
        mask: { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
      }>;
      const elapsedMs = Math.round(performance.now() - start);

      const transferables: Transferable[] = [];
      const segments = rawSegments.map((seg) => {
        const copy = new Uint8Array(seg.mask.data.length);
        copy.set(seg.mask.data);
        transferables.push(copy.buffer);
        return {
          label: seg.label,
          score: seg.score ?? null,
          mask: {
            data: copy,
            width: seg.mask.width,
            height: seg.mask.height,
          },
        };
      });

      self.postMessage(
        { id: req.id, ok: true, backend: entry.backend, elapsedMs, segments },
        transferables
      );
      return;
    }

    if (req.kind === 'init_depth') {
      const entry = await getOrInitPipeline(
        depthPipelines,
        'depth-estimation',
        req.modelId,
        'fp16',
        'q8'
      );
      self.postMessage({ id: req.id, ok: true, backend: entry.backend });
      return;
    }

    if (req.kind === 'depth') {
      const entry = await getOrInitPipeline(
        depthPipelines,
        'depth-estimation',
        req.modelId,
        'fp16',
        'q8'
      );
      const pixels = new Uint8ClampedArray(req.rgba!);
      const rawImg = new RawImage(pixels, req.width!, req.height!, 4);
      const start = performance.now();
      const out = (await entry.fn(rawImg)) as {
        predicted_depth?: { data: Float32Array | number[]; dims: number[] };
      };
      const elapsedMs = Math.round(performance.now() - start);
      const tensor = out?.predicted_depth;
      if (!tensor || !tensor.data || tensor.data.length === 0) {
        self.postMessage({ id: req.id, ok: true, backend: entry.backend, elapsedMs, grid: null });
        return;
      }

      const dims = tensor.dims;
      const mapH = dims[dims.length - 2] || req.height!;
      const mapW = dims[dims.length - 1] || req.width!;
      const data = tensor.data;

      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let i = 0; i < data.length; i++) {
        const v = Number(data[i]);
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
      const span = Math.max(1e-5, maxVal - minVal);

      // Build compact 24x18 normalized inverse-depth grid inside worker (tiny 1.7KB payload!)
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

      self.postMessage(
        {
          id: req.id,
          ok: true,
          backend: entry.backend,
          elapsedMs,
          grid: { width: gridW, height: gridH, values: gridValues },
        },
        [gridValues.buffer]
      );
      return;
    }

    if (req.kind === 'offline_vlm') {
      const pixels = new Uint8ClampedArray(req.rgba);
      const rawImg = new RawImage(pixels, req.width, req.height, 4);
      const start = performance.now();
      const out = await runOfflineVlm(
        rawImg,
        req.prompt ||
          'Briefly describe obstacles, doors, stairs, or main objects in front of a blind person in 1 short sentence.'
      );
      const elapsedMs = Math.round(performance.now() - start);
      self.postMessage({
        id: req.id,
        ok: true,
        elapsedMs,
        text: out.text,
        model: out.model,
      });
    }
  } catch (err) {
    self.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Worker inference error',
    });
  }
};
