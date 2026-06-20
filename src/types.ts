// ─── Shared TypeScript Interfaces ───────────────────────────────────────────

export type Tier = 1 | 2;
export type PipelineType = 'summarization' | 'text-generation';
export type Dtype = 'fp32' | 'q4' | 'q4f16';
export type RiskLevel = 'low' | 'medium' | 'high';
export type DatasetCategory = 'short' | 'medium' | 'long' | 'very-long' | 'technical' | 'custom';
export type ModelStatus = 'idle' | 'downloading' | 'ready' | 'error';
export type EngineType = 'transformers' | 'webllm' | 'llamaweb';

export interface ModelConfig {
  id: string;
  name: string;
  tier: Tier;
  params: string;
  contextWindow: string;
  contextTokens: number;
  downloadSizeMB: string;
  pipelineType: PipelineType;
  dtype: Dtype;
  risk: RiskLevel;
  description: string;
  /** Tier 2 only: formats a raw text into a model-specific prompt string */
  promptTemplate?: (text: string) => string;
  maxNewTokens: number;
  supportedEngines?: EngineType[];
  webllmConfig?: {
    modelUrl?: string;
  };
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  category: DatasetCategory;
  wordCount: number;
  text: string;
}

export interface RunMetrics {
  loadTimeMs: number;
  inferenceTimeMs: number;
  downloadBytes: number;
  memoryMB: number | null;
  webGpuUsed: boolean;
  gpuTimeMs?: number;
  dispatchOverheadMs?: number;
}

export interface QualityScore {
  coverage: number;
  compression: number;
  coherence: number;
  completeness: number;
  clarity: number;
  overall: number;
}

export interface BenchmarkRun {
  id: string;
  modelId: string;
  datasetId: string;
  engine: EngineType;
  timestamp: number;
  summary: string;
  metrics: RunMetrics;
  quality: QualityScore;
  error?: string;
}

export interface ModelBenchmarkResult {
  modelId: string;
  timestamp: number;
  runs: BenchmarkRun[];
  avgInferenceMs: number;
  avgLoadMs: number;
  avgQuality: QualityScore;
  overallScore: number;
  webGpuUsed: boolean;
}

export interface FileProgress {
  pct: number;
  loaded: number;
  total: number;
  done: boolean;
}

export interface ModelDownloadState {
  status: ModelStatus;
  files: Record<string, FileProgress>;
  loadTimeMs?: number;
  errorMsg?: string;
}

export interface AppState {
  downloadStates: Map<string, ModelDownloadState>;
  loadedModels: Set<string>;
  results: BenchmarkRun[];
  modelResults: Map<string, ModelBenchmarkResult>;
  hasWebGPU: boolean;
}
