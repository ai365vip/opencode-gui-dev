<template>
  <DropdownTrigger
    align="center"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="model-dropdown">
        <div class="dropdown-content">
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModelLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <!-- 可用模型列表 -->
      <DropdownItem
        v-for="(model, index) in enabledModels"
        :key="model.id"
        :item="{
          id: model.value,
          label: model.label,
          detail: model.description,
          checked: currentSelectedModel === model.value,
          type: 'model'
        }"
        :is-selected="currentSelectedModel === model.value"
        :index="index"
        @click="() => handleModelSelect(model.value, close)"
      />

      <!-- 管理模型按钮 -->
      <div class="dropdown-divider" />
      <DropdownItem
        :item="{
          id: 'manage-models',
          label: '管理模型...',
          type: 'action'
        }"
        :index="enabledModels.length"
        @click="() => { showManagementDialog = true; close() }"
      >
        <template #icon>
          <i class="codicon codicon-settings-gear" />
        </template>
      </DropdownItem>
    </template>
  </DropdownTrigger>

  <!-- 模型管理对话框 -->
  <ModelManagementDialog
    :is-visible="showManagementDialog"
    :current-model="currentSelectedModel"
    @close="showManagementDialog = false"
    @select-model="handleDialogModelSelect"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { DropdownTrigger, DropdownItem } from './Dropdown'
import ModelManagementDialog from './ModelManagementDialog.vue'
import { useModelManagement } from '../composables/useModelManagement'

interface Props {
  selectedModel?: string  // 从 session.modelSelection 传入
}

interface Emits {
  (e: 'model-select', modelId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 使用模型管理（获取模型列表）
const { availableModels } = useModelManagement()

// 模型管理对话框显示状态
const showManagementDialog = ref(false)

// 当前选中的模型：优先使用 props，其次使用 useModelManagement
const currentSelectedModel = computed(() => {
  return props.selectedModel || availableModels.value[0]?.value || ''
})

// 只显示启用的模型
const enabledModels = computed(() => {
  return availableModels.value.filter(m => !m.disabled)
})

// 计算显示的模型名称
const selectedModelLabel = computed(() => {
  const current = availableModels.value.find(m => m.value === currentSelectedModel.value)
  return current?.label || '选择模型'
})

function handleModelSelect(modelValue: string, close: () => void) {
  console.log('[ModelSelect] 选择模型:', modelValue)
  close()

  // 发送模型切换事件（通知后端）
  emit('model-select', modelValue)
}

function handleDialogModelSelect(modelValue: string) {
  showManagementDialog.value = false
  emit('model-select', modelValue)
}

</script>

<style scoped>
/* Model 下拉样式 - 简洁透明样式 */
.model-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.model-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

/* 共享的 Dropdown 样式 */
.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 200px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}

.dropdown-divider {
  height: 1px;
  background-color: var(--vscode-menu-separatorBackground);
  margin: 4px 0;
}
</style>
