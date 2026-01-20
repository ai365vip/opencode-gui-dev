/**
 * PathNormalizer - 路径规范化工具
 *
 * 提供统一的路径规范化方法，确保路径匹配一致性
 */

import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 规范化文件路径（确保路径匹配一致性）
 */
export function normalizePath(filePath: string): string {
    // 1. 替换正斜杠为平台特定分隔符
    let normalized = filePath.split('/').join(path.sep);

    // 2. 如果是相对路径，转换为绝对路径
    if (!path.isAbsolute(normalized)) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            normalized = path.join(workspaceFolder.uri.fsPath, normalized);
        }
    }

    // 3. 解析路径，去除 . 和 .. 等相对路径符号
    normalized = path.resolve(normalized);

    // 4. Windows 下统一大小写（Windows 文件系统不区分大小写）
    if (process.platform === 'win32') {
        normalized = normalized.toLowerCase();
    }

    return normalized;
}
