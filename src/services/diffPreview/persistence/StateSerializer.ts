/**
 * StateSerializer - 状态序列化器
 *
 * 持久化和恢复 DiffStateManager 的状态到 VSCode 全局存储
 */

import * as vscode from 'vscode';
import type { FileState } from '../state/FileState';
import type { DiffBlock } from '../state/DiffBlock';
import { DiffStateManager } from '../state/DiffStateManager';

/**
 * 序列化的 FileState
 */
interface SerializedFileState {
    filePath: string;
    originalContent: string;
    currentDiskContent: string;
    blocks: SerializedDiffBlock[];
    blockOrder: string[];
    isMarkedForAIEdit: boolean;
    markedChannelId?: string;
    lastAIEditTime: number;
    totalBlocksCreated: number;
    totalBlocksAccepted: number;
    totalBlocksRejected: number;
    contentHash: string;
    lastSyncTime: number;
}

/**
 * 序列化的 DiffBlock
 */
interface SerializedDiffBlock {
    id: string;
    filePath: string;
    startLine: number;
    separatorLine: number;
    endLine: number;
    baseContent: string;
    currentContent: string;
    baseType: 'original' | 'accepted';
    baseBlockId?: string;
    status: 'pending' | 'accepted' | 'rejected' | 'invalidated';
    createdAt: number;
    lastModified: number;
    processedAt?: number;
    changeType: 'add' | 'delete' | 'modify';
    linesAdded: number;
    linesDeleted: number;
    aiChannelId?: string;
    aiToolName?: string;
}

/**
 * 序列化的全局状态
 */
interface SerializedState {
    version: string;  // 状态格式版本
    timestamp: number;  // 保存时间
    fileStates: SerializedFileState[];
}

/**
 * StateSerializer 类
 */
export class StateSerializer {
    private static readonly STORAGE_KEY = 'opencode.diffPreview.state';
    private static readonly STATE_VERSION = '1.0';
    private static readonly MAX_STATE_SIZE = 10 * 1024 * 1024;  // 10MB

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * 保存状态到存储
     */
    public async saveState(stateManager: DiffStateManager): Promise<void> {
        try {
            const serialized = this.serializeState(stateManager);
            const json = JSON.stringify(serialized);

            // 检查大小
            if (json.length > StateSerializer.MAX_STATE_SIZE) {
                console.warn('[StateSerializer] 状态过大，跳过保存', json.length);
                return;
            }

            await this.context.globalState.update(StateSerializer.STORAGE_KEY, serialized);
            console.log('[StateSerializer] 状态已保存', {
                fileCount: serialized.fileStates.length,
                size: json.length
            });
        } catch (error) {
            console.error('[StateSerializer] 保存状态失败:', error);
        }
    }

    /**
     * 从存储恢复状态
     */
    public async restoreState(stateManager: DiffStateManager): Promise<void> {
        try {
            const serialized = this.context.globalState.get<SerializedState>(StateSerializer.STORAGE_KEY);

            if (!serialized) {
                console.log('[StateSerializer] 无保存的状态');
                return;
            }

            // 检查版本兼容性
            if (serialized.version !== StateSerializer.STATE_VERSION) {
                console.warn('[StateSerializer] 状态版本不匹配，清空状态');
                await this.clearState();
                return;
            }

            // 恢复状态
            this.deserializeState(stateManager, serialized);

            console.log('[StateSerializer] 状态已恢复', {
                fileCount: serialized.fileStates.length,
                timestamp: new Date(serialized.timestamp).toISOString()
            });
        } catch (error) {
            console.error('[StateSerializer] 恢复状态失败:', error);
        }
    }

    /**
     * 清空保存的状态
     */
    public async clearState(): Promise<void> {
        await this.context.globalState.update(StateSerializer.STORAGE_KEY, undefined);
        console.log('[StateSerializer] 状态已清空');
    }

    /**
     * 序列化状态
     */
    private serializeState(stateManager: DiffStateManager): SerializedState {
        const fileStates: SerializedFileState[] = [];

        for (const filePath of stateManager.getAllFilePaths()) {
            const fileState = stateManager.getFileState(filePath);

            // 序列化 blocks
            const blocks: SerializedDiffBlock[] = [];
            for (const blockId of fileState.blockOrder) {
                const block = fileState.blocks.get(blockId);
                if (block) {
                    blocks.push(this.serializeBlock(block));
                }
            }

            fileStates.push({
                filePath: fileState.filePath,
                originalContent: fileState.originalContent,
                currentDiskContent: fileState.currentDiskContent,
                blocks,
                blockOrder: fileState.blockOrder,
                isMarkedForAIEdit: fileState.isMarkedForAIEdit,
                markedChannelId: fileState.markedChannelId,
                lastAIEditTime: fileState.lastAIEditTime,
                totalBlocksCreated: fileState.totalBlocksCreated,
                totalBlocksAccepted: fileState.totalBlocksAccepted,
                totalBlocksRejected: fileState.totalBlocksRejected,
                contentHash: fileState.contentHash,
                lastSyncTime: fileState.lastSyncTime
            });
        }

        return {
            version: StateSerializer.STATE_VERSION,
            timestamp: Date.now(),
            fileStates
        };
    }

