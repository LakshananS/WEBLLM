import type { RunMetrics } from '../types';

/** Collect current JS heap memory usage (Chrome only). */
export function collectMemoryMB(): number | null {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  };
  if (perf.memory) {
    return Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
  }
  return null;
}

/** Estimate tokens-per-second given output text and inference time. */
export function estimateTokensPerSec(output: string, inferenceMs: number): number | null {
  if (!output || inferenceMs <= 0) return null;
  // Rough approximation: 1 token ≈ 4 characters
  const estimatedTokens = Math.round(output.length / 4);
  return Math.round((estimatedTokens / inferenceMs) * 1000);
}

/** Create a zero-value RunMetrics object. */
export function emptyMetrics(): RunMetrics {
  return {
    loadTimeMs: 0,
    inferenceTimeMs: 0,
    downloadBytes: 0,
    memoryMB: null,
    webGpuUsed: false,
  };
}

/** Detect if WebGPU is available in this browser. */
export async function detectWebGPU(): Promise<boolean> {
  if (!('gpu' in navigator)) return false;
  try {
    const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/** Format milliseconds as human-readable string. */
export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Format megabytes as human-readable string. */
export function fmtMB(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}
