/**
 * DiffQuickPick - 差异管理弹窗
 *
 * 提供一个 QuickPick 界面来查看和管理所有待处理的差异块
 */

import * as vscode from 'vscode';
import { DiffStateManager } from '../state/DiffStateManager';
import type { DiffBlock } from '../state/DiffBlock';

/**
 * QuickPick 项目
 */
interface DiffQuickPickItem extends vscode.QuickPickItem {
  block: DiffBlock;
  index: number;
  // 添加动作标识
  action?: 'accept' | 'reject' | 'view';
}

/**
 * DiffQuickPick 类
 */
export class DiffQuickPick {
  private stateManager: DiffStateManager;
  private quickPick?: vscode.QuickPick<DiffQuickPickItem>;
  private currentFilePath?: string;

  constructor() {
    this.stateManager = DiffStateManager.getInstance();
  }

  /**
   * 显示差异管理弹窗
   */
  public async show(filePath: string): Promise<void> {
    this.currentFilePath = filePath;
    const pendingBlocks = this.stateManager.getPendingBlocks(filePath);

    if (pendingBlocks.length === 0) {
      vscode.window.showInformationMessage('当前文件没有待处理的修改');
      return;
    }

    // 创建 QuickPick
    this.quickPick = vscode.window.createQuickPick<DiffQuickPickItem>();
    this.quickPick.title = `文件修改管理 - ${this.getFileName(filePath)} (${pendingBlocks.length} 处修改)`;
    this.quickPick.placeholder = '↑↓ 选择修改并查看 | Enter 跳转 | Ctrl+A 接受当前 | Ctrl+R 拒绝当前';
    this.quickPick.canSelectMany = false;
    this.quickPick.matchOnDescription = true;
    this.quickPick.matchOnDetail = true;

    // 设置按钮
    this.quickPick.buttons = [
      {
        iconPath: new vscode.ThemeIcon('check-all'),
        tooltip: '接受所有修改 (Alt+A)'
      },
      {
        iconPath: new vscode.ThemeIcon('close-all'),
        tooltip: '拒绝所有修改 (Alt+R)'
      },
      {
        iconPath: new vscode.ThemeIcon('refresh'),
        tooltip: '刷新列表 (F5)'
      }
    ];

    // 设置项目列表
    this.updateItems();

    // 监听选择变化（用于预览，不是确认选择）
    this.quickPick.onDidChangeActive(items => {
      if (items.length > 0 && items[0].action === 'view') {
        this.previewBlock(items[0]);
      }
    });

    // 监听确认选择（Enter 键）
    this.quickPick.onDidAccept(() => {
      const item = this.quickPick?.activeItems[0];
      if (item) {
        if (item.action === 'accept') {
          this.handleAccept(item);
        } else if (item.action === 'reject') {
          this.handleReject(item);
        } else {
          // 默认动作：跳转到修改位置
          this.handleSelection(item);
        }
      }
    });

    // 监听按钮点击
    this.quickPick.onDidTriggerButton(button => {
      this.handleButtonClick(button, filePath);
    });

    // 监听隐藏事件
    this.quickPick.onDidHide(() => {
      this.quickPick?.dispose();
      this.quickPick = undefined;
    });

    // 显示
    this.quickPick.show();
  }

  /**
   * 更新项目列表
   */
  private updateItems(): void {
    if (!this.quickPick || !this.currentFilePath) {
      return;
    }

    const pendingBlocks = this.stateManager.getPendingBlocks(this.currentFilePath);
    const items: DiffQuickPickItem[] = [];

    // 为每个修改创建三个项目：查看、接受、拒绝
    for (let i = 0; i < pendingBlocks.length; i++) {
      const block = pendingBlocks[i];
      const lineRange = `第 ${block.separatorLine + 1}-${block.endLine} 行`;
      const stats = `-${block.linesDeleted} +${block.linesAdded}`;
      const preview = this.getContentPreview(block.currentContent);

      // 主项目：查看修改
      items.push({
        block,
        index: i,
        action: 'view',
        label: `$(diff) 修改 ${i + 1}`,
        description: `${lineRange} · ${stats}`,
        detail: `📄 ${preview}`
      });

      // 子项目：接受
      items.push({
        block,
        index: i,
        action: 'accept',
        label: `  $(check) 接受 ${i + 1}`,
        description: '',
        detail: '接受此修改并保留新内容'
      });

      // 子项目：拒绝
      items.push({
        block,
        index: i,
        action: 'reject',
        label: `  $(close) 拒绝 ${i + 1}`,
        description: '',
        detail: '拒绝此修改并恢复原内容'
      });

      // 添加分隔符（除了最后一个）
      if (i < pendingBlocks.length - 1) {
        items.push({
          block,
          index: i,
          label: '─'.repeat(50),
          description: '',
          detail: '',
          alwaysShow: false
        } as any);
      }
    }

    this.quickPick.items = items;
  }

