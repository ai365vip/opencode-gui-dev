import { signal, computed, effect } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';
import type { PermissionRequest } from './PermissionRequest';
import type { ModelOption } from '../../../shared/messages';
import type { SessionSummary } from './types';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { processAndAttachMessage } from '../utils/messageUtils';
import { Message as MessageModel } from '../models/Message';
import type { Message } from '../models/Message';

export interface SelectionRange {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  selectedText?: string;
}

export interface UsageData {
  totalTokens: number;
  totalCost: number;
  contextWindow: number;
  contextPercentage?: number;
}

export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string;
  fileSize?: number;
}

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export interface SessionOptions {
  isExplicit?: boolean;
  existingWorktree?: { name: string; path: string };
  resumeId?: string;
}

export interface SessionContext {
  currentSelection: ReturnType<typeof signal<SelectionRange | undefined>>;
  commandRegistry: { registerAction: (...args: any[]) => void };
  fileOpener: {
    open: (filePath: string, location?: any) => Promise<void> | void;
    openContent: (
      content: string,
      fileName: string,
      editable: boolean
    ) => Promise<string | undefined>;
  };
  showNotification?: (
    message: string,
    severity: 'info' | 'warning' | 'error',
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ) => Promise<string | undefined>;
  startNewConversationTab?: (initialPrompt?: string) => boolean;
  renameTab?: (title: string) => boolean;
  openURL?: (url: string) => void;
}

export interface QueuedMessage {
  id: string;
  input: string;
  attachments: AttachmentPayload[];
  includeSelection: boolean;
}

export class Session {
  private readonly claudeChannelId = signal<string | undefined>(undefined);
  private currentConnectionPromise?: Promise<BaseTransport>;
  private lastSentSelection?: SelectionRange;
  private effectCleanup?: () => void;
  private isProcessingQueue = false;

  readonly connection = signal<BaseTransport | undefined>(undefined);

  readonly busy = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly sessionId = signal<string | undefined>(undefined);
  readonly parentId = signal<string | undefined>(undefined);
  readonly isExplicit = signal(false);
  readonly lastModifiedTime = signal<number>(Date.now());
  readonly messages = signal<Message[]>([]);
  readonly messageCount = signal<number>(0);
  readonly cwd = signal<string | undefined>(undefined);
  readonly permissionMode = signal<PermissionMode>('default');
  readonly summary = signal<string | undefined>(undefined);
  readonly modelSelection = signal<string | undefined>(undefined);
  readonly variant = signal<string | undefined>(undefined);
  readonly thinkingLevel = signal<string>('default_on');
  readonly todos = signal<any[]>([]);
  readonly worktree = signal<{ name: string; path: string } | undefined>(undefined);
  readonly selection = signal<SelectionRange | undefined>(undefined);
  readonly usageData = signal<UsageData>({
    totalTokens: 0,
    totalCost: 0,
    contextWindow: 200000,
    contextPercentage: 0
  });
  readonly pendingMessages = signal<number>(0);
  readonly messageQueue = signal<QueuedMessage[]>([]);
  readonly progressEvents = signal<Array<{ ts: number; type: string; summary: string }>>([]);

  readonly claudeConfig = computed(() => {
    const conn = this.connection();
    return conn?.claudeConfig?.();
  });

  readonly config = computed(() => {
    const conn = this.connection();
    return conn?.config?.();
  });

  readonly permissionRequests = computed<PermissionRequest[]>(() => {
    const conn = this.connection();
    const channelId = this.claudeChannelId();
    if (!conn || !channelId) {
      return [];
    }

    return conn.permissionRequests().filter((request) => request.channelId === channelId);
  });

  isOffline(): boolean {
    return (
      !this.connection() &&
      !!this.sessionId() &&
      this.messages().length === 0 &&
      !this.currentConnectionPromise
    );
  }

  constructor(
    private readonly connectionProvider: () => Promise<BaseTransport>,
    private readonly context: SessionContext,
    options: SessionOptions = {}
  ) {
    this.isExplicit(options.isExplicit ?? true);

    effect(() => {
      this.selection(this.context.currentSelection());
    });
  }

