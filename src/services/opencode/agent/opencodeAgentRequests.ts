import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

import type { ILogService } from '../../logService';
import type { IConfigurationService } from '../../configurationService';
import type { IWorkspaceService } from '../../workspaceService';
import type { IWebViewService } from '../../webViewService';
import type { IOpencodeClientService } from '../OpencodeClientService';

import type { ChannelState, OpenCodeMessageInfo, OpenCodeToolPart } from './opencodeAgentTypes';
import { buildToolUseInput } from './opencodeAgentMessageTools';
import { resolveSessionDirectory } from './opencodeAgentSession';

import type {
  RequestMessage,
  InitResponse,
  GetClaudeStateResponse,
  GetClaudeConfigResponse,
  SaveClaudeConfigResponse,
  GetOpencodeConfigFileResponse,
  SaveOpencodeConfigFileResponse,
  GetOpencodeAuthStatusResponse,
  SetOpencodeAuthApiKeyResponse,
  GetCurrentSelectionResponse,
  GetMcpServersResponse,
  GetAssetUrisResponse,
  ListSessionsResponse,
  DeleteSessionResponse,
  GetSessionResponse,
  GetAgentsResponse,
  ToggleAgentResponse,
  DeleteAgentResponse,
  GetSkillsResponse,
  ToggleSkillResponse,
  DeleteSkillResponse,
  SetModelResponse,
  SetVariantResponse,
  GetProgressResponse,
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
  RenameTabResponse
} from '../../../shared/messages';

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

export type OpencodeAgentRequestsDeps = {
  logService: ILogService;
  configService: IConfigurationService;
  workspaceService: IWorkspaceService;
  webViewService: IWebViewService;
  client: IOpencodeClientService;

  channels: Map<string, ChannelState>;
  modelContextWindowById: Map<string, number>;

  mapPrimaryAgentFromPermissionMode: (mode: unknown) => string | undefined;
  getProgressSnapshot: (channelOrSessionId?: string) => GetProgressResponse['progress'];
  buildUsageFromTokens: (tokens: unknown, opts?: { contextWindow?: number }) => any | undefined;
};

export async function openOhMyConfig(deps: OpencodeAgentRequestsDeps): Promise<void> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const configDir = (deps.configService.getValue<string>('opencodeGui.configDir', '') ?? '').trim();

  const projectPath = path.join(cwd, '.opencode', 'oh-my-opencode.json');
  const userPaths = [
    configDir ? path.join(configDir, 'oh-my-opencode.json') : undefined,
    configDir ? path.join(configDir, 'opencode', 'oh-my-opencode.json') : undefined,
    path.join(os.homedir(), '.config', 'opencode', 'oh-my-opencode.json')
  ].filter(Boolean) as string[];

  const xdgPath = path.join(getXdgConfigHome(), 'opencode', 'oh-my-opencode.json');
  const target = (await pickExistingPath([projectPath, ...userPaths])) ?? xdgPath;
  if (!target) {
    vscode.window.showWarningMessage(
      '未找到 oh-my-opencode 配置：.opencode/oh-my-opencode.json 或 ~/.config/opencode/oh-my-opencode.json'
    );
    return;
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target)));
  if (!(await pathExists(target))) {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(target),
      Buffer.from('{\n  \"disabled_hooks\": []\n}\n', 'utf8')
    );
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(doc, { preview: false });
}

