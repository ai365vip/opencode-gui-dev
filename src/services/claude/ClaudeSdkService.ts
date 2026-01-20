/**
 * ClaudeSdkService - Claude Agent SDK 薄封装
 *
 * 职责：
 * 1. 封装 @anthropic-ai/claude-agent-sdk 的 query() 调用
 * 2. 构建 SDK Options 对象
 * 3. 处理参数转换和环境配置
 * 4. 提供 interrupt() 方法中断查询
 *
 * 依赖：
 * - ILogService: 日志服务
 * - IConfigurationService: 配置服务
 *
 * SDK v0.2.x 新特性支持：
 * - hooks: PreToolUse/PostToolUse 事件钩子
 * - enableFileCheckpointing: 文件检查点
 * - forkSession: 会话分叉
 * - fallbackModel: 备用模型
 * - maxBudgetUsd: 预算限制
 * - sandbox: 沙箱配置
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { AsyncStream } from './transport';

// SDK 类型导入
import type {
    Options,
    Query,
    CanUseTool,
    PermissionMode,
    SDKUserMessage,
    HookEvent,
    HookCallbackMatcher,
    HookCallback,
} from '@anthropic-ai/claude-agent-sdk';

export const IClaudeSdkService = createDecorator<IClaudeSdkService>('claudeSdkService');

/**
 * SDK 查询参数
 */
export interface SdkQueryParams {
    inputStream: AsyncStream<SDKUserMessage>;
    resume: string | null;
    resumeSessionAt?: string;       // 从指定消息ID恢复会话
    forkSession?: boolean;          // 分叉会话（不污染原会话）
    canUseTool: CanUseTool;
    model: string | null;           // 接受 null，内部转换
    fallbackModel?: string;         // 备用模型
    cwd: string;
    permissionMode: PermissionMode | string;
    maxThinkingTokens?: number;     // Thinking tokens 上限
    maxBudgetUsd?: number;          // 预算限制（美元）
    enableFileCheckpointing?: boolean;  // 启用文件检查点
    onPreToolUse?: HookCallback;    // 工具调用前钩子
    onPostToolUse?: HookCallback;   // 工具调用后钩子
}

/**
 * SDK 服务接口
 */
export interface IClaudeSdkService {
    readonly _serviceBrand: undefined;

    /**
     * 调用 Claude SDK 进行查询
     */
    query(params: SdkQueryParams): Promise<Query>;

    /**
     * 中断正在进行的查询
     */
    interrupt(query: Query): Promise<void>;
}

/**
 * ClaudeSdkService 实现
 */
export class ClaudeSdkService implements IClaudeSdkService {
    readonly _serviceBrand: undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {
        this.logService.info('[ClaudeSdkService] 已初始化 (SDK v0.2.x)');
    }

    /**
     * 调用 Claude SDK 进行查询
     */
    async query(params: SdkQueryParams): Promise<Query> {
        const {
            inputStream,
            resume,
            resumeSessionAt,
            forkSession,
            canUseTool,
            model,
            fallbackModel,
            cwd,
            permissionMode,
            maxThinkingTokens,
            maxBudgetUsd,
            enableFileCheckpointing,
            onPreToolUse,
            onPostToolUse,
        } = params;

        // 简化SDK调用日志
        this.logService.info(`[SDK启动] 模型: ${model || 'default'} | 工作目录: ${cwd}`);

        // 参数转换
        const modelParam = (!model || model === 'default') ? "claude-sonnet-4-5-20250929" : model;
        const permissionModeParam = permissionMode as PermissionMode;
        const cwdParam = cwd;

        // 构建 hooks 配置
        const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};

        if (onPreToolUse) {
            hooks.PreToolUse = [{
                hooks: [onPreToolUse]
            }];
        }

        if (onPostToolUse) {
            hooks.PostToolUse = [{
                hooks: [onPostToolUse]
            }];
        }