  static fromServer(
    summary: SessionSummary,
    connectionProvider: () => Promise<BaseTransport>,
    context: SessionContext
  ): Session {
    const session = new Session(connectionProvider, context, { isExplicit: true });
    session.sessionId(summary.id);
    session.parentId(summary.parentId);
    session.lastModifiedTime(summary.lastModified);
    session.summary(summary.summary);
    session.worktree(summary.worktree);
    session.messageCount(summary.messageCount ?? 0);

    return session;
  }

  async getConnection(): Promise<BaseTransport> {
    const current = this.connection();
    if (current) {
      return current;
    }
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = this.connectionProvider().then((conn) => {
      this.connection(conn);
      return conn;
    });

    return this.currentConnectionPromise;
  }

  async preloadConnection(): Promise<void> {
    await this.getConnection();
    await this.launchClaude();
  }

  async loadFromServer(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) return;

    // 会话刷新（如 /undo、/redo）会从服务端重载消息并覆盖本地数组。
    // 保留本地渲染的命令执行结果（不属于 OpenCode session 历史）。
    const preservedLocalMessages = this.messages().filter((m) => m.type === 'slash_command_result');

    this.isLoading(true);
    try {
      const connection = await this.getConnection();
      const response = await connection.getSession(sessionId);
      const accumulator: Message[] = [];
      for (const raw of response?.messages ?? []) {
        this.processMessage(raw);
        processAndAttachMessage(accumulator, raw);
      }
      const preservedAfterFetch = this.messages().filter((m) => m.type === 'slash_command_result');
      const preserved = Array.from(new Set([...preservedLocalMessages, ...preservedAfterFetch]));
      this.messages([...accumulator, ...preserved]);

      await this.launchClaude();
    } finally {
      this.isLoading(false);
      void this.processNextQueuedMessage();
    }
  }

  async send(
    input: string,
    attachments: AttachmentPayload[] = [],
    includeSelection = false,
    skipAddingMessage = false
  ): Promise<void> {
    const connection = await this.getConnection();

    const isSlash = this.isSlashCommand(input);

    const shouldIncludeSelection = includeSelection && !isSlash;
    let selectionPayload: SelectionRange | undefined;

    if (shouldIncludeSelection && !this.isSameSelection(this.lastSentSelection, this.selection())) {
      selectionPayload = this.selection();
      this.lastSentSelection = selectionPayload;
    }

    const userMessage = this.buildUserMessage(input, attachments, selectionPayload);
    const messageModel = MessageModel.fromRaw(userMessage);

    if (!skipAddingMessage && messageModel) {
      this.messages([...this.messages(), messageModel]);
    }

    if (!this.summary()) {
      this.summary(input);
    }
    this.isExplicit(false);
    this.lastModifiedTime(Date.now());
    this.busy(true);

    try {
      const existingChannel = this.claudeChannelId();

      if (!existingChannel) {
        await this.launchClaude(userMessage);
      } else {
        connection.sendInput(existingChannel, userMessage, false);
      }
    } catch (error) {
      console.error('[Session.send] 错误:', error);
      this.busy(false);
      throw error;
    }
  }

  async launchClaude(initialMessage?: any): Promise<string> {
    const existingChannel = this.claudeChannelId();
    if (existingChannel) {
      return existingChannel;
    }

    this.error(undefined);
    const channelId = Math.random().toString(36).slice(2);
    this.claudeChannelId(channelId);

    const connection = await this.getConnection();

    if (!this.cwd()) {
      this.cwd(connection.config()?.defaultCwd);
    }

    if (!this.modelSelection()) {
      this.modelSelection(connection.config()?.modelSetting);
    }

    if (!this.variant()) {
      this.variant(undefined);
    }

    if (!this.thinkingLevel()) {
      this.thinkingLevel(connection.config()?.thinkingLevel || 'default_on');
    }

    const stream = connection.launchClaude(
      channelId,
      this.sessionId() ?? undefined,
      this.cwd() ?? undefined,
      this.modelSelection() ?? undefined,
      this.variant() ?? undefined,
      this.permissionMode(),
      undefined,
      this.thinkingLevel(),
      initialMessage
    );

    void this.readMessages(stream);
    return channelId;
  }

  async interrupt(): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }
    const connection = await this.getConnection();
    connection.interruptClaude(channelId);
    this.clearQueue();
  }

  /**
   * 将消息添加到队列（不立即显示，等AI回复完成后再发送）
   */
  queueMessage(
    input: string,
    attachments: AttachmentPayload[] = [],
    includeSelection = false
  ): void {
    const id = Math.random().toString(36).slice(2);
    const queue = this.messageQueue();
    this.messageQueue([...queue, { id, input, attachments, includeSelection }]);
    this.pendingMessages(this.messageQueue().length);
    console.log(`[Session] 消息已加入队列，当前队列长度: ${this.messageQueue().length}`);
  }

  /**
   * 处理队列中的下一条消息
   */
  private async processNextQueuedMessage(): Promise<void> {
    const queue = this.messageQueue();
    if (this.isProcessingQueue || this.busy() || this.isLoading() || queue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const [nextMessage, ...rest] = queue;
      if (nextMessage) {
        this.messageQueue(rest);
        this.pendingMessages(rest.length);
        console.log(`[Session] 从队列发送消息，剩余队列长度: ${rest.length}`);
        await this.send(
          nextMessage.input,
          nextMessage.attachments,
          nextMessage.includeSelection,
          false
        );
      }
    } catch (error) {
      console.error('[Session] 处理队列消息失败:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * 清空消息队列
   */
  clearQueue(): void {
    this.messageQueue([]);
    this.pendingMessages(0);
    console.log('[Session] 消息队列已清空');
  }

  /**
   * 获取队列中的消息数量
   */
  getQueueLength(): number {
    return this.messageQueue().length;
  }

  /**
   * 更新队列中的消息
   */
  updateQueuedMessage(id: string, input: string): void {
    const queue = this.messageQueue();
    const updated = queue.map((msg) => (msg.id === id ? { ...msg, input } : msg));
    this.messageQueue(updated);
  }

  /**
   * 删除队列中的消息
   */
  removeQueuedMessage(id: string): void {
    const queue = this.messageQueue();
    const filtered = queue.filter((msg) => msg.id !== id);
    this.messageQueue(filtered);
    this.pendingMessages(filtered.length);
  }

  /**
   * 立即发送指定消息（停止当前输出）
   */
  async sendQueuedMessageNow(id: string): Promise<void> {
    const queue = this.messageQueue();
    const message = queue.find((msg) => msg.id === id);
    if (!message) return;

    await this.interrupt();

    const filtered = queue.filter((msg) => msg.id !== id);
    this.messageQueue(filtered);
    this.pendingMessages(filtered.length);

    await this.send(message.input, message.attachments, message.includeSelection, false);
  }

  async restartClaude(): Promise<void> {
    await this.interrupt();
    this.claudeChannelId(undefined);
    this.busy(false);
    await this.launchClaude();
  }

  async resumeAt(
    messageTimestamp: number,
    newMessage?: { input: string; attachments: AttachmentPayload[] }
  ): Promise<void> {
    const currentMessages = this.messages();
    const messageIndex = currentMessages.findIndex((msg) => msg.timestamp === messageTimestamp);

    if (messageIndex === -1) {
      throw new Error(`Message with timestamp ${messageTimestamp} not found`);
    }

    let resumeMessageId: string | undefined;

    for (let i = messageIndex - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      if (msg.type === 'assistant' && msg.messageId) {
        resumeMessageId = msg.messageId;
        break;
      }
    }

    if (!resumeMessageId) {
      console.log(
        '[Session.resumeAt] No assistant message found before this message, restarting session'
      );
      await this.restartClaude();

      if (newMessage) {
        await this.send(newMessage.input, newMessage.attachments, false);
      }
      return;
    }

    const truncatedMessages = currentMessages.slice(0, messageIndex);
    this.messages(truncatedMessages);

    let initialMessage: any = undefined;
    if (newMessage) {
      initialMessage = this.buildUserMessage(newMessage.input, newMessage.attachments);
      const messageModel = MessageModel.fromRaw(initialMessage);
      if (messageModel) {
        this.messages([...this.messages(), messageModel]);
      }

      if (!this.summary()) {
        this.summary(newMessage.input);
      }
      this.isExplicit(false);
      this.lastModifiedTime(Date.now());
      this.busy(true);
    }

    await this.interrupt();
    this.claudeChannelId(undefined);
    if (!newMessage) {
      this.busy(false);
    }

    const channelId = Math.random().toString(36).slice(2);
    this.claudeChannelId(channelId);

    const connection = await this.getConnection();

    const stream = connection.launchClaude(
      channelId,
      this.sessionId() ?? undefined,
      this.cwd() ?? undefined,
      this.modelSelection() ?? undefined,
      this.variant() ?? undefined,
      this.permissionMode(),
      undefined,
      this.thinkingLevel(),
      initialMessage,
      resumeMessageId
    );

    void this.readMessages(stream);
  }

  async listFiles(pattern?: string): Promise<any> {
    const connection = await this.getConnection();
    return connection.listFiles(pattern);
  }

  async setPermissionMode(mode: PermissionMode, applyToConnection = true): Promise<boolean> {
    const previous = this.permissionMode();
    this.permissionMode(mode);

    const channelId = this.claudeChannelId();
    if (!channelId || !applyToConnection) {
      return true;
    }
    const connection = await this.getConnection();
    const success = await connection.setPermissionMode(channelId, mode);
    if (!success) {
      this.permissionMode(previous);
    }
    return success;
  }

  async setModel(model: ModelOption): Promise<boolean> {
    const previous = this.modelSelection();
    this.modelSelection(model.value);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return true;
    }

    const connection = await this.getConnection();
    const response = await connection.setModel(channelId, model);

    if (!response?.success) {
      this.modelSelection(previous);
      return false;
    }

    return true;
  }

  async setVariant(variant: string): Promise<boolean> {
    const previous = this.variant();
    const next = String(variant ?? '').trim() || undefined;
    this.variant(next);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return true;
    }

    const connection = await this.getConnection();
    const success = await connection.setVariant(channelId, next ?? '');
    if (!success) {
      this.variant(previous);
      return false;
    }

    return true;
  }

  async setThinkingLevel(level: string): Promise<void> {
    this.thinkingLevel(level);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }

    const connection = await this.getConnection();
    await connection.setThinkingLevel(channelId, level);
  }

  async getMcpServers(): Promise<any> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.getMcpServers(channelId);
  }

  async openConfigFile(configType: string): Promise<void> {
    const connection = await this.getConnection();
    await connection.openConfigFile(configType);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): () => void {
    const connection = this.connection();
    if (!connection) {
      return () => {};
    }

    return connection.permissionRequested.add((request) => {
      if (request.channelId === this.claudeChannelId()) {
        callback(request);
      }
    });
  }

  dispose(): void {
    if (this.effectCleanup) {
      this.effectCleanup();
    }
  }

  private async readMessages(stream: AsyncIterable<any>): Promise<void> {
    try {
      for await (const event of stream) {
        this.processIncomingMessage(event);
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      this.busy(false);
    } finally {
      this.claudeChannelId(undefined);
    }
  }

  private processIncomingMessage(event: any): void {
    const currentMessages = [...this.messages()] as Message[];

    this.processMessage(event);
    processAndAttachMessage(currentMessages, event);
    this.messages(currentMessages);

    const pushProgress = (type: string, summary: string) => {
      const trimmed = String(summary ?? '').trim();
      if (!trimmed) return;
      const arr = [...this.progressEvents()];
      arr.push({ ts: Date.now(), type, summary: trimmed });
      const MAX = 50;
      if (arr.length > MAX) arr.splice(0, arr.length - MAX);
      this.progressEvents(arr);
    };

    if (event?.type === 'assistant') {
      const content = event?.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_use') {
            const name = String(block?.name ?? '').trim();
            const title = String(block?.input?.title ?? '').trim();
            if (name) pushProgress('tool', title ? `${name} • ${title}` : name);
          }
          if (block?.type === 'tool_result') {
            pushProgress('tool', 'tool_result');
          }
        }
      }
    }

    if (event?.type === 'system') {
      this.sessionId(event.session_id);
      if (event.subtype === 'init') {
        this.busy(true);
        pushProgress('session', 'running');
      } else if (event.subtype === 'refresh') {
        void this.loadFromServer();
      }
    } else if (event?.type === 'result') {
      this.busy(false);
      pushProgress('session', 'idle');
      void this.processNextQueuedMessage();
    }
  }

  /**
   * 处理特殊消息（TodoWrite, usage 统计）
   */
  private processMessage(event: any): void {
    if (
      event.type === 'assistant' &&
      event.message?.content &&
      Array.isArray(event.message.content)
    ) {
      for (const block of event.message.content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'TodoWrite' &&
          block.input &&
          typeof block.input === 'object' &&
          'todos' in block.input
        ) {
          this.todos(block.input.todos);
        }
      }

      if (event.message.usage) {
        this.updateUsage(event.message.usage);
      }
    }
  }

  /**
   * 更新 token 使用统计
   */
  private updateUsage(usage: any): void {
    const totalTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      usage.output_tokens;

    const current = this.usageData();
    const rawContext = Number(
      (usage as any)?.context_window ?? (usage as any)?.contextWindow ?? (usage as any)?.limit?.context
    );
    const contextWindow =
      Number.isFinite(rawContext) && rawContext > 0 ? Math.trunc(rawContext) : current.contextWindow;

    const rawPct = Number((usage as any)?.context_percentage);
    const computedPct =
      Number.isFinite(rawPct) && rawPct >= 0
        ? Math.round(rawPct)
        : contextWindow > 0 && totalTokens > 0
          ? Math.round((totalTokens / contextWindow) * 100)
          : current.contextPercentage ?? 0;
    const contextPercentage = Math.max(0, Math.min(100, computedPct));

    this.usageData({
      totalTokens,
      totalCost: current.totalCost,
      contextWindow,
      contextPercentage
    });
  }

  private buildUserMessage(
    input: string,
    attachments: AttachmentPayload[],
    selection?: SelectionRange
  ): any {
    const content: any[] = [];

    if (selection?.selectedText) {
      content.push({
        type: 'text',
        text: `<ide_selection>The user selected the lines ${selection.startLine} to ${selection.endLine} from ${selection.filePath}:
${selection.selectedText}

This may or may not be related to the current task.</ide_selection>`
      });
    }

    for (const attachment of attachments) {
      const { fileName, mediaType, data } = attachment;
      if (!data) {
        console.error(`Attachment missing data: ${fileName}`);
        continue;
      }

      const normalizedType = (mediaType || 'application/octet-stream').toLowerCase();

      if (IMAGE_MEDIA_TYPES.includes(normalizedType as (typeof IMAGE_MEDIA_TYPES)[number])) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedType,
            data
          }
        });
        continue;
      }

      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: normalizedType,
          data
        },
        title: fileName
      });
      continue;
    }

    content.push({ type: 'text', text: input });

    return {
      type: 'user',
      session_id: this.sessionId() || '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content
      }
    };
  }

  private isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  private isSameSelection(a?: SelectionRange, b?: SelectionRange): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.filePath === b.filePath &&
      a.startLine === b.startLine &&
      a.endLine === b.endLine &&
      a.startColumn === b.startColumn &&
      a.endColumn === b.endColumn &&
      a.selectedText === b.selectedText
    );
  }
}
