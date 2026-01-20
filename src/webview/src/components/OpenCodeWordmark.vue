<template>
  <svg
    :class="props.class"
    width="172"
    height="24"
    viewBox="0 0 172 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="OpenCode"
  >
    <text
      x="0"
      y="17"
      font-size="18"
      font-weight="700"
      font-family="var(--vscode-font-family, system-ui, -apple-system, 'Segoe UI', sans-serif)"
    >
      <tspan fill="var(--app-claude-clay-button-orange)">Open</tspan>
      <tspan fill="var(--app-primary-foreground)">Code</tspan>
    </text>
  </svg>
</template>

<script setup lang="ts">
interface Props {
  class?: string;
}

const props = defineProps<Props>();
</script>
