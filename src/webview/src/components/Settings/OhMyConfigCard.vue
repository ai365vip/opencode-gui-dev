<template>
  <div class="card">
      <div class="card-header">
        <div class="card-title-row">
          <div class="card-title">oh-my-opencode.json</div>
          <div class="badge" :class="dirty ? 'badge-dirty' : 'badge-ok'">
            {{ dirty ? '未保存' : state.exists ? '已加载' : '未创建' }}
          </div>
        </div>
      <div class="card-desc">Hooks / Agents 配置（disabled_hooks / agents）</div>
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
      <div class="section">
        <div class="section-title">Hooks</div>
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
      </div>

      <div class="section">
        <div class="section-title">Agents</div>
        <div v-if="agentsUnsupported" class="empty-hint">
          当前 <code>agents</code> 字段不是对象，GUI 暂不支持表单编辑；请在编辑器打开修复或手动维护。
        </div>
        <div v-else>
          <div class="agent-add-row">
            <input
              v-model="newAgentName"
              type="text"
              class="form-input"
              placeholder="输入 Agent 名称（例如：general / build / plan）"
              @keydown.enter.prevent="addAgent"
            />
            <button class="btn" type="button" @click="addAgent">添加</button>
          </div>

          <div v-if="agents.length > 0" class="agent-list">
            <div v-for="a in agents" :key="a.name" class="agent-item">
              <code class="agent-name">{{ a.name }}</code>
              <div class="agent-controls">
                <label class="agent-control">
                  <span class="agent-control-label">enabled</span>
                  <select v-model="a.enabled" class="form-select form-select-compact">
                    <option value="default">默认</option>
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                  </select>
                </label>
                <label class="agent-control">
                  <span class="agent-control-label">replace_plan</span>
                  <select v-model="a.replacePlan" class="form-select form-select-compact">
                    <option value="default">默认</option>
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                  </select>
                </label>
              </div>
              <button class="btn danger" type="button" @click="removeAgent(a.name)">移除</button>
            </div>
          </div>
          <div v-else class="empty-hint">未配置 agents（可在上方添加）。</div>
        </div>
      </div>

      <div class="hint muted">
        提示：这里只管理 <code>disabled_hooks</code> 与 <code>agents</code>（enabled / replace_plan）；其余字段建议在编辑器打开。
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
type TriState = 'default' | 'on' | 'off';
type AgentEntry = { name: string; enabled: TriState; replacePlan: TriState };

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

const agents = ref<AgentEntry[]>([]);
const initialAgents = ref<AgentEntry[]>([]);
const newAgentName = ref('');
const agentsUnsupported = ref(false);

const disabledHooksSet = computed(() => new Set<string>(disabledHooks.value || []));

