import type { OpencodeEvent } from '../OpencodeClientService';
import type { ToolPermissionResponse } from '../../../shared/messages';
import type {
  ChannelState,
  OpenCodeMessageInfo,
  OpenCodeTextPart,
  OpenCodeReasoningPart,
  OpenCodeToolPart,
  OpenCodePatchPart,
  OpenCodePermission
} from './opencodeAgentTypes';

const STREAM_FLUSH_MS = 16;

type PendingStream = { text?: string; thinking?: string };

type StreamBufferState = {
  pendingByMessageId: Map<string, PendingStream>;
  timer?: ReturnType<typeof setTimeout>;
};

const streamBuffers = new WeakMap<ChannelState, StreamBufferState>();

function getStreamBuffer(state: ChannelState): StreamBufferState {
  const existing = streamBuffers.get(state);
  if (existing) return existing;
  const created: StreamBufferState = { pendingByMessageId: new Map() };
  streamBuffers.set(state, created);
  return created;
}

function enqueueStreamDelta(
  deps: SseDeps,
  state: ChannelState,
  messageID: string,
  delta: PendingStream
): void {
  if (!messageID) return;

  const buffer = getStreamBuffer(state);
  const pending = buffer.pendingByMessageId.get(messageID) ?? {};

  if (delta.text) pending.text = `${pending.text ?? ''}${delta.text}`;
  if (delta.thinking) pending.thinking = `${pending.thinking ?? ''}${delta.thinking}`;

  buffer.pendingByMessageId.set(messageID, pending);

  if (!buffer.timer) {
    buffer.timer = setTimeout(() => {
      buffer.timer = undefined;
      flushStreamBuffer(deps, state);
    }, STREAM_FLUSH_MS);
  }
}

function flushStreamBuffer(deps: SseDeps, state: ChannelState): void {
  const buffer = streamBuffers.get(state);
  if (!buffer) return;

  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = undefined;
  }

  if (buffer.pendingByMessageId.size === 0) return;

  const now = Date.now();
  for (const [messageID, pending] of buffer.pendingByMessageId) {
    const content: any[] = [];
    const thinking = String(pending.thinking ?? '');
    const text = String(pending.text ?? '');

    if (thinking) content.push({ type: 'thinking', thinking });
    if (text) content.push({ type: 'text', text });

    if (content.length === 0) continue;

    deps.sendToChannel(state.channelId, {
      type: 'assistant',
      stream: true,
      timestamp: now,
      message: {
        id: messageID,
        role: 'assistant',
        content
      }
    });
  }

  buffer.pendingByMessageId.clear();
}

export type SseDeps = {
  modelContextWindowById: Map<string, number>;
  requestWaiters: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >;
  transportSend: (msg: any) => void;
  pushProgressEvent: (channelId: string, type: string, summary: string) => void;
  sendToChannel: (channelId: string, event: any) => void;
  getEffectiveModelSetting: (state?: ChannelState) => string | undefined;
  buildUsageFromTokens: (tokens: unknown, opts?: { contextWindow?: number }) => any | undefined;
  buildToolUseInput: (part: OpenCodeToolPart) => Record<string, unknown>;
  hasMeaningfulToolInput: (input: Record<string, unknown>) => boolean;
  upsertDelta: (
    map: Map<string, { messageID: string; text: string }>,
    partId: string,
    messageID: string,
    delta: string | undefined,
    fullText: string
  ) => void;
  respondPermission: (
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject',
    cwd: string,
    remember?: boolean
  ) => Promise<void>;
};

export async function handleEvent(
  deps: SseDeps,
  state: ChannelState,
  evt: OpencodeEvent
): Promise<void> {
  switch (evt.type) {
    case 'message.updated':
      onMessageUpdated(deps, state, evt);
      return;
    case 'message.part.updated':
      onMessagePartUpdated(deps, state, evt);
      return;
    case 'permission.updated':
      await onPermissionUpdated(deps, state, evt);
      return;
    case 'session.idle':
      onSessionIdle(deps, state, evt);
      return;
    case 'session.status':
      onSessionStatus(deps, state, evt);
      return;
    case 'session.error':
      onSessionError(deps, state, evt);
      return;
    default:
      return;
  }
}

