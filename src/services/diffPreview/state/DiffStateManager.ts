/**
 * DiffStateManager - 差异状态管理器
 *
 * 全局单例，管理所有文件的差异块状态、提供增删改查接口
 */

import type { DiffBlock, DiffBlockStatus } from './DiffBlock';
import type { FileState } from './FileState';
import {
  createFileState,
  addBlock as addBlockToFileState,
  removeBlock as removeBlockFromFileState,
  getPendingBlocks,
  getValidBlocks,
  markForAIEdit,
  unmarkForAIEdit,
  getStats as getFileStats
} from './FileState';
import { generateBlockId } from '../utils/BlockIdGenerator';
import { normalizePath } from '../utils/PathNormalizer';

/**
 * 差异统计信息
 */
export interface DiffStats {
  totalFiles: number;
  totalBlocks: number;
  pendingBlocks: number;
  acceptedBlocks: number;
  rejectedBlocks: number;
  totalLinesAdded: number;
  totalLinesDeleted: number;
}

/**
 * DiffStateManager 类
 */
export class DiffStateManager {
  // 单例实例
  private static instance: DiffStateManager | null = null;

  // 文件状态映射（key: 文件路径）
  private fileStates = new Map<string, FileState>();

  // 活跃文件列表（最近使用的文件，用于 LRU 缓存）
  private activeFiles: string[] = [];

  // 最大活跃文件数量
  private readonly maxActiveFiles = 10;

  private constructor() {
    // 私有构造函数，实现单例模式
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): DiffStateManager {
    if (!DiffStateManager.instance) {
      DiffStateManager.instance = new DiffStateManager();
    }
    return DiffStateManager.instance;
  }

  /**
   * 重置单例实例（用于测试）
   */
  public static resetInstance(): void {
    DiffStateManager.instance = null;
  }

  // ========== 文件状态管理 ==========

  /**
   * 获取文件状态（如果不存在则创建）
   */
  public getFileState(filePath: string, originalContent?: string): FileState {
    if (!this.fileStates.has(filePath)) {
      if (!originalContent) {
        throw new Error(`File state not found and no original content provided: ${filePath}`);
      }

      const state = createFileState({
        filePath,
        originalContent
      });

      this.fileStates.set(filePath, state);
    }

    // 更新活跃文件列表（LRU）
    this.updateActiveFiles(filePath);

    return this.fileStates.get(filePath)!;
  }

  /**
   * 删除文件状态
   */
  public deleteFileState(filePath: string): void {
    this.fileStates.delete(filePath);

    // 从活跃列表移除
    const index = this.activeFiles.indexOf(filePath);
    if (index !== -1) {
      this.activeFiles.splice(index, 1);
    }
  }

  /**
   * 检查文件是否有状态
   */
  public hasFileState(filePath: string): boolean {
    return this.fileStates.has(filePath);
  }

  /**
   * 获取所有文件路径
   */
  public getAllFilePaths(): string[] {
    return Array.from(this.fileStates.keys());
  }

  /**
   * 获取所有有 blocks 的文件路径
   */
  public getFilesWithBlocks(): string[] {
    return this.getAllFilePaths().filter(filePath => {
      const state = this.fileStates.get(filePath)!;
      return state.blocks.size > 0;
    });
  }

  // ========== Block 管理 ==========

  /**
   * 添加 block
   * @param block - 差异块（filePath 可以是原始路径，内部会规范化）
   */
  public addBlock(block: DiffBlock): void {
    // 使用规范化路径作为 key，但保留 block.filePath 原始值用于显示
    const normalizedPath = normalizePath(block.filePath);
    const state = this.getFileState(normalizedPath);
    addBlockToFileState(state, block);
  }

  /**
   * 移除 block
   */
  public removeBlock(blockId: string): void {
    for (const state of this.fileStates.values()) {
      if (state.blocks.has(blockId)) {
        removeBlockFromFileState(state, blockId);
        return;
      }
    }
  }

  /**
   * 获取 block
   */
  public getBlock(blockId: string): DiffBlock | undefined {
    for (const state of this.fileStates.values()) {
      const block = state.blocks.get(blockId);
      if (block) {
        return block;
      }
    }
    return undefined;
  }

  /**
   * 更新 block 状态
   */
  public updateBlockStatus(blockId: string, status: DiffBlockStatus): void {
    const block = this.getBlock(blockId);
    if (!block) {
      throw new Error(`Block not found: ${blockId}`);
    }

    block.status = status;
    block.processedAt = Date.now();

    // 更新统计（使用规范化路径查找 FileState）
    const normalizedPath = normalizePath(block.filePath);
    const state = this.fileStates.get(normalizedPath);
    if (!state) {
      throw new Error(`FileState not found for path: ${block.filePath} (normalized: ${normalizedPath})`);
    }

    if (status === 'accepted') {
      state.totalBlocksAccepted++;
    } else if (status === 'rejected') {
      state.totalBlocksRejected++;
    }
  }

  /**
   * 获取文件的所有 blocks
   */
  public getBlocks(filePath: string): DiffBlock[] {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return [];
    }

