<template>
  <div class="chat-page">
    <!-- 顶部标题栏 -->
    <div class="chat-header">
      <div class="header-left">
        <button class="menu-btn" @click="$emit('switchToSessions')">
          <span class="codicon codicon-menu"></span>
        </button>
        <h2 class="chat-title">{{ title }}</h2>
      </div>
      <div class="header-right">
        <div v-if="sessionNavVisible" class="session-nav" :title="sessionNavTitle">
          <span v-if="sessionNavIndicator" class="session-nav-indicator">{{ sessionNavIndicator }}</span>
          <button
            v-if="canGoParentSession"
            class="session-nav-btn"
            @click="goParentSession"
            aria-label="Go to parent session"
            title="Parent session"
          >
            <span class="codicon codicon-arrow-up"></span>
          </button>
          <button
            class="session-nav-btn"
            @click="cycleSession('prev')"
            aria-label="Previous session in group"
            title="Prev session"
          >
            <span class="codicon codicon-arrow-left"></span>
          </button>
          <button
            class="session-nav-btn"
            @click="cycleSession('next')"
            aria-label="Next session in group"
            title="Next session"
          >
            <span class="codicon codicon-arrow-right"></span>
          </button>
        </div>
        <button class="new-chat-btn" title="新开对话" @click="createNew">
          <span class="codicon codicon-plus"></span>
        </button>
        <button class="settings-btn" title="设置" @click="$emit('switchToSettings')">
          <span class="codicon codicon-settings-gear"></span>
        </button>
      </div>
    </div>

    <!-- 主体：消息容器 -->
    <div class="main">
      <!-- <div class="chatContainer"> -->
      <div
        ref="containerEl"
        :class="[
          'messagesContainer',
          'custom-scroll-container',
          { dimmed: permissionRequestsLen > 0 }
        ]"
      >
        <template v-if="messages.length === 0">
          <div v-if="isBusy" class="emptyState">
            <div class="emptyWordmark">
              <OpenCodeWordmark class="emptyWordmarkSvg" />
            </div>
          </div>
          <div v-else class="emptyState">
            <div class="emptyWordmark">
              <OpenCodeWordmark class="emptyWordmarkSvg" />
            </div>
            <RandomTip :platform="platform" />
          </div>
        </template>
        <template v-else>
          <!-- 历史消息过多提示 -->
          <div
            v-if="allMessages.length > MAX_RENDERED_MESSAGES && !showAllMessages"
            class="history-notice"
          >
            <span class="codicon codicon-info"></span>
            <span
              >显示最近 {{ MAX_RENDERED_MESSAGES }} 条消息（共 {{ allMessages.length }} 条）</span
            >
            <button class="show-all-btn" @click="showAllMessages = true">显示全部</button>
          </div>
          <div v-else-if="showAllMessages" class="history-notice">
            <span class="codicon codicon-warning"></span>
            <span>正在显示全部 {{ allMessages.length }} 条消息，可能影响性能</span>
            <button class="show-all-btn" @click="showAllMessages = false">
              仅显示最近 {{ MAX_RENDERED_MESSAGES }} 条
            </button>
          </div>
          <!-- <div class="msg-list"> -->
          <MessageRenderer
            v-for="(m, i) in messages"
            :key="m?.id ?? i"
            :message="m"
            :context="toolContext"
          />
          <!-- </div> -->
          <div v-if="isBusy" class="spinnerRow">
            <Spinner :size="16" />
          </div>
          <div ref="endEl" />
        </template>
      </div>

      <div class="inputContainer">
        <ChatInputBox
          :show-progress="true"
          :progress-percentage="progressPercentage"
          :conversation-working="isBusy"
          :attachments="attachments"
          :primary-agent-mode="primaryAgentMode"
          :selected-model="session?.modelSelection.value"
          :available-variants="availableVariants"
          :selected-variant="currentVariant"
          :message-queue="session?.messageQueue.value ?? []"
          @submit="handleSubmit"
          @stop="handleStop"
          @add-attachment="handleAddAttachment"
          @remove-attachment="handleRemoveAttachment"
          @primary-agent-select="handlePrimaryAgentSelect"
          @model-select="handleModelSelect"
          @variant-select="handleVariantSelect"
          @update-queued-message="handleUpdateQueuedMessage"
          @remove-queued-message="handleRemoveQueuedMessage"
          @send-queued-message-now="handleSendQueuedMessageNow"
          @open-progress="handleOpenProgress"
        />
      </div>
      <!-- </div> -->
    </div>

    <ProgressDialog ref="progressDialogRef" :progress="progressSnapshot" />

    <!-- 权限请求模态框 -->
    <PermissionRequestModal
      v-if="pendingPermission && toolContext"
      :request="pendingPermission"
      :context="toolContext"
      :on-resolve="handleResolvePermission"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, nextTick, watch } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSession } from '../composables/useSession';