export async function dispatchRequest(
  deps: OpencodeAgentRequestsDeps,
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
  | DeleteSessionResponse
  | GetSessionResponse
  | GetAgentsResponse
  | ToggleAgentResponse
  | DeleteAgentResponse
  | GetSkillsResponse
  | ToggleSkillResponse
  | DeleteSkillResponse
  | SetModelResponse
  | SetVariantResponse
  | GetProgressResponse
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
  | GetOpencodeConfigFileResponse
  | SaveOpencodeConfigFileResponse
  | GetOpencodeAuthStatusResponse
  | SetOpencodeAuthApiKeyResponse
  | any
> {
  const req: any = (message as any).request;

  switch (req?.type) {
    case 'init':
      return handleInit(deps);
    case 'get_claude_state':
      return handleGetClaudeState(deps);
    case 'get_progress':
      return { type: 'get_progress_response', progress: deps.getProgressSnapshot(message.channelId) };
    case 'get_claude_config':
      return handleGetClaudeConfig(deps, req.scope, req.configType);
    case 'save_claude_config':
      return handleSaveClaudeConfig(deps, req.config, req.scope, req.configType);

    case 'get_opencode_config_file':
      return handleGetOpencodeConfigFile(deps, req.configType, req.scope);
    case 'save_opencode_config_file':
      return handleSaveOpencodeConfigFile(deps, req.configType, req.content, req.scope);
    case 'get_opencode_auth_status':
      return handleGetOpencodeAuthStatus(deps, req.providerId);
    case 'set_opencode_auth_api_key':
      return handleSetOpencodeAuthApiKey(deps, req.providerId, req.apiKey);

    case 'get_current_selection':
      return handleGetCurrentSelection();
    case 'get_mcp_servers':
      return handleGetMcpServers(deps);
    case 'get_asset_uris':
      return handleGetAssetUris(deps);
    case 'list_sessions_request':
      return handleListSessions(deps);
    case 'delete_session_request':
      return handleDeleteSession(deps, String(req.sessionId));
    case 'get_session_request':
      return handleGetSession(deps, String(req.sessionId));
    case 'list_files_request':
      return handleListFiles(deps, req.pattern);

    case 'set_model': {
      if (typeof message.channelId === 'string') {
        const state = deps.channels.get(message.channelId);
        if (state) {
          state.modelSetting = String(req.model?.value ?? '').trim() || undefined;
        }
      }

      await deps.configService.updateValue('opencodeGui.selectedModel', String(req.model?.value ?? ''));
      return { type: 'set_model_response', success: true };
    }

    case 'set_variant': {
      if (typeof message.channelId === 'string') {
        const state = deps.channels.get(message.channelId);
        if (state) {
          state.variant = String(req.variant ?? '').trim() || undefined;
        }
      }
      return { type: 'set_variant_response', success: true };
    }

    case 'set_work_mode':
      return { type: 'set_work_mode_response', success: true };

    case 'set_permission_mode': {
      if (typeof message.channelId === 'string') {
        const state = deps.channels.get(message.channelId);
        if (state) {
          state.permissionMode = typeof req.mode === 'string' ? req.mode.trim() || undefined : undefined;
          state.activeAgent = deps.mapPrimaryAgentFromPermissionMode(state.permissionMode);
        }
      }
      return { type: 'set_permission_mode_response', success: true };
    }

    case 'set_thinking_level':
      return { type: 'set_thinking_level_response' };

    case 'open_file':
      await openFile(deps, String(req.filePath), req.location);
      return { type: 'open_file_response' };

    case 'open_content':
      return handleOpenContent(
        String(req.content ?? ''),
        String(req.fileName ?? 'opencode.txt'),
        !!req.editable
      );

    case 'open_diff':
      return handleOpenDiff(deps, req);

    case 'open_url':
      vscode.env.openExternal(vscode.Uri.parse(String(req.url)));
      return { type: 'open_url_response' };

    case 'show_notification':
      return handleShowNotification(req as ShowNotificationRequest);

    case 'exec':
      return handleExec(deps, String(req.command ?? ''), Array.isArray(req.params) ? req.params : []);

    case 'new_conversation_tab':
      return handleNewConversationTab(deps);

    case 'rename_tab':
      return { type: 'rename_tab_response' };

    case 'open_config_file':
      await handleOpenConfigFile(deps, String(req.configType ?? ''));
      return { type: 'open_config_file_response' };

    case 'open_claude_in_terminal':
      await handleOpenInTerminal(deps);
      return { type: 'open_claude_in_terminal_response' };

    case 'get_agents':
      return handleGetAgents(deps);

    case 'toggle_agent':
      return handleToggleAgent(deps, String(req.agentName ?? ''), !!req.enabled);

    case 'delete_agent':
      return handleDeleteAgent(String(req.agentPath ?? ''));

    case 'get_skills':
      return handleGetSkills(deps);

    case 'toggle_skill':
      return handleToggleSkill(deps, String(req.skillId ?? ''), !!req.enabled);

    case 'delete_skill':
      return handleDeleteSkill(String(req.skillPath ?? ''));

    default:
      deps.logService.warn(`[OpencodeAgentService] Unhandled request: ${String(req?.type)}`);
      return { type: 'noop' };
  }
}

function handleInit(deps: OpencodeAgentRequestsDeps): InitResponse {
  const defaultCwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const modelSetting = deps.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '';

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

async function handleGetClaudeState(deps: OpencodeAgentRequestsDeps): Promise<GetClaudeStateResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  let models: Array<{
    value: string;
    displayName?: string;
    description?: string;
    variants?: unknown;
    contextWindow?: number;
  }> = [];

  try {
    const raw = await deps.client.listConfigProviders(cwd);
    const providers: any[] = Array.isArray(raw?.providers) ? raw.providers : [];
    models = mapProvidersToModels(providers);

    if (models.length === 0) {
      const rawProviders = await deps.client.listProviders(cwd);
      const providersAlt: any[] = Array.isArray(rawProviders?.all)
        ? rawProviders.all
        : Array.isArray(rawProviders?.providers)
          ? rawProviders.providers
          : Array.isArray(rawProviders)
            ? rawProviders
            : [];
      models = mapProvidersToModels(providersAlt);
    }
  } catch (error) {
    deps.logService.warn(`[OpencodeAgentService] Failed to load providers: ${String(error)}`);
  }

  deps.modelContextWindowById.clear();
  for (const m of models) {
    const id = String((m as any)?.value ?? '').trim();
    const ctx = Number((m as any)?.contextWindow);
    if (id && Number.isFinite(ctx) && ctx > 0) {
      deps.modelContextWindowById.set(id, ctx);
    }
  }

  let slashCommands: Array<{ name: string; description?: string }> = [];
  try {
    const raw = await deps.client.listCommands(cwd);
    const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.commands) ? raw.commands : [];
    const seen = new Set<string>();
    const out: Array<{ name: string; description?: string }> = [];
    for (const c of items) {
      const name = String(c?.name ?? '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({
        name,
        description: typeof c?.description === 'string' ? c.description : undefined
      });
    }
    slashCommands = out;
  } catch (error) {
    deps.logService.warn(`[OpencodeAgentService] Failed to load commands: ${String(error)}`);
  }

  slashCommands = mergeSlashCommands(slashCommands, [
    { name: 'undo', description: '鎾ら攢涓婁竴鏉℃秷鎭強鏂囦欢鏀瑰姩' },
    { name: 'redo', description: '閲嶅仛涓婁竴娆℃挙閿€' },
    { name: 'compact', description: '压缩/总结当前会话（减少上下文占用）' },
    { name: 'summarize', description: '总结当前会话（compact 别名）' }
  ]);

  return {
    type: 'get_claude_state_response',
    config: {
      models,
      slashCommands
    }
  };
}

