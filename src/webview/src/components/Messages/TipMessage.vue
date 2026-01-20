<template>
  <div class="tip-message">
    <!-- 根据 block 类型展开渲染 -->
    <!-- Tip 消息都是纯文本内容，不需要 wrapper 和 context -->
    <template v-if="Array.isArray(message.message.content)">
      <ContentBlock
        v-for="(wrapper, index) in message.message.content"
        :key="index"
        :block="wrapper.content"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import ContentBlock from './ContentBlock.vue';

interface Props {
  message: Message;
  context?: ToolContext; // MessageRenderer 会传递，需声明以避免渲染到 DOM
}

defineProps<Props>();
</script>

<style scoped>
.tip-message {
  display: block;
  outline: none;
  padding: 4px 12px;
  background-color: var(--vscode-sideBar-background);
  opacity: 1;
}
</style>
