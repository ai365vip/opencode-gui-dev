import * as vscode from 'vscode';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IWorkspaceService } from '../workspaceService';
import { IWebViewService } from '../webViewService';
import { ITransport } from '../transport';
import { IOpencodeClientService } from './OpencodeClientService';
import { IOpencodeServerService } from './OpencodeServerService';
import type { IOpencodeAgentService } from './OpencodeAgentService';
import {
  handleEvent as handleSseEvent,
  flushPendingAssistantOutput,
  type SseDeps
} from './agent/opencodeAgentSse';
import {
  buildToolUseInput as buildToolUseInputImpl,
  hasMeaningfulToolInput as hasMeaningfulToolInputImpl,
  upsertDelta as upsertDeltaImpl
} from './agent/opencodeAgentMessageTools';
import {
  pushProgressEvent as pushProgressEventImpl,
  getProgressSnapshot as getProgressSnapshotImpl
} from './agent/opencodeAgentProgress';
import {
  dispatchRequest as dispatchRequestImpl,
  openOhMyConfig as openOhMyConfigImpl,
  type OpencodeAgentRequestsDeps
} from './agent/opencodeAgentRequests';
import {
  sendPrompt as sendPromptImpl,
  type OpencodeAgentPromptDeps
} from './agent/opencodeAgentPrompt';
import type { ChannelState } from './agent/opencodeAgentTypes';
import { deriveSessionTitle, resolveSessionDirectory } from './agent/opencodeAgentSession';
import { buildUsageFromTokens } from './agent/opencodeAgentUsage';
import { RunningWatchdog } from './agent/opencodeAgentWatchdog';

import type {
  WebViewToExtensionMessage,
  RequestMessage,
  ResponseMessage,
  ErrorResponse
} from '../../shared/messages';

export class OpencodeAgentService implements IOpencodeAgentService {
  readonly _serviceBrand: undefined;

  private transport?: ITransport;

  private lastActiveChannelId?: string;

  private readonly channels = new Map<string, ChannelState>();
  private idleServerShutdownTimer?: ReturnType<typeof setTimeout>;
  private readonly defaultRunningWatchdogMs = 600_000;
  private readonly runningWatchdog: RunningWatchdog;
  private readonly requestWaiters = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly progressEventsByChannel = new Map<
    string,
    Array<{ ts: number; type: string; summary: string }>
  >();
  private readonly modelContextWindowById = new Map<string, number>();

  constructor(
    @ILogService private readonly logService: ILogService,
    @IConfigurationService private readonly configService: IConfigurationService,
    @IWorkspaceService private readonly workspaceService: IWorkspaceService,
    @IWebViewService private readonly webViewService: IWebViewService,
    @IOpencodeClientService private readonly client: IOpencodeClientService,
    @IOpencodeServerService private readonly serverService: IOpencodeServerService
  ) {
    this.runningWatchdog = new RunningWatchdog(
      () => this.getRunningWatchdogMs(),
      (state) => this.onRunningWatchdogFired(state)
    );
  }