function mergeSlashCommands(
  existing: Array<{ name: string; description?: string }>,
  extra: Array<{ name: string; description?: string }>
): Array<{ name: string; description?: string }> {
  const map = new Map<string, { name: string; description?: string }>();
  for (const item of existing ?? []) {
    const name = String(item?.name ?? '').trim();
    if (!name || map.has(name)) continue;
    map.set(name, { name, description: item?.description });
  }
  for (const item of extra ?? []) {
    const name = String(item?.name ?? '').trim();
    if (!name || map.has(name)) continue;
    map.set(name, { name, description: item?.description });
  }
  return Array.from(map.values());
}

function mapProvidersToModels(
  providers: any[]
): Array<{
  value: string;
  displayName?: string;
  description?: string;
  variants?: unknown;
  contextWindow?: number;
}> {
  const out: Array<{
    value: string;
    displayName?: string;
    description?: string;
    variants?: unknown;
    contextWindow?: number;
  }> = [];

  const isPlainObject = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  for (const p of providers ?? []) {
    const providerID = String(p?.id ?? p?.providerID ?? p?.providerId ?? p?.name ?? '').trim();
    if (!providerID) continue;

    const providerName = String(p?.name ?? providerID);
    const providerDesc = typeof p?.description === 'string' ? p.description : undefined;

    const modelsMap = isPlainObject(p?.models) ? (p.models as Record<string, any>) : undefined;
    if (modelsMap) {
      for (const [modelKey, model] of Object.entries(modelsMap)) {
        const modelID = String(model?.id ?? model?.modelID ?? model?.name ?? modelKey ?? '').trim();
        if (!modelID) continue;

        const value = `${providerID}/${modelID}`;
        const name = typeof model?.name === 'string' ? model.name : '';
        const ctx = Number(model?.limit?.context);
        const outLimit = Number(model?.limit?.output);
        const variantsRaw = isPlainObject(model?.variants) ? model.variants : undefined;

        const descParts: string[] = [];
        if (name && name !== modelID) descParts.push(name);
        if (Number.isFinite(ctx) && ctx > 0) descParts.push(`ctx ${ctx}`);
        if (Number.isFinite(outLimit) && outLimit > 0) descParts.push(`out ${outLimit}`);

        out.push({
          value,
          displayName: value,
          description: descParts.length > 0 ? descParts.join(' 路 ') : providerDesc,
          variants: variantsRaw,
          contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : undefined
        });
      }
      continue;
    }

    const modelsRaw = Array.isArray(p?.models)
      ? p.models
      : Array.isArray(p?.modelIDs)
        ? p.modelIDs
        : Array.isArray(p?.modelIds)
          ? p.modelIds
          : [];

    for (const m of modelsRaw) {
      const modelID = typeof m === 'string' ? m : String(m?.id ?? m?.modelID ?? m?.name ?? '').trim();
      if (!modelID) continue;

      const displayName =
        typeof m === 'string'
          ? `${providerName}/${modelID}`
          : String(m?.displayName ?? m?.name ?? `${providerName}/${modelID}`);

      const description = typeof m === 'string' ? providerDesc : String(m?.description ?? providerDesc ?? '');

      out.push({
        value: `${providerID}/${modelID}`,
        displayName,
        description: description || undefined
      });
    }
  }

  out.sort((a, b) => String(a.displayName ?? a.value).localeCompare(String(b.displayName ?? b.value)));
  return out;
}

async function handleGetClaudeConfig(
  deps: OpencodeAgentRequestsDeps,
  scope: 'user' | 'project' | 'merged' = 'merged',
  configType: 'settings' | 'mcp' = 'settings'
): Promise<GetClaudeConfigResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();

  const userConfig =
    scope === 'project'
      ? undefined
      : await readJsonFile(getUserGuiConfigPath(deps, configType)).catch(() => undefined);

  const projectConfig =
    scope === 'user'
      ? undefined
      : await readJsonFile(getProjectGuiConfigPath(cwd, configType)).catch(() => undefined);

  const merged = scope === 'merged' ? { ...(userConfig ?? {}), ...(projectConfig ?? {}) } : undefined;
  const config = (scope === 'user' ? userConfig : scope === 'project' ? projectConfig : merged) ?? {};

  if (!config.env) config.env = {};
  if (!config.permissions) config.permissions = { allow: [], deny: [] };
  if (!config.mcpServers) config.mcpServers = {};
  if (!config.additionalDirectories) config.additionalDirectories = [];

  return { type: 'get_claude_config_response', config };
}

