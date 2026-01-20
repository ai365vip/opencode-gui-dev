/**
 * DecorationManager - 装饰器管理器
 *
 * 管理 Cursor 式差异对比的红绿高亮装饰(虚拟显示,不修改文件)
 */

import * as vscode from 'vscode';
import { DiffStateManager } from '../state/DiffStateManager';
import { normalizePath } from '../utils/PathNormalizer';

/**
 * 装饰器颜色配置
 */
export interface DecorationColors {
  /** 删除的行(红色背景) */
  deleted: string;

  /** 新增的行(绿色背景) */
  added: string;

  /** Marker 行(灰色背景) */
  marker: string;

  /** 分隔符行(灰色背景) */
  separator: string;
}

/**
 * DecorationManager 类
 */
export class DecorationManager {
  // 装饰器类型
  private markerDecoration: vscode.TextEditorDecorationType;
  private deletedDecoration: vscode.TextEditorDecorationType;
  private separatorDecoration: vscode.TextEditorDecorationType;
  private addedDecoration: vscode.TextEditorDecorationType;

  private stateManager: DiffStateManager;
  private disposables: vscode.Disposable[] = [];

  constructor(colors?: Partial<DecorationColors>) {
    this.stateManager = DiffStateManager.getInstance();

    const defaultColors: DecorationColors = {
      deleted: 'rgba(200, 120, 120, 0.12)',
      added: 'rgba(120, 180, 120, 0.12)',
      marker: 'rgba(128, 128, 128, 0.15)',
      separator: 'rgba(128, 128, 128, 0.15)',
      ...colors
    };

    // 创建装饰器类型 - 添加滚动条和 minimap 标记
    this.markerDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.marker,
      isWholeLine: true,
      overviewRulerColor: 'rgba(128, 128, 128, 0.4)',
      overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    this.deletedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.deleted,
      isWholeLine: true,
      before: {
        contentText: '-',
        color: 'rgba(180, 100, 100, 0.7)',
        margin: '0 10px 0 0',
        fontWeight: 'bold'
      },
      overviewRulerColor: 'rgba(200, 120, 120, 0.5)',
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.separatorDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.separator,
      isWholeLine: true,
      overviewRulerColor: 'rgba(128, 128, 128, 0.4)',
      overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    this.addedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.added,
      isWholeLine: true,
      before: {
        contentText: '+',
        color: 'rgba(100, 150, 100, 0.7)',
        margin: '0 10px 0 0',
        fontWeight: 'bold'
      },
      overviewRulerColor: 'rgba(120, 180, 120, 0.5)',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    // 监听编辑器切换
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.updateDecorations(editor);
        }
      })
    );

    // 监听文档变化
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          // 延迟更新,避免频繁刷新
          setTimeout(() => {
            this.updateDecorations(editor);
          }, 100);
        }
      })
    );

    // 初始更新
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.updateDecorations(activeEditor);
    }
  }

  /**
   * 更新编辑器的装饰(Cursor 式:从 DiffStateManager 读取数据)
   * 显示红色的旧内容 + 绿色的新内容
   */
  public updateDecorations(editor: vscode.TextEditor): void {
    // **关键修复**：使用规范化路径，确保与 DiffStateManager 中存储的路径一致
    const filePath = normalizePath(editor.document.uri.fsPath);

    // 从 DiffStateManager 获取该文件的 pending blocks
    const pendingBlocks = this.stateManager.getPendingBlocks(filePath);

    if (pendingBlocks.length === 0) {
      // 没有 pending blocks,清除所有装饰
      this.clearDecorations(editor);
      return;
    }

    const addedRanges: vscode.DecorationOptions[] = [];
    const deletedRanges: vscode.DecorationOptions[] = [];

    for (const block of pendingBlocks) {
      // 旧内容(红色)- 即使是空字符串也要显示（修复新文件不显示装饰的问题）
      if (block.baseContent !== undefined && block.separatorLine < editor.document.lineCount) {
        const baseLines = block.baseContent.split('\n');

        // 如果有删除的行，显示删除提示
        if (baseLines.length > 0 && baseLines[0] !== '') {
          // 直接显示简洁的删除行数提示(VSCode 装饰器不支持真正的多行虚拟文本)
          const displayText = `🗑️ 已删除 ${baseLines.length} 行 (hover 查看详情) `;

          // hover 显示完整的对比信息，使用 diff 语法高亮
          const hoverMessage = new vscode.MarkdownString();
          hoverMessage.supportHtml = false;  // 不需要 HTML 支持
          hoverMessage.isTrusted = true;

          // 标题
          hoverMessage.appendMarkdown('---\n\n');
          // 统计信息
          const newContentLines = block.currentContent.split('\n');
          hoverMessage.appendMarkdown(`**删除**: ${baseLines.length} 行 | **新增**: ${newContentLines.length} 行\n\n`);


          // 构建 diff 格式的内容
          const diffContent: string[] = [];

          // 添加删除的行（前缀 - ）
          baseLines.forEach(line => {
            diffContent.push(`- ${line}`);
          });

          // 添加新增的行（前缀 + ）
          newContentLines.forEach(line => {
            diffContent.push(`+ ${line}`);
          });

          // 使用 diff 语法高亮
          hoverMessage.appendCodeblock(diffContent.join('\n'), 'diff');

          // 底部提示
          hoverMessage.appendMarkdown('\n---\n\n');

          deletedRanges.push({
            range: new vscode.Range(block.separatorLine, 0, block.separatorLine, 0),
            renderOptions: {
              before: {
                contentText: displayText,
                color: 'rgba(180, 100, 100, 0.8)',
                backgroundColor: 'rgba(200, 120, 120, 0.12)',
                fontStyle: 'normal',
                textDecoration: 'none; white-space: pre;'
              }
            },
            hoverMessage
          });
        } else if (baseLines.length === 1 && baseLines[0] === '') {
          // 新文件（baseContent 是空字符串），显示"新增文件"提示
          const displayText = `📄 新文件 `;
          const hoverMessage = new vscode.MarkdownString('**新增文件** - 这是一个由 AI 创建的新文件');

          deletedRanges.push({
            range: new vscode.Range(block.separatorLine, 0, block.separatorLine, 0),
            renderOptions: {
              before: {
                contentText: displayText,
                color: 'rgba(100, 150, 100, 0.8)',
                backgroundColor: 'rgba(120, 180, 120, 0.12)',
                fontStyle: 'normal',
                textDecoration: 'none; white-space: pre;'
              }
            },
            hoverMessage
          });
        }
      }

      // 新内容(绿色)- block.separatorLine 到 block.endLine
      for (let i = block.separatorLine; i < block.endLine; i++) {
        if (i < editor.document.lineCount) {
          const range = this.createRange(editor.document, i);
          addedRanges.push({
            range,
            renderOptions: {
              before: {
                contentText: '+ ',
                color: 'rgba(100, 150, 100, 0.8)',
                margin: '0 5px 0 0'
              }
            }
          });
        }
      }
    }

    // 应用装饰
    editor.setDecorations(this.markerDecoration, []);
    editor.setDecorations(this.deletedDecoration, deletedRanges);
    editor.setDecorations(this.separatorDecoration, []);
    editor.setDecorations(this.addedDecoration, addedRanges);
  }

  /**
   * 清除编辑器的所有装饰
   */
  public clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.markerDecoration, []);
    editor.setDecorations(this.deletedDecoration, []);
    editor.setDecorations(this.separatorDecoration, []);
    editor.setDecorations(this.addedDecoration, []);
  }

  /**
   * 创建行的 Range
   */
  private createRange(document: vscode.TextDocument, lineNumber: number): vscode.Range {
    const line = document.lineAt(lineNumber);
    return new vscode.Range(lineNumber, 0, lineNumber, line.text.length);
  }

  /**
   * 刷新所有打开的编辑器
   */
  public refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  /**
   * 更新颜色配置
   */
  public updateColors(colors: Partial<DecorationColors>): void {
    // 释放旧的装饰器
    this.markerDecoration.dispose();
    this.deletedDecoration.dispose();
    this.separatorDecoration.dispose();
    this.addedDecoration.dispose();

    // 创建新的装饰器
    const defaultColors: DecorationColors = {
      deleted: 'rgba(200, 120, 120, 0.12)',
      added: 'rgba(120, 180, 120, 0.12)',
      marker: 'rgba(128, 128, 128, 0.15)',
      separator: 'rgba(128, 128, 128, 0.15)',
      ...colors
    };

    this.markerDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.marker,
      isWholeLine: true,
      overviewRulerColor: 'rgba(128, 128, 128, 0.4)',
      overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    this.deletedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.deleted,
      isWholeLine: true,
      before: {
        contentText: '-',
        color: 'rgba(224, 70, 70, 0.8)',
        margin: '0 10px 0 0',
        fontWeight: 'bold'
      },
      overviewRulerColor: 'rgba(255, 0, 0, 0.6)',
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.separatorDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.separator,
      isWholeLine: true,
      overviewRulerColor: 'rgba(128, 128, 128, 0.4)',
      overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    this.addedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: defaultColors.added,
      isWholeLine: true,
      before: {
        contentText: '+',
        color: 'rgba(57, 170, 57, 0.8)',
        margin: '0 10px 0 0',
        fontWeight: 'bold'
      },
      overviewRulerColor: 'rgba(0, 255, 0, 0.6)',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    // 刷新所有编辑器
    this.refreshAll();
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.markerDecoration.dispose();
    this.deletedDecoration.dispose();
    this.separatorDecoration.dispose();
    this.addedDecoration.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * 创建 DecorationManager 实例(工厂函数)
 */
export function createDecorationManager(
  colors?: Partial<DecorationColors>
): DecorationManager {
  return new DecorationManager(colors);
}
