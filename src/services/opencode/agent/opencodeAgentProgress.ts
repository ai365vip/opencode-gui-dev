import type { ChannelState } from './opencodeAgentTypes';
import type { GetProgressResponse } from '../../../shared/messages';

export function pushProgressEvent(
  progressEventsByChannel: Map<string, Array<{ ts: number; type: string; summary: string }>>,
  channelId: string,
  type: string,
  summary: string
): void {
  const trimmed = String(summary ?? '').trim();
  if (!trimmed) return;
  const arr = progressEventsByChannel.get(channelId) ?? [];
  arr.push({ ts: Date.now(), type, summary: trimmed });
  const MAX = 50;
  if (arr.length > MAX) {
    arr.splice(0, arr.length - MAX);
  }
  progressEventsByChannel.set(channelId, arr);
}

export function resolveProgressChannelId(
  channels: Map<string, ChannelState>,
  lastActiveChannelId: string | undefined,
  channelOrSessionId?: string
): string | undefined {
  const key = String(channelOrSessionId ?? '').trim();
  if (!key) return lastActiveChannelId;

  if (channels.has(key)) return key;

  for (const [channelId, state] of channels.entries()) {
    if (state.sessionId === key) return channelId;
  }

  return lastActiveChannelId;
}

export function getProgressSnapshot(opts: {
  channels: Map<string, ChannelState>;
  lastActiveChannelId: string | undefined;
  progressEventsByChannel: Map<string, Array<{ ts: number; type: string; summary: string }>>;
  getEffectiveAgentName: (state?: ChannelState) => string | undefined;
  getEffectiveModelSetting: (state?: ChannelState) => string | undefined;
  channelOrSessionId?: string;
}): GetProgressResponse['progress'] {
  const cid = resolveProgressChannelId(
    opts.channels,
    opts.lastActiveChannelId,
    opts.channelOrSessionId
  );
  if (!cid) {
    return {
      channelId: undefined,
      sessionId: undefined,
      running: false,
      agent: undefined,
      model: undefined,
      lastEvents: []
    };
  }

  const state = opts.channels.get(cid);
  return {
    channelId: cid,
    sessionId: state?.sessionId,
    running: !!state?.running,
    agent: opts.getEffectiveAgentName(state),
    model: opts.getEffectiveModelSetting(state),
    lastEvents: [...(opts.progressEventsByChannel.get(cid) ?? [])]
  };
}
