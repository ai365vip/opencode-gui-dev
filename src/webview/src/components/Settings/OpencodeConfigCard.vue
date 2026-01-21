<template>
  <div class="card">
    <div class="card-header">
      <div class="card-title-row">
        <div class="card-title">opencode.json / opencode.jsonc</div>
        <div class="badge" :class="dirty ? 'badge-dirty' : 'badge-ok'">
          {{ dirty ? '未保存' : state.exists ? '已加载' : '未创建' }}
        </div>
      </div>
      <div class="card-desc">模型、Provider、插件、Compaction 等</div>
    </div>

    <div class="card-controls">
      <div class="scope-toggle">
        <button
          class="scope-btn"
          :class="{ active: state.scope === 'user' }"
          :disabled="dirty"
          title="编辑用户配置（~/.config/opencode/）"
          @click="changeScope('user')"
        >
          用户
        </button>
        <button
          class="scope-btn"
          :class="{ active: state.scope === 'project' }"
          :disabled="dirty"
          title="编辑项目配置（.opencode/）"
          @click="changeScope('project')"
        >
          项目
        </button>
      </div>

      <div class="actions">
        <button class="btn" :disabled="state.loading" @click="reload">重载</button>
        <button class="btn" :disabled="!state.isLoaded" @click="openInEditor">在编辑器打开</button>
        <button class="btn primary" :disabled="!dirty || state.saving" @click="save">
          {{ state.saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div class="path-row" :title="state.path || ''">
      <span class="path-label">路径：</span>
      <span class="path-value" :class="{ muted: !state.path }">{{ state.path || '（未加载）' }}</span>
      <span class="path-meta">{{ savedHint }}</span>
    </div>

    <div v-if="state.loading" class="loading-state">
      <span class="codicon codicon-loading codicon-modifier-spin"></span>
      <span>正在加载配置…</span>
    </div>

    <div v-else-if="state.parseError" class="error">
      <span class="codicon codicon-error"></span>
      <span class="error-text">配置文件解析失败：{{ state.parseError }}</span>
      <div class="error-actions">
        <button class="btn" :disabled="!state.isLoaded" @click="openInEditor">在编辑器修复</button>
        <button class="btn" :disabled="state.loading" @click="reload">重载</button>
      </div>
    </div>

    <div v-else class="form">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">默认模型</label>
          <select v-model="form.model" class="form-select">
            <option value="">（未设置）</option>
            <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <div class="form-hint"><code>model</code>：provider/model</div>
        </div>

        <div class="form-group">
          <label class="form-label">小模型</label>
          <select v-model="form.smallModel" class="form-select">
            <option value="">（未设置）</option>
            <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <div class="form-hint"><code>small_model</code>：用于标题/摘要等</div>
        </div>

        <div class="form-group">
          <label class="form-label">默认 Agent</label>
          <input v-model="form.defaultAgent" type="text" class="form-input" placeholder="例如：build / plan / general" />
          <div class="form-hint"><code>default_agent</code>：不填则使用默认</div>
        </div>

        <div class="form-group">
          <label class="form-label">Provider 过滤</label>
          <select v-model="form.providerMode" class="form-select">
            <option value="all">默认（不限制）</option>
            <option value="only">只启用选中</option>
            <option value="disable">禁用选中</option>
          </select>
          <div class="form-hint">
            对应 <code>enabled_providers</code> / <code>disabled_providers</code>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">自动压缩</label>
          <select v-model="form.compactionAuto" class="form-select">
            <option value="default">默认（开）</option>
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
          <div class="form-hint"><code>compaction.auto</code></div>
        </div>

        <div class="form-group">
          <label class="form-label">剪枝旧输出</label>
          <select v-model="form.compactionPrune" class="form-select">
            <option value="default">默认（开）</option>
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
          <div class="form-hint">
            <code>compaction.prune</code>：清理较旧的工具输出以节省上下文 Token（不影响已执行结果/文件改动）
          </div>
        </div>
      </div>

      <div v-if="form.providerMode !== 'all'" class="subsection">
        <div class="subsection-title">Providers</div>
        <div class="pill-row">
          <button class="btn" type="button" @click="selectAllProviders">全选</button>
          <button class="btn" type="button" @click="clearProviders">清空</button>
        </div>
        <div class="provider-grid">
          <label v-for="p in providerOptions" :key="p" class="provider-item">
            <input
              type="checkbox"
              :checked="form.selectedProviders.includes(p)"
              @change="toggleProvider(p, ($event.target as HTMLInputElement).checked)"
            />
            <code>{{ p }}</code>
          </label>
        </div>
        <div class="form-hint muted">
          提示：列表来自后端 provider；如果为空，请先启动 OpenCode server。
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-title">Plugins</div>
        <div class="plugin-row">
          <label class="checkbox-row">
            <input
              type="checkbox"
              :checked="ohMyPluginEnabled"
              @change="toggleOhMyPlugin(($event.target as HTMLInputElement).checked)"
            />
            <span>启用 <code>oh-my-opencode</code></span>
          </label>
        </div>

        <div v-if="form.plugins.length > 0" class="chip-list">
          <div v-for="(pl, idx) in form.plugins" :key="pl + idx" class="chip">
            <code class="chip-text">{{ pl }}</code>
            <button class="chip-remove" title="移除" type="button" @click="removePlugin(idx)">
              <span class="codicon codicon-close"></span>
            </button>
          </div>
        </div>
        <div v-else class="empty-hint">未配置 plugins（可选）</div>

        <div class="add-row">
          <input
            v-model="form.newPlugin"
            type="text"
            class="form-input"
            placeholder="添加 plugin，例如：oh-my-opencode@latest 或 file:///..."
            @keydown.enter.prevent="addPlugin"
          />
          <button class="btn" type="button" @click="addPlugin">添加</button>
        </div>
      </div>
    </div>

    <div v-if="state.error && !state.parseError" class="error">
      <span class="codicon codicon-error"></span>
      <span class="error-text">{{ state.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { applyEdits, modify, parse } from 'jsonc-parser';
import { RuntimeKey } from '../../composables/runtimeContext';
import { useModelManagement } from '../../composables/useModelManagement';

type Scope = 'user' | 'project';
type TriState = 'default' | 'on' | 'off';

type FileState = {
  scope: Scope;
  path: string;
  exists: boolean;
  isLoaded: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  parseError: string;
  sourceText: string;
  lastSavedAt?: number;
};

const runtime = inject(RuntimeKey);
if (!runtime) {
  throw new Error('[OpencodeConfigCard] Runtime not provided');
}

const { availableModels } = useModelManagement();

const modelOptions = computed(() => {
  const arr = Array.isArray(availableModels.value) ? availableModels.value : [];
  return arr
    .filter((m) => typeof m?.value === 'string' && m.value)
    .map((m) => ({ value: m.value, label: m.label || m.value }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
});

const providerOptions = computed(() => {
  const set = new Set<string>();
  for (const m of modelOptions.value) {
    const provider = String(m.value).split('/')[0]?.trim();
    if (provider) set.add(provider);
  }
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
});

const state = reactive<FileState>({
  scope: 'user',
  path: '',
  exists: false,
  isLoaded: false,
  loading: false,
  saving: false,
  error: '',
  parseError: '',
  sourceText: ''
});

const form = reactive({
  model: '',
  smallModel: '',
  defaultAgent: '',
  providerMode: 'all' as 'all' | 'only' | 'disable',
  selectedProviders: [] as string[],
  compactionAuto: 'default' as TriState,
  compactionPrune: 'default' as TriState,
  plugins: [] as string[],
  newPlugin: ''
});

const initial = ref<{
  model: string;
  smallModel: string;
  defaultAgent: string;
  providerMode: 'all' | 'only' | 'disable';
  selectedProviders: string[];
  compactionAuto: TriState;
  compactionPrune: TriState;
  plugins: string[];
} | null>(null);

const dirty = computed(() => {
  if (!state.isLoaded) return false;
  const init = initial.value;
  if (!init) return false;

  return (
    form.model !== init.model ||
    form.smallModel !== init.smallModel ||
    form.defaultAgent !== init.defaultAgent ||
    form.providerMode !== init.providerMode ||
    !sameArray(form.selectedProviders, init.selectedProviders) ||
    form.compactionAuto !== init.compactionAuto ||
    form.compactionPrune !== init.compactionPrune ||
    !sameArray(form.plugins, init.plugins)
  );
});

const savedHint = computed(() => {
  if (!state.lastSavedAt) return '';
  const dt = new Date(state.lastSavedAt);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `已保存 ${hh}:${mm}:${ss}`;
});

const ohMyPluginEnabled = computed(() => {
  return (form.plugins || []).some((p) => getPluginName(p) === 'oh-my-opencode');
});

function sameArray(a: string[], b: string[]): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  for (let i = 0; i < arrA.length; i++) {
    if (String(arrA[i]) !== String(arrB[i])) return false;
  }
  return true;
}

function parseJsoncObject(text: string): { obj: any; error: string } {
  const errors: any[] = [];
  const out = parse(text ?? '', errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: true
  }) as any;
  if (errors.length > 0) {
    const first = errors[0];
    const offset = typeof first?.offset === 'number' ? first.offset : undefined;
    return {
      obj: out && typeof out === 'object' ? out : {},
      error: `JSONC 解析失败${typeof offset === 'number' ? `（offset ${offset}）` : ''}`
    };
  }
  return { obj: out && typeof out === 'object' ? out : {}, error: '' };
}

function applyModify(text: string, jsonPath: Array<string | number>, value: any): string {
  const original = text ?? '';
  const trimmed = original.trim();
  const format = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } };

  const apply = (source: string) => {
    const edits = modify(source, jsonPath, value, format);
    return applyEdits(source, edits);
  };
  if (!trimmed) {
    if (value === undefined) return original || '{\n}\n';
    const base = typeof jsonPath[0] === 'number' ? '[\n]\n' : '{\n}\n';
    return apply(base);
  }

  try {
    return apply(original);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (value === undefined && /delete in empty document/i.test(msg)) {
      return original;
    }
    throw err;
  }
}

function toTriState(value: unknown): TriState {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return 'default';
}

function triStateToBool(value: TriState): boolean | undefined {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return undefined;
}

function getPluginName(plugin: string): string {
  const p = String(plugin ?? '').trim();
  if (!p) return '';
  if (p.startsWith('file://')) {
    const withoutQuery = p.split('?')[0];
    const lastSlash = withoutQuery.lastIndexOf('/');
    const base = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
    return base.replace(/\.[a-z0-9]+$/i, '');
  }
  const lastAt = p.lastIndexOf('@');
  if (lastAt > 0) return p.substring(0, lastAt);
  return p;
}

function setInitial() {
  initial.value = {
    model: form.model,
    smallModel: form.smallModel,
    defaultAgent: form.defaultAgent,
    providerMode: form.providerMode,
    selectedProviders: [...form.selectedProviders],
    compactionAuto: form.compactionAuto,
    compactionPrune: form.compactionPrune,
    plugins: [...form.plugins]
  };
}

function initForm(obj: any) {
  form.model = typeof obj?.model === 'string' ? obj.model : '';
  form.smallModel = typeof obj?.small_model === 'string' ? obj.small_model : '';
  form.defaultAgent = typeof obj?.default_agent === 'string' ? obj.default_agent : '';

  const enabled = Array.isArray(obj?.enabled_providers) ? obj.enabled_providers.map(String) : [];
  const disabled = Array.isArray(obj?.disabled_providers) ? obj.disabled_providers.map(String) : [];

  if (enabled.length > 0) {
    form.providerMode = 'only';
    form.selectedProviders = enabled.filter(Boolean);
  } else if (disabled.length > 0) {
    form.providerMode = 'disable';
    form.selectedProviders = disabled.filter(Boolean);
  } else {
    form.providerMode = 'all';
    form.selectedProviders = [];
  }

  form.selectedProviders = Array.from(new Set(form.selectedProviders)).sort((a, b) => a.localeCompare(b));

  form.compactionAuto = toTriState(obj?.compaction?.auto);
  form.compactionPrune = toTriState(obj?.compaction?.prune);

  form.plugins = Array.isArray(obj?.plugin) ? obj.plugin.map(String).filter(Boolean) : [];
  form.newPlugin = '';

  setInitial();
}

async function loadFile(opts?: { silent?: boolean }) {
  if (state.loading) return;

  state.loading = true;
  if (!opts?.silent) state.error = '';
  state.parseError = '';

  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.getOpencodeConfigFile('opencode', state.scope);
    if (resp?.type !== 'get_opencode_config_file_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
    }

    state.path = String(resp.path ?? '');
    state.exists = !!resp.exists;
    state.sourceText = String(resp.content ?? '');
    state.isLoaded = true;
    state.error = String(resp.error ?? '');

    const { obj, error } = parseJsoncObject(state.sourceText);
    state.parseError = error;
    if (!state.parseError) initForm(obj);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.loading = false;
  }
}

async function reload() {
  if (dirty.value) {
    const ok = window.confirm('当前有未保存修改，确定要丢弃并重载吗？');
    if (!ok) return;
  }
  await loadFile();
}

async function changeScope(scope: Scope) {
  if (dirty.value) {
    state.error = '当前有未保存修改，请先保存或重载后再切换范围。';
    return;
  }
  state.scope = scope;
  await loadFile({ silent: true });
}

async function save() {
  if (state.saving || !state.isLoaded) return;
  if (state.parseError) return;

  state.saving = true;
  state.error = '';

  try {
    let next = state.sourceText;

    next = applyModify(next, ['model'], form.model ? form.model : undefined);
    next = applyModify(next, ['small_model'], form.smallModel ? form.smallModel : undefined);
    const defaultAgent = String(form.defaultAgent ?? '').trim();
    next = applyModify(next, ['default_agent'], defaultAgent ? defaultAgent : undefined);

    const selected = Array.from(
      new Set((form.selectedProviders || []).map((p) => String(p).trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    if (form.providerMode === 'only') {
      next = applyModify(next, ['enabled_providers'], selected.length > 0 ? selected : undefined);
      next = applyModify(next, ['disabled_providers'], undefined);
    } else if (form.providerMode === 'disable') {
      next = applyModify(next, ['disabled_providers'], selected.length > 0 ? selected : undefined);
      next = applyModify(next, ['enabled_providers'], undefined);
    } else {
      next = applyModify(next, ['enabled_providers'], undefined);
      next = applyModify(next, ['disabled_providers'], undefined);
    }

    const plugins = (form.plugins || []).map((p) => String(p).trim()).filter(Boolean);
    next = applyModify(next, ['plugin'], plugins.length > 0 ? plugins : undefined);

    next = applyModify(next, ['compaction', 'auto'], triStateToBool(form.compactionAuto));
    next = applyModify(next, ['compaction', 'prune'], triStateToBool(form.compactionPrune));

    const conn = await runtime!.connectionManager.get();
    const resp = await conn.saveOpencodeConfigFile('opencode', next, state.scope);
    if (resp?.type !== 'save_opencode_config_file_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
    }
    if (!resp.success) {
      throw new Error(String(resp.error ?? '保存失败'));
    }

    if (typeof resp.path === 'string') state.path = resp.path;
    state.exists = true;
    state.sourceText = next;
    state.lastSavedAt = Date.now();
    setInitial();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.saving = false;
  }
}

async function openInEditor() {
  if (!state.isLoaded) {
    await loadFile();
  }
  if (!state.path) return;

  try {
    if (!state.exists) {
      const ok = window.confirm('配置文件尚未创建，是否先创建并打开？');
      if (!ok) return;
      await save();
    }

    const conn = await runtime!.connectionManager.get();
    await conn.openFile(state.path);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
}

function toggleProvider(provider: string, checked: boolean) {
  const v = String(provider ?? '').trim();
  if (!v) return;
  const current = new Set<string>(form.selectedProviders || []);
  if (checked) current.add(v);
  else current.delete(v);
  form.selectedProviders = Array.from(current.values()).sort((a, b) => a.localeCompare(b));
}

function selectAllProviders() {
  form.selectedProviders = [...providerOptions.value];
}

function clearProviders() {
  form.selectedProviders = [];
}

function addPlugin() {
  const p = String(form.newPlugin ?? '').trim();
  if (!p) return;
  if (!form.plugins.includes(p)) form.plugins.push(p);
  form.newPlugin = '';
}

function removePlugin(index: number) {
  if (index < 0 || index >= form.plugins.length) return;
  form.plugins.splice(index, 1);
}

function toggleOhMyPlugin(enabled: boolean) {
  const plugins = form.plugins || [];
  const names = plugins.map((p) => getPluginName(p));

  if (enabled) {
    if (!names.includes('oh-my-opencode')) {
      plugins.push('oh-my-opencode');
    }
    return;
  }

  form.plugins = plugins.filter((p) => getPluginName(p) !== 'oh-my-opencode');
}

onMounted(async () => {
  await loadFile();
});
</script>

<style scoped>
.card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--vscode-editor-background) 90%, transparent);
}

.card-header {
  padding: 12px 12px 10px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title {
  font-weight: 700;
  font-size: 13px;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--vscode-panel-border);
  opacity: 0.95;
}

.badge-ok {
  background: color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 25%, transparent);
}

.badge-dirty {
  background: color-mix(in srgb, var(--vscode-testing-iconQueued, #cca700) 25%, transparent);
}

.card-desc {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.75;
}

.card-controls {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-wrap: wrap;
}

.scope-toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.scope-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--vscode-panel-border);
  background: transparent;
  color: var(--vscode-foreground);
  font-size: 12px;
  cursor: pointer;
}

.scope-btn.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: transparent;
}

.scope-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  font-size: 12px;
}

.btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: transparent;
}

.btn.primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 12px;
}

.path-label {
  opacity: 0.75;
}

.path-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-value.muted {
  opacity: 0.7;
}

.path-meta {
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  font-size: 13px;
}

.form {
  padding: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  opacity: 0.9;
}

.form-input,
.form-select {
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.form-hint {
  font-size: 12px;
  opacity: 0.75;
  line-height: 1.4;
}

.form-hint.muted {
  opacity: 0.65;
}

.subsection {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--vscode-panel-border);
}

.subsection-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 10px;
}

.pill-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.plugin-row {
  margin-bottom: 10px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 10px 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--vscode-panel-border);
  background: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
}

.chip-text {
  font-size: 12px;
}

.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
}

.chip-remove:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.empty-hint {
  font-size: 12px;
  opacity: 0.75;
  margin: 8px 0 10px 0;
}

.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.error {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-top: 1px solid var(--vscode-panel-border);
  font-size: 13px;
  color: var(--vscode-errorForeground);
}

.error-text {
  flex: 1;
  line-height: 1.4;
}

.error-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (min-width: 920px) {
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .provider-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