function onMessageUpdated(deps: SseDeps, state: ChannelState, evt: OpencodeEvent): void {
  const info = (evt.properties as any)?.info as OpenCodeMessageInfo | undefined;
  if (!info || info.sessionID !== state.sessionId) return;

  if (info.role === 'assistant') {
    state.userMessageIds.delete(info.id);
    state.assistantMessageIds.add(info.id);

    const infoModel = (info as any)?.model as any;
    const providerID = String(
      (info as any)?.providerID ?? infoModel?.providerID ?? infoModel?.providerId ?? ''
    ).trim();
    const modelID = String(
      (info as any)?.modelID ?? infoModel?.modelID ?? infoModel?.modelId ?? ''
    ).trim();
    const modelValue =
      providerID && modelID ? `${providerID}/${modelID}` : deps.getEffectiveModelSetting(state);
    const contextWindow = modelValue ? deps.modelContextWindowById.get(modelValue) : undefined;

    const usage = deps.buildUsageFromTokens((info as any).tokens, { contextWindow });
    if (usage) {
      const signature = `${String(info.id)}:${JSON.stringify(usage)}`;
      if (signature !== state.lastUsageSignature) {
        state.lastUsageSignature = signature;
        state.lastUsageMessageId = info.id;
        deps.sendToChannel(state.channelId, {
          type: 'assistant',
          // Usage-only updates should not create new chat messages in the WebView; mark as stream so
          // `processAndAttachMessage` can ignore it while Session.processMessage still updates usage.
          stream: true,
          timestamp: Number(
            info.time?.completed ?? info.time?.updated ?? info.time?.created ?? Date.now()
          ),
          message: { id: info.id, role: 'assistant', content: [], usage }
        });
      }
    }
  }

  if (info.role === 'user') {
    state.assistantMessageIds.delete(info.id);
    state.userMessageIds.add(info.id);
  }
}

function onMessagePartUpdated(deps: SseDeps, state: ChannelState, evt: OpencodeEvent): void {
  const part = (evt.properties as any)?.part as any;
  if (!part || typeof part !== 'object' || part.sessionID !== state.sessionId) return;

  const delta = (evt.properties as any)?.delta as string | undefined;

  switch (part.type) {
    case 'text': {
      if (state.userMessageIds.has(part.messageID)) {
        return;
      }
      state.assistantMessageIds.add(part.messageID);
      const tp = part as OpenCodeTextPart;
      const prev = state.textParts.get(tp.id)?.text ?? '';
      deps.upsertDelta(state.textParts, tp.id, tp.messageID, delta, tp.text);
      const next = state.textParts.get(tp.id)?.text ?? '';
      const chunk = next.startsWith(prev)
        ? next.slice(prev.length)
        : typeof delta === 'string' && delta.length > 0
          ? delta
          : next;
      if (chunk) {
        enqueueStreamDelta(deps, state, tp.messageID, { text: chunk });
      }
      return;
    }
    case 'reasoning': {
      if (state.userMessageIds.has(part.messageID)) {
        return;
      }
      state.assistantMessageIds.add(part.messageID);
      const rp = part as OpenCodeReasoningPart;
      const prev = state.reasoningParts.get(rp.id)?.text ?? '';
      deps.upsertDelta(state.reasoningParts, rp.id, rp.messageID, delta, rp.text);
      const next = state.reasoningParts.get(rp.id)?.text ?? '';
      const chunk = next.startsWith(prev)
        ? next.slice(prev.length)
        : typeof delta === 'string' && delta.length > 0
          ? delta
          : next;
      if (chunk) {
        enqueueStreamDelta(deps, state, rp.messageID, { thinking: chunk });
      }
      return;
    }
    case 'tool':
      if (state.userMessageIds.has(part.messageID)) {
        return;
      }
      state.assistantMessageIds.add(part.messageID);
      onToolPart(deps, state, part as OpenCodeToolPart);
      return;
    case 'patch': {
      if (state.userMessageIds.has(part.messageID)) {
        return;
      }
      state.assistantMessageIds.add(part.messageID);
      const pp = part as OpenCodePatchPart;
      state.lastRevert = { messageID: pp.messageID, partID: pp.id };
      return;
    }
    default:
      return;
  }
}