    /**
     * 序列化单个 Block
     */
    private serializeBlock(block: DiffBlock): SerializedDiffBlock {
        return {
            id: block.id,
            filePath: block.filePath,
            startLine: block.startLine,
            separatorLine: block.separatorLine,
            endLine: block.endLine,
            baseContent: block.baseContent,
            currentContent: block.currentContent,
            baseType: block.baseType,
            baseBlockId: block.baseBlockId,
            status: block.status,
            createdAt: block.createdAt,
            lastModified: block.lastModified,
            processedAt: block.processedAt,
            changeType: block.changeType,
            linesAdded: block.linesAdded,
            linesDeleted: block.linesDeleted,
            aiChannelId: block.aiChannelId,
            aiToolName: block.aiToolName
        };
    }

    /**
     * 反序列化状态
     */
    private deserializeState(stateManager: DiffStateManager, serialized: SerializedState): void {
        // 清空现有状态
        stateManager.clear();

        for (const fileStateData of serialized.fileStates) {
            // 创建 FileState
            const fileState = stateManager.getFileState(
                fileStateData.filePath,
                fileStateData.originalContent
            );

            // 恢复属性
            fileState.currentDiskContent = fileStateData.currentDiskContent;
            fileState.isMarkedForAIEdit = fileStateData.isMarkedForAIEdit;
            fileState.markedChannelId = fileStateData.markedChannelId;
            fileState.lastAIEditTime = fileStateData.lastAIEditTime;
            fileState.totalBlocksCreated = fileStateData.totalBlocksCreated;
            fileState.totalBlocksAccepted = fileStateData.totalBlocksAccepted;
            fileState.totalBlocksRejected = fileStateData.totalBlocksRejected;
            fileState.contentHash = fileStateData.contentHash;
            fileState.lastSyncTime = fileStateData.lastSyncTime;

            // 恢复 blocks
            for (const blockData of fileStateData.blocks) {
                const block: DiffBlock = {
                    id: blockData.id,
                    filePath: blockData.filePath,
                    startLine: blockData.startLine,
                    separatorLine: blockData.separatorLine,
                    endLine: blockData.endLine,
                    baseContent: blockData.baseContent,
                    currentContent: blockData.currentContent,
                    baseType: blockData.baseType,
                    baseBlockId: blockData.baseBlockId,
                    status: blockData.status,
                    createdAt: blockData.createdAt,
                    lastModified: blockData.lastModified,
                    processedAt: blockData.processedAt,
                    changeType: blockData.changeType,
                    linesAdded: blockData.linesAdded,
                    linesDeleted: blockData.linesDeleted,
                    aiChannelId: blockData.aiChannelId,
                    aiToolName: blockData.aiToolName
                };

                stateManager.addBlock(block);
            }

            fileState.blockOrder = fileStateData.blockOrder;
        }
    }

    /**
     * 获取状态统计信息
     */
    public async getStateStats(): Promise<{
        exists: boolean;
        version?: string;
        timestamp?: number;
        fileCount?: number;
        totalBlocks?: number;
        size?: number;
    }> {
        try {
            const serialized = this.context.globalState.get<SerializedState>(StateSerializer.STORAGE_KEY);

            if (!serialized) {
                return { exists: false };
            }

            const json = JSON.stringify(serialized);
            const totalBlocks = serialized.fileStates.reduce(
                (sum, fs) => sum + fs.blocks.length,
                0
            );

            return {
                exists: true,
                version: serialized.version,
                timestamp: serialized.timestamp,
                fileCount: serialized.fileStates.length,
                totalBlocks,
                size: json.length
            };
        } catch (error) {
            console.error('[StateSerializer] 获取状态统计失败:', error);
            return { exists: false };
        }
    }
}

/**
 * 创建 StateSerializer 实例（工厂函数）
 */
export function createStateSerializer(context: vscode.ExtensionContext): StateSerializer {
    return new StateSerializer(context);
}
