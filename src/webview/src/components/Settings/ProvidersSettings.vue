<template>
  <div class="providers-settings">
    <h3 class="section-title">渠道 / Providers</h3>
    <p class="section-desc">
      管理 OpenCode Provider 渠道（baseURL、模型白/黑名单、模型覆盖等）。API Key 会写入全局
      <code>auth.json</code>。
    </p>

    <div class="scope-selector">
      <label class="scope-label">配置范围:</label>
      <div class="scope-buttons">
        <button
          :class="['scope-btn', { active: configScope === 'user' }]"
          @click="setScope('user')"
        >
          <span class="codicon codicon-home"></span>
          全局配置
        </button>
        <button
          :class="['scope-btn', { active: configScope === 'project' }]"
          @click="setScope('project')"
        >
          <span class="codicon codicon-folder"></span>
          项目配置
        </button>
      </div>
    </div>

    <div class="action-row">
      <button class="btn-action" :disabled="state.loading" @click="reload">
        <span class="codicon codicon-refresh"></span>
        重载
      </button>
      <button class="btn-action" :disabled="!state.isLoaded" @click="openConfigInEditor">
        <span class="codicon codicon-go-to-file"></span>
        在编辑器打开
      </button>
      <button class="btn-action primary" @click="openAddDialog">
        <span class="codicon codicon-add"></span>
        添加渠道
      </button>
    </div>

    <div v-if="state.isLoaded && state.path" class="path-row">
      <span class="path-label">配置文件:</span>
      <span class="path-value"><code>{{ state.path }}</code></span>
      <span v-if="!state.exists" class="badge badge-warn">未创建</span>
    </div>

    <div v-if="state.loading" class="loading-state">
      <span class="codicon codicon-loading codicon-modifier-spin"></span>
      <span>正在加载配置…</span>
    </div>

    <div v-else-if="state.parseError" class="error-state">
      <span class="codicon codicon-error"></span>
      <span class="error-text">配置文件解析失败：{{ state.parseError }}</span>
      <div class="error-actions">
        <button class="btn-action" :disabled="!state.isLoaded" @click="openConfigInEditor">
          在编辑器修复
        </button>
        <button class="btn-action" :disabled="state.loading" @click="reload">重载</button>
      </div>
    </div>

    <div v-else>
      <div v-if="providerRows.length > 0" class="providers-list">
        <div v-for="p in providerRows" :key="p.id" class="provider-card">
          <div class="provider-header">
            <div class="provider-title">
              <span class="codicon codicon-cloud"></span>
              <span class="provider-id">{{ p.id }}</span>
              <span v-if="p.name" class="provider-name">{{ p.name }}</span>
            </div>

            <div class="provider-badges">
              <span v-if="p.baseURL" class="badge">baseURL</span>
              <span v-if="p.modelFilterMode !== 'none'" class="badge">
                {{ p.modelFilterMode === 'whitelist' ? '白名单' : '黑名单' }} ({{
                  p.modelFilterCount
                }})
              </span>
              <span v-if="p.customModelCount > 0" class="badge"
                >模型覆盖 ({{ p.customModelCount }})</span
              >
            </div>

            <div class="provider-actions">
              <button class="icon-btn" title="编辑" @click="openEditDialog(p.id)">
                <span class="codicon codicon-edit"></span>
              </button>
              <button class="icon-btn danger" title="删除" @click="removeProvider(p.id)">
                <span class="codicon codicon-trash"></span>
              </button>
            </div>
          </div>

          <div class="provider-details">
            <div class="detail-row">
              <span class="detail-label">baseURL:</span>
              <code class="detail-value">{{ p.baseURL || '（未设置）' }}</code>
            </div>
            <div class="detail-row">
              <span class="detail-label">可用模型:</span>
              <span class="detail-value">{{ p.availableModelCount }} 个</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <span class="codicon codicon-inbox"></span>
        <p class="empty-title">尚未配置任何 Provider</p>
        <p class="empty-desc">点击“添加渠道”创建 provider 配置（baseURL、模型过滤等）。</p>
      </div>
    </div>

    <div v-if="dialog.open" class="dialog-overlay" @click="closeDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h4>{{ dialog.mode === 'edit' ? '编辑' : '添加' }} Provider</h4>
          <button class="close-btn" @click="closeDialog">
            <span class="codicon codicon-close"></span>
          </button>
        </div>

        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">Provider ID</label>
            <input
              v-model="dialog.providerId"
              class="form-input"
              :disabled="dialog.mode === 'edit'"
              list="provider-id-list"
              placeholder="例如：anthropic / openai / openrouter / github-copilot"
            />
            <datalist id="provider-id-list">
              <option v-for="id in availableProviderIds" :key="id" :value="id"></option>
            </datalist>
            <div class="form-hint muted">
              提示：API Key 会写入全局 auth.json，与这里的范围无关。
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">显示名称（可选）</label>
              <input v-model="dialog.name" class="form-input" placeholder="例如：OpenAI Proxy" />
              <div class="form-hint"><code>provider.&lt;id&gt;.name</code></div>
            </div>

            <div class="form-group">
              <label class="form-label">API（可选）</label>
              <input
                v-model="dialog.api"
                class="form-input"
                placeholder="例如：https://api.openai.com/v1"
              />
              <div class="form-hint">
                <code>provider.&lt;id&gt;.api</code>（用于模型 api.url 默认值）
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">baseURL（可选）</label>
              <input
                v-model="dialog.baseURL"
                class="form-input"
                placeholder="例如：https://your-proxy.example.com/v1"
              />
              <div class="form-hint"><code>provider.&lt;id&gt;.options.baseURL</code></div>
            </div>

            <div class="form-group">
              <label class="form-label">timeout（可选）</label>
              <div class="timeout-row">
                <select v-model="dialog.timeoutMode" class="form-select">
                  <option value="default">默认</option>
                  <option value="ms">毫秒</option>
                  <option value="off">关闭</option>
                </select>
                <input
                  v-if="dialog.timeoutMode === 'ms'"
                  v-model="dialog.timeoutMs"
                  class="form-input"
                  inputmode="numeric"
                  placeholder="300000"
                />
              </div>
              <div class="form-hint"><code>provider.&lt;id&gt;.options.timeout</code></div>
            </div>

            <div class="form-group">
              <label class="form-label">setCacheKey</label>
              <label class="checkbox-row">
                <input type="checkbox" v-model="dialog.setCacheKey" />
                <span>启用 promptCacheKey</span>
              </label>
              <div class="form-hint"><code>provider.&lt;id&gt;.options.setCacheKey</code></div>
            </div>

            <div class="form-group">
              <label class="form-label">API Key（写入 auth.json）</label>
              <div class="key-row">
                <input
                  v-model="dialog.apiKeyInput"
                  type="password"
                  class="form-input"
                  placeholder="输入后点击保存（不会回显已有 Key）"
                />
                <button
                  class="btn-action"
                  :disabled="dialog.keySaving || !dialog.apiKeyInput.trim()"
                  @click="saveApiKey"
                >
                  保存
                </button>
                <button
                  class="btn-action danger"
                  :disabled="dialog.keySaving || !dialog.keyExists"
                  @click="clearApiKey"
                >
                  清除
                </button>
              </div>
              <div class="form-hint">
                状态：
                <span v-if="dialog.keyError" class="error-inline">{{ dialog.keyError }}</span>
                <template v-else>
                  <span v-if="dialog.keyExists">已设置（{{ dialog.authType || 'unknown' }}）</span>
                  <span v-else>未设置</span>
                </template>
              </div>
            </div>
          </div>

          <div class="subsection">
            <div class="subsection-title">模型过滤（白名单 / 黑名单）</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">过滤模式</label>
                <select v-model="dialog.modelFilterMode" class="form-select">
                  <option value="none">不限制</option>
                  <option value="whitelist">白名单（只保留选中）</option>
                  <option value="blacklist">黑名单（禁用选中）</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">搜索模型</label>
                <input
                  v-model="dialog.modelQuery"
                  class="form-input"
                  placeholder="输入关键字过滤"
                />
              </div>
            </div>

            <div v-if="filteredModelsForProvider.length > 0" class="model-grid">
              <label v-for="m in filteredModelsForProvider" :key="m" class="model-item">
                <input
                  type="checkbox"
                  :checked="dialog.modelIds.includes(m)"
                  @change="toggleModelId(m, ($event.target as HTMLInputElement).checked)"
                />
                <code>{{ m }}</code>
              </label>
            </div>
            <div v-else class="empty-hint">
              未获取到该 provider 的模型列表（可先启动 OpenCode server 再重载）。
            </div>

            <div class="pill-row">
              <button class="btn-action" type="button" @click="selectAllModels">全选</button>
              <button class="btn-action" type="button" @click="clearModels">清空</button>
            </div>
          </div>

          <details class="subsection">
            <summary class="subsection-title">模型覆盖 / 自定义模型（高级）</summary>
            <div class="hint muted">
              这里会写入 <code>provider.&lt;id&gt;.models</code>。用于新增或覆盖模型元数据（如
              context/output、API SDK 包）。
            </div>

            <div v-if="dialog.customModels.length > 0" class="custom-models">
              <div
                v-for="(cm, idx) in dialog.customModels"
                :key="cm.modelId + idx"
                class="custom-model-card"
              >
                <div class="custom-model-header">
                  <code class="custom-model-id">{{ cm.modelId || '（未命名）' }}</code>
                  <button class="icon-btn danger" title="删除模型" @click="removeCustomModel(idx)">
                    <span class="codicon codicon-trash"></span>
                  </button>
                </div>

                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">modelId</label>
                    <input
                      v-model="cm.modelId"
                      class="form-input"
                      placeholder="例如：gpt-4o-mini"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">display name（可选）</label>
                    <input v-model="cm.name" class="form-input" placeholder="例如：GPT-4o Mini" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">api.id（可选）</label>
                    <input v-model="cm.apiId" class="form-input" placeholder="例如：gpt-4o-mini" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">api npm（可选）</label>
                    <input
                      v-model="cm.sdkNpm"
                      class="form-input"
                      placeholder="@ai-sdk/openai-compatible"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">context（可选）</label>
                    <input
                      v-model="cm.context"
                      class="form-input"
                      inputmode="numeric"
                      placeholder="128000"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">output（可选）</label>
                    <input
                      v-model="cm.output"
                      class="form-input"
                      inputmode="numeric"
                      placeholder="4096"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="empty-hint">未配置模型覆盖。</div>

            <div class="pill-row">
              <button class="btn-action" type="button" @click="addCustomModel">
                <span class="codicon codicon-add"></span>
                添加模型
              </button>
            </div>
          </details>
          <div v-if="dialog.error" class="error-state">
            <span class="codicon codicon-error"></span>
            <span class="error-text">{{ dialog.error }}</span>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialog">取消</button>
          <button class="btn-primary" :disabled="dialog.saving" @click="saveProviderConfig">
            {{ dialog.saving ? '保存中…' : '保存渠道配置' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { applyEdits, modify, parse } from 'jsonc-parser';
import { RuntimeKey } from '../../composables/runtimeContext';
import { useModelManagement } from '../../composables/useModelManagement';

type Scope = 'user' | 'project';

type ConfigState = {
  path: string;
  exists: boolean;
  isLoaded: boolean;
  loading: boolean;
  parseError: string;
  error: string;
  sourceText: string;
  parsed: any;
};

type ProviderRow = {
  id: string;
  name: string;
  baseURL: string;
  modelFilterMode: 'none' | 'whitelist' | 'blacklist';
  modelFilterCount: number;
  availableModelCount: number;
  customModelCount: number;
};

type CustomModel = {
  modelId: string;
  name: string;
  apiId: string;
  sdkNpm: string;
  context: string;
  output: string;
};

const runtime = inject(RuntimeKey);
if (!runtime) {
  throw new Error('[ProvidersSettings] Runtime not provided');
}

const { availableModels } = useModelManagement();

const configScope = ref<Scope>('user');

const state = reactive<ConfigState>({
  path: '',
  exists: false,
  isLoaded: false,
  loading: false,
  parseError: '',
  error: '',
  sourceText: '',
  parsed: {}
});

const modelsByProvider = computed(() => {
  const out = new Map<string, string[]>();
  const models = Array.isArray(availableModels.value) ? availableModels.value : [];

  for (const m of models) {
    const full = String(m?.value ?? '').trim();
    if (!full) continue;
    const parts = full.split('/');
    const providerId = parts[0]?.trim();
    const modelId = parts.slice(1).join('/').trim();
    if (!providerId || !modelId) continue;

    const existing = out.get(providerId) ?? [];
    existing.push(modelId);
    out.set(providerId, existing);
  }

  for (const [k, v] of out.entries()) {
    v.sort((a, b) => a.localeCompare(b));
    out.set(k, Array.from(new Set(v)));
  }

  return out;
});

const availableProviderIds = computed(() => {
  return Array.from(modelsByProvider.value.keys()).sort((a, b) => a.localeCompare(b));
});

const providerRows = computed<ProviderRow[]>(() => {
  const providers = state.parsed?.provider;
  const entries =
    providers && typeof providers === 'object' && !Array.isArray(providers)
      ? (Object.entries(providers) as Array<[string, any]>)
      : [];

  return entries
    .map(([id, cfg]) => {
      const name = typeof cfg?.name === 'string' ? cfg.name : '';
      const baseURL = typeof cfg?.options?.baseURL === 'string' ? cfg.options.baseURL : '';

      const whitelist = asStringArray(cfg?.whitelist);
      const blacklist = asStringArray(cfg?.blacklist);
      const modelFilterMode: ProviderRow['modelFilterMode'] =
        whitelist.length > 0 ? 'whitelist' : blacklist.length > 0 ? 'blacklist' : 'none';
      const modelFilterCount =
        modelFilterMode === 'whitelist' ? whitelist.length : blacklist.length;

      const availableModelCount = (modelsByProvider.value.get(id) ?? []).length;
      const customModelCount =
        cfg?.models && typeof cfg.models === 'object' && !Array.isArray(cfg.models)
          ? Object.keys(cfg.models).length
          : 0;

      return {
        id,
        name,
        baseURL,
        modelFilterMode,
        modelFilterCount,
        availableModelCount,
        customModelCount
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
});

const dialog = reactive<{
  open: boolean;
  mode: 'add' | 'edit';
  saving: boolean;
  providerId: string;
  name: string;
  api: string;
  baseURL: string;
  timeoutMode: 'default' | 'ms' | 'off';
  timeoutMs: string;
  setCacheKey: boolean;
  modelFilterMode: 'none' | 'whitelist' | 'blacklist';
  modelQuery: string;
  modelIds: string[];
  customModels: CustomModel[];
  originalCustomModelIds: string[];
  apiKeyInput: string;
  keySaving: boolean;
  keyExists: boolean;
  authType: string;
  keyError: string;
  error: string;
}>({
  open: false,
  mode: 'add',
  saving: false,
  providerId: '',
  name: '',
  api: '',
  baseURL: '',
  timeoutMode: 'default',
  timeoutMs: '',
  setCacheKey: false,
  modelFilterMode: 'none',
  modelQuery: '',
  modelIds: [],
  customModels: [],
  originalCustomModelIds: [],
  apiKeyInput: '',
  keySaving: false,
  keyExists: false,
  authType: '',
  keyError: '',
  error: ''
});

const filteredModelsForProvider = computed(() => {
  const providerId = String(dialog.providerId ?? '').trim();
  if (!providerId) return [];
  const models = modelsByProvider.value.get(providerId) ?? [];

  const query = String(dialog.modelQuery ?? '')
    .trim()
    .toLowerCase();
  if (!query) return models;
  return models.filter((m) => m.toLowerCase().includes(query));
});

function toggleModelId(modelId: string, checked: boolean) {
  const id = String(modelId ?? '').trim();
  if (!id) return;

  const current = new Set<string>(dialog.modelIds || []);
  if (checked) current.add(id);
  else current.delete(id);
  dialog.modelIds = Array.from(current.values()).sort((a, b) => a.localeCompare(b));
}

function selectAllModels() {
  dialog.modelIds = [...filteredModelsForProvider.value];
}

function clearModels() {
  dialog.modelIds = [];
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
    // 空文档：删除操作直接返回一个最小对象；写入操作基于最小对象进行 modify
    if (value === undefined) {
      return original || '{\n}\n';
    }
    const base = typeof jsonPath[0] === 'number' ? '[\n]\n' : '{\n}\n';
    return apply(base);
  }

  try {
    return apply(original);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (value === undefined && /delete in empty document/i.test(msg)) {
      return original || '{\n}\n';
    }
    throw err;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v: unknown) => String(v)) : [];
}

async function loadConfig(opts?: { silent?: boolean }) {
  if (state.loading) return;

  state.loading = true;
  if (!opts?.silent) state.error = '';
  state.parseError = '';

  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.getOpencodeConfigFile('opencode', configScope.value);
    if (resp?.type !== 'get_opencode_config_file_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
    }

    state.path = String(resp.path ?? '');
    state.exists = !!resp.exists;
    state.sourceText = String(resp.content ?? '');
    state.isLoaded = true;
    state.error = String(resp.error ?? '');

    const { obj, error } = parseJsoncObject(state.sourceText);
    state.parsed = obj;
    state.parseError = error;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.loading = false;
  }
}

async function saveRawConfig(text: string) {
  const conn = await runtime!.connectionManager.get();
  const resp = await conn.saveOpencodeConfigFile('opencode', text, configScope.value);
  if (resp?.type !== 'save_opencode_config_file_response') {
    throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
  }
  if (!resp.success) {
    throw new Error(String(resp.error ?? '保存失败'));
  }
  if (typeof resp.path === 'string') state.path = resp.path;
  state.exists = true;
  state.sourceText = text;
  const { obj, error } = parseJsoncObject(state.sourceText);
  state.parsed = obj;
  state.parseError = error;
}

async function reload() {
  await loadConfig();
}

async function setScope(scope: Scope) {
  if (dialog.open) {
    const ok = window.confirm('当前正在编辑 Provider，切换范围会关闭对话框，是否继续？');
    if (!ok) return;
    closeDialog();
  }

  configScope.value = scope;
  await loadConfig({ silent: true });
}

async function openConfigInEditor() {
  if (!state.isLoaded) {
    await loadConfig();
  }
  if (!state.path) return;

  try {
    if (!state.exists) {
      const ok = window.confirm('配置文件尚未创建，是否先创建并打开？');
      if (!ok) return;
      await saveRawConfig(state.sourceText || '{\n}\n');
    }

    const conn = await runtime!.connectionManager.get();
    await conn.openFile(state.path);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
}

function openAddDialog() {
  dialog.open = true;
  dialog.mode = 'add';
  dialog.saving = false;
  dialog.providerId = '';
  dialog.name = '';
  dialog.api = '';
  dialog.baseURL = '';
  dialog.timeoutMode = 'default';
  dialog.timeoutMs = '';
  dialog.setCacheKey = false;
  dialog.modelFilterMode = 'none';
  dialog.modelQuery = '';
  dialog.modelIds = [];
  dialog.customModels = [];
  dialog.originalCustomModelIds = [];
  dialog.apiKeyInput = '';
  dialog.keySaving = false;
  dialog.keyExists = false;
  dialog.authType = '';
  dialog.keyError = '';
  dialog.error = '';
}

async function refreshAuthStatus() {
  dialog.keyError = '';
  dialog.keyExists = false;
  dialog.authType = '';

  const providerId = String(dialog.providerId ?? '').trim();
  if (!providerId) return;

  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.getOpencodeAuthStatus(providerId);
    if (resp?.type !== 'get_opencode_auth_status_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
    }

    if (resp.error) {
      dialog.keyError = String(resp.error);
      return;
    }

    dialog.keyExists = !!resp.exists;
    dialog.authType = typeof resp.authType === 'string' ? resp.authType : '';
  } catch (err) {
    dialog.keyError = err instanceof Error ? err.message : String(err);
  }
}

async function openEditDialog(providerId: string) {
  const id = String(providerId ?? '').trim();
  if (!id) return;

  dialog.open = true;
  dialog.mode = 'edit';
  dialog.saving = false;
  dialog.providerId = id;
  dialog.apiKeyInput = '';
  dialog.keySaving = false;
  dialog.keyExists = false;
  dialog.authType = '';
  dialog.keyError = '';
  dialog.error = '';
  dialog.modelQuery = '';

  const cfg = state.parsed?.provider?.[id] ?? {};
  dialog.name = typeof cfg?.name === 'string' ? cfg.name : '';
  dialog.api = typeof cfg?.api === 'string' ? cfg.api : '';
  dialog.baseURL = typeof cfg?.options?.baseURL === 'string' ? cfg.options.baseURL : '';

  const timeout = cfg?.options?.timeout;
  if (timeout === false) {
    dialog.timeoutMode = 'off';
    dialog.timeoutMs = '';
  } else if (typeof timeout === 'number' && Number.isFinite(timeout)) {
    dialog.timeoutMode = 'ms';
    dialog.timeoutMs = String(timeout);
  } else {
    dialog.timeoutMode = 'default';
    dialog.timeoutMs = '';
  }

  dialog.setCacheKey = cfg?.options?.setCacheKey === true;

  const whitelist = asStringArray(cfg?.whitelist);
  const blacklist = asStringArray(cfg?.blacklist);
  if (whitelist.length > 0) {
    dialog.modelFilterMode = 'whitelist';
    dialog.modelIds = Array.from(new Set(whitelist.filter(Boolean))).sort((a: string, b: string) =>
      a.localeCompare(b)
    );
  } else if (blacklist.length > 0) {
    dialog.modelFilterMode = 'blacklist';
    dialog.modelIds = Array.from(new Set(blacklist.filter(Boolean))).sort((a: string, b: string) =>
      a.localeCompare(b)
    );
  } else {
    dialog.modelFilterMode = 'none';
    dialog.modelIds = [];
  }

  const modelsObj = cfg?.models;
  const modelEntries =
    modelsObj && typeof modelsObj === 'object' && !Array.isArray(modelsObj)
      ? (Object.entries(modelsObj) as Array<[string, any]>)
      : [];

  dialog.customModels = modelEntries.map(([modelId, modelCfg]) => {
    const name = typeof modelCfg?.name === 'string' ? modelCfg.name : '';
    const apiId = typeof modelCfg?.id === 'string' ? modelCfg.id : '';
    const sdkNpm = typeof modelCfg?.provider?.npm === 'string' ? modelCfg.provider.npm : '';
    const context =
      typeof modelCfg?.limit?.context === 'number' && Number.isFinite(modelCfg.limit.context)
        ? String(modelCfg.limit.context)
        : '';
    const output =
      typeof modelCfg?.limit?.output === 'number' && Number.isFinite(modelCfg.limit.output)
        ? String(modelCfg.limit.output)
        : '';

    return { modelId, name, apiId, sdkNpm, context, output };
  });

  dialog.originalCustomModelIds = dialog.customModels.map((m) => m.modelId).filter(Boolean);

  await refreshAuthStatus();
}

function closeDialog() {
  dialog.open = false;
}

async function saveApiKey() {
  const providerId = String(dialog.providerId ?? '').trim();
  const apiKey = String(dialog.apiKeyInput ?? '').trim();
  if (!providerId || !apiKey) return;

  dialog.keySaving = true;
  dialog.keyError = '';
  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.setOpencodeAuthApiKey(providerId, apiKey);
    if (resp?.type !== 'set_opencode_auth_api_key_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
    }
    if (!resp.success) {
      throw new Error(String(resp.error ?? '保存失败'));
    }

    dialog.apiKeyInput = '';
    await refreshAuthStatus();
  } catch (err) {
    dialog.keyError = err instanceof Error ? err.message : String(err);
  } finally {
    dialog.keySaving = false;
  }
}

async function clearApiKey() {
  const ok = window.confirm('确认清除该 provider 的 API Key（auth.json）？');
  if (!ok) return;

  const providerId = String(dialog.providerId ?? '').trim();
  if (!providerId) return;

  dialog.keySaving = true;
  dialog.keyError = '';
  try {
    const conn = await runtime!.connectionManager.get();
    const resp = await conn.setOpencodeAuthApiKey(providerId, '');
    if (resp?.type !== 'set_opencode_auth_api_key_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`);
    }
    if (!resp.success) {
      throw new Error(String(resp.error ?? '清除失败'));
    }

    dialog.apiKeyInput = '';
    await refreshAuthStatus();
  } catch (err) {
    dialog.keyError = err instanceof Error ? err.message : String(err);
  } finally {
    dialog.keySaving = false;
  }
}

function addCustomModel() {
  dialog.customModels.push({
    modelId: '',
    name: '',
    apiId: '',
    sdkNpm: '',
    context: '',
    output: ''
  });
}

function removeCustomModel(index: number) {
  if (index < 0 || index >= dialog.customModels.length) return;
  dialog.customModels.splice(index, 1);
}

async function saveProviderConfig() {
  if (dialog.saving) return;
  dialog.error = '';

  const providerId = String(dialog.providerId ?? '').trim();
  if (!providerId) {
    dialog.error = 'providerId 不能为空';
    return;
  }

  if (state.parseError) {
    dialog.error = '当前配置文件解析失败，请先在编辑器修复。';
    return;
  }

  const modelFilterMode = dialog.modelFilterMode;
  const modelIds = Array.from(new Set((dialog.modelIds || []).map(String).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );
  if (
    (modelFilterMode === 'whitelist' || modelFilterMode === 'blacklist') &&
    modelIds.length === 0
  ) {
    dialog.error = '已选择模型过滤模式，但未选择任何模型。';
    return;
  }

  const customModels = dialog.customModels
    .map((m) => ({
      modelId: String(m.modelId ?? '').trim(),
      name: String(m.name ?? '').trim(),
      apiId: String(m.apiId ?? '').trim(),
      sdkNpm: String(m.sdkNpm ?? '').trim(),
      context: String(m.context ?? '').trim(),
      output: String(m.output ?? '').trim()
    }))
    .filter((m) => m.modelId);

  const customModelIdSet = new Set<string>();
  for (const m of customModels) {
    if (customModelIdSet.has(m.modelId)) {
      dialog.error = `模型 ID 重复：${m.modelId}`;
      return;
    }
    customModelIdSet.add(m.modelId);
  }

  dialog.saving = true;

  try {
    let next = state.sourceText;

    const name = String(dialog.name ?? '').trim();
    const api = String(dialog.api ?? '').trim();
    const baseURL = String(dialog.baseURL ?? '').trim();

    next = applyModify(next, ['provider', providerId, 'name'], name ? name : undefined);
    next = applyModify(next, ['provider', providerId, 'api'], api ? api : undefined);
    next = applyModify(
      next,
      ['provider', providerId, 'options', 'baseURL'],
      baseURL ? baseURL : undefined
    );

    const setCacheKey = dialog.setCacheKey === true ? true : undefined;
    next = applyModify(next, ['provider', providerId, 'options', 'setCacheKey'], setCacheKey);

    if (dialog.timeoutMode === 'off') {
      next = applyModify(next, ['provider', providerId, 'options', 'timeout'], false);
    } else if (dialog.timeoutMode === 'ms') {
      const n = Number.parseInt(String(dialog.timeoutMs ?? '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('timeout 必须是正整数（毫秒）');
      }
      next = applyModify(next, ['provider', providerId, 'options', 'timeout'], n);
    } else {
      next = applyModify(next, ['provider', providerId, 'options', 'timeout'], undefined);
    }

    if (modelFilterMode === 'whitelist') {
      next = applyModify(next, ['provider', providerId, 'whitelist'], modelIds);
      next = applyModify(next, ['provider', providerId, 'blacklist'], undefined);
    } else if (modelFilterMode === 'blacklist') {
      next = applyModify(next, ['provider', providerId, 'blacklist'], modelIds);
      next = applyModify(next, ['provider', providerId, 'whitelist'], undefined);
    } else {
      next = applyModify(next, ['provider', providerId, 'whitelist'], undefined);
      next = applyModify(next, ['provider', providerId, 'blacklist'], undefined);
    }

    const removed = (dialog.originalCustomModelIds || []).filter((id) => !customModelIdSet.has(id));
    for (const mid of removed) {
      next = applyModify(next, ['provider', providerId, 'models', mid], undefined);
    }

    for (const cm of customModels) {
      next = applyModify(
        next,
        ['provider', providerId, 'models', cm.modelId, 'name'],
        cm.name || undefined
      );
      next = applyModify(
        next,
        ['provider', providerId, 'models', cm.modelId, 'id'],
        cm.apiId || undefined
      );
      next = applyModify(
        next,
        ['provider', providerId, 'models', cm.modelId, 'provider', 'npm'],
        cm.sdkNpm || undefined
      );

      const ctx = cm.context ? Number.parseInt(cm.context, 10) : NaN;
      const out = cm.output ? Number.parseInt(cm.output, 10) : NaN;
      next = applyModify(
        next,
        ['provider', providerId, 'models', cm.modelId, 'limit', 'context'],
        Number.isFinite(ctx) && ctx > 0 ? ctx : undefined
      );
      next = applyModify(
        next,
        ['provider', providerId, 'models', cm.modelId, 'limit', 'output'],
        Number.isFinite(out) && out > 0 ? out : undefined
      );
    }

    await saveRawConfig(next);
    dialog.open = false;
  } catch (err) {
    dialog.error = err instanceof Error ? err.message : String(err);
  } finally {
    dialog.saving = false;
  }
}

async function removeProvider(providerId: string) {
  const id = String(providerId ?? '').trim();
  if (!id) return;

  const ok = window.confirm(`确认删除 provider 配置：${id} ？（不会自动删除 auth.json 中的 Key）`);
  if (!ok) return;
  if (state.parseError) {
    state.error = '当前配置文件解析失败，请先在编辑器修复。';
    return;
  }

  try {
    let next = state.sourceText;
    next = applyModify(next, ['provider', id], undefined);
    await saveRawConfig(next);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
}

onMounted(async () => {
  await loadConfig();
});
</script>

<style scoped>
.providers-settings {
  padding-bottom: 40px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.scope-selector {
  margin-bottom: 20px;
  padding: 12px;
  border-radius: 4px;
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--vscode-panel-border);
}

.scope-label {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.scope-buttons {
  display: flex;
  gap: 8px;
}

.scope-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  border: 2px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scope-btn:hover {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-hoverBackground);
}

.scope-btn.active {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.scope-btn .codicon {
  font-size: 16px;
}

.action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 12px 0;
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

.badge-warn {
  background: color-mix(in srgb, var(--vscode-testing-iconFailed, #f14c4c) 18%, transparent);
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    opacity 0.15s;
}

.btn-action:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  border-color: var(--vscode-focusBorder);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action.primary {
  background: var(--vscode-button-background);
  border-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-action.primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
  border-color: var(--vscode-button-hoverBackground);
}

.btn-action.danger {
  color: var(--vscode-errorForeground);
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.05));
  font-size: 12px;
  color: var(--vscode-foreground);
}

.error-state {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 8px;
  padding: 12px;
  border-radius: 4px;
  background: var(--vscode-inputValidation-errorBackground, rgba(244, 135, 113, 0.1));
  border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
  color: var(--vscode-errorForeground);
  font-size: 12px;
}

.error-text {
  flex: 1;
  line-height: 1.4;
}

.error-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.providers-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.provider-card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  overflow: hidden;
}

.provider-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.05));
}

.provider-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.provider-id {
  font-family: var(--vscode-editor-font-family);
  font-size: 13px;
  font-weight: 600;
}

.provider-name {
  font-size: 12px;
  opacity: 0.8;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-badge-background, var(--vscode-button-secondaryBackground));
  color: var(--vscode-badge-foreground, var(--vscode-button-secondaryForeground));
}

