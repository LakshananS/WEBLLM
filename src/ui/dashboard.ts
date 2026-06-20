import type { AppState, ModelBenchmarkResult, QualityScore } from '../types';
import { MODEL_REGISTRY } from '../models/registry';
import { fmtMs } from '../benchmark/metrics';

type SortKey = 'name' | 'overallScore' | 'avgInferenceMs' | 'avgQuality';
let sortKey: SortKey = 'overallScore';
let sortDir = -1; // -1 = desc

// ── Radar chart (SVG pentagon) ───────────────────────────────────────────
function radarChart(q: QualityScore): string {
  const size   = 120;
  const cx     = size / 2;
  const cy     = size / 2;
  const r      = 46;
  const dims   = ['coverage', 'compression', 'coherence', 'completeness', 'clarity'] as const;
  const labels = ['Cov', 'Comp', 'Coh', 'Compl', 'Clar'];
  const n      = dims.length;

  function polarXY(i: number, scale: number): [number, number] {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * r * scale, cy + Math.sin(angle) * r * scale];
  }

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const gridPaths  = gridLevels.map((lvl) => {
    const pts = dims.map((_, i) => polarXY(i, lvl));
    return `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" class="radar-grid"/>`;
  });

  const dataPts = dims.map((d, i) => polarXY(i, q[d] / 100));
  const dataPath = `<polygon points="${dataPts.map((p) => p.join(',')).join(' ')}" class="radar-data"/>`;

  const labelEls = dims.map((_, i) => {
    const [x, y] = polarXY(i, 1.28);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="radar-label" text-anchor="middle" dominant-baseline="middle">${labels[i]}</text>`;
  });

  const axisLines = dims.map((_, i) => {
    const [x, y] = polarXY(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-axis"/>`;
  });

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="radar-svg">
      ${gridPaths.join('')}
      ${axisLines.join('')}
      ${dataPath}
      ${labelEls.join('')}
    </svg>`;
}

function scoreBar(val: number): string {
  const cls = val >= 75 ? 'bar-high' : val >= 50 ? 'bar-mid' : 'bar-low';
  return `<div class="score-bar-wrap"><div class="score-bar ${cls}" style="width:${val}%"></div><span>${val}</span></div>`;
}

export function initDashboard(container: HTMLElement, state: AppState): void {
  function render() {
    const results = [...state.modelResults.values()];
    results.sort((a, b) => {
      if (sortKey === 'name') {
        const na = MODEL_REGISTRY.find((m) => m.id === a.modelId)?.name ?? '';
        const nb = MODEL_REGISTRY.find((m) => m.id === b.modelId)?.name ?? '';
        return sortDir * na.localeCompare(nb);
      }
      if (sortKey === 'avgQuality') return sortDir * (a.avgQuality.overall - b.avgQuality.overall);
      if (sortKey === 'avgInferenceMs') return sortDir * (a.avgInferenceMs - b.avgInferenceMs);
      return sortDir * (a.overallScore - b.overallScore);
    });

    if (results.length === 0) {
      container.innerHTML = `
        <div class="panel-header">
          <h2>Benchmark Dashboard</h2>
          <p class="panel-sub">Run benchmarks from the <strong>Benchmark</strong> tab to see results here.</p>
        </div>
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No benchmark results yet.</p>
        </div>`;
      return;
    }

    const best = results[0];
    const bestModel = MODEL_REGISTRY.find((m) => m.id === best.modelId);
    const fastest = [...results].sort((a, b) => a.avgInferenceMs - b.avgInferenceMs)[0];
    const fastestModel = MODEL_REGISTRY.find((m) => m.id === fastest.modelId);

    container.innerHTML = `
      <div class="panel-header">
        <h2>Benchmark Dashboard</h2>
        <div class="export-btns">
          <button id="exportJson" class="btn-export">⬇ Export JSON</button>
          <button id="exportCsv"  class="btn-export">⬇ Export CSV</button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-val">${results.length}</span>
          <span class="stat-label">Models benchmarked</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${best.overallScore}</span>
          <span class="stat-label">Best quality score</span>
          <span class="stat-sub">${bestModel?.name}</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${fmtMs(fastest.avgInferenceMs)}</span>
          <span class="stat-label">Fastest inference</span>
          <span class="stat-sub">${fastestModel?.name}</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${state.hasWebGPU ? 'WebGPU' : 'WASM'}</span>
          <span class="stat-label">Backend</span>
        </div>
      </div>

      <!-- Pareto Frontier Chart -->
      <div class="pareto-wrap" style="margin-top: 2rem; background: var(--surface-1); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border);">
        <h3 style="margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem;">Quality vs. Speed (Pareto Frontier)</h3>
        ${buildParetoChart(results)}
      </div>

      <!-- Comparison table -->
      <div class="table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th class="th-rank">#</th>
              ${thBtn('name',           'Model')}
              <th>Tier</th>
              <th>Params</th>
              <th>Context</th>
              ${thBtn('avgInferenceMs', 'Avg Speed')}
              <th>Memory</th>
              ${thBtn('avgQuality',     'Quality')}
              <th>Coverage</th>
              <th>Coherence</th>
              <th>Radar</th>
            </tr>
          </thead>
          <tbody>
            ${results.map((res, i) => {
              const cfg = MODEL_REGISTRY.find((m) => m.id === res.modelId)!;
              const mem = res.runs[0]?.metrics.memoryMB;
              return `
                <tr>
                  <td class="rank-cell"><span class="rank-badge rank-${i + 1}">${i + 1}</span></td>
                  <td class="model-cell">${cfg.name}<span class="gpu-chip">${res.webGpuUsed ? ' GPU' : ''}</span></td>
                  <td><span class="tier-chip tier-${cfg.tier}">T${cfg.tier}</span></td>
                  <td>${cfg.params}</td>
                  <td class="ctx-cell">${cfg.contextWindow}</td>
                  <td>${fmtMs(res.avgInferenceMs)}</td>
                  <td>${mem != null ? `${mem} MB` : 'N/A'}</td>
                  <td>${scoreBar(res.avgQuality.overall)}</td>
                  <td>${res.avgQuality.coverage}</td>
                  <td>${res.avgQuality.coherence}</td>
                  <td>${radarChart(res.avgQuality)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // Sort listeners
    container.querySelectorAll<HTMLButtonElement>('.th-sort').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort as SortKey;
        if (sortKey === key) sortDir *= -1;
        else { sortKey = key; sortDir = -1; }
        render();
      });
    });

    // Export
    container.querySelector('#exportJson')?.addEventListener('click', () => exportJson(results));
    container.querySelector('#exportCsv')?.addEventListener('click',  () => exportCsv(results));
  }

  function buildParetoChart(results: ModelBenchmarkResult[]): string {
    if (results.length < 2) return `<p class="empty-hint">Need at least 2 models to display Pareto frontier.</p>`;

    const width = 800;
    const height = 300;
    const pad = 40;

    // Find min/max
    const maxTime = Math.max(...results.map(r => r.avgInferenceMs)) || 1;
    const minTime = Math.min(...results.map(r => r.avgInferenceMs)) || 0;
    const maxQual = Math.max(...results.map(r => r.avgQuality.overall)) || 100;
    const minQual = Math.min(...results.map(r => r.avgQuality.overall)) || 0;

    // X: Inference Time (lower is better, let's put lower on the left)
    // Y: Quality (higher is better, put higher on top)
    const scaleX = (val: number) => pad + ((val - minTime) / (maxTime - minTime || 1)) * (width - pad * 2);
    const scaleY = (val: number) => height - pad - ((val - minQual) / (maxQual - minQual || 1)) * (height - pad * 2);

    // Identify Pareto frontier (fastest time for a given quality, or highest quality for a given time)
    // Since lower time is better and higher quality is better:
    // A point is dominated if another point has strictly lower time AND strictly higher quality.
    // Wait, let's just sort by time ascending, then keep a running max of quality.
    const sorted = [...results].sort((a, b) => a.avgInferenceMs - b.avgInferenceMs);
    const paretoPts: ModelBenchmarkResult[] = [];
    let maxQ = -1;
    for (const r of sorted) {
      if (r.avgQuality.overall >= maxQ) {
        paretoPts.push(r);
        maxQ = r.avgQuality.overall;
      }
    }

    const paretoLine = paretoPts.map(r => `${scaleX(r.avgInferenceMs)},${scaleY(r.avgQuality.overall)}`).join(' ');

    const points = results.map(r => {
      const x = scaleX(r.avgInferenceMs);
      const y = scaleY(r.avgQuality.overall);
      const isPareto = paretoPts.includes(r);
      const m = MODEL_REGISTRY.find(m => m.id === r.modelId);
      return `
        <circle cx="${x}" cy="${y}" r="${isPareto ? 6 : 4}" fill="${isPareto ? 'var(--accent)' : 'var(--text-3)'}" />
        <text x="${x}" y="${y - 10}" font-size="10" fill="var(--text-2)" text-anchor="middle">${m?.name ?? r.modelId}</text>
      `;
    }).join('');

    return `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <!-- Axes -->
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="var(--border)" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="var(--border)" />
        <text x="${width / 2}" y="${height - 5}" font-size="12" fill="var(--text-2)" text-anchor="middle">Inference Time (ms) →</text>
        <text x="${10}" y="${height / 2}" font-size="12" fill="var(--text-2)" transform="rotate(-90 15,${height / 2})" text-anchor="middle">Quality Score →</text>
        
        <!-- Pareto Line -->
        <polyline points="${paretoLine}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4" opacity="0.5" />
        
        <!-- Points -->
        ${points}
      </svg>
    `;
  }

  function thBtn(key: SortKey, label: string): string {
    const active = sortKey === key;
    const arrow  = active ? (sortDir === -1 ? ' ↓' : ' ↑') : '';
    return `<th><button class="th-sort ${active ? 'th-active' : ''}" data-sort="${key}">${label}${arrow}</button></th>`;
  }

  function exportJson(results: ModelBenchmarkResult[]) {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), results: results.map(enrichResult) }, null, 2);
    download('benchmark-results.json', data, 'application/json');
  }

  function exportCsv(results: ModelBenchmarkResult[]) {
    const header = 'Model,Tier,Params,Context,AvgInferenceMs,AvgLoadMs,OverallScore,Coverage,Compression,Coherence,Completeness,Clarity,WebGPU\n';
    const rows = results.map((r) => {
      const cfg = MODEL_REGISTRY.find((m) => m.id === r.modelId)!;
      const q   = r.avgQuality;
      return [cfg.name, cfg.tier, cfg.params, cfg.contextWindow, Math.round(r.avgInferenceMs),
              Math.round(r.avgLoadMs), q.overall, q.coverage, q.compression, q.coherence,
              q.completeness, q.clarity, r.webGpuUsed].join(',');
    });
    download('benchmark-results.csv', header + rows.join('\n'), 'text/csv');
  }

  function enrichResult(r: ModelBenchmarkResult) {
    const cfg = MODEL_REGISTRY.find((m) => m.id === r.modelId);
    return { ...r, modelName: cfg?.name, tier: cfg?.tier, params: cfg?.params };
  }

  function download(filename: string, content: string, mime: string) {
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.addEventListener('benchmark-complete', () => render());
  render();
}
