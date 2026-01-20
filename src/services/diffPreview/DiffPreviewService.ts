/**
 * DiffPreviewService - 差异预览核心服务
 *
 * 整合所有 diff preview 模块，提供统一的服务接口
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IWebViewService } from '../webViewService';
import type { DiffPreviewPendingFilesMessage } from '../../shared/messages';
import { normalizePath } from './utils/PathNormalizer';

// 导入所有子模块
import { DiffStateManager } from './state/DiffStateManager';
import { DiffCalculator } from './diff/DiffCalculator';
import { MarkerInserter } from './marker/MarkerInserter';
import { MarkerParser } from './marker/MarkerParser';
import { MarkerValidator } from './marker/MarkerValidator';
import { DecorationManager } from './ui/DecorationManager';
import { ConflictCodeLensProvider } from './ui/ConflictCodeLensProvider';
import { showDiffQuickPick } from './ui/DiffQuickPick';
import { DiffNavigationBar } from './ui/DiffNavigationBar';

import type { DiffBlock } from './state/DiffBlock';
import type { WorkMode } from '../../shared/messages';

export const IDiffPreviewService = createDecorator<IDiffPreviewService>('diffPreviewService');

export interface IDiffPreviewService {
    readonly _serviceBrand: undefined;

    /**
     * 标记文件即将被 AI 工具修改
     */
    markFileForToolModification(filePath: string, channelId: string): Promise<void>;

    /**
     * 设置 WorkMode 提供者
     */
    setWorkModeProvider(provider: (channelId: string) => WorkMode | null): void;

    /**
     * 接受单个差异块
     */
    acceptBlock(filePath: string, blockId: string): Promise<void>;

    /**
     * 拒绝单个差异块
     */
    rejectBlock(filePath: string, blockId: string): Promise<void>;

    /**
     * 接受文件的所有差异块
     */
    acceptAllBlocks(filePath: string): Promise<void>;

    /**
     * 拒绝文件的所有差异块
     */
    rejectAllBlocks(filePath: string): Promise<void>;

    /**
     * 自动接受所有待处理差异块
     * - 用于“自动接受编辑”场景下，避免出现待确认 diff
     */
    acceptAllPendingBlocks(): Promise<void>;

    /**
     * 释放资源
     */
    dispose(): void;
}

/**
 * DiffPreviewService 实现
 */
export class DiffPreviewService implements IDiffPreviewService {
    readonly _serviceBrand: undefined;

    // 核心模块
    private stateManager: DiffStateManager;
    private diffCalculator: DiffCalculator;
    private markerInserter: MarkerInserter;
    private markerParser: MarkerParser;
    private markerValidator: MarkerValidator;
    private decorationManager: DecorationManager;
    private codeLensProvider: ConflictCodeLensProvider;
    private navigationBar: DiffNavigationBar;

    // 内部状态
    private disposables: vscode.Disposable[] = [];
    private documentContentCache = new Map<string, string>();
    private isApplyingChange = false;  // 防止循环触发
    private currentDiffIndex = 0;  // 当前导航到的 diff 索引

    // 文件标记（文件路径 -> channelId）
    private pendingToolModifications = new Map<string, string>();
    private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // 路径映射（规范化路径 -> 原始路径）用于显示
    private originalPathMap = new Map<string, string>();

