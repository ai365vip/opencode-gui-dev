/**
 * ClaudeAgentService - Claude Agent 核心编排服务
 *
 * 职责：
 * 1. 管理多个 Claude 会话（channels）
 * 2. 接收和分发来自 Transport 的消息
 * 3. 启动和控制 Claude 会话（launchClaude, interruptClaude）
 * 4. 路由请求到对应的 handlers
 * 5. RPC 请求-响应管理
 *
 * 依赖：
 * - IClaudeSdkService: SDK 调用
 * - IClaudeSessionService: 会话历史
 * - ILogService: 日志
 * - 其他基础服务
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IWorkspaceService } from '../workspaceService';
import { IFileSystemService } from '../fileSystemService';
import { INotificationService } from '../notificationService';
import { ITerminalService } from '../terminalService';
import { ITabsAndEditorsService } from '../tabsAndEditorsService';
import { IClaudeSdkService } from './ClaudeSdkService';
import { IClaudeSessionService } from './ClaudeSessionService';
import { IClaudeConfigService } from '../claudeConfigService';
import { IClaudeAgentsService } from '../claudeAgentsService';
import { IClaudeSkillsService } from '../claudeSkillsService';
import { IInlineDiffService } from '../inlineDiffService';
import { IDiffPreviewService } from '../diffPreview/DiffPreviewService';
import { AsyncStream, ITransport } from './transport';
import { HandlerContext } from './handlers/types';
import { IWebViewService } from '../webViewService';

// 消息类型导入
import type {
    WebViewToExtensionMessage,
    ExtensionToWebViewMessage,
    RequestMessage,
    ResponseMessage,
    ExtensionRequest,
    ToolPermissionRequest,
    ToolPermissionResponse,
} from '../../shared/messages';

// SDK 类型导入
import type {
    SDKMessage,
    SDKUserMessage,
    Query,
    PermissionResult,
    PermissionUpdate,
    CanUseTool,
    PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';

// Handlers 导入
import {
    handleInit,
    handleGetClaudeState,
    handleGetMcpServers,
    handleGetAssetUris,
    handleOpenFile,
    handleGetCurrentSelection,
    handleShowNotification,
    handleNewConversationTab,
    handleRenameTab,
    handleOpenDiff,
    handleListSessions,
    handleGetSession,
    // handleExec,  // 已禁用（安全考虑）
    handleListFiles,
    handleOpenContent,
    handleOpenURL,
    handleOpenConfigFile,
} from './handlers/handlers';

import {
    handleGetClaudeConfig,
    handleSaveClaudeConfig,
} from './handlers/configHandlers';

import {
    handleGetAgents,
    handleGetSkills,
    handleToggleAgent,
    handleDeleteAgent,
    handleToggleSkill,
    handleDeleteSkill,
} from './handlers/agentSkillHandlers';

export const IClaudeAgentService = createDecorator<IClaudeAgentService>('claudeAgentService');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Channel 对象：管理单个 Claude 会话
 */
export interface Channel {
    in: AsyncStream<SDKUserMessage>;  // 输入流：向 SDK 发送用户消息
    query: Query;                      // Query 对象：从 SDK 接收响应
    workMode: string;                  // 工作模式：default / agent / ask
}

/**
 * 请求处理器
 */
interface RequestHandler {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}

/**
 * Claude Agent 服务接口
 */
export interface IClaudeAgentService {
    readonly _serviceBrand: undefined;

    /**
     * 设置 Transport
     */
    setTransport(transport: ITransport): void;

    /**
     * 启动消息循环
     */
    start(): void;

    /**
     * 接收来自客户端的消息
     */
    fromClient(message: WebViewToExtensionMessage): Promise<void>;

