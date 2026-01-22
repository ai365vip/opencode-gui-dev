export type OpenCodeMessageInfo = {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  title?: string;
  time?: { created: number; updated?: number; completed?: number };
  error?: unknown;
  tokens?: unknown;
  cost?: unknown;
};

export type OpenCodeTextPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text';
  text: string;
};

export type OpenCodeReasoningPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'reasoning';
  text: string;
};

export type OpenCodeToolPart = {
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

export type OpenCodePatchPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'patch';
  hash: string;
  files: string[];
};

export type OpenCodePermission = {
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

export type ChannelState = {
  channelId: string;
  cwd: string;
  sessionId: string;

  modelSetting?: string;
  variant?: string;
  permissionMode?: string;
  activeAgent?: string;

  running: boolean;
  sseAbort: AbortController;

  assistantMessageIds: Set<string>;
  userMessageIds: Set<string>;
  textParts: Map<string, { messageID: string; text: string }>;
  reasoningParts: Map<string, { messageID: string; text: string }>;
  sentToolUseIds: Set<string>;

  lastUsageMessageId?: string;
  lastUsageSignature?: string;

  lastRevert?: { messageID: string; partID?: string };
};