    return state.blockOrder.map(id => state.blocks.get(id)!);
  }

  /**
   * 获取文件的所有待处理 blocks
   */
  public getPendingBlocks(filePath: string): DiffBlock[] {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return [];
    }

    return getPendingBlocks(state);
  }

  /**
   * 获取所有有待处理 blocks 的文件
   * @returns Map<filePath, DiffBlock[]>
   */
  public getAllFilesWithPendingBlocks(): Map<string, DiffBlock[]> {
    const result = new Map<string, DiffBlock[]>();

    for (const [filePath, state] of this.fileStates.entries()) {
      const pendingBlocks = getPendingBlocks(state);
      if (pendingBlocks.length > 0) {
        result.set(filePath, pendingBlocks);
      }
    }

    return result;
  }

  /**
   * 清空文件的所有 blocks
   */
  public clearBlocks(filePath: string): void {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return;
    }

    state.blocks.clear();
    state.blockOrder = [];
  }

  /**
   * 清空文件的所有 pending blocks（保留 accepted/rejected 的历史）
   * 用于新的 AI 修改到来时，清除旧的 pending 对比
   */
  public clearPendingBlocks(filePath: string): void {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return;
    }

    // 找出所有 pending blocks
    const pendingBlockIds: string[] = [];
    for (const [blockId, block] of state.blocks.entries()) {
      if (block.status === 'pending') {
        pendingBlockIds.push(blockId);
      }
    }

    // 删除所有 pending blocks
    for (const blockId of pendingBlockIds) {
      state.blocks.delete(blockId);
      state.blockOrder = state.blockOrder.filter(id => id !== blockId);
    }
  }

  // ========== AI 编辑标记 ==========

  /**
   * 标记文件即将被 AI 编辑
   */
  public markFileForAIEdit(filePath: string, channelId: string): void {
    const state = this.getFileState(filePath);
    markForAIEdit(state, channelId);
  }

  /**
   * 取消 AI 编辑标记
   */
  public unmarkFileForAIEdit(filePath: string): void {
    const state = this.fileStates.get(filePath);
    if (state) {
      unmarkForAIEdit(state);
    }
  }

  /**
   * 检查文件是否标记为即将被 AI 编辑
   */
  public isMarkedForAIEdit(filePath: string): boolean {
    const state = this.fileStates.get(filePath);
    return state?.isMarkedForAIEdit || false;
  }

  /**
   * 获取文件的标记 channel ID
   */
  public getMarkedChannelId(filePath: string): string | undefined {
    const state = this.fileStates.get(filePath);
    return state?.markedChannelId;
  }

  // ========== 统计信息 ==========

  /**
   * 获取全局统计信息
   */
  public getStats(): DiffStats {
    const stats: DiffStats = {
      totalFiles: 0,
      totalBlocks: 0,
      pendingBlocks: 0,
      acceptedBlocks: 0,
      rejectedBlocks: 0,
      totalLinesAdded: 0,
      totalLinesDeleted: 0
    };

    for (const state of this.fileStates.values()) {
      if (state.blocks.size > 0) {
        stats.totalFiles++;

        const fileStats = getFileStats(state);
        stats.totalBlocks += fileStats.totalBlocks;
        stats.pendingBlocks += fileStats.pendingBlocks;
        stats.acceptedBlocks += fileStats.acceptedBlocks;
        stats.rejectedBlocks += fileStats.rejectedBlocks;
        stats.totalLinesAdded += fileStats.totalLinesAdded;
        stats.totalLinesDeleted += fileStats.totalLinesDeleted;
      }
    }

    return stats;
  }

  /**
   * 获取文件的统计信息
   */
  public getFileStats(filePath: string): ReturnType<typeof getFileStats> | null {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return null;
    }

    return getFileStats(state);
  }

  // ========== 辅助方法 ==========

  /**
   * 更新活跃文件列表（LRU）
   */
  private updateActiveFiles(filePath: string): void {
    // 移除旧的
    const index = this.activeFiles.indexOf(filePath);
    if (index !== -1) {
      this.activeFiles.splice(index, 1);
    }

    // 添加到最前面
    this.activeFiles.unshift(filePath);

    // 保持列表大小
    if (this.activeFiles.length > this.maxActiveFiles) {
      this.activeFiles = this.activeFiles.slice(0, this.maxActiveFiles);
    }
  }

  /**
   * 清空所有状态（用于测试或重置）
   */
  public clear(): void {
    this.fileStates.clear();
    this.activeFiles = [];
  }

  /**
   * 获取内存占用估算（字节）
   */
  public getMemoryUsage(): number {
    let totalSize = 0;

    for (const state of this.fileStates.values()) {
      // 估算：每个 FileState 约 1KB 基础开销
      totalSize += 1024;

      // 原始内容和当前内容
      totalSize += state.originalContent.length * 2;
      totalSize += state.currentDiskContent.length * 2;

      // 每个 Block 约 500 字节 + 内容大小
      for (const block of state.blocks.values()) {
        totalSize += 500;
        totalSize += block.baseContent.length * 2;
        totalSize += block.currentContent.length * 2;
      }
    }

    return totalSize;
  }
}

/**
 * 导出单例实例的便捷访问函数
 */
export function getStateManager(): DiffStateManager {
  return DiffStateManager.getInstance();
}
