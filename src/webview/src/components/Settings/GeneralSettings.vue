<template>
  <div class="general-settings">
    <h3 class="section-title">基础配置</h3>
    <p class="section-desc">配置API密钥、模型选择、代理等基础设置</p>

    <!-- API 配置 -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-key"></span>
        API 配置
      </h4>

      <div class="setting-item">
        <label class="setting-label">
          API Key
        </label>
        <input
          v-model="settings.apiKey"
          type="password"
          class="setting-input"
          placeholder="sk-ant-xxx"
        />
        <span class="setting-hint">从 ~/.claude/settings.json 的 env.ANTHROPIC_API_KEY 读取</span>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          API Base URL
        </label>
        <input
          v-model="settings.apiBaseUrl"
          type="text"
          class="setting-input"
          placeholder="https://api.anthropic.com"
        />
        <span class="setting-hint">自定义API地址，留空使用默认值</span>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          HTTP 代理
          <span class="badge-realtime">实时生效</span>
        </label>
        <input
          v-model="settings.httpProxy"
          type="text"
          class="setting-input"
          placeholder="http://127.0.0.1:7890"
        />
        <span class="setting-hint">HTTP_PROXY 和 HTTPS_PROXY 环境变量</span>
      </div>
    </div>

    <!-- 模型配置 -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-circuit-board"></span>
        模型配置
      </h4>

      <div class="setting-item">
        <label class="setting-label">
          默认模型
          <span class="badge-realtime">实时生效</span>
        </label>
        <input
          v-model="settings.defaultModel"
          type="text"
          class="setting-input"
          placeholder="输入模型ID，如：claude-sonnet-4-5-20250929"
        />
        <span class="setting-hint">env.ANTHROPIC_MODEL - 可输入自定义模型ID，留空使用系统默认</span>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          快速模型
          <span class="badge-realtime">实时生效</span>
        </label>
        <input
          v-model="settings.fastModel"
          type="text"
          class="setting-input"
          placeholder="输入模型ID，如：claude-haiku-4-5-20251001"
        />
        <span class="setting-hint">env.ANTHROPIC_SMALL_FAST_MODEL - 用于快速任务，可自定义，留空使用系统默认</span>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          备用模型
          <span class="badge-restart">需重启</span>
        </label>
        <input
          v-model="settings.fallbackModel"
          type="text"
          class="setting-input"
          placeholder="claude-haiku-4-5-20251001"
        />
        <span class="setting-hint">主模型失败时的备用模型ID</span>
      </div>
    </div>

    <!-- 高级选项 -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-settings"></span>
        高级选项
      </h4>

      <div class="setting-item">
        <label class="setting-label">
          最大思考Tokens
          <span class="badge-realtime">实时生效</span>
        </label>
        <input
          v-model.number="settings.maxThinkingTokens"
          type="number"
          class="setting-input"
          placeholder="50000"
          min="0"
          max="100000"
        />
        <span class="setting-hint">env.MAX_THINKING_TOKENS (0-100000，0表示禁用思考)</span>
      </div>

      <div class="setting-item">
        <label class="setting-label">
          最大对话轮数
          <span class="badge-restart">需重启</span>
        </label>
        <input
          v-model.number="settings.maxTurns"
          type="number"
          class="setting-input"
          placeholder="100"
          min="1"
        />
        <span class="setting-hint">单次会话的最大对话轮数限制</span>
      </div>

      <div class="setting-item">
        <label class="setting-label checkbox-label">
          <input
            v-model="settings.disableTelemetry"
            type="checkbox"
            class="setting-checkbox"
          />
          <span>禁用遥测数据收集</span>
          <span class="badge-realtime">实时生效</span>
        </label>
        <span class="setting-hint">env.DISABLE_TELEMETRY</span>
      </div>

      <div class="setting-item">
        <label class="setting-label checkbox-label">
          <input
            v-model="settings.disableErrorReporting"
            type="checkbox"
            class="setting-checkbox"
          />
          <span>禁用错误报告</span>
          <span class="badge-realtime">实时生效</span>
        </label>
        <span class="setting-hint">env.DISABLE_ERROR_REPORTING</span>
      </div>

      <div class="setting-item">
        <label class="setting-label checkbox-label">
          <input
            v-model="settings.disableNonessentialTraffic"
            type="checkbox"
            class="setting-checkbox"
          />
          <span>禁用非必要网络流量</span>
          <span class="badge-realtime">实时生效</span>
        </label>
        <span class="setting-hint">env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC - 禁用更新检查、遥测等非必要网络请求</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useClaudeConfig } from '../../composables/useClaudeConfig'

interface GeneralSettingsData {
  // API 配置
  apiKey: string
  apiBaseUrl: string
  httpProxy: string

  // 模型配置
  defaultModel: string
  fastModel: string
  fallbackModel: string

  // 高级选项
  maxThinkingTokens: number
  maxTurns: number
  disableTelemetry: boolean
  disableErrorReporting: boolean
  disableNonessentialTraffic: boolean
}

const { config, loadConfig, updateConfig } = useClaudeConfig()

const settings = ref<GeneralSettingsData>({
  apiKey: '',
  apiBaseUrl: '',
  httpProxy: '',
  defaultModel: '',
  fastModel: '',
  fallbackModel: '',
  maxThinkingTokens: 50000,
  maxTurns: 100,
  disableTelemetry: false,
  disableErrorReporting: false,
  disableNonessentialTraffic: false
})

// 防止循环更新
const isLoadingFromConfig = ref(false)

