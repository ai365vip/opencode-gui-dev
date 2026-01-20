<template>
  <div class="permissions-settings">
    <h3 class="section-title">权限配置</h3>
    <p class="section-desc">配置工具权限、允许访问的目录等（需重启会话生效）</p>

    <!-- 权限模式 -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-shield"></span>
        权限模式
      </h4>

      <div class="setting-item">
        <label class="setting-label">
          当前权限模式
          <span class="badge-realtime">实时生效</span>
        </label>
        <select v-model="permissionMode" class="setting-select">
          <option value="default">Default - 默认模式，部分操作需确认</option>
          <option value="plan">Plan - 规划模式，每个操作都确认</option>
          <option value="acceptEdits">Accept Edits - 自动接受编辑</option>
          <option value="bypassPermissions">Bypass - 自动执行，不询问权限</option>
        </select>
        <span class="setting-hint">permissionMode - 权限模式可以实时切换，无需重启</span>
      </div>
    </div>

    <!-- 允许的工具 -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-check"></span>
        允许的工具 (permissions.allow)
        <span class="badge-restart">需重启</span>
      </h4>

      <div class="tools-list">
        <div
          v-for="tool in allowedTools"
          :key="tool"
          class="tool-item tool-allowed"
        >
          <span :class="`codicon codicon-${getToolIcon(tool)}`"></span>
          <span class="tool-name">{{ tool }}</span>
          <button
            class="tool-action"
            title="移除"
            @click="removeTool(tool, 'allow')"
          >
            <span class="codicon codicon-close"></span>
          </button>
        </div>

        <div v-if="allowedTools.length === 0" class="empty-state">
          <span class="codicon codicon-info"></span>
          <p>未配置允许的工具（所有工具都可用）</p>
        </div>
      </div>

      <div class="add-tool-section">
        <input
          v-model="toolToAdd"
          type="text"
          class="setting-input"
          placeholder="输入工具名称..."
        />
        <button
          class="btn btn-secondary"
          :disabled="!toolToAdd"
          @click="addTool('allow')"
        >
          <span class="codicon codicon-add"></span>
          添加到允许列表
        </button>
      </div>
    </div>

    <!-- 禁止的工具 -->
    <div class="settings-group">
      <h4 class="group-title">
        <span class="codicon codicon-error"></span>
        禁止的工具 (permissions.deny)
        <span class="badge-restart">需重启</span>
      </h4>

      <div class="tools-list">
        <div
          v-for="tool in deniedTools"
          :key="tool"
          class="tool-item tool-denied"
        >
          <span :class="`codicon codicon-${getToolIcon(tool)}`"></span>
          <span class="tool-name">{{ tool }}</span>
          <button
            class="tool-action"
            title="移除"
            @click="removeTool(tool, 'deny')"
          >
            <span class="codicon codicon-close"></span>
          </button>
        </div>

        <div v-if="deniedTools.length === 0" class="empty-state">
          <span class="codicon codicon-info"></span>
          <p>未配置禁止的工具</p>
        </div>
      </div>

      <div class="add-tool-section">
        <input
          v-model="toolToDeny"
          type="text"
          class="setting-input"
          placeholder="输入工具名称..."
        />
        <button
          class="btn btn-secondary"
          :disabled="!toolToDeny"
          @click="addTool('deny')"
        >
          <span class="codicon codicon-add"></span>
          添加到禁止列表
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useClaudeConfig } from '../../composables/useClaudeConfig'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'

// 内置工具列表
const BUILTIN_TOOLS = [
  'Bash',
  'LS',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'NotebookRead',
  'NotebookEdit',
  'Agent'
]

const { config, updateConfig, updatePermissions } = useClaudeConfig()

const permissionMode = ref<PermissionMode>('default')
const allowedTools = ref<string[]>([])
const deniedTools = ref<string[]>([])

const toolToAdd = ref('')
const toolToDeny = ref('')

onMounted(() => {
  if (config.value) {
    loadFromConfig(config.value)
  }
})

