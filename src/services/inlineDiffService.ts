/**
 * InlineDiffService - 文件修改拦截服务（已禁用）
 *
 * 所有功能已暂时禁用，文件修改将自动应用。
 * 如需恢复 inline diff 功能，参考 inlineDiffService.ts.backup
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IInlineDiffService = createDecorator<IInlineDiffService>('inlineDiffService');

export interface IInlineDiffService {
    readonly _serviceBrand: undefined;
    markFileForToolModification(filePath: string, channelId: string): void;
    setWorkModeProvider(provider: (channelId: string) => string | null): void;
    dispose(): void;
}

export class InlineDiffService implements IInlineDiffService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        this.logService.warn('🔧 [InlineDiffService] 已初始化（所有功能已禁用）');
    }

    setWorkModeProvider(provider: (channelId: string) => string | null): void {
        // 空实现
    }

    markFileForToolModification(filePath: string, channelId: string): void {
        // 空实现 - 不再拦截文件修改
    }

    dispose(): void {
        // 空实现
    }
}
