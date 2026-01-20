<template>
  <ToolMessageWrapper
    tool-icon="codicon-eye-two"
    tool-name="Read"
    :tool-result="toolResult"
    :permission-state="permissionState"
    @allow="$emit('allow')"
    @deny="$emit('deny')"
  >
    <template #main>
      <span class="tool-label">{{ lineRangeLabel }}</span>
      <ToolFilePath
        v-if="filePath"
        :file-path="filePath"
        :context="context"
        :start-line="startLine"
        :end-line="endLine"
      />
    </template>

    <!-- 动态展开内容：仅在有错误时显示 -->
    <template v-if="toolResult" #expandable>
      <ToolError v-if="toolResult?.is_error" :tool-result="toolResult" />
      <div v-else class="read-view">
        <div v-if="filePath" class="read-file-header">
          <span class="codicon codicon-file file-icon" />
          <span class="file-name">{{ fileName }}</span>
          <span v-if="isTruncated" class="truncated-hint">已截断显示</span>
        </div>

        <div class="read-scroll-container">
          <div ref="lineNumbersRef" class="read-line-numbers">
            <div v-for="n in lineCount" :key="n" class="line-number-item">{{ n }}</div>
          </div>
          <div ref="contentRef" class="read-content" @scroll="handleContentScroll">
            <pre class="content-text">{{ displayText }}</pre>
          </div>
        </div>
      </div>
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import path from 'path-browserify-esm';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import ToolError from './common/ToolError.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
  permissionState?: string;
}

const props = defineProps<Props>();

const MAX_CHARS = 200_000;

defineEmits<{
  allow: [];
  deny: [];
}>();

const filePath = computed(() => {
  return (
    props.toolUse?.input?.file_path ||
    props.toolUse?.input?.path ||
    props.toolUse?.input?.filePath ||
    props.toolUse?.input?.notebook_path ||
    ''
  );
});

const fileName = computed(() => {
  if (!filePath.value) return '';
  return path.basename(filePath.value);
});

const offset = computed(() => {
  return props.toolUse?.input?.offset;
});

const limit = computed(() => {
  return props.toolUse?.input?.limit;
});

// 计算起始行号和结束行号（用于文件跳转和框选）
const startLine = computed(() => {
  return offset.value !== undefined ? offset.value + 1 : 1;
});

const endLine = computed(() => {
  if (offset.value !== undefined && limit.value !== undefined) {
    return offset.value + limit.value;
  } else if (limit.value !== undefined) {
    return limit.value;
  }
  return undefined;
});

const lineRangeLabel = computed(() => {
  if (offset.value !== undefined && limit.value !== undefined) {
    const start = offset.value + 1;
    const end = offset.value + limit.value;
    return `Read lines ${start}-${end}`;
  } else if (offset.value !== undefined) {
    return `Read from line ${offset.value + 1}`;
  } else if (limit.value !== undefined) {
    return `Read lines 1-${limit.value}`;
  } else {
    return 'Read';
  }
});

const resultText = computed(() => {
  const raw = props.toolResult?.content;
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
});

const isTruncated = computed(() => resultText.value.length > MAX_CHARS);

const displayText = computed(() => {
  if (!resultText.value) return '';
  if (!isTruncated.value) return resultText.value;
  return resultText.value.slice(0, MAX_CHARS) + '\n…(truncated)';
});

const lineCount = computed(() => {
  if (!displayText.value) return 0;
  return displayText.value.split('\n').length;
});

const lineNumbersRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();

function handleContentScroll() {
  if (lineNumbersRef.value && contentRef.value) {
    lineNumbersRef.value.scrollTop = contentRef.value.scrollTop;
  }
}
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.read-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: 0.5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

.read-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  flex-shrink: 0;
}

.file-icon {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.9;
}

.file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.truncated-hint {
  margin-left: auto;
  font-size: 0.85em;
  opacity: 0.7;
}

.read-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

.read-line-numbers {
  width: 50px;
  flex-shrink: 0;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
  border-right: 1px solid var(--vscode-panel-border);
}

.line-number-item {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  text-align: right;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

.read-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

.read-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.read-content::-webkit-scrollbar-track {
  background: transparent;
}

.read-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.read-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.read-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.read-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.read-content::-webkit-scrollbar-corner {
  background: transparent;
}

.content-text {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  line-height: 22px;
  margin: 0;
  padding: 0 8px 0 4px;
  white-space: pre;
  min-width: 100%;
  width: fit-content;
}
</style>
