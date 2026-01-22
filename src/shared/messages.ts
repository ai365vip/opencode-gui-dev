/**
 * 共享消息类型定义
 *
 * 双端通信协议：Extension ↔ WebView
 */

// 导入 UI 类型
import type {
  SDKMessage,
  SDKUserMessage,
  PermissionResult,
  PermissionUpdate,
  PermissionMode
} from '@opencode-gui/ui-types';

// ============================================================================
// 基础消息类型
// ============================================================================

/**
 * 工作模式类型
 */
export type WorkMode = 'default' | 'agent' | 'ask';

/**
 * 消息基类
 */
export interface BaseMessage {
  type: string;
}

// ============================================================================
// WebView → Extension 消息
// ============================================================================

/**
 * 启动 Claude 会话
 */
export interface LaunchClaudeMessage extends BaseMessage {
  type: 'launch_claude';
  channelId: string;
  resume?: string | null; // 恢复会话 ID
  resumeSessionAt?: string; // 从指定消息ID恢复（重发功能）
  cwd?: string; // 工作目录
  model?: string | null; // 模型名称
  variant?: string | null;
  permissionMode?: PermissionMode; // 权限模式
  workMode?: string;
  thinkingLevel?: string | null; // Thinking 等级（off | default_on）
  initialMessage?: SDKUserMessage; // 首条用户消息（解决时序问题）
}

/**
 * 输入输出消息（双向）
 */
export interface IOMessage extends BaseMessage {
  type: 'io_message';
  channelId: string;
  message: SDKMessage | SDKUserMessage; // SDK 消息类型
  done: boolean; // 是否为流的最后一条
}

/**
 * 中断 Claude
 */
export interface InterruptClaudeMessage extends BaseMessage {
  type: 'interrupt_claude';
  channelId: string;
}

/**
 * 关闭会话（双向）
 */
export interface CloseChannelMessage extends BaseMessage {
  type: 'close_channel';
  channelId: string;
  error?: string;
}

// ============================================================================
// 请求-响应消息（双向）
// ============================================================================

/**
 * 请求消息
 */
export interface RequestMessage<T = any> extends BaseMessage {
  type: 'request';
  channelId?: string;
  requestId: string;
  request: T;
}

/**
 * 响应消息
 */
export interface ResponseMessage<T = any> extends BaseMessage {
  type: 'response';
  requestId: string;
  response: T | ErrorResponse;
}

/**
 * 错误响应
 */
export interface ErrorResponse {
  type: 'error';
  error: string;
}

/**
 * 取消请求
 */
export interface CancelRequestMessage extends BaseMessage {
  type: 'cancel_request';
  targetRequestId: string;
}

// ============================================================================
// WebView → Extension 请求类型
// ============================================================================

/**
 * 初始化请求
 */
export interface InitRequest {
  type: 'init';
}

export interface InitResponse {
  type: 'init_response';
  state: {
    defaultCwd: string;
    openNewInTab: boolean;
    // authStatus: null | { authenticated: boolean };
    modelSetting: string;
    platform: string;
    thinkingLevel?: string; // Thinking 等级（off | default_on）
  };
}

/**
 * 打开文件请求
 */
export interface OpenFileRequest {
  type: 'open_file';
  filePath: string;
  location?: {
    startLine?: number;
    endLine?: number;
    startColumn?: number;
    endColumn?: number;
  };
}

export interface OpenFileResponse {
  type: 'open_file_response';
}

/**
 * 打开 Diff 请求
 */
export interface OpenDiffRequest {
  type: 'open_diff';
  originalFilePath: string;
  newFilePath: string;
  edits: Array<{
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  }>;
  supportMultiEdits: boolean;
}

export interface OpenDiffResponse {
  type: 'open_diff_response';
  newEdits: Array<{
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  }>;
}

/**
 * 设置权限模式
 */
export interface SetPermissionModeRequest {
  type: 'set_permission_mode';
  mode: PermissionMode;
}

export interface SetPermissionModeResponse {
  type: 'set_permission_mode_response';
  success: boolean;
}

/**
 * 模型选项
 */
export interface ModelOption {
  value: string;
  label?: string;
  description?: string;
  provider?: string;
}

/**
 * 设置模型
 */
export interface SetModelRequest {
  type: 'set_model';
  model: ModelOption;
}

export interface SetModelResponse {
  type: 'set_model_response';
  success: boolean;
}

/**
 * 设置 Thinking Level
 */
export interface SetThinkingLevelRequest {
  type: 'set_thinking_level';
  channelId: string;
  thinkingLevel: string;
}

export interface SetThinkingLevelResponse {
  type: 'set_thinking_level_response';
}

