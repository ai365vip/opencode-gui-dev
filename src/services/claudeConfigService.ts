/**
 * Claude 配置服务
 * 读取和保存 ~/.claude/settings.json 配置文件
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';
import { IWorkspaceService } from './workspaceService';
import { safeJsonManager } from './safejson';

export const IClaudeConfigService = createDecorator<IClaudeConfigService>('claudeConfigService');

/**
 * Claude 配置结构
 */
export interface ClaudeConfig {
	// 描述信息（用于配置模板）
	description?: string;

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

	// 权限模式（SDK v0.2.x 新增 'delegate' 和 'dontAsk'）
	permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'delegate' | 'dontAsk';

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
 * MCP 配置结构
 */
export interface McpConfig {
	mcpServers?: ClaudeConfig['mcpServers'];
}

/**
 * 配置范围
 */
export type ConfigScope = 'user' | 'project';

export interface IClaudeConfigService {
	readonly _serviceBrand: undefined;

	/**
	 * 获取 Claude 配置文件路径
	 */
	getConfigPath(): string;

	/**
	 * 读取 Claude 配置（全局）
	 * @deprecated 使用 getUserConfig() 或 getProjectConfig()
	 */
	readConfig(): Promise<ClaudeConfig>;

	/**
	 * 保存 Claude 配置（全局）
	 * @deprecated 使用 saveUserConfig() 或 saveProjectConfig()
	 */
	saveConfig(config: ClaudeConfig): Promise<void>;

	/**
	 * 更新部分配置（合并）
	 * @deprecated 使用 updateUserConfig() 或 updateProjectConfig()
	 */
	updateConfig(partial: Partial<ClaudeConfig>): Promise<void>;

	/**
	 * 备份配置文件
	 */
	backupConfig(): Promise<string>;

	// ===== 全局配置（~/.claude/） =====

	/**
	 * 读取全局配置
	 */
	getUserConfig(): Promise<ClaudeConfig>;

	/**
	 * 保存全局配置
	 */
	saveUserConfig(config: ClaudeConfig): Promise<void>;

	/**
	 * 更新全局配置
	 */
	updateUserConfig(partial: Partial<ClaudeConfig>): Promise<void>;

	// ===== 项目配置（{workspace}/.claude/） =====

	/**
	 * 获取当前工作区路径
	 */
	getCurrentWorkspacePath(): string | undefined;

	/**
	 * 读取当前项目配置
	 */
	getCurrentProjectConfig(): Promise<ClaudeConfig>;

	/**
	 * 保存当前项目配置
	 * @param config 配置对象
	 */
	saveCurrentProjectConfig(config: ClaudeConfig): Promise<void>;

	/**
	 * 更新当前项目配置
	 * @param partial 部分配置
	 */
	updateCurrentProjectConfig(partial: Partial<ClaudeConfig>): Promise<void>;

	/**
	 * 读取当前项目 MCP 配置
	 */
	getCurrentProjectMcpConfig(): Promise<McpConfig>;

	/**
	 * 保存当前项目 MCP 配置
	 * @param config MCP 配置
	 */
	saveCurrentProjectMcpConfig(config: McpConfig): Promise<void>;

	/**
	 * 读取项目配置
	 * @param workspacePath 工作区路径
	 */
	getProjectConfig(workspacePath: string): Promise<ClaudeConfig>;

	/**
	 * 保存项目配置
	 * @param workspacePath 工作区路径
	 * @param config 配置对象
	 */
	saveProjectConfig(workspacePath: string, config: ClaudeConfig): Promise<void>;

	/**
	 * 更新项目配置
	 * @param workspacePath 工作区路径
	 * @param partial 部分配置
	 */
	updateProjectConfig(workspacePath: string, partial: Partial<ClaudeConfig>): Promise<void>;

	/**
	 * 读取项目 MCP 配置
	 * @param workspacePath 工作区路径
	 */
	getProjectMcpConfig(workspacePath: string): Promise<McpConfig>;

