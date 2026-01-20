<template>
  <!-- 输入框 - 三行布局结构 -->
  <div class="full-input-box" style="position: relative">
    <!-- Diff Preview 待处理文件列表 -->
    <PendingDiffsBar v-if="pendingDiffs && pendingDiffs.length > 0" :pending-files="pendingDiffs" />

    <!-- 附件列表（如果有附件） -->
    <div v-if="attachments && attachments.length > 0" class="attachments-list">
      <div v-for="attachment in attachments" :key="attachment.id" class="attachment-item">
        <div class="icon-wrapper">
          <div class="attachment-icon">
            <FileIcon :file-name="attachment.fileName" :size="16" />
          </div>
          <button
            class="remove-button"
            @click.stop="handleRemoveAttachment(attachment.id)"
            :aria-label="`Remove ${attachment.fileName}`"
          >
            <span class="codicon codicon-close" />
          </button>
        </div>
        <span class="attachment-name">{{ attachment.fileName }}</span>
      </div>
    </div>

    <!-- 待发送消息列表 -->
    <div v-if="messageQueue && messageQueue.length > 0" class="pending-messages-list">
      <QueuedMessage
        v-for="queuedMsg in messageQueue"
        :key="queuedMsg.id"
        :queued-message="queuedMsg"
        @send-now="(id) => emit('send-queued-message-now', id)"
        @delete="(id) => emit('remove-queued-message', id)"
        @update="(id, input) => emit('update-queued-message', id, input)"
      />
    </div>

    <!-- 第一行：输入框区域 -->
    <div
      ref="textareaRef"
      contenteditable="true"
      class="aislash-editor-input custom-scroll-container"
      :data-placeholder="placeholder"
      style="
        min-height: 34px;
        max-height: 240px;
        resize: none;
        overflow-y: hidden;
        word-wrap: break-word;
        white-space: pre-wrap;
        width: 100%;
        height: 34px;
      "
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @dragover.prevent
      @drop="handleDrop"
    />

    <!-- 第二行：ButtonArea 组件 + TokenIndicator -->
    <ButtonArea
      :disabled="isSubmitDisabled"
      :loading="isLoading"
      :primary-agent-mode="primaryAgentMode"
      :selected-model="selectedModel"
      :available-variants="availableVariants"
      :selected-variant="selectedVariant"
      :conversation-working="conversationWorking"
      :has-input-content="hasPayload"
      :show-progress="showProgress"
      :progress-percentage="progressPercentage"
      @submit="handleSubmit"
      @stop="handleStop"
      @add-attachment="handleAddFiles"
      @mention="handleMention"
      @primary-agent-select="(mode) => emit('primary-agent-select', mode)"
      @model-select="(modelId) => emit('model-select', modelId)"
      @variant-select="(variant) => emit('variant-select', variant)"
      @open-progress="() => emit('open-progress')"
    />

    <!-- Slash Command Dropdown -->
    <Dropdown
      v-if="slashCompletion.isOpen.value"
      :is-visible="slashCompletion.isOpen.value"
      :position="slashCompletion.position.value"
      :width="240"
      :should-auto-focus="false"
      :close-on-click-outside="false"
      :data-nav="slashCompletion.navigationMode.value"
      :selected-index="slashCompletion.activeIndex.value"
      :offset-y="-8"
      :offset-x="-8"
      :prefer-placement="'above'"
      @close="slashCompletion.close"
    >
      <template #content>
        <div @mouseleave="slashCompletion.handleMouseLeave">
          <template v-if="slashCompletion.items.value.length > 0">
            <template v-for="(item, index) in slashCompletion.items.value" :key="item.id">
              <DropdownItem
                :item="item"
                :index="index"
                :is-selected="index === slashCompletion.activeIndex.value"
                @click="() => slashCompletion.selectIndex(index)"
                @mouseenter="slashCompletion.handleMouseEnter(index)"
              />
            </template>
          </template>
          <div v-else class="px-2 py-1 text-xs opacity-60">No matches</div>
        </div>
      </template>
    </Dropdown>

    <!-- @ 文件引用 Dropdown -->
    <Dropdown
      ref="fileDropdownRef"
      v-if="fileCompletion.isOpen.value"
      :is-visible="fileCompletion.isOpen.value"
      :position="fileCompletion.position.value"
      :width="320"
      :should-auto-focus="false"
      :close-on-click-outside="false"
      :data-nav="fileCompletion.navigationMode.value"
      :selected-index="fileCompletion.activeIndex.value"
      :offset-y="-8"
      :offset-x="-8"
      :prefer-placement="'above'"
      @close="fileCompletion.close"
    >
      <template #content>
        <div @mouseleave="fileCompletion.handleMouseLeave">
          <template v-if="fileCompletion.items.value.length > 0">
            <template v-for="(item, index) in fileCompletion.items.value" :key="item.id">
              <DropdownItem
                :item="item"
                :index="index"
                :is-selected="index === fileCompletion.activeIndex.value"
                @mousedown.prevent="() => fileCompletion.selectIndex(index)"
                @mouseenter="fileCompletion.handleMouseEnter(index)"
              >
                <template #icon v-if="'data' in item && item.data?.file">
                  <FileIcon
                    :file-name="item.data.file.name"
                    :is-directory="item.data.file.type === 'directory'"
                    :folder-path="item.data.file.path"
                    :size="16"
                  />
                </template>
              </DropdownItem>
            </template>
          </template>
          <div v-else class="px-2 py-1 text-xs opacity-60">No matches</div>
        </div>
      </template>
    </Dropdown>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, inject, onMounted, onUnmounted, watch } from 'vue';
