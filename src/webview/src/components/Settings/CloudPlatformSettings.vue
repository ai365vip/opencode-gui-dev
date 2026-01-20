<template>
  <div class="cloud-platform-settings">
    <h3 class="section-title">云平台集成</h3>
    <p class="section-desc">配置 Amazon Bedrock 和 Google Vertex AI 集成（需重启会话生效）</p>

    <!-- Amazon Bedrock -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-cloud"></span>
        Amazon Bedrock
        <span class="badge-restart">需重启</span>
      </h4>
      <p class="group-desc">
        <span class="codicon codicon-info"></span>
        通过 AWS Bedrock 访问 Claude 模型。需要先配置 AWS 凭证（通过 AWS CLI 或环境变量）。
      </p>

      <div class="setting-item">
        <label class="setting-label checkbox-label">
          <input
            v-model="settings.useBedrockEnabled"
            type="checkbox"
            class="setting-checkbox"
            @change="markChanged"
          />
          <span>启用 Amazon Bedrock 集成</span>
        </label>
        <span class="setting-hint">env.CLAUDE_CODE_USE_BEDROCK</span>
      </div>

      <div v-if="settings.useBedrockEnabled" class="dependent-settings">
        <div class="setting-item">
          <label class="setting-label">AWS 区域</label>
          <input
            v-model="settings.awsRegion"
            type="text"
            class="setting-input"
            placeholder="us-east-1"
            @input="markChanged"
          />
          <span class="setting-hint">env.AWS_REGION - 例如：us-east-1, us-west-2</span>
        </div>

        <div class="setting-item">
          <label class="setting-label">AWS Profile（可选）</label>
          <input
            v-model="settings.awsProfile"
            type="text"
            class="setting-input"
            placeholder="default"
            @input="markChanged"
          />
          <span class="setting-hint">env.AWS_PROFILE - AWS配置文件名，用于SSO登录</span>
        </div>

        <div class="setting-item">
          <label class="setting-label checkbox-label">
            <input
              v-model="settings.disablePromptCaching"
              type="checkbox"
              class="setting-checkbox"
              @change="markChanged"
            />
            <span>禁用提示缓存</span>
          </label>
          <span class="setting-hint">env.DISABLE_PROMPT_CACHING - 如果所在区域不支持缓存则启用</span>
        </div>
      </div>
    </div>

    <!-- Google Vertex AI -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-cloud"></span>
        Google Vertex AI
        <span class="badge-restart">需重启</span>
      </h4>
      <p class="group-desc">
        <span class="codicon codicon-info"></span>
        通过 Google Cloud Vertex AI 访问 Claude 模型。需要先配置 gcloud 认证。
      </p>

      <div class="setting-item">
        <label class="setting-label checkbox-label">
          <input
            v-model="settings.useVertexEnabled"
            type="checkbox"
            class="setting-checkbox"
            @change="markChanged"
          />
          <span>启用 Google Vertex AI 集成</span>
        </label>
        <span class="setting-hint">env.CLAUDE_CODE_USE_VERTEX</span>
      </div>

      <div v-if="settings.useVertexEnabled" class="dependent-settings">
        <div class="setting-item">
          <label class="setting-label">Cloud ML 区域</label>
          <input
            v-model="settings.cloudMlRegion"
            type="text"
            class="setting-input"
            placeholder="us-east5"
            @input="markChanged"
          />
          <span class="setting-hint">env.CLOUD_ML_REGION - 例如：us-east5, europe-west1, global</span>
        </div>

        <div class="setting-item">
          <label class="setting-label">Vertex 项目 ID</label>
          <input
            v-model="settings.vertexProjectId"
            type="text"
            class="setting-input"
            placeholder="your-project-id"
            @input="markChanged"
          />
          <span class="setting-hint">env.ANTHROPIC_VERTEX_PROJECT_ID - 您的 GCP 项目ID</span>
        </div>

        <div class="setting-item">
          <label class="setting-label checkbox-label">
            <input
              v-model="settings.disablePromptCachingVertex"
              type="checkbox"
              class="setting-checkbox"
              @change="markChanged"
            />
            <span>禁用提示缓存</span>
          </label>
          <span class="setting-hint">env.DISABLE_PROMPT_CACHING - 如果所在区域不支持缓存则启用</span>
        </div>
      </div>
    </div>

    <!-- 警告提示 -->
    <div class="info-box warning">
      <span class="codicon codicon-warning"></span>
      <div>
        <p class="info-title">重要提示</p>
        <p class="info-desc">
          启用云平台集成后，将使用对应平台的 Claude 模型，而不是 Anthropic API。
          请确保您已完成相应的认证配置。<br />
          <strong>这些配置需要重启会话才能生效。</strong>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useClaudeConfig } from '../../composables/useClaudeConfig'

