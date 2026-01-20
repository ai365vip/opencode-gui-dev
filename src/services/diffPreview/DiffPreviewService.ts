/**
 * DiffPreviewService - 差异预览服务（已禁用）
 *
 * 用户已要求移除“编辑器内 Accept/Reject + 待确认列表 + 状态栏按钮”等确认流程：
 * - 工具修改直接落盘（由后端/工具自身完成）
 * - 这里保留同名服务与接口，作为兼容性空实现，避免 DI/旧代码引用报错
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IWebViewService } from '../webViewService';
import type { WorkMode } from '../../shared/messages';

export const IDiffPreviewService = createDecorator<IDiffPreviewService>('diffPreviewService');

export interface IDiffPreviewService {
  readonly _serviceBrand: undefined;

  markFileForToolModification(filePath: string, channelId: string): Promise<void>;
  setWorkModeProvider(provider: (channelId: string) => WorkMode | null): void;

  acceptBlock(filePath: string, blockId: string): Promise<void>;
  rejectBlock(filePath: string, blockId: string): Promise<void>;
  acceptAllBlocks(filePath: string): Promise<void>;
  rejectAllBlocks(filePath: string): Promise<void>;
  acceptAllPendingBlocks(): Promise<void>;

  dispose(): void;
}

export class DiffPreviewService implements IDiffPreviewService {
  readonly _serviceBrand: undefined;

  constructor(
    @ILogService private readonly logService: ILogService,
    @IWebViewService _webViewService: IWebViewService
  ) {
    this.logService.warn('[DiffPreviewService] 已禁用（不再生成待确认 diff / Accept/Reject UI）');
  }

  async markFileForToolModification(_filePath: string, _channelId: string): Promise<void> {
    // no-op
  }

  setWorkModeProvider(_provider: (channelId: string) => WorkMode | null): void {
    // no-op
  }

  async acceptBlock(_filePath: string, _blockId: string): Promise<void> {
    // no-op
  }

  async rejectBlock(_filePath: string, _blockId: string): Promise<void> {
    // no-op
  }

  async acceptAllBlocks(_filePath: string): Promise<void> {
    // no-op
  }

  async rejectAllBlocks(_filePath: string): Promise<void> {
    // no-op
  }

  async acceptAllPendingBlocks(): Promise<void> {
    // no-op
  }

  dispose(): void {
    // no-op
  }
}
