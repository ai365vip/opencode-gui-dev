/**
 * MarkerParser - Conflict Marker 解析器
 *
 * 解析包含 conflict markers 的文本内容，提取所有差异块
 */

/**
 * 解析出的 Conflict Block
 */
export interface ParsedConflictBlock {
  /** Block ID（从标记中提取） */
  id: string;

  /** 起始行号（<<<<<<< 所在行） */
  startLine: number;

  /** 分隔行号（======= 所在行） */
  separatorLine: number;

  /** 结束行号（>>>>>>> 所在行） */
  endLine: number;

  /** 旧内容（删除的行） */
  deletedLines: string[];

  /** 新内容（新增的行） */
  addedLines: string[];

  /** 是否格式有效 */
  isValid: boolean;

  /** 错误信息（如果格式无效） */
  error?: string;
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 解析出的所有块 */
  blocks: ParsedConflictBlock[];

  /** 有效的块数量 */
  validBlockCount: number;

  /** 无效的块数量 */
  invalidBlockCount: number;

  /** 是否包含任何 conflict markers */
  hasMarkers: boolean;

  /** 移除所有标记后的纯净内容（可选） */
  cleanContent?: string;
}

/**
 * MarkerParser 类
 */
export class MarkerParser {
  // Conflict Marker 正则表达式
  private readonly START_MARKER_REGEX = /^<<<<<<< Original(?: \[(block-[a-f0-9]{8}-L\d+-T\d+)\])?$/;
  private readonly SEPARATOR_MARKER = '=======';
  private readonly END_MARKER = ">>>>>>> Claude's Change";

  /**
   * 解析包含 conflict markers 的内容
   */
  public parse(content: string, extractCleanContent = false): ParseResult {
    const lines = content.split('\n');
    const blocks: ParsedConflictBlock[] = [];
    let validBlockCount = 0;
    let invalidBlockCount = 0;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(this.START_MARKER_REGEX);

      if (match) {
        // 找到起始标记
        const startLine = i;
        const blockId = match[1] || `block-unknown-${startLine}`;

        // 查找分隔符和结束标记
        const blockResult = this.parseBlock(lines, startLine);

        if (blockResult) {
          blocks.push(blockResult);
          if (blockResult.isValid) {
            validBlockCount++;
          } else {
            invalidBlockCount++;
          }

          // 跳过已解析的块
          i = blockResult.endLine + 1;
        } else {
          // 解析失败，跳过这一行
          i++;
        }
      } else {
        i++;
      }
    }

    const result: ParseResult = {
      blocks,
      validBlockCount,
      invalidBlockCount,
      hasMarkers: blocks.length > 0
    };

    if (extractCleanContent) {
      result.cleanContent = this.extractCleanContent(content, blocks);
    }

    return result;
  }

  /**
   * 解析单个 conflict block
   */
  private parseBlock(
    lines: string[],
    startLine: number
  ): ParsedConflictBlock | null {
    const startLineText = lines[startLine];
    const match = startLineText.match(this.START_MARKER_REGEX);

    if (!match) {
      return null;
    }

    const blockId = match[1] || `block-unknown-${startLine}`;

    // 查找分隔符
    let separatorLine = -1;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i] === this.SEPARATOR_MARKER) {
        separatorLine = i;
        break;
      }
    }

    if (separatorLine === -1) {
      // 未找到分隔符
      return {
        id: blockId,
        startLine,
        separatorLine: -1,
        endLine: -1,
        deletedLines: [],
        addedLines: [],
        isValid: false,
        error: 'Missing separator marker (=======)'
      };
    }

    // 查找结束标记
    let endLine = -1;
    for (let i = separatorLine + 1; i < lines.length; i++) {
      if (lines[i] === this.END_MARKER) {
        endLine = i;
        break;
      }
    }

    if (endLine === -1) {
      // 未找到结束标记
      return {
        id: blockId,
        startLine,
        separatorLine,
        endLine: -1,
        deletedLines: [],
        addedLines: [],
        isValid: false,
        error: "Missing end marker (>>>>>>> Claude's Change)"
      };
    }

    // 提取旧内容和新内容
    const deletedLines = lines.slice(startLine + 1, separatorLine);
    const addedLines = lines.slice(separatorLine + 1, endLine);

    // 移除空行（如果启用了 spacing）
    const cleanDeletedLines = this.removeEmptyLines(deletedLines);
    const cleanAddedLines = this.removeEmptyLines(addedLines);

    return {
      id: blockId,
      startLine,
      separatorLine,
      endLine,
      deletedLines: cleanDeletedLines,
      addedLines: cleanAddedLines,
      isValid: true
    };
  }

  /**
   * 移除首尾空行
   */
  private removeEmptyLines(lines: string[]): string[] {
    // 移除开头的空行
    let start = 0;
    while (start < lines.length && lines[start].trim() === '') {
      start++;
    }

    // 移除末尾的空行
    let end = lines.length - 1;
    while (end >= start && lines[end].trim() === '') {
      end--;
    }

    return lines.slice(start, end + 1);
  }

  /**
   * 提取纯净内容（移除所有 conflict markers）
   *
   * 策略：保留新内容（addedLines），移除旧内容和标记
   */
  private extractCleanContent(
    content: string,
    blocks: ParsedConflictBlock[]
  ): string {
    if (blocks.length === 0) {
      return content;
    }

    const lines = content.split('\n');
    const resultLines: string[] = [];
    let lastLine = 0;

    // 按 startLine 排序
    const sortedBlocks = [...blocks].sort((a, b) => a.startLine - b.startLine);

    for (const block of sortedBlocks) {
      if (!block.isValid) {
        continue;
      }

      // 添加未修改的行
      for (let i = lastLine; i < block.startLine; i++) {
        resultLines.push(lines[i]);
      }

      // 添加新内容（跳过旧内容和标记）
      resultLines.push(...block.addedLines);

      // 更新最后处理的行号
      lastLine = block.endLine + 1;
    }

    // 添加剩余的行
    for (let i = lastLine; i < lines.length; i++) {
      resultLines.push(lines[i]);
    }

    return resultLines.join('\n');
  }

  /**
   * 检查内容是否包含 conflict markers
   */
  public hasMarkers(content: string): boolean {
    const lines = content.split('\n');
    return lines.some(line => this.START_MARKER_REGEX.test(line));
  }

  /**
   * 获取指定 block 的内容
   */
  public getBlock(content: string, blockId: string): ParsedConflictBlock | null {
    const result = this.parse(content);
    return result.blocks.find(b => b.id === blockId) || null;
  }

  /**
   * 统计 conflict markers 数量
   */
  public countMarkers(content: string): number {
    const result = this.parse(content);
    return result.blocks.length;
  }
}

/**
 * 创建 MarkerParser 实例（工厂函数）
 */
export function createMarkerParser(): MarkerParser {
  return new MarkerParser();
}
