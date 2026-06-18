import type { ModelConfig, Tier, PipelineType, Dtype, RiskLevel } from '../types';

const STORAGE_KEY = 'benchllm_custom_models';

export function loadCustomModels(): ModelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ModelConfig[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomModels(models: ModelConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function addCustomModel(model: ModelConfig): void {
  const existing = loadCustomModels().filter((m) => m.id !== model.id);
  saveCustomModels([...existing, model]);
}

export function removeCustomModel(id: string): void {
  saveCustomModels(loadCustomModels().filter((m) => m.id !== id));
}

// ── Prompt templates for common chat formats ────────────────────────────────
export type ChatFormat = 'llama3' | 'chatml' | 'gemma' | 'none';

export const CHAT_FORMATS: Record<ChatFormat, { label: string; fn: (text: string) => string }> = {
  llama3: {
    label: 'Llama 3 / Meta',
    fn: (text) =>
      `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nSummarize text concisely in 3-5 sentences.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nSummarize the following text:\n\n${text}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`,
  },
  chatml: {
    label: 'ChatML (Qwen / SmolLM / Phi)',
    fn: (text) =>
      `<|im_start|>system\nYou are a helpful assistant. Summarize text concisely.<|im_end|>\n<|im_start|>user\nSummarize the following text in 3-5 sentences:\n\n${text}<|im_end|>\n<|im_start|>assistant\n`,
  },
  gemma: {
    label: 'Gemma',
    fn: (text) =>
      `<start_of_turn>user\nSummarize the following text in 3-5 sentences:\n\n${text}<end_of_turn>\n<start_of_turn>model\n`,
  },
  none: {
    label: 'None (seq2seq / no template)',
    fn: (text) => text,
  },
};

// ── Context window validation ────────────────────────────────────────────────
export type ContextLevel = 'ok' | 'warn' | 'danger' | 'block';

export interface ContextValidation {
  level: ContextLevel;
  title: string;
  message: string;
}

export function validateContextWindow(tokens: number): ContextValidation {
  if (tokens <= 32_000) {
    return { level: 'ok', title: '', message: '' };
  }
  if (tokens <= 128_000) {
    return {
      level: 'warn',
      title: '⚠ Large Context Window Detected',
      message: `This model declares a ${(tokens / 1000).toFixed(0)}K token context window.\n\nIn a browser, the ONNX Runtime allocates memory proportionally to the context size. A 32K–128K context may consume 2–4 GB of RAM during inference and may significantly slow down or freeze the page.\n\nProceed only if your device has ≥ 8 GB RAM and you have WebGPU available.`,
    };
  }
  if (tokens <= 256_000) {
    return {
      level: 'danger',
      title: '🔴 Very Large Context Window — High Risk',
      message: `This model declares a ${(tokens / 1000).toFixed(0)}K token context window.\n\nA context window of 128K–256K tokens will likely crash your browser tab due to out-of-memory errors, even on high-end hardware. The model weights alone may exceed available VRAM/RAM.\n\nIt is strongly recommended NOT to load this model in-browser. If you proceed, ensure you have > 16 GB RAM and WebGPU enabled.`,
    };
  }
  return {
    level: 'block',
    title: '🚫 Context Window Too Large for Browser',
    message: `This model declares a ${(tokens / 1000).toFixed(0)}K token context window — this exceeds the safe limit for browser-based ONNX inference.\n\nModels with context windows above 256K tokens cannot be loaded safely in a browser environment. The memory requirements (often 10–40 GB) far exceed what browser sandboxes allow.\n\nPlease choose a model with a ≤ 128K context window, or use a server-side deployment instead.`,
  };
}

export function buildCustomModel(form: {
  id: string;
  name: string;
  params: string;
  contextTokens: number;
  pipelineType: PipelineType;
  dtype: Dtype;
  tier: Tier;
  chatFormat: ChatFormat;
  risk: RiskLevel;
}): ModelConfig {
  const fmt = CHAT_FORMATS[form.chatFormat];
  return {
    id: form.id.trim(),
    name: form.name.trim() || form.id.split('/').pop() || 'Custom Model',
    tier: form.tier,
    params: form.params.trim() || '?',
    contextWindow: form.contextTokens >= 1000
      ? `${(form.contextTokens / 1000).toFixed(0)}K tokens`
      : `${form.contextTokens} tokens`,
    contextTokens: form.contextTokens,
    downloadSizeMB: 'Unknown',
    pipelineType: form.pipelineType,
    dtype: form.dtype,
    risk: form.risk,
    description: `Custom model added by user. ID: ${form.id}`,
    promptTemplate: form.pipelineType === 'text-generation' ? fmt.fn : undefined,
    maxNewTokens: 200,
  };
}