onMounted(() => {
  // 父组件已经加载config，直接使用即可
  if (config.value) {
    loadFromConfig(config.value)
  }
})

watch(() => config.value, (newConfig) => {
  if (newConfig) {
    loadFromConfig(newConfig)
  }
}, { deep: true })

// 监听 settings 变化并同步到 config
watch(() => settings.value, (newSettings) => {
  // 防止循环更新
  if (!isLoadingFromConfig.value) {
    syncToConfig(newSettings)
  }
}, { deep: true })

function loadFromConfig(cfg: any) {
  isLoadingFromConfig.value = true

  // 兼容多种布尔值格式：'true', '1', 'yes' 等都识别为 true
  const parseEnvBoolean = (value: string | undefined): boolean => {
    if (!value) return false
    const normalized = value.toLowerCase().trim()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  settings.value = {
    apiKey: cfg.env?.ANTHROPIC_API_KEY || '',
    apiBaseUrl: cfg.env?.ANTHROPIC_BASE_URL || '',
    httpProxy: cfg.env?.HTTP_PROXY || cfg.env?.HTTPS_PROXY || '',
    defaultModel: cfg.env?.ANTHROPIC_MODEL || '',
    fastModel: cfg.env?.ANTHROPIC_SMALL_FAST_MODEL || '',
    fallbackModel: cfg.fallbackModel || '',
    maxThinkingTokens: cfg.env?.MAX_THINKING_TOKENS ? parseInt(cfg.env.MAX_THINKING_TOKENS) : 50000,
    maxTurns: cfg.maxTurns || 100,
    disableTelemetry: parseEnvBoolean(cfg.env?.DISABLE_TELEMETRY),
    disableErrorReporting: parseEnvBoolean(cfg.env?.DISABLE_ERROR_REPORTING),
    disableNonessentialTraffic: parseEnvBoolean(cfg.env?.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
  }
  // 使用 nextTick 确保同步更新完成后再重置标志
  setTimeout(() => {
    isLoadingFromConfig.value = false
  }, 0)
}

function syncToConfig(newSettings: GeneralSettingsData) {
  // 保留现有的所有环境变量，只更新 GeneralSettings 管理的部分
  const env = { ...(config.value?.env || {}) }

  // 更新或删除环境变量
  if (newSettings.apiKey) {
    env.ANTHROPIC_API_KEY = newSettings.apiKey
  } else {
    delete env.ANTHROPIC_API_KEY
  }

  if (newSettings.apiBaseUrl) {
    env.ANTHROPIC_BASE_URL = newSettings.apiBaseUrl
  } else {
    delete env.ANTHROPIC_BASE_URL
  }

  if (newSettings.httpProxy) {
    env.HTTP_PROXY = newSettings.httpProxy
    env.HTTPS_PROXY = newSettings.httpProxy
  } else {
    delete env.HTTP_PROXY
    delete env.HTTPS_PROXY
  }

  if (newSettings.defaultModel) {
    env.ANTHROPIC_MODEL = newSettings.defaultModel
  } else {
    delete env.ANTHROPIC_MODEL
  }

  if (newSettings.fastModel) {
    env.ANTHROPIC_SMALL_FAST_MODEL = newSettings.fastModel
  } else {
    delete env.ANTHROPIC_SMALL_FAST_MODEL
  }

  if (newSettings.maxThinkingTokens !== undefined) {
    env.MAX_THINKING_TOKENS = String(newSettings.maxThinkingTokens)
  } else {
    delete env.MAX_THINKING_TOKENS
  }

  // 布尔值环境变量：使用 "1" 而不是 "true"（兼容性更好）
  // 勾选时设置为 "1"，未勾选时删除该键
  if (newSettings.disableTelemetry) {
    env.DISABLE_TELEMETRY = '1'
  } else {
    delete env.DISABLE_TELEMETRY
  }

  if (newSettings.disableErrorReporting) {
    env.DISABLE_ERROR_REPORTING = '1'
  } else {
    delete env.DISABLE_ERROR_REPORTING
  }

  if (newSettings.disableNonessentialTraffic) {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  } else {
    delete env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  }

  // 更新配置
  updateConfig({
    env: env as Record<string, string>,
    fallbackModel: newSettings.fallbackModel || undefined,
    maxTurns: newSettings.maxTurns
  })
}

</script>

<style scoped>
.general-settings {
  padding-bottom: 40px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.section-desc {
  margin: 0 0 24px 0;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
}

/* 设置组 */
.settings-group {
  margin-bottom: 32px;
  padding: 20px;
  border-radius: 6px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.group-desc {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -8px 0 16px 0;
  padding: 8px 12px;
  border-radius: 4px;
  background: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-textLink-activeForeground);
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.group-desc strong {
  color: var(--vscode-textLink-activeForeground);
  font-weight: 600;
}

/* 设置项 */
.setting-item {
  margin-bottom: 20px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.checkbox-label {
  cursor: pointer;
}

.setting-input,
.setting-select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
  font-family: inherit;
}

.setting-input:focus,
.setting-select:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
}

.setting-select option {
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
}

.setting-select optgroup {
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  font-weight: 600;
}

.setting-input[type="password"] {
  font-family: monospace;
}

.setting-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.setting-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}

/* 徽章 */
.badge-realtime {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
  color: var(--vscode-badge-foreground, var(--vscode-button-foreground));
  font-size: 10px;
  font-weight: 600;
  font-style: normal;
}

.badge-restart {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
  color: var(--vscode-badge-foreground, var(--vscode-button-foreground));
  font-size: 10px;
  font-weight: 600;
  font-style: normal;
}

</style>