async function handleSaveClaudeConfig(
  deps: OpencodeAgentRequestsDeps,
  config: any,
  scope: 'user' | 'project' = 'user',
  configType: 'settings' | 'mcp' = 'settings'
): Promise<SaveClaudeConfigResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const targetPath =
    scope === 'project'
      ? getProjectGuiConfigPath(cwd, configType)
      : getUserGuiConfigPath(deps, configType);

  try {
    await writeJsonFile(targetPath, config ?? {});
    return { type: 'save_claude_config_response', success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { type: 'save_claude_config_response', success: false, error: msg };
  }
}

async function handleGetMcpServers(deps: OpencodeAgentRequestsDeps): Promise<GetMcpServersResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  try {
    const raw = await deps.client.getMcpStatus(cwd);
    const entries = Object.entries(raw ?? {});
    const mcpServers = entries.map(([name, status]) => ({
      name,
      status: typeof (status as any)?.status === 'string' ? String((status as any).status) : 'unknown'
    }));
    return { type: 'get_mcp_servers_response', mcpServers };
  } catch (error) {
    deps.logService.warn(`[OpencodeAgentService] Failed to get MCP status: ${String(error)}`);
    return { type: 'get_mcp_servers_response', mcpServers: [] };
  }
}

async function handleGetAgents(deps: OpencodeAgentRequestsDeps): Promise<GetAgentsResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const ohMy = await readOhMyConfig(deps, cwd).catch(() => undefined);
  const ohMyConfig = (ohMy as any)?.config as any;

  const raw = await deps.client.listAgents(cwd);
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

async function handleToggleAgent(
  deps: OpencodeAgentRequestsDeps,
  agentName: string,
  enabled: boolean
): Promise<ToggleAgentResponse> {
  if (!agentName) {
    return { type: 'toggle_agent_response', success: false, error: 'agentName 不能为空' };
  }

  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const targetPath =
    (await readOhMyConfig(deps, cwd).catch(() => undefined))?.path ??
    path.join(getXdgConfigHome(), 'opencode', 'oh-my-opencode.json');

  try {
    const existing = (await readJsonFile(targetPath).catch(() => undefined)) ?? {};
    const next = { ...(existing ?? {}) } as any;
    if (!next.agents || typeof next.agents !== 'object') next.agents = {};

    const prev = next.agents[agentName];
    next.agents[agentName] =
      prev && typeof prev === 'object' ? { ...prev, enabled } : { enabled, replace_plan: true };

    await writeJsonFile(targetPath, next);
    return { type: 'toggle_agent_response', success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { type: 'toggle_agent_response', success: false, error: msg };
  }
}

async function handleDeleteAgent(_agentPath: string): Promise<DeleteAgentResponse> {
  return {
    type: 'delete_agent_response',
    success: false,
    error: 'oh-my-opencode agents 暂不支持删除（可禁用/启用）'
  };
}

async function handleGetSkills(deps: OpencodeAgentRequestsDeps): Promise<GetSkillsResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const ohMy = await readOhMyConfig(deps, cwd).catch(() => undefined);
  const ohMyConfig = (ohMy as any)?.config as any;

  const skills = OH_MY_HOOKS.map((h) => ({
    id: h.id,
    name: h.id,
    description: h.description,
    enabled: !(Array.isArray(ohMyConfig?.disabled_hooks) ? ohMyConfig.disabled_hooks : []).includes(h.id),
    path: h.id
  }));

  return { type: 'get_skills_response', skills };
}

