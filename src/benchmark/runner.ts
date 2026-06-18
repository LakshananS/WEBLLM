import { pipeline, env } from '@huggingface/transformers';
import type { ModelConfig, BenchmarkDataset, BenchmarkRun, FileProgress } from '../types';
import { collectMemoryMB } from './metrics';
import { scoreQuality } from './quality';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ── Singleton pipeline cache ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipelineCache = new Map<string, unknown>();

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ProgressEvent {
  type: 'download' | 'load-start' | 'load-done' | 'run-start' | 'run-done' | 'error';
  modelId: string;
  file?: string;
  fileProgress?: FileProgress;
  datasetId?: string;
  run?: BenchmarkRun;
  error?: string;
}

// ── Extraction helper for Tier 2 outputs ─────────────────────────────────
function extractGeneratedText(raw: string, prompt: string): string {
  // If full text was returned, strip the prompt prefix
  if (raw.startsWith(prompt)) {
    return raw.slice(prompt.length).trim();
  }
  // Strip common chat end tokens
  return raw
    .replace(/<\|eot_id\|>.*$/s, '')
    .replace(/<\|im_end\|>.*$/s, '')
    .replace(/<end_of_turn>.*$/s, '')
    .trim();
}

// ── Model loading ─────────────────────────────────────────────────────────
export async function loadModel(
  config: ModelConfig,
  device: 'webgpu' | 'wasm',
  onProgress: ProgressCallback,
): Promise<void> {
  if (pipelineCache.has(config.id)) return;

  const startMs = performance.now();
  onProgress({ type: 'load-start', modelId: config.id });

  const fileProgress: Record<string, FileProgress> = {};

  try {
    const pipe = await pipeline(config.pipelineType as 'summarization', config.id, {
      dtype: config.dtype as 'fp32',
      device: device as 'wasm',
      progress_callback: (p: Record<string, unknown>) => {
        console.debug('[HF progress]', p);
        const file = (p.file ?? p.name ?? 'unknown') as string;
        if (p.status === 'initiate') {
          fileProgress[file] = { pct: 0, loaded: 0, total: (p.total as number) ?? 0, done: false };
        } else if (p.status === 'download' || p.status === 'progress') {
          if (!fileProgress[file]) fileProgress[file] = { pct: 0, loaded: 0, total: 0, done: false };
          fileProgress[file].pct    = (p.progress as number) ?? 0;
          fileProgress[file].loaded = (p.loaded as number) ?? 0;
          fileProgress[file].total  = (p.total as number) ?? fileProgress[file].total;
        } else if (p.status === 'done') {
          if (!fileProgress[file]) fileProgress[file] = { pct: 100, loaded: 0, total: 0, done: false };
          fileProgress[file].done = true;
          fileProgress[file].pct  = 100;
        }
        onProgress({
          type: 'download',
          modelId: config.id,
          file,
          fileProgress: fileProgress[file],
        });
      },
    } as Parameters<typeof pipeline>[2]);

    pipelineCache.set(config.id, pipe as unknown);
    onProgress({
      type: 'load-done',
      modelId: config.id,
      run: {
        id: '',
        modelId: config.id,
        datasetId: '',
        timestamp: Date.now(),
        summary: '',
        metrics: {
          loadTimeMs: performance.now() - startMs,
          inferenceTimeMs: 0,
          downloadBytes: Object.values(fileProgress).reduce((s, f) => s + f.total, 0),
          memoryMB: collectMemoryMB(),
          webGpuUsed: device === 'webgpu',
        },
        quality: { coverage: 0, compression: 0, coherence: 0, completeness: 0, clarity: 0, overall: 0 },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pipelineCache.delete(config.id);
    onProgress({ type: 'error', modelId: config.id, error: msg });
    throw err;
  }
}

// ── Single dataset run ────────────────────────────────────────────────────
export async function runDataset(
  config: ModelConfig,
  dataset: BenchmarkDataset,
  loadTimeMs: number,
  downloadBytes: number,
  webGpuUsed: boolean,
  onProgress: ProgressCallback,
): Promise<BenchmarkRun> {
  const runId = `${config.id}::${dataset.id}::${Date.now()}`;
  onProgress({ type: 'run-start', modelId: config.id, datasetId: dataset.id });

  const pipe = pipelineCache.get(config.id);
  if (!pipe) throw new Error(`Model ${config.id} is not loaded.`);

  let summary = '';
  const inferStart = performance.now();

  try {
    if (config.pipelineType === 'summarization') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (pipe as any)(dataset.text, { max_new_tokens: config.maxNewTokens, min_new_tokens: 20 }) as Array<{ summary_text: string }>;
      summary = result[0]?.summary_text ?? '';
    } else {
      // Tier 2: text-generation
      const prompt = config.promptTemplate!(dataset.text);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (pipe as any)(prompt, { max_new_tokens: config.maxNewTokens, return_full_text: false }) as Array<{ generated_text: string }>;
      const raw = result[0]?.generated_text ?? '';
      summary = extractGeneratedText(raw, prompt);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const run: BenchmarkRun = {
      id: runId,
      modelId: config.id,
      datasetId: dataset.id,
      timestamp: Date.now(),
      summary: '',
      metrics: {
        loadTimeMs,
        inferenceTimeMs: performance.now() - inferStart,
        downloadBytes,
        memoryMB: collectMemoryMB(),
        webGpuUsed,
      },
      quality: { coverage: 0, compression: 0, coherence: 0, completeness: 0, clarity: 0, overall: 0 },
      error: msg,
    };
    onProgress({ type: 'error', modelId: config.id, datasetId: dataset.id, error: msg, run });
    return run;
  }

  const inferenceTimeMs = performance.now() - inferStart;
  const quality = scoreQuality(summary, dataset.text);

  const run: BenchmarkRun = {
    id: runId,
    modelId: config.id,
    datasetId: dataset.id,
    timestamp: Date.now(),
    summary,
    metrics: {
      loadTimeMs,
      inferenceTimeMs,
      downloadBytes,
      memoryMB: collectMemoryMB(),
      webGpuUsed,
    },
    quality,
  };

  onProgress({ type: 'run-done', modelId: config.id, datasetId: dataset.id, run });
  return run;
}

export function isModelLoaded(modelId: string): boolean {
  return pipelineCache.has(modelId);
}
