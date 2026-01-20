<template>
  <div class="card">
    <div class="card-header">
      <div class="card-title-row">
        <div class="card-title">{{ title }}</div>
        <div class="badge" :class="dirty ? 'badge-dirty' : 'badge-ok'">
          {{ dirty ? '未保存' : state.exists ? '已加载' : '未创建' }}
        </div>
      </div>
      <div class="card-desc">{{ description }}</div>
    </div>

    <div class="card-controls">
      <div v-if="allowProject" class="scope-toggle">
        <button
          class="scope-btn"
          :class="{ active: state.scope === 'user' }"
          :disabled="dirty"
          title="编辑用户配置（~/.config/opencode/）"
          @click="$emit('change-scope', 'user')"
        >
          用户
        </button>
        <button
          class="scope-btn"
          :class="{ active: state.scope === 'project' }"
          :disabled="dirty"
          title="编辑项目配置（.opencode/）"
          @click="$emit('change-scope', 'project')"
        >
          项目
        </button>
      </div>
      <div v-else class="scope-placeholder">范围：{{ scopeLabel }}</div>

      <div class="actions">
        <button class="btn" :disabled="state.loading" @click="$emit('reload')">
          {{ lazy && !state.isLoaded ? '加载' : '重载' }}
        </button>
        <button class="btn" :disabled="!state.isLoaded" @click="$emit('format')">格式化</button>
        <button class="btn" :disabled="!hasPath || !state.isLoaded" @click="$emit('open')">
          在编辑器打开
        </button>
        <button class="btn primary" :disabled="!dirty || state.saving" @click="$emit('save')">
          {{ state.saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div class="path-row" :title="state.path || ''">
      <span class="path-label">路径：</span>
      <span class="path-value" :class="{ muted: !state.path }">{{ state.path || '（未加载）' }}</span>
      <span class="path-meta">{{ savedHint }}</span>
    </div>

    <textarea
      class="editor"
      :value="state.content"
      :disabled="!canEdit"
      :placeholder="lazy && !state.isLoaded ? '点击“加载”后显示内容。' : ''"
      @focus="ensureLoaded"
      @input="handleInput"
    />

    <div v-if="state.error" class="error">
      <span class="codicon codicon-error" />
      <span class="error-text">{{ state.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type Scope = 'user' | 'project';

type EditorState = {
  scope: Scope;
  path: string;
  exists: boolean;
  isLoaded: boolean;
  loadedContent: string;
  content: string;
  loading: boolean;
  saving: boolean;
  error: string;
  lastSavedAt?: number;
};

const props = defineProps<{
  title: string;
  description: string;
  state: EditorState;
  allowProject?: boolean;
  lazy?: boolean;
}>();

const emit = defineEmits<{
  reload: [];
  save: [];
  format: [];
  open: [];
  'change-scope': [scope: Scope];
}>();

const dirty = computed(() => props.state.isLoaded && props.state.content !== props.state.loadedContent);
const hasPath = computed(() => !!String(props.state.path ?? '').trim());
const canEdit = computed(() => props.state.isLoaded && !props.state.loading);
const scopeLabel = computed(() => (props.state.scope === 'project' ? '项目' : '用户'));

const savedHint = computed(() => {
  if (!props.state.lastSavedAt) return '';
  const dt = new Date(props.state.lastSavedAt);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `已保存 ${hh}:${mm}:${ss}`;
});

function handleInput(e: Event) {
  const el = e.target as HTMLTextAreaElement | null;
  if (!el) return;
  props.state.content = el.value;
}

function ensureLoaded() {
  if (!props.lazy) return;
  if (props.state.isLoaded || props.state.loading) return;
  // 交给父组件触发加载（父组件掌握 connection 逻辑）
  emit('reload');
}
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

.scope-placeholder {
  font-size: 12px;
  opacity: 0.8;
  padding: 4px 0;
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
  font-size: 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  overflow: hidden;
}

.path-label {
  opacity: 0.8;
  flex-shrink: 0;
}

.path-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-family: var(--vscode-editor-font-family);
  opacity: 0.9;
}

.path-value.muted {
  opacity: 0.6;
}

.path-meta {
  opacity: 0.75;
  flex-shrink: 0;
}

.editor {
  width: 100%;
  min-height: 220px;
  max-height: 460px;
  resize: vertical;
  padding: 10px 12px;
  border: none;
  outline: none;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  line-height: 1.5;
}

.editor:disabled {
  opacity: 0.7;
  background: color-mix(in srgb, var(--vscode-editor-background) 85%, transparent);
}

.error {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  border-top: 1px solid var(--vscode-panel-border);
  color: var(--vscode-errorForeground);
  background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground) 35%, transparent);
}

.error-text {
  font-size: 12px;
  line-height: 1.4;
}
</style>
