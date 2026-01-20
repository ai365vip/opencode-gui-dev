/**
 * useSession - Vue Composable for Session
 *
 * 核心功能：
 * 1. 将 Session 类的 alien-signals 转换为 Vue refs
 * 2. 将 alien computed 转换为 Vue computed
 * 3. 提供 Vue-friendly 的 API
 *
 * 使用方法：
 * ```typescript
 * const session = new Session(...);
 * const sessionAPI = useSession(session);
 * // sessionAPI.messages 是 Vue Ref<any[]>
 * // sessionAPI.busy 是 Vue Ref<boolean>
 * ```
 */

import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { Session, SelectionRange } from '../core/Session';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { BaseTransport } from '../transport/BaseTransport';
import type { ModelOption } from '../../../shared/messages';

/**
 * useSession 返回类型
 */
export interface UseSessionReturn {
  // 基础状态
  connection: Ref<BaseTransport | undefined>;
  busy: Ref<boolean>;
  isLoading: Ref<boolean>;
  error: Ref<string | undefined>;
  sessionId: Ref<string | undefined>;
  parentId: Ref<string | undefined>;
  isExplicit: Ref<boolean>;
  lastModifiedTime: Ref<number>;

  // 核心数据
  messages: Ref<any[]>;
  messageCount: Ref<number>;
  cwd: Ref<string | undefined>;
  permissionMode: Ref<PermissionMode>;
  summary: Ref<string | undefined>;
  modelSelection: Ref<string | undefined>;
  variant: Ref<string | undefined>;
  thinkingLevel: Ref<string>;

  todos: Ref<any[]>;
  worktree: Ref<{ name: string; path: string } | undefined>;
  selection: Ref<SelectionRange | undefined>;

  // 使用统计
  usageData: Ref<{
    totalTokens: number;
    totalCost: number;
    contextWindow: number;
  }>;
  pendingMessages: Ref<number>; // 队列中的消息数量
  messageQueue: Ref<any[]>; // 消息队列本身

  // 计算属性
  claudeConfig: ComputedRef<any>;
  config: ComputedRef<any>;
  permissionRequests: ComputedRef<PermissionRequest[]>;

  // 派生状态
  isOffline: ComputedRef<boolean>;

  // 方法
  getConnection: () => Promise<BaseTransport>;
  preloadConnection: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  send: (
    input: string,
    attachments?: Array<{ fileName: string; mediaType: string; data: string }>,
    includeSelection?: boolean
  ) => Promise<void>;
  queueMessage: (
    input: string,
    attachments?: Array<{ fileName: string; mediaType: string; data: string }>,
    includeSelection?: boolean
  ) => void;
  clearQueue: () => void;
  getQueueLength: () => number;
  updateQueuedMessage: (id: string, input: string) => void;
  removeQueuedMessage: (id: string) => void;
  sendQueuedMessageNow: (id: string) => Promise<void>;
  launchClaude: () => Promise<string>;
  interrupt: () => Promise<void>;
  restartClaude: () => Promise<void>;
  resumeAt: (messageTimestamp: number) => Promise<void>; // ← 新增
  listFiles: (pattern?: string) => Promise<any>;
  setPermissionMode: (mode: PermissionMode, applyToConnection?: boolean) => Promise<boolean>;
  setModel: (model: ModelOption) => Promise<boolean>;
  setVariant: (variant: string) => Promise<boolean>;
  setThinkingLevel: (level: string) => Promise<void>;
  getMcpServers: () => Promise<any>;
  openConfigFile: (configType: string) => Promise<void>;
  onPermissionRequested: (callback: (request: PermissionRequest) => void) => () => void;
  dispose: () => void;

  // 原始实例（用于高级场景）
  __session: Session;
}

/**
 * useSession - 将 Session 实例包装为 Vue Composable API
 *
 * @param session Session 实例
 * @returns Vue-friendly API
 */
