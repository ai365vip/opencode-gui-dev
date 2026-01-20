<template>
  <div :class="resultClasses">
    <div class="result-message-label">{{ label }}</div>
    <div v-if="content" class="result-message-content">
      {{ content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';

interface Props {
  message: Message;
  context?: ToolContext; // MessageRenderer 会传递，需声明以避免渲染到 DOM
}

const props = defineProps<Props>();

const label = computed(() => {
  return props.message.is_error ? 'Error' : 'Completed';
});

const content = computed(() => {
  if (typeof props.message.message.content === 'string') {
    return props.message.message.content;
  }
  return '';
});

const resultClasses = computed(() => {
  const classes = ['result-message'];
  if (props.message.is_error) {
    classes.push('result-error');
  } else {
    classes.push('result-success');
  }
  return classes;
});
</script>

<style scoped>
.result-message {
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
}

.result-success {
  background-color: var(--vscode-inputValidation-infoBackground);
  border-left: 3px solid var(--vscode-testing-iconPassed);
}

.result-error {
  background-color: var(--vscode-inputValidation-errorBackground);
  border-left: 3px solid var(--vscode-testing-iconFailed);
}

.result-message-label {
  font-weight: 600;
  margin-bottom: 4px;
}

.result-success .result-message-label {
  color: var(--vscode-testing-iconPassed);
}

.result-error .result-message-label {
  color: var(--vscode-testing-iconFailed);
}

.result-message-content {
  color: var(--vscode-editor-foreground);
  opacity: 0.8;
}
</style>
