/**
 * DiffCalculator - Diff 计算引擎接口和实现
 *
 * 使用 Myers Diff 算法计算两个文本内容的差异
 */

import { diffLines, Change } from 'diff';
import type { ChangeType } from '../state/DiffBlock';

/**
 * Diff 计算选项
 */
export interface DiffOptions {
  /** Diff 算法（目前仅支持 myers） */
  algorithm?: 'myers';

  /** 单个 block 最大行数 */
  maxBlockSize?: number;

  /** 是否忽略空白字符 */
  ignoreWhitespace?: boolean;

  /** 上下文行数（默认 0，即不包含未修改的行） */
  contextLines?: number;
}

/**
 * Diff 块数据（原始 diff 结果）
 */
export interface DiffBlockData {
  /** 在原始内容中的起始行号（从 0 开始） */
  startLine: number;

  /** 在原始内容中的结束行号（从 0 开始） */
  endLine: number;

  /** 删除的行 */
  deletedLines: string[];

  /** 新增的行 */
  addedLines: string[];

  /** 变更类型 */
  changeType: ChangeType;
}

/**
 * Diff 计算结果
 */
export interface DiffResult {
  /** 所有差异块 */
  blocks: DiffBlockData[];

  /** 统计信息 */
  stats: {
    totalLines: number;
    addedLines: number;
    deletedLines: number;
    modifiedLines: number;
  };

  /** 性能信息 */
  performance: {
    duration: number;  // 毫秒
    algorithm: string;
  };
}

/**
 * DiffCalculator 类
 */
export class DiffCalculator {
  /**
   * 计算两个内容的差异
   */
  public calculate(
    oldContent: string,
    newContent: string,
    options: DiffOptions = {}
  ): DiffResult {
    const startTime = performance.now();

    // 使用 Myers Diff 算法
    const changes = this.myersDiff(oldContent, newContent, options);

    // 转换为 DiffBlockData 数组
    const blocks = this.convertChangesToBlocks(changes, options);

    // 计算统计信息
    const stats = this.calculateStats(blocks, oldContent);

    const duration = performance.now() - startTime;

    return {
      blocks,
      stats,
      performance: {
        duration,
        algorithm: options.algorithm || 'myers'
      }
    };
  }

  /**
   * 使用 Myers Diff 算法计算差异
   */
  private myersDiff(
    oldContent: string,
    newContent: string,
    options: DiffOptions
  ): Change[] {
    const diffOptions = {
      ignoreWhitespace: options.ignoreWhitespace || false
    };

    // 使用 diff 库的 diffLines 方法（实现了 Myers 算法）
    return diffLines(oldContent, newContent, diffOptions);
  }

  /**
   * 将 Change 数组转换为 DiffBlockData 数组
   */
  private convertChangesToBlocks(
    changes: Change[],
    options: DiffOptions
  ): DiffBlockData[] {
    const blocks: DiffBlockData[] = [];
    let currentLine = 0;  // 当前在原始内容中的行号
    const processedIndices = new Set<number>();  // 记录已处理的 change 索引

    for (let i = 0; i < changes.length; i++) {
      // 跳过已处理的 change（比如被前一个 removed 合并的 added）
      if (processedIndices.has(i)) {
        continue;
      }

      const change = changes[i];
      const lineCount = change.count || 0;

      if (change.added || change.removed) {
        // 这是一个修改块
        const block = this.createBlockFromChange(change, currentLine, changes, options, i);
        if (block) {
          blocks.push(block);

          // 如果这是一个 modify block（removed + added），标记下一个 added 为已处理
          if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
            processedIndices.add(i + 1);
          }
        }
      }

      // 更新当前行号（只有未添加的行才计入原始内容的行号）
      if (!change.added) {
        currentLine += lineCount;
      }
    }

    // 合并相邻的 blocks（连续的修改应该合并成一个 block）
    const mergedBlocks = this.mergeAdjacentBlocks(blocks);