export interface SetVariantRequest {
  type: 'set_variant';
  variant: string;
}

export interface SetVariantResponse {
  type: 'set_variant_response';
  success: boolean;
}

/**
 * 获取 Claude 状态
 */
export interface GetClaudeStateRequest {
  type: 'get_claude_state';
}

export interface GetClaudeStateResponse {
  type: 'get_claude_state_response';
  config: any;
}

export interface GetProgressRequest {
  type: 'get_progress';
}

export interface GetProgressResponse {
  type: 'get_progress_response';
  progress: {
    channelId?: string;
    sessionId?: string;
    running: boolean;
    agent?: string;
    model?: string;
    lastEvents: Array<{ ts: number; type: string; summary: string }>;
  };
}

/**
 * 获取 MCP 服务器
 */
export interface GetMcpServersRequest {
  type: 'get_mcp_servers';
}

export interface GetMcpServersResponse {
  type: 'get_mcp_servers_response';
  mcpServers: Array<{ name: string; status: string }>;
}

/**
 * 获取资源 URI
 */
export interface GetAssetUrisRequest {
  type: 'get_asset_uris';
}

export interface GetAssetUrisResponse {
  type: 'asset_uris_response';
  assetUris: any;
}

/**
 * 列出会话
 */
export interface ListSessionsRequest {
  type: 'list_sessions_request';
}

export interface ListSessionsResponse {
  type: 'list_sessions_response';
  sessions: Array<{
    id: string;
    parentId?: string;
    lastModified: number;
    messageCount: number;
    summary: string;
    worktree?: string;
    isCurrentWorkspace: boolean;
  }>;
}

/**
 * 删除会话
 */
export interface DeleteSessionRequest {
  type: 'delete_session_request';
  sessionId: string;
}

export interface DeleteSessionResponse {
  type: 'delete_session_response';
  success: boolean;
}

/**
 * 获取会话详情
 */
export interface GetSessionRequest {
  type: 'get_session_request';
  sessionId: string;
}

export interface GetSessionResponse {
  type: 'get_session_response';
  messages: any[];
}

/**
 * 执行命令
 */
export interface ExecRequest {
  type: 'exec';
  command: string;
  params: string[];
}

