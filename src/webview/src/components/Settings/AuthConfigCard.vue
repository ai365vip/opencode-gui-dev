<template>
  <div class="card">
    <div class="card-header">
      <div class="card-title-row">
        <div class="card-title">auth.json</div>
        <div class="badge badge-ok">敏感</div>
      </div>
      <div class="card-desc">认证信息（不在 WebView 内展示内容）</div>
    </div>

    <div class="card-controls">
      <div class="scope-placeholder">范围：用户</div>
      <div class="actions">
        <button class="btn" type="button" @click="openInEditor">在编辑器打开</button>
      </div>
    </div>

    <div class="path-row">
      <span class="path-label">路径：</span>
      <span class="path-value"><code>{{ authPathHint }}</code></span>
    </div>

    <div class="hint muted">
      <strong>安全提示：</strong>auth.json 可能包含密钥/令牌；请勿截图或分享。
    </div>

    <div v-if="error" class="error">
      <span class="codicon codicon-error"></span>
      <span class="error-text">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue';
import { RuntimeKey } from '../../composables/runtimeContext';

const runtime = inject(RuntimeKey);
if (!runtime) {
  throw new Error('[AuthConfigCard] Runtime not provided');
}

const authPathHint = '~/.local/share/opencode/auth.json';
const error = ref('');

async function openInEditor() {
  error.value = '';
  try {
    const conn = await runtime!.connectionManager.get();
    await conn.openConfigFile('auth');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
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

.hint {
  padding: 10px 12px 12px 12px;
  font-size: 12px;
  line-height: 1.4;
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
</style>
