import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IWorkspaceService } from '../workspaceService';
import { IWebViewService } from '../webViewService';
import { ITransport } from '../claude/transport';
import { IOpencodeClientService, type OpencodeEvent } from './OpencodeClientService';

import type {
  WebViewToExtensionMessage,
  RequestMessage,
  ResponseMessage,
  ErrorResponse,
  InitResponse,
  GetClaudeStateResponse,
  GetClaudeConfigResponse,
  SaveClaudeConfigResponse,
  GetCurrentSelectionResponse,
  GetMcpServersResponse,
  GetAssetUrisResponse,
  ListSessionsResponse,
  GetSessionResponse,
  GetAgentsResponse,
  ToggleAgentResponse,
  DeleteAgentResponse,
  GetSkillsResponse,
  ToggleSkillResponse,
  DeleteSkillResponse,
  SetModelResponse,
  SetPermissionModeResponse,
  SetThinkingLevelResponse,
  ListFilesResponse,
  ShowNotificationRequest,
  ShowNotificationResponse,
  OpenContentResponse,
  OpenDiffResponse,
  ExecResponse,
  OpenConfigFileResponse,
  OpenClaudeInTerminalResponse,
  NewConversationTabResponse,
  RenameTabResponse,
  ToolPermissionResponse
} from '../../shared/messages';

const OH_MY_HOOKS: Array<{ id: string; description: string }> = [
  { id: 'todo-continuation-enforcer', description: 'Ensures tasks are completed' },
  { id: 'context-window-monitor', description: 'Monitors context window usage' },
  { id: 'session-recovery', description: 'Automatic session recovery' },
  { id: 'session-notification', description: 'Session event notifications' },
  { id: 'comment-checker', description: 'Code comment validation' },
  { id: 'grep-output-truncator', description: 'Truncates large grep outputs' },
  { id: 'tool-output-truncator', description: 'Manages tool output sizes' },
  { id: 'directory-agents-injector', description: 'Injects directory-specific agents' },
  { id: 'directory-readme-injector', description: 'Adds README context' },
  { id: 'empty-task-response-detector', description: 'Detects empty responses' },
  { id: 'think-mode', description: 'Enables thinking mode' },
  { id: 'anthropic-context-window-limit-recovery', description: 'Handles Anthropic limits' },
  { id: 'rules-injector', description: 'Injects custom rules' },
  { id: 'background-notification', description: 'Background notifications' },
  { id: 'auto-update-checker', description: 'Checks for updates' },
  { id: 'startup-toast', description: 'Startup notifications' },
  { id: 'keyword-detector', description: 'Keyword detection' },
  { id: 'agent-usage-reminder', description: 'Agent usage reminders' },
  { id: 'non-interactive-env', description: 'Non-interactive environment handling' },
  { id: 'interactive-bash-session', description: 'Interactive session management' },
  { id: 'empty-message-sanitizer', description: 'Cleans empty messages' },
  { id: 'compaction-context-injector', description: 'Context compaction' },
  { id: 'thinking-block-validator', description: 'Validates thinking blocks' },
  { id: 'claude-code-hooks', description: 'Claude-specific hooks' },
  { id: 'ralph-loop', description: 'Ralph agent loop' },
  { id: 'preemptive-compaction', description: 'Preemptive compaction' }
];

type OpenCodeMessageInfo = {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  title?: string;
  time?: { created: number; updated?: number };
  error?: unknown;
};

type OpenCodeTextPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text';
  text: string;
};

type OpenCodeReasoningPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'reasoning';
  text: string;
};

type OpenCodeToolPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'tool';
  callID: string;
  tool: string;
  state: {
    status: 'pending' | 'running' | 'completed' | 'error';
    input: Record<string, unknown>;
    output?: string;
    error?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  };
};

type OpenCodePatchPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'patch';
  hash: string;
  files: string[];
};

type OpenCodePermission = {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time?: { created: number };
};

type ChannelState = {
  channelId: string;
  cwd: string;
  sessionId: string;

  running: boolean;
  sseAbort: AbortController;

  assistantMessageIds: Set<string>;
  textParts: Map<string, { messageID: string; text: string }>;
  reasoningParts: Map<string, { messageID: string; text: string }>;
  sentToolUseIds: Set<string>;

  lastRevert?: { messageID: string; partID?: string };
};

export const IOpencodeAgentService = createDecorator<IOpencodeAgentService>('opencodeAgentService');

export interface IOpencodeAgentService {
  readonly _serviceBrand: undefined;

  setTransport(transport: ITransport): void;
  start(): void;
  fromClient(message: WebViewToExtensionMessage): Promise<void>;

  revertLastChange(): Promise<boolean>;
  openOhMyConfig(): Promise<void>;
}

export class OpencodeAgentService implements IOpencodeAgentService {
  readonly _serviceBrand: undefined;

  private transport?: ITransport;

  private lastActiveChannelId?: string;

  private readonly channels = new Map<string, ChannelState>();
  private readonly requestWaiters = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(
    @ILogService private readonly logService: ILogService,
    @IConfigurationService private readonly configService: IConfigurationService,
    @IWorkspaceService private readonly workspaceService: IWorkspaceService,
    @IWebViewService private readonly webViewService: IWebViewService,
    @IOpencodeClientService private readonly client: IOpencodeClientService
  ) {}

  setTransport(transport: ITransport): void {
    this.transport = transport;
  }

  start(): void {
    // no-op (SSE loops are started per-channel on launch)
  }