export interface ExecResponse {
  type: 'exec_response';
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 列出文件
 */
export interface ListFilesRequest {
  type: 'list_files_request';
  pattern?: string;
}

export interface ListFilesResponse {
  type: 'list_files_response';
  files: Array<{
    path: string;
    name: string;
    type: string;
    mtime?: number; // 修改时间戳（可选）
  }>;
}

/**
 * 打开内容（临时文件）
 */
export interface OpenContentRequest {
  type: 'open_content';
  content: string;
  fileName: string;
  editable: boolean;
}

export interface OpenContentResponse {
  type: 'open_content_response';
  updatedContent?: string;
}

/**
 * 当前选区
 */
export interface SelectionRange {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  selectedText: string;
}

export interface GetCurrentSelectionRequest {
  type: 'get_current_selection';
}

export interface GetCurrentSelectionResponse {
  type: 'get_current_selection_response';
  selection: SelectionRange | null;
}

/**
 * 打开 URL
 */
export interface OpenURLRequest {
  type: 'open_url';
  url: string;
}

export interface OpenURLResponse {
  type: 'open_url_response';
}

/**
 * 显示通知
 */
export interface ShowNotificationRequest {
  type: 'show_notification';
  message: string;
  severity: 'info' | 'warning' | 'error';
  buttons?: string[];
  onlyIfNotVisible?: boolean;
}

export interface ShowNotificationResponse {
  type: 'show_notification_response';
  buttonValue?: string;
}

/**
 * 新建会话标签
 */
export interface NewConversationTabRequest {
  type: 'new_conversation_tab';
  initialPrompt?: string;
}

export interface NewConversationTabResponse {
  type: 'new_conversation_tab_response';
}

/**
 * 重命名标签
 */
export interface RenameTabRequest {
  type: 'rename_tab';
  title: string;
}

export interface RenameTabResponse {
  type: 'rename_tab_response';
}

/**
 * 获取认证状态
 */
// export interface GetAuthStatusRequest {
//     type: "get_auth_status";
// }

// export interface GetAuthStatusResponse {
//     type: "get_auth_status_response";
//     status: null | { authenticated: boolean };
// }

/**
 * 登录请求
 */
// export interface LoginRequest {
//     type: "login";
//     method: "claude.ai" | "console.anthropic.com";
// }

// export interface LoginResponse {
//     type: "login_response";
//     auth: {
//         authenticated: boolean;
//         apiKey?: string;
//     };
// }

/**
 * 提交 OAuth 代码
 */
// export interface SubmitOAuthCodeRequest {
//     type: "submit_oauth_code";
//     code: string;
// }

// export interface SubmitOAuthCodeResponse {
//     type: "submit_oauth_code_response";
// }

/**
 * 打开配置文件
 */
export interface OpenConfigFileRequest {
  type: 'open_config_file';
  configType: string;
}

export interface OpenConfigFileResponse {
  type: 'open_config_file_response';
}

/**
 * 读取 OpenCode 配置文件内容（用于设置页内直接编辑）
 */
export interface GetOpencodeConfigFileRequest {
  type: 'get_opencode_config_file';
  configType: 'opencode' | 'oh-my-opencode' | 'auth';
  scope?: 'user' | 'project'; // opencode/oh-my-opencode 支持 project；auth 固定 user
}

export interface GetOpencodeConfigFileResponse {
  type: 'get_opencode_config_file_response';
  configType: 'opencode' | 'oh-my-opencode' | 'auth';
  scope?: 'user' | 'project';
  path: string;
  exists: boolean;
  content: string;
  error?: string;
}

/**
 * 保存 OpenCode 配置文件内容（用于设置页内直接编辑）
 */
export interface SaveOpencodeConfigFileRequest {
  type: 'save_opencode_config_file';
  configType: 'opencode' | 'oh-my-opencode' | 'auth';
  scope?: 'user' | 'project';
  content: string;
}

export interface SaveOpencodeConfigFileResponse {
  type: 'save_opencode_config_file_response';
  configType: 'opencode' | 'oh-my-opencode' | 'auth';
  scope?: 'user' | 'project';
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * 获取 OpenCode auth.json 中某个 provider 的认证状态（不返回敏感内容）
 */
export interface GetOpencodeAuthStatusRequest {
  type: 'get_opencode_auth_status';
  providerId: string;
}

export interface GetOpencodeAuthStatusResponse {
  type: 'get_opencode_auth_status_response';
  providerId: string;
  exists: boolean;
  authType?: 'api' | 'oauth' | 'wellknown';
  hasApiKey?: boolean;
  error?: string;
}

/**
 * 将 API Key 写入 OpenCode auth.json（全局）
 * - apiKey 为空时会删除对应条目
 */
export interface SetOpencodeAuthApiKeyRequest {
  type: 'set_opencode_auth_api_key';
  providerId: string;
  apiKey: string;
}

export interface SetOpencodeAuthApiKeyResponse {
  type: 'set_opencode_auth_api_key_response';
  providerId: string;
  success: boolean;
  error?: string;
}

/**
 * 在终端打开 Claude
 */
export interface OpenClaudeInTerminalRequest {
  type: 'open_claude_in_terminal';
}

export interface OpenClaudeInTerminalResponse {
  type: 'open_claude_in_terminal_response';
}

/**
 * 读取 Claude 配置
 */
export interface GetClaudeConfigRequest {
  type: 'get_claude_config';
  scope?: 'user' | 'project' | 'merged'; // 配置范围：全局、项目、合并（默认merged）
  configType?: 'settings' | 'mcp'; // 配置类型：设置文件、MCP配置（默认settings）
}

export interface GetClaudeConfigResponse {
  type: 'get_claude_config_response';
  config: ClaudeConfigData;
}

/**
 * 保存 Claude 配置
 */
export interface SaveClaudeConfigRequest {
  type: 'save_claude_config';
  config: ClaudeConfigData;
  scope?: 'user' | 'project'; // 配置范围：全局、项目（默认user）
  configType?: 'settings' | 'mcp'; // 配置类型：设置文件、MCP配置（默认settings）
}

export interface SaveClaudeConfigResponse {
  type: 'save_claude_config_response';
  success: boolean;
  error?: string;
}

/**
 * 获取 Agents 列表
 */
export interface GetAgentsRequest {
  type: 'get_agents';
}

export interface GetAgentsResponse {
  type: 'get_agents_response';
  agents: AgentInfo[];
}

/**
 * Agent 信息
 */
export interface AgentInfo {
  name: string;
  description: string;
  category: string;
  path: string;
  tools?: string[];
  model?: string;
  content?: string;
  enabled: boolean;
}

/**
 * 启用/禁用 Agent
 */
export interface ToggleAgentRequest {
  type: 'toggle_agent';
  agentName: string;
  enabled: boolean;
}

export interface ToggleAgentResponse {
  type: 'toggle_agent_response';
  success: boolean;
  error?: string;
}

/**
 * 删除 Agent
 */
export interface DeleteAgentRequest {
  type: 'delete_agent';
  agentPath: string;
}

export interface DeleteAgentResponse {
  type: 'delete_agent_response';
  success: boolean;
  error?: string;
}

/**
 * 获取 Skills 列表
 */
export interface GetSkillsRequest {
  type: 'get_skills';
}

export interface GetSkillsResponse {
  type: 'get_skills_response';
  skills: SkillInfo[];
}

/**
 * Skill 信息
 */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  path: string;
  enabled: boolean;
}

/**
 * 启用/禁用 Skill
 */
export interface ToggleSkillRequest {
  type: 'toggle_skill';
  skillId: string;
  enabled: boolean;
}

export interface ToggleSkillResponse {
  type: 'toggle_skill_response';
  success: boolean;
  error?: string;
}

/**
 * 删除 Skill
 */
export interface DeleteSkillRequest {
  type: 'delete_skill';
  skillPath: string;
}

export interface DeleteSkillResponse {
  type: 'delete_skill_response';
  success: boolean;
  error?: string;
}

/**
 * Claude 配置数据结构
 */
export interface ClaudeConfigData {
  // 环境变量配置
  env?: {
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_BASE_URL?: string;
    ANTHROPIC_MODEL?: string;
    ANTHROPIC_SMALL_FAST_MODEL?: string;
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC?: string;
    DISABLE_ERROR_REPORTING?: string;
    DISABLE_TELEMETRY?: string;
    MAX_THINKING_TOKENS?: string;
    HTTP_PROXY?: string;
    HTTPS_PROXY?: string;
    NO_PROXY?: string;
    [key: string]: string | undefined;
  };

