import type { AppState, Tier, PipelineType, Dtype, RiskLevel } from '../types';
import {
  loadCustomModels, addCustomModel, removeCustomModel,
  validateContextWindow, buildCustomModel, CHAT_FORMATS,
  type ChatFormat, type ContextLevel,
} from '../data/custom-models';

// ── Reusable modal ─────────────────────────────────────────────────────────
interface ModalOptions {
  title: string;
  body: string;
  level: ContextLevel;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function showModal(opts: ModalOptions): void {
  // Remove existing
  document.getElementById('ctx-modal')?.remove();

  const iconMap: Record<ContextLevel, string> = {
    ok: '✅', warn: '⚠', danger: '🔴', block: '🚫',
  };
  const colorMap: Record<ContextLevel, string> = {
    ok: 'modal-ok', warn: 'modal-warn', danger: 'modal-danger', block: 'modal-block',
  };
  const canProceed = opts.level !== 'block';

  const overlay = document.createElement('div');
  overlay.id = 'ctx-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box ${colorMap[opts.level]}">
      <div class="modal-icon">${iconMap[opts.level]}</div>
      <h2 class="modal-title">${opts.title}</h2>
      <p class="modal-body">${opts.body.replace(/\n/g, '<br>')}</p>
      <div class="modal-actions">
        ${canProceed
          ? `<button id="modalCancel" class="btn-modal-cancel">Cancel</button>
             <button id="modalConfirm" class="btn-modal-confirm modal-${opts.level}">Proceed Anyway</button>`
          : `<button id="modalCancel" class="btn-modal-confirm modal-block">Understood — Go Back</button>`
        }
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('modalCancel')?.addEventListener('click', () => {
    overlay.remove();
    opts.onCancel?.();
  });
  document.getElementById('modalConfirm')?.addEventListener('click', () => {
    overlay.remove();
    opts.onConfirm?.();
  });

  // Click outside to close (cancel)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.remove(); opts.onCancel?.(); }
  });
}

// ── Suggested model IDs guide ──────────────────────────────────────────────
const SUGGESTED_MODELS = [
  { id: 'onnx-community/Llama-3.2-1B-Instruct',     label: 'Llama 3.2 1B',     dtype: 'q4',   ctx: '128K', tier: 2 },
  { id: 'onnx-community/Llama-3.2-3B-Instruct',     label: 'Llama 3.2 3B',     dtype: 'q4',   ctx: '128K', tier: 2 },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct',     label: 'Qwen 2.5 0.5B',    dtype: 'q4',   ctx: '32K',  tier: 2 },
  { id: 'onnx-community/Qwen2.5-3B-Instruct',       label: 'Qwen 2.5 3B',      dtype: 'q4',   ctx: '32K',  tier: 2 },
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct',      label: 'SmolLM2 360M',      dtype: 'q4',   ctx: '8K',   tier: 2 },
  { id: 'Xenova/flan-t5-large',                     label: 'Flan-T5-Large',     dtype: 'fp32', ctx: '512',  tier: 1 },
  { id: 'Xenova/bart-large-cnn',                    label: 'BART-Large-CNN',    dtype: 'fp32', ctx: '1024', tier: 1 },
];