import FileIcon from './FileIcon.vue';
import ButtonArea from './ButtonArea.vue';
import QueuedMessage from './Messages/QueuedMessage.vue';
import PendingDiffsBar from './PendingDiffsBar.vue';
import type { AttachmentItem } from '../types/attachment';
import { Dropdown, DropdownItem } from './Dropdown';
import { RuntimeKey } from '../composables/runtimeContext';
import { useCompletionDropdown } from '../composables/useCompletionDropdown';
import { getSlashCommands, commandToDropdownItem } from '../providers/slashCommandProvider';
import { getFileReferences, fileToDropdownItem } from '../providers/fileReferenceProvider';
import { useFileSearch } from '../composables/useFileSearch';

interface PendingFile {
  filePath: string;
  fileName: string;
  blockCount: number;
  linesAdded: number;
  linesDeleted: number;
  firstBlockLine: number;
}

interface Props {
  showProgress?: boolean;
  progressPercentage?: number;
  placeholder?: string;
  readonly?: boolean;
  showSearch?: boolean;
  primaryAgentMode?: 'build' | 'plan';
  selectedModel?: string;
  availableVariants?: string[];
  selectedVariant?: string;
  conversationWorking?: boolean;
  attachments?: AttachmentItem[];
  messageQueue?: Array<{
    id: string;
    input: string;
    attachments: any[];
    includeSelection: boolean;
  }>;
  pendingDiffs?: PendingFile[];
}

interface Emits {
  (e: 'submit', content: string): void;
  (e: 'queueMessage', content: string): void;
  (e: 'stop'): void;
  (e: 'input', content: string): void;
  (e: 'attach'): void;
  (e: 'add-attachment', files: FileList): void;
  (e: 'remove-attachment', id: string): void;
  (e: 'primary-agent-select', mode: 'build' | 'plan'): void;
  (e: 'model-select', modelId: string): void;
  (e: 'variant-select', variant: string): void;
  (e: 'open-progress'): void;
  (e: 'update-queued-message', id: string, input: string): void;
  (e: 'remove-queued-message', id: string): void;
  (e: 'send-queued-message-now', id: string): void;
}
const props = withDefaults(defineProps<Props>(), {
  showProgress: true,
  progressPercentage: 0,
  placeholder: 'Plan, @ for context, / for commands...',
  readonly: false,
  showSearch: false,
  primaryAgentMode: undefined,
  selectedModel: '',
  availableVariants: () => [],
  selectedVariant: undefined,
  conversationWorking: false,
  attachments: () => [],
  messageQueue: () => [],
  pendingDiffs: () => []
});