async function handleToggleSkill(
  deps: OpencodeAgentRequestsDeps,
  skillId: string,
  enabled: boolean
): Promise<ToggleSkillResponse> {
  if (!skillId) {
    return { type: 'toggle_skill_response', success: false, error: 'skillId 不能为空' };
  }

  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const targetPath =
    (await readOhMyConfig(deps, cwd).catch(() => undefined))?.path ??
    path.join(getXdgConfigHome(), 'opencode', 'oh-my-opencode.json');

  try {
    const existing = (await readJsonFile(targetPath).catch(() => undefined)) ?? {};
    const next = { ...(existing ?? {}) } as any;

    const current = new Set<string>(Array.isArray(next.disabled_hooks) ? next.disabled_hooks : []);
    if (enabled) {
      current.delete(skillId);
    } else {
      current.add(skillId);
    }
    next.disabled_hooks = Array.from(current.values()).sort((a, b) => a.localeCompare(b));

    await writeJsonFile(targetPath, next);
    return { type: 'toggle_skill_response', success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { type: 'toggle_skill_response', success: false, error: msg };
  }
}

async function handleDeleteSkill(_skillPath: string): Promise<DeleteSkillResponse> {
  return {
    type: 'delete_skill_response',
    success: false,
    error: 'oh-my-opencode hooks 暂不支持删除（可禁用/启用）'
  };
}

async function handleListFiles(
  deps: OpencodeAgentRequestsDeps,
  pattern?: string
): Promise<ListFilesResponse> {
  const query = String(pattern ?? '').trim();
  if (!query) {
    return { type: 'list_files_response', files: [] };
  }

  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
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

async function handleShowNotification(
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

async function handleExec(
  deps: OpencodeAgentRequestsDeps,
  command: string,
  params: string[]
): Promise<ExecResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
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

async function handleOpenContent(
  content: string,
  fileName: string,
  editable: boolean
): Promise<OpenContentResponse> {
  if (!editable) {
    const document = await vscode.workspace.openTextDocument({
      content,
      language: detectLanguage(fileName)
    });
    await vscode.window.showTextDocument(document, { preview: true });
    return { type: 'open_content_response' };
  }

  const tempPath = await createTempFile(fileName || 'opencode.txt', content);
  const tempUri = vscode.Uri.file(tempPath);
  const document = await vscode.workspace.openTextDocument(tempUri);
  await vscode.window.showTextDocument(document, { preview: false });

  const updatedContent = await waitForDocumentEdits(document);
  return { type: 'open_content_response', updatedContent };
}

async function handleOpenDiff(deps: OpencodeAgentRequestsDeps, request: any): Promise<OpenDiffResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const originalPath = resolveFilePath(String(request.originalFilePath ?? ''), cwd);
  const fallbackNewPath = request.newFilePath ? resolveFilePath(String(request.newFilePath), cwd) : undefined;

  const rightPath = await prepareDiffRightFile(originalPath, fallbackNewPath, request.edits ?? []);
  const leftExists = await pathExists(originalPath);
  const leftPath = leftExists
    ? originalPath
    : await createTempFile(
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

async function handleNewConversationTab(deps: OpencodeAgentRequestsDeps): Promise<NewConversationTabResponse> {
  try {
    await vscode.commands.executeCommand('opencode.chatView.focus');
  } catch (error) {
    deps.logService.warn(`[OpencodeAgentService] Failed to focus chat view: ${String(error)}`);
  }
  return { type: 'new_conversation_tab_response' };
}

async function handleOpenConfigFile(deps: OpencodeAgentRequestsDeps, configType: string): Promise<void> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();

  if (configType === 'auth') {
    const authPath = getOpencodeAuthFilePath();
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(authPath)));
    if (!(await pathExists(authPath))) {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(authPath), Buffer.from('{\n}\n', 'utf8'));
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(authPath));
    await vscode.window.showTextDocument(doc, { preview: false });
    return;
  }

  if (configType === 'oh-my-opencode') {
    await openOhMyConfig(deps);
    return;
  }

  const target =
    configType === 'mcp'
      ? getProjectGuiConfigPath(cwd, 'mcp')
      : configType === 'project'
        ? getProjectGuiConfigPath(cwd, 'settings')
        : getUserGuiConfigPath(deps, 'settings');

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target)));
  if (!(await pathExists(target))) {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from('{}', 'utf8'));
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function handleGetOpencodeConfigFile(
  deps: OpencodeAgentRequestsDeps,
  configType: 'opencode' | 'oh-my-opencode' | 'auth',
  scope: 'user' | 'project' | undefined
): Promise<GetOpencodeConfigFileResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const resolved = await resolveOpencodeConfigFilePath(deps, configType, scope, cwd);

  let exists = false;
  try {
    exists = await pathExists(resolved.path);
    const content =
      configType === 'auth'
        ? ''
        : exists
          ? Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(resolved.path))).toString(
              'utf8'
            )
          : '';

    return {
      type: 'get_opencode_config_file_response',
      configType,
      scope: resolved.scope,
      path: resolved.path,
      exists,
      content
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      type: 'get_opencode_config_file_response',
      configType,
      scope: resolved.scope,
      path: resolved.path,
      exists,
      content: '',
      error: msg
    };
  }
}

async function handleSaveOpencodeConfigFile(
  deps: OpencodeAgentRequestsDeps,
  configType: 'opencode' | 'oh-my-opencode' | 'auth',
  content: string,
  scope: 'user' | 'project' | undefined
): Promise<SaveOpencodeConfigFileResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const resolved = await resolveOpencodeConfigFilePath(deps, configType, scope, cwd);

  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(resolved.path)));
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(resolved.path),
      Buffer.from(String(content ?? ''), 'utf8')
    );
    return {
      type: 'save_opencode_config_file_response',
      configType,
      scope: resolved.scope,
      path: resolved.path,
      success: true
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      type: 'save_opencode_config_file_response',
      configType,
      scope: resolved.scope,
      path: resolved.path,
      success: false,
      error: msg
    };
  }
}