// ── Settings panel ─────────────────────────────────────────────────────────
export function initSettingsPanel(container: HTMLElement, _state: AppState): void {
  let customModels = loadCustomModels();
  let showSuggestions = false;

  function render() {
    container.innerHTML = `
      <div class="panel-header">
        <h2>⚙ Settings & Custom Models</h2>
        <p class="panel-sub">Add any HuggingFace ONNX-compatible model to the benchmark suite.</p>
      </div>

      <!-- How to find a model -->
      <div class="settings-section">
        <div class="settings-card info-card">
          <h3>📖 How to Add a Model</h3>
          <p>Models must be exported to <strong>ONNX format</strong> and hosted on HuggingFace Hub. Use the <code>model_id</code> in the format <code>namespace/model-name</code>.</p>
          <div class="id-format-box">
            <div class="format-row">
              <span class="format-badge badge-green">✓ Valid</span>
              <code>onnx-community/Llama-3.2-1B-Instruct</code>
            </div>
            <div class="format-row">
              <span class="format-badge badge-green">✓ Valid</span>
              <code>Xenova/t5-small</code>
            </div>
            <div class="format-row">
              <span class="format-badge badge-red">✗ Invalid</span>
              <code>meta-llama/Llama-3.2-1B</code>
              <span class="format-note">— not ONNX-exported</span>
            </div>
            <div class="format-row">
              <span class="format-badge badge-red">✗ Invalid</span>
              <code>https://huggingface.co/...</code>
              <span class="format-note">— use ID only, not full URL</span>
            </div>
          </div>
          <div class="recommended-namespaces">
            <strong>Recommended namespaces:</strong>
            <span class="ns-chip">onnx-community/</span>
            <span class="ns-chip">Xenova/</span>
            <span class="ns-chip">HuggingFaceTB/</span>
          </div>
        </div>
      </div>

      <!-- Context window warning guide -->
      <div class="settings-section">
        <div class="settings-card warn-guide-card">
          <h3>📏 Context Window Size Guide</h3>
          <div class="ctx-guide">
            <div class="ctx-row ctx-ok">     <span class="ctx-icon">✅</span> <strong>&lt; 32K tokens</strong>   <span>Safe — no warnings</span></div>
            <div class="ctx-row ctx-warn">   <span class="ctx-icon">⚠</span> <strong>32K – 128K tokens</strong> <span>Warning popup — high memory usage</span></div>
            <div class="ctx-row ctx-danger"> <span class="ctx-icon">🔴</span> <strong>128K – 256K tokens</strong><span>Strong warning — likely to crash</span></div>
            <div class="ctx-row ctx-block">  <span class="ctx-icon">🚫</span> <strong>&gt; 256K tokens</strong>  <span>Blocked — cannot load in browser</span></div>
          </div>
        </div>
      </div>

      <!-- Quick suggestions -->
      <div class="settings-section">
        <div class="settings-card">
          <div class="suggestions-header">
            <h3>💡 Quick Add — Suggested Models</h3>
            <button class="btn-toggle-suggestions" id="toggleSugg">
              ${showSuggestions ? 'Hide ↑' : 'Show suggestions ↓'}
            </button>
          </div>
          ${showSuggestions ? `
            <div class="suggestions-grid">
              ${SUGGESTED_MODELS.map((s) => {
                const alreadyAdded = customModels.some((m) => m.id === s.id);
                return `
                  <div class="suggestion-chip ${alreadyAdded ? 'chip-added' : ''}">
                    <div class="chip-info">
                      <span class="chip-label">${s.label}</span>
                      <code class="chip-id">${s.id}</code>
                      <span class="chip-meta">${s.dtype} · ${s.ctx} ctx · Tier ${s.tier}</span>
                    </div>
                    <button class="btn-quick-add" data-model-id="${s.id}" ${alreadyAdded ? 'disabled' : ''}>
                      ${alreadyAdded ? 'Added ✓' : '+ Add'}
                    </button>
                  </div>`;
              }).join('')}
            </div>` : ''}
        </div>
      </div>

      <!-- Add custom model form -->
      <div class="settings-section">
        <div class="settings-card">
          <h3>➕ Add Custom Model</h3>
          <form id="addModelForm" class="model-form" novalidate>
            <div class="form-row">
              <div class="form-group form-wide">
                <label for="fModelId">HuggingFace Model ID <span class="req">*</span></label>
                <input id="fModelId" type="text" class="form-input" placeholder="e.g. onnx-community/Llama-3.2-1B-Instruct" autocomplete="off" />
                <span class="field-hint">Format: <code>namespace/model-name</code></span>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="fName">Display Name</label>
                <input id="fName" type="text" class="form-input" placeholder="e.g. Llama 3.2 1B" />
              </div>
              <div class="form-group">
                <label for="fParams">Parameter Count</label>
                <input id="fParams" type="text" class="form-input" placeholder="e.g. 1B" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="fCtx">Context Window <span class="req">*</span> (tokens)</label>
                <input id="fCtx" type="number" class="form-input" placeholder="e.g. 8192" min="128" />
                <span class="field-hint" id="ctxHint"></span>
              </div>
              <div class="form-group">
                <label for="fTier">Tier</label>
                <select id="fTier" class="form-select">
                  <option value="1">🔵 Tier 1 — Summarization (seq2seq)</option>
                  <option value="2" selected>🟠 Tier 2 — Instruction LLM</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="fPipeline">Pipeline Type</label>
                <select id="fPipeline" class="form-select">
                  <option value="text-generation" selected>text-generation (LLMs)</option>
                  <option value="summarization">summarization (seq2seq)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="fDtype">Quantization (dtype)</label>
                <select id="fDtype" class="form-select">
                  <option value="q4" selected>q4 (4-bit, ~600MB–1GB)</option>
                  <option value="q4f16">q4f16 (4-bit, WebGPU)</option>
                  <option value="fp32">fp32 (full precision, large)</option>
                </select>
              </div>
            </div>
            <div class="form-row" id="chatFormatRow">
              <div class="form-group form-wide">
                <label for="fChatFormat">Chat Template Format</label>
                <select id="fChatFormat" class="form-select">
                  ${Object.entries(CHAT_FORMATS).map(([k, v]) =>
                    `<option value="${k}" ${k === 'chatml' ? 'selected' : ''}>${v.label}</option>`
                  ).join('')}
                </select>
                <span class="field-hint">Used to format the summarization prompt for instruction-tuned LLMs.</span>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="fRisk">Risk Level</label>
                <select id="fRisk" class="form-select">
                  <option value="low">Low</option>
                  <option value="medium" selected>Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div id="formError" class="form-error"></div>
            <div class="form-actions">
              <button type="submit" class="btn-add-model">Add Model to Suite</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Custom models list -->
      ${customModels.length > 0 ? `
        <div class="settings-section">
          <div class="settings-card">
            <h3>📦 Your Custom Models (${customModels.length})</h3>
            <div class="custom-models-list">
              ${customModels.map((m) => `
                <div class="custom-model-row" data-id="${m.id}">
                  <div class="cm-info">
                    <span class="tier-chip tier-${m.tier}">T${m.tier}</span>
                    <span class="cm-name">${m.name}</span>
                    <code class="cm-id">${m.id}</code>
                    <span class="cm-meta">${m.params} · ${m.contextWindow} · ${m.dtype}</span>
                  </div>
                  <button class="btn-remove-model" data-id="${m.id}">Remove</button>
                </div>`).join('')}
            </div>
          </div>
        </div>` : ''}`;

    attachListeners();
  }

  function attachListeners() {
    // Toggle suggestions
    document.getElementById('toggleSugg')?.addEventListener('click', () => {
      showSuggestions = !showSuggestions;
      render();
    });

    // Quick-add suggestion chips
    container.querySelectorAll<HTMLButtonElement>('.btn-quick-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modelId = btn.dataset.modelId!;
        const sugg = SUGGESTED_MODELS.find((s) => s.id === modelId)!;
        // Pre-fill the form
        (document.getElementById('fModelId') as HTMLInputElement).value = sugg.id;
        (document.getElementById('fName') as HTMLInputElement).value = sugg.label;
        (document.getElementById('fDtype') as HTMLSelectElement).value = sugg.dtype;
        (document.getElementById('fTier') as HTMLSelectElement).value = String(sugg.tier);
        // Scroll to form
        document.getElementById('addModelForm')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Context window live validation
    const ctxInput = document.getElementById('fCtx') as HTMLInputElement;
    const ctxHint = document.getElementById('ctxHint')!;
    ctxInput?.addEventListener('input', () => {
      const tokens = parseInt(ctxInput.value);
      if (!tokens) { ctxHint.textContent = ''; ctxHint.className = 'field-hint'; return; }
      const v = validateContextWindow(tokens);
      if (v.level === 'ok') {
        ctxHint.textContent = `✅ ${tokens.toLocaleString()} tokens — safe for browser`;
        ctxHint.className = 'field-hint hint-ok';
      } else if (v.level === 'warn') {
        ctxHint.textContent = `⚠ ${(tokens/1000).toFixed(0)}K tokens — high memory usage, warning will appear`;
        ctxHint.className = 'field-hint hint-warn';
      } else if (v.level === 'danger') {
        ctxHint.textContent = `🔴 ${(tokens/1000).toFixed(0)}K tokens — very risky, may crash browser`;
        ctxHint.className = 'field-hint hint-danger';
      } else {
        ctxHint.textContent = `🚫 ${(tokens/1000).toFixed(0)}K tokens — BLOCKED, too large for browser`;
        ctxHint.className = 'field-hint hint-block';
      }
    });

    // Toggle chat format row based on pipeline type
    const pipelineSelect = document.getElementById('fPipeline') as HTMLSelectElement;
    const chatFormatRow = document.getElementById('chatFormatRow')!;
    pipelineSelect?.addEventListener('change', () => {
      chatFormatRow.style.display = pipelineSelect.value === 'text-generation' ? '' : 'none';
    });

    // Form submission
    document.getElementById('addModelForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm();
    });

    // Remove custom model buttons
    container.querySelectorAll<HTMLButtonElement>('.btn-remove-model').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!;
        removeCustomModel(id);
        customModels = loadCustomModels();
        render();
        document.dispatchEvent(new CustomEvent('custom-models-changed'));
      });
    });
  }

  function submitForm() {
    const formError = document.getElementById('formError')!;
    formError.textContent = '';

    const modelId   = (document.getElementById('fModelId')     as HTMLInputElement).value.trim();
    const name      = (document.getElementById('fName')         as HTMLInputElement).value.trim();
    const params    = (document.getElementById('fParams')        as HTMLInputElement).value.trim();
    const ctxRaw    = (document.getElementById('fCtx')          as HTMLInputElement).value;
    const tier      = parseInt((document.getElementById('fTier') as HTMLSelectElement).value) as Tier;
    const pipeline  = (document.getElementById('fPipeline')    as HTMLSelectElement).value as PipelineType;
    const dtype     = (document.getElementById('fDtype')        as HTMLSelectElement).value as Dtype;
    const chatFmt   = (document.getElementById('fChatFormat')   as HTMLSelectElement).value as ChatFormat;
    const risk      = (document.getElementById('fRisk')         as HTMLSelectElement).value as RiskLevel;
    const ctxTokens = parseInt(ctxRaw);

    // Validation
    if (!modelId) { formError.textContent = 'Model ID is required.'; return; }
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(modelId)) {
      formError.textContent = 'Invalid Model ID. Use the format: namespace/model-name';
      return;
    }
    if (!ctxRaw || isNaN(ctxTokens) || ctxTokens < 128) {
      formError.textContent = 'Context window must be a number ≥ 128 tokens.';
      return;
    }

    const validation = validateContextWindow(ctxTokens);

    const doAdd = () => {
      const model = buildCustomModel({ id: modelId, name, params, contextTokens: ctxTokens, pipelineType: pipeline, dtype, tier, chatFormat: chatFmt, risk });
      addCustomModel(model);
      customModels = loadCustomModels();
      render();
      document.dispatchEvent(new CustomEvent('custom-models-changed'));
    };

    if (validation.level === 'ok') {
      doAdd();
    } else {
      showModal({
        level: validation.level,
        title: validation.title,
        body: validation.message,
        onConfirm: validation.level !== 'block' ? doAdd : undefined,
        onCancel: () => {},
      });
    }
  }

  document.addEventListener('custom-models-changed', () => {
    customModels = loadCustomModels();
    render();
  });

  render();
}
