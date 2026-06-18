import type { AppState, ModelConfig, ModelDownloadState } from '../types';
import { MODEL_REGISTRY } from '../models/registry';
import { loadCustomModels } from '../data/custom-models';
import { loadModel, isModelLoaded } from '../benchmark/runner';
import { fmtMB } from '../benchmark/metrics';

const RISK_COLOR: Record<string, string> = {
  low: 'badge-green',
  medium: 'badge-yellow',
  high: 'badge-red',
};

const TIER_LABEL: Record<number, string> = {
  1: '🔵 Tier 1',
  2: '🟠 Tier 2',
};

function renderCard(cfg: ModelConfig, state: ModelDownloadState, hasWebGPU: boolean): string {
  const ready   = state.status === 'ready';
  const loading = state.status === 'downloading';
  const error   = state.status === 'error';

  const files   = Object.values(state.files);
  const sumPct  = files.length ? files.reduce((s, f) => s + (f.done ? 100 : f.pct), 0) / files.length : 0;
  const doneCnt = files.filter((f) => f.done).length;
  const totalBytes = files.reduce((s, f) => s + f.total, 0);

  const gpuWarning = cfg.tier === 2 && !hasWebGPU
    ? `<p class="card-warning">⚠ WebGPU not detected — inference will be slow on WASM</p>` : '';

  const progressBar = loading ? `
    <div class="dl-mini-track">
      <div class="dl-mini-fill" style="width:${Math.round(sumPct)}%"></div>
    </div>
    <p class="dl-mini-label">${doneCnt}/${files.length} files · ${Math.round(sumPct)}% · ${fmtMB(totalBytes)}</p>` : '';

  const btnLabel = ready ? 'Ready ✓' : loading ? 'Downloading…' : error ? 'Retry' : 'Download & Load';
  const btnClass = ready ? 'btn-ready' : loading ? 'btn-loading' : 'btn-download';

  return `
    <div class="model-card tier-${cfg.tier}" data-model-id="${cfg.id}">
      <div class="card-top">
        <span class="tier-badge">${TIER_LABEL[cfg.tier]}</span>
        <span class="risk-badge ${RISK_COLOR[cfg.risk]}">${cfg.risk} risk</span>
      </div>
      <h3 class="card-name">${cfg.name}</h3>
      <p class="card-desc">${cfg.description}</p>
      <div class="card-meta">
        <span>⚙ ${cfg.params}</span>
        <span>📏 ${cfg.contextWindow}</span>
        <span>💾 ${cfg.downloadSizeMB}</span>
        <span>🗜 ${cfg.dtype}</span>
      </div>
      ${gpuWarning}
      ${progressBar}
      ${error ? `<p class="card-error">Error: ${state.errorMsg}</p>` : ''}
      <button class="btn-card ${btnClass}" data-model-id="${cfg.id}" ${ready || loading ? 'disabled' : ''}>
        ${btnLabel}
      </button>
    </div>`;
}

export function initModelPanel(container: HTMLElement, state: AppState): void {
  function render() {
    const allModels = [...MODEL_REGISTRY, ...loadCustomModels()];
    container.innerHTML = `
      <div class="panel-header">
        <h2>Available Models</h2>
        <p class="panel-sub">Download models to enable benchmarking. Add custom models via the <strong>Settings</strong> tab.</p>
        ${!state.hasWebGPU ? `<div class="global-warning">⚠ WebGPU not available in this browser. Tier 2 inference will be very slow.</div>` : ''}
      </div>
      <div class="models-grid">
        ${allModels.map((cfg) => {
          const ds = state.downloadStates.get(cfg.id) ?? {
            status: isModelLoaded(cfg.id) ? 'ready' : 'idle',
            files: {},
          } as ModelDownloadState;
          return renderCard(cfg, ds, state.hasWebGPU);
        }).join('')}
      </div>`;

    // Attach download button listeners
    container.querySelectorAll<HTMLButtonElement>('.btn-download, .btn-ready').forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        const modelId = btn.dataset.modelId!;
        const cfg = allModels.find((m) => m.id === modelId);
        if (!cfg || isModelLoaded(modelId)) return;
        startDownload(cfg);
      });
    });
  }

  async function startDownload(cfg: ModelConfig) {
    const device = state.hasWebGPU && cfg.tier === 2 ? 'webgpu' : 'wasm';

    state.downloadStates.set(cfg.id, { status: 'downloading', files: {} });
    render();

    try {
      await loadModel(cfg, device, (evt) => {
        const ds = state.downloadStates.get(cfg.id)!;
        if (evt.type === 'download' && evt.file && evt.fileProgress) {
          ds.files[evt.file] = evt.fileProgress;
          render();
        } else if (evt.type === 'load-done') {
          ds.status = 'ready';
          if (evt.run) ds.loadTimeMs = evt.run.metrics.loadTimeMs;
          state.loadedModels.add(cfg.id);
          render();
          document.dispatchEvent(new CustomEvent('model-ready', { detail: { modelId: cfg.id } }));
        } else if (evt.type === 'error') {
          ds.status = 'error';
          ds.errorMsg = evt.error ?? 'Unknown error';
          render();
        }
      });
    } catch {
      // Error already handled inside loadModel
    }
  }

  render();
}