        // 构建 SDK Options
        const options: Options = {
            // 基本参数
            cwd: cwdParam,
            resume: resume || undefined,
            resumeSessionAt: resumeSessionAt || undefined,
            forkSession: forkSession || undefined,
            model: modelParam,
            fallbackModel: fallbackModel || undefined,
            permissionMode: permissionModeParam,
            maxThinkingTokens: maxThinkingTokens,
            maxBudgetUsd: maxBudgetUsd,

            // 文件检查点（支持 rewindFiles）
            enableFileCheckpointing: enableFileCheckpointing || false,

            // CanUseTool 回调
            canUseTool,

            // Hooks 配置
            hooks: Object.keys(hooks).length > 0 ? hooks : undefined,

            // 日志回调 - 捕获 SDK 进程的所有标准错误输出
            stderr: (data: string) => {
                const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
                const lines = data.trim().split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // 检测错误级别
                    const lowerLine = line.toLowerCase();
                    let level = 'INFO';

                    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
                        level = 'ERROR';
                    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
                        level = 'WARN';
                    } else if (lowerLine.includes('exit') || lowerLine.includes('terminated')) {
                        level = 'EXIT';
                    }

                    this.logService.info(`[${timestamp}] [SDK ${level}] ${line}`);
                }
            },

            // 环境变量
            env: this.getEnvironmentVariables(),

            // 系统提示 - 使用 Claude Code 预设（agent-sdk 默认为空，需显式指定）
            systemPrompt: { type: "preset", preset: "claude_code" },

            // CLI 可执行文件路径
            pathToClaudeCodeExecutable: this.getClaudeExecutablePath(),

            // 额外参数
            extraArgs: {} as Record<string, string | null>,

            // 设置源 - 读取 ~/.claude/settings.json、项目配置等
            settingSources: ['user', 'project', 'local'],

            includePartialMessages: true,
        };

        // 调用 SDK
        this.logService.info('');
        this.logService.info('🚀 准备调用 Claude Agent SDK v0.2.x');
        this.logService.info('----------------------------------------');

        // 获取 CLI 路径
        const cliPath = this.getClaudeExecutablePath();

        // 记录 CLI 路径
        this.logService.info(`📂 CLI 可执行文件:`);
        this.logService.info(`  - Path: ${cliPath}`);

        // 检查 CLI 是否存在
        if (!fs.existsSync(cliPath)) {
            this.logService.error(`❌ Claude CLI not found at: ${cliPath}`);
            throw new Error(`Claude CLI not found at: ${cliPath}`);
        }
        this.logService.info(`  ✓ CLI 文件存在`);

        // 检查文件权限
        try {
            const stats = fs.statSync(cliPath);
            this.logService.info(`  - File size: ${stats.size} bytes`);
            this.logService.info(`  - Is executable: ${(stats.mode & fs.constants.X_OK) !== 0}`);
        } catch (e) {
            this.logService.warn(`  ⚠ Could not check file stats: ${e}`);
        }

        // 设置入口点环境变量
        process.env.CLAUDE_CODE_ENTRYPOINT = "claude-vscode";
        this.logService.info(`🔧 环境变量:`);
        this.logService.info(`  - CLAUDE_CODE_ENTRYPOINT: ${process.env.CLAUDE_CODE_ENTRYPOINT}`);

        // 记录新特性配置
        if (enableFileCheckpointing) {
            this.logService.info(`  - enableFileCheckpointing: true`);
        }
        if (forkSession) {
            this.logService.info(`  - forkSession: true`);
        }
        if (fallbackModel) {
            this.logService.info(`  - fallbackModel: ${fallbackModel}`);
        }
        if (maxBudgetUsd) {
            this.logService.info(`  - maxBudgetUsd: $${maxBudgetUsd}`);
        }
        if (Object.keys(hooks).length > 0) {
            this.logService.info(`  - hooks: ${Object.keys(hooks).join(', ')}`);
        }

        this.logService.info('');
        this.logService.info('📦 导入 SDK...');

        try {
            // 调用 SDK query() 函数
            const { query } = await import('@anthropic-ai/claude-agent-sdk');

            this.logService.info(`  - Options: [已配置参数 ${Object.keys(options).filter(k => (options as any)[k] !== undefined).join(', ')}]`);

            const result = query({ prompt: inputStream, options });
            return result;
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ SDK 调用失败 ❌❌❌');
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Message: ${error.message}`);
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('========================================');
            throw error;
        }
    }

    /**
     * 中断正在进行的查询
     */
    async interrupt(query: Query): Promise<void> {
        try {
            this.logService.info('🛑 中断 Claude SDK 查询');
            await query.interrupt();
            this.logService.info('✓ 查询已中断');
        } catch (error) {
            this.logService.error(`❌ 中断查询失败: ${error}`);
            throw error;
        }
    }

    /**
     * 获取环境变量
     * 优先级：VSCode 配置 > ~/.claude/settings.json > 系统环境变量
     */
    private getEnvironmentVariables(): Record<string, string> {
        const env = { ...process.env };

        // 0. Windows 特殊处理：设置 git-bash 路径（Claude Code CLI 在 Windows 上需要）
        if (process.platform === 'win32' && !env.CLAUDE_CODE_GIT_BASH_PATH) {
            // 自动检测常见的 Git Bash 路径
            const possiblePaths = [
                'C:\\Program Files\\Git\\bin\\bash.exe',
                'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
                'D:\\Git\\bin\\bash.exe',
                'D:\\Git\\usr\\bin\\bash.exe',
            ];

            for (const bashPath of possiblePaths) {
                if (fs.existsSync(bashPath)) {
                    env.CLAUDE_CODE_GIT_BASH_PATH = bashPath;
                    this.logService.info(`✓ 自动检测到 Git Bash: ${bashPath}`);
                    break;
                }
            }

            // 如果没找到，尝试从 PATH 中查找
            if (!env.CLAUDE_CODE_GIT_BASH_PATH) {
                this.logService.warn('⚠ 未找到 Git Bash，Claude Code CLI 可能无法运行');
                this.logService.warn('  请安装 Git for Windows: https://git-scm.com/downloads/win');
            }
        }

        // 1. 从 ~/.claude/settings.json 读取配置（如果存在）
        try {
            const os = require('os');
            const path = require('path');
            const claudeSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

            if (fs.existsSync(claudeSettingsPath)) {
                const settingsContent = fs.readFileSync(claudeSettingsPath, 'utf-8');
                const settings = JSON.parse(settingsContent);

                if (settings.env && typeof settings.env === 'object') {
                    this.logService.info('✓ 从 ~/.claude/settings.json 加载环境变量');
                    Object.assign(env, settings.env);
                }
            }
        } catch (error) {
            this.logService.warn(`⚠ 无法读取 ~/.claude/settings.json: ${error}`);
        }

        // 2. 从 VSCode 配置读取自定义环境变量（覆盖优先级最高）
        const config = vscode.workspace.getConfiguration("claudix");
        const customVars = config.get<Array<{ name: string; value: string }>>("environmentVariables", []);

        for (const item of customVars) {
            if (item.name) {
                env[item.name] = item.value || "";
            }
        }

        return env as Record<string, string>;
    }

    /**
     * 获取 Claude CLI 可执行文件路径
     */
    private getClaudeExecutablePath(): string {
        // 优先使用打包到 dist 目录的 claude-cli.mjs (ES Module 格式)
        const distCliPath = this.context.asAbsolutePath("dist/claude-cli.mjs");

        if (fs.existsSync(distCliPath)) {
            this.logService.info(`✓ 使用打包的 Claude CLI: ${distCliPath}`);
            return distCliPath;
        }

        // 降级：尝试查找原生二进制文件（如果存在）
        const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
        const arch = process.arch;

        const nativePath = this.context.asAbsolutePath(
            `resources/native-binaries/${process.platform}-${arch}/${binaryName}`
        );

        if (fs.existsSync(nativePath)) {
            this.logService.info(`✓ 使用原生二进制 Claude CLI: ${nativePath}`);
            return nativePath;
        }

        // 最后降级：旧路径（兼容性）
        const oldPath = this.context.asAbsolutePath("resources/claude-code/cli.js");
        this.logService.warn(`⚠ 使用降级路径: ${oldPath}`);
        return oldPath;
    }
}