interface CloudPlatformSettingsData {
  // Amazon Bedrock
  useBedrockEnabled: boolean
  awsRegion: string
  awsProfile: string
  disablePromptCaching: boolean

  // Google Vertex AI
  useVertexEnabled: boolean
  cloudMlRegion: string
  vertexProjectId: string
  disablePromptCachingVertex: boolean
}

const { config, loadConfig, updateConfig } = useClaudeConfig()

const settings = ref<CloudPlatformSettingsData>({
  useBedrockEnabled: false,
  awsRegion: '',
  awsProfile: '',
  disablePromptCaching: false,
  useVertexEnabled: false,
  cloudMlRegion: '',
  vertexProjectId: '',
  disablePromptCachingVertex: false
})

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

function loadFromConfig(cfg: any) {
  const parseEnvBoolean = (value: string | undefined): boolean => {
    if (!value) return false
    const normalized = value.toLowerCase().trim()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  settings.value = {
    useBedrockEnabled: parseEnvBoolean(cfg.env?.CLAUDE_CODE_USE_BEDROCK),
    awsRegion: cfg.env?.AWS_REGION || '',
    awsProfile: cfg.env?.AWS_PROFILE || '',
    disablePromptCaching: parseEnvBoolean(cfg.env?.DISABLE_PROMPT_CACHING),
    useVertexEnabled: parseEnvBoolean(cfg.env?.CLAUDE_CODE_USE_VERTEX),
    cloudMlRegion: cfg.env?.CLOUD_ML_REGION || '',
    vertexProjectId: cfg.env?.ANTHROPIC_VERTEX_PROJECT_ID || '',
    disablePromptCachingVertex: parseEnvBoolean(cfg.env?.DISABLE_PROMPT_CACHING)
  }
}

function markChanged() {
  syncToConfig(settings.value)
}

function syncToConfig(newSettings: CloudPlatformSettingsData) {
  const env = { ...(config.value?.env || {}) }

  // Amazon Bedrock
  if (newSettings.useBedrockEnabled) {
    env.CLAUDE_CODE_USE_BEDROCK = '1'
  } else {
    delete env.CLAUDE_CODE_USE_BEDROCK
  }

  if (newSettings.awsRegion) {
    env.AWS_REGION = newSettings.awsRegion
  } else {
    delete env.AWS_REGION
  }

  if (newSettings.awsProfile) {
    env.AWS_PROFILE = newSettings.awsProfile
  } else {
    delete env.AWS_PROFILE
  }

  // Google Vertex AI
  if (newSettings.useVertexEnabled) {
    env.CLAUDE_CODE_USE_VERTEX = '1'
  } else {
    delete env.CLAUDE_CODE_USE_VERTEX
  }

  if (newSettings.cloudMlRegion) {
    env.CLOUD_ML_REGION = newSettings.cloudMlRegion
  } else {
    delete env.CLOUD_ML_REGION
  }

  if (newSettings.vertexProjectId) {
    env.ANTHROPIC_VERTEX_PROJECT_ID = newSettings.vertexProjectId
  } else {
    delete env.ANTHROPIC_VERTEX_PROJECT_ID
  }

  // DISABLE_PROMPT_CACHING（二选一）
  if (newSettings.disablePromptCaching || newSettings.disablePromptCachingVertex) {
    env.DISABLE_PROMPT_CACHING = '1'
  } else {
    delete env.DISABLE_PROMPT_CACHING
  }

  updateConfig({ env: env as Record<string, string> })
}
</script>

<style scoped>
.cloud-platform-settings {
  padding-bottom: 40px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
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
}

.group-desc {
  display: flex;
  align-items: flex-start;
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
}

.checkbox-label {
  cursor: pointer;
}

.setting-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
  font-family: inherit;
}

.setting-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
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

/* 依赖设置（缩进） */
.dependent-settings {
  margin-left: 24px;
  padding-left: 16px;
  border-left: 2px solid var(--vscode-panel-border);
}

/* 徽章 */
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

/* 信息提示框 */
.info-box {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 6px;
  background: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground);
}

.info-box.warning {
  background: var(--vscode-inputValidation-warningBackground);
  border-left-color: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
}

.info-box .codicon {
  font-size: 20px;
  color: var(--vscode-notificationsInfoIcon-foreground);
  flex-shrink: 0;
  margin-top: 2px;
}

.info-box.warning .codicon {
  color: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
}

.info-title {
  margin: 0 0 6px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.info-desc {
  margin: 0;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
}

.info-desc strong {
  color: var(--vscode-textLink-activeForeground);
  font-weight: 600;
}
</style>