import { useModelManagement } from '../composables/useModelManagement';
import type { Session } from '../core/Session';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { ToolContext } from '../types/tool';
import type { AttachmentItem } from '../types/attachment';
import { convertFileToAttachment } from '../types/attachment';
import ChatInputBox from '../components/ChatInputBox.vue';
import Spinner from '../components/Messages/WaitingIndicator.vue';
import OpenCodeWordmark from '../components/OpenCodeWordmark.vue';
import RandomTip from '../components/RandomTip.vue';
import MessageRenderer from '../components/Messages/MessageRenderer.vue';
import PermissionRequestModal from '../components/PermissionRequestModal.vue';
import ProgressDialog from '../components/ProgressDialog.vue';
import { useKeybinding } from '../utils/useKeybinding';
import { useSignal } from '@gn8/alien-signals-vue';

const runtime = (() => {
  const rt = inject(RuntimeKey);
  if (!rt) throw new Error('[ChatPage] runtime not provided');
  return rt;
})();

const toolContext = computed<ToolContext>(() => ({
  fileOpener: {
    open: (filePath: string, location?: any) => {
      void runtime.appContext.fileOpener.open(filePath, location);
    },
    openContent: (content: string, fileName: string, editable: boolean) => {
      return runtime.appContext.fileOpener.openContent(content, fileName, editable);
    }
  },
  session: session.value
    ? {
        resumeAt: session.value.resumeAt
      }
    : undefined
}));

// 订阅 activeSession（alien-signal → Vue ref）
const activeSessionRaw = useSignal<Session | undefined>(runtime.sessionStore.activeSession);
const sessionsRaw = useSignal<Session[]>(runtime.sessionStore.sessions);

// 使用 useSession 将 alien-signals 转换为 Vue Refs
const session = computed(() => {
  const raw = activeSessionRaw.value;
  return raw ? useSession(raw) : null;
});

// 现在所有访问都使用 Vue Ref（.value）
const title = computed(() => session.value?.summary.value || 'New Conversation');

// 性能优化：allMessages 包含所有消息，messages 只渲染最近的N条
const allMessages = computed<any[]>(() => session.value?.messages.value ?? []);
const MAX_RENDERED_MESSAGES = 200; // 最多渲染200条消息
const showAllMessages = ref(false); // 是否显示全部历史消息

const messages = computed(() => {
  const total = allMessages.value.length;

  // 用户主动要求显示全部消息，或消息数量少于限制
  if (showAllMessages.value || total <= MAX_RENDERED_MESSAGES) {
    return allMessages.value;
  }

  // 只渲染最后200条消息
  return allMessages.value.slice(total - MAX_RENDERED_MESSAGES);
});

const isBusy = computed(() => session.value?.busy.value ?? false);

const activeSessionId = computed(() => activeSessionRaw.value?.sessionId());
const activeParentId = computed(() => activeSessionRaw.value?.parentId());

const sessionGroupRootId = computed(() => {
  const sid = activeSessionId.value;
  if (!sid) return undefined;
  return activeParentId.value ?? sid;
});

const sessionGroup = computed<Session[]>(() => {
  const rootId = sessionGroupRootId.value;
  if (!rootId) return [];

  const out = (sessionsRaw.value ?? []).filter((s) => {
    const id = s.sessionId();
    if (!id) return false;
    return id === rootId || s.parentId() === rootId;
  });

  out.sort((a, b) => String(a.sessionId() ?? '').localeCompare(String(b.sessionId() ?? '')));
  return out;
});

