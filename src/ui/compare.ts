import type { AppState, BenchmarkRun, EngineType } from '../types';
import { MODEL_REGISTRY } from '../models/registry';
import { DATASETS } from '../data/benchmark-dataset';
import { fmtMs } from '../benchmark/metrics';

export function initComparePanel(container: HTMLElement, state: AppState): void {
  let modelA = '';
  let engineA: EngineType = 'transformers';
  let modelB = '';
  let engineB: EngineType = 'transformers';
  let datasetId = 'ds-medium';

  function render() {
    const benchmarkedModels = [...state.modelResults.keys()];

    container.innerHTML = `
      <div class="panel-header">
        <h2>Compare Models</h2>
        <p class="panel-sub">Select two benchmarked models and a dataset to compare their summaries side-by-side.</p>
      </div>

      ${benchmarkedModels.length < 2
        ? `<div class="empty-state"><div class="empty-icon">⚖</div>
           <p>Benchmark at least <strong>2 models</strong> to enable comparison.</p></div>`
        : `<div class="compare-controls">
            <div class="ctrl-group">
              <label>Model A</label>
              <select id="selA">${modelOptions(benchmarkedModels, modelA)}</select>
              <select id="selEngineA">${engineOptions(engineA)}</select>
            </div>
            <div class="vs-badge">VS</div>
            <div class="ctrl-group">
              <label>Model B</label>
              <select id="selB">${modelOptions(benchmarkedModels, modelB)}</select>
              <select id="selEngineB">${engineOptions(engineB)}</select>
            </div>
            <div class="ctrl-group">
              <label>Dataset</label>
              <select id="selDs">
                ${DATASETS.map((d) => `<option value="${d.id}" ${d.id === datasetId ? 'selected' : ''}>${d.name}</option>`).join('')}
              </select>
            </div>
          </div>
          ${buildComparison()}`}`;

    container.querySelector<HTMLSelectElement>('#selA')?.addEventListener('change', (e) => {
      modelA = (e.target as HTMLSelectElement).value; render();
    });
    container.querySelector<HTMLSelectElement>('#selEngineA')?.addEventListener('change', (e) => {
      engineA = (e.target as HTMLSelectElement).value as EngineType; render();
    });
    container.querySelector<HTMLSelectElement>('#selB')?.addEventListener('change', (e) => {
      modelB = (e.target as HTMLSelectElement).value; render();
    });
    container.querySelector<HTMLSelectElement>('#selEngineB')?.addEventListener('change', (e) => {
      engineB = (e.target as HTMLSelectElement).value as EngineType; render();
    });
    container.querySelector<HTMLSelectElement>('#selDs')?.addEventListener('change', (e) => {
      datasetId = (e.target as HTMLSelectElement).value; render();
    });

    // Set defaults
    if (!modelA && benchmarkedModels.length >= 1) { modelA = benchmarkedModels[0]; render(); }
    if (!modelB && benchmarkedModels.length >= 2) { modelB = benchmarkedModels[1]; render(); }
  }

  function modelOptions(ids: string[], selected: string): string {
    return ids.map((id) => {
      const cfg = MODEL_REGISTRY.find((m) => m.id === id);
      return `<option value="${id}" ${id === selected ? 'selected' : ''}>${cfg?.name ?? id}</option>`;
    }).join('');
  }

  function engineOptions(selected: EngineType): string {
    const engines = [
      { id: 'transformers', label: 'Transformers.js' },
      { id: 'webllm', label: 'WebLLM' },
      { id: 'llamaweb', label: 'LlamaWeb' }
    ];
    return engines.map((e) => `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${e.label}</option>`).join('');
  }

  function findRun(modelId: string, dsId: string, engine: EngineType): BenchmarkRun | undefined {
    return state.results.find((r) => r.modelId === modelId && r.datasetId === dsId && r.engine === engine);
  }

  function buildComparison(): string {
    if (!modelA || !modelB) return '';
    const runA = findRun(modelA, datasetId, engineA);
    const runB = findRun(modelB, datasetId, engineB);
    const cfgA = MODEL_REGISTRY.find((m) => m.id === modelA)!;
    const cfgB = MODEL_REGISTRY.find((m) => m.id === modelB)!;
    const dataset = DATASETS.find((d) => d.id === datasetId);

    if (!runA && !runB) {
      return `<p class="compare-hint">Neither model has been benchmarked on this dataset. Run the benchmark first.</p>`;
    }

    const metricsTable = (run: BenchmarkRun | undefined) => {
      if (!run) return `<p class="no-run">Not benchmarked on this dataset.</p>`;
      const q = run.quality;
      return `
        <div class="metric-grid">
          <div class="metric-item"><span class="met-val">${fmtMs(run.metrics.inferenceTimeMs)}</span><span class="met-label">Inference Time</span></div>
          <div class="metric-item"><span class="met-val score-${scoreClass(q.overall)}">${q.overall}</span><span class="met-label">Overall Score</span></div>
          <div class="metric-item"><span class="met-val">${q.coverage}</span><span class="met-label">Coverage</span></div>
          <div class="metric-item"><span class="met-val">${q.compression}</span><span class="met-label">Compression</span></div>
          <div class="metric-item"><span class="met-val">${q.coherence}</span><span class="met-label">Coherence</span></div>
          <div class="metric-item"><span class="met-val">${q.completeness}</span><span class="met-label">Completeness</span></div>
        </div>
        <div class="summary-box">
          <h4>Generated Summary</h4>
          <p class="summary-text">${run.error ? `<span class="err-txt">Error: ${run.error}</span>` : (run.summary || '(empty)')}</p>
        </div>`;
    };

    // Highlight words unique to each summary
    const textA = runA?.summary ?? '';
    const textB = runB?.summary ?? '';
    const wordsA = new Set(textA.toLowerCase().match(/\b\w{4,}\b/g) ?? []);
    const wordsB = new Set(textB.toLowerCase().match(/\b\w{4,}\b/g) ?? []);

    function highlight(text: string, unique: Set<string>, cls: string): string {
      return text.replace(/\b(\w{4,})\b/g, (w) =>
        unique.has(w.toLowerCase()) ? `<mark class="${cls}">${w}</mark>` : w
      );
    }

    const uniqueA = new Set([...wordsA].filter((w) => !wordsB.has(w)));
    const uniqueB = new Set([...wordsB].filter((w) => !wordsA.has(w)));

    return `
      ${dataset ? `<div class="compare-src"><strong>Source dataset:</strong> ${dataset.name} (${dataset.wordCount} words, ${dataset.category})</div>` : ''}

      <div class="compare-cols">
        <div class="compare-col col-a">
          <div class="col-header">
            <span class="tier-chip tier-${cfgA.tier}">T${cfgA.tier}</span>
            <h3>${cfgA.name}</h3>
            <span class="col-badge">${cfgA.params}</span>
            <span class="col-badge badge-engine">${engineA}</span>
          </div>
          ${metricsTable(runA)}
          ${runA?.summary ? `
            <div class="diff-box">
              <h4>Highlighted unique words <span class="legend legend-a">■ unique to A</span></h4>
              <p class="diff-text">${highlight(textA, uniqueA, 'hl-a')}</p>
            </div>` : ''}
        </div>

        <div class="compare-col col-b">
          <div class="col-header">
            <span class="tier-chip tier-${cfgB.tier}">T${cfgB.tier}</span>
            <h3>${cfgB.name}</h3>
            <span class="col-badge">${cfgB.params}</span>
            <span class="col-badge badge-engine">${engineB}</span>
          </div>
          ${metricsTable(runB)}
          ${runB?.summary ? `
            <div class="diff-box">
              <h4>Highlighted unique words <span class="legend legend-b">■ unique to B</span></h4>
              <p class="diff-text">${highlight(textB, uniqueB, 'hl-b')}</p>
            </div>` : ''}
        </div>
      </div>`;
  }

  function scoreClass(n: number) {
    if (n >= 75) return 'high';
    if (n >= 50) return 'mid';
    return 'low';
  }

  document.addEventListener('benchmark-complete', () => render());
  render();
}