    /**
     * 启动 Claude 会话
     */
    launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string,
        workMode: string,          // 工作模式
        thinkingLevel: string | null,
        resumeSessionAt?: string  // ← 从指定消息ID恢复
    ): Promise<void>;

    /**
     * 中断 Claude 会话
     */
    interruptClaude(channelId: string): Promise<void>;

    /**
     * 关闭会话
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): void;

    /**
     * 关闭所有会话
     */
    closeAllChannels(): Promise<void>;

    /**
     * 获取当前活跃会话的工作模式
     * @returns workMode ('default' | 'agent' | 'ask') 或 null（如果没有活跃会话）
     */
    getCurrentWorkMode(): string | null;

    /**
     * 凭证变更时关闭所有通道
     */
    closeAllChannelsWithCredentialChange(): Promise<void>;

    /**
     * 处理请求
     */
    processRequest(request: RequestMessage, signal: AbortSignal): Promise<unknown>;

    /**
     * 设置权限模式
     */
    setPermissionMode(channelId: string, mode: PermissionMode): Promise<void>;

    /**
     * 设置 Thinking Level
     */
    setThinkingLevel(channelId: string, level: string): Promise<void>;

    /**
     * 设置模型
     */
    setModel(channelId: string, model: string): Promise<void>;

    /**
     * 关闭
     */
    shutdown(): Promise<void>;

    /**
     * 获取指定 Channel（用于 MCP 状态查询等）
     */
    getChannel(channelId: string): Channel | undefined;
}

// ============================================================================
// ClaudeAgentService 实现
// ============================================================================

/**
 * Claude Agent 服务实现
 */
export class ClaudeAgentService implements IClaudeAgentService {
    readonly _serviceBrand: undefined;

    // Transport 适配器
    private transport?: ITransport;

    // 会话管理
    private channels = new Map<string, Channel>();

    // 接收来自客户端的消息流
    private fromClientStream = new AsyncStream<WebViewToExtensionMessage>();

    // 等待响应的请求
    private outstandingRequests = new Map<string, RequestHandler>();

    // 取消控制器
    private abortControllers = new Map<string, AbortController>();

    // Handler 上下文（缓存）
    private handlerContext: HandlerContext;

    // Thinking Level 配置
    private thinkingLevel: string = 'default_on';