function onToolPart(deps: SseDeps, state: ChannelState, part: OpenCodeToolPart): void {
  const toolUseId = part.callID || part.id;
  if (!toolUseId) return;

  const toolState: any = part?.state ?? {};
  const status = String(toolState.status ?? '').trim();
  const toolKey = String(part.tool ?? '')
    .trim()
    .toLowerCase();
  const input = deps.buildToolUseInput(part);
  const title = typeof toolState.title === 'string' ? toolState.title.trim() : '';

  const alreadySent = state.sentToolUseIds.has(toolUseId);
  const taskSessionId =
    toolKey === 'task'
      ? String((input as any).sessionId ?? (input as any).session_id ?? '').trim()
      : '';

  const shouldSendToolUse =
    !alreadySent &&
    (status === 'completed' ||
      status === 'error' ||
      status === 'running' ||
      status === 'pending') &&
    (status === 'completed' ||
      status === 'error' ||
      (toolKey === 'task' ? Boolean(taskSessionId) : deps.hasMeaningfulToolInput(input)));

  if (shouldSendToolUse) {
    state.sentToolUseIds.add(toolUseId);
    deps.pushProgressEvent(
      state.channelId,
      'tool',
      title ? `${String(part.tool ?? 'tool')} — ${title}` : String(part.tool ?? 'tool')
    );
    deps.sendToChannel(state.channelId, {
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
            input
          }
        ]
      }
    });
  }

  if (status === 'completed') {
    const rawOutput = toolState.output;
    let content = rawOutput == null ? '' : String(rawOutput);
    const toolMetadata = toolState.metadata;

    if (toolKey === 'task' && toolMetadata && typeof toolMetadata === 'object') {
      const childSessionId = String(
        (toolMetadata as any).sessionId ??
          (toolMetadata as any).sessionID ??
          (toolMetadata as any).session_id ??
          ''
      ).trim();

      if (childSessionId) {
        const trimmed = content.trim();
        const cleared = trimmed === '[Old tool result content cleared]';
        const hasSessionId =
          /<task_metadata>[\s\S]*session_id:/i.test(content) ||
          /\bsession_id:\s*[^\s]+/i.test(content);

        if (cleared || !trimmed) {
          content = ['<task_metadata>', `session_id: ${childSessionId}`, '</task_metadata>'].join(
            '\n'
          );
        } else if (!hasSessionId) {
          content = `${content}\n\n<task_metadata>\nsession_id: ${childSessionId}\n</task_metadata>`;
        }
      }
    }

    deps.sendToChannel(state.channelId, {
      type: 'user',
      timestamp: Date.now(),
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content,
            is_error: false
          }
        ]
      }
    });
    return;
  }

  if (status === 'error') {
    deps.sendToChannel(state.channelId, {
      type: 'user',
      timestamp: Date.now(),
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: toolState.error ?? 'Tool error',
            is_error: true
          }
        ]
      }
    });
  }
}

async function onPermissionUpdated(
  deps: SseDeps,
  state: ChannelState,
  evt: OpencodeEvent
): Promise<void> {
  const p = evt.properties as unknown as OpenCodePermission;
  if (!p || p.sessionID !== state.sessionId) return;

  const requestId = Math.random().toString(36).slice(2);

  const responsePromise = new Promise<ToolPermissionResponse>((resolve, reject) => {
    deps.requestWaiters.set(requestId, { resolve: resolve as any, reject });
  });

  deps.transportSend({
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
      suggestions: [{} as any]
    }
  });

  const resp = await responsePromise;
  const decision = (resp as any)?.result;
  const remember =
    decision?.behavior === 'allow' &&
    Array.isArray((decision as any)?.updatedPermissions) &&
    (decision as any).updatedPermissions.length > 0;
  const opencodeResponse =
    decision?.behavior === 'allow' ? (remember ? 'always' : 'once') : 'reject';

  await deps.respondPermission(
    state.sessionId,
    p.id,
    opencodeResponse,
    state.cwd,
    remember ? true : undefined
  );
}

function onSessionIdle(deps: SseDeps, state: ChannelState, evt: OpencodeEvent): void {
  const sessionID = (evt.properties as any)?.sessionID as string | undefined;
  if (!sessionID || sessionID !== state.sessionId) return;

  if (!state.running) {
    return;
  }

  state.running = false;
  deps.pushProgressEvent(state.channelId, 'session', 'idle');
  flushPendingAssistantOutput(deps, state);
  deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
}

function onSessionStatus(deps: SseDeps, state: ChannelState, evt: OpencodeEvent): void {
  const sessionID = (evt.properties as any)?.sessionID as string | undefined;
  if (!sessionID || sessionID !== state.sessionId) return;

  const status = (evt.properties as any)?.status as any;
  const statusType = String(status?.type ?? '').trim();
  if (statusType !== 'idle') {
    return;
  }

  if (!state.running) {
    return;
  }

  state.running = false;
  deps.pushProgressEvent(state.channelId, 'session', 'idle');
  flushPendingAssistantOutput(deps, state);
  deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
}

function onSessionError(deps: SseDeps, state: ChannelState, evt: OpencodeEvent): void {
  const sessionID = (evt.properties as any)?.sessionID as string | undefined;
  if (sessionID && sessionID !== state.sessionId) return;

  const err = (evt.properties as any)?.error;
  const msg = err?.data?.message ?? err?.data?.providerID ?? 'OpenCode session error';

  const wasRunning = state.running;
  if (wasRunning) {
    state.running = false;
    deps.pushProgressEvent(state.channelId, 'session', 'error');
    flushPendingAssistantOutput(deps, state);
  }

  deps.sendToChannel(state.channelId, {
    type: 'assistant',
    timestamp: Date.now(),
    message: {
      id: (err as any)?.messageID ?? undefined,
      role: 'assistant',
      content: [{ type: 'text', text: String(msg) }]
    }
  });

  if (wasRunning) {
    deps.sendToChannel(state.channelId, {
      type: 'result',
      is_error: true,
      message: String(msg),
      timestamp: Date.now()
    });
  }
}

export function flushPendingAssistantOutput(deps: SseDeps, state: ChannelState): void {
  flushStreamBuffer(deps, state);
  state.reasoningParts.clear();
  state.textParts.clear();
}
