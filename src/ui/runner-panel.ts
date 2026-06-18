import type { AppState, BenchmarkRun, ModelBenchmarkResult } from '../types';
import { MODEL_REGISTRY } from '../models/registry';
import { DATASETS } from '../data/benchmark-dataset';
import { runDataset } from '../benchmark/runner';
import { avgQuality } from '../benchmark/quality';
import { fmtMs } from '../benchmark/metrics';
import { loadCustomModels } from '../data/custom-models';

export function initRunnerPanel(container: HTMLElement, state: AppState): void {
  let isRunning = false;
  let selectedDatasets = new Set(['ds-short', 'ds-medium']);
  let selectedModels = new Set<string>();
  let customTextValue = '';

  function render() {
    const allModels = [...MODEL_REGISTRY, ...loadCustomModels()];
    const loadedModels = allModels.filter((m) => state.loadedModels.has(m.id));

    container.innerHTML = `
      <div class="panel-header">
        <h2>Run Benchmark</h2>
        <p class="panel-sub">Select datasets and models to benchmark. Use the Models tab to download models first.</p>
      </div>

      <div class="runner-grid">
        <!-- Dataset selection -->
        <div class="runner-card">
          <h3 class="runner-section-title" style="display: flex; justify-content: space-between; align-items: center;">
            📄 Select Datasets
            <button id="selectAllDs" class="btn-toggle-suggestions">Select All</button>
          </h3>
          <div class="check-group">
            ${DATASETS.map((ds) => `
              <label class="check-item ${selectedDatasets.has(ds.id) ? 'checked' : ''}">
                <input type="checkbox" data-type="dataset" value="${ds.id}" ${selectedDatasets.has(ds.id) ? 'checked' : ''} />
                <span class="check-label">
                  <span class="check-name">${ds.name}</span>
                  <span class="check-meta">${ds.category} · ${ds.wordCount} words</span>
                </span>
              </label>`).join('')}
          <h3 class="runner-section-title" style="margin-top: 1.5rem;">✏️ Custom Text</h3>
          <textarea id="customTextInput" class="form-input" rows="3" placeholder="Paste custom text to benchmark...">${customTextValue}</textarea>
        </div>

        <!-- Model selection -->
        <div class="runner-card">
          <h3 class="runner-section-title" style="display: flex; justify-content: space-between; align-items: center;">
            🤖 Select Models
            ${loadedModels.length > 0 ? `<button id="selectAllModels" class="btn-toggle-suggestions">Select All</button>` : ''}
          </h3>
          ${loadedModels.length === 0
            ? `<p class="no-models-msg">No models downloaded yet. Go to the <strong>Models</strong> tab first.</p>`
            : `<div class="check-group">
              ${loadedModels.map((m) => `
                <label class="check-item ${selectedModels.has(m.id) ? 'checked' : ''}">
                  <input type="checkbox" data-type="model" value="${m.id}" ${selectedModels.has(m.id) ? 'checked' : ''} />
                  <span class="check-label">
                    <span class="check-name">${m.name}</span>
                    <span class="check-meta">Tier ${m.tier} · ${m.params}</span>
                  </span>
                </label>`).join('')}
            </div>`}
        </div>
      </div>

      <div class="runner-actions">
        <button id="runBtn" class="btn-run" ${isRunning || selectedModels.size === 0 || (selectedDatasets.size === 0 && !customTextValue.trim()) ? 'disabled' : ''}>
          ${isRunning ? '<span class="spinner-sm"></span> Running…' : '▶ Run Benchmark'}
        </button>
        <span class="run-hint" id="runHint">
          ${selectedModels.size} model(s) × ${selectedDatasets.size + (customTextValue.trim() ? 1 : 0)} dataset(s) = ${selectedModels.size * (selectedDatasets.size + (customTextValue.trim() ? 1 : 0))} run(s)
        </span>
        ${state.results.length > 0 && !isRunning ? `
          <button id="dlCsvBtn" class="btn-export" style="margin-left: auto;">⬇ Download CSV</button>
        ` : ''}
      </div>

      <!-- Live results -->
      <div class="live-results" id="liveResults">
        ${buildLiveTable()}
      </div>`;

    // Checkbox listeners
    container.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const type = cb.dataset.type!;
        const val  = cb.value;
        if (type === 'dataset') selectedDatasets.has(val) ? selectedDatasets.delete(val) : selectedDatasets.add(val);
        if (type === 'model')   selectedModels.has(val)   ? selectedModels.delete(val)   : selectedModels.add(val);
        render();
      });
    });

    // Custom text listener
    container.querySelector('#customTextInput')?.addEventListener('input', (e) => {
      customTextValue = (e.target as HTMLTextAreaElement).value;
      const btn = container.querySelector('#runBtn') as HTMLButtonElement | null;
      const hint = container.querySelector('#runHint');
      const hasText = !!customTextValue.trim();
      const dsCount = selectedDatasets.size + (hasText ? 1 : 0);
      const mCount = selectedModels.size;
      if (btn) btn.disabled = isRunning || mCount === 0 || dsCount === 0;
      if (hint) hint.textContent = `${mCount} model(s) × ${dsCount} dataset(s) = ${mCount * dsCount} run(s)`;
    });

    // Select All buttons
    container.querySelector('#selectAllDs')?.addEventListener('click', () => {
      const allSelected = selectedDatasets.size === DATASETS.length;
      if (allSelected) {
        selectedDatasets.clear();
      } else {
        DATASETS.forEach(ds => selectedDatasets.add(ds.id));
      }
      render();
    });

    container.querySelector('#selectAllModels')?.addEventListener('click', () => {
      const allSelected = selectedModels.size === loadedModels.length;
      if (allSelected) {
        selectedModels.clear();
      } else {
        loadedModels.forEach(m => selectedModels.add(m.id));
      }
      render();
    });

    // Run button
    container.querySelector('#runBtn')?.addEventListener('click', runBenchmark);

    // CSV button
    container.querySelector('#dlCsvBtn')?.addEventListener('click', downloadCSV);
  }

  function downloadCSV() {
    if (state.results.length === 0) return;
    const allModels = [...MODEL_REGISTRY, ...loadCustomModels()];
    
    const headers = ['Model', 'Dataset', 'Inference Time (ms)', 'Overall Quality', 'Coverage', 'Coherence', 'Status'];
    const rows = state.results.map(r => {
      const model = allModels.find(m => m.id === r.modelId);
      const ds = DATASETS.find(d => d.id === r.datasetId);
      return [
        model?.name ?? r.modelId,
        ds?.name ?? r.datasetId,
        r.metrics.inferenceTimeMs.toFixed(0),
        r.quality.overall.toFixed(0),
        r.quality.coverage.toFixed(0),
        r.quality.coherence.toFixed(0),
        r.error ? 'ERROR' : 'OK'
      ];
    });

    const csv = [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_results_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildLiveTable(): string {
    const runs = state.results;
    if (runs.length === 0) return `<p class="empty-hint">Results will appear here as runs complete.</p>`;

    return `
      <h3 class="live-title">Live Results</h3>
      <div class="live-scroll">
        <table class="results-table">
          <thead><tr>
            <th>Model</th><th>Dataset</th><th>Inf. Time</th>
            <th>Quality</th><th>Coverage</th><th>Coherence</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${runs.map((r) => {
              const allModels = [...MODEL_REGISTRY, ...loadCustomModels()];
              const model = allModels.find((m) => m.id === r.modelId);
              const ds    = DATASETS.find((d) => d.id === r.datasetId);
              const q     = r.quality;
              return `
                <tr class="${r.error ? 'row-error' : 'row-ok'}">
                  <td>${model?.name ?? r.modelId}</td>
                  <td>${ds?.name ?? r.datasetId}</td>
                  <td>${fmtMs(r.metrics.inferenceTimeMs)}</td>
                  <td><span class="score-chip score-${scoreClass(q.overall)}">${q.overall}</span></td>
                  <td>${q.coverage}</td>
                  <td>${q.coherence}</td>
                  <td>${r.error ? `<span class="err-badge">ERROR</span>` : '<span class="ok-badge">OK</span>'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function scoreClass(n: number) {
    if (n >= 75) return 'high';
    if (n >= 50) return 'mid';
    return 'low';
  }

  async function runBenchmark() {
    if (isRunning) return;
    isRunning = true;
    render();

    const modelIds  = [...selectedModels];
    const datasetIds = [...selectedDatasets];

    const allModels = [...MODEL_REGISTRY, ...loadCustomModels()];
    
    let datasetsToRun = datasetIds.map(id => DATASETS.find(d => d.id === id)!);
    if (customTextValue.trim()) {
      datasetsToRun.push({
        id: 'ds-custom',
        name: 'Custom Input',
        category: 'custom',
        wordCount: customTextValue.trim().split(/\s+/).length,
        text: customTextValue.trim()
      });
    }

    for (const modelId of modelIds) {
      const cfg = allModels.find((m) => m.id === modelId)!;
      const ds  = state.downloadStates.get(modelId);
      const loadTimeMs = ds?.loadTimeMs ?? 0;
      const downloadBytes = Object.values(ds?.files ?? {}).reduce((s, f) => s + f.total, 0);
      const webGpuUsed = !!ds && state.hasWebGPU && cfg.tier === 2;

      const runs: BenchmarkRun[] = [];

      for (const dataset of datasetsToRun) {
        try {
          const run = await runDataset(cfg, dataset, loadTimeMs, downloadBytes, webGpuUsed, () => {});
          state.results.push(run);
          runs.push(run);
        } catch (err) {
          console.error(`Run failed for ${modelId} / ${dataset.id}:`, err);
        }
        // Update live table
        const live = container.querySelector('#liveResults');
        if (live) live.innerHTML = buildLiveTable();
      }

      // Build aggregate result
      if (runs.length > 0) {
        const result: ModelBenchmarkResult = {
          modelId,
          timestamp: Date.now(),
          runs,
          avgInferenceMs: runs.reduce((s, r) => s + r.metrics.inferenceTimeMs, 0) / runs.length,
          avgLoadMs: loadTimeMs,
          avgQuality: avgQuality(runs.map((r) => r.quality)),
          overallScore: Math.round(runs.reduce((s, r) => s + r.quality.overall, 0) / runs.length),
          webGpuUsed,
        };
        // Update or preserve existing if needed, but here we just set it
        state.modelResults.set(modelId, result);
        document.dispatchEvent(new CustomEvent('benchmark-complete', { detail: result }));
      }
    }

    isRunning = false;
    render();
  }

  // Re-render when a new model becomes ready
  document.addEventListener('model-ready', () => render());
  render();
}
