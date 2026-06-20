import type { ModelConfig } from '../types';

const llama32Prompt = (text: string) =>
  `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant. Summarize text concisely in 3-5 sentences.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nSummarize the following text in 3-5 clear sentences:\n\n${text}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;

const qwenPrompt = (text: string) =>
  `<|im_start|>system\nYou are a helpful assistant. Summarize text concisely in 3-5 sentences.<|im_end|>\n<|im_start|>user\nSummarize the following text in 3-5 clear sentences:\n\n${text}<|im_end|>\n<|im_start|>assistant\n`;

const gemmaPrompt = (text: string) =>
  `<start_of_turn>user\nSummarize the following text in 3-5 clear sentences:\n\n${text}<end_of_turn>\n<start_of_turn>model\n`;

const smolPrompt = (text: string) =>
  `<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\nSummarize the following text in 3-5 sentences:\n\n${text}<|im_end|>\n<|im_start|>assistant\n`;

export const MODEL_REGISTRY: ModelConfig[] = [
  // ── Tier 1: Dedicated summarization (seq2seq, fp32) ──────────────────────
  {
    id: 'Xenova/t5-small',
    name: 'T5-Small',
    tier: 1,
    params: '60M',
    contextWindow: '512 tokens',
    contextTokens: 512,
    downloadSizeMB: '~240 MB',
    pipelineType: 'summarization',
    dtype: 'fp32',
    risk: 'low',
    description: "Google's original T5 small variant. Fast and stable baseline for browser summarization.",
    maxNewTokens: 150,
    supportedEngines: ['transformers'],
  },
  {
    id: 'Xenova/flan-t5-small',
    name: 'Flan-T5-Small',
    tier: 1,
    params: '80M',
    contextWindow: '512 tokens',
    contextTokens: 512,
    downloadSizeMB: '~260 MB',
    pipelineType: 'summarization',
    dtype: 'fp32',
    risk: 'low',
    description: 'Instruction-tuned T5-Small. Better at following directives. Slightly larger than T5-Small.',
    maxNewTokens: 150,
    supportedEngines: ['transformers'],
  },
  {
    id: 'Xenova/flan-t5-base',
    name: 'Flan-T5-Base',
    tier: 1,
    params: '250M',
    contextWindow: '512 tokens',
    contextTokens: 512,
    downloadSizeMB: '~960 MB',
    pipelineType: 'summarization',
    dtype: 'fp32',
    risk: 'low',
    description: 'Larger instruction-tuned T5 variant. Higher quality at the cost of download size and speed.',
    maxNewTokens: 150,
    supportedEngines: ['transformers'],
  },
  {
    id: 'Xenova/distilbart-cnn-6-6',
    name: 'DistilBART-CNN',
    tier: 1,
    params: '230M',
    contextWindow: '1024 tokens',
    contextTokens: 1024,
    downloadSizeMB: '~890 MB',
    pipelineType: 'summarization',
    dtype: 'fp32',
    risk: 'medium',
    description: 'Distilled BART fine-tuned on CNN/DailyMail. Strongest Tier 1 model — longest context support.',
    maxNewTokens: 200,
    supportedEngines: ['transformers'],
  },

  // ── Tier 2: Instruction-tuned LLMs (causal, text-generation, q4) ─────────
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 1B',
    tier: 2,
    params: '1B',
    contextWindow: '128K tokens',
    contextTokens: 128000,
    downloadSizeMB: '~700 MB',
    pipelineType: 'text-generation',
    dtype: 'q4f16',
    risk: 'medium',
    description: "Meta's Llama 3.2 1B instruction model. Strong general-purpose reasoning with 128K context.",
    promptTemplate: llama32Prompt,
    maxNewTokens: 200,
    supportedEngines: ['transformers', 'webllm', 'llamaweb'],
    webllmConfig: {
      modelUrl: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    },
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen 2.5 1.5B',
    tier: 2,
    params: '1.5B',
    contextWindow: '32K tokens',
    contextTokens: 32000,
    downloadSizeMB: '~900 MB',
    pipelineType: 'text-generation',
    dtype: 'q4f16',
    risk: 'medium',
    description: "Alibaba's Qwen 2.5 1.5B. Excellent multilingual performance with strong instruction following.",
    promptTemplate: qwenPrompt,
    maxNewTokens: 200,
    supportedEngines: ['transformers', 'webllm', 'llamaweb'],
    webllmConfig: {
      modelUrl: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    },
  },
  {
    id: 'onnx-community/gemma-3-1b-it-ONNX',
    name: 'Gemma 3 1B',
    tier: 2,
    params: '1B',
    contextWindow: '128K tokens',
    contextTokens: 128000,
    downloadSizeMB: '~850 MB',
    pipelineType: 'text-generation',
    dtype: 'q4',
    risk: 'high',
    description: "Google's Gemma 3 1B instruction model. High quality but newest architecture -- may have compatibility risks.",
    promptTemplate: gemmaPrompt,
    maxNewTokens: 200,
    supportedEngines: ['transformers'],
  },
  {
    id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    name: 'SmolLM2 1.7B',
    tier: 2,
    params: '1.7B',
    contextWindow: '8K tokens',
    contextTokens: 8192,
    downloadSizeMB: '~1 GB',
    pipelineType: 'text-generation',
    dtype: 'q4',
    risk: 'low',
    description: "HuggingFace's SmolLM2 1.7B -- purpose-built for on-device/browser inference. Most browser-stable Tier 2 model.",
    promptTemplate: smolPrompt,
    maxNewTokens: 200,
    supportedEngines: ['transformers'],
  },
];

export function getModelById(id: string): ModelConfig | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}