const sessionGroupIndex = computed(() => {
  const sid = activeSessionId.value;
  if (!sid) return -1;
  return sessionGroup.value.findIndex((s) => s.sessionId() === sid);
});

const sessionNavVisible = computed(() => sessionGroup.value.length > 1);
const canGoParentSession = computed(() => !!activeParentId.value);

const sessionNavIndicator = computed(() => {
  if (!sessionNavVisible.value) return '';
  const idx = sessionGroupIndex.value;
  if (idx < 0) return '';
  return `${idx + 1}/${sessionGroup.value.length}`;
});

const sessionNavTitle = computed(() => {
  const root = sessionGroupRootId.value;
  if (!root || !sessionNavVisible.value) return '';
  return activeParentId.value
    ? `Subagent session group: ${root}`
    : `Session group (includes subagents): ${root}`;
});

async function refreshSessions(): Promise<void> {
  try {
    await runtime.sessionStore.listSessions();
  } catch (e) {
    console.warn('[ChatPage] listSessions failed:', e);
  }
}

async function goParentSession(): Promise<void> {
  const parentId = activeParentId.value;
  if (!parentId) return;

  await refreshSessions();
  const target = (sessionsRaw.value ?? []).find((s) => s.sessionId() === parentId);
  if (target) {
    runtime.sessionStore.setActiveSession(target);
  }
}

async function cycleSession(direction: 'prev' | 'next'): Promise<void> {
  await refreshSessions();

  const group = sessionGroup.value;
  if (group.length <= 1) return;

  const idx = sessionGroupIndex.value >= 0 ? sessionGroupIndex.value : 0;
  const delta = direction === 'next' ? 1 : -1;
  const next = group[(idx + delta + group.length) % group.length];
  runtime.sessionStore.setActiveSession(next);
}

const primaryAgentMode = computed<'build' | 'plan'>(() => {
  const mode = String(session.value?.permissionMode.value ?? '').trim();
  return mode === 'plan' ? 'plan' : 'build';
});

// Compute variants for the currently selected model
const { availableModels } = useModelManagement();
const currentModelId = computed(() => session.value?.modelSelection.value);
const availableVariants = computed(() => {
  if (!currentModelId.value) return [];
  const model = availableModels.value.find((m) => m.value === currentModelId.value);
  return model?.variants ?? [];
});
const currentVariant = computed(() => session.value?.variant.value);

const VARIANT_STORAGE_KEY = 'opencode-gui.variant-by-model.v1';

function readVariantByModel(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VARIANT_STORAGE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!key) continue;
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeVariantByModel(next: Record<string, string>): void {
  try {
    localStorage.setItem(VARIANT_STORAGE_KEY, JSON.stringify(next ?? {}));
  } catch {
    // ignore
  }
}

const isRestoringVariant = ref(false);

watch(
  [currentModelId, availableVariants, currentVariant],
  async ([modelId, variants, selected]) => {
    if (!modelId) return;
    const s = session.value;
    if (!s) return;

    // If the user already picked one, don't override.
    if (selected && String(selected).trim()) return;

    const stored = (readVariantByModel()[modelId] ?? '').trim();
    if (!stored) return;

    // Only auto-apply when it matches the model's known variants (unless the list is unavailable).
    if (Array.isArray(variants) && variants.length > 0 && !variants.includes(stored)) {
      return;
    }

    isRestoringVariant.value = true;
    try {
      await s.setVariant(stored);
    } finally {
      isRestoringVariant.value = false;
    }
  },
  { immediate: true }
);

watch(
  [currentModelId, currentVariant],
  ([modelId, selected]) => {
    if (!modelId) return;
    if (isRestoringVariant.value) return;

    const next = { ...readVariantByModel() };
    const v = (selected ?? '').trim();
    if (v) next[modelId] = v;
    else delete next[modelId];
    writeVariantByModel(next);
  },
  { immediate: true }
);

const progressDialogRef = ref<InstanceType<typeof ProgressDialog> | null>(null);
const progressSnapshot = ref<any | null>(null);
const permissionRequests = computed(() => session.value?.permissionRequests.value ?? []);
const permissionRequestsLen = computed(() => permissionRequests.value.length);
const pendingPermission = computed(() => permissionRequests.value[0] as any);
const platform = computed(() => runtime.appContext.platform);

