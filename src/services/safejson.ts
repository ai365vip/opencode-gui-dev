/**
 * 安全的 JSON 文件操作工具
 * 提供带文件锁、原子写入、自动备份的配置文件操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

interface LockOptions {
	timeout?: number; // 锁超时时间（毫秒）
	retryDelay?: number; // 重试延迟（毫秒）
	maxRetries?: number; // 最大重试次数
}

interface WriteOptions {
	backup?: boolean; // 是否备份
	atomic?: boolean; // 是否原子写入
}

/**
 * 安全的 JSON 文件管理器
 */
export class SafeJsonFileManager {
	private lockMap = new Map<string, Promise<void>>();

	/**
	 * 获取文件锁
	 */
	private async acquireLock(filePath: string, options: LockOptions = {}): Promise<() => void> {
		const { timeout = 5000, retryDelay = 50, maxRetries = 100 } = options;
		const lockKey = path.resolve(filePath);

		let retries = 0;
		const startTime = Date.now();

		while (retries < maxRetries) {
			// 检查是否有锁
			const existingLock = this.lockMap.get(lockKey);

			if (!existingLock) {
				// 创建锁
				let releaseLock!: () => void;
				const lockPromise = new Promise<void>((resolve) => {
					releaseLock = () => {
						this.lockMap.delete(lockKey);
						resolve();
					};
				});

				this.lockMap.set(lockKey, lockPromise);

				return releaseLock;
			}

			// 检查超时
			if (Date.now() - startTime > timeout) {
				throw new Error(`获取文件锁超时: ${filePath}`);
			}

			// 等待现有锁释放
			await Promise.race([
				existingLock,
				new Promise((resolve) => setTimeout(resolve, retryDelay))
			]);

			retries++;
		}

		throw new Error(`获取文件锁失败（超过最大重试次数）: ${filePath}`);
	}

	/**
	 * 安全读取 JSON 文件
	 */
	async readJson<T = any>(filePath: string): Promise<T | null> {
		const release = await this.acquireLock(filePath);

		try {
			if (!existsSync(filePath)) {
				return null;
			}

			const content = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
			console.error(`[SafeJson] 读取文件失败: ${filePath}`, error);
			throw error;
		} finally {
			release();
		}
	}

	/**
	 * 安全写入 JSON 文件
	 */
	async writeJson(
		filePath: string,
		data: any,
		options: WriteOptions = { backup: true, atomic: true }
	): Promise<void> {
		const release = await this.acquireLock(filePath);

		try {
			// 确保目录存在
			const dir = path.dirname(filePath);
			await fs.mkdir(dir, { recursive: true });

			// 备份原文件
			if (options.backup && existsSync(filePath)) {
				await this.backupFile(filePath);
			}

			const content = JSON.stringify(data, null, 2);

			if (options.atomic) {
				// 原子性写入：先写临时文件，再重命名
				const tempFile = `${filePath}.tmp.${Date.now()}`;
				await fs.writeFile(tempFile, content, 'utf-8');
				await fs.rename(tempFile, filePath);
			} else {
				// 直接写入
				await fs.writeFile(filePath, content, 'utf-8');
			}
		} catch (error) {
			console.error(`[SafeJson] 写入文件失败: ${filePath}`, error);
			throw error;
		} finally {
			release();
		}
	}

	/**
	 * 安全更新 JSON 文件的部分字段
	 * @param filePath 文件路径
	 * @param updater 更新函数，接收当前数据，返回新数据
	 */
	async updateJson<T = any>(
		filePath: string,
		updater: (current: T) => T,
		options: WriteOptions = { backup: true, atomic: true }
	): Promise<void> {
		const release = await this.acquireLock(filePath);

		try {
			// 读取当前数据
			let current: T;
			if (existsSync(filePath)) {
				const content = await fs.readFile(filePath, 'utf-8');
				current = JSON.parse(content);
			} else {
				current = {} as T;
			}

			// 应用更新
			const updated = updater(current);

			// 确保目录存在
			const dir = path.dirname(filePath);
			await fs.mkdir(dir, { recursive: true });

			// 备份原文件
			if (options.backup && existsSync(filePath)) {
				await this.backupFile(filePath);
			}

			// 原子性写入
			const content = JSON.stringify(updated, null, 2);

			if (options.atomic) {
				const tempFile = `${filePath}.tmp.${Date.now()}`;
				await fs.writeFile(tempFile, content, 'utf-8');
				await fs.rename(tempFile, filePath);
			} else {
				await fs.writeFile(filePath, content, 'utf-8');
			}
		} catch (error) {
			console.error(`[SafeJson] 更新文件失败: ${filePath}`, error);
			throw error;
		} finally {
			release();
		}
	}

	/**
	 * 备份文件
	 */
	private async backupFile(filePath: string): Promise<void> {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const dir = path.dirname(filePath);
			const filename = path.basename(filePath);
			const backupDir = path.join(dir, '.backups');

			await fs.mkdir(backupDir, { recursive: true });

			const backupPath = path.join(backupDir, `${filename}.${timestamp}.bak`);
			await fs.copyFile(filePath, backupPath);

			// 清理旧备份（保留最近10个）
			await this.cleanOldBackups(backupDir, filename, 10);
		} catch (error) {
			console.warn(`[SafeJson] 备份文件失败:`, error);
			// 备份失败不应阻止写入
		}
	}

	/**
	 * 清理旧备份
	 */
	private async cleanOldBackups(backupDir: string, filename: string, keepCount: number): Promise<void> {
		try {
			const files = await fs.readdir(backupDir);
			const backups = files
				.filter((f) => f.startsWith(filename))
				.map((f) => ({
					name: f,
					path: path.join(backupDir, f)
				}));

			if (backups.length > keepCount) {
				// 按修改时间排序
				const sorted = await Promise.all(
					backups.map(async (b) => ({
						...b,
						stat: await fs.stat(b.path)
					}))
				);

				sorted.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

				// 删除旧备份
				for (let i = keepCount; i < sorted.length; i++) {
					await fs.unlink(sorted[i].path);
				}
			}
		} catch (error) {
			console.warn(`[SafeJson] 清理旧备份失败:`, error);
		}
	}
}

// 全局单例
export const safeJsonManager = new SafeJsonFileManager();
