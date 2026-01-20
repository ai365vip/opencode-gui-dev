import { ref, inject } from 'vue'
import { RuntimeKey } from './runtimeContext'
import type {
  ClaudeConfigData,
  GetClaudeConfigRequest,
  GetClaudeConfigResponse,
  SaveClaudeConfigRequest,
  SaveClaudeConfigResponse
} from '../../../shared/messages'

export interface ClaudeConfig extends ClaudeConfigData {
  // 扩展字段（如果需要）
}

const config = ref<ClaudeConfig | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const hasUnsavedChanges = ref(false)

export function useClaudeConfig() {
  const runtime = inject(RuntimeKey)

  if (!runtime) {
    throw new Error('[useClaudeConfig] Runtime not provided. Make sure RuntimeKey is provided in App.vue')
  }

  async function loadConfig(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const connection = await runtime!.connectionManager.get()
      // 明确读取用户级配置（~/.claude/settings.json）
      const response = await connection.getClaudeConfig('user', 'settings')

      if (response && response.type === 'get_claude_config_response') {
        config.value = response.config as ClaudeConfig
      } else {
        throw new Error('Invalid response format')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[useClaudeConfig] 加载配置失败:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function saveConfig(): Promise<boolean> {
    if (!config.value) {
      error.value = '没有可保存的配置'
      return false
    }

    isLoading.value = true
    error.value = null

    try {
      const connection = await runtime!.connectionManager.get()

      // 序列化配置，去除 Vue 的响应式包装
      const plainConfig = JSON.parse(JSON.stringify(config.value))

      // 明确保存到用户级配置（~/.claude/settings.json）
      const response = await connection.saveClaudeConfig(plainConfig, 'user', 'settings')

      if (response && response.type === 'save_claude_config_response') {
        if (response.success) {
          hasUnsavedChanges.value = false
          return true
        } else {
          error.value = response.error || '保存失败'
          return false
        }
      } else {
        throw new Error('Invalid response format')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[useClaudeConfig] 保存配置失败:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  function updateConfig(partial: Partial<ClaudeConfig>): void {
    if (config.value) {
      config.value = { ...config.value, ...partial }
      hasUnsavedChanges.value = true
    }
  }

  function updateEnv(key: string, value: string | undefined): void {
    if (!config.value) return

    if (!config.value.env) {
      config.value.env = {}
    }

    if (value === undefined || value === '') {
      delete config.value.env[key]
    } else {
      config.value.env[key] = value
    }

    hasUnsavedChanges.value = true
  }

  function updatePermissions(allow: string[], deny: string[]): void {
    if (!config.value) return

    if (!config.value.permissions) {
      config.value.permissions = {}
    }

    config.value.permissions.allow = allow
    config.value.permissions.deny = deny
    hasUnsavedChanges.value = true
  }

  function resetUnsavedChanges(): void {
    hasUnsavedChanges.value = false
  }

  return {
    config,
    isLoading,
    error,
    hasUnsavedChanges,
    loadConfig,
    saveConfig,
    updateConfig,
    updateEnv,
    updatePermissions,
    resetUnsavedChanges
  }
}
