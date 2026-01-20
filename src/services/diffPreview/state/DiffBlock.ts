/**
 * DiffBlock - 单个差异块的数据模型
 *
 * 表示 AI 修改文件时产生的一个差异块，包含原始内容、修改后内容、
 * 位置信息、状态追踪等完整信息。
 */

/**
 * 差异块状态
 */
export type DiffBlockStatus = 'pending' | 'accepted' | 'rejected' | 'invalidated';

/**
 * 变更类型
 */
export type ChangeType = 'add' | 'delete' | 'modify';

/**
 * 基准类型（对比基准的来源）
 */
export type BaseType = 'original' | 'accepted';

/**
 * DiffBlock 数据模型
 */
export interface DiffBlock {
  // ========== 唯一标识 ==========
  /** 块的唯一 ID，格式：block-{fileHash}-L{行号}-T{时间戳} */
  id: string;

  // ========== 文件信息 ==========
  /** 文件路径（绝对路径） */
  filePath: string;

  // ========== 位置信息（基于当前文档的行号）==========
  /** conflict marker 起始行（<<<<<<< 所在行） */
  startLine: number;

  /** 分隔符行（======= 所在行） */
  separatorLine: number;

  /** conflict marker 结束行（>>>>>>> 所在行） */
  endLine: number;

  // ========== 内容快照 ==========
  /** 基准内容（对比的原始内容或上次接受的内容） */
  baseContent: string;

  /** 当前修改内容（AI 建议的新内容） */
  currentContent: string;

  // ========== 基准追踪 ==========
  /** 基准类型：original（初始状态）或 accepted（上次接受的状态） */
  baseType: BaseType;

  /** 如果基准是接受后的，记录那个 block 的 ID */
  baseBlockId?: string;

  // ========== 状态 ==========
  /** 块的当前状态 */
  status: DiffBlockStatus;

  // ========== 时间戳 ==========
  /** 创建时间戳 */
  createdAt: number;

  /** 最后修改时间戳 */
  lastModified: number;

  /** 处理时间戳（接受或拒绝的时间） */
  processedAt?: number;

  // ========== 元数据 ==========
  /** 变更类型 */
  changeType: ChangeType;

  /** 新增的行数 */
  linesAdded: number;

  /** 删除的行数 */
  linesDeleted: number;

  // ========== AI 信息 ==========
  /** 关联的 AI channel ID */
  aiChannelId?: string;

  /** 使用的工具名（Write/Edit） */
  aiToolName?: string;
}

/**
 * 创建 DiffBlock 的工厂函数
 */
export function createDiffBlock(params: {
  id: string;
  filePath: string;
  startLine: number;
  separatorLine: number;
  endLine: number;
  baseContent: string;
  currentContent: string;
  baseType?: BaseType;
  baseBlockId?: string;
  changeType: ChangeType;
  linesAdded: number;
  linesDeleted: number;
  aiChannelId?: string;
  aiToolName?: string;
}): DiffBlock {
  const now = Date.now();

  return {
    id: params.id,
    filePath: params.filePath,
    startLine: params.startLine,
    separatorLine: params.separatorLine,
    endLine: params.endLine,
    baseContent: params.baseContent,
    currentContent: params.currentContent,
    baseType: params.baseType || 'original',
    baseBlockId: params.baseBlockId,
    status: 'pending',
    createdAt: now,
    lastModified: now,
    changeType: params.changeType,
    linesAdded: params.linesAdded,
    linesDeleted: params.linesDeleted,
    aiChannelId: params.aiChannelId,
    aiToolName: params.aiToolName
  };
}

/**
 * 判断 block 是否处于待处理状态
 */
export function isPending(block: DiffBlock): boolean {
  return block.status === 'pending';
}

/**
 * 判断 block 是否已接受
 */
export function isAccepted(block: DiffBlock): boolean {
  return block.status === 'accepted';
}

/**
 * 判断 block 是否已拒绝
 */
export function isRejected(block: DiffBlock): boolean {
  return block.status === 'rejected';
}

/**
 * 判断 block 是否已失效
 */
export function isInvalidated(block: DiffBlock): boolean {
  return block.status === 'invalidated';
}

/**
 * 获取 block 的摘要信息（用于显示）
 */
export function getBlockSummary(block: DiffBlock): string {
  const { linesAdded, linesDeleted, changeType } = block;

  if (changeType === 'add') {
    return `+${linesAdded} 行`;
  } else if (changeType === 'delete') {
    return `-${linesDeleted} 行`;
  } else {
    return `+${linesAdded}/-${linesDeleted}`;
  }
}
