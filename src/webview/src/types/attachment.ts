/**
 * 附件相关类型定义
 */

/**
 * 附件预览（UI 显示用）
 */
export interface AttachmentPreview {
  id: string;
  fileName: string;
  fileSize: number;
  mediaType: string;
}

/**
 * 附件完整数据（发送到后端）
 */
export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string; // base64 编码（不含 data:xxx 前缀）
  fileSize?: number;
}

/**
 * 附件内部数据（包含 ID）
 */
export interface AttachmentItem extends AttachmentPayload {
  id: string;
  fileSize: number;
}

/**
 * 支持的图片 MIME 类型
 */
export const IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/**
 * 文件大小格式化
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 将 File 对象转换为 AttachmentItem
 */
export async function convertFileToAttachment(file: File): Promise<AttachmentItem> {
  // 读取文件为 base64
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // 解析 data URL: "data:image/png;base64,iVBORw0KGgo..."
  const [prefix, data] = dataUrl.split(',');
  const match = prefix.match(/data:([^;]+);base64/);
  const mediaType = (match ? match[1] : 'application/octet-stream').toLowerCase();

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fileName: file.name,
    mediaType,
    data, // 纯 base64 字符串（不含前缀）
    fileSize: file.size,
  };
}
