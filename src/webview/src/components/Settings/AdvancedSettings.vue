<template>
  <div class="advanced-settings">
    <h3 class="section-title">高级配置</h3>
    <p class="section-desc">配置自定义系统提示、Git选项等高级功能</p>

    <!-- 自定义系统提示 -->
    <div class="setting-group">
      <div class="setting-header">
        <label class="setting-label">
          <span class="codicon codicon-edit"></span>
          自定义系统提示（Custom System Prompt）
        </label>
        <span class="badge-restart" title="保存后需重启会话生效">重启生效</span>
      </div>
      <p class="setting-desc">
        完全替换默认的系统提示。留空则使用默认提示。
      </p>
      <textarea
        v-model="customSystemPrompt"
        class="custom-input custom-textarea"
        placeholder="输入自定义系统提示..."
        rows="8"
        @input="markChanged"
      ></textarea>
    </div>

    <!-- 追加系统提示 -->
    <div class="setting-group">
      <div class="setting-header">
        <label class="setting-label">
          <span class="codicon codicon-add"></span>
          追加系统提示（Append System Prompt）
        </label>
        <span class="badge-restart" title="保存后需重启会话生效">重启生效</span>
      </div>
      <p class="setting-desc">
        在默认系统提示之后追加额外的指令。这不会替换默认提示。
      </p>
      <textarea
        v-model="appendSystemPrompt"
        class="custom-input custom-textarea"
        placeholder="输入要追加的提示..."
        rows="6"
        @input="markChanged"
      ></textarea>
    </div>

    <!-- Git 配置 -->
    <div class="setting-group">
      <div class="setting-header">
        <label class="setting-label">
          <span class="codicon codicon-git-commit"></span>
          Git 配置
        </label>
      </div>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            v-model="includeCoAuthoredBy"
            @change="markChanged"
          />
          <span>在 Git commit 中包含 Co-authored-by 标记</span>
        </label>
        <p class="checkbox-desc">
          启用后，Claude 生成的 commit 会包含 "Co-authored-by: Claude" 标记
        </p>
      </div>
    </div>

    <!-- 高级选项提示 -->
    <div class="info-box">
      <span class="codicon codicon-info"></span>
      <div>
        <p class="info-title">关于高级配置</p>
        <p class="info-desc">
          自定义系统提示会影响 Claude 的行为和回复风格。请谨慎修改，错误的配置可能导致功能异常。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useClaudeConfig } from '../../composables/useClaudeConfig'

const { config, loadConfig, updateConfig } = useClaudeConfig()

const customSystemPrompt = ref('')
const appendSystemPrompt = ref('')
const includeCoAuthoredBy = ref(false)

onMounted(() => {
  // 父组件已经加载config，直接使用即可
  if (config.value) {
    customSystemPrompt.value = config.value.customSystemPrompt || ''
    appendSystemPrompt.value = config.value.appendSystemPrompt || ''
    includeCoAuthoredBy.value = config.value.includeCoAuthoredBy || false
  }
})

watch(() => config.value, (newConfig) => {
  if (newConfig) {
    customSystemPrompt.value = newConfig.customSystemPrompt || ''
    appendSystemPrompt.value = newConfig.appendSystemPrompt || ''
    includeCoAuthoredBy.value = newConfig.includeCoAuthoredBy || false
  }
}, { deep: true })

function markChanged() {
  updateConfig({
    customSystemPrompt: customSystemPrompt.value || undefined,
    appendSystemPrompt: appendSystemPrompt.value || undefined,
    includeCoAuthoredBy: includeCoAuthoredBy.value
  })
}
</script>

<style scoped>
.advanced-settings {
  padding-bottom: 40px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
}

.section-desc {
  margin: 0 0 24px 0;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
}

.setting-group {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.setting-group:last-of-type {
  border-bottom: none;
}

.setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.setting-desc {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.custom-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
  font-family: var(--vscode-font-family);
}

.custom-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: var(--vscode-editor-font-family);
  line-height: 1.5;
}

.custom-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

.badge-restart {
  padding: 4px 8px;
  border-radius: 10px;
  background: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
  color: var(--vscode-badge-foreground, var(--vscode-button-foreground));
  font-size: 11px;
  font-weight: 600;
}

.checkbox-group {
  margin-top: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.checkbox-desc {
  margin: 8px 0 0 24px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.info-box {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 6px;
  background: var(--vscode-textBlockQuote-background, var(--vscode-editor-inactiveSelectionBackground));
  border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground);
}

.info-box .codicon {
  font-size: 20px;
  color: var(--vscode-notificationsInfoIcon-foreground);
  flex-shrink: 0;
  margin-top: 2px;
}

.info-title {
  margin: 0 0 6px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.info-desc {
  margin: 0;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}
</style>