watch(() => config.value, (newConfig) => {
  if (newConfig) {
    loadFromConfig(newConfig)
  }
}, { deep: true })

// 监听 permissionMode 变化
watch(() => permissionMode.value, (newMode) => {
  updateConfig({ permissionMode: newMode })
})

function loadFromConfig(cfg: any) {
  permissionMode.value = cfg.permissionMode || 'default'
  allowedTools.value = cfg.permissions?.allow || []
  deniedTools.value = cfg.permissions?.deny || []
}

function getToolIcon(tool: string): string {
  if (tool.startsWith('mcp__')) {
    return 'server'
  }

  const iconMap: Record<string, string> = {
    'Bash': 'terminal',
    'LS': 'list-flat',
    'Read': 'book',
    'Write': 'edit',
    'Edit': 'pencil',
    'MultiEdit': 'file-text',
    'Glob': 'search',
    'Grep': 'search',
    'WebFetch': 'globe',
    'WebSearch': 'search-web',
    'TodoWrite': 'checklist',
    'NotebookRead': 'notebook',
    'NotebookEdit': 'notebook',
    'Agent': 'robot'
  }

  return iconMap[tool] || 'symbol-misc'
}

function addTool(type: 'allow' | 'deny') {
  const tool = type === 'allow' ? toolToAdd.value : toolToDeny.value
  if (!tool) return

  if (type === 'allow') {
    if (!allowedTools.value.includes(tool)) {
      const newAllowed = [...allowedTools.value, tool]
      allowedTools.value = newAllowed
      toolToAdd.value = ''
      updatePermissions(newAllowed, deniedTools.value)
    }
  } else {
    if (!deniedTools.value.includes(tool)) {
      const newDenied = [...deniedTools.value, tool]
      deniedTools.value = newDenied
      toolToDeny.value = ''
      updatePermissions(allowedTools.value, newDenied)
    }
  }
}

function removeTool(tool: string, type: 'allow' | 'deny') {
  if (type === 'allow') {
    const newAllowed = allowedTools.value.filter(t => t !== tool)
    allowedTools.value = newAllowed
    updatePermissions(newAllowed, deniedTools.value)
  } else {
    const newDenied = deniedTools.value.filter(t => t !== tool)
    deniedTools.value = newDenied
    updatePermissions(allowedTools.value, newDenied)
  }
}


</script>

<style scoped>
.permissions-settings {
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

.setting-select,
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

.setting-select:focus,
.setting-input:focus {
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

.setting-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}


/* 工具列表 */
.tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  min-height: 40px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid var(--vscode-panel-border);
}

.tool-allowed {
  background: var(--vscode-inputValidation-infoBackground);
  border-color: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
}

.tool-denied {
  background: var(--vscode-inputValidation-errorBackground);
  border-color: var(--vscode-testing-iconFailed, var(--vscode-charts-red));
}

.tool-name {
  font-weight: 500;
}

.tool-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.tool-action:hover {
  opacity: 1;
}

.tool-action .codicon {
  font-size: 12px;
}

/* 添加工具区域 */
.add-tool-section {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.add-tool-section .setting-input {
  flex: 1;
}

/* 空状态 */
.empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
  text-align: center;
  justify-content: center;
}

.empty-state .codicon {
  font-size: 16px;
  opacity: 0.6;
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

/* 操作按钮 */
.settings-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--vscode-panel-border);
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder));
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 重启提示 */
.restart-notice {
  display: flex;
  gap: 12px;
  padding: 16px;
  margin-top: 24px;
  border-radius: 6px;
  background: var(--vscode-inputValidation-warningBackground);
  border: 1px solid var(--vscode-editorWarning-border, var(--vscode-editorWarning-foreground));
}

.restart-notice .codicon {
  font-size: 20px;
  color: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
  flex-shrink: 0;
}

.notice-content {
  flex: 1;
}

.notice-content strong {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}

.notice-content p {
  margin: 0;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}
</style>
