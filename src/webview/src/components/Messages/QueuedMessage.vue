<template>
  <div class="user-message queued">
    <div class="message-wrapper">
      <div
        ref="containerRef"
        class="message-content"
        :class="{ editing: isEditing }"
      >
        <!-- 普通显示模式 -->
        <div
          v-if="!isEditing"
          class="message-view"
          role="button"
          tabindex="0"
          @click.stop="startEditing"
          @keydown.enter.prevent="startEditing"
          @keydown.space.prevent="startEditing"
        >
          <div class="message-text">
            <div>{{ queuedMessage.input }}</div>
            <div class="action-buttons">
              <button
                class="action-button send-now-button"
                @click.stop="handleSendNow"
                title="停止当前并发送"
              >
                <span class="codicon codicon-send"></span>
              </button>
              <button
                class="action-button delete-button"
                @click.stop="handleDelete"
                title="删除"
              >
                <span class="codicon codicon-close"></span>
              </button>
            </div>
          </div>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="edit-mode">
          <ChatInputBox
            :show-progress="false"
            :conversation-working="false"
            :attachments="localAttachments"
            ref="chatInputRef"
            @submit="handleSaveEdit"
            @stop="cancelEdit"
            @remove-attachment="handleRemoveAttachment"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import type { AttachmentItem } from '../../types/attachment';
import ChatInputBox from '../ChatInputBox.vue';

interface QueuedMessage {
  id: string;
  input: string;
  attachments: any[];
  includeSelection: boolean;
}

interface Props {
  queuedMessage: QueuedMessage;
}

interface Emits {
  (e: 'send-now', id: string): void;
  (e: 'delete', id: string): void;
  (e: 'update', id: string, input: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isEditing = ref(false);
const chatInputRef = ref<InstanceType<typeof ChatInputBox>>();
const containerRef = ref<HTMLElement>();
const localAttachments = ref<AttachmentItem[]>([]);

async function startEditing() {
  isEditing.value = true;

  // 复制附件
  localAttachments.value = [...props.queuedMessage.attachments];

  // 等待 DOM 更新后设置输入框内容和焦点
  await nextTick();
  if (chatInputRef.value) {
    chatInputRef.value.setContent?.(props.queuedMessage.input || '');
    chatInputRef.value.focus?.();
  }
}

function handleRemoveAttachment(id: string) {
  localAttachments.value = localAttachments.value.filter(a => a.id !== id);
}

function cancelEdit() {
  isEditing.value = false;
  localAttachments.value = [];
}

function handleSaveEdit(content?: string) {
  const finalContent = content || props.queuedMessage.input;

  if (!finalContent.trim()) {
    console.log('[QueuedMessage] Empty content, cancel edit');
    cancelEdit();
    return;
  }

  // 触发更新事件
  emit('update', props.queuedMessage.id, finalContent.trim());
  cancelEdit();
}

function handleSendNow() {
  emit('send-now', props.queuedMessage.id);
}

function handleDelete() {
  emit('delete', props.queuedMessage.id);
}

// 监听键盘事件
function handleKeydown(event: KeyboardEvent) {
  if (isEditing.value && event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  }
}

// 监听点击外部取消编辑
function handleClickOutside(event: MouseEvent) {
  if (!isEditing.value) return;

  const target = event.target as HTMLElement;

  // 检查是否点击了组件内部
  if (containerRef.value?.contains(target)) return;

  // 点击外部，取消编辑
  cancelEdit();
}

// 生命周期管理
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
/* 简化的队列消息样式 - 去除多余背景层 */
.user-message {
  display: block;
  outline: none;
  padding: 1px 12px 8px;
  background-color: transparent;
  opacity: 1;
}

.user-message.queued {
  opacity: 0.95;
}

.message-wrapper {
  background-color: transparent;
}

/* 消息内容容器 - 只保留边框，不设置背景 */
.message-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  background-color: transparent;
  outline: none;
  border: none;
  border-radius: 6px;
  position: relative;
  transition: all 0.2s ease;
}

.message-content.editing {
  z-index: 200;
  border: none;
  background-color: transparent;
}

/* 普通显示模式 */
.message-view {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
  cursor: pointer;
  transition: all 0.2s ease;
}

.message-view .message-text {
  cursor: pointer;
  background-color: color-mix(
    in srgb,
    var(--vscode-input-background) 60%,
    transparent
  );
  outline: none;
  border-radius: 6px;
  width: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.message-view .message-text:hover {
  background-color: color-mix(
    in srgb,
    var(--vscode-input-background) 70%,
    transparent
  );
}

.message-text > div:first-child {
  min-width: 0;
  height: min-content;
  max-height: 72px;
  overflow: hidden;
  line-height: 1.5;
  font-family: inherit;
  font-size: 13px;
  color: var(--vscode-input-foreground);
  background-color: transparent;
  outline: none;
  border: none;
  overflow-wrap: break-word;
  word-break: break-word;
  padding: 0;
  user-select: text;
  white-space: pre-wrap;
  flex: 1;
}

/* 操作按钮容器 */
.action-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 操作按钮样式 */
.action-button {
  background: transparent;
  border: none;
  color: var(--vscode-foreground);
  display: flex;
  width: 20px;
  align-items: center;
  justify-content: center;
  line-height: 17px;
  padding: 0 6px;
  height: 26px;
  box-sizing: border-box;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 3px;
  transition: background-color 0.1s ease;
  opacity: 0.7;
}

.action-button:hover {
  opacity: 1;
  background-color: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
}

.action-button .codicon {
  font-size: 12px;
}

/* 发送按钮特殊样式 */
.send-now-button:hover {
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
}

/* 删除按钮特殊样式 */
.delete-button:hover {
  color: var(--vscode-errorForeground);
  background: var(--vscode-inputValidation-errorBackground);
}

/* 编辑模式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

/* 编辑模式下的特定样式覆盖 */
.edit-mode :deep(.full-input-box) {
  background: var(--vscode-input-background);
}

.edit-mode :deep(.full-input-box:focus-within) {
  box-shadow: 0 0 8px 2px
    color-mix(in srgb, var(--vscode-input-background) 30%, transparent);
}
</style>
