<template>
  <div class="opencode-files-settings">
    <h3 class="section-title">OpenCode 配置</h3>
    <p class="section-desc">
      常用配置项提供表单化设置；保存后写入对应配置文件。其他高级字段可点击“在编辑器打开”手动编辑。<br />
      <strong>安全提示：</strong><code>auth.json</code> 可能包含密钥/令牌，请勿截图或分享。
    </p>

    <div class="cards">
      <OpencodeConfigCard />
      <AuthConfigCard />
    </div>
  </div>
</template>

<script setup lang="ts">
import AuthConfigCard from './AuthConfigCard.vue';
import OpencodeConfigCard from './OpencodeConfigCard.vue';
</script>

<style scoped>
.opencode-files-settings {
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