    // WorkMode 提供者
    private workModeProvider?: (channelId: string) => WorkMode | null;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IWebViewService private readonly webViewService: IWebViewService
    ) {
        this.logService.info('[DiffPreviewService] 初始化差异预览服务');

        // 初始化核心模块
        this.stateManager = DiffStateManager.getInstance();
        this.diffCalculator = new DiffCalculator();
        this.markerInserter = new MarkerInserter();
        this.markerParser = new MarkerParser();
        this.markerValidator = new MarkerValidator();

        // 初始化 UI 模块
        this.decorationManager = new DecorationManager();

        this.codeLensProvider = new ConflictCodeLensProvider({
            acceptCommand: 'opencode.acceptDiffBlock',
            rejectCommand: 'opencode.rejectDiffBlock',
            acceptAllCommand: 'opencode.acceptAllDiffs',
            rejectAllCommand: 'opencode.rejectAllDiffs'
        });

        // 初始化导航栏（启用状态栏显示位置信息）
        this.navigationBar = new DiffNavigationBar(true);

        // 注册 CodeLens Provider
        this.disposables.push(
            vscode.languages.registerCodeLensProvider(
                { scheme: 'file' },
                this.codeLensProvider
            )
        );

        // 注册命令
        this.registerCommands();

        // 启动文件监听
        this.startMonitoringFileChanges();

        // 监听活动编辑器变化，更新按钮显示状态和 CodeLens
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.updateButtonVisibility(editor);
                // 关键修复：切换编辑器时刷新 CodeLens，确保接受/拒绝按钮显示
                this.codeLensProvider.refresh();
            })
        );

        // 初始更新按钮状态
        this.updateButtonVisibility(vscode.window.activeTextEditor);

        this.logService.info('[DiffPreviewService] 初始化完成');
    }

    /**
     * 更新按钮显示状态
     */
    private updateButtonVisibility(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.commands.executeCommand('setContext', 'opencode.hasPendingDiffs', false);
            vscode.commands.executeCommand('setContext', 'opencode.hasMultipleDiffs', false);
            return;
        }

        // **关键修复**：使用规范化路径，确保与 DiffStateManager 中存储的路径一致
        const filePath = normalizePath(editor.document.uri.fsPath);
        const pendingBlocks = this.stateManager.getPendingBlocks(filePath);
        const hasPendingDiffs = pendingBlocks.length > 0;
        const hasMultipleDiffs = pendingBlocks.length > 1;

        vscode.commands.executeCommand('setContext', 'opencode.hasPendingDiffs', hasPendingDiffs);
        vscode.commands.executeCommand('setContext', 'opencode.hasMultipleDiffs', hasMultipleDiffs);
        this.logService.info(`[DiffPreviewService] 更新按钮状态: ${filePath} - ${pendingBlocks.length} 处修改`);
    }

    /**
     * 设置 WorkMode 提供者
     */
    public setWorkModeProvider(provider: (channelId: string) => WorkMode | null): void {
        this.workModeProvider = provider;
        this.logService.info('[DiffPreviewService] WorkMode 提供者已设置');
    }

    /**
     * 获取指定 channel 的工作模式
     */
    private getChannelWorkMode(channelId: string): WorkMode | null {
        return this.workModeProvider ? this.workModeProvider(channelId) : null;
    }

    /**
     * 标记文件即将被工具修改
     */
    public async markFileForToolModification(filePath: string, channelId: string): Promise<void> {
        // 规范化路径
        const normalizedPath = normalizePath(filePath);

        this.logService.info(`[DiffPreviewService] 标记文件将被修改:`);
        this.logService.info(`[DiffPreviewService] - 原始路径: ${filePath}`);
        this.logService.info(`[DiffPreviewService] - 规范化路径: ${normalizedPath}`);
        this.logService.info(`[DiffPreviewService] - channelId: ${channelId}`);

        this.pendingToolModifications.set(normalizedPath, channelId);

        // 保存原始路径映射，用于界面显示
        this.originalPathMap.set(normalizedPath, filePath);

        // **关键修复**: 立即缓存文件的当前内容（即使文件未打开也会从磁盘读取）
        await this.cacheFileContentIfOpen(normalizedPath);

        // 清除旧的超时定时器
        const oldTimer = this.cleanupTimers.get(normalizedPath);
        if (oldTimer) {
            clearTimeout(oldTimer);
        }

        // 设置超时清理（30秒）
        const timer = setTimeout(() => {
            this.pendingToolModifications.delete(normalizedPath);
            this.cleanupTimers.delete(normalizedPath);
            this.logService.warn(`[DiffPreviewService] ⏰ 自动清除标记（30秒超时）: ${normalizedPath}`);
            this.logService.warn(`[DiffPreviewService] ⚠️ 这可能意味着文件修改事件未被捕获，请检查路径匹配`);
        }, 30000);

        this.cleanupTimers.set(normalizedPath, timer);

        // 输出当前所有已标记的文件
        this.logService.info(`[DiffPreviewService] 📋 当前已标记的文件列表 (${this.pendingToolModifications.size} 个):`);
        for (const [path, chId] of this.pendingToolModifications.entries()) {
            this.logService.info(`[DiffPreviewService]   - ${path} (channel: ${chId})`);
        }
    }

    /**
     * 缓存文件内容（优先从已打开的编辑器，否则从磁盘读取）
     */
    private async cacheFileContentIfOpen(normalizedPath: string): Promise<void> {
        try {
            // 先尝试从已打开的文档缓存
            const doc = vscode.workspace.textDocuments.find(d => {
                const docNormalizedPath = normalizePath(d.uri.fsPath);
                return docNormalizedPath === normalizedPath;
            });

            if (doc) {
                // 文件已在编辑器中打开
                if (!this.documentContentCache.has(normalizedPath)) {
                    this.documentContentCache.set(normalizedPath, doc.getText());
                    this.logService.info(`[DiffPreviewService] ✅ 已从编辑器缓存文件内容: ${normalizedPath}`);
                } else {
                    this.logService.info(`[DiffPreviewService] ✅ 文件内容已存在缓存: ${normalizedPath}`);
                }
            } else {
                // 文件未打开，主动从磁盘读取
                try {
                    const uri = vscode.Uri.file(normalizedPath);
                    const content = await vscode.workspace.fs.readFile(uri);
                    const text = Buffer.from(content).toString('utf8');
                    this.documentContentCache.set(normalizedPath, text);
                    this.logService.info(`[DiffPreviewService] ✅ 已从磁盘缓存文件内容: ${normalizedPath}`);
                } catch (error) {
                    // 文件不存在（新文件），使用空字符串
                    this.documentContentCache.set(normalizedPath, '');
                    this.logService.info(`[DiffPreviewService] ✅ 新文件，使用空内容作为基准: ${normalizedPath}`);
                }
            }
        } catch (error) {
            this.logService.warn(`[DiffPreviewService] ❌ 缓存文件内容失败: ${normalizedPath}`, error);
            // 失败时使用空字符串作为 fallback
            this.documentContentCache.set(normalizedPath, '');
        }
    }


    /**
     * 开始监听文件变化
     */
    private startMonitoringFileChanges(): void {
        this.logService.info('[DiffPreviewService] 启动文件监听');

        // 缓存所有打开文档的内容（使用规范化路径）
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.uri.scheme === 'file') {
                const normalizedPath = normalizePath(doc.uri.fsPath);
                this.documentContentCache.set(normalizedPath, doc.getText());
                this.logService.info(`[DiffPreviewService] 缓存初始文档: ${normalizedPath}`);
            }
        });

        // 监听文档变化（已打开的文件）
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async event => {
                if (this.isApplyingChange) {
                    // 正在应用变更，跳过处理
                    return;
                }

                const doc = event.document;
                if (doc.uri.scheme !== 'file') {
                    return;
                }

                // **关键**: 使用相同的路径规范化方法
                const filePath = normalizePath(doc.uri.fsPath);

                const oldContent = this.documentContentCache.get(filePath);
                const newContent = doc.getText();
                const markedChannelId = this.pendingToolModifications.get(filePath);

                // 添加详细日志用于调试
                this.logService.info(`[DiffPreviewService] 文档变化: ${filePath}`);
                this.logService.info(`[DiffPreviewService] - 是否有标记: ${markedChannelId ? 'Yes (channelId: ' + markedChannelId + ')' : 'No'}`);
                this.logService.info(`[DiffPreviewService] - 是否有缓存: ${oldContent !== undefined ? 'Yes' : 'No'}`);

                if (markedChannelId) {
                    // 文件被标记为即将被工具修改
                    // 如果没有缓存的旧内容，使用空字符串（表示新文件）
                    const baseContent = oldContent || '';

                    this.logService.info(`[DiffPreviewService] 检测到工具修改，开始处理 diff`);
                    await this.handleToolModification(filePath, baseContent, newContent, markedChannelId);

                    // 清除标记
                    this.pendingToolModifications.delete(filePath);
                    const timer = this.cleanupTimers.get(filePath);
                    if (timer) {
                        clearTimeout(timer);
                        this.cleanupTimers.delete(filePath);
                    }
                } else {
                    // 用户手动修改，更新缓存
                    this.documentContentCache.set(filePath, newContent);
                }
            })
        );

        // 监听文件系统变化（未打开的文件，关键修复！）
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');

        this.disposables.push(watcher);

        this.disposables.push(
            watcher.onDidChange(async uri => {
                if (this.isApplyingChange) {
                    return;
                }

                const filePath = normalizePath(uri.fsPath);
                const markedChannelId = this.pendingToolModifications.get(filePath);

                this.logService.info(`[DiffPreviewService] 文件系统变化: ${filePath}`);
                this.logService.info(`[DiffPreviewService] - 是否有标记: ${markedChannelId ? 'Yes (channelId: ' + markedChannelId + ')' : 'No'}`);

                if (markedChannelId) {
                    // 文件被 AI 工具修改，但文件可能未打开
                    // 读取文件内容
                    try {
                        const newContent = await vscode.workspace.fs.readFile(uri);
                        const newText = Buffer.from(newContent).toString('utf8');
                        const oldContent = this.documentContentCache.get(filePath) || '';

                        this.logService.info(`[DiffPreviewService] 检测到工具修改（文件系统），开始处理 diff`);
                        await this.handleToolModification(filePath, oldContent, newText, markedChannelId);

                        // 清除标记
                        this.pendingToolModifications.delete(filePath);
                        const timer = this.cleanupTimers.get(filePath);
                        if (timer) {
                            clearTimeout(timer);
                            this.cleanupTimers.delete(filePath);
                        }
                    } catch (error) {
                        this.logService.error(`[DiffPreviewService] 读取文件失败: ${filePath}`, error);
                    }
                }
            })
        );

        this.logService.info('[DiffPreviewService] 文件监听已启动（包括文件系统监听）');
    }

    /**
     * 处理工具修改（Cursor 方式：文件保持新内容，纯装饰器显示）
     */
    private async handleToolModification(
        filePath: string,
        oldContent: string,
        newContent: string,
        channelId: string
    ): Promise<void> {
        const workMode = this.getChannelWorkMode(channelId);

        this.logService.info(`[DiffPreviewService] 处理工具修改: ${filePath} (workMode: ${workMode})`);

        if (workMode === 'agent') {
            // Agent 模式：直接应用修改
            this.logService.info('[DiffPreviewService] Agent 模式，直接应用修改');
            this.documentContentCache.set(filePath, newContent);
            return;
        }

        // Default 模式：文件保持新内容，用装饰器显示对比
        this.logService.info('[DiffPreviewService] Default 模式，显示差异预览');

        // 获取或创建 FileState
        const fileState = this.stateManager.getFileState(filePath, oldContent);

        // 计算 diff（old vs new）
        const diffResult = this.diffCalculator.calculate(oldContent, newContent);

        if (diffResult.blocks.length === 0) {
            this.logService.info('[DiffPreviewService] 无差异，跳过');
            this.documentContentCache.set(filePath, newContent);
            return;
        }

        // 把同一次 AI 修改的所有 diff blocks 合并成一个 DiffBlock
        // 这样就只有一组接受/拒绝按钮
        const firstBlockStart = diffResult.blocks[0].startLine;
        const lastBlock = diffResult.blocks[diffResult.blocks.length - 1];
        const lastBlockEnd = lastBlock.endLine;

        // 计算总的删除和新增行数
        let totalDeletedLines = 0;
        let totalAddedLines = 0;
        for (const blockData of diffResult.blocks) {
            totalDeletedLines += blockData.deletedLines.length;
            totalAddedLines += blockData.addedLines.length;
        }

        // 收集从第一个修改到最后一个修改之间的所有旧内容
        const oldLines = oldContent.split('\n');
        const allDeletedLines: string[] = [];
        for (let i = firstBlockStart; i < lastBlockEnd; i++) {
            allDeletedLines.push(oldLines[i] || '');
        }

        // 在新内容中，从 firstBlockStart 开始，长度为 (原长度 - 删除 + 新增)
        const newLines = newContent.split('\n');
        const newRegionLength = (lastBlockEnd - firstBlockStart) - totalDeletedLines + totalAddedLines;
        const allAddedLines: string[] = [];
        for (let i = firstBlockStart; i < firstBlockStart + newRegionLength; i++) {
            allAddedLines.push(newLines[i] || '');
        }

        // 在新内容中的位置
        const separatorLine = firstBlockStart;
        const endLine = separatorLine + allAddedLines.length;

        // 获取原始路径用于显示（如果没有映射，则使用规范化路径）
        const displayPath = this.originalPathMap.get(filePath) || filePath;

        // 创建单个合并的 DiffBlock
        const block: DiffBlock = {
            id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            filePath: displayPath,  // 使用原始路径用于显示
            startLine: firstBlockStart,  // 在旧内容中的起始行号
            separatorLine,   // 在新内容中的起始行号
            endLine,         // 在新内容中的结束行号
            baseContent: allDeletedLines.join('\n'),  // 旧内容
            currentContent: allAddedLines.join('\n'), // 新内容（包括未修改的行）
            baseType: 'original',
            status: 'pending',
            createdAt: Date.now(),
            lastModified: Date.now(),
            changeType: 'modify',
            linesAdded: totalAddedLines,
            linesDeleted: totalDeletedLines,
            aiChannelId: channelId
        };

        this.stateManager.addBlock(block);

        // 更新缓存为新内容
        this.documentContentCache.set(filePath, newContent);

        // **用户体验优化**：不自动打开文件，避免打断用户当前的编辑工作
        // 装饰器和 CodeLens 会在用户切换到文件时自动显示（通过 onDidChangeActiveTextEditor 监听器）
        // 用户可以通过 WebView 的待处理文件列表主动查看修改

        // 刷新 UI（装饰器会在用户打开文件时自动显示）
        this.decorationManager.refreshAll();
        this.codeLensProvider.refresh();
        this.navigationBar.refresh();

        // 更新按钮显示状态
        this.updateButtonVisibility(vscode.window.activeTextEditor);

        // 发送待处理文件状态到 WebView
        this.sendPendingFilesStatus();

        // 获取文件名用于显示
        const fileName = this.getFileName(displayPath);


        this.logService.info(`[DiffPreviewService] 已记录差异块（-${totalDeletedLines} +${totalAddedLines}）`);
    }

    /**
     * 如果文件未打开，则自动打开文件
     */
    private async openFileIfNeeded(filePath: string): Promise<void> {
        // 检查文件是否已在编辑器中打开（使用规范化路径比较）
        const normalizedFilePath = normalizePath(filePath);
        const isOpen = vscode.window.visibleTextEditors.some(editor => {
            const editorPath = normalizePath(editor.document.uri.fsPath);
            return editorPath === normalizedFilePath;
        });

        if (!isOpen) {
            this.logService.info(`[DiffPreviewService] 自动打开文件: ${filePath}`);
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                await vscode.window.showTextDocument(doc, {
                    preview: false,  // 不使用预览模式，确保文件保持打开
                    preserveFocus: false  // 聚焦到打开的文件
                });
                this.logService.info(`[DiffPreviewService] 文件已打开`);
            } catch (error) {
                this.logService.error(`[DiffPreviewService] 无法打开文件: ${filePath}`, error);
            }
        } else {
            this.logService.info(`[DiffPreviewService] 文件已在编辑器中打开`);
        }
    }

    /**
     * 自动接受所有待处理差异块（不弹窗）
     */
    public async acceptAllPendingBlocks(): Promise<void> {
        const allFiles = this.stateManager.getAllFilesWithPendingBlocks();
        let total = 0;

        for (const blocks of allFiles.values()) {
            for (const block of blocks) {
                this.stateManager.updateBlockStatus(block.id, 'accepted');
                total++;
            }
        }

        // 刷新 UI
        this.decorationManager.refreshAll();
        this.codeLensProvider.refresh();
        this.navigationBar.refresh();

        // 更新按钮显示状态
        this.updateButtonVisibility(vscode.window.activeTextEditor);

        // 同步待处理文件状态到 WebView（即使为 0 也要发送，避免前端残留旧状态）
        this.sendPendingFilesStatus();

        if (total > 0) {
            vscode.window.setStatusBarMessage(`✅ 已自动接受 ${total} 处修改`, 3000);
        }

        this.logService.info(`[DiffPreviewService] 自动接受所有待处理差异块: ${total} 个`);
    }

    /**
     * 发送待处理文件状态给 WebView
     */
    private sendPendingFilesStatus(): void {
        const allFiles = this.stateManager.getAllFilesWithPendingBlocks();
        const filesData = Array.from(allFiles.entries()).map(([normalizedPath, blocks]) => {
            let totalAdded = 0;
            let totalDeleted = 0;
            blocks.forEach(block => {
                totalAdded += block.linesAdded || 0;
                totalDeleted += block.linesDeleted || 0;
            });

            // 获取第一个 block 的起始行号，用于点击时定位
            const firstBlock = blocks[0];
            const firstBlockLine = firstBlock ? firstBlock.separatorLine : 0;

            // **关键修复**：使用 block 中的原始路径（保留大小写），而不是 Map 的键（规范化的小写路径）
            const displayPath = firstBlock ? firstBlock.filePath : normalizedPath;

            return {
                filePath: displayPath,
                fileName: this.getFileName(displayPath),
                blockCount: blocks.length,
                linesAdded: totalAdded,
                linesDeleted: totalDeleted,
                firstBlockLine  // 第一处修改的行号
            };
        });

        const message: DiffPreviewPendingFilesMessage = {
            type: 'diff_preview_pending_files',
            files: filesData
        };

        // WebViewService.postMessage 会自动添加 {type: 'from-extension'} 包装
        this.webViewService.postMessage(message);

        this.logService.info(`[DiffPreviewService] 已发送待处理文件状态: ${filesData.length} 个文件`);
    }

    /**
     * 撤销文档的修改
     */
    private async undoChanges(filePath: string, oldContent: string): Promise<void> {
        this.isApplyingChange = true;
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length)
            );
            edit.replace(doc.uri, fullRange, oldContent);
            await vscode.workspace.applyEdit(edit);
        } finally {
            this.isApplyingChange = false;
        }
    }

    /**
     * 应用内容到文档（不修改 isApplyingChange 标志）
     */
    private async applyContentToDocument(filePath: string, content: string): Promise<vscode.TextDocument> {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
        );
        edit.replace(doc.uri, fullRange, content);
        await vscode.workspace.applyEdit(edit);

        // 返回文档引用，供调用者保存
        return doc;
    }

    /**
     * 接受单个差异块（Cursor 方式：文件已是新内容，只需更新状态）
     */
    public async acceptBlock(filePath: string, blockId: string): Promise<void> {
        this.logService.info(`[DiffPreviewService] 接受 block: ${blockId}`);

        const block = this.stateManager.getBlock(blockId);
        if (!block) {
            this.logService.warn(`[DiffPreviewService] Block 不存在: ${blockId}`);
            return;
        }

        // 文件已经是新内容，只需更新状态
        this.stateManager.updateBlockStatus(blockId, 'accepted');

        // 刷新 UI（移除装饰器）
        this.decorationManager.refreshAll();
        this.codeLensProvider.refresh();
        this.navigationBar.refresh();

        // 更新按钮显示状态
        this.updateButtonVisibility(vscode.window.activeTextEditor);

        // 发送待处理文件状态到 WebView
        this.sendPendingFilesStatus();

        // 检查是否还有剩余 blocks
        const remainingBlocks = this.stateManager.getPendingBlocks(filePath);
        if (remainingBlocks.length === 0) {
            vscode.window.setStatusBarMessage('✅ 所有修改已处理完成', 5000);
        } else {
            vscode.window.setStatusBarMessage(`✅ 已接受修改，剩余 ${remainingBlocks.length} 处`, 3000);
        }

        this.logService.info(`[DiffPreviewService] 已接受 ${blockId}`);
    }

    /**
     * 拒绝单个差异块（Cursor 方式：恢复文件到旧内容）
     */
    public async rejectBlock(filePath: string, blockId: string): Promise<void> {
        this.logService.info(`[DiffPreviewService] 拒绝 block: ${blockId}`);

        const block = this.stateManager.getBlock(blockId);
        if (!block) {
            this.logService.warn(`[DiffPreviewService] Block 不存在: ${blockId}`);
            return;
        }

        this.isApplyingChange = true;
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const currentLines = doc.getText().split('\n');

            // 替换修改的行为原始内容
            const baseLines = block.baseContent.split('\n');
            const newLines = [
                ...currentLines.slice(0, block.separatorLine),
                ...baseLines,
                ...currentLines.slice(block.endLine)
            ];

            const finalContent = newLines.join('\n');

            // 应用内容到文档
            const updatedDoc = await this.applyContentToDocument(filePath, finalContent);

            // 更新状态
            this.stateManager.updateBlockStatus(blockId, 'rejected');
            this.documentContentCache.set(filePath, finalContent);

            // 自动保存
            const saved = await updatedDoc.save();
            if (!saved) {
                this.logService.warn(`[DiffPreviewService] 文件保存失败: ${filePath}`);
                vscode.window.showWarningMessage('文件保存失败，请手动保存');
            } else {
                this.logService.info(`[DiffPreviewService] 文件已自动保存: ${filePath}`);
            }

            // 刷新 UI
            this.decorationManager.refreshAll();
            this.codeLensProvider.refresh();
            this.navigationBar.refresh();

            // 更新按钮显示状态
            this.updateButtonVisibility(vscode.window.activeTextEditor);

            // 发送待处理文件状态到 WebView
            this.sendPendingFilesStatus();

            // 检查是否还有剩余 blocks
            const remainingBlocks = this.stateManager.getPendingBlocks(filePath);
            if (remainingBlocks.length === 0) {
                vscode.window.setStatusBarMessage('✅ 所有修改已处理完成', 5000);
            } else {
                vscode.window.setStatusBarMessage(`❌ 已拒绝修改，剩余 ${remainingBlocks.length} 处`, 3000);
            }

            this.logService.info(`[DiffPreviewService] 已拒绝 ${blockId}`);
        } finally {
            this.isApplyingChange = false;
        }
    }

    /**
     * 接受所有差异块（Cursor 方式）
     */
    public async acceptAllBlocks(filePath: string): Promise<void> {
        this.logService.info(`[DiffPreviewService] 接受所有 blocks: ${filePath}`);

        const pendingBlocks = this.stateManager.getPendingBlocks(filePath);
        if (pendingBlocks.length === 0) {
            return;
        }

        // 文件已经是新内容，只需更新所有 blocks 的状态
        for (const block of pendingBlocks) {
            this.stateManager.updateBlockStatus(block.id, 'accepted');
        }

        // 刷新 UI
        this.decorationManager.refreshAll();
        this.codeLensProvider.refresh();
        this.navigationBar.refresh();

        // 更新按钮显示状态
        this.updateButtonVisibility(vscode.window.activeTextEditor);

        // 发送待处理文件状态到 WebView
        this.sendPendingFilesStatus();

        vscode.window.setStatusBarMessage('✅ 已接受所有修改', 5000);
        this.logService.info(`[DiffPreviewService] 已接受所有 ${pendingBlocks.length} 个 blocks`);
    }

    /**
     * 拒绝所有差异块（Cursor 方式：恢复所有修改到旧内容）
     */
    public async rejectAllBlocks(filePath: string): Promise<void> {
        this.logService.info(`[DiffPreviewService] 拒绝所有 blocks: ${filePath}`);

        const pendingBlocks = this.stateManager.getPendingBlocks(filePath);
        if (pendingBlocks.length === 0) {
            return;
        }

        this.isApplyingChange = true;
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            let currentContent = doc.getText();

            // 按照从后往前的顺序处理，避免行号偏移问题
            const sortedBlocks = [...pendingBlocks].sort((a, b) => b.separatorLine - a.separatorLine);

            for (const block of sortedBlocks) {
                const currentLines = currentContent.split('\n');
                const baseLines = block.baseContent.split('\n');

                // 替换修改的行为原始内容
                const newLines = [
                    ...currentLines.slice(0, block.separatorLine),
                    ...baseLines,
                    ...currentLines.slice(block.endLine)
                ];

                currentContent = newLines.join('\n');

                // 更新状态
                this.stateManager.updateBlockStatus(block.id, 'rejected');
            }

            // 应用最终内容
            const updatedDoc = await this.applyContentToDocument(filePath, currentContent);
            this.documentContentCache.set(filePath, currentContent);

            // 自动保存
            const saved = await updatedDoc.save();
            if (!saved) {
                this.logService.warn(`[DiffPreviewService] 文件保存失败: ${filePath}`);
                vscode.window.showWarningMessage('文件保存失败，请手动保存');
            } else {
                this.logService.info(`[DiffPreviewService] 文件已自动保存: ${filePath}`);
            }

            // 刷新 UI
            this.decorationManager.refreshAll();
            this.codeLensProvider.refresh();
            this.navigationBar.refresh();

            // 更新按钮显示状态
            this.updateButtonVisibility(vscode.window.activeTextEditor);

            // 发送待处理文件状态到 WebView
            this.sendPendingFilesStatus();

            vscode.window.setStatusBarMessage('❌ 已拒绝所有修改', 5000);
            this.logService.info(`[DiffPreviewService] 已拒绝所有 ${pendingBlocks.length} 个 blocks`);
        } finally {
            this.isApplyingChange = false;
        }
    }

    /**
     * 注册命令
     */
    private registerCommands(): void {
        this.disposables.push(
            vscode.commands.registerCommand('opencode.acceptDiffBlock', (filePath: string, blockId: string) => {
                this.acceptBlock(filePath, blockId);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('opencode.rejectDiffBlock', (filePath: string, blockId: string) => {
                this.rejectBlock(filePath, blockId);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('opencode.acceptAllDiffs', () => {
                this.logService.info('[DiffPreviewService] 接受所有修改命令被调用');
                const originalPath = vscode.window.activeTextEditor?.document.uri.fsPath;
                if (!originalPath) {
                    this.logService.warn('[DiffPreviewService] 无法获取当前文件路径');
                    vscode.window.showWarningMessage('无法获取当前文件路径');
                    return;
                }

                // **关键修复**：使用规范化路径
                const targetPath = normalizePath(originalPath);
                this.logService.info(`[DiffPreviewService] 目标文件: ${targetPath}`);

                // 检查是否有 pending blocks
                const pendingBlocks = this.stateManager.getPendingBlocks(targetPath);
                if (pendingBlocks.length === 0) {
                    this.logService.info('[DiffPreviewService] 当前文件没有待处理的修改');
                    vscode.window.showInformationMessage('当前文件没有待处理的修改');
                    return;
                }

                this.acceptAllBlocks(targetPath);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('opencode.rejectAllDiffs', () => {
                this.logService.info('[DiffPreviewService] 拒绝所有修改命令被调用');
                const originalPath = vscode.window.activeTextEditor?.document.uri.fsPath;
                if (!originalPath) {
                    this.logService.warn('[DiffPreviewService] 无法获取当前文件路径');
                    vscode.window.showWarningMessage('无法获取当前文件路径');
                    return;
                }

                // **关键修复**：使用规范化路径
                const targetPath = normalizePath(originalPath);
                this.logService.info(`[DiffPreviewService] 目标文件: ${targetPath}`);

                // 检查是否有 pending blocks
                const pendingBlocks = this.stateManager.getPendingBlocks(targetPath);
                if (pendingBlocks.length === 0) {
                    this.logService.info('[DiffPreviewService] 当前文件没有待处理的修改');
                    vscode.window.showInformationMessage('当前文件没有待处理的修改');
                    return;
                }

                this.rejectAllBlocks(targetPath);
            })
        );

        // 注册"查看所有修改"命令
        this.disposables.push(
            vscode.commands.registerCommand('opencode.showDiffQuickPick', (filePath?: string) => {
                const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
                if (targetPath) {
                    showDiffQuickPick(targetPath);
                }
            })
        );

        // 注册导航命令
        this.disposables.push(
            vscode.commands.registerCommand('opencode.diffNavigatePrev', () => {
                this.navigationBar.navigatePrev();
                // 导航后更新位置显示
                this.updateButtonVisibility(vscode.window.activeTextEditor);
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('opencode.diffNavigateNext', () => {
                this.navigationBar.navigateNext();
                // 导航后更新位置显示
                this.updateButtonVisibility(vscode.window.activeTextEditor);
            })
        );
    }

    /**
     * 获取文件名（不含路径）
     */
    private getFileName(filePath: string): string {
        return filePath.substring(filePath.lastIndexOf('\\\\') + 1);
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.decorationManager.dispose();
        this.codeLensProvider.dispose();
        this.navigationBar.dispose();

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        // 清除所有定时器
        for (const timer of this.cleanupTimers.values()) {
            clearTimeout(timer);
        }
        this.cleanupTimers.clear();

        this.logService.info('[DiffPreviewService] 服务已释放');
    }
}
