<template>
  <svg
    :class="props.class"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="OpenCode"
  >
    <!-- Code brackets icon: </> -->
    <path
      d="M8 17l-4-5 4-5M16 7l4 5-4 5"
      stroke="var(--app-claude-clay-button-orange)"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
    <path
      d="M13 4l-2 16"
      stroke="var(--app-claude-clay-button-orange)"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  class?: string;
}

const props = defineProps<Props>();
</script>
