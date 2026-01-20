/**
 * MarkerInserter - Conflict Marker 插入器
 *
 * 将 DiffBlockData 转换为带 conflict markers 的文本内容
 */

import type { DiffBlockData } from '../diff/DiffCalculator';

/**
 * Conflict Marker 格式配置
 */
export interface MarkerConfig {
  /** 起始标记（默认：<<<<<<< Original） */
  startMarker?: string;

  /** 分隔标记（默认：=======） */
  separatorMarker?: string;

  /** 结束标记（默认：>>>>>>> Claude's Change） */
  endMarker?: string;

  /** 是否在起始标记中包含 block ID */
  includeBlockId?: boolean;

  /** 是否在标记行添加额外的空行 */
  addSpacing?: boolean;
}

/**
 * 插入结果
 */
export interface InsertResult {
  /** 插入后的完整内容 */
  content: string;

  /** 插入的标记块数量 */
  blockCount: number;

  /** 每个块的行号映射（blockId -> { startLine, separatorLine, endLine }） */
  lineMapping: Map<string, {
    startLine: number;
    separatorLine: number;
    endLine: number;
  }>;
}

/**
 * MarkerInserter 类
 */
export class MarkerInserter {
  private config: Required<MarkerConfig>;

  constructor(config: MarkerConfig = {}) {
    this.config = {
      startMarker: config.startMarker || '<<<<<<< Original',
      separatorMarker: config.separatorMarker || '=======',
      endMarker: config.endMarker || ">>>>>>> Claude's Change",
      includeBlockId: config.includeBlockId !== false,
      addSpacing: config.addSpacing || false
    };
  }

  /**
   * 将 DiffBlockData[] 插入到原始内容中
   */
  public insert(
    originalContent: string,
    blocks: DiffBlockData[],
    blockIds: string[]
  ): InsertResult {
    if (blocks.length === 0) {
      return {
        content: originalContent,
        blockCount: 0,
        lineMapping: new Map()
      };
    }

    // 按 startLine 排序
    const sortedBlocks = blocks
      .map((block, index) => ({ block, blockId: blockIds[index] }))
      .sort((a, b) => a.block.startLine - b.block.startLine);

    const originalLines = originalContent.split('\n');
    const resultLines: string[] = [];
    const lineMapping = new Map<string, {
      startLine: number;
      separatorLine: number;
      endLine: number;
    }>();

    let lastLine = 0;

    for (const { block, blockId } of sortedBlocks) {
      // 添加未修改的行
      for (let i = lastLine; i < block.startLine; i++) {
        resultLines.push(originalLines[i]);
      }

      // 记录当前行号
      const startLineNum = resultLines.length;

      // 插入 conflict markers
      const markerBlock = this.buildMarkerBlock(block, blockId);
      resultLines.push(...markerBlock.lines);

      // 记录行号映射
      lineMapping.set(blockId, {
        startLine: startLineNum,
        separatorLine: startLineNum + markerBlock.separatorOffset,
        endLine: startLineNum + markerBlock.lines.length - 1
      });

      // 更新最后处理的行号
      lastLine = block.endLine;
    }

    // 添加剩余的未修改行
    for (let i = lastLine; i < originalLines.length; i++) {
      resultLines.push(originalLines[i]);
    }

    return {
      content: resultLines.join('\n'),
      blockCount: blocks.length,
      lineMapping
    };
  }

  /**
   * 构建单个 marker block
   */
  private buildMarkerBlock(
    block: DiffBlockData,
    blockId: string
  ): { lines: string[]; separatorOffset: number } {
    const lines: string[] = [];

    // <<<<<<< Original [block-xxx]
    const startLine = this.config.includeBlockId
      ? `${this.config.startMarker} [${blockId}]`
      : this.config.startMarker;
    lines.push(startLine);

    if (this.config.addSpacing) {
      lines.push('');
    }

    // 旧内容（删除的行）
    for (const line of block.deletedLines) {
      lines.push(line);
    }

    if (this.config.addSpacing && block.deletedLines.length > 0) {
      lines.push('');
    }

    // =======
    const separatorOffset = lines.length;
    lines.push(this.config.separatorMarker);

    if (this.config.addSpacing) {
      lines.push('');
    }

    // 新内容（新增的行）
    for (const line of block.addedLines) {
      lines.push(line);
    }

    if (this.config.addSpacing && block.addedLines.length > 0) {
      lines.push('');
    }

    // >>>>>>> Claude's Change
    lines.push(this.config.endMarker);

    return { lines, separatorOffset };
  }

  /**
   * 批量插入（支持多个文件）
   */
  public insertMultiple(
    files: Array<{
      filePath: string;
      originalContent: string;
      blocks: DiffBlockData[];
      blockIds: string[];
    }>
  ): Map<string, InsertResult> {
    const results = new Map<string, InsertResult>();

    for (const file of files) {
      const result = this.insert(
        file.originalContent,
        file.blocks,
        file.blockIds
      );
      results.set(file.filePath, result);
    }

    return results;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<MarkerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}

/**
 * 创建 MarkerInserter 实例（工厂函数）
 */
export function createMarkerInserter(config?: MarkerConfig): MarkerInserter {
  return new MarkerInserter(config);
}