export function useSession(session: Session): UseSessionReturn {
  //  使用官方 useSignal 桥接 signals/computed
  const connection = useSignal(session.connection);
  const busy = useSignal(session.busy);
  const isLoading = useSignal(session.isLoading);
  const error = useSignal(session.error);
  const sessionId = useSignal(session.sessionId);
  const parentId = useSignal(session.parentId);
  const isExplicit = useSignal(session.isExplicit);
  const lastModifiedTime = useSignal(session.lastModifiedTime);
  const messages = useSignal(session.messages);
  const messageCount = useSignal(session.messageCount);
  const cwd = useSignal(session.cwd);
  const permissionMode = useSignal(session.permissionMode);
  const summary = useSignal(session.summary);
  const modelSelection = useSignal(session.modelSelection);
  const variant = useSignal(session.variant);
  const thinkingLevel = useSignal(session.thinkingLevel);
  const todos = useSignal(session.todos);
  const worktree = useSignal(session.worktree);
  const selection = useSignal(session.selection);
  const usageData = useSignal(session.usageData);
  const pendingMessages = useSignal(session.pendingMessages); // 队列消息数
  const messageQueue = useSignal(session.messageQueue); // 队列本身

  //  使用 useSignal 包装 alien computed（读-only 使用，不调用 setter）
  const claudeConfig = useSignal(session.claudeConfig as any);
  const config = useSignal(session.config as any);
  const permissionRequests = useSignal(session.permissionRequests) as unknown as ComputedRef<
    PermissionRequest[]
  >;

  //  派生状态（临时保留 Vue computed）
  const isOffline = computed(() => session.isOffline());

  //  绑定所有方法（确保 this 指向正确）
  const getConnection = session.getConnection.bind(session);
  const preloadConnection = session.preloadConnection.bind(session);
  const loadFromServer = session.loadFromServer.bind(session);
  const send = session.send.bind(session);
  const queueMessage = session.queueMessage.bind(session);
  const clearQueue = session.clearQueue.bind(session);
  const getQueueLength = session.getQueueLength.bind(session);
  const updateQueuedMessage = session.updateQueuedMessage.bind(session);
  const removeQueuedMessage = session.removeQueuedMessage.bind(session);
  const sendQueuedMessageNow = session.sendQueuedMessageNow.bind(session);
  const launchClaude = session.launchClaude.bind(session);
  const interrupt = session.interrupt.bind(session);
  const restartClaude = session.restartClaude.bind(session);
  const resumeAt = session.resumeAt.bind(session); // ← 新增
  const listFiles = session.listFiles.bind(session);
  const setPermissionMode = session.setPermissionMode.bind(session);
  const setModel = session.setModel.bind(session);
  const setVariant = session.setVariant.bind(session);
  const setThinkingLevel = session.setThinkingLevel.bind(session);
  const getMcpServers = session.getMcpServers.bind(session);
  const openConfigFile = session.openConfigFile.bind(session);
  const onPermissionRequested = session.onPermissionRequested.bind(session);
  const dispose = session.dispose.bind(session);

  return {
    // 状态
    connection,
    busy,
    isLoading,
    error,
    sessionId,
    parentId,
    isExplicit,
    lastModifiedTime,
    messages,
    messageCount,
    cwd,
    permissionMode,
    summary,
    modelSelection,
    variant,
    thinkingLevel,
    todos,
    worktree,
    selection,
    usageData,
    pendingMessages, // 队列消息数
    messageQueue, // 队列本身

    // 计算属性
    claudeConfig,
    config,
    permissionRequests,
    isOffline,

    // 方法
    getConnection,
    preloadConnection,
    loadFromServer,
    send,
    queueMessage,
    clearQueue,
    getQueueLength,
    updateQueuedMessage,
    removeQueuedMessage,
    sendQueuedMessageNow,
    launchClaude,
    interrupt,
    restartClaude,
    resumeAt, // ← 新增
    listFiles,
    setPermissionMode,
    setModel,
    setVariant,
    setThinkingLevel,
    getMcpServers,
    openConfigFile,
    onPermissionRequested,
    dispose,

    // 原始实例
    __session: session
  };
}
