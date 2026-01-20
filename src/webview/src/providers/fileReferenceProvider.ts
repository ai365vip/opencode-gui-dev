import type { DropdownItemType } from '../types/dropdown'
import type { RuntimeInstance } from '../composables/useRuntime'
import type { FileItem } from '../composables/useFileSearch'

/**
 * 文件引用项
 */
export interface FileReference {
  path: string
  name: string
  type: 'file' | 'directory'
}

/**
 * 获取文件列表（使用本地缓存优先）
 * @param query 搜索查询
 * @param runtime Runtime 实例
 * @param cachedFiles 本地缓存的文件列表（可选）
 * @returns 文件引用数组
 */
export async function getFileReferences(
  query: string,
  runtime: RuntimeInstance | undefined,
  cachedFiles?: FileItem[]
): Promise<FileReference[]> {
  // 如果有本地缓存，优先使用本地过滤
  if (cachedFiles && cachedFiles.length > 0) {
    const queryLower = query?.toLowerCase() || ''

    if (!queryLower) {
      // 无查询时返回前 100 个
      return cachedFiles.slice(0, 100).map(f => ({
        path: f.relativePath || f.path,
        name: f.name,
        type: f.isDirectory ? 'directory' : 'file'
      }))
    }

    // 有查询时进行本地过滤（开头匹配）
    return cachedFiles
      .filter(file => {
        const name = file.name?.toLowerCase() || ''
        const path = file.relativePath?.toLowerCase() || file.path?.toLowerCase() || ''
        // 改为开头匹配：文件名或路径的开头匹配查询
        return name.startsWith(queryLower) || path.startsWith(queryLower)
      })
      .slice(0, 50)
      .map(f => ({
        path: f.relativePath || f.path,
        name: f.name,
        type: f.isDirectory ? 'directory' : 'file'
      }))
  }

  // 降级：使用后端 API
  if (!runtime) {
    console.warn('[fileReferenceProvider] No runtime available')
    return []
  }

  try {
    const connection = await runtime.connectionManager.get()
    const pattern = (query && query.trim()) ? query : '*'
    const response = await connection.listFiles(pattern)
    return response.files || []
  } catch (error) {
    console.error('[fileReferenceProvider] Failed to list files:', error)
    return []
  }
}

/**
 * 将文件引用转换为 DropdownItem 格式
 */
export function fileToDropdownItem(file: FileReference): DropdownItemType {
  return {
    id: `file-${file.path}`,
    type: 'item',
    label: file.name,
    detail: file.path,
    // 不设置 icon，交由 FileIcon 组件根据 isDirectory/folderName 匹配
    data: {
      file
    }
  }
}