  // MCP 服务器配置
  mcpServers?: {
    [serverName: string]: {
      description?: string;
      type?: 'stdio' | 'sse' | 'http';
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
      disabled?: boolean;
    };
  };

  // 权限配置
  permissions?: {
    allow?: string[];
    deny?: string[];
  };

  // 权限模式
  permissionMode?: PermissionMode;

  // 其他配置
  includeCoAuthoredBy?: boolean;
  maxTurns?: number;
  thinkingLevel?: string;
  customSystemPrompt?: string;
  appendSystemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  fallbackModel?: string;
  additionalDirectories?: string[];
}

/**
 * 认证 URL 通知（Extension → WebView）
 */
// export interface AuthURLRequest {
//     type: "auth_url";
//     url: string;
//     method: string;
// }

// ============================================================================
// Extension → WebView 请求类型
// ============================================================================

/**
 * 工具权限请求
 */
export interface ToolPermissionRequest {
  type: 'tool_permission_request';
  toolName: string;
  inputs: Record<string, unknown>;
  suggestions: PermissionUpdate[];
}

export interface ToolPermissionResponse {
  type: 'tool_permission_response';
  result: PermissionResult;
}

/**
 * @ 提及插入
 */
export interface InsertAtMentionRequest {
  type: 'insert_at_mention';
  text: string;
}

/**
 * 选区变化通知
 */
export interface SelectionChangedRequest {
  type: 'selection_changed';
  selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * 状态更新
 */
export interface UpdateStateRequest {
  type: 'update_state';
  // 与 init_response.state 对齐，保证双方一致
  state: InitResponse['state'];
  // 后端下发的 Claude 配置对象
  config: GetClaudeStateResponse['config'];
}

// ============================================================================
// 联合类型
// ============================================================================

/**
 * 所有 WebView → Extension 的消息
 */
export type WebViewToExtensionMessage =
  | LaunchClaudeMessage
  | IOMessage
  | InterruptClaudeMessage
  | CloseChannelMessage
  | RequestMessage
  | ResponseMessage
  | CancelRequestMessage
  | AddCustomModelMessage
  | WorkModeChangeMessage;

/**
 * 所有 Extension → WebView 的消息
 */
export type ExtensionToWebViewMessage =
  | IOMessage
  | CloseChannelMessage
  | RequestMessage
  | ResponseMessage
  | AddSelectionMessage
  | AddMultipleFilesMessage
  | InsertFileReferenceMessage
  | ModelChangeMessage
  | CustomModelAddedMessage;

/**
 * Extension 发送时的封装格式
 */
export interface FromExtensionWrapper {
  type: 'from-extension';
  message: ExtensionToWebViewMessage;
}

// ============================================================================
// 请求和响应的联合类型
// ============================================================================

/**
 * WebView → Extension 的所有请求类型
 */
export type WebViewRequest =
  | InitRequest
  | OpenFileRequest
  | OpenDiffRequest
  | OpenContentRequest
  | SetPermissionModeRequest
  | SetModelRequest
  | SetThinkingLevelRequest
  | SetVariantRequest
  | GetCurrentSelectionRequest
  | ShowNotificationRequest
  | NewConversationTabRequest
  | RenameTabRequest
  | GetClaudeStateRequest
  | GetMcpServersRequest
  | GetAssetUrisRequest
  | ListSessionsRequest
  | DeleteSessionRequest
  | GetSessionRequest
  | ExecRequest
  | ListFilesRequest
  | OpenURLRequest
  // | GetAuthStatusRequest
  // | LoginRequest
  // | SubmitOAuthCodeRequest
  | OpenConfigFileRequest
  | GetOpencodeConfigFileRequest
  | SaveOpencodeConfigFileRequest
  | GetOpencodeAuthStatusRequest
  | SetOpencodeAuthApiKeyRequest
  | OpenClaudeInTerminalRequest
  | GetClaudeConfigRequest
  | SaveClaudeConfigRequest
  | GetAgentsRequest
  | ToggleAgentRequest
  | DeleteAgentRequest
  | GetSkillsRequest
  | ToggleSkillRequest
  | DeleteSkillRequest
  | GetProgressRequest;

/**
 * Extension → WebView 的所有响应类型
 */
export type WebViewRequestResponse =
  | InitResponse
  | OpenFileResponse
  | OpenDiffResponse
  | OpenContentResponse
  | SetPermissionModeResponse
  | SetModelResponse
  | SetThinkingLevelResponse
  | SetVariantResponse
  | GetCurrentSelectionResponse
  | ShowNotificationResponse
  | NewConversationTabResponse
  | RenameTabResponse
  | GetClaudeStateResponse
  | GetMcpServersResponse
  | GetAssetUrisResponse
  | ListSessionsResponse
  | DeleteSessionResponse
  | GetSessionResponse
  | ExecResponse
  | ListFilesResponse
  | OpenURLResponse
  // | GetAuthStatusResponse
  // | LoginResponse
  // | SubmitOAuthCodeResponse
  | OpenConfigFileResponse
  | GetOpencodeConfigFileResponse
  | SaveOpencodeConfigFileResponse
  | GetOpencodeAuthStatusResponse
  | SetOpencodeAuthApiKeyResponse
  | OpenClaudeInTerminalResponse
  | GetClaudeConfigResponse
  | SaveClaudeConfigResponse
  | GetAgentsResponse
  | ToggleAgentResponse
  | DeleteAgentResponse
  | GetSkillsResponse
  | ToggleSkillResponse
  | DeleteSkillResponse
  | GetProgressResponse;

/**
 * Extension → WebView 的所有请求类型
 */
export type ExtensionRequest =
  | ToolPermissionRequest
  | InsertAtMentionRequest
  | SelectionChangedRequest
  | UpdateStateRequest
  | VisibilityChangedRequest;
// | AuthURLRequest;

/**
 * 可见性变化（Extension → WebView）
 *
 * 原始代码：Analyze/extension.unpack.js:2648-2656
 */
export interface VisibilityChangedRequest {
  type: 'visibility_changed';
  isVisible: boolean;
}

/**
 * 添加自定义模型（WebView → Extension）
 */
export interface AddCustomModelMessage extends BaseMessage {
  type: 'add-custom-model';
}

/**
 * 自定义模型添加结果（Extension → WebView）
 */
export interface CustomModelAddedMessage extends BaseMessage {
  type: 'custom-model-added';
  model: {
    id: string;
    label: string;
    description: string;
  } | null;
}

/**
 * Diff Preview 待处理文件状态更新（Extension → WebView）
 */
/**
 * 工作模式变更（WebView → Extension）
 */
export interface AddSelectionMessage extends BaseMessage {
  type: 'add-selection';
  payload: {
    selectedText: string;
    filePath: string;
    relativePath: string;
    startLine?: number;
    endLine?: number;
  };
}

export interface AddMultipleFilesMessage extends BaseMessage {
  type: 'add-multiple-files';
  payload: {
    relativePaths: string[];
  };
}

export interface InsertFileReferenceMessage extends BaseMessage {
  type: 'insert-file-reference';
  payload: {
    relativePath: string;
  };
}

export interface ModelChangeMessage extends BaseMessage {
  type: 'model-change';
}

export interface WorkModeChangeMessage extends BaseMessage {
  type: 'work-mode-change';
  mode: 'agent' | 'ask';
  channelId?: string;
}

/**
 * WebView → Extension 的所有响应类型
 */
export type ExtensionRequestResponse = ToolPermissionResponse;
