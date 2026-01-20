/**
 * Tool UI 上下文接口
 * 用于 Tool 渲染时访问文件操作等功能
 */
import type { AttachmentPayload } from './attachment';

export interface ToolContext {
  fileOpener: {
    open: (filePath: string, location?: { startLine?: number; endLine?: number }) => void;
    openContent: (content: string, fileName: string, editable: boolean) => void;
  };
  session?: {
    resumeAt: (
      messageTimestamp: number,
      newMessage?: { input: string; attachments: AttachmentPayload[] }
    ) => Promise<void>;
  };
}

/**
 * Tool 权限请求渲染器接口
 * 不同的 Tool 可以实现自定义的权限请求 UI
 */
export interface ToolPermissionRenderer {
  /**
   * 渲染权限请求 UI
   * @param context Tool 上下文
   * @param inputs Tool 输入参数
   * @param onModify 修改输入的回调
   */
  renderPermissionRequest(
    context: ToolContext,
    inputs: any,
    onModify?: (newInputs: any) => void
  ): any;
}
