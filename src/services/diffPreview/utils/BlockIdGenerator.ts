/**
 * BlockIdGenerator - Block ID 生成器
 *
 * 生成稳定且唯一的 Block ID，格式：block-{fileHash}-L{行号}-T{时间戳}
 */

import { createHash } from 'crypto';

/**
 * 生成 Block ID
 *
 * @param filePath - 文件路径（绝对路径）
 * @param startLine - 起始行号
 * @returns Block ID，格式：block-a1b2c3d4-L15-T1700123456789
 */
export function generateBlockId(filePath: string, startLine: number): string {
  const fileHash = hashFilePath(filePath);
  const timestamp = Date.now();
  return `block-${fileHash}-L${startLine}-T${timestamp}`;
}

/**
 * 计算文件路径的哈希（取前 8 位）
 */
function hashFilePath(filePath: string): string {
  // 规范化路径（Windows 路径转换为正斜杠）
  const normalizedPath = filePath.replace(/\\/g, '/');

  return createHash('md5')
    .update(normalizedPath)
    .digest('hex')
    .slice(0, 8);
}

/**
 * 从 Block ID 中解析信息
 */
export function parseBlockId(blockId: string): {
  fileHash: string;
  startLine: number;
  timestamp: number;
} | null {
  // 格式：block-{fileHash}-L{行号}-T{时间戳}
  const match = blockId.match(/^block-([a-f0-9]{8})-L(\d+)-T(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    fileHash: match[1],
    startLine: parseInt(match[2], 10),
    timestamp: parseInt(match[3], 10)
  };
}

/**
 * 验证 Block ID 格式是否正确
 */
export function isValidBlockId(blockId: string): boolean {
  return /^block-[a-f0-9]{8}-L\d+-T\d+$/.test(blockId);
}

/**
 * 检查两个 Block ID 是否来自同一文件
 */
export function isSameFile(blockId1: string, blockId2: string): boolean {
  const info1 = parseBlockId(blockId1);
  const info2 = parseBlockId(blockId2);

  if (!info1 || !info2) {
    return false;
  }

  return info1.fileHash === info2.fileHash;
}

/**
 * 检查两个 Block ID 是否在同一位置（同一文件的同一行）
 */
export function isSamePosition(blockId1: string, blockId2: string): boolean {
  const info1 = parseBlockId(blockId1);
  const info2 = parseBlockId(blockId2);

  if (!info1 || !info2) {
    return false;
  }

  return info1.fileHash === info2.fileHash && info1.startLine === info2.startLine;
}
