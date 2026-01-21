<template>
  <div class="ohmy-settings">
    <h3 class="section-title">oh-my-opencode</h3>
    <p class="section-desc">
      编辑 <code>oh-my-opencode.json</code>（Hooks / Agents 等）；保存后写入对应配置文件。更复杂字段可点击“在编辑器打开”手动维护。
    </p>

    <div class="cards">
      <OhMyConfigCard />
    </div>
  </div>
</template>

<script setup lang="ts">
import OhMyConfigCard from './OhMyConfigCard.vue';
</script>

<style scoped>
.ohmy-settings {
  padding: 20px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  opacity: 0.85;
  line-height: 1.5;
}

.cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
</style>