async function handleGetOpencodeAuthStatus(
  deps: OpencodeAgentRequestsDeps,
  providerId: string
): Promise<GetOpencodeAuthStatusResponse> {
  const id = String(providerId ?? '').trim();
  const authPath = getOpencodeAuthFilePath();
  try {
    const fileExists = await pathExists(authPath);
    if (!fileExists) {
      return { type: 'get_opencode_auth_status_response', providerId: id, exists: false };
    }

    const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(authPath))).toString(
      'utf8'
    );
    const json = raw ? (JSON.parse(raw || '{}') as Record<string, any>) : {};
    const entry = json?.[id];
    if (!entry || typeof entry !== 'object') {
      return { type: 'get_opencode_auth_status_response', providerId: id, exists: false };
    }

    const authTypeRaw = typeof (entry as any)?.type === 'string' ? String((entry as any).type) : '';
    const authType =
      authTypeRaw === 'api' || authTypeRaw === 'oauth' || authTypeRaw === 'wellknown'
        ? (authTypeRaw as 'api' | 'oauth' | 'wellknown')
        : undefined;

    const keyRaw = typeof (entry as any)?.key === 'string' ? String((entry as any).key) : '';
    const hasApiKey = keyRaw.trim().length > 0;

    return {
      type: 'get_opencode_auth_status_response',
      providerId: id,
      exists: true,
      authType,
      hasApiKey
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { type: 'get_opencode_auth_status_response', providerId: id, exists: false, error: msg };
  }
}

async function handleSetOpencodeAuthApiKey(
  _deps: OpencodeAgentRequestsDeps,
  providerId: string,
  apiKey: string
): Promise<SetOpencodeAuthApiKeyResponse> {
  const id = String(providerId ?? '').trim();
  const authPath = getOpencodeAuthFilePath();

  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(authPath)));

    let raw: Uint8Array | undefined;
    try {
      raw = await vscode.workspace.fs.readFile(vscode.Uri.file(authPath));
    } catch {
      raw = undefined;
    }

    const json = raw ? (JSON.parse(Buffer.from(raw).toString('utf8') || '{}') as Record<string, any>) : {};

    const key = String(apiKey ?? '');
    if (!key) {
      delete json[id];
    } else {
      json[id] = { type: 'api', key };
    }

    const text = JSON.stringify(json, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(vscode.Uri.file(authPath), Buffer.from(text, 'utf8'));

    return { type: 'set_opencode_auth_api_key_response', providerId: id, success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      type: 'set_opencode_auth_api_key_response',
      providerId: id,
      success: false,
      error: msg
    };
  }
}

async function handleOpenInTerminal(deps: OpencodeAgentRequestsDeps): Promise<void> {
  const opencodePath =
    deps.configService.getValue<string>('opencodeGui.opencodePath', 'opencode') ?? 'opencode';
  const terminal = vscode.window.createTerminal('OpenCode');
  terminal.show(true);
  terminal.sendText(opencodePath, true);
}

async function openFile(deps: OpencodeAgentRequestsDeps, filePath: string, location?: any): Promise<void> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
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

function getUserGuiConfigDir(deps: OpencodeAgentRequestsDeps): string {
  const configDir = (deps.configService.getValue<string>('opencodeGui.configDir', '') ?? '').trim();
  if (configDir) return configDir;
  return path.join(os.homedir(), '.config', 'opencode');
}

function getXdgConfigHome(): string {
  const env = String(process.env.XDG_CONFIG_HOME ?? '').trim();
  if (env) return env;
  return path.join(os.homedir(), '.config');
}

function getXdgDataHome(): string {
  const env = String(process.env.XDG_DATA_HOME ?? '').trim();
  if (env) return env;
  return path.join(os.homedir(), '.local', 'share');
}

function getOpencodeUserConfigDir(deps: OpencodeAgentRequestsDeps): string {
  const override = (deps.configService.getValue<string>('opencodeGui.configDir', '') ?? '').trim();
  if (override) return override;
  return path.join(getXdgConfigHome(), 'opencode');
}

function getOpencodeProjectConfigDir(cwd: string): string {
  return path.join(cwd, '.opencode');
}

async function findOpencodeProjectConfigFilePath(startDir: string): Promise<string | undefined> {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (true) {
    const candidates = [
      path.join(dir, '.opencode', 'opencode.json'),
      path.join(dir, '.opencode', 'opencode.jsonc'),
      path.join(dir, 'opencode.json'),
      path.join(dir, 'opencode.jsonc')
    ];

    for (const candidate of candidates) {
      if (await pathExists(candidate)) return candidate;
    }

    // Stop at git root (best-effort).
    if (await pathExists(path.join(dir, '.git'))) {
      return undefined;
    }

    if (dir === root) return undefined;
    const parent = path.dirname(dir);
    if (!parent || parent === dir) return undefined;
    dir = parent;
  }
}

function getOpencodeAuthFilePath(): string {
  return path.join(getXdgDataHome(), 'opencode', 'auth.json');
}