// 估算 Token 使用占比（基于 usageData）
const progressPercentage = computed(() => {
  const s = session.value;
  if (!s) return 0;

  const usage = s.usageData.value;
  const total = usage.totalTokens;

  const model = availableModels.value.find((m) => m.value === currentModelId.value);
  const windowSize = model?.contextWindow ?? usage.contextWindow ?? 200000;

  if (typeof total === 'number' && total > 0) {
    const pct = Math.round((total / windowSize) * 100);
    return Math.max(0, Math.min(100, pct));
  }

  return 0;
});

// DOM refs
const containerEl = ref<HTMLDivElement | null>(null);
const endEl = ref<HTMLDivElement | null>(null);

// 附件状态管理
const attachments = ref<AttachmentItem[]>([]);

// 记录上次消息数量，用于判断是否需要滚动
let prevCount = 0;

function stringify(m: any): string {
  try {
    return JSON.stringify(m ?? {}, null, 2);
  } catch {
    return String(m);
  }
}

function scrollToBottom(): void {
  const end = endEl.value;
  if (!end) return;
  requestAnimationFrame(() => {
    try {
      end.scrollIntoView({ block: 'end' });
    } catch {}
  });
}

// moved above

watch(
  () => messages.value.length,
  async (len) => {
    const increased = len > prevCount;
    prevCount = len;
    if (increased) {
      await nextTick();
      scrollToBottom();
    }
  }
);

watch(permissionRequestsLen, async () => {
  // 有权限请求出现时也确保滚动到底部
  await nextTick();
  scrollToBottom();
});

onMounted(async () => {
  prevCount = messages.value.length;
  await nextTick();
  scrollToBottom();
});

async function createNew(): Promise<void> {
  if (!runtime) return;

  // 1. 先尝试通过 appContext.startNewConversationTab 创建新标签（多标签模式）
  if (runtime.appContext.startNewConversationTab()) {
    return;
  }

  // 2. 如果不是多标签模式，检查当前会话是否为空
  const currentMessages = messages.value;
  if (currentMessages.length === 0) {
    // 当前已经是空会话，无需创建新会话
    return;
  }

  // 3. 当前会话有内容，创建新会话
  await runtime.sessionStore.createSession({ isExplicit: true });
}

// ChatInput 事件处理
async function handleSubmit(content: string) {
  const s = session.value;
  const trimmed = (content || '').trim();
  if (!s || (!trimmed && attachments.value.length === 0)) return;

  const isImmediateSlashCommand = (text: string) => {
    if (!text.startsWith('/')) return false;
    const cmd = text.slice(1).trimStart().split(/\s+/)[0]?.toLowerCase();
    return cmd === 'undo' || cmd === 'redo' || cmd === 'init' || cmd === 'compact' || cmd === 'summarize';
  };

  // 如果AI正在回复，将消息加入队列
  if (isBusy.value && !isImmediateSlashCommand(trimmed)) {
    s.queueMessage(trimmed || ' ', attachments.value, false);
    // 清空附件
    attachments.value = [];
    console.log('[ChatPage] AI正在回复，消息已加入队列');
    return;
  }

  // 对 /undo /redo /compact 等会话级命令：即使忙碌也立即发送（由后端负责 abort + refresh）
  if (isBusy.value && isImmediateSlashCommand(trimmed)) {
    // 这些命令会改变会话历史；清空队列避免后续误执行
    s.clearQueue();
  }

  try {
    // 传递附件给 send 方法
    await s.send(trimmed || ' ', attachments.value);

    // 发送成功后清空附件
    attachments.value = [];
  } catch (e) {
    console.error('[ChatPage] send failed', e);
  }
}

async function handleVariantSelect(variant: string) {
  const s = session.value;
  if (!s) return;

  await s.setVariant(variant);
}

async function handlePrimaryAgentSelect(mode: 'build' | 'plan') {
  const s = session.value;
  if (!s) return;

  await s.setPermissionMode(mode === 'plan' ? 'plan' : 'default');
}

async function handleModelSelect(modelId: string) {
  const s = session.value;
  if (!s) return;

  // Model selection is applied via prompt body (handled by extension), not via `/model` chat command.
  await s.setModel({ value: modelId });
}