const emit = defineEmits<Emits>();

const runtime = inject(RuntimeKey);

const content = ref('');
const isLoading = ref(false);
const textareaRef = ref<HTMLDivElement | null>(null);
const fileDropdownRef = ref<any>(null); // 文件选择下拉框的引用

// 性能优化：防抖相关
let inputDebounceTimer: number | undefined;
let resizeDebounceTimer: number | undefined;
let lastEvaluatedText = ''; // 避免重复评估相同内容

const hasPayload = computed(() => {
  return !!content.value.trim() || (props.attachments?.length ?? 0) > 0;
});

const isSubmitDisabled = computed(() => {
  return !hasPayload.value || isLoading.value;
});

// 文件搜索功能
const { files: cachedFiles, loadWorkspaceFiles, updateFiles } = useFileSearch();

// === 使用新的 Completion Dropdown Composable ===

// Slash Command 补全
const slashCompletion = useCompletionDropdown({
  mode: 'inline',
  trigger: '/',
  provider: (query) => getSlashCommands(query, runtime),
  toDropdownItem: commandToDropdownItem,
  onSelect: (command, query) => {
    if (query) {
      // 替换文本
      const updated = slashCompletion.replaceText(content.value, `${command.label} `);
      content.value = updated;

      // 更新 DOM
      if (textareaRef.value) {
        textareaRef.value.textContent = updated;
        placeCaretAtEnd(textareaRef.value);
      }

      // 触发输入事件
      emit('input', updated);
    }
  },
  anchorElement: textareaRef
});

// @ 文件引用补全（使用本地缓存）
const fileCompletion = useCompletionDropdown({
  mode: 'inline',
  trigger: '@',
  provider: (query) => getFileReferences(query, runtime, cachedFiles.value),
  toDropdownItem: fileToDropdownItem,
  onSelect: (file, query) => {
    // 直接查找 @ 符号的位置，不依赖 query 参数（避免焦点丢失导致 query 为 undefined）
    const text = content.value;
    const atIndex = text.lastIndexOf('@');

    if (atIndex !== -1) {
      // 找到最后一个 @ 符号，替换从 @ 到当前文本末尾的内容
      const before = text.substring(0, atIndex);
      const replacement = `@${file.path} `;
      const updated = before + replacement;

      content.value = updated;

      // 更新 DOM
      if (textareaRef.value) {
        textareaRef.value.textContent = updated;
        placeCaretAtEnd(textareaRef.value);
      }

      // 触发输入事件
      emit('input', updated);
    } else {
      // 兜底：直接追加到末尾
      const updated = content.value + `@${file.path} `;
      content.value = updated;

      if (textareaRef.value) {
        textareaRef.value.textContent = updated;
        placeCaretAtEnd(textareaRef.value);
      }

      emit('input', updated);
    }
  },
  anchorElement: textareaRef
});

// 将光标移至末尾
function placeCaretAtEnd(node: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

// 获取光标的客户端矩形
function getCaretClientRect(editable: HTMLElement | null): DOMRect | undefined {
  if (!editable) return undefined;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return undefined;

  const range = sel.getRangeAt(0).cloneRange();
  if (!editable.contains(range.startContainer)) return undefined;

  // collapsed range 一般有 0 宽度，但有行高；用 getClientRects 优先
  const rects = range.getClientRects();
  const rect = rects[0] || range.getBoundingClientRect();
  if (!rect) return undefined;

  // 兜底行高，避免 0 高导致 Dropdown 内部计算异常
  const lh = parseFloat(getComputedStyle(editable).lineHeight || '0') || 16;
  const height = rect.height || lh;

  return new DOMRect(rect.left, rect.top, rect.width, height);
}

// 根据字符偏移获取矩形（用于锚定在触发词开头）
function getRectAtCharOffset(editable: HTMLElement, charOffset: number): DOMRect | undefined {
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
  let remaining = charOffset;
  let node: Text | null = null;

  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, remaining));
      range.collapse(true);
      const rects = range.getClientRects();
      const rect = rects[0] || range.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(editable).lineHeight || '0') || 16;
      const height = rect.height || lh;
      return new DOMRect(rect.left, rect.top, rect.width, height);
    }
    remaining -= len;
  }

  return undefined;
}