const dirty = computed(() => {
  const a = disabledHooks.value || [];
  const b = initialDisabledHooks.value || [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]) !== String(b[i])) return true;
  }

  const x = agents.value || [];
  const y = initialAgents.value || [];
  if (x.length !== y.length) return true;
  for (let i = 0; i < x.length; i++) {
    const ax = x[i];
    const by = y[i];
    if (String(ax?.name) !== String(by?.name)) return true;
    if (String(ax?.enabled) !== String(by?.enabled)) return true;
    if (String(ax?.replacePlan) !== String(by?.replacePlan)) return true;
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

function setInitial() {
  initialDisabledHooks.value = [...disabledHooks.value];
  initialAgents.value = (agents.value || []).map((a) => ({ ...a }));
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boolToTriState(value: unknown): TriState {
  if (typeof value !== 'boolean') return 'default';
  return value ? 'on' : 'off';
}

function triStateToBool(value: TriState): boolean | undefined {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return undefined;
}

function normalizeAgents(list: AgentEntry[]): AgentEntry[] {
  const map = new Map<string, AgentEntry>();
  for (const item of list || []) {
    const name = String(item?.name ?? '').trim();
    if (!name) continue;
    const enabled: TriState = item.enabled === 'on' || item.enabled === 'off' ? item.enabled : 'default';
    const replacePlan: TriState =
      item.replacePlan === 'on' || item.replacePlan === 'off' ? item.replacePlan : 'default';
    map.set(name, { name, enabled, replacePlan });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function addAgent() {
  const name = String(newAgentName.value ?? '').trim();
  if (!name) return;
  if (agents.value.some((a) => a.name === name)) {
    newAgentName.value = '';
    return;
  }
  agents.value = normalizeAgents([...agents.value, { name, enabled: 'default', replacePlan: 'default' }]);
  newAgentName.value = '';
}

function removeAgent(agentName: string) {
  const name = String(agentName ?? '').trim();
  if (!name) return;
  agents.value = normalizeAgents(agents.value.filter((a) => a.name !== name));
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

      agentsUnsupported.value = obj?.agents !== undefined && !isPlainObject(obj?.agents);
      if (!agentsUnsupported.value && isPlainObject(obj?.agents)) {
        const entries = Object.entries(obj.agents as Record<string, any>).map(([name, cfg]) => ({
          name: String(name).trim(),
          enabled: boolToTriState((cfg as any)?.enabled),
          replacePlan: boolToTriState((cfg as any)?.replace_plan)
        }));
        agents.value = normalizeAgents(entries);
      } else {
        agents.value = [];
      }
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

    if (!agentsUnsupported.value) {
      const desired = normalizeAgents(agents.value || []);
      const desiredSet = new Set(desired.map((a) => a.name));
      const { obj } = parseJsoncObject(state.sourceText);
      const existingAgents = isPlainObject(obj?.agents) ? (obj.agents as Record<string, any>) : undefined;
      const existingNames = existingAgents ? Object.keys(existingAgents) : [];

      for (const name of existingNames) {
        if (!desiredSet.has(name)) {
          next = applyModify(next, ['agents', name], undefined);
        }
      }

      for (const entry of desired) {
        const desiredEnabled = triStateToBool(entry.enabled);
        const desiredReplacePlan = triStateToBool(entry.replacePlan);

        const existing = existingAgents ? existingAgents[entry.name] : undefined;
        const existingIsObj = isPlainObject(existing);
        const shouldReplaceWhole =
          !existingIsObj && (desiredEnabled !== undefined || desiredReplacePlan !== undefined);

        if (shouldReplaceWhole) {
          const newObj: any = {};
          if (desiredEnabled !== undefined) newObj.enabled = desiredEnabled;
          if (desiredReplacePlan !== undefined) newObj.replace_plan = desiredReplacePlan;
          next = applyModify(next, ['agents', entry.name], newObj);
          continue;
        }

        if (existingIsObj) {
          const enabledExists = Object.prototype.hasOwnProperty.call(existing, 'enabled');
          const replacePlanExists = Object.prototype.hasOwnProperty.call(existing, 'replace_plan');
          const existingEnabled = typeof (existing as any)?.enabled === 'boolean' ? (existing as any).enabled : undefined;
          const existingReplacePlan =
            typeof (existing as any)?.replace_plan === 'boolean' ? (existing as any).replace_plan : undefined;

          if (desiredEnabled === undefined) {
            if (enabledExists) next = applyModify(next, ['agents', entry.name, 'enabled'], undefined);
          } else if (existingEnabled !== desiredEnabled) {
            next = applyModify(next, ['agents', entry.name, 'enabled'], desiredEnabled);
          }

          if (desiredReplacePlan === undefined) {
            if (replacePlanExists) next = applyModify(next, ['agents', entry.name, 'replace_plan'], undefined);
          } else if (existingReplacePlan !== desiredReplacePlan) {
            next = applyModify(next, ['agents', entry.name, 'replace_plan'], desiredReplacePlan);
          }
        } else if (desiredEnabled === undefined && desiredReplacePlan === undefined) {
          if (existing === undefined) {
            next = applyModify(next, ['agents', entry.name], {});
          }
        } else {
          const newObj: any = {};
          if (desiredEnabled !== undefined) newObj.enabled = desiredEnabled;
          if (desiredReplacePlan !== undefined) newObj.replace_plan = desiredReplacePlan;
          next = applyModify(next, ['agents', entry.name], newObj);
        }
      }

      if (desired.length === 0 && existingNames.length > 0) {
        next = applyModify(next, ['agents'], undefined);
      }
    }

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

.section {
  margin-bottom: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
  opacity: 0.9;
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

.agent-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.form-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 12px;
}

.form-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.form-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 1px;
}

.form-select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  font-size: 12px;
}

.form-select-compact {
  padding: 4px 8px;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--vscode-panel-border);
  background: color-mix(in srgb, var(--vscode-editor-background) 85%, transparent);
}

.agent-name {
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.agent-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.agent-control-label {
  opacity: 0.75;
}

.btn.danger {
  color: var(--vscode-errorForeground);
  border-color: color-mix(in srgb, var(--vscode-errorForeground) 25%, var(--vscode-panel-border));
}

.btn.danger:hover {
  background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
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
