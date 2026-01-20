<template>
  <div v-if="errorContent" class="error-content">
    <span class="codicon codicon-error"></span>
    <span class="error-text">{{ errorContent }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  toolResult?: any;
}

const props = defineProps<Props>();

const errorContent = computed(() => {
  if (!props.toolResult || !props.toolResult.is_error) {
    return null;
  }

  // 提取错误内容
  const content = props.toolResult.content;

  // 1. 字符串类型：尝试解析 <tool_use_error> 标签，否则直接返回
  if (typeof content === 'string') {
    const match = content.match(/<tool_use_error>(.*?)<\/tool_use_error>/s);
    return match ? match[1].trim() : content;
  }

  // 2. 数组类型：提取所有文本内容
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text;
        return JSON.stringify(item);
      })
      .join('\n');
  }

  // 3. 对象类型：格式化为 JSON
  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  // 4. 未知类型：返回默认错误消息
  return 'Unknown error';
});
</script>

<style scoped>
.error-content {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--vscode-errorForeground);
}

.error-content .codicon {
  color: var(--vscode-charts-red);
  flex-shrink: 0;
  font-size: 12px;
  line-height: inherit;
}

.error-text {
  word-break: break-word;
}
</style>
