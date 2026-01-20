<template>
  <Teleport to="body">
    <div v-if="isVisible" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog-container" @click.stop>
        <div class="dialog-header">
          <h2 class="dialog-title">模型管理</h2>
          <button class="close-button" @click="closeDialog" aria-label="关闭">
            <i class="codicon codicon-close" />
          </button>
        </div>

        <div class="dialog-body">
          <!-- 添加新模型表单 -->
          <!-- 模型列表 -->
          <div class="model-list">
            <div
              v-for="model in sortedModels"
              :key="model.id"
              class="model-item"
              :class="{ disabled: model.disabled }"
            >
              <div class="model-info">
                <div class="model-header">
                  <span class="model-label">{{ model.label }}</span>
                  <span v-if="model.disabled" class="disabled-badge">已禁用</span>
                </div>
                <div class="model-id">{{ model.value }}</div>
                <div v-if="model.description" class="model-description">
                  {{ model.description }}
                </div>
              </div>

              <div class="model-actions">
                <!-- 选择按钮 -->
                <button
                  v-if="!model.disabled && model.value !== currentModel"
                  class="action-btn select-btn"
                  title="选择此模型"
                  @click="handleSelectModel(model.value)"
                >
                  <i class="codicon codicon-check" />
                </button>

                <!-- 当前使用标识 -->
                <div v-if="model.value === currentModel" class="current-badge">
                  <i class="codicon codicon-check" />
                  当前使用
                </div>

                <!-- 启用/禁用按钮 -->
                <button
                  class="action-btn"
                  :title="model.disabled ? '启用' : '禁用'"
                  @click="handleToggleModel(model.value)"
                >
                  <i
                    :class="model.disabled ? 'codicon codicon-eye' : 'codicon codicon-eye-closed'"
                  />
                </button>
              </div>
            </div>
          </div>

          <!-- 添加模型按钮 -->
          <div class="add-model-button-container">
            <div class="text-xs opacity-60">模型列表来自 OpenCode 后端；仅支持禁用/启用。</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useModelManagement } from '../composables/useModelManagement';

interface Props {
  isVisible: boolean;
  currentModel?: string;
}

interface Emits {
  (e: 'close'): void;
  (e: 'select-model', modelId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { availableModels, toggleModelEnabled } = useModelManagement();

const currentModel = computed(() => props.currentModel || '');

const sortedModels = computed(() => {
  const models = availableModels.value || [];
  return [...models];
});

function closeDialog() {
  emit('close');
}

function handleToggleModel(modelValue: string) {
  const wasCurrent = currentModel.value === modelValue;
  toggleModelEnabled(modelValue);

  if (wasCurrent) {
    const model = availableModels.value.find((m) => m.value === modelValue);
    if (model?.disabled) {
      const nextEnabled = availableModels.value.find((m) => !m.disabled && m.value !== modelValue);
      if (nextEnabled) {
        emit('select-model', nextEnabled.value);
      }
    }
  }
}

function handleSelectModel(modelValue: string) {
  emit('select-model', modelValue);
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dialog-container {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.close-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--vscode-foreground);
  opacity: 0.7;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  opacity: 1;
}

.close-button i {
  font-size: 16px;
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.add-model-form {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 16px;
}

.form-header {
  margin-bottom: 12px;
}

.form-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-of-type {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--vscode-foreground);
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 3px;
  outline: none;
  font-family: inherit;
}

.form-input:focus {
  border-color: var(--vscode-focusBorder);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--vscode-input-background);
}

.error-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--vscode-errorForeground);
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  padding: 6px 14px;
  font-size: 13px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background-color 0.2s;
  font-family: inherit;
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--vscode-list-hoverBackground);
  border: 1px solid transparent;
  border-radius: 4px;
  transition: all 0.2s;
}

.model-item:hover {
  border-color: var(--vscode-focusBorder);
}

.model-item.disabled {
  opacity: 0.5;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.model-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.model-item.disabled {
  opacity: 0.6;
}

.disabled-badge {
  background: var(--vscode-inputValidation-warningBackground);
  color: var(--vscode-inputValidation-warningForeground);
}

.model-id {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 2px;
  font-family: var(--vscode-editor-font-family);
}

.model-description {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.8;
}

.model-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.action-btn {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--vscode-foreground);
  opacity: 0.7;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.action-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
}

.action-btn.select-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  opacity: 1;
}

.action-btn.select-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.action-btn.delete-btn:hover {
  color: var(--vscode-errorForeground);
}

.action-btn.confirm-delete-btn {
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-inputValidation-errorForeground);
  opacity: 1;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  animation: pulse 0.5s ease-in-out;
}

.action-btn.confirm-delete-btn:hover {
  background: var(--vscode-errorForeground);
  color: var(--vscode-errorBackground);
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.current-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: color-mix(in srgb, var(--vscode-charts-green) 20%, transparent);
  color: var(--vscode-charts-green);
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
}

.current-badge i {
  font-size: 12px;
}

.action-btn i {
  font-size: 14px;
}

.add-model-button-container {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--vscode-widget-border);
}

.add-model-btn {
  width: 100%;
  justify-content: center;
}
</style>