// 更新 dropdown 位置
function updateDropdownPosition(
  completion: typeof slashCompletion | typeof fileCompletion,
  anchor: 'caret' | 'queryStart' = 'queryStart'
) {
  const el = textareaRef.value;
  if (!el) return;

  let rect: DOMRect | undefined;

  // 优先锚定在触发词开头
  if (anchor === 'queryStart' && completion.triggerQuery.value) {
    rect = getRectAtCharOffset(el, completion.triggerQuery.value.start);
  }

  // 兜底：锚定在光标位置
  if (!rect && anchor === 'caret') {
    rect = getCaretClientRect(el);
  }

  // 最终兜底：使用输入框自身矩形
  if (!rect) {
    const r = el.getBoundingClientRect();
    rect = new DOMRect(r.left, r.top, r.width, r.height);
  }

  completion.updatePosition({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  });
}

function handleInput(event: Event) {
  const target = event.target as HTMLDivElement;
  const textContent = target.textContent || '';

  // 只有在完全没有内容时才清理 div
  if (textContent.length === 0) {
    target.innerHTML = '';
  }

  content.value = textContent;
  emit('input', textContent);

  // 立即自适应高度（视觉反馈优先）
  autoResizeTextarea();

  // 防抖处理补全评估和位置更新（避免大量输入时的性能问题）
  if (inputDebounceTimer) window.clearTimeout(inputDebounceTimer);
  inputDebounceTimer = window.setTimeout(() => {
    evaluateCompletions(textContent);
  }, 150); // 150ms防抖，平衡响应性和性能
}

// 智能补全评估：避免重复计算
function evaluateCompletions(textContent: string) {
  // 如果内容没变，跳过评估
  if (textContent === lastEvaluatedText) return;
  lastEvaluatedText = textContent;

  // 评估补全（slash 和 @）
  slashCompletion.evaluateQuery(textContent);
  fileCompletion.evaluateQuery(textContent);

  // 更新 dropdown 位置（锚定在触发词开头）
  if (slashCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(slashCompletion, 'queryStart');
    });
  }
  if (fileCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(fileCompletion, 'queryStart');
    });
  }
}

function autoResizeTextarea() {
  if (!textareaRef.value) return;

  // 使用 requestAnimationFrame 批量处理 DOM 操作，避免多次回流
  if (resizeDebounceTimer) window.cancelAnimationFrame(resizeDebounceTimer);
  resizeDebounceTimer = window.requestAnimationFrame(() => {
    const divElement = textareaRef.value;
    if (!divElement) return;

    const minHeight = 20;
    const maxHeight = 240;

    // 批量读取和写入DOM，减少回流次数
    // 1. 先重置高度
    divElement.style.height = minHeight + 'px';

    // 2. 读取 scrollHeight（触发回流，但只有一次）
    const scrollHeight = divElement.scrollHeight;

    // 3. 批量设置样式（只触发一次重绘）
    if (scrollHeight <= maxHeight) {
      divElement.style.height = Math.max(scrollHeight, minHeight) + 'px';
      divElement.style.overflowY = 'hidden';
    } else {
      divElement.style.height = maxHeight + 'px';
      divElement.style.overflowY = 'auto';
    }
  });
}

