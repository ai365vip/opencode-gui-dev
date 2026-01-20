/**
 * FileState - 单个文件的差异状态管理
 *
 * 管理一个文件的所有差异块、内容快照、统计信息等
 */

import type { DiffBlock } from './DiffBlock';
import { createHash } from 'crypto';

/**
 * FileState 数据模型
 */
export interface FileState {
  // ========== 文件标识 ==========
  /** 文件路径（绝对路径） */
  filePath: string;

  // ========== 内容快照 ==========
  /** 初始状态（第一次 AI 修改前的原始内容） */
  originalContent: string;

  /** 磁盘上的最新内容（包含 conflict markers） */
  currentDiskContent: string;

  // ========== Blocks 管理 ==========
  /** 所有差异块（key: block.id） */
  blocks: Map<string, DiffBlock>;

  /** Block 的顺序（从上到下，按 startLine 排序） */
  blockOrder: string[];

  // ========== 状态追踪 ==========
  /** 是否标记为即将被 AI 编辑 */
  isMarkedForAIEdit: boolean;

  /** 标记的 channel ID */
  markedChannelId?: string;

  /** 最后一次 AI 修改时间 */
  lastAIEditTime: number;

  // ========== 统计信息 ==========
  /** 累计创建的 block 数量 */
  totalBlocksCreated: number;

  /** 累计接受的 block 数量 */
  totalBlocksAccepted: number;

  /** 累计拒绝的 block 数量 */
  totalBlocksRejected: number;

  // ========== 文件哈希（用于检测外部修改）==========
  /** 内容哈希（基于 originalContent） */
  contentHash: string;

  // ========== 同步时间 ==========
  /** 最后同步时间 */
  lastSyncTime: number;
}

/**
 * 创建 FileState 的工厂函数
 */
export function createFileState(params: {
  filePath: string;
  originalContent: string;
  currentDiskContent?: string;
}): FileState {
  const now = Date.now();
  const contentHash = calculateContentHash(params.originalContent);

  return {
    filePath: params.filePath,
    originalContent: params.originalContent,
    currentDiskContent: params.currentDiskContent || params.originalContent,
    blocks: new Map(),
    blockOrder: [],
    isMarkedForAIEdit: false,
    lastAIEditTime: 0,
    totalBlocksCreated: 0,
    totalBlocksAccepted: 0,
    totalBlocksRejected: 0,
    contentHash,
    lastSyncTime: now
  };
}

/**
 * 计算内容哈希
 */
export function calculateContentHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * 添加 block 到 FileState
 */
export function addBlock(state: FileState, block: DiffBlock): void {
  state.blocks.set(block.id, block);
  state.totalBlocksCreated++;

  // 更新顺序（按 startLine 排序）
  updateBlockOrder(state);
}

/**
 * 移除 block 从 FileState
 */
export function removeBlock(state: FileState, blockId: string): void {
  state.blocks.delete(blockId);

  // 更新顺序
  updateBlockOrder(state);
}

/**
 * 更新 block 顺序（按 startLine 排序）
 */
function updateBlockOrder(state: FileState): void {
  const blocks = Array.from(state.blocks.values());
  blocks.sort((a, b) => a.startLine - b.startLine);
  state.blockOrder = blocks.map(b => b.id);
}

/**
 * 获取所有待处理的 blocks
 */
export function getPendingBlocks(state: FileState): DiffBlock[] {
  return state.blockOrder
    .map(id => state.blocks.get(id)!)
    .filter(block => block.status === 'pending');
}

/**
 * 获取所有已接受的 blocks
 */
export function getAcceptedBlocks(state: FileState): DiffBlock[] {
  return state.blockOrder
    .map(id => state.blocks.get(id)!)
    .filter(block => block.status === 'accepted');
}

/**
 * 获取所有已拒绝的 blocks
 */
export function getRejectedBlocks(state: FileState): DiffBlock[] {
  return state.blockOrder
    .map(id => state.blocks.get(id)!)
    .filter(block => block.status === 'rejected');
}

/**
 * 获取所有有效的 blocks（pending 或 accepted）
 */
export function getValidBlocks(state: FileState): DiffBlock[] {
  return state.blockOrder
    .map(id => state.blocks.get(id)!)
    .filter(block => block.status === 'pending' || block.status === 'accepted');
}

/**
 * 标记文件为即将被 AI 编辑
 */
export function markForAIEdit(
  state: FileState,
  channelId: string
): void {
  state.isMarkedForAIEdit = true;
  state.markedChannelId = channelId;
}

/**
 * 取消 AI 编辑标记
 */
export function unmarkForAIEdit(state: FileState): void {
  state.isMarkedForAIEdit = false;
  state.markedChannelId = undefined;
}

/**
 * 检查文件是否被外部修改
 */
export function isModifiedExternally(state: FileState, currentContent: string): boolean {
  const currentHash = calculateContentHash(currentContent);
  return currentHash !== state.contentHash;
}

/**
 * 更新文件的原始内容（用于外部修改后重新同步）
 */
export function updateOriginalContent(state: FileState, newContent: string): void {
  state.originalContent = newContent;
  state.contentHash = calculateContentHash(newContent);
  state.lastSyncTime = Date.now();
}

/**
 * 获取文件的统计信息
 */
export function getStats(state: FileState): {
  totalBlocks: number;
  pendingBlocks: number;
  acceptedBlocks: number;
  rejectedBlocks: number;
  totalLinesAdded: number;
  totalLinesDeleted: number;
} {
  const blocks = Array.from(state.blocks.values());

  return {
    totalBlocks: blocks.length,
    pendingBlocks: blocks.filter(b => b.status === 'pending').length,
    acceptedBlocks: blocks.filter(b => b.status === 'accepted').length,
    rejectedBlocks: blocks.filter(b => b.status === 'rejected').length,
    totalLinesAdded: blocks.reduce((sum, b) => sum + b.linesAdded, 0),
    totalLinesDeleted: blocks.reduce((sum, b) => sum + b.linesDeleted, 0)
  };
}