.provider-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  opacity: 0.8;
  transition:
    background-color 0.15s,
    opacity 0.15s;
}

.icon-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.icon-btn.danger {
  color: var(--vscode-errorForeground);
}

.icon-btn.danger:hover {
  background: color-mix(in srgb, var(--vscode-errorForeground) 14%, transparent);
}

.provider-details {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.detail-label {
  min-width: 72px;
  opacity: 0.8;
}

.detail-value {
  font-family: var(--vscode-editor-font-family);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 12px;
  border: 1px dashed var(--vscode-panel-border);
  border-radius: 6px;
  color: var(--vscode-descriptionForeground);
  gap: 6px;
  text-align: center;
}

.empty-state .codicon {
  font-size: 24px;
  opacity: 0.6;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.empty-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.dialog-content {
  width: min(900px, 96vw);
  max-height: 90vh;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.dialog-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  opacity: 0.8;
  transition:
    background-color 0.15s,
    opacity 0.15s;
}

.close-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.dialog-body {
  padding: 16px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.form-input,
.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 12px;
  box-sizing: border-box;
}

.form-select option {
  background-color: var(--vscode-dropdown-background, var(--vscode-input-background)) !important;
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground)) !important;
}

.form-input:focus,
.form-select:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

.form-hint {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.4;
}

