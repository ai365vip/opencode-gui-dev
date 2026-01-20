<template>
  <div class="card">
    <div class="card-header">
      <div class="card-title-row">
        <div class="card-title">oh-my-opencode.json</div>
        <div class="badge" :class="dirty ? 'badge-dirty' : 'badge-ok'">
          {{ dirty ? '未保存' : state.exists ? '已加载' : '未创建' }}
        </div>
      </div>
      <div class="card-desc">Hooks 开关（disabled_hooks）</div>
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
      <div v-if="hookCatalog.length > 0" class="hook-list">
        <label v-for="h in hookCatalog" :key="h.id" class="hook-item">
          <input
            type="checkbox"
            :checked="!disabledHooksSet.has(h.id)"
            @change="setHookEnabled(h.id, ($event.target as HTMLInputElement).checked)"
          />
          <div class="hook-body">
            <code class="hook-id">{{ h.id }}</code>
            <div class="hook-desc">{{ h.description }}</div>
          </div>
        </label>
      </div>
      <div v-else class="empty-hint">未获取到 hooks 列表（可先启动 OpenCode server 再重载）。</div>

      <div class="hint muted">
        注：这里只管理 <code>disabled_hooks</code>；agents / skills 等更复杂配置建议在编辑器打开或使用侧栏
        Agents/Skills 页面。
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

type Scope = 'user' | 'project';

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

type HookInfo = { id: string; description: string };

const runtime = inject(RuntimeKey);
if (!runtime) {
  throw new Error('[OhMyConfigCard] Runtime not provided');
}

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

const hookCatalog = ref<HookInfo[]>([]);

const disabledHooks = ref<string[]>([]);
const initialDisabledHooks = ref<string[]>([]);

const disabledHooksSet = computed(() => new Set<string>(disabledHooks.value || []));

const dirty = computed(() => {
  const a = disabledHooks.value || [];
  const b = initialDisabledHooks.value || [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]) !== String(b[i])) return true;
  }
  return false;
});

const savedHint = computed(() => {
  if (!state.lastSavedAt) return '';
  const dt = new Date(state.lastSavedAt);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `已保存 ${hh}:${mm}:${ss}`;
});

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
  if (!trimmed) {
    if (value === undefined) return original;
    const base = typeof jsonPath[0] === 'number' ? '[\n]\n' : '{\n}\n';
    const edits = modify(base, jsonPath, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' }
    });
    return applyEdits(base, edits);
  }

  const edits = modify(original, jsonPath, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' }
  });
  return applyEdits(original, edits);
}

function setInitial() {
  initialDisabledHooks.value = [...disabledHooks.value];
}

async function loadHookCatalog() {
  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.getSkills();
    if (resp?.type !== 'get_skills_response') return;

    const items = Array.isArray(resp.skills) ? resp.skills : [];
    hookCatalog.value = items
      .filter((s: any) => typeof s?.id === 'string' && s.id)
      .map((s: any) => ({ id: String(s.id), description: String(s.description ?? '') }))
      .sort((a: HookInfo, b: HookInfo) => a.id.localeCompare(b.id));
  } catch (err) {
    hookCatalog.value = [];
  }
}

async function loadFile(opts?: { silent?: boolean }) {
  if (state.loading) return;

  state.loading = true;
  if (!opts?.silent) state.error = '';
  state.parseError = '';

  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.getOpencodeConfigFile('oh-my-opencode', state.scope);
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
    if (!state.parseError) {
      const arr = Array.isArray(obj?.disabled_hooks)
        ? (obj.disabled_hooks as unknown[]).map((v: unknown) => String(v))
        : [];
      disabledHooks.value = Array.from(new Set(arr.filter(Boolean))).sort((a: string, b: string) =>
        a.localeCompare(b)
      );
      setInitial();
    }
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

    const out = Array.from(
      new Set((disabledHooks.value || []).map((h) => String(h).trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    next = applyModify(next, ['disabled_hooks'], out.length > 0 ? out : undefined);

    const conn = await runtime!.connectionManager.get();
    const resp = await conn.saveOpencodeConfigFile('oh-my-opencode', next, state.scope);
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

function setHookEnabled(hookId: string, enabled: boolean) {
  const id = String(hookId ?? '').trim();
  if (!id) return;

  const current = new Set<string>(disabledHooks.value || []);
  if (enabled) current.delete(id);
  else current.add(id);

  disabledHooks.value = Array.from(current.values()).sort((a, b) => a.localeCompare(b));
}

onMounted(async () => {
  await loadHookCatalog();
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

.hook-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.hook-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--vscode-panel-border);
  background: color-mix(in srgb, var(--vscode-editor-background) 85%, transparent);
}

.hook-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hook-id {
  font-size: 12px;
}

.hook-desc {
  font-size: 12px;
  opacity: 0.75;
  line-height: 1.4;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 10px;
}

.hint {
  font-size: 12px;
  line-height: 1.4;
  margin-top: 10px;
}

.hint.muted {
  opacity: 0.75;
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
</style>
