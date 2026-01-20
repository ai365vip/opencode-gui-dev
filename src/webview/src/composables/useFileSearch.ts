import { ref, computed } from 'vue'

export interface FileItem {
  id: string
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  extension?: string
  lastModified?: number
  size?: number
}

const files = ref<FileItem[]>([])
const allFiles = ref<FileItem[]>([])
const searchQuery = ref('')
const loading = ref(false)

export function useFileSearch() {
  const filteredFiles = computed(() => {
    const fileList = files.value || []
    const query = searchQuery.value?.trim() || ''

    if (!query) {
      const completeList = allFiles.value.length > 0 ? allFiles.value : fileList
      return completeList.slice(0, 100)
    }

    const queryLower = query.toLowerCase()
    const searchList = allFiles.value.length > 0 ? allFiles.value : fileList
    return searchList
      .filter(file => {
        if (!file) return false
        const name = file.name?.toLowerCase() || ''
        const relativePath = file.relativePath?.toLowerCase() || ''
        // 改为开头匹配：文件名或路径的开头匹配查询
        return name.startsWith(queryLower) || relativePath.startsWith(queryLower)
      })
      .slice(0, 50)
  })

  const searchFiles = async (query: string) => {
    searchQuery.value = query || ''
  }

  /**
   * 加载工作区文件（使用 * pattern 获取所有文件）
   * 注意：这个函数需要在组件中调用，并传入 runtime 实例
   */
  const loadWorkspaceFiles = async (runtime?: any) => {
    if (!runtime) {
      console.warn('[useFileSearch] Runtime not available, skipping file load')
      return
    }

    loading.value = true
    console.log('[useFileSearch] 开始加载工作区文件')

    try {
      const connection = await runtime.connectionManager.get()

      // 使用 ** 模式来获取所有文件
      const response = await connection.listFiles('**')

      const fileList = (response.files || []).map((f: any) => ({
        id: f.path,
        name: f.name,
        path: f.path,
        relativePath: f.path,
        isDirectory: f.type === 'directory',
        extension: f.name.includes('.') ? '.' + f.name.split('.').pop() : undefined
      }))

      updateFiles(fileList)
      console.log('[useFileSearch] 已加载', fileList.length, '个文件')
    } catch (error) {
      console.error('[useFileSearch] 加载工作区文件失败:', error)
    } finally {
      loading.value = false
    }
  }

  const updateFiles = (newFiles: FileItem[]) => {
    const validFiles = Array.isArray(newFiles) ? newFiles : []
    console.log('[useFileSearch] 更新文件列表:', validFiles.length, '个文件')
    files.value = validFiles
    allFiles.value = validFiles
  }

  const addSelectedFile = (file: FileItem) => {
    if (!file || !file.relativePath) {
      return '@'
    }
    return `@${file.relativePath}`
  }

  const handleMessage = (event: any) => {
    if (!event.data || !event.data.type) {
      return
    }

    const message = event.data

    switch (message.type) {
      case 'add-selection':
        if (message.payload) {
          console.log('[useFileSearch] 收到选中内容:', message.payload)

          const fileRef = `@${message.payload.relativePath}`
          const contentToAdd = message.payload.selectedText
            ? `${fileRef}\n\n${message.payload.selectedText}`
            : fileRef

          window.dispatchEvent(new CustomEvent('add-selection-content', {
            detail: { content: contentToAdd }
          }))
        }
        break
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage)
  }

  const categorizeFiles = (filesList: FileItem[]) => {
    const categories = {
      recent: [] as FileItem[],
      code: [] as FileItem[],
      config: [] as FileItem[],
      docs: [] as FileItem[],
      directories: [] as FileItem[],  // 新增目录分类
      other: [] as FileItem[]
    }

    if (!Array.isArray(filesList)) {
      return categories
    }

    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.cs', '.php']
    const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.env', '.config']
    const docsExtensions = ['.md', '.txt', '.rst', '.doc', '.docx', '.pdf']

    filesList.forEach(file => {
      if (!file) return

      // 处理目录
      if (file.isDirectory) {
        categories.directories.push(file)
        return
      }

      // 处理文件
      const ext = file.extension?.toLowerCase() || ''

      if (file.lastModified && Date.now() - file.lastModified < 7 * 24 * 60 * 60 * 1000) {
        categories.recent.push(file)
      }

      if (codeExtensions.includes(ext)) {
        categories.code.push(file)
      } else if (configExtensions.includes(ext)) {
        categories.config.push(file)
      } else if (docsExtensions.includes(ext)) {
        categories.docs.push(file)
      } else {
        categories.other.push(file)
      }
    })

    return categories
  }

  return {
    files: computed(() => files.value || []),
    filteredFiles,
    searchQuery: computed(() => searchQuery.value || ''),
    loading: computed(() => loading.value),
    searchFiles,
    loadWorkspaceFiles,
    updateFiles,
    addSelectedFile,
    categorizeFiles,
    cleanup: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('message', handleMessage)
      }
    }
  }
}