  async fromClient(message: WebViewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'launch_claude':
        await this.launchChannel(
          message.channelId,
          message.resume ?? null,
          message.cwd ?? undefined,
          message.initialMessage
        );
        return;
      case 'io_message':
        await this.onIoMessage(message.channelId, message.message);
        return;
      case 'interrupt_claude':
        await this.interrupt(message.channelId);
        return;
      case 'close_channel':
        this.closeChannel(message.channelId);
        return;
      case 'request':
        await this.handleRequestMessage(message as RequestMessage);
        return;
      case 'response':
        this.handleResponseMessage(message as ResponseMessage);
        return;
      case 'cancel_request':
        return;
      default:
        this.logService.warn(`[OpencodeAgentService] Unhandled message: ${(message as any).type}`);
    }
  }

  async revertLastChange(): Promise<boolean> {
    const channelId = this.lastActiveChannelId;
    const state = channelId ? this.channels.get(channelId) : undefined;
    if (!state?.lastRevert) {
      vscode.window.showWarningMessage('没有可回滚的最近改动（还没有产生可回滚的 patch）');
      return false;
    }

    try {
      await this.client.revert(
        state.sessionId,
        { messageID: state.lastRevert.messageID, partID: state.lastRevert.partID },
        state.cwd
      );
      vscode.window.showInformationMessage('已回滚最近改动');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`回滚失败: ${msg}`);
      return false;
    }
  }

  async openOhMyConfig(): Promise<void> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const configDir = (
      this.configService.getValue<string>('opencodeGui.configDir', '') ?? ''
    ).trim();

    const projectPath = path.join(cwd, '.opencode', 'oh-my-opencode.json');
    const userPaths = [
      configDir ? path.join(configDir, 'oh-my-opencode.json') : undefined,
      configDir ? path.join(configDir, 'opencode', 'oh-my-opencode.json') : undefined,
      path.join(os.homedir(), '.config', 'opencode', 'oh-my-opencode.json')
    ].filter(Boolean) as string[];

    const target = await this.pickExistingPath([projectPath, ...userPaths]);
    if (!target) {
      vscode.window.showWarningMessage(
        '未找到 oh-my-opencode 配置：.opencode/oh-my-opencode.json 或 ~/.config/opencode/oh-my-opencode.json'
      );
      return;
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  private async pickExistingPath(paths: string[]): Promise<string | undefined> {
    for (const p of paths) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(p));
        return p;
      } catch {
        // ignore
      }
    }
    return undefined;
  }

  private async launchChannel(
    channelId: string,
    resume: string | null,
    cwd: string | undefined,
    initialMessage: any | undefined
  ): Promise<void> {
    const workspaceCwd =
      this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const resolvedCwd = cwd ?? workspaceCwd;

    const sessionId = resume ?? (await this.createSessionForChannel(resolvedCwd, initialMessage));

    const existing = this.channels.get(channelId);
    if (existing) {
      // Re-launch: replace session binding
      try {
        existing.sseAbort.abort();
      } catch {}
      this.channels.delete(channelId);
    }

    const state: ChannelState = {
      channelId,
      cwd: resolvedCwd,
      sessionId,
      running: false,
      sseAbort: new AbortController(),
      assistantMessageIds: new Set<string>(),
      textParts: new Map(),
      reasoningParts: new Map(),
      sentToolUseIds: new Set<string>()
    };

    this.channels.set(channelId, state);
    this.lastActiveChannelId = channelId;
    this.startSseLoop(state).catch((error) => {
      this.logService.error(`[OpencodeAgentService] SSE loop failed: ${String(error)}`);
      this.sendToChannel(channelId, {
        type: 'result',
        is_error: true,
        message: String(error)
      });
    });

    // Tell UI the session id (and set busy)
    this.sendToChannel(channelId, {
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      timestamp: Date.now()
    });

    if (initialMessage) {
      await this.sendPrompt(state, initialMessage);
    }
  }

  private async createSessionForChannel(
    cwd: string,
    initialMessage: any | undefined
  ): Promise<string> {
    const title = this.deriveTitle(initialMessage) ?? 'OpenCode Session';
    const session = await this.client.createSession({ title }, cwd);
    const sessionId = String(session?.id ?? session?.sessionID ?? session);
    if (!sessionId) {
      throw new Error('Failed to create OpenCode session (missing id)');
    }
    return sessionId;
  }

  private deriveTitle(initialMessage: any | undefined): string | undefined {
    const text = initialMessage ? this.extractUserText(initialMessage) : '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return undefined;
    return cleaned.length > 60 ? cleaned.slice(0, 60) : cleaned;
  }

  private async onIoMessage(channelId: string, message: any): Promise<void> {
    const state = this.channels.get(channelId);
    if (!state) {
      this.logService.warn(`[OpencodeAgentService] io_message for missing channel: ${channelId}`);
      return;
    }

    this.lastActiveChannelId = channelId;
    await this.sendPrompt(state, message);
  }

  private async interrupt(channelId: string): Promise<void> {
    const state = this.channels.get(channelId);
    if (!state) return;

    try {
      await this.client.abort(state.sessionId, state.cwd);
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] abort failed: ${String(error)}`);
    } finally {
      state.running = false;
      this.flushPendingAssistantOutput(state);
      this.sendToChannel(channelId, { type: 'result', timestamp: Date.now() });
    }
  }

  private closeChannel(channelId: string): void {
    const state = this.channels.get(channelId);
    if (state) {
      try {
        state.sseAbort.abort();
      } catch {}
      this.channels.delete(channelId);
    }

    this.transport?.send({ type: 'close_channel', channelId });
  }

  private async sendPrompt(state: ChannelState, userMessage: any): Promise<void> {
    const text = this.extractUserText(userMessage);
    const trimmed = (text ?? '').trim();

    // 检查是否是会话级命令（/undo, /redo, /compact, /summarize, /init）
    if (trimmed.startsWith('/') && trimmed.length > 1) {
      const commandLine = trimmed.slice(1).trimStart();
      const firstSpace = commandLine.search(/\s/);
      const command = (firstSpace === -1 ? commandLine : commandLine.slice(0, firstSpace))
        .trim()
        .toLowerCase();
      const args = firstSpace === -1 ? '' : commandLine.slice(firstSpace).trimStart();

      switch (command) {
        case 'undo':
          await this.handleSessionUndo(state);
          return;
        case 'redo':
          await this.handleSessionRedo(state);
          return;
        case 'compact':
        case 'summarize':
          await this.handleSessionCompact(state);
          return;
        case 'init':
          await this.handleSessionInit(state, args);
          return;
      }

      // 其他命令通过 command API 发送
      const modelSetting = (
        this.configService.getValue<string>('opencodeGui.selectedModel', '') ?? ''
      ).trim();
      const selectedAgent = (
        this.configService.getValue<string>('opencodeGui.selectedAgent', '') ?? ''
      ).trim();
      const model = this.parseModel(modelSetting);

      const body: any = { command, arguments: args };
      if (model) body.model = model;
      if (selectedAgent) body.agent = selectedAgent;

      state.running = true;
      this.sendToChannel(state.channelId, {
        type: 'system',
        subtype: 'init',
        session_id: state.sessionId,
        timestamp: Date.now()
      });
      await this.client.command(state.sessionId, body, state.cwd);
      return;
    }

    // 正常消息处理
    const parts = [{ type: 'text', text }];

    const modelSetting = (
      this.configService.getValue<string>('opencodeGui.selectedModel', '') ?? ''
    ).trim();
    const selectedAgent = (
      this.configService.getValue<string>('opencodeGui.selectedAgent', '') ?? ''
    ).trim();

    const model = this.parseModel(modelSetting);

    const body: any = {
      parts
    };

    if (model) {
      body.model = model;
    }

    if (selectedAgent) {
      body.agent = selectedAgent;
    }

    state.running = true;
    await this.client.prompt(state.sessionId, body, state.cwd);
  }

  private async handleSessionUndo(state: ChannelState): Promise<void> {
    state.running = true;
    this.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'init',
      session_id: state.sessionId,
      timestamp: Date.now()
    });

    try {
      // 获取当前会话状态
      const session = await this.client.getSession(state.sessionId, state.cwd);
      const revertMessageId = session?.revert?.messageID ?? session?.revertMessageID;

      // 获取用户消息列表
      const messages = await this.client.listMessages(state.sessionId, state.cwd);
      const items: any[] = Array.isArray(messages)
        ? messages
        : (messages?.messages ?? messages?.data ?? []);
      const userMessageIds = items
        .filter((item) => {
          const info = item?.info ?? item?.message ?? item;
          return String(info?.role ?? '').trim() === 'user';
        })
        .map((item) => {
          const info = item?.info ?? item?.message ?? item;
          return String(info?.id ?? '').trim();
        })
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      // 确定要撤销到的目标消息
      let target: string | undefined;
      if (revertMessageId) {
        // 找到 revert 点之前的最后一条用户消息
        for (const id of userMessageIds) {
          if (id < revertMessageId) target = id;
        }
      } else {
        // 没有 revert 点，撤销最后一条
        target = userMessageIds.at(-1);
      }

      if (!target) {
        this.sendToChannel(state.channelId, {
          type: 'assistant',
          timestamp: Date.now(),
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '没有可撤销的上一条消息。' }]
          }
        });
        state.running = false;
        this.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
        return;
      }

      await this.client.revert(state.sessionId, { messageID: target }, state.cwd);

      // 清空缓冲区并发送刷新事件
      state.assistantMessageIds.clear();
      state.textParts.clear();
      state.reasoningParts.clear();
      state.sentToolUseIds.clear();

      this.sendToChannel(state.channelId, {
        type: 'system',
        subtype: 'refresh',
        session_id: state.sessionId,
        timestamp: Date.now()
      });

      state.running = false;
      this.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logService.warn(`[OpencodeAgentService] /undo failed: ${msg}`);
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: { role: 'assistant', content: [{ type: 'text', text: `撤销失败: ${msg}` }] }
      });
      state.running = false;
      this.sendToChannel(state.channelId, {
        type: 'result',
        is_error: true,
        message: msg,
        timestamp: Date.now()
      });
    }
  }

  private async handleSessionRedo(state: ChannelState): Promise<void> {
    state.running = true;
    this.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'init',
      session_id: state.sessionId,
      timestamp: Date.now()
    });

    try {
      // 获取当前会话状态
      const session = await this.client.getSession(state.sessionId, state.cwd);
      const revertMessageId = session?.revert?.messageID ?? session?.revertMessageID;

      if (!revertMessageId) {
        this.sendToChannel(state.channelId, {
          type: 'assistant',
          timestamp: Date.now(),
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '当前没有可重做的撤销记录。' }]
          }
        });
        state.running = false;
        this.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
        return;
      }

      // 获取用户消息列表
      const messages = await this.client.listMessages(state.sessionId, state.cwd);
      const items: any[] = Array.isArray(messages)
        ? messages
        : (messages?.messages ?? messages?.data ?? []);
      const userMessageIds = items
        .filter((item) => {
          const info = item?.info ?? item?.message ?? item;
          return String(info?.role ?? '').trim() === 'user';
        })
        .map((item) => {
          const info = item?.info ?? item?.message ?? item;
          return String(info?.id ?? '').trim();
        })
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      // 找到 revert 点之后的下一条用户消息
      const next = userMessageIds.find((id) => id > revertMessageId);

      if (!next) {
        // 没有下一条，完全取消 revert
        await this.client.unrevert(state.sessionId, state.cwd);
      } else {
        // 移动到下一条用户消息
        await this.client.revert(state.sessionId, { messageID: next }, state.cwd);
      }

      // 清空缓冲区并发送刷新事件
      state.assistantMessageIds.clear();
      state.textParts.clear();
      state.reasoningParts.clear();
      state.sentToolUseIds.clear();

      this.sendToChannel(state.channelId, {
        type: 'system',
        subtype: 'refresh',
        session_id: state.sessionId,
        timestamp: Date.now()
      });

      state.running = false;
      this.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logService.warn(`[OpencodeAgentService] /redo failed: ${msg}`);
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: { role: 'assistant', content: [{ type: 'text', text: `重做失败: ${msg}` }] }
      });
      state.running = false;
      this.sendToChannel(state.channelId, {
        type: 'result',
        is_error: true,
        message: msg,
        timestamp: Date.now()
      });
    }
  }

  private async handleSessionCompact(state: ChannelState): Promise<void> {
    state.running = true;
    this.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'init',
      session_id: state.sessionId,
      timestamp: Date.now()
    });

    try {
      const modelSetting = (
        this.configService.getValue<string>('opencodeGui.selectedModel', '') ?? ''
      ).trim();
      const model = this.parseModel(modelSetting);

      if (!model) {
        this.sendToChannel(state.channelId, {
          type: 'assistant',
          timestamp: Date.now(),
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '请先在顶部选择用于压缩的模型（provider/model）。' }]
          }
        });
        state.running = false;
        this.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
        return;
      }

      await this.client.summarize(
        state.sessionId,
        { providerID: model.providerID, modelID: model.modelID },
        state.cwd
      );

      // summarize 是异步的，输出通过 SSE 返回，session.idle 时结束
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logService.warn(`[OpencodeAgentService] /compact failed: ${msg}`);
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: { role: 'assistant', content: [{ type: 'text', text: `压缩失败: ${msg}` }] }
      });
      state.running = false;
      this.sendToChannel(state.channelId, {
        type: 'result',
        is_error: true,
        message: msg,
        timestamp: Date.now()
      });
    }
  }

  private async handleSessionInit(state: ChannelState, args: string): Promise<void> {
    state.running = true;
    this.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'init',
      session_id: state.sessionId,
      timestamp: Date.now()
    });

    try {
      await this.client.init(state.sessionId, { arguments: args }, state.cwd);
      // init 是异步的，输出通过 SSE 返回
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logService.warn(`[OpencodeAgentService] /init failed: ${msg}`);
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: { role: 'assistant', content: [{ type: 'text', text: `初始化失败: ${msg}` }] }
      });
      state.running = false;
      this.sendToChannel(state.channelId, {
        type: 'result',
        is_error: true,
        message: msg,
        timestamp: Date.now()
      });
    }
  }

  private extractUserText(userMessage: any): string {
    const content = userMessage?.message?.content ?? userMessage?.content ?? userMessage;

    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
      return content
        .map((b: any) => {
          if (!b || typeof b !== 'object') return '';
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
          return '';
        })
        .join('\n');
    }

    return String(content ?? '');
  }

  private parseModel(value: string): { providerID: string; modelID: string } | undefined {
    if (!value) return undefined;
    const idx = value.indexOf('/');
    if (idx <= 0 || idx === value.length - 1) return undefined;
    const providerID = value.slice(0, idx).trim();
    const modelID = value.slice(idx + 1).trim();
    if (!providerID || !modelID) return undefined;
    return { providerID, modelID };
  }

  private async startSseLoop(state: ChannelState): Promise<void> {
    for await (const evt of this.client.subscribeEvents(state.cwd, state.sseAbort.signal)) {
      await this.handleEvent(state, evt);
    }
  }

  private async handleEvent(state: ChannelState, evt: OpencodeEvent): Promise<void> {
    switch (evt.type) {
      case 'message.updated':
        this.onMessageUpdated(state, evt);
        return;
      case 'message.part.updated':
        this.onMessagePartUpdated(state, evt);
        return;
      case 'permission.updated':
        await this.onPermissionUpdated(state, evt);
        return;
      case 'session.idle':
        this.onSessionIdle(state, evt);
        return;
      case 'session.error':
        this.onSessionError(state, evt);
        return;
      default:
        return;
    }
  }

  private onMessageUpdated(state: ChannelState, evt: OpencodeEvent): void {
    const info = (evt.properties as any)?.info as OpenCodeMessageInfo | undefined;
    if (!info || info.sessionID !== state.sessionId) return;

    if (info.role === 'assistant') {
      state.assistantMessageIds.add(info.id);
    }
  }

  private onMessagePartUpdated(state: ChannelState, evt: OpencodeEvent): void {
    const part = (evt.properties as any)?.part as any;

    if (!part || typeof part !== 'object' || part.sessionID !== state.sessionId) return;

    const delta = (evt.properties as any)?.delta as string | undefined;

    switch (part.type) {
      case 'text': {
        if (!state.assistantMessageIds.has(part.messageID)) {
          // Ignore text parts for user messages (our prompt is already rendered by the WebView)
          return;
        }
        const tp = part as OpenCodeTextPart;
        this.upsertDelta(state.textParts, tp.id, tp.messageID, delta, tp.text);
        return;
      }
      case 'reasoning': {
        state.assistantMessageIds.add(part.messageID);
        const rp = part as OpenCodeReasoningPart;
        this.upsertDelta(state.reasoningParts, rp.id, rp.messageID, delta, rp.text);
        return;
      }
      case 'tool':
        state.assistantMessageIds.add(part.messageID);
        this.onToolPart(state, part as OpenCodeToolPart);
        return;
      case 'patch': {
        state.assistantMessageIds.add(part.messageID);
        const pp = part as OpenCodePatchPart;
        state.lastRevert = { messageID: pp.messageID, partID: pp.id };
        return;
      }
      default:
        return;
    }
  }

  private upsertDelta(
    map: Map<string, { messageID: string; text: string }>,
    partId: string,
    messageID: string,
    delta: string | undefined,
    fullText: string
  ): void {
    const existing = map.get(partId);
    if (delta) {
      map.set(partId, { messageID, text: (existing?.text ?? '') + delta });
    } else {
      map.set(partId, { messageID, text: fullText });
    }
  }

  private onToolPart(state: ChannelState, part: OpenCodeToolPart): void {
    const toolUseId = part.callID || part.id;
    if (!toolUseId) return;

    if (!state.sentToolUseIds.has(toolUseId)) {
      state.sentToolUseIds.add(toolUseId);
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: {
          id: part.messageID,
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: toolUseId,
              name: part.tool,
              input: {
                ...part.state.input,
                title: part.state.title,
                status: part.state.status
              }
            }
          ]
        }
      });
    }

    if (part.state.status === 'completed') {
      this.sendToChannel(state.channelId, {
        type: 'user',
        timestamp: Date.now(),
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: part.state.output ?? '',
              is_error: false
            }
          ]
        }
      });
      return;
    }

    if (part.state.status === 'error') {
      this.sendToChannel(state.channelId, {
        type: 'user',
        timestamp: Date.now(),
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: part.state.error ?? 'Tool error',
              is_error: true
            }
          ]
        }
      });
    }
  }

  private async onPermissionUpdated(state: ChannelState, evt: OpencodeEvent): Promise<void> {
    const p = evt.properties as unknown as OpenCodePermission;
    if (!p || p.sessionID !== state.sessionId) return;

    const requestId = Math.random().toString(36).slice(2);

    const responsePromise = new Promise<ToolPermissionResponse>((resolve, reject) => {
      this.requestWaiters.set(requestId, { resolve: resolve as any, reject });
    });

    this.transport?.send({
      type: 'request',
      channelId: state.channelId,
      requestId,
      request: {
        type: 'tool_permission_request',
        toolName: p.type || 'permission',
        inputs: {
          title: p.title,
          pattern: p.pattern,
          metadata: p.metadata
        },
        // Provide a non-empty list so WebView shows "Yes, and don't ask again" (mapped to OpenCode "always").
        suggestions: [{} as any]
      }
    });

    const resp = await responsePromise;
    const decision = resp?.result;
    const remember =
      decision?.behavior === 'allow' &&
      Array.isArray((decision as any)?.updatedPermissions) &&
      (decision as any).updatedPermissions.length > 0;
    const opencodeResponse =
      decision?.behavior === 'allow' ? (remember ? 'always' : 'once') : 'reject';

    await this.client.respondPermission(
      state.sessionId,
      p.id,
      opencodeResponse,
      state.cwd,
      remember ? true : undefined
    );
  }

  private onSessionIdle(state: ChannelState, evt: OpencodeEvent): void {
    const sessionID = (evt.properties as any)?.sessionID as string | undefined;
    if (!sessionID || sessionID !== state.sessionId) return;

    if (!state.running) {
      return;
    }

    state.running = false;
    this.flushPendingAssistantOutput(state);
    this.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
  }

  private onSessionError(state: ChannelState, evt: OpencodeEvent): void {
    const sessionID = (evt.properties as any)?.sessionID as string | undefined;
    if (sessionID && sessionID !== state.sessionId) return;

    const err = (evt.properties as any)?.error;
    const msg = err?.data?.message ?? err?.data?.providerID ?? 'OpenCode session error';

    this.sendToChannel(state.channelId, {
      type: 'assistant',
      timestamp: Date.now(),
      message: {
        id: (err as any)?.messageID ?? undefined,
        role: 'assistant',
        content: [{ type: 'text', text: String(msg) }]
      }
    });
  }

  private flushPendingAssistantOutput(state: ChannelState): void {
    const thinking = Array.from(state.reasoningParts.values())
      .map((p) => p.text)
      .join('');
    const text = Array.from(state.textParts.values())
      .map((p) => p.text)
      .join('');

    state.reasoningParts.clear();
    state.textParts.clear();

    if (thinking.trim()) {
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: {
          id: null,
          role: 'assistant',
          content: [{ type: 'thinking', thinking }]
        }
      });
    }

    if (text.trim()) {
      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: {
          id: null,
          role: 'assistant',
          content: [{ type: 'text', text }]
        }
      });
    }
  }

  private async handleRequestMessage(message: RequestMessage): Promise<void> {
    try {
      const response = await this.dispatchRequest(message);
      this.transport?.send({ type: 'response', requestId: message.requestId, response });
    } catch (error) {
      const err: ErrorResponse = {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
      this.transport?.send({ type: 'response', requestId: message.requestId, response: err });
    }
  }

  private handleResponseMessage(message: ResponseMessage): void {
    const waiter = this.requestWaiters.get(message.requestId);
    if (!waiter) return;
    this.requestWaiters.delete(message.requestId);

    const resp: any = (message as any).response;
    if (resp && resp.type === 'error') {
      waiter.reject(new Error(resp.error));
    } else {
      waiter.resolve(resp);
    }
  }

  private async dispatchRequest(
    message: RequestMessage
  ): Promise<
    | InitResponse
    | GetClaudeStateResponse
    | GetClaudeConfigResponse
    | SaveClaudeConfigResponse
    | GetCurrentSelectionResponse
    | GetMcpServersResponse
    | GetAssetUrisResponse
    | ListSessionsResponse
    | GetSessionResponse
    | GetAgentsResponse
    | ToggleAgentResponse
    | DeleteAgentResponse
    | GetSkillsResponse
    | ToggleSkillResponse
    | DeleteSkillResponse
    | SetModelResponse
    | SetPermissionModeResponse
    | SetThinkingLevelResponse
    | ListFilesResponse
    | ShowNotificationResponse
    | OpenContentResponse
    | OpenDiffResponse
    | ExecResponse
    | OpenConfigFileResponse
    | OpenClaudeInTerminalResponse
    | NewConversationTabResponse
    | RenameTabResponse
    | any
  > {
    const req: any = (message as any).request;

    switch (req?.type) {
      case 'init':
        return this.handleInit();
      case 'get_claude_state':
        return this.handleGetClaudeState();
      case 'get_claude_config':
        return this.handleGetClaudeConfig(req.scope, req.configType);
      case 'save_claude_config':
        return this.handleSaveClaudeConfig(req.config, req.scope, req.configType);
      case 'get_current_selection':
        return this.handleGetCurrentSelection();
      case 'get_mcp_servers':
        return this.handleGetMcpServers();
      case 'get_asset_uris':
        return this.handleGetAssetUris();
      case 'list_sessions_request':
        return this.handleListSessions();
      case 'get_session_request':
        return this.handleGetSession(String(req.sessionId));
      case 'list_files_request':
        return this.handleListFiles(req.pattern);

      case 'set_model':
        await this.configService.updateValue(
          'opencodeGui.selectedModel',
          String(req.model?.value ?? '')
        );
        return { type: 'set_model_response', success: true };

      case 'set_work_mode':
        return { type: 'set_work_mode_response', success: true };

      case 'set_permission_mode':
        return { type: 'set_permission_mode_response', success: true };

      case 'set_thinking_level':
        return { type: 'set_thinking_level_response' };

      case 'open_file':
        await this.openFile(String(req.filePath), req.location);
        return { type: 'open_file_response' };

      case 'open_content':
        return this.handleOpenContent(
          String(req.content ?? ''),
          String(req.fileName ?? 'opencode.txt'),
          !!req.editable
        );

      case 'open_diff':
        return this.handleOpenDiff(req);

      case 'open_url':
        vscode.env.openExternal(vscode.Uri.parse(String(req.url)));
        return { type: 'open_url_response' };

      case 'show_notification':
        return this.handleShowNotification(req as ShowNotificationRequest);

      case 'exec':
        return this.handleExec(
          String(req.command ?? ''),
          Array.isArray(req.params) ? req.params : []
        );

      case 'new_conversation_tab':
        return this.handleNewConversationTab();

      case 'rename_tab':
        return { type: 'rename_tab_response' };

      case 'open_config_file':
        await this.handleOpenConfigFile(String(req.configType ?? ''));
        return { type: 'open_config_file_response' };

      case 'open_claude_in_terminal':
        await this.handleOpenInTerminal();
        return { type: 'open_claude_in_terminal_response' };

      case 'get_agents':
        return this.handleGetAgents();

      case 'toggle_agent':
        return this.handleToggleAgent(String(req.agentName ?? ''), !!req.enabled);

      case 'delete_agent':
        return this.handleDeleteAgent(String(req.agentPath ?? ''));

      case 'get_skills':
        return this.handleGetSkills();

      case 'toggle_skill':
        return this.handleToggleSkill(String(req.skillId ?? ''), !!req.enabled);

      case 'delete_skill':
        return this.handleDeleteSkill(String(req.skillPath ?? ''));

      default:
        this.logService.warn(`[OpencodeAgentService] Unhandled request: ${String(req?.type)}`);
        return { type: 'noop' };
    }
  }

  private handleInit(): InitResponse {
    const defaultCwd =
      this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const modelSetting = this.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '';

    return {
      type: 'init_response',
      state: {
        defaultCwd,
        openNewInTab: false,
        modelSetting,
        platform: process.platform,
        thinkingLevel: 'default_on'
      }
    };
  }

  private async handleGetClaudeState(): Promise<GetClaudeStateResponse> {
    // WebView 侧需要一个 config 对象来初始化模型/Slash Commands。
    // OpenCode 版本先返回最小结构，后续再用 /provider /config/providers 等补齐。
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();

    try {
      const raw = await this.client.listConfigProviders(cwd);
      const providers: any[] = Array.isArray(raw?.providers) ? raw.providers : [];
      let models = this.mapProvidersToModels(providers);

      // Fallback: some versions may only expose models via `/provider`.
      if (models.length === 0) {
        const rawProviders = await this.client.listProviders(cwd);
        const providersAlt: any[] = Array.isArray(rawProviders?.all)
          ? rawProviders.all
          : Array.isArray(rawProviders?.providers)
            ? rawProviders.providers
            : Array.isArray(rawProviders)
              ? rawProviders
              : [];
        models = this.mapProvidersToModels(providersAlt);
      }

      return {
        type: 'get_claude_state_response',
        config: {
          models,
          slashCommands: []
        }
      };
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] Failed to load providers: ${String(error)}`);
      return {
        type: 'get_claude_state_response',
        config: {
          models: [],
          slashCommands: []
        }
      };
    }
  }

  private mapProvidersToModels(
    providers: any[]
  ): Array<{ value: string; displayName?: string; description?: string }> {
    const out: Array<{ value: string; displayName?: string; description?: string }> = [];

    for (const p of providers ?? []) {
      const providerID = String(p?.id ?? p?.providerID ?? p?.name ?? '').trim();
      if (!providerID) continue;

      const providerName = String(p?.name ?? providerID);
      const providerDesc = typeof p?.description === 'string' ? p.description : undefined;

      const modelsRaw = Array.isArray(p?.models)
        ? p.models
        : Array.isArray(p?.modelIDs)
          ? p.modelIDs
          : Array.isArray(p?.modelIds)
            ? p.modelIds
            : [];

      for (const m of modelsRaw) {
        const modelID =
          typeof m === 'string' ? m : String(m?.id ?? m?.modelID ?? m?.name ?? '').trim();
        if (!modelID) continue;

        const displayName =
          typeof m === 'string'
            ? `${providerName}/${modelID}`
            : String(m?.displayName ?? m?.name ?? `${providerName}/${modelID}`);

        const description =
          typeof m === 'string' ? providerDesc : String(m?.description ?? providerDesc ?? '');

        out.push({
          value: `${providerID}/${modelID}`,
          displayName,
          description: description || undefined
        });
      }
    }

    out.sort((a, b) =>
      String(a.displayName ?? a.value).localeCompare(String(b.displayName ?? b.value))
    );
    return out;
  }

  private async handleGetClaudeConfig(
    scope: 'user' | 'project' | 'merged' = 'merged',
    configType: 'settings' | 'mcp' = 'settings'
  ): Promise<GetClaudeConfigResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();

    const userConfig =
      scope === 'project'
        ? undefined
        : await this.readJsonFile(this.getUserGuiConfigPath(configType)).catch(() => undefined);

    const projectConfig =
      scope === 'user'
        ? undefined
        : await this.readJsonFile(this.getProjectGuiConfigPath(cwd, configType)).catch(
            () => undefined
          );

    const merged =
      scope === 'merged' ? { ...(userConfig ?? {}), ...(projectConfig ?? {}) } : undefined;

    const config =
      (scope === 'user' ? userConfig : scope === 'project' ? projectConfig : merged) ?? {};

    // Provide safe defaults so Settings UI can render without special-casing.
    if (!config.env) config.env = {};
    if (!config.permissions) config.permissions = { allow: [], deny: [] };
    if (!config.mcpServers) config.mcpServers = {};
    if (!config.additionalDirectories) config.additionalDirectories = [];

    return { type: 'get_claude_config_response', config };
  }

  private async handleSaveClaudeConfig(
    config: any,
    scope: 'user' | 'project' = 'user',
    configType: 'settings' | 'mcp' = 'settings'
  ): Promise<SaveClaudeConfigResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const targetPath =
      scope === 'project'
        ? this.getProjectGuiConfigPath(cwd, configType)
        : this.getUserGuiConfigPath(configType);

    try {
      await this.writeJsonFile(targetPath, config ?? {});
      return { type: 'save_claude_config_response', success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { type: 'save_claude_config_response', success: false, error: msg };
    }
  }

  private async handleGetMcpServers(): Promise<GetMcpServersResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    try {
      const raw = await this.client.getMcpStatus(cwd);
      const entries = Object.entries(raw ?? {});
      const mcpServers = entries.map(([name, status]) => ({
        name,
        status:
          typeof (status as any)?.status === 'string' ? String((status as any).status) : 'unknown'
      }));
      return { type: 'get_mcp_servers_response', mcpServers };
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] Failed to get MCP status: ${String(error)}`);
      return { type: 'get_mcp_servers_response', mcpServers: [] };
    }
  }

  private async handleGetAgents(): Promise<GetAgentsResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const ohMy = await this.readOhMyConfig(cwd).catch(() => undefined);
    const ohMyConfig = (ohMy as any)?.config as any;

    const raw = await this.client.listAgents(cwd);
    const agents: any[] = Array.isArray(raw) ? raw : (raw?.agents ?? []);

    const mapped = agents.map((a) => {
      const name = String(a?.name ?? a?.id ?? a?.slug ?? 'agent');
      const description = String(a?.description ?? a?.prompt ?? '');
      const category = String(a?.category ?? a?.type ?? 'OpenCode');

      const configuredEnabled = ohMyConfig?.agents?.[name]?.enabled;
      const enabled =
        typeof configuredEnabled === 'boolean'
          ? configuredEnabled
          : typeof a?.enabled === 'boolean'
            ? a.enabled
            : typeof a?.disabled === 'boolean'
              ? !a.disabled
              : true;

      return {
        name,
        description,
        category,
        path: name,
        tools: Array.isArray(a?.tools) ? a.tools.map((t: any) => String(t)) : undefined,
        model: a?.model ? String(a.model) : undefined,
        enabled
      };
    });

    return { type: 'get_agents_response', agents: mapped };
  }

  private async handleToggleAgent(
    agentName: string,
    enabled: boolean
  ): Promise<ToggleAgentResponse> {
    if (!agentName) {
      return { type: 'toggle_agent_response', success: false, error: 'agentName 为空' };
    }

    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const targetPath = this.getProjectOhMyConfigPath(cwd);

    try {
      const existing = (await this.readJsonFile(targetPath).catch(() => undefined)) ?? {};
      const next = { ...(existing ?? {}) } as any;
      if (!next.agents || typeof next.agents !== 'object') next.agents = {};

      const prev = next.agents[agentName];
      next.agents[agentName] =
        prev && typeof prev === 'object' ? { ...prev, enabled } : { enabled, replace_plan: true };

      await this.writeJsonFile(targetPath, next);
      return { type: 'toggle_agent_response', success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { type: 'toggle_agent_response', success: false, error: msg };
    }
  }

  private async handleDeleteAgent(_agentPath: string): Promise<DeleteAgentResponse> {
    return {
      type: 'delete_agent_response',
      success: false,
      error:
        'OpenCode Agents 由 server/插件提供，GUI 暂不支持删除（可在 oh-my-opencode.json 中禁用）。'
    };
  }

  private async handleGetSkills(): Promise<GetSkillsResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const ohMy = await this.readOhMyConfig(cwd).catch(() => undefined);
    const ohMyConfig = (ohMy as any)?.config as any;
    const disabled = new Set<string>(
      Array.isArray(ohMyConfig?.disabled_hooks) ? ohMyConfig?.disabled_hooks : []
    );

    const skills = OH_MY_HOOKS.map((h) => ({
      id: h.id,
      name: h.id,
      description: h.description,
      version: undefined,
      author: 'oh-my-opencode',
      license: undefined,
      path: h.id,
      enabled: !disabled.has(h.id)
    }));

    return { type: 'get_skills_response', skills };
  }

  private async handleToggleSkill(skillId: string, enabled: boolean): Promise<ToggleSkillResponse> {
    if (!skillId) {
      return { type: 'toggle_skill_response', success: false, error: 'skillId 为空' };
    }

    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const targetPath = this.getProjectOhMyConfigPath(cwd);

    try {
      const existing = (await this.readJsonFile(targetPath).catch(() => undefined)) ?? {};
      const next = { ...(existing ?? {}) } as any;

      const current = new Set<string>(
        Array.isArray(next.disabled_hooks) ? next.disabled_hooks : []
      );
      if (enabled) {
        current.delete(skillId);
      } else {
        current.add(skillId);
      }
      next.disabled_hooks = Array.from(current.values()).sort((a, b) => a.localeCompare(b));

      await this.writeJsonFile(targetPath, next);
      return { type: 'toggle_skill_response', success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { type: 'toggle_skill_response', success: false, error: msg };
    }
  }

  private async handleDeleteSkill(_skillPath: string): Promise<DeleteSkillResponse> {
    return {
      type: 'delete_skill_response',
      success: false,
      error: 'oh-my-opencode hooks 暂不支持删除（可禁用/启用）。'
    };
  }

  private async handleListFiles(pattern?: string): Promise<ListFilesResponse> {
    const query = String(pattern ?? '').trim();
    if (!query) {
      return { type: 'list_files_response', files: [] };
    }

    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const exclude =
      '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.vscode/**,**/.idea/**}';

    const normalized = query.replace(/\\\\/g, '/');
    const glob = normalized === '*' || normalized === '**' ? '**/*' : `**/*${normalized}*`;

    const uris = await vscode.workspace.findFiles(glob, exclude, 200);

    const toRel = (uri: vscode.Uri) =>
      vscode.workspace.asRelativePath(uri, false).replace(/\\\\/g, '/');

    const files: Array<{ path: string; name: string; type: string; mtime?: number }> = [];
    for (const uri of uris) {
      if (uri.scheme !== 'file') continue;
      const rel = toRel(uri);
      const name = path.posix.basename(rel);
      let mtime: number | undefined;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        mtime = stat.mtime;
      } catch {
        // ignore
      }
      files.push({ path: rel, name, type: 'file', mtime });
    }

    const seenDirs = new Set<string>();
    const dirs: Array<{ path: string; name: string; type: string; mtime?: number }> = [];
    const addDir = (dir: string) => {
      const d = dir.replace(/\\\\/g, '/').replace(/\/+$/, '');
      if (!d || d === '.' || seenDirs.has(d)) return;
      seenDirs.add(d);
      dirs.push({ path: d, name: path.posix.basename(d), type: 'directory' });
    };

    if (normalized === '*' || normalized === '**') {
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(cwd));
        for (const [name, t] of entries) {
          if (t !== vscode.FileType.Directory) continue;
          if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build')
            continue;
          addDir(name);
        }
      } catch {
        // ignore
      }
    } else {
      for (const f of files) {
        const dir = path.posix.dirname(f.path);
        if (dir && dir !== '.') addDir(dir);
      }
    }

    const merged = [...dirs, ...files].slice(0, 200);
    return { type: 'list_files_response', files: merged };
  }

  private async handleShowNotification(
    req: ShowNotificationRequest
  ): Promise<ShowNotificationResponse> {
    const buttons = Array.isArray(req.buttons) ? req.buttons.map((b) => String(b)) : [];
    let buttonValue: string | undefined;

    if (req.severity === 'error') {
      buttonValue = await vscode.window.showErrorMessage(req.message, ...buttons);
    } else if (req.severity === 'warning') {
      buttonValue = await vscode.window.showWarningMessage(req.message, ...buttons);
    } else {
      buttonValue = await vscode.window.showInformationMessage(req.message, ...buttons);
    }

    return { type: 'show_notification_response', buttonValue };
  }

  private async handleExec(command: string, params: string[]): Promise<ExecResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    return new Promise<ExecResponse>((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn(command, params, { cwd, shell: false, windowsHide: true });
      proc.stdout?.on('data', (data: Buffer) => (stdout += data.toString()));
      proc.stderr?.on('data', (data: Buffer) => (stderr += data.toString()));
      proc.on('close', (code: number | null) => {
        resolve({ type: 'exec_response', stdout, stderr, exitCode: code ?? 0 });
      });
      proc.on('error', (error: Error) => {
        resolve({ type: 'exec_response', stdout: '', stderr: error.message, exitCode: 1 });
      });
    });
  }

  private async handleOpenContent(
    content: string,
    fileName: string,
    editable: boolean
  ): Promise<OpenContentResponse> {
    if (!editable) {
      const document = await vscode.workspace.openTextDocument({
        content,
        language: this.detectLanguage(fileName)
      });
      await vscode.window.showTextDocument(document, { preview: true });
      return { type: 'open_content_response' };
    }

    const tempPath = await this.createTempFile(fileName || 'opencode.txt', content);
    const tempUri = vscode.Uri.file(tempPath);
    const document = await vscode.workspace.openTextDocument(tempUri);
    await vscode.window.showTextDocument(document, { preview: false });

    const updatedContent = await this.waitForDocumentEdits(document);
    return { type: 'open_content_response', updatedContent };
  }

  private async handleOpenDiff(request: any): Promise<OpenDiffResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const originalPath = this.resolveFilePath(String(request.originalFilePath ?? ''), cwd);
    const fallbackNewPath = request.newFilePath
      ? this.resolveFilePath(String(request.newFilePath), cwd)
      : undefined;

    const rightPath = await this.prepareDiffRightFile(
      originalPath,
      fallbackNewPath,
      request.edits ?? []
    );
    const leftExists = await this.pathExists(originalPath);
    const leftPath = leftExists
      ? originalPath
      : await this.createTempFile(
          path.basename(String(request.originalFilePath ?? request.newFilePath ?? 'untitled')),
          ''
        );

    await vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(leftPath),
      vscode.Uri.file(rightPath),
      `${path.basename(String(request.originalFilePath ?? request.newFilePath ?? rightPath))} (OpenCode)`,
      { preview: true }
    );

    return { type: 'open_diff_response', newEdits: request.edits ?? [] };
  }

  private async handleNewConversationTab(): Promise<NewConversationTabResponse> {
    try {
      await vscode.commands.executeCommand('opencode.chatView.focus');
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] Failed to focus chat view: ${String(error)}`);
    }
    return { type: 'new_conversation_tab_response' };
  }

  private async handleOpenConfigFile(configType: string): Promise<void> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    if (configType === 'oh-my-opencode') {
      await this.openOhMyConfig();
      return;
    }

    const target =
      configType === 'mcp'
        ? this.getProjectGuiConfigPath(cwd, 'mcp')
        : configType === 'project'
          ? this.getProjectGuiConfigPath(cwd, 'settings')
          : this.getUserGuiConfigPath('settings');

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target)));
    if (!(await this.pathExists(target))) {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from('{}', 'utf8'));
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  private async handleOpenInTerminal(): Promise<void> {
    const opencodePath =
      this.configService.getValue<string>('opencodeGui.opencodePath', 'opencode') ?? 'opencode';
    const terminal = vscode.window.createTerminal('OpenCode');
    terminal.show(true);
    terminal.sendText(opencodePath, true);
  }

  private getUserGuiConfigDir(): string {
    const configDir = (
      this.configService.getValue<string>('opencodeGui.configDir', '') ?? ''
    ).trim();
    if (configDir) return configDir;
    return path.join(os.homedir(), '.config', 'opencode');
  }

  private getUserGuiConfigPath(configType: 'settings' | 'mcp'): string {
    const baseDir = this.getUserGuiConfigDir();
    return path.join(
      baseDir,
      configType === 'mcp' ? 'opencode-gui-mcp.json' : 'opencode-gui-settings.json'
    );
  }

  private getProjectGuiConfigPath(cwd: string, configType: 'settings' | 'mcp'): string {
    const dir = path.join(cwd, '.opencode');
    return path.join(
      dir,
      configType === 'mcp' ? 'opencode-gui-mcp.json' : 'opencode-gui-settings.json'
    );
  }

  private getProjectOhMyConfigPath(cwd: string): string {
    return path.join(cwd, '.opencode', 'oh-my-opencode.json');
  }

  private async readOhMyConfig(cwd: string): Promise<{ path: string; config: any } | undefined> {
    const configDir = (
      this.configService.getValue<string>('opencodeGui.configDir', '') ?? ''
    ).trim();
    const candidates = [
      this.getProjectOhMyConfigPath(cwd),
      configDir ? path.join(configDir, 'oh-my-opencode.json') : undefined,
      configDir ? path.join(configDir, 'opencode', 'oh-my-opencode.json') : undefined,
      path.join(os.homedir(), '.config', 'opencode', 'oh-my-opencode.json')
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      const json = await this.readJsonFile(p).catch(() => undefined);
      if (json) return { path: p, config: json };
    }
    return undefined;
  }

  private async readJsonFile(filePath: string): Promise<any> {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const text = Buffer.from(data).toString('utf8');
    return JSON.parse(text || '{}');
  }

  private async writeJsonFile(filePath: string, json: any): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(filePath)));
    const text = JSON.stringify(json ?? {}, null, 2);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(text, 'utf8'));
  }

  private resolveFilePath(filePath: string, cwd: string): string {
    if (!filePath) return cwd;
    return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeFileName(fileName: string): string {
    const fallback = fileName && fileName.trim() ? fileName.trim() : 'opencode.txt';
    return fallback.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  }

  private detectLanguage(fileName?: string): string {
    if (!fileName) return 'plaintext';
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.json':
        return 'json';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.md':
        return 'markdown';
      case '.sh':
        return 'shellscript';
      case '.css':
        return 'css';
      case '.html':
      case '.htm':
        return 'html';
      default:
        return 'plaintext';
    }
  }

  private async createTempFile(fileName: string, content: string): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-'));
    const sanitized = this.sanitizeFileName(fileName);
    const filePath = path.join(tempDir, sanitized);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  private async prepareDiffRightFile(
    originalPath: string,
    fallbackPath: string | undefined,
    edits: Array<{ oldString: string; newString: string; replaceAll?: boolean }>
  ): Promise<string> {
    let baseContent = '';
    if (await this.pathExists(originalPath)) {
      baseContent = await fs.readFile(originalPath, 'utf8');
    } else if (fallbackPath && (await this.pathExists(fallbackPath))) {
      baseContent = await fs.readFile(fallbackPath, 'utf8');
    }

    let modified = baseContent;
    for (const edit of edits) {
      const oldString = edit.oldString ?? '';
      const newString = edit.newString ?? '';

      if (!oldString) {
        modified += newString;
        continue;
      }

      if (edit.replaceAll) {
        modified = modified.split(oldString).join(newString);
        continue;
      }

      const index = modified.indexOf(oldString);
      if (index >= 0) {
        modified = `${modified.slice(0, index)}${newString}${modified.slice(index + oldString.length)}`;
      } else {
        modified += newString;
      }
    }

    const baseName = path.basename(fallbackPath || originalPath || 'opencode.diff');
    const outputName = baseName.endsWith('.opencode') ? baseName : `${baseName}.opencode`;
    return this.createTempFile(outputName, modified);
  }

  private async waitForDocumentEdits(document: vscode.TextDocument): Promise<string> {
    let currentText = document.getText();
    let resolved = false;

    return new Promise<string>((resolve) => {
      const disposables: vscode.Disposable[] = [];
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        disposables.forEach((d) => d.dispose());
      };

      disposables.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
          if (event.document.uri.toString() === document.uri.toString()) {
            currentText = event.document.getText();
          }
        })
      );

      disposables.push(
        vscode.workspace.onDidSaveTextDocument((event) => {
          if (event.uri.toString() === document.uri.toString()) {
            currentText = event.getText();
            cleanup();
            resolve(currentText);
          }
        })
      );

      disposables.push(
        vscode.workspace.onDidCloseTextDocument((event) => {
          if (event.uri.toString() === document.uri.toString()) {
            cleanup();
            resolve(currentText);
          }
        })
      );
    });
  }

  private async handleGetCurrentSelection(): Promise<GetCurrentSelectionResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || editor.document.uri.scheme !== 'file') {
      return { type: 'get_current_selection_response', selection: null };
    }

    const document = editor.document;
    const selection = editor.selection;

    return {
      type: 'get_current_selection_response',
      selection: {
        filePath: document.uri.fsPath,
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
        startColumn: selection.start.character,
        endColumn: selection.end.character,
        selectedText: document.getText(selection)
      }
    };
  }

  private async handleGetAssetUris(): Promise<GetAssetUrisResponse> {
    const webview = this.webViewService.getWebView();

    // Fallback: if we can't access a webview instance, return empty (UI will still work).
    if (!webview) {
      return { type: 'asset_uris_response', assetUris: {} };
    }

    const assets = {
      clawd: {
        light: path.join('resources', 'clawd.svg'),
        dark: path.join('resources', 'clawd.svg')
      },
      'welcome-art': {
        light: path.join('resources', 'welcome-art-light.svg'),
        dark: path.join('resources', 'welcome-art-dark.svg')
      }
    } as const;

    const extensionPath = this.webViewService.getExtensionPath();
    const toWebviewUri = (relativePath: string) =>
      webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, relativePath))).toString();

    const assetUris = Object.fromEntries(
      Object.entries(assets).map(([key, value]) => [
        key,
        { light: toWebviewUri(value.light), dark: toWebviewUri(value.dark) }
      ])
    );

    return { type: 'asset_uris_response', assetUris };
  }

  private async handleListSessions(): Promise<ListSessionsResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const raw = await this.client.listSessions(cwd);
    const sessions: any[] = Array.isArray(raw) ? raw : (raw?.sessions ?? []);

    const mapped = sessions
      .filter((s) => !s?.directory || String(s.directory) === cwd)
      .map((s) => ({
        id: String(s.id),
        lastModified: Number(s?.time?.updated ?? s?.time?.created ?? Date.now()),
        messageCount: 0,
        summary: String(s?.title ?? s?.id),
        worktree: undefined,
        isCurrentWorkspace: true
      }));

    return { type: 'list_sessions_response', sessions: mapped };
  }

  private async handleGetSession(sessionId: string): Promise<GetSessionResponse> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const raw = await this.client.listMessages(sessionId, cwd);
    const items: Array<{ info: OpenCodeMessageInfo; parts: any[] }> = Array.isArray(raw)
      ? raw
      : (raw?.messages ?? []);

    // Minimal history conversion: return empty for now if format is unexpected.
    const events: any[] = [];
    for (const item of items) {
      const info = item?.info;
      const parts = Array.isArray(item?.parts) ? item.parts : [];
      if (!info || !info.sessionID || !info.id) continue;

      if (info.role === 'user') {
        const text = parts
          .filter((p) => p?.type === 'text')
          .map((p) => String(p.text ?? ''))
          .join('\n');
        events.push({
          type: 'user',
          timestamp: Number(info.time?.created ?? Date.now()),
          message: { role: 'user', content: [{ type: 'text', text }] }
        });
        continue;
      }

      if (info.role === 'assistant') {
        // Tool parts as tool_use/tool_result
        for (const p of parts) {
          if (p?.type !== 'tool') continue;
          const tp = p as OpenCodeToolPart;
          const toolUseId = tp.callID || tp.id;
          events.push({
            type: 'assistant',
            timestamp: Date.now(),
            message: {
              id: info.id,
              role: 'assistant',
              content: [
                { type: 'tool_use', id: toolUseId, name: tp.tool, input: tp.state?.input ?? {} }
              ]
            }
          });

          if (tp.state?.status === 'completed' || tp.state?.status === 'error') {
            events.push({
              type: 'user',
              timestamp: Date.now(),
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content:
                      tp.state?.status === 'completed'
                        ? (tp.state.output ?? '')
                        : (tp.state.error ?? ''),
                    is_error: tp.state?.status === 'error'
                  }
                ]
              }
            });
          }
        }

        // Reasoning as thinking
        const thinking = parts
          .filter((p) => p?.type === 'reasoning')
          .map((p) => String(p.text ?? ''))
          .join('');
        if (thinking.trim()) {
          events.push({
            type: 'assistant',
            timestamp: Date.now(),
            message: { id: info.id, role: 'assistant', content: [{ type: 'thinking', thinking }] }
          });
        }

        // Text as final output
        const text = parts
          .filter((p) => p?.type === 'text')
          .map((p) => String(p.text ?? ''))
          .join('');
        if (text.trim()) {
          events.push({
            type: 'assistant',
            timestamp: Date.now(),
            message: { id: info.id, role: 'assistant', content: [{ type: 'text', text }] }
          });
        }
      }
    }

    return { type: 'get_session_response', messages: events };
  }

  private async openFile(filePath: string, location?: any): Promise<void> {
    const cwd = this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    if (location) {
      const startLine = Math.max((location.startLine ?? 1) - 1, 0);
      const endLine = Math.max((location.endLine ?? location.startLine ?? 1) - 1, startLine);
      const startColumn = Math.max(location.startColumn ?? 0, 0);
      const endColumn = Math.max(location.endColumn ?? startColumn, startColumn);
      const range = new vscode.Range(
        new vscode.Position(startLine, startColumn),
        new vscode.Position(endLine, endColumn)
      );
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.end);
    }
  }

  private sendToChannel(channelId: string, event: any): void {
    this.transport?.send({ type: 'io_message', channelId, message: event, done: false });
  }
}
