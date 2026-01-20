/**
 * ConflictCodeLensProvider - Cursor 式 CodeLens 提供者
 *
 * 在每个差异块上方显示"接受/拒绝"按钮
 */

import * as vscode from 'vscode';
import { DiffStateManager } from '../state/DiffStateManager';
import { normalizePath } from '../utils/PathNormalizer';

/**
 * CodeLens 命令配置
 */
export interface CodeLensCommands {
  /** 接受单个 block 的命令 ID */
  acceptCommand: string;

  /** 拒绝单个 block 的命令 ID */
  rejectCommand: string;

  /** 接受所有 blocks 的命令 ID */
  acceptAllCommand?: string;

  /** 拒绝所有 blocks 的命令 ID */
  rejectAllCommand?: string;
}

/**
 * ConflictCodeLensProvider 类
 */
export class ConflictCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private stateManager: DiffStateManager;
  private commands: CodeLensCommands;

  constructor(commands: CodeLensCommands) {
    this.commands = commands;
    this.stateManager = DiffStateManager.getInstance();
  }

  /**
   * 提供 CodeLens（Cursor 式：从 DiffStateManager 读取数据）
   * 按钮显示在修改块下方
   */
  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    // **关键修复**：使用规范化路径，确保与 DiffStateManager 中存储的路径一致
    const filePath = normalizePath(document.uri.fsPath);

    // 从 DiffStateManager 获取该文件的 pending blocks
    const pendingBlocks = this.stateManager.getPendingBlocks(filePath);

    if (pendingBlocks.length === 0) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];

    for (let i = 0; i < pendingBlocks.length; i++) {
      const block = pendingBlocks[i];

      // 在修改块的下方添加 CodeLens（endLine 的下一行）
      const buttonLine = Math.min(block.endLine, document.lineCount - 1);
      if (buttonLine >= document.lineCount) {
        continue;
      }

      const range = new vscode.Range(buttonLine, 0, buttonLine, 0);

      // "接受" 按钮（使用更醒目的图标和文字）
      lenses.push(new vscode.CodeLens(range, {
        title: `✅ $(check) 接受`,
        command: this.commands.acceptCommand,
        arguments: [filePath, block.id],
        tooltip: '✓ 接受此修改并保留新代码'
      }));

      // "拒绝" 按钮（使用更醒目的图标和文字）
      lenses.push(new vscode.CodeLens(range, {
        title: `❌ $(x) 拒绝`,
        command: this.commands.rejectCommand,
        arguments: [filePath, block.id],
        tooltip: '✗ 拒绝此修改并恢复原代码'
      }));

      // 修改计数器（使用图标）
      lenses.push(new vscode.CodeLens(range, {
        title: `📍 ${i + 1}/${pendingBlocks.length}`,
        command: '',
        tooltip: `第 ${i + 1} 个修改，共 ${pendingBlocks.length} 处`
      }));

      // 统计信息（使用直观的图标）
      lenses.push(new vscode.CodeLens(range, {
        title: `📊 -${block.linesDeleted} +${block.linesAdded}`,
        command: '',
        tooltip: `删除 ${block.linesDeleted} 行，新增 ${block.linesAdded} 行`
      }));
    }

    return lenses;
  }

  /**
   * 刷新 CodeLens
   */
  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

/**
 * 创建 ConflictCodeLensProvider 实例（工厂函数）
 */
export function createConflictCodeLensProvider(
  commands: CodeLensCommands
): ConflictCodeLensProvider {
  return new ConflictCodeLensProvider(commands);
}

/**
 * 注册 CodeLens Provider
 */
export function registerCodeLensProvider(
  context: vscode.ExtensionContext,
  provider: ConflictCodeLensProvider
): vscode.Disposable {
  return vscode.languages.registerCodeLensProvider(
    { scheme: 'file' },
    provider
  );
}
