/**
 * Claude Agents 服务
 * 读取和管理 ~/.claude/agents/ 目录下的 Agent 配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';
import { IClaudeConfigStateService } from './claudeConfigStateService';
import type { AgentInfo } from '../shared/messages';

export const IClaudeAgentsService = createDecorator<IClaudeAgentsService>('claudeAgentsService');

export interface IClaudeAgentsService {
	/**
	 * 获取所有 Agents
	 */
	getAgents(): Promise<AgentInfo[]>;

	/**
	 * 启用/禁用 Agent
	 */
	toggleAgent(agentName: string, enabled: boolean): Promise<void>;

	/**
	 * 删除 Agent
	 */
	deleteAgent(agentPath: string): Promise<void>;
}

export class ClaudeAgentsService implements IClaudeAgentsService {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IClaudeConfigStateService private readonly configStateService: IClaudeConfigStateService
	) {}

	/**
	 * 获取 Agents 目录路径
	 */
	private getAgentsDir(): string {
		return path.join(os.homedir(), '.claude', 'agents');
	}

	/**
	 * 解析 Markdown 文件的 frontmatter
	 */
	private parseFrontmatter(content: string): {
		frontmatter: Record<string, any>;
		body: string;
	} {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
		const match = content.match(frontmatterRegex);

		if (!match) {
			return { frontmatter: {}, body: content };
		}

		const [, frontmatterStr, body] = match;
		const frontmatter: Record<string, any> = {};

		// 简单的 YAML 解析（支持基本键值对和数组）
		const lines = frontmatterStr.split('\n');
		let currentKey = '';
		let currentArray: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// 检查是否是数组项
			if (trimmed.startsWith('- ')) {
				currentArray.push(trimmed.substring(2).trim());
				continue;
			}

			// 如果有累积的数组，保存它
			if (currentKey && currentArray.length > 0) {
				frontmatter[currentKey] = currentArray;
				currentArray = [];
			}

			// 解析键值对
			const colonIndex = trimmed.indexOf(':');
			if (colonIndex > 0) {
				const key = trimmed.substring(0, colonIndex).trim();
				const value = trimmed.substring(colonIndex + 1).trim();
				currentKey = key;

				if (value) {
					// 移除引号
					frontmatter[key] = value.replace(/^["']|["']$/g, '');
				}
			}
		}

		// 保存最后的数组
		if (currentKey && currentArray.length > 0) {
			frontmatter[currentKey] = currentArray;
		}

		return { frontmatter, body };
	}

	/**
	 * 读取单个 Agent 文件
	 */
	private async readAgentFile(filePath: string, baseDir?: string): Promise<AgentInfo | null> {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const { frontmatter, body } = this.parseFrontmatter(content);

			const name = frontmatter.name || path.basename(filePath, '.md');
			const description = frontmatter.description || '';

			// 推断 category：使用 frontmatter 中的 category，或从文件路径推断
			let category = frontmatter.category;
			if (!category && baseDir) {
				const relativePath = path.relative(baseDir, path.dirname(filePath));
				category = relativePath || 'general';
			}
			category = category || 'general';

			const tools = frontmatter.tools;
			const model = frontmatter.model;

			return {
				name,
				description,
				category,
				path: filePath,
				tools: Array.isArray(tools) ? tools : (tools ? tools.split(',').map((t: string) => t.trim()) : []),
				model,
				content: body.trim(),
				enabled: true // 默认启用，实际状态在 getAgents() 中设置
			};
		} catch (error) {
			this.logService.error(`[AgentsService] 读取 Agent 文件失败: ${filePath}`, error);
			return null;
		}
	}

	/**
	 * 递归查找所有 .md 文件
	 */
	private async findMarkdownFiles(dir: string): Promise<string[]> {
		const result: string[] = [];

		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				if (entry.isDirectory()) {
					// 递归搜索子目录
					const subFiles = await this.findMarkdownFiles(fullPath);
					result.push(...subFiles);
				} else if (entry.isFile() && entry.name.endsWith('.md')) {
					result.push(fullPath);
				}
			}
		} catch (error) {
			this.logService.error(`[AgentsService] 读取目录失败: ${dir}`, error);
		}

		return result;
	}

	/**
	 * 获取所有 Agents（包括禁用的）
	 */
	async getAgents(): Promise<AgentInfo[]> {
		const agentsDir = this.getAgentsDir();
		this.logService.info(`[AgentsService] 读取 Agents 目录: ${agentsDir}`);

		try {
			// 检查目录是否存在
			await fs.access(agentsDir);

			// 递归查找所有 .md 文件（包括 .disabled 子目录）
			const mdFiles = await this.findMarkdownFiles(agentsDir);

			this.logService.info(`[AgentsService] 找到 ${mdFiles.length} 个 Agent 文件`);

			// 读取所有 Agent 文件，传递 baseDir 用于推断 category
			const agentsPromises = mdFiles.map((file) => this.readAgentFile(file, agentsDir));

			const agents = await Promise.all(agentsPromises);

			// 过滤掉解析失败的
			const validAgents = agents.filter((agent): agent is AgentInfo => agent !== null);

			// 标记禁用状态（基于文件路径是否包含 .disabled）
			const agentsWithStatus = validAgents.map((agent) => ({
				...agent,
				enabled: !agent.path.includes('.disabled')
			}));

			this.logService.info(`[AgentsService] 成功加载 ${agentsWithStatus.length} 个 Agents`);

			return agentsWithStatus;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				this.logService.warn(`[AgentsService] Agents 目录不存在: ${agentsDir}`);
				return [];
			}

			this.logService.error('[AgentsService] 读取 Agents 目录失败', error);
			return [];
		}
	}

	/**
	 * 启用/禁用 Agent（通过移动文件实现）
	 */
	async toggleAgent(agentName: string, enabled: boolean): Promise<void> {
		const agentsDir = this.getAgentsDir();
		const disabledDir = path.join(agentsDir, '.disabled');

		try {
			// 确保 .disabled 目录存在
			await fs.mkdir(disabledDir, { recursive: true });

			// 递归查找 Agent 文件
			const allFiles = await this.findMarkdownFiles(agentsDir);

			// 查找匹配的 Agent 文件
			let targetFile: string | null = null;
			for (const file of allFiles) {
				const content = await fs.readFile(file, 'utf-8');
				const { frontmatter } = this.parseFrontmatter(content);
				const name = frontmatter.name || path.basename(file, '.md');

				if (name === agentName) {
					targetFile = file;
					break;
				}
			}

			if (!targetFile) {
				throw new Error(`未找到 Agent: ${agentName}`);
			}

			const isCurrentlyDisabled = targetFile.includes('.disabled');

			if (enabled && isCurrentlyDisabled) {
				// 启用：从 .disabled 移回（保留相对路径结构）
				const relativePath = path.relative(disabledDir, targetFile);
				const newPath = path.join(agentsDir, relativePath);
				// 确保目标目录存在
				await fs.mkdir(path.dirname(newPath), { recursive: true });
				await fs.rename(targetFile, newPath);
				this.logService.info(`[AgentsService] Agent "${agentName}" 已启用: ${newPath}`);
			} else if (!enabled && !isCurrentlyDisabled) {
				// 禁用：移到 .disabled（保留相对路径结构）
				const relativePath = path.relative(agentsDir, targetFile);
				const newPath = path.join(disabledDir, relativePath);
				// 确保目标目录存在
				await fs.mkdir(path.dirname(newPath), { recursive: true });
				await fs.rename(targetFile, newPath);
				this.logService.info(`[AgentsService] Agent "${agentName}" 已禁用: ${newPath}`);
			}

			// 同时更新配置状态（用于UI显示）
			await this.configStateService.toggleAgent(agentName, enabled);

		} catch (error: any) {
			this.logService.error(`[AgentsService] 切换 Agent 状态失败: ${agentName}`, error);
			throw error;
		}
	}

	/**
	 * 删除 Agent
	 */
	async deleteAgent(agentPath: string): Promise<void> {
		try {
			// 检查文件是否存在
			await fs.access(agentPath);

			// 删除文件
			await fs.unlink(agentPath);

			this.logService.info(`[AgentsService] Agent 已删除: ${agentPath}`);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				this.logService.warn(`[AgentsService] Agent 文件不存在: ${agentPath}`);
				throw new Error('Agent 文件不存在');
			}

			this.logService.error(`[AgentsService] 删除 Agent 失败: ${agentPath}`, error);
			throw error;
		}
	}
}