    // 限制 block 数量（如果设置了 maxBlockSize）
    return this.limitBlockSize(mergedBlocks, options.maxBlockSize);
  }

  /**
   * 从 Change 对象创建 DiffBlockData
   */
  private createBlockFromChange(
    change: Change,
    currentLine: number,
    allChanges: Change[],
    options: DiffOptions,
    currentIndex?: number
  ): DiffBlockData | null {
    const lineCount = change.count || 0;
    const lines = change.value.split('\n').filter(line => line !== '');  // 移除空行

    if (change.added) {
      // 纯新增
      return {
        startLine: currentLine,
        endLine: currentLine,
        deletedLines: [],
        addedLines: lines,
        changeType: 'add'
      };
    } else if (change.removed) {
      // 检查下一个 change 是否是 added（这表示是修改而非删除）
      const nextChange = this.getNextChange(change, allChanges);

      if (nextChange && nextChange.added) {
        // 修改（删除 + 新增）
        const addedLines = nextChange.value.split('\n').filter(line => line !== '');

        return {
          startLine: currentLine,
          endLine: currentLine + lineCount,
          deletedLines: lines,
          addedLines,
          changeType: 'modify'
        };
      } else {
        // 纯删除
        return {
          startLine: currentLine,
          endLine: currentLine + lineCount,
          deletedLines: lines,
          addedLines: [],
          changeType: 'delete'
        };
      }
    }

    return null;
  }

  /**
   * 获取下一个 change
   */
  private getNextChange(currentChange: Change, allChanges: Change[]): Change | null {
    const index = allChanges.indexOf(currentChange);
    if (index !== -1 && index < allChanges.length - 1) {
      return allChanges[index + 1];
    }
    return null;
  }

  /**
   * 合并相邻的 blocks（连续的修改应该合并成一个 block）
   */
  private mergeAdjacentBlocks(blocks: DiffBlockData[]): DiffBlockData[] {
    if (blocks.length <= 1) {
      return blocks;
    }

    const merged: DiffBlockData[] = [];
    let currentBlock = blocks[0];

    for (let i = 1; i < blocks.length; i++) {
      const nextBlock = blocks[i];

      // 检查两个 block 是否相邻（中间没有未修改的行）
      const isAdjacent = currentBlock.endLine === nextBlock.startLine;

      if (isAdjacent) {
        // 合并两个 block
        currentBlock = {
          startLine: currentBlock.startLine,
          endLine: nextBlock.endLine,
          deletedLines: [...currentBlock.deletedLines, ...nextBlock.deletedLines],
          addedLines: [...currentBlock.addedLines, ...nextBlock.addedLines],
          changeType: 'modify'  // 合并后统一为 modify
        };
      } else {
        // 不相邻，保存当前 block 并开始新的 block
        merged.push(currentBlock);
        currentBlock = nextBlock;
      }
    }

    // 添加最后一个 block
    merged.push(currentBlock);

    return merged;
  }

  /**
   * 限制 block 大小（分割大块）
   */
  private limitBlockSize(blocks: DiffBlockData[], maxSize?: number): DiffBlockData[] {
    if (!maxSize) {
      return blocks;
    }

    const result: DiffBlockData[] = [];

    for (const block of blocks) {
      const totalLines = block.deletedLines.length + block.addedLines.length;

      if (totalLines <= maxSize) {
        result.push(block);
      } else {
        // 分割大块
        const splitBlocks = this.splitBlock(block, maxSize);
        result.push(...splitBlocks);
      }
    }

    return result;
  }

  /**
   * 分割大块
   */
  private splitBlock(block: DiffBlockData, maxSize: number): DiffBlockData[] {
    const blocks: DiffBlockData[] = [];

    const { deletedLines, addedLines } = block;
    const maxLinesPerBlock = Math.floor(maxSize / 2);  // 平均分配给删除和新增

    let deletedIndex = 0;
    let addedIndex = 0;
    let currentLine = block.startLine;

    while (deletedIndex < deletedLines.length || addedIndex < addedLines.length) {
      const deletedChunk = deletedLines.slice(deletedIndex, deletedIndex + maxLinesPerBlock);
      const addedChunk = addedLines.slice(addedIndex, addedIndex + maxLinesPerBlock);

      blocks.push({
        startLine: currentLine,
        endLine: currentLine + deletedChunk.length,
        deletedLines: deletedChunk,
        addedLines: addedChunk,
        changeType: block.changeType
      });

      deletedIndex += deletedChunk.length;
      addedIndex += addedChunk.length;
      currentLine += deletedChunk.length;
    }

    return blocks;
  }

  /**
   * 计算统计信息
   */
  private calculateStats(blocks: DiffBlockData[], oldContent: string): DiffResult['stats'] {
    const totalLines = oldContent.split('\n').length;
    const addedLines = blocks.reduce((sum, b) => sum + b.addedLines.length, 0);
    const deletedLines = blocks.reduce((sum, b) => sum + b.deletedLines.length, 0);

    // 修改的行 = 同时有删除和新增的 block 的行数
    const modifiedLines = blocks
      .filter(b => b.deletedLines.length > 0 && b.addedLines.length > 0)
      .reduce((sum, b) => sum + Math.max(b.deletedLines.length, b.addedLines.length), 0);

    return {
      totalLines,
      addedLines,
      deletedLines,
      modifiedLines
    };
  }
}

/**
 * 创建 DiffCalculator 实例（工厂函数）
 */
export function createDiffCalculator(): DiffCalculator {
  return new DiffCalculator();
}
