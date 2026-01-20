declare module '@anthropic-ai/claude-agent-sdk' {
  export type PermissionMode =
    | 'default'
    | 'bypassPermissions'
    | 'dontAsk'
    | 'acceptEdits'
    | 'plan'
    | (string & {});

  export type PermissionUpdate = Record<string, unknown>;

  export type PermissionResult =
    | {
        behavior: 'allow';
        updatedInput: Record<string, unknown>;
        updatedPermissions: PermissionUpdate[];
      }
    | {
        behavior: 'deny';
        message?: string;
        interrupt?: boolean;
      };

  export type SDKMessage = {
    role?: string;
    content?: unknown;
    [key: string]: unknown;
  };

  export type SDKUserMessage = SDKMessage & { role: 'user' };

  export type CanUseTool = (
    toolName: string,
    input: Record<string, unknown>,
    options: { suggestions?: PermissionUpdate[] }
  ) => PermissionResult | Promise<PermissionResult>;

  export type HookEvent = string;
  export type HookCallback = (...args: unknown[]) => unknown;
  export type HookCallbackMatcher = { hooks: HookCallback[]; [key: string]: unknown };

  export type Options = {
    cwd: string;
    resume?: string;
    resumeSessionAt?: string;
    forkSession?: boolean;
    model?: string;
    fallbackModel?: string;
    permissionMode?: PermissionMode;
    maxThinkingTokens?: number;
    maxBudgetUsd?: number;
    enableFileCheckpointing?: boolean;
    hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
    [key: string]: unknown;
  };

  export type Query = {
    setModel: (model: string) => Promise<void>;
    interrupt: () => Promise<void>;
    [key: string]: unknown;
  };

  export type ModelInfo = {
    value: string;
    displayName?: string;
    description?: string;
    variants?: unknown;
    contextWindow?: number;
    [key: string]: unknown;
  };

  export function query(options: Options & { inputStream: unknown }): Promise<Query>;
}

