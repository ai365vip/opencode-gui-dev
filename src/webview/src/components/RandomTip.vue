<template>
  <div class="empty-state-content">
    <ClawdIcon class="empty-mascot" />
    <p class="empty-state-message">{{ currentTip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ClawdIcon from './ClawdIcon.vue';

interface Props {
  platform: string;
}

const props = defineProps<Props>();

const tips = computed(() => {
  const platformKey = props.platform === 'windows' ? 'Alt' : 'Option';
  return [
    'What to do first? Ask about this codebase or we can start writing code.',
    "Ready to code?\nLet's write something worth deploying.",
    'Use the model dropdown to pick the right tool for the job.',
    'Create an AGENTS.md file so OpenCode can follow your project instructions every time.',
    'Tired of repeating yourself? Put your guidelines in AGENTS.md so OpenCode can reuse them.',
    `Highlight text and press ${platformKey} + K to chat about it.`,
    "One person's slop is another one's treasure.",
    "It's a beautiful day to use the computer, don't you think?",
    "You've come to the absolutely right place!",
    "Use OpenCode in the terminal to configure MCP servers.\nThey'll work here, too!"
  ];
});

const currentTip = ref(tips.value[0]);

onMounted(() => {
  // 随机选择一条提示
  const index = Math.floor(Math.random() * tips.value.length);
  currentTip.value = tips.value[index];
});
</script>

<style scoped>
.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 16px;
}

.empty-mascot {
  width: 47px;
  height: 38px;
}

.empty-state-message {
  margin: 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vscode-descriptionForeground);
  text-align: center;
  white-space: pre-line;
  max-width: 400px;
}
</style>