	/**
	 * 保存项目 MCP 配置
	 * @param workspacePath 工作区路径
	 * @param config MCP 配置
	 */
	saveProjectMcpConfig(workspacePath: string, config: McpConfig): Promise<void>;

	// ===== 合并配置 =====

	/**
	 * 获取合并后的配置（项目 > 全局）
	 * @param workspacePath 工作区路径
	 */
	getMergedConfig(workspacePath: string): Promise<ClaudeConfig>;

	/**
	 * 获取当前项目的合并配置（项目 > 全局）
	 */
	getCurrentMergedConfig(): Promise<ClaudeConfig>;
}

export class ClaudeConfigService implements IClaudeConfigService {
	readonly _serviceBrand: undefined;

	private configPath: string;

	private mcpConfigPath: string;

	private globalClaudePath: string;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		// 配置文件路径: ~/.claude/settings.json
		this.configPath = path.join(os.homedir(), '.claude', 'settings.json');
		// MCP 配置文件路径: ~/.claude/.mcp.json
		this.mcpConfigPath = path.join(os.homedir(), '.claude', '.mcp.json');
		// Claude CLI 全局配置文件路径: ~/.claude.json
		this.globalClaudePath = path.join(os.homedir(), '.claude.json');
	}

	/**
	 * 获取配置文件路径
	 */
	getConfigPath(): string {
		return this.configPath;
	}

	/**
	 * 读取 Claude 配置（全局）
	 * @deprecated 使用 getUserConfig()
	 */
	async readConfig(): Promise<ClaudeConfig> {
		return this.getUserConfig();
	}

	/**
	 * 保存 Claude 配置（全局）
	 * @deprecated 使用 saveUserConfig()
	 */
	async saveConfig(config: ClaudeConfig): Promise<void> {
		return this.saveUserConfig(config);
	}

	/**
	 * 更新部分配置（合并）
	 * @deprecated 使用 updateUserConfig()
	 */
	async updateConfig(partial: Partial<ClaudeConfig>): Promise<void> {
		return this.updateUserConfig(partial);
	}