  /**
   * 获取内容预览（前两行）
   */
  private getContentPreview(content: string): string {
    const lines = content.split('\n');
    if (lines.length <= 2) {
      return lines.join(' ');
    }
    return `${lines[0]} ... ${lines[lines.length - 1]}`;
  }

  /**
   * 预览修改块（不关闭弹窗）
   */
  private async previewBlock(item: DiffQuickPickItem): Promise<void> {
    const { block } = item;

    try {
      // 打开文件
      const document = await vscode.workspace.openTextDocument(block.filePath);
      const editor = await vscode.window.showTextDocument(document, {
        preview: true,
        preserveFocus: true // 保持焦点在 QuickPick 上
      });

      // 跳转到修改的起始行
      const startLine = block.separatorLine;
      const endLine = block.endLine;

      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, 0)
      );

      // 设置选区并滚动到可见区域
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      // 忽略错误，避免中断 QuickPick
    }
  }

  /**
   * 处理选择事件（跳转到对应行并关闭弹窗）
   */
  private async handleSelection(item: DiffQuickPickItem): Promise<void> {
    const { block } = item;

    // 打开文件
    const document = await vscode.workspace.openTextDocument(block.filePath);
    const editor = await vscode.window.showTextDocument(document);

    // 跳转到修改的起始行
    const startLine = block.separatorLine;
    const endLine = block.endLine;

    const range = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, 0)
    );

    // 设置选区并滚动到可见区域
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    // 关闭 QuickPick
    this.quickPick?.hide();
  }

  /**
   * 处理接受操作
   */
  private async handleAccept(item: DiffQuickPickItem): Promise<void> {
    const { block } = item;

    await vscode.commands.executeCommand('opencode.acceptDiffBlock', block.filePath, block.id);

    // 刷新列表
    const pendingBlocks = this.stateManager.getPendingBlocks(block.filePath);
    if (pendingBlocks.length === 0) {
      this.quickPick?.hide();
      vscode.window.showInformationMessage('✅ 所有修改已处理完成');
    } else {
      this.updateItems();
      this.quickPick!.title = `文件修改管理 - ${this.getFileName(block.filePath)} (${pendingBlocks.length} 处修改)`;
    }
  }

  /**
   * 处理拒绝操作
   */
  private async handleReject(item: DiffQuickPickItem): Promise<void> {
    const { block } = item;

    await vscode.commands.executeCommand('opencode.rejectDiffBlock', block.filePath, block.id);

    // 刷新列表
    const pendingBlocks = this.stateManager.getPendingBlocks(block.filePath);
    if (pendingBlocks.length === 0) {
      this.quickPick?.hide();
      vscode.window.showInformationMessage('✅ 所有修改已处理完成');
    } else {
      this.updateItems();
      this.quickPick!.title = `文件修改管理 - ${this.getFileName(block.filePath)} (${pendingBlocks.length} 处修改)`;
    }
  }

  /**
   * 处理按钮点击
   */
  private async handleButtonClick(
    button: vscode.QuickInputButton,
    filePath: string
  ): Promise<void> {
    const tooltip = button.tooltip || '';

    if (tooltip.includes('接受所有')) {
      // 接受所有修改
      const confirmed = await vscode.window.showWarningMessage(
        '确定要接受所有修改吗？',
        { modal: true },
        '确定'
      );

      if (confirmed) {
        await vscode.commands.executeCommand('opencode.acceptAllDiffs', filePath);
        this.quickPick?.hide();
        vscode.window.showInformationMessage('✅ 已接受所有修改');
      }
    } else if (tooltip.includes('拒绝所有')) {
      // 拒绝所有修改
      const confirmed = await vscode.window.showWarningMessage(
        '确定要拒绝所有修改并恢复原内容吗？',
        { modal: true },
        '确定'
      );

      if (confirmed) {
        await vscode.commands.executeCommand('opencode.rejectAllDiffs', filePath);
        this.quickPick?.hide();
        vscode.window.showInformationMessage('❌ 已拒绝所有修改');
      }
    } else if (tooltip.includes('刷新')) {
      // 刷新列表
      this.updateItems();
      const pendingBlocks = this.stateManager.getPendingBlocks(filePath);
      this.quickPick!.title = `文件修改管理 - ${this.getFileName(filePath)} (${pendingBlocks.length} 处修改)`;
    }
  }

  /**
   * 获取文件名（不含路径）
   */
  private getFileName(filePath: string): string {
    return filePath.substring(filePath.lastIndexOf('\\') + 1);
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.quickPick?.dispose();
    this.quickPick = undefined;
  }
}

/**
 * 创建并显示差异管理弹窗
 */
export async function showDiffQuickPick(filePath: string): Promise<void> {
  const quickPick = new DiffQuickPick();
  await quickPick.show(filePath);
}