async function resolveOpencodeConfigFilePath(
  deps: OpencodeAgentRequestsDeps,
  configType: 'opencode' | 'oh-my-opencode' | 'auth',
  scope: 'user' | 'project' | undefined,
  cwd: string
): Promise<{ path: string; scope: 'user' | 'project' | undefined }> {
  if (configType === 'auth') {
    return { path: getOpencodeAuthFilePath(), scope: 'user' };
  }

  const resolvedScope: 'user' | 'project' = scope === 'project' ? 'project' : 'user';
  const dir =
    resolvedScope === 'project' ? getOpencodeProjectConfigDir(cwd) : getOpencodeUserConfigDir(deps);

  if (configType === 'oh-my-opencode') {
    return { path: path.join(dir, 'oh-my-opencode.json'), scope: resolvedScope };
  }

  if (resolvedScope === 'project') {
    const found = await findOpencodeProjectConfigFilePath(cwd);
    if (found) {
      return { path: found, scope: resolvedScope };
    }
  }

  const jsoncPath = path.join(dir, 'opencode.jsonc');
  const jsonPath = path.join(dir, 'opencode.json');
  if (await pathExists(jsonPath)) {
    return { path: jsonPath, scope: resolvedScope };
  }
  if (await pathExists(jsoncPath)) {
    return { path: jsoncPath, scope: resolvedScope };
  }
  return { path: jsoncPath, scope: resolvedScope };
}

function getUserGuiConfigPath(deps: OpencodeAgentRequestsDeps, configType: 'settings' | 'mcp'): string {
  const baseDir = getUserGuiConfigDir(deps);
  return path.join(
    baseDir,
    configType === 'mcp' ? 'opencode-gui-mcp.json' : 'opencode-gui-settings.json'
  );
}

function getProjectGuiConfigPath(cwd: string, configType: 'settings' | 'mcp'): string {
  const dir = path.join(cwd, '.opencode');
  return path.join(
    dir,
    configType === 'mcp' ? 'opencode-gui-mcp.json' : 'opencode-gui-settings.json'
  );
}

function getProjectOhMyConfigPath(cwd: string): string {
  return path.join(cwd, '.opencode', 'oh-my-opencode.json');
}

async function readOhMyConfig(
  deps: OpencodeAgentRequestsDeps,
  cwd: string
): Promise<{ path: string; config: any } | undefined> {
  const configDir = (deps.configService.getValue<string>('opencodeGui.configDir', '') ?? '').trim();
  const candidates = [
    getProjectOhMyConfigPath(cwd),
    configDir ? path.join(configDir, 'oh-my-opencode.json') : undefined,
    configDir ? path.join(configDir, 'opencode', 'oh-my-opencode.json') : undefined,
    path.join(getXdgConfigHome(), 'opencode', 'oh-my-opencode.json')
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    const json = await readJsonFile(p).catch(() => undefined);
    if (json) return { path: p, config: json };
  }
  return undefined;
}

async function readJsonFile(filePath: string): Promise<any> {
  const data = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const text = Buffer.from(data).toString('utf8');
  return JSON.parse(text || '{}');
}

async function writeJsonFile(filePath: string, json: any): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(filePath)));
  const text = JSON.stringify(json ?? {}, null, 2);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(text, 'utf8'));
}