	/**
	 * 备份配置文件
	 */
	async backupConfig(): Promise<string> {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const backupDir = path.join(os.homedir(), '.claude', 'backup');
			await fs.mkdir(backupDir, { recursive: true });

			// 1. 备份 settings.json
			try {
				await fs.access(this.configPath);
				const backupPath = path.join(backupDir, `settings_${timestamp}.json`);
				await fs.copyFile(this.configPath, backupPath);
				this.logService.info(`[ClaudeConfigService] settings.json 备份成功: ${backupPath}`);
			} catch {
				this.logService.info('[ClaudeConfigService] settings.json 不存在，跳过备份');
			}

			// 2. 备份 .mcp.json
			try {
				await fs.access(this.mcpConfigPath);
				const backupPath = path.join(backupDir, `mcp_${timestamp}.json`);
				await fs.copyFile(this.mcpConfigPath, backupPath);
				this.logService.info(`[ClaudeConfigService] .mcp.json 备份成功: ${backupPath}`);
				return backupPath;
			} catch {
				this.logService.info('[ClaudeConfigService] .mcp.json 不存在，跳过备份');
			}

			return path.join(backupDir, `settings_${timestamp}.json`);

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 配置备份失败:', error);
			throw error;
		}
	}

	// ===== 全局配置实现 =====

	/**
	 * 读取全局配置
	 */
	async getUserConfig(): Promise<ClaudeConfig> {
		try {
			// 1. 读取基础配置 (settings.json) - 不包含 mcpServers
			let baseConfig: Partial<ClaudeConfig> = {};
			try {
				await fs.access(this.configPath);
				const content = await fs.readFile(this.configPath, 'utf-8');
				baseConfig = JSON.parse(content);
			} catch {
				// settings.json 不存在，使用默认配置
			}

			// 2. 读取全局 MCP 配置 (~/.claude.json 的 mcpServers 字段)
			let mcpServers: ClaudeConfig['mcpServers'] = {};
			try {
				const claudeJson = await safeJsonManager.readJson<any>(this.globalClaudePath);
				if (claudeJson && claudeJson.mcpServers) {
					mcpServers = claudeJson.mcpServers;
					this.logService.info('[ClaudeConfigService] 从 .claude.json 读取 MCP 配置成功');
				}
			} catch (error) {
				this.logService.warn('[ClaudeConfigService] 读取 .claude.json 失败，使用空 MCP 配置:', error);
			}

			return {
				...this.getDefaultConfig(),
				...baseConfig,
				mcpServers // 覆盖为从 .claude.json 读取的值
			};

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 全局配置读取失败:', error);
			return this.getDefaultConfig();
		}
	}

	/**
	 * 保存全局配置
	 */
	async saveUserConfig(config: ClaudeConfig): Promise<void> {
		try {
			// 确保目录存在
			const dir = path.dirname(this.configPath);
			await fs.mkdir(dir, { recursive: true });

			// 1. 保存 mcpServers 到 ~/.claude.json（只更新 mcpServers 字段，保留其他字段）
			if (config.mcpServers !== undefined) {
				await safeJsonManager.updateJson(
					this.globalClaudePath,
					(current: any) => {
						return {
							...current,
							mcpServers: config.mcpServers
						};
					}
				);
				this.logService.info('[ClaudeConfigService] MCP 配置已保存到 .claude.json');
			}

			// 2. 保存其他配置到 settings.json（排除 mcpServers）
			const { mcpServers, ...configWithoutMcp } = config;
			const content = JSON.stringify(configWithoutMcp, null, 2);
			await fs.writeFile(this.configPath, content, 'utf-8');
			this.logService.info('[ClaudeConfigService] 全局配置保存成功');

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 全局配置保存失败:', error);
			throw error;
		}
	}

	/**
	 * 更新全局配置
	 */
	async updateUserConfig(partial: Partial<ClaudeConfig>): Promise<void> {
		try {
			this.logService.info('[ClaudeConfigService] 开始更新全局配置');
			this.logService.info('[ClaudeConfigService] 更新内容:', JSON.stringify(partial, null, 2));

			const current = await this.getUserConfig();
			this.logService.info('[ClaudeConfigService] 当前配置键:', Object.keys(current));

			const updated = this.mergeConfig(current, partial);
			this.logService.info('[ClaudeConfigService] 合并后配置键:', Object.keys(updated));
			this.logService.info('[ClaudeConfigService] 合并后 mcpServers 数量:',
				updated.mcpServers ? Object.keys(updated.mcpServers).length : 0);

			// 分别更新 .claude.json 和 settings.json
			// 1. 如果包含 mcpServers 更新，更新 .claude.json
			if (partial.mcpServers !== undefined) {
				await safeJsonManager.updateJson(
					this.globalClaudePath,
					(current: any) => {
						return {
							...current,
							mcpServers: updated.mcpServers
						};
					}
				);
				this.logService.info('[ClaudeConfigService] MCP 配置已更新到 .claude.json');
			}

			// 2. 更新 settings.json（排除 mcpServers）
			const { mcpServers, ...configWithoutMcp } = updated;
			const dir = path.dirname(this.configPath);
			await fs.mkdir(dir, { recursive: true });
			const content = JSON.stringify(configWithoutMcp, null, 2);
			await fs.writeFile(this.configPath, content, 'utf-8');

			this.logService.info('[ClaudeConfigService] 全局配置更新成功');
		} catch (error) {
			this.logService.error('[ClaudeConfigService] 全局配置更新失败:', error);
			throw error;
		}
	}

	// ===== 项目配置实现 =====

	/**
	 * 获取当前工作区路径
	 */
	getCurrentWorkspacePath(): string | undefined {
		const workspace = this.workspaceService.getDefaultWorkspaceFolder();
		return workspace?.uri.fsPath;
	}

	/**
	 * 读取当前项目配置
	 */
	async getCurrentProjectConfig(): Promise<ClaudeConfig> {
		const workspacePath = this.getCurrentWorkspacePath();
		if (!workspacePath) {
			this.logService.warn('[ClaudeConfigService] 没有打开的工作区，无法读取项目配置');
			return this.getDefaultConfig();
		}
		return this.getProjectConfig(workspacePath);
	}

	/**
	 * 保存当前项目配置
	 */
	async saveCurrentProjectConfig(config: ClaudeConfig): Promise<void> {
		const workspacePath = this.getCurrentWorkspacePath();
		if (!workspacePath) {
			throw new Error('没有打开的工作区，无法保存项目配置');
		}
		return this.saveProjectConfig(workspacePath, config);
	}

	/**
	 * 更新当前项目配置
	 */
	async updateCurrentProjectConfig(partial: Partial<ClaudeConfig>): Promise<void> {
		const workspacePath = this.getCurrentWorkspacePath();
		if (!workspacePath) {
			throw new Error('没有打开的工作区，无法更新项目配置');
		}
		return this.updateProjectConfig(workspacePath, partial);
	}

	/**
	 * 读取当前项目 MCP 配置
	 */
	async getCurrentProjectMcpConfig(): Promise<McpConfig> {
		const workspacePath = this.getCurrentWorkspacePath();
		if (!workspacePath) {
			this.logService.warn('[ClaudeConfigService] 没有打开的工作区，无法读取项目 MCP 配置');
			return { mcpServers: {} };
		}
		return this.getProjectMcpConfig(workspacePath);
	}

	/**
	 * 保存当前项目 MCP 配置
	 */
	async saveCurrentProjectMcpConfig(config: McpConfig): Promise<void> {
		const workspacePath = this.getCurrentWorkspacePath();
		if (!workspacePath) {
			throw new Error('没有打开的工作区，无法保存项目 MCP 配置');
		}
		return this.saveProjectMcpConfig(workspacePath, config);
	}

	/**
	 * 获取项目配置路径
	 */
	private getProjectConfigPath(workspacePath: string): string {
		return path.join(workspacePath, '.claude', 'settings.json');
	}

	/**
	 * 获取项目 MCP 配置路径
	 */
	private getProjectMcpConfigPath(workspacePath: string): string {
		return path.join(workspacePath, '.mcp.json');
	}

	/**
	 * 获取项目本地配置路径 (settings.local.json)
	 */
	private getProjectLocalConfigPath(workspacePath: string): string {
		return path.join(workspacePath, '.claude', 'settings.local.json');
	}

	/**
	 * 读取项目配置
	 */
	async getProjectConfig(workspacePath: string): Promise<ClaudeConfig> {
		try {
			const projectConfigPath = this.getProjectConfigPath(workspacePath);
			const projectLocalConfigPath = this.getProjectLocalConfigPath(workspacePath);

			// 1. 读取基础配置 (.claude/settings.json)
			let baseConfig: Partial<ClaudeConfig> = {};
			try {
				await fs.access(projectConfigPath);
				const content = await fs.readFile(projectConfigPath, 'utf-8');
				baseConfig = JSON.parse(content);
				this.logService.info('[ClaudeConfigService] 项目配置读取成功');
			} catch {
				this.logService.info('[ClaudeConfigService] 项目 settings.json 不存在');
			}

			// 2. 读取本地配置 (.claude/settings.local.json) - 包含 hooks
			let localConfig: Partial<ClaudeConfig> = {};
			try {
				await fs.access(projectLocalConfigPath);
				const content = await fs.readFile(projectLocalConfigPath, 'utf-8');
				localConfig = JSON.parse(content);
				this.logService.info('[ClaudeConfigService] 项目本地配置读取成功');
			} catch {
				this.logService.info('[ClaudeConfigService] 项目 settings.local.json 不存在');
			}

			return {
				...this.getDefaultConfig(),
				...baseConfig,
				...localConfig // local 配置优先级最高
			};

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目配置读取失败:', error);
			return this.getDefaultConfig();
		}
	}

	/**
	 * 保存项目配置
	 */
	async saveProjectConfig(workspacePath: string, config: ClaudeConfig): Promise<void> {
		try {
			// 确保 .claude 目录存在
			const claudeDir = path.join(workspacePath, '.claude');
			await fs.mkdir(claudeDir, { recursive: true });

			// 拆分配置
			const { mcpServers, ...baseConfig } = config;

			// 保存基础配置到 .claude/settings.json（不包括 mcpServers）
			if (Object.keys(baseConfig).length > 0) {
				const projectConfigPath = this.getProjectConfigPath(workspacePath);
				const content = JSON.stringify(baseConfig, null, 2);
				await fs.writeFile(projectConfigPath, content, 'utf-8');
				this.logService.info('[ClaudeConfigService] 项目基础配置保存成功');
			}

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目配置保存失败:', error);
			throw error;
		}
	}

	/**
	 * 更新项目配置
	 */
	async updateProjectConfig(workspacePath: string, partial: Partial<ClaudeConfig>): Promise<void> {
		try {
			const current = await this.getProjectConfig(workspacePath);
			const updated = this.mergeConfig(current, partial);
			await this.saveProjectConfig(workspacePath, updated);
			this.logService.info('[ClaudeConfigService] 项目配置更新成功');
		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目配置更新失败:', error);
			throw error;
		}
	}

	/**
	 * 读取项目 MCP 配置
	 */
	async getProjectMcpConfig(workspacePath: string): Promise<McpConfig> {
		try {
			const mcpConfigPath = this.getProjectMcpConfigPath(workspacePath);

			try {
				await fs.access(mcpConfigPath);
				const content = await fs.readFile(mcpConfigPath, 'utf-8');
				const mcpConfig = JSON.parse(content);
				this.logService.info('[ClaudeConfigService] 项目 MCP 配置读取成功');
				return mcpConfig;
			} catch {
				this.logService.info('[ClaudeConfigService] 项目 .mcp.json 不存在');
				return { mcpServers: {} };
			}

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目 MCP 配置读取失败:', error);
			return { mcpServers: {} };
		}
	}

	/**
	 * 保存项目 MCP 配置
	 */
	async saveProjectMcpConfig(workspacePath: string, config: McpConfig): Promise<void> {
		try {
			const mcpConfigPath = this.getProjectMcpConfigPath(workspacePath);

			// 确保工作区目录存在
			await fs.mkdir(workspacePath, { recursive: true });

			const content = JSON.stringify(config, null, 2);
			await fs.writeFile(mcpConfigPath, content, 'utf-8');
			this.logService.info('[ClaudeConfigService] 项目 MCP 配置保存成功: ' + mcpConfigPath);

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目 MCP 配置保存失败:', error);
			throw error;
		}
	}

	/**
	 * 读取项目本地配置 (settings.local.json)
	 */
	async getProjectLocalConfig(workspacePath: string): Promise<Partial<ClaudeConfig>> {
		try {
			const localConfigPath = this.getProjectLocalConfigPath(workspacePath);

			try {
				await fs.access(localConfigPath);
				const content = await fs.readFile(localConfigPath, 'utf-8');
				const parsed = JSON.parse(content);
				this.logService.info('[ClaudeConfigService] 项目本地配置读取成功');
				return parsed;
			} catch {
				this.logService.info('[ClaudeConfigService] 项目 settings.local.json 不存在');
				return {};
			}

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目本地配置读取失败:', error);
			return {};
		}
	}

	/**
	 * 保存项目本地配置 (settings.local.json) - 包括 hooks
	 */
	async saveProjectLocalConfig(workspacePath: string, config: Partial<ClaudeConfig>): Promise<void> {
		try {
			const localConfigPath = this.getProjectLocalConfigPath(workspacePath);

			// 确保 .claude 目录存在
			const dir = path.dirname(localConfigPath);
			await fs.mkdir(dir, { recursive: true });

			// 读取现有配置
			let existing: Partial<ClaudeConfig> = {};
			try {
				const existingContent = await fs.readFile(localConfigPath, 'utf-8');
				existing = JSON.parse(existingContent);
			} catch {
				// 文件不存在，使用空对象
			}

			// 合并配置
			const merged = {
				...existing,
				...config
			};

			const content = JSON.stringify(merged, null, 2);
			await fs.writeFile(localConfigPath, content, 'utf-8');
			this.logService.info('[ClaudeConfigService] 项目本地配置保存成功: ' + localConfigPath);

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 项目本地配置保存失败:', error);
			throw error;
		}
	}

	/**
	 * 获取合并后的配置（项目 > 全局）
	 */
	async getMergedConfig(workspacePath: string): Promise<ClaudeConfig> {
		try {
			// 1. 读取全局配置
			const userConfig = await this.getUserConfig();

			// 2. 读取项目配置（包括 settings.json 和 settings.local.json）
			const projectConfig = await this.getProjectConfig(workspacePath);

			// 3. 读取项目 MCP 配置
			const projectMcpConfig = await this.getProjectMcpConfig(workspacePath);

			// 4. 合并配置（项目优先）
			const merged = this.mergeConfig(userConfig, projectConfig);

			// 5. 合并 MCP 配置
			if (projectMcpConfig.mcpServers && Object.keys(projectMcpConfig.mcpServers).length > 0) {
				merged.mcpServers = {
					...(merged.mcpServers || {}),
					...projectMcpConfig.mcpServers
				};
			}

			// 注意：hooks 已经在 projectConfig 中，通过 getProjectConfig 读取了 settings.local.json

			return merged;

		} catch (error) {
			this.logService.error('[ClaudeConfigService] 配置合并失败:', error);
			return this.getDefaultConfig();
		}
	}

	/**
	 * 获取当前项目的合并配置（项目 > 全局）
	 */
	async getCurrentMergedConfig(): Promise<ClaudeConfig> {
		const workspacePath = this.getCurrentWorkspacePath();
		if (!workspacePath) {
			this.logService.warn('[ClaudeConfigService] 没有打开的工作区，返回全局配置');
			return this.getUserConfig();
		}
		return this.getMergedConfig(workspacePath);
	}

	// ===== 私有方法 =====

	/**
	 * 获取默认配置
	 */
	private getDefaultConfig(): ClaudeConfig {
		return {
			env: {},
			mcpServers: {},
			permissions: {
				allow: [],
				deny: []
			},
			permissionMode: 'default',
			includeCoAuthoredBy: false,
			additionalDirectories: []
		};
	}

	/**
	 * 深度合并配置
	 *
	 * 重要：对于 mcpServers、env 等字典类型字段：
	 * - 如果source中的值是空对象，跳过（保留target的值）
	 * - 如果source中的值非空，完全替换（以支持删除操作）
	 */
	private mergeConfig(target: ClaudeConfig, source: Partial<ClaudeConfig>): ClaudeConfig {
		const result = { ...target };

		for (const key in source) {
			const sourceValue = source[key as keyof ClaudeConfig];
			const targetValue = target[key as keyof ClaudeConfig];

			if (sourceValue === undefined) {
				continue;
			}

			// 对于字典类型字段（mcpServers、env、hooks）
			if (key === 'mcpServers' || key === 'env' || key === 'hooks') {
				// 如果source的值是空对象，跳过（不覆盖target）
				// 这样可以让项目空配置不会覆盖全局配置
				if (typeof sourceValue === 'object' &&
				    sourceValue !== null &&
				    !Array.isArray(sourceValue) &&
				    Object.keys(sourceValue).length === 0) {
					continue;
				}
				// 如果source的值非空，完全替换（支持删除操作）
				(result as any)[key] = sourceValue;
			}
			// 如果是对象且目标也是对象，进行深度合并
			else if (
				typeof sourceValue === 'object' &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === 'object' &&
				targetValue !== null &&
				!Array.isArray(targetValue)
			) {
				(result as any)[key] = { ...targetValue, ...sourceValue };
			} else {
				// 否则直接覆盖
				(result as any)[key] = sourceValue;
			}
		}

		return result;
	}
}
