/**
 * DiffNavigationBar - 差异导航栏
 *
 * 在编辑器底部状态栏显示导航和批量操作按钮
 */

import * as vscode from 'vscode';
import { DiffStateManager } from '../state/DiffStateManager';
import { normalizePath } from '../utils/PathNormalizer';
import type { DiffBlock } from '../state/DiffBlock';

/**
 * DiffNavigationBar 类
 */
export class DiffNavigationBar {
  private stateManager: DiffStateManager;
  private disposables: vscode.Disposable[] = [];

  // StatusBar 项目
  private prevButton?: vscode.StatusBarItem;
  private counterItem?: vscode.StatusBarItem;
  private nextButton?: vscode.StatusBarItem;

  // 当前状态
  private currentFileBlocks: DiffBlock[] = [];
  private currentBlockIndex = 0;
  private currentFilePath?: string;

  // 是否显示状态栏
  private showStatusBar: boolean;

  constructor(showStatusBar: boolean = true) {
    this.showStatusBar = showStatusBar;
    this.stateManager = DiffStateManager.getInstance();

    // 只在需要时创建 StatusBar 项目
    if (this.showStatusBar) {
      this.createStatusBarItems();
    }

    // 监听编辑器切换
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          // **关键修复**：使用规范化路径
          this.updateForFile(normalizePath(editor.document.uri.fsPath));
        } else {
          this.hide();
        }
      })
    );

    // 初始更新
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      // **关键修复**：使用规范化路径
      this.updateForFile(normalizePath(activeEditor.document.uri.fsPath));
    }
  }

  /**
   * 创建 StatusBar 项目
   */
  private createStatusBarItems(): void {
    // 1. 上一个修改
    this.prevButton = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1003
    );
    this.prevButton.text = '$(chevron-up)';
    this.prevButton.tooltip = '跳转到上一处修改 (Alt+Up)';
    this.prevButton.command = 'opencode.diffNavigatePrev';

    // 2. 计数器
    this.counterItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1002
    );
    this.counterItem.tooltip = '当前修改位置';

    // 3. 下一个修改
    this.nextButton = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1001
    );
    this.nextButton.text = '$(chevron-down)';
    this.nextButton.tooltip = '跳转到下一处修改 (Alt+Down)';
    this.nextButton.command = 'opencode.diffNavigateNext';

    // 添加到 disposables
    this.disposables.push(
      this.prevButton,
      this.counterItem,
      this.nextButton
    );
  }

  /**
   * 更新指定文件的状态
   * @param filePath 规范化后的文件路径
   */
  public updateForFile(filePath: string): void {
    this.currentFilePath = filePath;
    const pendingBlocks = this.stateManager.getPendingBlocks(filePath);

    if (pendingBlocks.length === 0) {
      this.hide();
      return;
    }

    // 更新当前文件的 blocks
    this.currentFileBlocks = pendingBlocks;

    // 重置索引（如果当前索引超出范围）
    if (this.currentBlockIndex >= pendingBlocks.length) {
      this.currentBlockIndex = 0;
    }

    // 更新 UI
    this.updateUI();
    if (this.showStatusBar) {
      this.show();
    }
  }

  /**
   * 更新 UI 显示
   */
  private updateUI(): void {
    if (!this.showStatusBar) {
      return;
    }

    const total = this.currentFileBlocks.length;
    const current = this.currentBlockIndex + 1;

    // 更新计数器
    if (this.counterItem) {
      this.counterItem.text = `$(diff) ${current} / ${total}`;
      this.counterItem.tooltip = `第 ${current} 处修改，共 ${total} 处`;
    }

    // 更新导航按钮状态
    if (this.prevButton) {
      // 第一个时禁用上一个按钮
      if (this.currentBlockIndex === 0) {
        this.prevButton.text = '$(chevron-up)';
        this.prevButton.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
      } else {
        this.prevButton.text = '$(chevron-up)';
        this.prevButton.color = undefined;
      }
    }

    if (this.nextButton) {
      // 最后一个时禁用下一个按钮
      if (this.currentBlockIndex === total - 1) {
        this.nextButton.text = '下一处 $(chevron-down)';
        this.nextButton.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
      } else {
        this.nextButton.text = '下一处 $(chevron-down)';
        this.nextButton.color = undefined;
      }
    }
  }

  /**
   * 显示导航栏
   */
  private show(): void {
    this.prevButton?.show();
    this.counterItem?.show();
    this.nextButton?.show();
  }

  /**
   * 隐藏导航栏
   */
  private hide(): void {
    this.prevButton?.hide();
    this.counterItem?.hide();
    this.nextButton?.hide();
  }

  /**
   * 跳转到上一处修改
   */
  public navigatePrev(): void {
    if (this.currentFileBlocks.length === 0) {
      return;
    }

    // 循环导航
    this.currentBlockIndex = (this.currentBlockIndex - 1 + this.currentFileBlocks.length) % this.currentFileBlocks.length;
    this.navigateToCurrentBlock();
  }

  /**
   * 跳转到下一处修改
   */
  public navigateNext(): void {
    if (this.currentFileBlocks.length === 0) {
      return;
    }

    // 循环导航
    this.currentBlockIndex = (this.currentBlockIndex + 1) % this.currentFileBlocks.length;
    this.navigateToCurrentBlock();
  }

  /**
   * 跳转到当前 block
   */
  private async navigateToCurrentBlock(): Promise<void> {
    if (!this.currentFilePath || this.currentFileBlocks.length === 0) {
      return;
    }

    const block = this.currentFileBlocks[this.currentBlockIndex];
    if (!block) {
      return;
    }

    try {
      // 打开文件
      const document = await vscode.workspace.openTextDocument(block.filePath);
      const editor = await vscode.window.showTextDocument(document, {
        preserveFocus: false
      });

      // 跳转到修改的起始行
      const startLine = block.separatorLine;
      const endLine = block.endLine;

      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(Math.min(endLine, document.lineCount - 1), 0)
      );

      // 设置选区并滚动到可见区域
      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      // 更新 UI
      this.updateUI();

      // 显示提示
      const current = this.currentBlockIndex + 1;
      const total = this.currentFileBlocks.length;
      vscode.window.setStatusBarMessage(
        `📍 第 ${current} / ${total} 处修改 (第 ${startLine + 1}-${endLine} 行)`,
        3000
      );
    } catch (error) {
      vscode.window.showErrorMessage(`跳转失败: ${error}`);
    }
  }

  /**
   * 获取当前位置信息
   */
  public getCurrentPosition(): { current: number; total: number } | null {
    if (this.currentFileBlocks.length === 0) {
      return null;
    }
    return {
      current: this.currentBlockIndex + 1,
      total: this.currentFileBlocks.length
    };
  }

  /**
   * 刷新导航栏（当 blocks 变化时调用）
   */
  public refresh(): void {
    if (this.currentFilePath) {
      this.updateForFile(this.currentFilePath);
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
