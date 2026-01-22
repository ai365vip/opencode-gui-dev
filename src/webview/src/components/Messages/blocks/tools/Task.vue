<template>
  <ToolMessageWrapper
    tool-icon="codicon-tasklist"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">Task</span>
      <span v-if="subagentType" class="agent-badge">{{ subagentType }}</span>
      <span v-if="description" class="description-text">{{ description }}</span>
      <span
        v-if="childSessionId"
        class="session-badge"
        :title="`Subagent session: ${childSessionId}`"
        >#{{ childSessionId }}</span
      >
      <button
        v-if="childSessionId"
        class="open-session-inline-btn"
        :disabled="isOpeningSession"
        @click.stop="openChildSession"
        title="Open subagent session"
      >
        Open
      </button>
    </template>

    <template #expandable>
      <!-- Prompt内容 -->
      <div v-if="prompt" class="prompt-section">
        <div class="section-header">
          <span class="codicon codicon-comment-discussion"></span>
          <span>Prompt</span>
        </div>
        <pre class="prompt-content">{{ prompt }}</pre>
      </div>

      <div v-if="childSessionId" class="session-section">
        <div class="section-header">
          <span class="codicon codicon-debug-stackframe"></span>
          <span>Subagent Session</span>
        </div>
        <div class="session-row">
          <span class="session-id">{{ childSessionId }}</span>
          <button
            class="open-session-btn"
            :disabled="isOpeningSession"
            @click="openChildSession"
            title="Open subagent session"
          >
            {{ isOpeningSession ? 'Opening...' : 'Open' }}
          </button>
        </div>
      </div>

      <div v-if="resultText" class="result-section">
        <div class="section-header">
          <span class="codicon codicon-output"></span>
          <span>Result</span>
        </div>
        <pre class="result-content">{{ resultText }}</pre>
      </div>

      <!-- 错误内容 -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import { RuntimeKey } from '@/composables/runtimeContext';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

const runtime = inject(RuntimeKey, null);
const isOpeningSession = ref(false);

// 子代理类型
const subagentType = computed(() => {
  return props.toolUse?.input?.subagent_type || props.toolUseResult?.subagent_type;
});

// 任务描述
const description = computed(() => {
  return props.toolUse?.input?.description || props.toolUseResult?.description;
});

// Prompt内容
const prompt = computed(() => {
  return props.toolUse?.input?.prompt || props.toolUseResult?.prompt;
});

function extractChildSessionId(text: string): string | undefined {
  const raw = String(text ?? '');
  if (!raw) return undefined;

  const meta =
    raw.match(/<task_metadata>[\s\S]*?session_id:\s*([^\s]+)[\s\S]*?<\/task_metadata>/i) ??
    raw.match(/session_id:\s*([^\s]+)/i);
  const id = meta?.[1] ? String(meta[1]).trim() : '';
  return id || undefined;
}

const childSessionId = computed(() => {
  const direct = String(
    props.toolUseResult?.sessionId ?? props.toolUseResult?.session_id ?? ''
  ).trim();
  if (direct) return direct;

  const fromToolUse = String(
    props.toolUse?.input?.sessionId ?? props.toolUse?.input?.session_id ?? ''
  ).trim();
  if (fromToolUse) return fromToolUse;

  const content = props.toolResult?.content;
  if (typeof content === 'string') {
    return extractChildSessionId(content);
  }

  return undefined;
});

const resultText = computed(() => {
  const raw = props.toolResult?.content;
  if (raw == null) return '';

  const text =
    typeof raw === 'string'
      ? raw
      : (() => {
          try {
            return JSON.stringify(raw, null, 2);
          } catch {
            return String(raw);
          }
        })();

  return text.replace(/\n?<task_metadata>[\s\S]*?<\/task_metadata>\n?/i, '').trim();
});

async function openChildSession(): Promise<void> {
  const id = childSessionId.value;
  if (!id || !runtime || isOpeningSession.value) return;

  isOpeningSession.value = true;
  try {
    await runtime.sessionStore.openSessionById(id);
  } catch (e) {
    console.warn('[Task] open session failed:', e);
  } finally {
    isOpeningSession.value = false;
  }
}

// 判断是否为权限请求阶段
const isPermissionRequest = computed(() => {
  const hasToolUseResult = !!props.toolUseResult;
  const hasToolResult = !!props.toolResult && !props.toolResult.is_error;
  return !hasToolUseResult && !hasToolResult;
});

// 权限请求阶段默认展开,执行完成后不展开
const shouldExpand = computed(() => {
  // 权限请求阶段展开
  if (isPermissionRequest.value) return true;

  // 有错误时展开
  if (props.toolResult?.is_error) return true;

  return false;
});
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.agent-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background-color: color-mix(in srgb, var(--vscode-charts-orange) 20%, transparent);
  color: var(--vscode-charts-orange);
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 600;
  font-family: var(--vscode-editor-font-family);
}

.description-text {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: color-mix(in srgb, var(--vscode-foreground) 85%, transparent);
  font-style: italic;
}

.prompt-section {
  margin-bottom: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 0.85em;
  font-weight: 600;
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
}

.section-header .codicon {
  font-size: 14px;
}

.prompt-content {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  font-size: 0.85em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.session-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 18%, transparent);
  color: var(--vscode-charts-blue);
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 600;
  font-family: var(--vscode-editor-font-family);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-section {
  margin-bottom: 12px;
}

.session-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
}

.session-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.open-session-btn {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--vscode-button-border, transparent);
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  font-size: 12px;
}

.open-session-btn:hover:enabled {
  background: var(--vscode-button-hoverBackground);
}

.open-session-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.open-session-inline-btn {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--vscode-button-border, transparent);
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  font-size: 12px;
}

.open-session-inline-btn:hover:enabled {
  background: var(--vscode-button-hoverBackground);
}

.open-session-inline-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.result-section {
  margin-bottom: 12px;
}

.result-content {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  font-size: 0.85em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
