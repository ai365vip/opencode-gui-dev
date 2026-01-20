/**
 * Claude Skills 服务
 * 读取和管理 ~/.claude/skills/ 目录下的 Skill 配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';
import { IClaudeConfigStateService } from './claudeConfigStateService';
import type { SkillInfo } from '../shared/messages';

export const IClaudeSkillsService = createDecorator<IClaudeSkillsService>('claudeSkillsService');

export interface IClaudeSkillsService {
	/**
	 * 获取所有 Skills
	 */
	getSkills(): Promise<SkillInfo[]>;

	/**
	 * 启用/禁用 Skill
	 */
	toggleSkill(skillId: string, enabled: boolean): Promise<void>;

	/**
	 * 删除 Skill
	 */
	deleteSkill(skillPath: string): Promise<void>;
}

export class ClaudeSkillsService implements IClaudeSkillsService {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IClaudeConfigStateService private readonly configStateService: IClaudeConfigStateService
	) {}

	/**
	 * 获取 Skills 目录路径
	 */
	private getSkillsDir(): string {
		return path.join(os.homedir(), '.claude', 'skills');
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

		// 简单的 YAML 解析（支持基本键值对）
		const lines = frontmatterStr.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const colonIndex = trimmed.indexOf(':');
			if (colonIndex > 0) {
				const key = trimmed.substring(0, colonIndex).trim();
				const value = trimmed.substring(colonIndex + 1).trim();

				// 移除引号
				frontmatter[key] = value.replace(/^["']|["']$/g, '');
			}
		}

		return { frontmatter, body };
	}

	/**
	 * 读取单个 Skill 目录
	 */
	private async readSkill(skillDir: string): Promise<SkillInfo | null> {
		try {
			const skillFilePath = path.join(skillDir, 'SKILL.md');

			// 检查 SKILL.md 是否存在
			await fs.access(skillFilePath);

			const content = await fs.readFile(skillFilePath, 'utf-8');
			const { frontmatter } = this.parseFrontmatter(content);

			const id = frontmatter.id || path.basename(skillDir);
			const name = frontmatter.name || id;
			const description = frontmatter.description || '';
			const version = frontmatter.version;
			const author = frontmatter.author;
			const license = frontmatter.license;

			// Skills 默认启用
			const enabled = frontmatter.enabled !== 'false' && frontmatter.enabled !== false;

			return {
				id,
				name,
				description,
				version,
				author,
				license,
				path: skillDir,
				enabled
			};
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				this.logService.debug(`[SkillsService] ${skillDir} 不包含 SKILL.md`);
			} else {
				this.logService.error(`[SkillsService] 读取 Skill 失败: ${skillDir}`, error);
			}
			return null;
		}
	}

	/**
	 * 获取所有 Skills（包括禁用的）
	 */
	async getSkills(): Promise<SkillInfo[]> {
		const skillsDir = this.getSkillsDir();
		this.logService.info(`[SkillsService] 读取 Skills 目录: ${skillsDir}`);

		try {
			await fs.access(skillsDir);

			const entries = await fs.readdir(skillsDir, { withFileTypes: true });
			const skillDirs = entries
				.filter((entry) => entry.isDirectory() && entry.name !== '.disabled')
				.map((entry) => path.join(skillsDir, entry.name));

			const disabledDir = path.join(skillsDir, '.disabled');
			try {
				await fs.access(disabledDir);
				const disabledEntries = await fs.readdir(disabledDir, { withFileTypes: true });
				const disabledDirs = disabledEntries
					.filter((entry) => entry.isDirectory())
					.map((entry) => path.join(disabledDir, entry.name));
				skillDirs.push(...disabledDirs);
			} catch (error: any) {
				if (error.code !== 'ENOENT') {
					this.logService.warn(`[SkillsService] 读取 .disabled 目录失败`, error);
				}
			}

			this.logService.info(`[SkillsService] 找到 ${skillDirs.length} 个 Skill 目录`);

			const skillsPromises = skillDirs.map((dir) => this.readSkill(dir));
			const skills = await Promise.all(skillsPromises);

			const validSkills = skills.filter((skill): skill is SkillInfo => skill !== null);

			const skillsWithStatus = validSkills.map((skill) => ({
				...skill,
				enabled: !skill.path.includes('.disabled')
			}));

			this.logService.info(`[SkillsService] 成功加载 ${skillsWithStatus.length} 个 Skills`);

			return skillsWithStatus;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				this.logService.warn(`[SkillsService] Skills 目录不存在: ${skillsDir}`);
				return [];
			}

			this.logService.error('[SkillsService] 读取 Skills 目录失败', error);
			return [];
		}
	}

	/**
	 * 启用/禁用 Skill（通过移动目录实现）
	 */
	async toggleSkill(skillId: string, enabled: boolean): Promise<void> {
		const skillsDir = this.getSkillsDir();
		const disabledDir = path.join(skillsDir, '.disabled');

		try {
			await fs.mkdir(disabledDir, { recursive: true });

			const entries = await fs.readdir(skillsDir, { withFileTypes: true });
			const allDirs = entries
				.filter((entry) => entry.isDirectory() && entry.name !== '.disabled')
				.map((entry) => path.join(skillsDir, entry.name));

			const disabledEntries = await fs.readdir(disabledDir, { withFileTypes: true }).catch(() => []);
			const disabledDirs = disabledEntries
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.join(disabledDir, entry.name));

			let targetDir: string | null = null;
			for (const dir of [...allDirs, ...disabledDirs]) {
				const skill = await this.readSkill(dir);
				if (skill && skill.id === skillId) {
					targetDir = dir;
					break;
				}
			}

			if (!targetDir) {
				throw new Error(`未找到 Skill: ${skillId}`);
			}

			const dirName = path.basename(targetDir);
			const isCurrentlyDisabled = targetDir.includes('.disabled');

			if (enabled && isCurrentlyDisabled) {
				const newPath = path.join(skillsDir, dirName);
				await fs.rename(targetDir, newPath);
				this.logService.info(`[SkillsService] Skill "${skillId}" 已启用: ${newPath}`);
			} else if (!enabled && !isCurrentlyDisabled) {
				const newPath = path.join(disabledDir, dirName);
				await fs.rename(targetDir, newPath);
				this.logService.info(`[SkillsService] Skill "${skillId}" 已禁用: ${newPath}`);
			}

			await this.configStateService.toggleSkill(skillId, enabled);
		} catch (error: any) {
			this.logService.error(`[SkillsService] 切换 Skill 状态失败: ${skillId}`, error);
			throw error;
		}
	}

	/**
	 * 删除 Skill
	 */
	async deleteSkill(skillPath: string): Promise<void> {
		try {
			// 检查目录是否存在
			await fs.access(skillPath);

			// 递归删除目录
			await fs.rm(skillPath, { recursive: true, force: true });

			this.logService.info(`[SkillsService] Skill 已删除: ${skillPath}`);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				this.logService.warn(`[SkillsService] Skill 目录不存在: ${skillPath}`);
				throw new Error('Skill 目录不存在');
			}

			this.logService.error(`[SkillsService] 删除 Skill 失败: ${skillPath}`, error);
			throw error;
		}
	}
}
