<template>
  <component
    :is="toolComponent"
    :tool-use="toolUse"
    :tool-result="toolResult"
    :tool-use-result="toolUseResult"
    :context="context"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { ToolUseContentBlock } from '../../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../../models/ContentBlockWrapper';
import type { ToolContext } from '../../../types/tool';

// 导入所有工具组件
import ReadTool from './tools/Read.vue';
import WriteTool from './tools/Write.vue';
import EditTool from './tools/Edit.vue';
import BashTool from './tools/Bash.vue';
import GlobTool from './tools/Glob.vue';
import GrepTool from './tools/Grep.vue';
import BashOutputTool from './tools/BashOutput.vue';
import ExitPlanModeTool from './tools/ExitPlanMode.vue';
import KillShellTool from './tools/KillShell.vue';
import McpTool from './tools/McpTool.vue';
import MultiEditTool from './tools/MultiEdit.vue';
import NotebookEditTool from './tools/NotebookEdit.vue';
import SlashCommandTool from './tools/SlashCommand.vue';
import TaskTool from './tools/Task.vue';
import TodoWriteTool from './tools/TodoWrite.vue';
import WebFetchTool from './tools/WebFetch.vue';
import WebSearchTool from './tools/WebSearch.vue';
import DefaultTool from './tools/Default.vue';

interface Props {
  block: ToolUseContentBlock;
  context?: ToolContext;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

function normalizeToolName(name: string): string {
  const raw = String(name ?? '').trim();
  if (!raw) return raw;
  if (raw.startsWith('mcp__')) return raw;

  // Already PascalCase (expected by existing tool components)
  if (/[A-Z]/.test(raw) && !raw.includes('_') && !raw.includes('-')) {
    return raw;
  }

  const key = raw.toLowerCase();
  const known: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    multiedit: 'MultiEdit',
    notebookedit: 'NotebookEdit',
    grep: 'Grep',
    glob: 'Glob',
    bash: 'Bash',
    bashoutput: 'BashOutput',
    killshell: 'KillShell',
    exitplanmode: 'ExitPlanMode',
    task: 'Task',
    todowrite: 'TodoWrite',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
    slashcommand: 'SlashCommand',
    'slash_command': 'SlashCommand',
    'slash-command': 'SlashCommand',
  };

  if (known[key]) return known[key];

  const words = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return raw;
  return words.map(w => w.slice(0, 1).toUpperCase() + w.slice(1)).join('');
}

// 🔥 使用 useSignal 包装 alien-signals，确保 Vue 可以追踪响应式变化
const toolResult = props.wrapper ? useSignal(props.wrapper.toolResult) : ref(undefined);

// 获取 tool use result（会话加载时的数据）
const toolUseResult = computed(() => {
  if (!props.wrapper) return undefined;
  return props.wrapper.toolUseResult;
});

// Tool 使用信息
const toolUse = computed(() => {
  return {
    name: normalizeToolName(props.block.name),
    input: props.block.input,
    id: props.block.id,
  };
});

// 根据工具名称选择对应的组件
const toolComponent = computed(() => {
  const name = normalizeToolName(props.block.name);

  // MCP 工具匹配（以 mcp__ 开头）
  if (name.startsWith('mcp__')) {
    return McpTool;
  }

  switch (name) {
    case 'Read':
      return ReadTool;
    case 'Write':
      return WriteTool;
    case 'Edit':
      return EditTool;
    case 'Bash':
      return BashTool;
    case 'Glob':
      return GlobTool;
    case 'Grep':
      return GrepTool;
    case 'BashOutput':
      return BashOutputTool;
    case 'ExitPlanMode':
      return ExitPlanModeTool;
    case 'KillShell':
      return KillShellTool;
    case 'MultiEdit':
      return MultiEditTool;
    case 'NotebookEdit':
      return NotebookEditTool;
    case 'SlashCommand':
      return SlashCommandTool;
    case 'Task':
      return TaskTool;
    case 'TodoWrite':
      return TodoWriteTool;
    case 'WebFetch':
      return WebFetchTool;
    case 'WebSearch':
      return WebSearchTool;
    default:
      return DefaultTool;
  }
});
</script>

<style scoped>
/* 工具块样式由各个具体工具组件自己管理 */
</style>
