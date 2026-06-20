import './style.css';
import type { AppState } from './types';
import { detectWebGPU } from './benchmark/metrics';
import { initModelPanel }   from './ui/model-panel';
import { initRunnerPanel }  from './ui/runner-panel';
import { initDashboard }    from './ui/dashboard';
import { initComparePanel } from './ui/compare';
import { initSettingsPanel } from './ui/settings-panel';
import { initPlaygroundPanel } from './ui/playground';

// ── App state singleton ──────────────────────────────────────────────────
const state: AppState = {
  downloadStates: new Map(),
  loadedModels:   new Set(),
  results:        [],
  modelResults:   new Map(),
  hasWebGPU:      false,
};

// ── Tab definitions ───────────────────────────────────────────────────────
const TABS = [
  { id: 'models',    label: '🤖 Models' },
  { id: 'benchmark', label: '▶ Benchmark' },
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'compare',   label: '⚖ Compare' },
  { id: 'playground',label: '💬 Playgrounds' },
  { id: 'settings',  label: '⚙ Settings' },
] as const;

type TabId = typeof TABS[number]['id'];
let activeTab: TabId = 'models';

// ── Render app shell ──────────────────────────────────────────────────────
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="header-brand">
        <span class="brand-icon">⚡</span>
        <div>
          <h1 class="brand-title">BrowserBench<span class="brand-accent">LLM</span></h1>
          <p class="brand-sub">Browser-based language model benchmarking</p>
        </div>
      </div>
      <nav class="tab-nav" id="tabNav">
        ${TABS.map((t) => `
          <button class="tab-btn ${t.id === activeTab ? 'tab-active' : ''}" data-tab="${t.id}">
            ${t.label}
          </button>`).join('')}
      </nav>
    </header>

    <main class="app-main" id="appMain">
      ${TABS.map((t) => `
        <div class="tab-panel ${t.id === activeTab ? 'panel-active' : ''}" id="panel-${t.id}"></div>
      `).join('')}
    </main>
  </div>`;

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(tabId: TabId) {
  activeTab = tabId;
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.classList.toggle('tab-active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll<HTMLDivElement>('.tab-panel').forEach((panel) => {
    panel.classList.toggle('panel-active', panel.id === `panel-${tabId}`);
  });
}

document.querySelector('#tabNav')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab-btn');
  if (btn?.dataset.tab) switchTab(btn.dataset.tab as TabId);
});

// ── Init panels ───────────────────────────────────────────────────────────
async function init() {
  state.hasWebGPU = await detectWebGPU();

  initModelPanel(  document.querySelector<HTMLElement>('#panel-models')!,     state);
  initRunnerPanel( document.querySelector<HTMLElement>('#panel-benchmark')!,   state);
  initDashboard(   document.querySelector<HTMLElement>('#panel-dashboard')!,   state);
  initComparePanel(document.querySelector<HTMLElement>('#panel-compare')!,     state);
  initPlaygroundPanel(document.querySelector<HTMLElement>('#panel-playground')!, state);
  initSettingsPanel(document.querySelector<HTMLElement>('#panel-settings')!,   state);
}

init();
