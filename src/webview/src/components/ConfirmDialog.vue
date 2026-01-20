<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="isVisible" class="confirm-overlay" @click.self="handleCancel">
        <div class="confirm-container" @click.stop>
          <!-- 图标 -->
          <div class="confirm-icon" :class="`confirm-icon--${type}`">
            <i
              :class="[
                'codicon',
                type === 'warning' ? 'codicon-warning' :
                type === 'error' ? 'codicon-error' :
                'codicon-info'
              ]"
            />
          </div>

          <!-- 标题 -->
          <h3 class="confirm-title">{{ title }}</h3>

          <!-- 消息 -->
          <p class="confirm-message">{{ message }}</p>

          <!-- 按钮 -->
          <div class="confirm-actions">
            <button
              ref="confirmBtnRef"
              class="confirm-btn confirm-btn--primary"
              @click="handleConfirm"
            >
              {{ confirmText }}
            </button>
            <button class="confirm-btn confirm-btn--secondary" @click="handleCancel">
              {{ cancelText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';

interface Props {
  title?: string;
  message: string;
  type?: 'info' | 'warning' | 'error';
  confirmText?: string;
  cancelText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '确认',
  type: 'warning',
  confirmText: '确定',
  cancelText: '取消'
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const isVisible = ref(false);
const confirmBtnRef = ref<HTMLButtonElement>();

async function show() {
  isVisible.value = true;
  // 等待 DOM 更新后手动聚焦确定按钮
  await nextTick();
  setTimeout(() => {
    confirmBtnRef.value?.focus();
  }, 100); // 延迟一点确保动画开始后聚焦
}

function hide() {
  isVisible.value = false;
}

function handleConfirm() {
  emit('confirm');
  hide();
}

function handleCancel() {
  emit('cancel');
  hide();
}

// 键盘快捷键支持
function handleKeydown(event: KeyboardEvent) {
  if (!isVisible.value) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    handleConfirm();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

defineExpose({
  show,
  hide
});
</script>

<style scoped>
/* 遮罩层 */
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(2px);
}

/* 对话框容器 */
.confirm-container {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 24px;
  min-width: 360px;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* 图标 */
.confirm-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.confirm-icon--warning {
  background-color: color-mix(in srgb, var(--vscode-editorWarning-foreground) 15%, transparent);
  color: var(--vscode-editorWarning-foreground);
}

.confirm-icon--error {
  background-color: color-mix(in srgb, var(--vscode-editorError-foreground) 15%, transparent);
  color: var(--vscode-editorError-foreground);
}

.confirm-icon--info {
  background-color: color-mix(in srgb, var(--vscode-editorInfo-foreground) 15%, transparent);
  color: var(--vscode-editorInfo-foreground);
}

/* 标题 */
.confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-foreground);
  text-align: center;
}

/* 消息 */
.confirm-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-descriptionForeground);
  text-align: center;
  white-space: pre-line;
}

/* 按钮容器 */
.confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
}

/* 按钮样式 */
.confirm-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn--primary {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.confirm-btn--primary:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.confirm-btn--primary:active {
  transform: scale(0.98);
}

.confirm-btn--secondary {
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.confirm-btn--secondary:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.confirm-btn--secondary:active {
  transform: scale(0.98);
}

/* 动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-active .confirm-container,
.dialog-fade-leave-active .confirm-container {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .confirm-container {
  transform: scale(0.9);
  opacity: 0;
}

.dialog-fade-leave-to .confirm-container {
  transform: scale(0.9);
  opacity: 0;
}
</style>