  dispose(): void {
    this.clearIdleServerShutdownTimer();
    for (const state of this.channels.values()) {
      try {
        state.sseAbort.abort();
      } catch {}
    }
    this.channels.clear();
    this.progressEventsByChannel.clear();
    this.requestWaiters.clear();
    this.modelContextWindowById.clear();
  }

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
          message.model ?? undefined,
          message.variant ?? undefined,
          message.permissionMode ?? undefined,
          message.initialMessage
        );
        return;
      case 'io_message':
        void this.onIoMessage(message.channelId, message.message).catch((error) => {
          this.logService.error(`[OpencodeAgentService] io_message failed: ${String(error)}`);
        });
        return;
      case 'interrupt_claude':
        void this.interrupt(message.channelId).catch((error) => {
          this.logService.warn(`[OpencodeAgentService] interrupt failed: ${String(error)}`);
        });
        return;
      case 'close_channel':
        this.closeChannel(message.channelId);
        return;
      case 'request':
        // Don't block other WebView messages on slow requests (e.g. listing sessions).
        void this.handleRequestMessage(message as RequestMessage);
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
    await openOhMyConfigImpl(this.getRequestDeps());
  }

  private async launchChannel(
    channelId: string,
    resume: string | null,
    cwd: string | undefined,
    model: string | undefined,
    variant: string | undefined,
    permissionMode: unknown,
    initialMessage: any | undefined
  ): Promise<void> {
    this.clearIdleServerShutdownTimer();

    const workspaceCwd =
      this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
    let resolvedCwd = cwd ?? workspaceCwd;

    const sessionId = resume ?? (await this.createSessionForChannel(resolvedCwd, initialMessage));

    // Resuming an existing session: prefer the server's recorded session directory, so
    // subagent sessions (created for other workspaces) keep operating in the right cwd.
    if (resume) {
      resolvedCwd = await resolveSessionDirectory(this.client, sessionId, resolvedCwd);
    }

    const existing = this.channels.get(channelId);
    if (existing) {
      // Re-launch: replace session binding
      try {
        existing.sseAbort.abort();
      } catch {}
      this.channels.delete(channelId);
    }

    this.progressEventsByChannel.set(channelId, []);

    const state: ChannelState = {
      channelId,
      cwd: resolvedCwd,
      sessionId,
      modelSetting: typeof model === 'string' ? model.trim() || undefined : undefined,
      variant: typeof variant === 'string' ? variant.trim() || undefined : undefined,
      permissionMode: typeof permissionMode === 'string' ? permissionMode.trim() || undefined : undefined,
      activeAgent: this.mapPrimaryAgentFromPermissionMode(permissionMode),
      running: false,
      sseAbort: new AbortController(),
      assistantMessageIds: new Set<string>(),
      userMessageIds: new Set<string>(),
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

    // Tell UI the session id.
    // NOTE: WebView treats subtype === 'init' as "busy". When we only create/bind a session
    // (no initial prompt), we must NOT flip UI into busy state.
    this.pushProgressEvent(channelId, 'session', initialMessage ? 'running' : 'ready');
    this.sendToChannel(channelId, {
      type: 'system',
      subtype: initialMessage ? 'init' : 'session',
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
    const title = deriveSessionTitle(initialMessage) ?? 'OpenCode Session';
    const session = await this.client.createSession({ title }, cwd);
    const sessionId = String(session?.id ?? session?.sessionID ?? session);
    if (!sessionId) {
      throw new Error('Failed to create OpenCode session (missing id)');
    }
    return sessionId;
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
      this.runningWatchdog.disarm(state);
      flushPendingAssistantOutput(this.getSseDeps(), state);
      this.sendToChannel(channelId, { type: 'result', timestamp: Date.now() });
    }
  }

  private closeChannel(channelId: string): void {
    const state = this.channels.get(channelId);
    if (state) {
      this.runningWatchdog.disarm(state);
      try {
        state.sseAbort.abort();
      } catch {}
      this.channels.delete(channelId);
    }
    this.progressEventsByChannel.delete(channelId);

    this.transport?.send({ type: 'close_channel', channelId });
    this.scheduleIdleServerShutdownIfNeeded();
  }

  private async sendPrompt(state: ChannelState, userMessage: any): Promise<void> {
    try {
      await sendPromptImpl(this.getPromptDeps(), state, userMessage);
      if (state.running) {
        this.runningWatchdog.arm(state);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logService.error(`[OpencodeAgentService] sendPrompt failed: ${msg}`);

      const uiMsg = (() => {
        const timeout = msg.match(/OpenCode API timeout after (\d+)ms:/i);
        if (timeout?.[1]) {
          const sec = Math.max(1, Math.round(Number(timeout[1]) / 1000));
          return `OpenCode API 请求超时（${sec}s）。可能后端繁忙/卡死；建议稍后重试或重启 OpenCode 服务。`;
        }
        return msg;
      })();

      state.running = false;
      this.runningWatchdog.disarm(state);
      flushPendingAssistantOutput(this.getSseDeps(), state);

      this.sendToChannel(state.channelId, {
        type: 'assistant',
        timestamp: Date.now(),
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: `请求失败: ${uiMsg}` }]
        }
      });

      this.sendToChannel(state.channelId, {
        type: 'result',
        is_error: true,
        message: msg,
        timestamp: Date.now()
      });
    }
  }

  private async startSseLoop(state: ChannelState): Promise<void> {
    const deps = this.getSseDeps();

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    let warned = false;
    let attempt = 0;

    while (!state.sseAbort.signal.aborted) {
      try {
        for await (const evt of this.client.subscribeEvents(state.cwd, state.sseAbort.signal)) {
          attempt = 0;
          warned = false;

          await handleSseEvent(deps, state, evt);
          if (state.running) {
            this.runningWatchdog.arm(state);
          } else {
            this.runningWatchdog.disarm(state);
          }
        }

        // SSE ended normally (no error). This is unexpected unless we explicitly aborted.
        if (state.sseAbort.signal.aborted) {
          return;
        }

        attempt += 1;
        const delayMs = Math.min(10_000, 250 * 2 ** Math.min(attempt, 6));
        this.logService.warn(
          `[OpencodeAgentService] SSE stream ended; retrying in ${delayMs}ms (${state.sessionId})`
        );
        if (state.running && !warned) {
          warned = true;
          this.sendToChannel(state.channelId, {
            type: 'assistant',
            timestamp: Date.now(),
            message: { role: 'assistant', content: [{ type: 'text', text: 'SSE 连接断开，正在重连...' }] }
          });
        }
        await sleep(delayMs);
      } catch (error) {
        if (state.sseAbort.signal.aborted) {
          return;
        }

        attempt += 1;
        const delayMs = Math.min(10_000, 250 * 2 ** Math.min(attempt, 6));
        this.logService.warn(
          `[OpencodeAgentService] SSE failed; retrying in ${delayMs}ms (${state.sessionId}): ${String(error)}`
        );
        if (state.running && !warned) {
          warned = true;
          this.sendToChannel(state.channelId, {
            type: 'assistant',
            timestamp: Date.now(),
            message: { role: 'assistant', content: [{ type: 'text', text: 'SSE 连接失败，正在重连...' }] }
          });
        }

        await sleep(delayMs);
      }
    }
  }

  private async onRunningWatchdogFired(state: ChannelState): Promise<void> {
    if (!state.running) {
      this.runningWatchdog.disarm(state);
      return;
    }

    const timeoutMs = this.getRunningWatchdogMs();
    const timeoutSec = Math.max(1, Math.round(timeoutMs / 1000));

    const subagentRunning = await this.isSubagentRunning(state);
    if (subagentRunning) {
      this.logService.warn(
        `[OpencodeAgentService] No SSE events for ${timeoutSec}s but subagent is still running; keep waiting (${state.sessionId})`
      );

      const now = Date.now();
      if (!state.watchdogLastNoticeTs || now - state.watchdogLastNoticeTs > 60_000) {
        state.watchdogLastNoticeTs = now;
        this.sendToChannel(state.channelId, {
          type: 'assistant',
          timestamp: now,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: `超过 ${timeoutSec}s 未收到后端事件，但检测到子代理仍在运行，继续等待输出（已尝试重连 SSE）。可在设置 opencodeGui.runningWatchdogMs 调整/关闭。`
              }
            ]
          }
        });
      }

      this.pokeSse(state);
      this.runningWatchdog.arm(state);
      return;
    }

    const msg = `超过 ${timeoutSec}s 未收到后端事件，且未检测到子代理运行，已自动中断。可在设置 opencodeGui.runningWatchdogMs 调整/关闭。`;
    this.logService.warn(`[OpencodeAgentService] ${msg} (${state.sessionId})`);

    try {
      await this.client.abort(state.sessionId, state.cwd);
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] watchdog abort failed: ${String(error)}`);
    }

    state.running = false;
    this.runningWatchdog.disarm(state);
    flushPendingAssistantOutput(this.getSseDeps(), state);

    this.sendToChannel(state.channelId, {
      type: 'assistant',
      timestamp: Date.now(),
      message: { role: 'assistant', content: [{ type: 'text', text: msg }] }
    });

    this.sendToChannel(state.channelId, {
      type: 'result',
      is_error: true,
      message: msg,
      timestamp: Date.now()
    });
  }

  private async isSubagentRunning(state: ChannelState): Promise<boolean> {
    try {
      const [statusRes, childrenRes] = await Promise.allSettled([
        this.client.getSessionStatus(state.cwd),
        this.client.listSessionChildren(state.sessionId, state.cwd)
      ]);

      const statusMap =
        statusRes.status === 'fulfilled' && statusRes.value && typeof statusRes.value === 'object'
          ? (statusRes.value as Record<string, any>)
          : undefined;

      const children = childrenRes.status === 'fulfilled' ? childrenRes.value : undefined;
      if (!statusMap || !Array.isArray(children)) return false;

      for (const child of children) {
        const id = String((child as any)?.id ?? (child as any)?.sessionID ?? (child as any)?.sessionId ?? '').trim();
        if (!id) continue;
        const st = statusMap[id];
        const t = String((st as any)?.type ?? '').trim().toLowerCase();
        if (t === 'busy' || t === 'retry') {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private pokeSse(state: ChannelState): void {
    // The SSE loop may be stuck awaiting data if the server stopped sending heartbeats.
    // Swap the AbortController and abort the old one to force reconnect, without cancelling the session.
    const prev = state.sseAbort;
    state.sseAbort = new AbortController();
    try {
      prev.abort();
    } catch {
      // ignore
    }
  }

  private getSseDeps(): SseDeps {
    return {
      modelContextWindowById: this.modelContextWindowById,
      requestWaiters: this.requestWaiters,
      transportSend: (msg) => this.transport?.send(msg),
      pushProgressEvent: (channelId, type, summary) => this.pushProgressEvent(channelId, type, summary),
      sendToChannel: (channelId, event) => this.sendToChannel(channelId, event),
      getEffectiveModelSetting: (state) => this.getEffectiveModelSetting(state),
      buildUsageFromTokens,
      buildToolUseInput: buildToolUseInputImpl,
      hasMeaningfulToolInput: hasMeaningfulToolInputImpl,
      upsertDelta: upsertDeltaImpl,
      respondPermission: async (sessionId, permissionId, response, cwd, remember) => {
        await this.client.respondPermission(sessionId, permissionId, response, cwd, remember);
      }
    };
  }

  private getPromptDeps(): OpencodeAgentPromptDeps {
    return {
      logService: this.logService,
      configService: this.configService,
      client: this.client,
      pushProgressEvent: (channelId, type, summary) => this.pushProgressEvent(channelId, type, summary),
      sendToChannel: (channelId, event) => this.sendToChannel(channelId, event),
      getEffectiveAgentName: (state) => this.getEffectiveAgentName(state)
    };
  }

  private getRequestDeps(): OpencodeAgentRequestsDeps {
    return {
      logService: this.logService,
      configService: this.configService,
      workspaceService: this.workspaceService,
      webViewService: this.webViewService,
      client: this.client,
      channels: this.channels,
      modelContextWindowById: this.modelContextWindowById,
      mapPrimaryAgentFromPermissionMode: (mode) => this.mapPrimaryAgentFromPermissionMode(mode),
      getProgressSnapshot: (channelOrSessionId) =>
        getProgressSnapshotImpl({
          channels: this.channels,
          lastActiveChannelId: this.lastActiveChannelId,
          progressEventsByChannel: this.progressEventsByChannel,
          getEffectiveAgentName: (state) => this.getEffectiveAgentName(state),
          getEffectiveModelSetting: (state) => this.getEffectiveModelSetting(state),
          channelOrSessionId
        }),
      buildUsageFromTokens
    };
  }

  private async handleRequestMessage(message: RequestMessage): Promise<void> {
    try {
      const response = await dispatchRequestImpl(this.getRequestDeps(), message);
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


  private pushProgressEvent(channelId: string, type: string, summary: string): void {
    pushProgressEventImpl(this.progressEventsByChannel, channelId, type, summary);
  }

  private mapPrimaryAgentFromPermissionMode(mode: unknown): string | undefined {
    const value = String(mode ?? '').trim().toLowerCase();
    return value === 'plan' ? 'plan' : 'build';
  }

  private getEffectiveAgentName(state?: ChannelState): string | undefined {
    const stateAgent = String(state?.activeAgent ?? '').trim();
    if (stateAgent) return stateAgent;
    const selectedAgent = (
      this.configService.getValue<string>('opencodeGui.selectedAgent', '') ?? ''
    ).trim();
    return selectedAgent || undefined;
  }

  private getEffectiveModelSetting(state?: ChannelState): string | undefined {
    const modelSetting = (
      state?.modelSetting ?? (this.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '')
    ).trim();
    return modelSetting || undefined;
  }

  private clearIdleServerShutdownTimer(): void {
    if (!this.idleServerShutdownTimer) return;
    clearTimeout(this.idleServerShutdownTimer);
    this.idleServerShutdownTimer = undefined;
  }

  private getServerIdleShutdownMs(): number {
    const raw = this.configService.getValue<number>('opencodeGui.serverIdleShutdownMs', 0) ?? 0;
    const ms = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 0;
    return Math.max(0, ms);
  }

  private scheduleIdleServerShutdownIfNeeded(): void {
    this.clearIdleServerShutdownTimer();

    const ms = this.getServerIdleShutdownMs();
    if (ms <= 0) return;
    if (this.channels.size > 0) return;
    if (!this.serverService.isManaged()) return;

    this.idleServerShutdownTimer = setTimeout(() => {
      void this.stopServerForIdle(ms);
    }, ms);
  }

  private async stopServerForIdle(idleMs: number): Promise<void> {
    if (this.channels.size > 0) return;
    if (!this.serverService.isManaged()) return;

    this.logService.info(`[OpencodeAgentService] No active channels; stopping server after idle ${idleMs}ms`);

    try {
      await this.client.disposeAllInstances();
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] global.dispose failed (ignored): ${String(error)}`);
    }

    if (this.channels.size > 0) return;

    try {
      this.serverService.dispose();
    } catch (error) {
      this.logService.warn(`[OpencodeAgentService] server dispose failed (ignored): ${String(error)}`);
    }
  }

  private getRunningWatchdogMs(): number {
    const raw = this.configService.getValue<number>(
      'opencodeGui.runningWatchdogMs',
      this.defaultRunningWatchdogMs
    );
    const ms = Number(raw);
    if (!Number.isFinite(ms)) return this.defaultRunningWatchdogMs;
    return Math.max(0, Math.trunc(ms));
  }

  private sendToChannel(channelId: string, event: any): void {
    this.transport?.send({ type: 'io_message', channelId, message: event, done: false });
  }
}