function resolveFilePath(filePath: string, cwd: string): string {
  if (!filePath) return cwd;
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

async function pickExistingPath(paths: string[]): Promise<string | undefined> {
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

function sanitizeFileName(fileName: string): string {
  const fallback = fileName && fileName.trim() ? fileName.trim() : 'opencode.txt';
  return fallback.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function detectLanguage(fileName?: string): string {
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

async function createTempFile(fileName: string, content: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-'));
  const sanitized = sanitizeFileName(fileName);
  const filePath = path.join(tempDir, sanitized);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

async function prepareDiffRightFile(
  originalPath: string,
  fallbackPath: string | undefined,
  edits: Array<{ oldString: string; newString: string; replaceAll?: boolean }>
): Promise<string> {
  let baseContent = '';
  if (await pathExists(originalPath)) {
    baseContent = await fs.readFile(originalPath, 'utf8');
  } else if (fallbackPath && (await pathExists(fallbackPath))) {
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
  return createTempFile(outputName, modified);
}

async function waitForDocumentEdits(document: vscode.TextDocument): Promise<string> {
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

async function handleGetCurrentSelection(): Promise<GetCurrentSelectionResponse> {
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

async function handleGetAssetUris(deps: OpencodeAgentRequestsDeps): Promise<GetAssetUrisResponse> {
  const webview = deps.webViewService.getWebView();
  if (!webview) {
    return { type: 'asset_uris_response', assetUris: {} };
  }

  const assets = {
    clawd: {
      light: path.join('resources', 'clawd.svg'),
      dark: path.join('resources', 'clawd.svg')
    },
    'opencode-logo': {
      light: path.join('resources', 'opencode-logo.png'),
      dark: path.join('resources', 'opencode-logo.png')
    },
    'welcome-art': {
      light: path.join('resources', 'welcome-art-light.svg'),
      dark: path.join('resources', 'welcome-art-dark.svg')
    }
  } as const;

  const extensionPath = deps.webViewService.getExtensionPath();
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

async function handleListSessions(deps: OpencodeAgentRequestsDeps): Promise<ListSessionsResponse> {
  const cwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const raw = await deps.client.listSessions(cwd);
  const sessions: any[] = Array.isArray(raw) ? raw : (raw?.sessions ?? []);

  const toMessageCount = (session: any): number => {
    const direct =
      session?.messageCount ??
      session?.message_count ??
      session?.messagesCount ??
      session?.messages_count;

    if (typeof direct === 'number') {
      return Number.isFinite(direct) ? Math.max(0, Math.trunc(direct)) : 0;
    }
    if (typeof direct === 'string' && direct.trim()) {
      const parsed = Number(direct);
      return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    }
    if (Array.isArray(session?.messages)) {
      return session.messages.length;
    }

    return 0;
  };

  const mapped = sessions
    .filter((s) => !s?.directory || String(s.directory) === cwd)
    .map((s) => ({
      id: String(s.id),
      parentId: typeof s?.parentID === 'string' && s.parentID.trim() ? String(s.parentID) : undefined,
      title: String(s?.title ?? ''),
      lastModified: Number(s?.time?.updated ?? s?.time?.created ?? Date.now()),
      messageCount: toMessageCount(s),
      summary: String(s?.title ?? s?.id),
      worktree: undefined,
      isCurrentWorkspace: true
    }))
    .sort((a, b) => b.lastModified - a.lastModified);

  return { type: 'list_sessions_response', sessions: mapped };
}

async function handleDeleteSession(
  deps: OpencodeAgentRequestsDeps,
  sessionId: string
): Promise<DeleteSessionResponse> {
  const id = String(sessionId ?? '').trim();
  if (!id) {
    return { type: 'delete_session_response', success: false };
  }

  const fallbackCwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const cwd = await resolveSessionDirectory(deps.client, id, fallbackCwd);
  const success = await deps.client.deleteSession(id, cwd);
  return { type: 'delete_session_response', success: !!success };
}

async function handleGetSession(
  deps: OpencodeAgentRequestsDeps,
  sessionId: string
): Promise<GetSessionResponse> {
  const fallbackCwd = deps.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath ?? process.cwd();
  const cwd = await resolveSessionDirectory(deps.client, sessionId, fallbackCwd);
  const raw = await deps.client.listMessages(sessionId, cwd);
  const items: Array<{ info: OpenCodeMessageInfo; parts: any[] }> = Array.isArray(raw)
    ? raw
    : (raw?.messages ?? []);

  const events: any[] = [];
  for (const item of items) {
    const info = item?.info;
    const parts = Array.isArray(item?.parts) ? item.parts : [];
    if (!info || !(info as any).sessionID || !(info as any).id) continue;

    if ((info as any).role === 'user') {
      const text = parts
        .filter((p) => p?.type === 'text')
        .map((p) => String(p.text ?? ''))
        .join('\n');
      events.push({
        type: 'user',
        timestamp: Number((info as any).time?.created ?? Date.now()),
        message: { role: 'user', content: [{ type: 'text', text }] }
      });
      continue;
    }

    if ((info as any).role === 'assistant') {
      const infoModel = (info as any)?.model as any;
      const providerID = String(
        (info as any)?.providerID ?? infoModel?.providerID ?? infoModel?.providerId ?? ''
      ).trim();
      const modelID = String((info as any)?.modelID ?? infoModel?.modelID ?? infoModel?.modelId ?? '').trim();
      const modelValue = providerID && modelID ? `${providerID}/${modelID}` : undefined;
      const contextWindow = modelValue ? deps.modelContextWindowById.get(modelValue) : undefined;
      const usage = deps.buildUsageFromTokens((info as any).tokens, { contextWindow });

      for (const p of parts) {
        if (p?.type !== 'tool') continue;
        const tp = p as OpenCodeToolPart;
        const toolUseId = tp.callID || tp.id;
        events.push({
          type: 'assistant',
          timestamp: Date.now(),
          message: {
            id: (info as any).id,
            role: 'assistant',
            content: [
              { type: 'tool_use', id: toolUseId, name: tp.tool, input: buildToolUseInput(tp) }
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
                  content: tp.state?.status === 'completed' ? (tp.state.output ?? '') : (tp.state.error ?? ''),
                  is_error: tp.state?.status === 'error'
                }
              ]
            }
          });
        }
      }

      const thinking = parts
        .filter((p) => p?.type === 'reasoning')
        .map((p) => String(p.text ?? ''))
        .join('');
      if (thinking.trim()) {
        events.push({
          type: 'assistant',
          timestamp: Date.now(),
          message: {
            id: (info as any).id,
            role: 'assistant',
            content: [{ type: 'thinking', thinking }]
          }
        });
      }

      const text = parts
        .filter((p) => p?.type === 'text')
        .map((p) => String(p.text ?? ''))
        .join('');
      if (text.trim()) {
        events.push({
          type: 'assistant',
          timestamp: Date.now(),
          message: { id: (info as any).id, role: 'assistant', content: [{ type: 'text', text }] }
        });
      }

      if (usage) {
        events.push({
          type: 'assistant',
          timestamp: Number(
            (info as any).time?.completed ?? (info as any).time?.updated ?? (info as any).time?.created ?? Date.now()
          ),
          message: { id: (info as any).id, role: 'assistant', content: [], usage }
        });
      }
    }
  }

  return { type: 'get_session_response', messages: events };
}