.muted {
  opacity: 0.8;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.timeout-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeout-row .form-select {
  width: 140px;
  flex-shrink: 0;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vscode-foreground);
}

.checkbox-row input {
  width: 14px;
  height: 14px;
}

.key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.key-row .form-input {
  flex: 1;
}

.error-inline {
  color: var(--vscode-errorForeground);
  font-weight: 600;
}

.subsection {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  padding: 12px;
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.04));
}

details.subsection {
  padding: 0;
  overflow: hidden;
  background: transparent;
}

details.subsection > summary {
  list-style: none;
  user-select: none;
  cursor: pointer;
  padding: 12px;
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.04));
}

details.subsection > summary::-webkit-details-marker {
  display: none;
}

details.subsection[open] > summary {
  border-bottom: 1px solid var(--vscode-panel-border);
}

details.subsection > *:not(summary) {
  padding: 12px;
}

.subsection-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.hint {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.model-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
  max-height: 220px;
  overflow: auto;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
}

.model-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.model-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.model-item input {
  width: 14px;
  height: 14px;
}

.empty-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.9;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.custom-models {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.custom-model-card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  padding: 10px;
}

.custom-model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.custom-model-id {
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  color: var(--vscode-foreground);
}

.dialog-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--vscode-panel-border);
}

.btn-secondary,
.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