function handleKeydown(event: KeyboardEvent) {
  // Escape: close dropdowns first, otherwise stop the running response (TUI parity)
  if (event.key === 'Escape') {
    if (slashCompletion.isOpen.value) {
      event.preventDefault();
      slashCompletion.close();
      return;
    }
    if (fileCompletion.isOpen.value) {
      event.preventDefault();
      fileCompletion.close();
      return;
    }
    if (props.conversationWorking) {
      event.preventDefault();
      handleStop();
      return;
    }
  }

  // Ctrl+C: clear input when there's no selection (avoid breaking copy)
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'c') {
    const sel = window.getSelection();
    const hasSelection = !!sel && !sel.isCollapsed;
    if (!hasSelection && (content.value || '').length > 0) {
      event.preventDefault();
      content.value = '';
      if (textareaRef.value) {
        textareaRef.value.textContent = '';
        textareaRef.value.style.height = '20px';
        textareaRef.value.style.overflowY = 'hidden';
      }
      return;
    }
  }

  // Ctrl+J: insert newline (Shift+Enter already works naturally)
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    // Works in most Chromium-based WebViews
    document.execCommand?.('insertLineBreak');
    // Fallback: ensure internal state stays in sync
    if (textareaRef.value) {
      content.value = textareaRef.value.textContent || '';
      autoResizeTextarea();
    }
    return;
  }

  // 优先处理补全菜单的键盘事件
  if (slashCompletion.isOpen.value) {
    slashCompletion.handleKeydown(event);
    return;
  }

  // 处理文件引用补全的键盘事件
  if (fileCompletion.isOpen.value) {
    fileCompletion.handleKeydown(event);
    return;
  }

  // 其他按键处理
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }

  // 延迟检查内容是否为空（在按键处理后）
  if (event.key === 'Backspace' || event.key === 'Delete') {
    setTimeout(() => {
      const target = event.target as HTMLDivElement;
      const textContent = target.textContent || '';
      if (textContent.length === 0) {
        target.innerHTML = '';
        content.value = '';
      }
    }, 0);
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault(); // 阻止默认粘贴行为，避免保留富文本格式

  const clipboard = event.clipboardData;
  if (!clipboard) {
    return;
  }

  const items = clipboard.items;
  if (!items || items.length === 0) {
    return;
  }

  // 优先处理文件粘贴
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }

  if (files.length > 0) {
    // 创建 FileList-like 对象
    const dataTransfer = new DataTransfer();
    for (const file of files) {
      dataTransfer.items.add(file);
    }
    // 触发附件添加
    handleAddFiles(dataTransfer.files);
    return;
  }

  // 处理文本粘贴 - 只保留纯文本，去除所有格式
  const plainText = clipboard.getData('text/plain');
  if (plainText) {
    // 获取当前选区
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    // 删除当前选中的内容（如果有）
    selection.deleteFromDocument();

    // 创建文本节点并插入
    const textNode = document.createTextNode(plainText);
    const range = selection.getRangeAt(0);
    range.insertNode(textNode);

    // 将光标移到插入文本的末尾
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    // 更新 content 状态
    if (textareaRef.value) {
      content.value = textareaRef.value.textContent || '';
    }

    // 触发输入事件
    autoResizeTextarea();
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    handleAddFiles(files);
  }
}

function handleSubmit() {
  if (!hasPayload.value) return;

  // 统一发送 submit 事件，队列逻辑由 ChatPage 处理
  emit('submit', content.value);

  // 清空输入框
  content.value = '';
  if (textareaRef.value) {
    textareaRef.value.textContent = '';
    // 重置输入框高度到初始值
    textareaRef.value.style.height = '20px';
    textareaRef.value.style.overflowY = 'hidden';
  }
}

function handleStop() {
  emit('stop');
}

function handleMention(filePath?: string) {
  if (!filePath) return;

  // 在光标位置插入 @文件路径
  const updatedContent = content.value + `@${filePath} `;
  content.value = updatedContent;

  // 更新 DOM
  if (textareaRef.value) {
    textareaRef.value.textContent = updatedContent;
    placeCaretAtEnd(textareaRef.value);
  }

  // 触发输入事件
  emit('input', updatedContent);

  // 自动聚焦到输入框
  nextTick(() => {
    textareaRef.value?.focus();
  });
}

function handleAddFiles(files: FileList) {
  emit('add-attachment', files);
}

function handleRemoveAttachment(id: string) {
  emit('remove-attachment', id);
}

