/**
 * MarkerValidator - Conflict Marker 验证器
 *
 * 验证 conflict markers 的完整性、一致性和正确性
 */

import type { ParsedConflictBlock } from './MarkerParser';
import { createMarkerParser } from './MarkerParser';

/**
 * 验证错误类型
 */
export enum ValidationErrorType {
  /** 缺少分隔符 */
  MISSING_SEPARATOR = 'missing_separator',

  /** 缺少结束标记 */
  MISSING_END_MARKER = 'missing_end_marker',

  /** Block ID 格式错误 */
  INVALID_BLOCK_ID = 'invalid_block_id',

  /** 嵌套的 conflict markers */
  NESTED_MARKERS = 'nested_markers',

  /** 重复的 Block ID */
  DUPLICATE_BLOCK_ID = 'duplicate_block_id',

  /** 空的 conflict block */
  EMPTY_BLOCK = 'empty_block',

  /** 行号不一致 */
  INCONSISTENT_LINE_NUMBERS = 'inconsistent_line_numbers'
}

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误类型 */
  type: ValidationErrorType;

  /** 错误描述 */
  message: string;

  /** 相关的 block ID（如果有） */
  blockId?: string;

  /** 错误所在行号 */
  lineNumber?: number;

  /** 严重程度 */
  severity: 'error' | 'warning';
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否通过验证 */
  isValid: boolean;

  /** 验证错误列表 */
  errors: ValidationError[];

  /** 警告列表 */
  warnings: ValidationError[];

  /** 验证通过的 blocks */
  validBlocks: ParsedConflictBlock[];

  /** 验证失败的 blocks */
  invalidBlocks: ParsedConflictBlock[];

  /** 统计信息 */
  stats: {
    totalBlocks: number;
    validBlocks: number;
    invalidBlocks: number;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * MarkerValidator 类
 */
export class MarkerValidator {
  private parser = createMarkerParser();

  /**
   * 验证内容中的所有 conflict markers
   */
  public validate(content: string): ValidationResult {
    const parseResult = this.parser.parse(content);
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const validBlocks: ParsedConflictBlock[] = [];
    const invalidBlocks: ParsedConflictBlock[] = [];

    // 1. 检查每个 block 的基本有效性
    for (const block of parseResult.blocks) {
      if (!block.isValid) {
        invalidBlocks.push(block);

        // 添加具体的错误信息
        if (block.separatorLine === -1) {
          errors.push({
            type: ValidationErrorType.MISSING_SEPARATOR,
            message: `Block ${block.id} 缺少分隔符 (=======)`,
            blockId: block.id,
            lineNumber: block.startLine,
            severity: 'error'
          });
        }

        if (block.endLine === -1) {
          errors.push({
            type: ValidationErrorType.MISSING_END_MARKER,
            message: `Block ${block.id} 缺少结束标记 (>>>>>>> Claude's Change)`,
            blockId: block.id,
            lineNumber: block.separatorLine,
            severity: 'error'
          });
        }
      } else {
        validBlocks.push(block);
      }
    }

    // 2. 检查 Block ID 格式
    for (const block of parseResult.blocks) {
      if (block.id.startsWith('block-unknown-')) {
        warnings.push({
          type: ValidationErrorType.INVALID_BLOCK_ID,
          message: `Block ID 格式无效或缺失: ${block.id}`,
          blockId: block.id,
          lineNumber: block.startLine,
          severity: 'warning'
        });
      } else if (!this.isValidBlockId(block.id)) {
        errors.push({
          type: ValidationErrorType.INVALID_BLOCK_ID,
          message: `Block ID 格式错误: ${block.id}`,
          blockId: block.id,
          lineNumber: block.startLine,
          severity: 'error'
        });
      }
    }

    // 3. 检查重复的 Block ID
    const blockIdMap = new Map<string, number>();
    for (const block of parseResult.blocks) {
      const count = blockIdMap.get(block.id) || 0;
      blockIdMap.set(block.id, count + 1);
    }

    for (const [blockId, count] of blockIdMap.entries()) {
      if (count > 1) {
        errors.push({
          type: ValidationErrorType.DUPLICATE_BLOCK_ID,
          message: `Block ID 重复: ${blockId} 出现了 ${count} 次`,
          blockId,
          severity: 'error'
        });
      }
    }

    // 4. 检查嵌套的 conflict markers
    const nestedErrors = this.checkNesting(parseResult.blocks);
    errors.push(...nestedErrors);

    // 5. 检查空的 conflict block
    for (const block of validBlocks) {
      if (block.deletedLines.length === 0 && block.addedLines.length === 0) {
        warnings.push({
          type: ValidationErrorType.EMPTY_BLOCK,
          message: `Block ${block.id} 是空的（没有任何修改）`,
          blockId: block.id,
          lineNumber: block.startLine,
          severity: 'warning'
        });
      }
    }

    // 6. 检查行号一致性
    const lineNumberErrors = this.checkLineNumbers(validBlocks);
    errors.push(...lineNumberErrors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      validBlocks,
      invalidBlocks,
      stats: {
        totalBlocks: parseResult.blocks.length,
        validBlocks: validBlocks.length,
        invalidBlocks: invalidBlocks.length,
        errorCount: errors.length,
        warningCount: warnings.length
      }
    };
  }

  /**
   * 检查 Block ID 格式是否有效
   */
  private isValidBlockId(blockId: string): boolean {
    // 格式：block-{fileHash}-L{line}-T{timestamp}
    const regex = /^block-[a-f0-9]{8}-L\d+-T\d+$/;
    return regex.test(blockId);
  }

  /**
   * 检查嵌套的 conflict markers
   */
  private checkNesting(blocks: ParsedConflictBlock[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const block1 = blocks[i];
        const block2 = blocks[j];

        // 检查 block2 是否嵌套在 block1 中
        if (
          block2.startLine > block1.startLine &&
          block2.endLine < block1.endLine
        ) {
          errors.push({
            type: ValidationErrorType.NESTED_MARKERS,
            message: `Block ${block2.id} 嵌套在 Block ${block1.id} 中`,
            blockId: block2.id,
            lineNumber: block2.startLine,
            severity: 'error'
          });
        }
      }
    }

    return errors;
  }

  /**
   * 检查行号一致性（blocks 应该按行号排序，且不重叠）
   */
  private checkLineNumbers(blocks: ParsedConflictBlock[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // 按 startLine 排序
    const sortedBlocks = [...blocks].sort((a, b) => a.startLine - b.startLine);

    for (let i = 0; i < sortedBlocks.length - 1; i++) {
      const currentBlock = sortedBlocks[i];
      const nextBlock = sortedBlocks[i + 1];

      // 检查是否重叠
      if (currentBlock.endLine >= nextBlock.startLine) {
        errors.push({
          type: ValidationErrorType.INCONSISTENT_LINE_NUMBERS,
          message: `Block ${currentBlock.id} 和 Block ${nextBlock.id} 的行号重叠`,
          blockId: currentBlock.id,
          lineNumber: currentBlock.endLine,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * 快速检查内容是否包含有效的 conflict markers
   */
  public quickCheck(content: string): boolean {
    const result = this.validate(content);
    return result.isValid && result.validBlocks.length > 0;
  }

  /**
   * 验证单个 block
   */
  public validateBlock(block: ParsedConflictBlock): {
    isValid: boolean;
    errors: ValidationError[];
  } {
    const errors: ValidationError[] = [];

    // 检查基本有效性
    if (!block.isValid) {
      if (block.error) {
        errors.push({
          type: block.separatorLine === -1
            ? ValidationErrorType.MISSING_SEPARATOR
            : ValidationErrorType.MISSING_END_MARKER,
          message: block.error,
          blockId: block.id,
          lineNumber: block.startLine,
          severity: 'error'
        });
      }
    }

    // 检查 Block ID 格式
    if (!this.isValidBlockId(block.id) && !block.id.startsWith('block-unknown-')) {
      errors.push({
        type: ValidationErrorType.INVALID_BLOCK_ID,
        message: `Block ID 格式错误: ${block.id}`,
        blockId: block.id,
        severity: 'error'
      });
    }

    // 检查是否为空
    if (block.deletedLines.length === 0 && block.addedLines.length === 0) {
      errors.push({
        type: ValidationErrorType.EMPTY_BLOCK,
        message: '块为空（没有任何修改）',
        blockId: block.id,
        severity: 'error'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成验证报告（用于调试）
   */
  public generateReport(content: string): string {
    const result = this.validate(content);
    const lines: string[] = [];

    lines.push('=== Conflict Markers 验证报告 ===\n');
    lines.push(`总块数: ${result.stats.totalBlocks}`);
    lines.push(`有效块数: ${result.stats.validBlocks}`);
    lines.push(`无效块数: ${result.stats.invalidBlocks}`);
    lines.push(`错误数: ${result.stats.errorCount}`);
    lines.push(`警告数: ${result.stats.warningCount}`);
    lines.push(`验证状态: ${result.isValid ? '✅ 通过' : '❌ 失败'}\n`);

    if (result.errors.length > 0) {
      lines.push('--- 错误列表 ---');
      for (const error of result.errors) {
        lines.push(`[${error.type}] ${error.message} (行 ${error.lineNumber || 'N/A'})`);
      }
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('--- 警告列表 ---');
      for (const warning of result.warnings) {
        lines.push(`[${warning.type}] ${warning.message} (行 ${warning.lineNumber || 'N/A'})`);
      }
      lines.push('');
    }

    if (result.validBlocks.length > 0) {
      lines.push('--- 有效的块 ---');
      for (const block of result.validBlocks) {
        lines.push(`${block.id}: 行 ${block.startLine}-${block.endLine} (${block.deletedLines.length}删/${block.addedLines.length}增)`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * 创建 MarkerValidator 实例（工厂函数）
 */
export function createMarkerValidator(): MarkerValidator {
  return new MarkerValidator();
}
