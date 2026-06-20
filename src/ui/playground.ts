import type { AppState, EngineType } from '../types';
import { MODEL_REGISTRY } from '../models/registry';
import { streamChat, isModelLoaded, loadModel } from '../benchmark/runner';

export function initPlaygroundPanel(container: HTMLElement, state: AppState): void {
  let modelA = '';
  let engineA: EngineType = 'transformers';
  let modelB = '';
  let engineB: EngineType = 'transformers';
  let promptText = 'Explain quantum computing in simple terms.';
  let isGenerating = false;

  function render() {
    const loadedModels = [...state.loadedModels];

    container.innerHTML = `
      <div class="panel-header">
        <h2>A/B Chat Playground</h2>
        <p class="panel-sub">Stream and compare responses live between two models or engines.</p>
      </div>

      <div class="playground-controls" style="display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center; background: var(--surface-2); padding: 1rem; border-radius: 8px;">
        <div class="ctrl-group">
          <label style="font-size: 0.85rem; color: var(--text-2); margin-bottom: 0.25rem; display: block;">Model A</label>
          <select id="pgSelA" class="form-select">${modelOptions(loadedModels, modelA)}</select>
          <select id="pgSelEngineA" class="form-select">${engineOptions(engineA)}</select>
        </div>
        <div class="vs-badge" style="font-weight: 800; color: var(--accent); padding: 0.5rem; background: var(--surface-1); border-radius: 50%;">VS</div>
        <div class="ctrl-group">
          <label style="font-size: 0.85rem; color: var(--text-2); margin-bottom: 0.25rem; display: block;">Model B</label>
          <select id="pgSelB" class="form-select">${modelOptions(loadedModels, modelB)}</select>
          <select id="pgSelEngineB" class="form-select">${engineOptions(engineB)}</select>
        </div>
      </div>

      <div class="playground-input" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
        <textarea id="pgPrompt" class="form-input" rows="3" placeholder="Enter prompt...">${promptText}</textarea>
        <button id="pgRunBtn" class="btn-run" style="align-self: flex-start;" ${isGenerating || !modelA || !modelB ? 'disabled' : ''}>
          ${isGenerating ? '<span class="spinner-sm"></span> Generating…' : '▶ Generate Responses'}
        </button>
      </div>

      <div class="playground-cols" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
        <div class="playground-col col-a" style="background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
          <h3 style="margin: 0; font-size: 1.1rem;">Response A</h3>
          <div class="pg-metrics" id="metricsA" style="font-family: monospace; font-size: 0.85rem; color: var(--text-2); background: var(--surface-2); padding: 0.5rem; border-radius: 4px;">Ready</div>
          <div class="pg-output" id="outputA" style="white-space: pre-wrap; line-height: 1.6; color: var(--text-1); flex-grow: 1;">Waiting for input...</div>
        </div>
        <div class="playground-col col-b" style="background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
          <h3 style="margin: 0; font-size: 1.1rem;">Response B</h3>
          <div class="pg-metrics" id="metricsB" style="font-family: monospace; font-size: 0.85rem; color: var(--text-2); background: var(--surface-2); padding: 0.5rem; border-radius: 4px;">Ready</div>
          <div class="pg-output" id="outputB" style="white-space: pre-wrap; line-height: 1.6; color: var(--text-1); flex-grow: 1;">Waiting for input...</div>
        </div>
      </div>
    `;

    container.querySelector<HTMLSelectElement>('#pgSelA')?.addEventListener('change', (e) => {
      modelA = (e.target as HTMLSelectElement).value; render();
    });
    container.querySelector<HTMLSelectElement>('#pgSelEngineA')?.addEventListener('change', (e) => {
      engineA = (e.target as HTMLSelectElement).value as EngineType; render();
    });
    container.querySelector<HTMLSelectElement>('#pgSelB')?.addEventListener('change', (e) => {
      modelB = (e.target as HTMLSelectElement).value; render();
    });
    container.querySelector<HTMLSelectElement>('#pgSelEngineB')?.addEventListener('change', (e) => {
      engineB = (e.target as HTMLSelectElement).value as EngineType; render();
    });
    container.querySelector<HTMLTextAreaElement>('#pgPrompt')?.addEventListener('input', (e) => {
      promptText = (e.target as HTMLTextAreaElement).value;
    });
    container.querySelector<HTMLButtonElement>('#pgRunBtn')?.addEventListener('click', runPlayground);

    if (!modelA && loadedModels.length > 0) { modelA = loadedModels[0]; render(); }
    if (!modelB && loadedModels.length > 1) { modelB = loadedModels[1]; render(); }
    else if (!modelB && loadedModels.length > 0) { modelB = loadedModels[0]; render(); }
  }

  function modelOptions(ids: string[], selected: string): string {
    if (ids.length === 0) return `<option value="">No models loaded</option>`;
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

  async function runPlayground() {
    if (isGenerating || !modelA || !modelB || !promptText.trim()) return;
    
    isGenerating = true;
    render();

    const outputA = container.querySelector('#outputA')!;
    const outputB = container.querySelector('#outputB')!;
    const metricsA = container.querySelector('#metricsA')!;
    const metricsB = container.querySelector('#metricsB')!;

    outputA.innerHTML = '';
    outputB.innerHTML = '';
    metricsA.innerHTML = 'Starting...';
    metricsB.innerHTML = 'Starting...';

    const cfgA = MODEL_REGISTRY.find(m => m.id === modelA)!;
    const cfgB = MODEL_REGISTRY.find(m => m.id === modelB)!;

    // Ensure models are loaded
    try {
      if (!isModelLoaded(modelA, engineA)) {
        await loadModel(cfgA, state.hasWebGPU ? 'webgpu' : 'wasm', () => {}, engineA);
      }
      if (!isModelLoaded(modelB, engineB)) {
        await loadModel(cfgB, state.hasWebGPU ? 'webgpu' : 'wasm', () => {}, engineB);
      }
    } catch (e) {
      console.error(e);
      metricsA.innerHTML = 'Error loading model';
      metricsB.innerHTML = 'Error loading model';
      isGenerating = false;
      render();
      return;
    }

    let tokensA = 0, tokensB = 0;
    const startA = performance.now();
    const startB = performance.now();

    const runStreamA = async () => {
      try {
        await streamChat(cfgA, promptText, engineA, (chunk) => {
          outputA.innerHTML += chunk;
          tokensA++;
          const elapsed = (performance.now() - startA) / 1000;
          metricsA.innerHTML = `Speed: ${(tokensA / elapsed).toFixed(1)} tok/s | Tokens: ${tokensA}`;
        });
      } catch (e) {
        outputA.innerHTML += `<br><span style="color:red">Error: ${e}</span>`;
      }
    };

    const runStreamB = async () => {
      try {
        await streamChat(cfgB, promptText, engineB, (chunk) => {
          outputB.innerHTML += chunk;
          tokensB++;
          const elapsed = (performance.now() - startB) / 1000;
          metricsB.innerHTML = `Speed: ${(tokensB / elapsed).toFixed(1)} tok/s | Tokens: ${tokensB}`;
        });
      } catch (e) {
        outputB.innerHTML += `<br><span style="color:red">Error: ${e}</span>`;
      }
    };

    await Promise.all([runStreamA(), runStreamB()]);

    isGenerating = false;
    render();
  }

  document.addEventListener('model-ready', () => { if (!isGenerating) render(); });
  render();
}