// 监听光标位置变化（优化：只在下拉框打开时处理）
let selectionDebounceTimer: number | undefined;
function handleSelectionChange() {
  // 性能优化：只在补全下拉框打开时才处理光标变化
  if (!slashCompletion.isOpen.value && !fileCompletion.isOpen.value) {
    return;
  }

  if (!content.value || !textareaRef.value) return;

  // 防抖处理，避免光标快速移动时的重复计算
  if (selectionDebounceTimer) window.clearTimeout(selectionDebounceTimer);
  selectionDebounceTimer = window.setTimeout(() => {
    // 复用智能评估函数
    evaluateCompletions(content.value);
  }, 50); // 光标移动响应更快，使用50ms
}

// 处理来自 Extension 的 window message 事件
function handleWindowMessage(event: any) {
  if (!event.data || !event.data.type) {
    return;
  }

  const { type, payload } = event.data;

  // 处理 Ctrl+L 添加选中内容
  if (type === 'add-selection' && payload?.relativePath) {
    const { relativePath, startLine, endLine } = payload;

    // 构建要添加的内容：@文件路径(起始行-结束行)
    let contentToAdd = `@${relativePath}`;

    if (startLine && endLine) {
      if (startLine === endLine) {
        // 单行选择或光标位置
        contentToAdd += `(${startLine})`;
      } else {
        // 多行选择
        contentToAdd += `(${startLine}-${endLine})`;
      }
    }

    // 添加到输入框
    if (textareaRef.value) {
      const currentText = textareaRef.value.textContent || '';
      textareaRef.value.textContent = currentText ? `${currentText} ${contentToAdd}` : contentToAdd;

      // 更新 content
      content.value = textareaRef.value.textContent;

      // 使用 nextTick 批量处理 DOM 操作，避免闪烁
      nextTick(() => {
        // 调整高度
        autoResizeTextarea();
        // 聚焦输入框(防止页面滚动)
        textareaRef.value?.focus({ preventScroll: true });
      });
    }

    console.log('[ChatInputBox] 已添加文件引用到输入框:', contentToAdd);
  }

  // 处理文件引用插入（来自 @ 按钮）
  if (type === 'insert-file-reference' && payload?.relativePath) {
    const { relativePath } = payload;

    // 在当前光标位置插入 @文件路径
    if (textareaRef.value) {
      const currentText = textareaRef.value.textContent || '';
      const insertion = currentText ? ` @${relativePath} ` : `@${relativePath} `;
      textareaRef.value.textContent = currentText + insertion;

      // 更新 content
      content.value = textareaRef.value.textContent;

      // 使用 nextTick 批量处理 DOM 操作，避免闪烁
      nextTick(() => {
        // 调整高度
        autoResizeTextarea();
        // 聚焦输入框并将光标移至末尾(防止页面滚动)
        if (textareaRef.value) {
          textareaRef.value.focus({ preventScroll: true });
          placeCaretAtEnd(textareaRef.value);
        }
      });
    }

    console.log('[ChatInputBox] 已插入文件引用:', relativePath);
  }

  // 处理批量文件引用添加（来自右键多选文件）
  if (type === 'add-multiple-files' && payload?.relativePaths) {
    const { relativePaths } = payload;

    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
      return;
    }

    // 构建批量文件引用内容：每个文件一行 @路径
    const fileReferences = relativePaths.map((path) => `@${path}`).join(' ');

    // 添加到输入框
    if (textareaRef.value) {
      const currentText = textareaRef.value.textContent || '';
      textareaRef.value.textContent = currentText
        ? `${currentText}\n${fileReferences}`
        : fileReferences;

      // 更新 content
      content.value = textareaRef.value.textContent;

      // 使用 nextTick 批量处理 DOM 操作，避免闪烁
      nextTick(() => {
        // 调整高度
        autoResizeTextarea();
        // 聚焦输入框并将光标移至末尾(防止页面滚动)
        if (textareaRef.value) {
          textareaRef.value.focus({ preventScroll: true });
          placeCaretAtEnd(textareaRef.value);
        }
      });
    }

    console.log(`[ChatInputBox] 已批量添加 ${relativePaths.length} 个文件引用:`, relativePaths);
  }
}