    /**
     * 获取实际 WorkMode：
     * - permissionMode=acceptEdits 时强制为 agent（不做 diff 预览确认）
     * - 其他情况尊重传入的 workMode（兜底 default）
     */
    private getEffectiveWorkMode(
        permissionMode: PermissionMode | string,
        workMode: string | null | undefined
    ): string {
        if (permissionMode === 'acceptEdits') {
            return 'agent';
        }
        return workMode || 'default';
    }

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IWorkspaceService private readonly workspaceService: IWorkspaceService,
        @IFileSystemService private readonly fileSystemService: IFileSystemService,
        @INotificationService private readonly notificationService: INotificationService,
        @ITerminalService private readonly terminalService: ITerminalService,
        @ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
        @IClaudeSdkService private readonly sdkService: IClaudeSdkService,
        @IClaudeSessionService private readonly sessionService: IClaudeSessionService,
        @IClaudeConfigService private readonly claudeConfigService: IClaudeConfigService,
        @IWebViewService private readonly webViewService: IWebViewService,
        @IClaudeAgentsService private readonly claudeAgentsService: IClaudeAgentsService,
        @IClaudeSkillsService private readonly claudeSkillsService: IClaudeSkillsService,
        @IInlineDiffService private readonly inlineDiffService: IInlineDiffService,  // 保留旧服务
        @IDiffPreviewService private readonly diffPreviewService: IDiffPreviewService  // 新的差异预览服务
    ) {
        // 构建 Handler 上下文
        this.handlerContext = {
            logService: this.logService,
            configService: this.configService,
            workspaceService: this.workspaceService,
            fileSystemService: this.fileSystemService,
            notificationService: this.notificationService,
            terminalService: this.terminalService,
            tabsAndEditorsService: this.tabsAndEditorsService,
            sessionService: this.sessionService,
            sdkService: this.sdkService,
            claudeConfigService: this.claudeConfigService,
            agentService: this,  // 自身引用
            webViewService: this.webViewService,
            claudeAgentsService: this.claudeAgentsService,
            claudeSkillsService: this.claudeSkillsService,
        };

        // 设置 DiffPreviewService 的 WorkMode 提供者
        this.diffPreviewService.setWorkModeProvider((channelId: string) => {
            const channel = this.channels.get(channelId);
            return channel ? channel.workMode as any : null;
        });
    }

    /**
     * 设置 Transport
     */
    setTransport(transport: ITransport): void {
        this.transport = transport;

        // 监听来自客户端的消息，推入队列
        transport.onMessage(async (message) => {
            await this.fromClient(message);
        });

        this.logService.info('[ClaudeAgentService] Transport 已连接');
    }

    /**
     * 启动消息循环
     */
    start(): void {
        // 启动消息循环
        this.readFromClient();

        this.logService.info('[ClaudeAgentService] 消息循环已启动');
    }

    /**
     * 接收来自客户端的消息
     */
    async fromClient(message: WebViewToExtensionMessage): Promise<void> {
        this.fromClientStream.enqueue(message);
    }

    /**
     * 从客户端读取并分发消息
     */
    private async readFromClient(): Promise<void> {
        try {
            for await (const message of this.fromClientStream) {
                switch (message.type) {
                    case "launch_claude":
                        await this.launchClaude(
                            message.channelId,
                            message.resume || null,
                            message.cwd || this.getCwd(),
                            message.model || null,
                            message.permissionMode || "default",
                            message.workMode || "default",  // 传递工作模式
                            message.thinkingLevel || null,
                            message.resumeSessionAt,  // ← 传递 resumeSessionAt
                            message.initialMessage  // 传递首条消息（可选）
                        );
                        break;

                    case "close_channel":
                        this.closeChannel(message.channelId, false);
                        break;

                    case "interrupt_claude":
                        await this.interruptClaude(message.channelId);
                        break;

                    case "io_message":
                        this.transportMessage(
                            message.channelId,
                            message.message,
                            message.done
                        );
                        break;

                    case "request":
                        this.handleRequest(message);
                        break;

                    case "response":
                        this.handleResponse(message);
                        break;

                    case "cancel_request":
                        this.handleCancellation(message.targetRequestId);
                        break;

                    case "add-custom-model":
                        await this.handleAddCustomModel();
                        break;

                    default:
                        this.logService.error(`Unknown message type: ${(message as { type: string }).type}`);
                }
            }
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] Error in readFromClient: ${error}`);
        }
    }

    /**
     * 启动 Claude 会话
     */
    async launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string,
        workMode: string,          // 工作模式
        thinkingLevel: string | null,
        resumeSessionAt?: string,  // ← 从指定消息ID恢复
        initialMessage?: any  // 首条用户消息（可选）
    ): Promise<void> {
        // 保存 thinkingLevel
        if (thinkingLevel) {
            this.thinkingLevel = thinkingLevel;
        }

        // 计算 maxThinkingTokens
        const maxThinkingTokens = this.getMaxThinkingTokens(this.thinkingLevel);

        // 简化启动日志
        this.logService.info(`[Claude启动] ${channelId} | 模型: ${model || 'default'} | 恢复: ${resume ? '是' : '否'}`);

        // 检查是否已存在
        if (this.channels.has(channelId)) {
            this.logService.error(`❌ Channel 已存在: ${channelId}`);
            throw new Error(`Channel already exists: ${channelId}`);
        }

        try {
            const effectiveWorkMode = this.getEffectiveWorkMode(permissionMode, workMode);
            if (effectiveWorkMode === 'agent') {
                await this.diffPreviewService.acceptAllPendingBlocks();
            }

            // 创建输入流
            const inputStream = new AsyncStream<SDKUserMessage>();

            // 加入首条消息
            if (initialMessage) {
                inputStream.enqueue(initialMessage as SDKUserMessage);
            }

            // 调用 spawnClaude
            const query = await this.spawnClaude(
                inputStream,
                resume,
                resumeSessionAt,  // ← 传递 resumeSessionAt
                async (toolName, input, options) => {

                    return this.requestToolPermission(
                        channelId,
                        toolName,
                        input,
                        options.suggestions || []
                    );
                },
                model,
                cwd,
                permissionMode,
                maxThinkingTokens
            );

            // 注册 Channel
            this.channels.set(channelId, {
                in: inputStream,
                query: query,
                workMode: effectiveWorkMode  // 基于权限模式推导，避免“自动接受”仍出现 diff 确认
            });

            // 启动监听任务：将 SDK 输出转发给客户端
            (async () => {
                try {
                    let messageCount = 0;
                    let streamEventCount = 0;

                    for await (const message of query) {
                        messageCount++;

                        // 只记录非 stream_event 的消息，stream_event 太频繁
                        if (message.type === 'stream_event') {
                            streamEventCount++;
                        } else {
                            // 只记录重要消息类型，过滤高频消息
                            const importantTypes = new Set(['tool_use', 'tool_result', 'text']);
                            if (importantTypes.has(message.type) || messageCount % 50 === 1) {
                                this.logService.info(`  ← 收到消息 #${messageCount}: ${message.type}`);
                            }
                        }

                        // 追踪 Write/Edit/MultiEdit 工具调用，标记文件
                        if (message.type === 'assistant' && message.message?.content) {
                            const content = message.message.content;
                            if (Array.isArray(content)) {
                                for (const block of content) {
                                    if (block.type === 'tool_use') {
                                        const toolName = block.name;
                                        const input = block.input;

                                        // 检测文件修改工具
                                        if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName) && input && typeof input === 'object') {
                                            this.logService.info(`🔍 [DiffPreview] 检测到工具调用: ${toolName}`);

                                            const filePath = (input as any).file_path || (input as any).notebook_path;
                                            if (filePath && typeof filePath === 'string') {
                                                this.logService.info(`   -> 文件路径: ${filePath}`);

                                                // 立即标记文件（避免时序问题）
                                                await this.diffPreviewService.markFileForToolModification(filePath, channelId);

                                                // **用户体验优化**：不自动打开文件，避免打断用户当前的编辑工作
                                                // 用户可以通过 WebView 的待处理文件列表主动查看修改
                                                // this.openFileIfNeeded(filePath).catch(error => {
                                                //     this.logService.error(`   -> ❌ 打开文件失败: ${error}`);
                                                // });
                                            } else {
                                                this.logService.warn(`   -> ❌ 未找到文件路径参数`);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        this.transport!.send({
                            type: "io_message",
                            channelId,
                            message,
                            done: false
                        });
                    }

                    // 正常结束 - 减少日志输出
                    this.closeChannel(channelId, true);
                } catch (error) {
                    // 出错
                    this.logService.error(`  ❌ Query 输出错误: ${error}`);
                    if (error instanceof Error) {
                        this.logService.error(`     Stack: ${error.stack}`);
                    }
                    this.closeChannel(channelId, true, String(error));
                }
            })();

            this.logService.info(`✓ Claude会话启动完成: ${channelId}`);
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ Claude 会话启动失败 ❌❌❌');
            this.logService.error(`Channel: ${channelId}`);
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('════════════════════════════════════════');
            this.logService.error('');

            this.closeChannel(channelId, true, String(error));
            throw error;
        }
    }

    /**
     * 中断 Claude 会话
     */
    async interruptClaude(channelId: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[ClaudeAgentService] Channel 不存在: ${channelId}`);
            return;
        }

        try {
            await this.sdkService.interrupt(channel.query);
            this.logService.info(`[ClaudeAgentService] 已中断 Channel: ${channelId}`);
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] 中断失败:`, error);
        }
    }

    /**
     * 关闭会话
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): void {
        this.logService.info(`[ClaudeAgentService] 关闭 Channel: ${channelId}`);

        // 1. 发送关闭通知
        if (sendNotification && this.transport) {
            this.transport.send({
                type: "close_channel",
                channelId,
                error
            });
        }

        // 2. 清理 channel
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.in.done();
            try {
                channel.query.return?.();
            } catch (e) {
                this.logService.warn(`Error cleaning up channel: ${e}`);
            }
            this.channels.delete(channelId);
        }

        this.logService.info(`  ✓ Channel 已关闭，剩余 ${this.channels.size} 个活跃会话`);
    }

    /**
     * 启动 Claude SDK
     *
     * @param inputStream 输入流，用于发送用户消息
     * @param resume 恢复会话 ID
     * @param canUseTool 工具权限回调
     * @param model 模型名称
     * @param cwd 工作目录
     * @param permissionMode 权限模式
     * @param maxThinkingTokens 最大思考 tokens
     * @returns SDK Query 对象
     */
    protected async spawnClaude(
        inputStream: AsyncStream<SDKUserMessage>,
        resume: string | null,
        resumeSessionAt: string | undefined,  // ← 从指定消息ID恢复
        canUseTool: CanUseTool,
        model: string | null,
        cwd: string,
        permissionMode: string,
        maxThinkingTokens: number
    ): Promise<Query> {
        return this.sdkService.query({
            inputStream,
            resume,
            resumeSessionAt,  // ← 传递给 SDK
            canUseTool,
            model,
            cwd,
            permissionMode,
            maxThinkingTokens
        });
    }

    /**
     * 关闭所有会话
     */
    async closeAllChannels(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, false)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * 凭证变更时关闭所有通道
     */
    async closeAllChannelsWithCredentialChange(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, true)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * 传输消息到 Channel
     */
    private transportMessage(
        channelId: string,
        message: SDKMessage | SDKUserMessage,
        done: boolean
    ): void {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.error(`[transportMessage] Channel not found: ${channelId}`);
            throw new Error(`Channel not found: ${channelId}`);
        }

        // 用户消息加入输入流
        if (message.type === "user") {
            channel.in.enqueue(message as SDKUserMessage);
        }

        // 如果标记为结束，关闭输入流
        if (done) {
            channel.in.done();
        }
    }

    /**
     * 处理来自客户端的请求
     */
    private async handleRequest(message: RequestMessage): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(message.requestId, abortController);

        try {
            const response = await this.processRequest(message, abortController.signal);
            this.transport!.send({
                type: "response",
                requestId: message.requestId,
                response
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.transport!.send({
                type: "response",
                requestId: message.requestId,
                response: {
                    type: "error",
                    error: errorMsg
                }
            });
        } finally {
            this.abortControllers.delete(message.requestId);
        }
    }

    /**
     * 处理请求
     */
    async processRequest(message: RequestMessage, signal: AbortSignal): Promise<unknown> {
        const request = message.request;
        const channelId = message.channelId;

        if (!request || typeof request !== 'object' || !('type' in request)) {
            throw new Error('Invalid request format');
        }

        // 过滤常规请求日志，只记录重要请求
        const importantRequests = new Set(['init', 'launch_claude', 'interrupt_claude']);
        if (importantRequests.has(request.type)) {
            this.logService.info(`[ClaudeAgentService] 处理请求: ${request.type}`);
        }

        // 路由表：将请求类型映射到 handler
        switch (request.type) {
            // 初始化和状态
            case "init":
                return handleInit(request, this.handlerContext);

            case "get_claude_state":
                return handleGetClaudeState(request, this.handlerContext);

            case "get_mcp_servers":
                return handleGetMcpServers(request, this.handlerContext, channelId);

            case "get_asset_uris":
                return handleGetAssetUris(request, this.handlerContext);

            // 编辑器操作
            case "open_file":
                return handleOpenFile(request, this.handlerContext);

            case "get_current_selection":
                return handleGetCurrentSelection(this.handlerContext);

            case "open_diff":
                return handleOpenDiff(request, this.handlerContext, signal);

            case "open_content":
                return handleOpenContent(request, this.handlerContext, signal);

            // UI 操作
            case "show_notification":
                return handleShowNotification(request, this.handlerContext);

            case "new_conversation_tab":
                return handleNewConversationTab(request, this.handlerContext);

            case "rename_tab":
                return handleRenameTab(request, this.handlerContext);

            case "open_url":
                return handleOpenURL(request, this.handlerContext);

            // 设置
            case "set_permission_mode": {
                if (!channelId) {
                    throw new Error('channelId is required for set_permission_mode');
                }
                const permReq = request as any;
                await this.setPermissionMode(channelId, permReq.mode);
                return {
                    type: "set_permission_mode_response",
                    success: true
                };
            }

            case "set_work_mode": {
                if (!channelId) {
                    throw new Error('channelId is required for set_work_mode');
                }
                const workModeReq = request as any;
                await this.setWorkMode(channelId, workModeReq.workMode);
                return {
                    type: "set_work_mode_response",
                    success: true
                };
            }

            case "set_model": {
                if (!channelId) {
                    throw new Error('channelId is required for set_model');
                }
                const modelReq = request as any;
                const targetModel = modelReq.model?.value ?? "";
                if (!targetModel) {
                    throw new Error("Invalid model selection");
                }
                await this.setModel(channelId, targetModel);
                return {
                    type: "set_model_response",
                    success: true
                };
            }

            case "set_thinking_level": {
                if (!channelId) {
                    throw new Error('channelId is required for set_thinking_level');
                }
                const thinkReq = request as any;
                await this.setThinkingLevel(channelId, thinkReq.thinkingLevel);
                return {
                    type: "set_thinking_level_response"
                };
            }

            case "open_config_file":
                return handleOpenConfigFile(request, this.handlerContext);

            // 配置管理
            case "get_claude_config":
                return handleGetClaudeConfig(request as any, this.handlerContext);

            case "save_claude_config":
                return handleSaveClaudeConfig(request as any, this.handlerContext);

            // Agents 和 Skills 管理
            case "get_agents":
                return handleGetAgents(request as any, this.handlerContext);

            case "get_skills":
                return handleGetSkills(request as any, this.handlerContext);

            case "toggle_agent":
                return handleToggleAgent(request as any, this.handlerContext);

            case "delete_agent":
                return handleDeleteAgent(request as any, this.handlerContext);

            case "toggle_skill":
                return handleToggleSkill(request as any, this.handlerContext);

            case "delete_skill":
                return handleDeleteSkill(request as any, this.handlerContext);

            // 会话管理
            case "list_sessions_request":
                return handleListSessions(request, this.handlerContext);

            case "get_session_request":
                return handleGetSession(request, this.handlerContext);

            // 文件操作
            case "list_files_request":
                return handleListFiles(request, this.handlerContext);

            // 进程操作 - 已禁用（安全考虑）
            // case "exec":
            //     return handleExec(request, this.handlerContext);

            // case "open_claude_in_terminal":
            //     return handleOpenClaudeInTerminal(request, this.handlerContext);

            // 认证
            // case "get_auth_status":
            //     return handleGetAuthStatus(request, this.handlerContext);

            // case "login":
            //     return handleLogin(request, this.handlerContext);

            // case "submit_oauth_code":
            //     return handleSubmitOAuthCode(request, this.handlerContext);

            default:
                throw new Error(`Unknown request type: ${request.type}`);
        }
    }

    /**
     * 处理响应
     */
    private handleResponse(message: ResponseMessage): void {
        const handler = this.outstandingRequests.get(message.requestId);
        if (handler) {
            const response = message.response;
            if (typeof response === 'object' && response !== null && 'type' in response && response.type === "error") {
                handler.reject(new Error((response as { error: string }).error));
            } else {
                handler.resolve(response);
            }
            this.outstandingRequests.delete(message.requestId);
        } else {
            this.logService.warn(`[ClaudeAgentService] 没有找到请求处理器: ${message.requestId}`);
        }
    }

    /**
     * 处理取消
     */
    private handleCancellation(requestId: string): void {
        const abortController = this.abortControllers.get(requestId);
        if (abortController) {
            abortController.abort();
            this.abortControllers.delete(requestId);
        }
    }

    /**
     * 发送请求到客户端
     */
    protected sendRequest<TRequest extends ExtensionRequest, TResponse>(
        channelId: string,
        request: TRequest
    ): Promise<TResponse> {
        const requestId = this.generateId();

        return new Promise<TResponse>((resolve, reject) => {
            // 注册 Promise handlers
            this.outstandingRequests.set(requestId, { resolve, reject });

            // 发送请求
            this.transport!.send({
                type: "request",
                channelId,
                requestId,
                request
            } as RequestMessage);
        }).finally(() => {
            // 清理
            this.outstandingRequests.delete(requestId);
        });
    }

    /**
     * 请求工具权限
     */
    protected async requestToolPermission(
        channelId: string,
        toolName: string,
        inputs: Record<string, unknown>,
        suggestions: PermissionUpdate[]
    ): Promise<PermissionResult> {
        // 使用默认权限请求流程
        const request: ToolPermissionRequest = {
            type: "tool_permission_request",
            toolName,
            inputs,
            suggestions
        };

        const response = await this.sendRequest<ToolPermissionRequest, ToolPermissionResponse>(
            channelId,
            request
        );

        return response.result;
    }

    /**
     * 获取当前活跃会话的工作模式
     */
    getCurrentWorkMode(): string | null {
        // 如果只有一个活跃会话，返回它的 workMode
        if (this.channels.size === 1) {
            const channel = Array.from(this.channels.values())[0];
            return channel.workMode;
        }

        // 如果有多个会话或没有会话，返回 null
        // (这种情况下无法确定哪个是"当前"的)
        if (this.channels.size === 0) {
            return null;
        }

        // 多个会话时，返回第一个的 workMode（通常是最新的）
        const channel = Array.from(this.channels.values())[0];
        return channel.workMode;
    }

    /**
     * 关闭服务
     */
    async shutdown(): Promise<void> {
        await this.closeAllChannels();
        this.fromClientStream.done();
    }

    /**
     * 获取指定 Channel
     */
    getChannel(channelId: string): Channel | undefined {
        return this.channels.get(channelId);
    }

    // ========================================================================
    // 工具方法
    // ========================================================================

    /**
     * 生成唯一 ID
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * 获取当前工作目录
     */
    private getCwd(): string {
        return this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    }

    /**
     * 获取 maxThinkingTokens（根据 thinking level）
     */
    private getMaxThinkingTokens(level: string): number {
        return level === 'off' ? 0 : 31999;
    }

    /**
     * 设置 thinking level
     */
    async setThinkingLevel(channelId: string, level: string): Promise<void> {
        this.thinkingLevel = level;

        // 更新正在运行的 channel
        const channel = this.channels.get(channelId);
        if (channel?.query) {
            const maxTokens = this.getMaxThinkingTokens(level);
            // Note: setMaxThinkingTokens 可能不存在于 claude-code SDK
            // 已通过 options.maxThinkingTokens 传递，无需单独设置
            if (typeof (channel.query as any).setMaxThinkingTokens === 'function') {
                await (channel.query as any).setMaxThinkingTokens(maxTokens);
            }
            this.logService.info(`[setThinkingLevel] Updated channel ${channelId} to ${level} (${maxTokens} tokens)`);
        }
    }

    /**
     * 设置权限模式
     */
    async setPermissionMode(channelId: string, mode: PermissionMode): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setPermissionMode] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        await channel.query.setPermissionMode(mode);

        // “自动接受编辑”= 不需要任何确认（包括 diff 预览）
        if (mode === 'acceptEdits') {
            channel.workMode = 'agent';
            await this.diffPreviewService.acceptAllPendingBlocks();
        } else if (channel.workMode === 'agent') {
            // 从“自动接受”切回需要确认，恢复默认 diff 预览行为
            channel.workMode = 'default';
        }

        this.logService.info(`[setPermissionMode] Set channel ${channelId} to mode: ${mode}`);
    }

    /**
     * 设置工作模式
     */
    async setWorkMode(channelId: string, workMode: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setWorkMode] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        channel.workMode = workMode;
        if (workMode === 'agent') {
            await this.diffPreviewService.acceptAllPendingBlocks();
        }
        this.logService.info(`[setWorkMode] Set channel ${channelId} to workMode: ${workMode}`);
    }

    /**
     * 设置模型
     */
    async setModel(channelId: string, model: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setModel] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        // 设置模型到 channel
        await channel.query.setModel(model);

        // 保存到配置
        await this.configService.updateValue('claudix.selectedModel', model);

        this.logService.info(`[setModel] Set channel ${channelId} to model: ${model}`);
    }

    /**
     * 自动打开未打开的文件
     */
    private async openFileIfNeeded(filePath: string): Promise<void> {
        const vscode = await import('vscode');

        // 检查文件是否已经在编辑器中打开
        const isOpen = vscode.window.visibleTextEditors.some(
            editor => editor.document.uri.fsPath === filePath
        );

        if (!isOpen) {
            this.logService.info(`[DiffPreview] 自动打开文件: ${filePath}`);

            try {
                const uri = vscode.Uri.file(filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, {
                    preview: false,      // 不以预览模式打开
                    preserveFocus: false  // 聚焦到打开的文件
                });

                this.logService.info(`[DiffPreview] ✓ 文件已打开: ${filePath}`);
            } catch (error) {
                this.logService.error(`[DiffPreview] ✗ 打开文件失败: ${error}`);
                throw error;
            }
        } else {
            this.logService.info(`[DiffPreview] 文件已打开，跳过: ${filePath}`);
        }
    }

    /**
     * 处理添加自定义模型请求
     */
    private async handleAddCustomModel(): Promise<void> {
        try {
            const vscode = await import('vscode');

            const modelId = await vscode.window.showInputBox({
                prompt: '输入自定义模型ID（如：claude-3-opus-20240229）',
                placeHolder: 'claude-3-...',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return '模型ID不能为空';
                    }
                    if (!/^[a-zA-Z0-9\-_.]+$/.test(value)) {
                        return '模型ID只能包含字母、数字、短横线、下划线和点';
                    }
                    return null;
                }
            });

            if (modelId) {
                const label = await vscode.window.showInputBox({
                    prompt: '输入模型显示名称（可选）',
                    placeHolder: modelId,
                    value: modelId
                });

                const description = await vscode.window.showInputBox({
                    prompt: '输入模型描述（可选）',
                    placeHolder: '自定义模型'
                });

                if (this.transport) {
                    this.transport.send({
                        type: 'custom-model-added',
                        model: {
                            id: modelId,
                            label: label || modelId,
                            description: description || '自定义模型'
                        }
                    });
                }

                this.logService.info(`[handleAddCustomModel] 添加自定义模型: ${modelId}`);
            } else {
                if (this.transport) {
                    this.transport.send({
                        type: 'custom-model-added',
                        model: null
                    });
                }
            }
        } catch (error) {
            this.logService.error(`[handleAddCustomModel] 错误: ${error}`);
            if (this.transport) {
                this.transport.send({
                    type: 'custom-model-added',
                    model: null
                });
            }
        }
    }
}
