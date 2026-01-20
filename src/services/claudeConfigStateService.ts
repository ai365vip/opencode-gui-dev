/**
 * Claude 配置状态服务
 * 管理 ~/.claude/config.json 中的启用/禁用状态
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IClaudeConfigStateService = createDecorator<IClaudeConfigStateService>('claudeConfigStateService');

export interface ClaudeConfigState {
	disabledAgents?: string[];
	disabledSkills?: string[];
}

export interface IClaudeConfigStateService {
	getState(): Promise<ClaudeConfigState>;
	saveState(state: ClaudeConfigState): Promise<void>;
	isAgentDisabled(agentName: string): Promise<boolean>;
	isSkillDisabled(skillId: string): Promise<boolean>;
	toggleAgent(agentName: string, enabled: boolean): Promise<void>;
	toggleSkill(skillId: string, enabled: boolean): Promise<void>;
}

export class ClaudeConfigStateService implements IClaudeConfigStateService {
	private configPath: string;

	constructor(@ILogService private readonly logService: ILogService) {
		this.configPath = path.join(os.homedir(), '.claude', 'config.json');
	}

	/**
	 * 获取配置状态
	 */
	async getState(): Promise<ClaudeConfigState> {
		try {
			const content = await fs.readFile(this.configPath, 'utf-8');
			return JSON.parse(content);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// 文件不存在，返回默认状态
				return {
					disabledAgents: [],
					disabledSkills: []
				};
			}
			this.logService.error('[ConfigStateService] 读取配置状态失败', error);
			return {
				disabledAgents: [],
				disabledSkills: []
			};
		}
	}

	/**
	 * 保存配置状态
	 */
	async saveState(state: ClaudeConfigState): Promise<void> {
		try {
			// 确保目录存在
			const dir = path.dirname(this.configPath);
			await fs.mkdir(dir, { recursive: true });

			// 写入配置
			await fs.writeFile(this.configPath, JSON.stringify(state, null, 2), 'utf-8');
			this.logService.info('[ConfigStateService] 配置状态已保存');
		} catch (error) {
			this.logService.error('[ConfigStateService] 保存配置状态失败', error);
			throw error;
		}
	}

	/**
	 * 检查 Agent 是否被禁用
	 */
	async isAgentDisabled(agentName: string): Promise<boolean> {
		const state = await this.getState();
		return state.disabledAgents?.includes(agentName) ?? false;
	}

	/**
	 * 检查 Skill 是否被禁用
	 */
	async isSkillDisabled(skillId: string): Promise<boolean> {
		const state = await this.getState();
		return state.disabledSkills?.includes(skillId) ?? false;
	}

	/**
	 * 启用/禁用 Agent
	 */
	async toggleAgent(agentName: string, enabled: boolean): Promise<void> {
		const state = await this.getState();
		const disabledAgents = state.disabledAgents || [];

		if (enabled) {
			// 启用：从禁用列表移除
			state.disabledAgents = disabledAgents.filter(name => name !== agentName);
		} else {
			// 禁用：添加到禁用列表
			if (!disabledAgents.includes(agentName)) {
				state.disabledAgents = [...disabledAgents, agentName];
			}
		}

		await this.saveState(state);
		this.logService.info(`[ConfigStateService] Agent "${agentName}" ${enabled ? '已启用' : '已禁用'}`);
	}

	/**
	 * 启用/禁用 Skill
	 */
	async toggleSkill(skillId: string, enabled: boolean): Promise<void> {
		const state = await this.getState();
		const disabledSkills = state.disabledSkills || [];

		if (enabled) {
			// 启用：从禁用列表移除
			state.disabledSkills = disabledSkills.filter(id => id !== skillId);
		} else {
			// 禁用：添加到禁用列表
			if (!disabledSkills.includes(skillId)) {
				state.disabledSkills = [...disabledSkills, skillId];
			}
		}

		await this.saveState(state);
		this.logService.info(`[ConfigStateService] Skill "${skillId}" ${enabled ? '已启用' : '已禁用'}`);
	}
}