// 添加/移除 selectionchange 监听
onMounted(() => {
  document.addEventListener('selectionchange', handleSelectionChange);

  // 初始加载工作区文件（传入 runtime 实例）
  if (runtime) {
    loadWorkspaceFiles(runtime);
  }

  // 监听 add-selection 事件（来自 Ctrl+L 快捷键）
  window.addEventListener('message', handleWindowMessage);

  // 监听文件列表变化，自动滚动到顶部
  watch(
    () => fileCompletion.items.value,
    (newItems, oldItems) => {
      // 只有在项目数量发生变化时才滚动，避免不必要的滚动
      if (newItems.length !== (oldItems?.length || 0)) {
        nextTick(() => {
          // 使用 nextTick 确保 DOM 已更新
          fileDropdownRef.value?.scrollToTop();
        });
      }
    },
    { immediate: false }
  );
});

onUnmounted(() => {
  document.removeEventListener('selectionchange', handleSelectionChange);
  window.removeEventListener('message', handleWindowMessage);

  // 清理所有防抖定时器
  if (inputDebounceTimer) window.clearTimeout(inputDebounceTimer);
  if (resizeDebounceTimer) window.cancelAnimationFrame(resizeDebounceTimer);
  if (selectionDebounceTimer) window.clearTimeout(selectionDebounceTimer);
});

// 暴露方法：供父组件设置内容与聚焦
defineExpose({
  /** 设置输入框内容并同步内部状态 */
  setContent(text: string) {
    content.value = text || '';
    if (textareaRef.value) {
      textareaRef.value.textContent = content.value;
    }
    autoResizeTextarea();
  },
  /** 聚焦到输入框 */
  focus() {
    nextTick(() => textareaRef.value?.focus());
  }
});
</script>

<style scoped>
/* 输入框基础样式 - 固定行高以稳定 caret 定位 */
.aislash-editor-input {
  line-height: 18px;
}

/* 移除输入框聚焦时的边框 */
.aislash-editor-input:focus {
  outline: none !important;
  border: none !important;
}

/* 移除父容器聚焦时的高亮效果 */
.full-input-box:focus-within {
  /* 不改变边框颜色,保持默认样式 */
  outline: none !important;
}

/* Placeholder 样式 */
.aislash-editor-input:empty::before {
  content: attr(data-placeholder);
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
  position: absolute;
}

.aislash-editor-input:focus:empty::before {
  content: attr(data-placeholder);
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
}

/* 附件列表样式 - 水平排列的 pills */
.attachments-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  min-height: 20px;
  /* max-height: 44px; */
  overflow: hidden;
}

/* 待发送消息列表 */
.pending-messages-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-bottom: 4px;
}

.attachment-item {
  display: inline-flex;
  align-items: center;
  padding-right: 4px;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px;
  font-size: 12px;
  flex-shrink: 0;
  max-width: 200px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  outline: none;
  line-height: 16px;
  height: 20px;
}

.attachment-item:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* 图标和关闭按钮的重叠容器 */
.icon-wrapper {
  position: relative;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.attachment-icon {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  opacity: 1;
  transition: opacity 0.15s ease;
  scale: 0.8;
}

/* 确保图标样式正确应用（使用 :deep 穿透到 FileIcon 内部） */
.attachment-item .attachment-icon :deep(.mdi),
.attachment-item .attachment-icon :deep(.codicon) {
  color: var(--vscode-foreground);
  opacity: 0.8;
}

.attachment-name {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-foreground);
  opacity: 1;
  max-width: 140px;
}

.attachment-size {
  display: none; /* 隐藏文件大小，保持简洁 */
}

.remove-button {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  color: var(--vscode-foreground);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.remove-button .codicon {
  font-size: 14px;
}

/* hover attachment-item 时切换图标和按钮的显示 */
.attachment-item:hover .attachment-icon {
  opacity: 0;
}

.attachment-item:hover .remove-button {
  opacity: 0.8;
}

.remove-button:hover {
  opacity: 1 !important;
}
</style>