async function handleOpenProgress() {
  const s = session.value;
  if (!s) return;

  try {
    const connection = await s.getConnection();
    const resp = await connection.getProgress(s.sessionId.value);
    progressSnapshot.value = resp?.progress ?? null;
    progressDialogRef.value?.show();
  } catch (e) {
    console.warn('[ChatPage] getProgress failed', e);
    progressSnapshot.value = null;
    progressDialogRef.value?.show();
  }
}

function handleStop() {
  const s = session.value;
  if (s) {
    // 方法已经在 useSession 中绑定，可以直接调用
    void s.interrupt();
  }
}

function handleResolvePermission(request: PermissionRequest, allow: boolean) {
  if (allow) {
    request.accept(request.inputs);
  } else {
    request.reject('用户拒绝了权限请求', true);
  }
}

async function handleAddAttachment(files: FileList) {
  if (!files || files.length === 0) return;

  try {
    // 将所有文件转换为 AttachmentItem
    const conversions = await Promise.all(Array.from(files).map(convertFileToAttachment));

    // 添加到附件列表
    attachments.value = [...attachments.value, ...conversions];

    console.log(
      '[ChatPage] Added attachments:',
      conversions.map((a) => a.fileName)
    );
  } catch (e) {
    console.error('[ChatPage] Failed to convert files:', e);
  }
}

function handleRemoveAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function handleUpdateQueuedMessage(id: string, input: string) {
  const s = session.value;
  if (s) {
    s.updateQueuedMessage(id, input);
  }
}

function handleRemoveQueuedMessage(id: string) {
  const s = session.value;
  if (s) {
    s.removeQueuedMessage(id);
  }
}

async function handleSendQueuedMessageNow(id: string) {
  const s = session.value;
  if (s) {
    await s.sendQueuedMessageNow(id);
  }
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  min-height: 32px;
  padding: 0 12px;
  position: sticky;
  top: 0;
  z-index: 3000;
  background-color: var(--vscode-sideBar-background);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
  opacity: 0.7;
}

.menu-btn .codicon {
  font-size: 12px;
}

.menu-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.chat-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-titleBar-activeForeground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.session-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 2px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 35%, transparent);
}

.session-nav-indicator {
  font-size: 11px;
  opacity: 0.75;
  padding: 0 4px;
  user-select: none;
}

.session-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
  opacity: 0.75;
}

.session-nav-btn .codicon {
  font-size: 12px;
}

.session-nav-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
  opacity: 0.7;
}

.new-chat-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
  opacity: 0.7;
  margin-left: 8px;
}

.settings-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.new-chat-btn .codicon {
  font-size: 12px;
}

.settings-btn .codicon {
  font-size: 12px;
}

.new-chat-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* Chat 容器与消息滚动容器（对齐 React） */
.chatContainer {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.messagesContainer {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 0 12px; /* 增加顶部间距，避免被标题栏遮挡 */
  position: relative;
}
.messagesContainer.dimmed {
  filter: blur(1px);
  opacity: 0.5;
  pointer-events: none;
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px;
}

.msg-item {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  padding: 8px;
}

.json-block {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(
    --app-monospace-font-family,
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    'Liberation Mono',
    'Courier New',
    monospace
  );
  font-size: var(--app-monospace-font-size, 12px);
  line-height: 1.5;
  color: var(--vscode-editor-foreground);
}

/* 其他样式复用 */

/* 输入区域容器 */
.inputContainer {
  padding: 8px 12px 12px;
}

/* 底部对话框区域钉在底部 */
.main > :last-child {
  flex-shrink: 0;
  background-color: var(--vscode-sideBar-background);
  /* border-top: 1px solid var(--vscode-panel-border); */
  max-width: 1200px;
  width: 100%;
  align-self: center;
}

/* 空状态样式 */
.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px 16px;
}

/* 历史消息提示 */
.history-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin: 8px 16px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.8;
}

.history-notice .codicon {
  font-size: 14px;
  flex-shrink: 0;
}

.history-notice span {
  flex: 1;
}

.show-all-btn {
  padding: 2px 8px;
  border: 1px solid var(--vscode-button-border);
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-radius: 2px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.show-all-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.emptyWordmark {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}
</style>
