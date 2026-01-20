<template>
  <div class="agents-settings">
    <h3 class="section-title">Agents 管理</h3>
    <p class="section-desc">
      展示 OpenCode server 提供的 Agents；启用/禁用会写入当前项目的 <code>.opencode/oh-my-opencode.json</code>
    </p>

    <div class="action-row">
      <button class="btn-action" @click="openOhMyConfig" title="打开 oh-my-opencode 配置">
        <span class="codicon codicon-settings-gear"></span>
        <span>打开 oh-my-opencode 配置</span>
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-state">
      <span class="codicon codicon-loading codicon-modifier-spin"></span>
      <span>正在加载 Agents...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <span class="codicon codicon-error"></span>
      <span>加载失败: {{ error }}</span>
    </div>

    <!-- Agents 列表 -->
    <div v-else-if="agents.length > 0" class="agents-list">
      <div
        v-for="agent in agents"
        :key="agent.path"
        class="agent-card"
        :class="{ disabled: !agent.enabled }"
      >
        <div class="agent-header" @click="selectAgent(agent)">
          <div class="agent-icon">
            <span class="codicon codicon-robot"></span>
          </div>
          <div class="agent-info">
            <h4 class="agent-name">{{ agent.name }}</h4>
            <span class="agent-category">{{ agent.category }}</span>
          </div>
          <div class="agent-status">
            <span v-if="agent.enabled" class="status-badge enabled">已启用</span>
            <span v-else class="status-badge disabled">已禁用</span>
          </div>
        </div>
        <p class="agent-description" @click="selectAgent(agent)">{{ agent.description || '无描述' }}</p>
        <div class="agent-meta" @click="selectAgent(agent)">
          <div v-if="agent.model" class="meta-item">
            <span class="codicon codicon-chip"></span>
            <span>{{ agent.model }}</span>
          </div>
          <div v-if="agent.tools && agent.tools.length > 0" class="meta-item">
            <span class="codicon codicon-tools"></span>
            <span>{{ agent.tools.length }} 个工具</span>
          </div>
        </div>
        <div class="agent-actions">
          <button
            class="btn-action"
            :class="{ active: agent.enabled }"
            @click.stop="handleToggleAgent(agent)"
            :title="agent.enabled ? '禁用' : '启用'"
          >
            <span :class="agent.enabled ? 'codicon codicon-eye' : 'codicon codicon-eye-closed'"></span>
            <span>{{ agent.enabled ? '禁用' : '启用' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <span class="codicon codicon-inbox"></span>
      <p class="empty-title">未找到 Agents</p>
      <p class="empty-desc">
        请确认 OpenCode server 已启动，或在 <code>.opencode/oh-my-opencode.json</code> 中配置 agents
      </p>
    </div>

    <!-- Agent 详情对话框 -->
    <div v-if="selectedAgent" class="modal-overlay" @click="closeModal">
      <div class="modal-dialog" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">{{ selectedAgent.name }}</h3>
          <button class="modal-close" @click="closeModal">
            <span class="codicon codicon-close"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="detail-section">
            <label>描述</label>
            <p>{{ selectedAgent.description || '无描述' }}</p>
          </div>
          <div class="detail-section">
            <label>分类</label>
            <p>{{ selectedAgent.category }}</p>
          </div>
          <div v-if="selectedAgent.model" class="detail-section">
            <label>模型</label>
            <p>{{ selectedAgent.model }}</p>
          </div>
          <div v-if="selectedAgent.tools && selectedAgent.tools.length > 0" class="detail-section">
            <label>工具</label>
            <div class="tools-list">
              <span v-for="tool in selectedAgent.tools" :key="tool" class="tool-badge">
                {{ tool }}
              </span>
            </div>
          </div>
          <div class="detail-section">
            <label>路径</label>
            <p class="path-text">{{ selectedAgent.path }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">关闭</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { AgentInfo } from '../../../../shared/messages'

const runtime = inject(RuntimeKey)

if (!runtime) {
  throw new Error('[AgentsSettings] Runtime not provided')
}

const agents = ref<AgentInfo[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const selectedAgent = ref<AgentInfo | null>(null)

onMounted(async () => {
  await loadAgents()
})

async function loadAgents() {
  isLoading.value = true
  error.value = null

  try {
    const connection = await runtime!.connectionManager.get()
    const response = await connection.getAgents()

    if (response.type === 'get_agents_response') {
      agents.value = response.agents
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    console.error('[AgentsSettings] 加载 Agents 失败:', err)
  } finally {
    isLoading.value = false
  }
}

async function openOhMyConfig() {
  try {
    const connection = await runtime!.connectionManager.get()
    await connection.openConfigFile('oh-my-opencode')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    console.error('[AgentsSettings] 打开 oh-my-opencode 配置失败:', err)
  }
}

function selectAgent(agent: AgentInfo) {
  selectedAgent.value = agent
}

function closeModal() {
  selectedAgent.value = null
}

async function handleToggleAgent(agent: AgentInfo) {
  try {
    const connection = await runtime!.connectionManager.get()
    const newEnabled = !agent.enabled

    const response = await connection.toggleAgent(agent.name, newEnabled)

    if (response.type === 'toggle_agent_response' && response.success) {
      // 更新本地状态
      agent.enabled = newEnabled
      console.log(`[AgentsSettings] Agent "${agent.name}" ${newEnabled ? '已启用' : '已禁用'}`)
    } else {
      console.error('[AgentsSettings] 切换失败:', response.error)
      error.value = response.error || '操作失败'
    }
  } catch (err: any) {
    console.error('[AgentsSettings] 切换 Agent 失败:', err)
    error.value = err.message || '操作失败'
  }
}
</script>

<style scoped>
.agents-settings {
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

.action-row {
  display: flex;
  justify-content: flex-end;
  margin: -8px 0 16px;
}

/* 加载状态 */
.loading-state,
.error-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 40px;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
  font-size: 14px;
}

.error-state {
  color: var(--vscode-errorForeground);
}

.loading-state .codicon-loading {
  font-size: 20px;
}

/* Agents 列表 */
.agents-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.agent-card {
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
}

.agent-card.disabled {
  opacity: 0.6;
}

.agent-card:hover {
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.agent-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  cursor: pointer;
}

.agent-status {
  margin-left: auto;
  flex-shrink: 0;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.enabled {
  background: var(--vscode-testing-iconPassed, #4caf50);
  color: white;
}

.status-badge.disabled {
  background: var(--vscode-testing-iconFailed, #f44336);
  color: white;
}

.agent-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  flex-shrink: 0;
}

.agent-icon .codicon {
  font-size: 20px;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-category {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.agent-description {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
}

.agent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  cursor: pointer;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.meta-item .codicon {
  font-size: 14px;
}

/* 操作按钮 */
.agent-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--vscode-panel-border);
}

.btn-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-action:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-action.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-action.btn-danger {
  background: var(--vscode-errorBackground, #f443364d);
  color: var(--vscode-errorForeground, #f44336);
  border-color: var(--vscode-errorForeground, #f44336);
}

.btn-action.btn-danger:hover {
  background: var(--vscode-errorForeground, #f44336);
  color: white;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state .codicon {
  font-size: 48px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
}

.empty-desc code {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--vscode-textCodeBlock-background);
  font-family: var(--vscode-editor-font-family);
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-dialog {
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.modal-confirm {
  max-width: 480px;
}

.modal-confirm .modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vscode-errorForeground, #f44336);
}

.modal-confirm .modal-title .codicon {
  font-size: 20px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
}

.modal-close:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
}

.detail-section p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.path-text {
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
}

.tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-badge {
  padding: 4px 8px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 11px;
  font-weight: 600;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--vscode-panel-border);
}

.confirm-message {
  margin: 0 0 12px 0;
  font-size: 14px;
  line-height: 1.5;
}

.confirm-message strong {
  color: var(--vscode-errorForeground, #f44336);
}

.confirm-warning {
  margin: 0;
  padding: 12px;
  border-radius: 4px;
  background: var(--vscode-inputValidation-warningBackground);
  border-left: 3px solid var(--vscode-inputValidation-warningBorder);
  font-size: 13px;
  color: var(--vscode-inputValidation-warningForeground);
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border, transparent);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-danger {
  background: var(--vscode-errorBackground, #f443364d);
  color: var(--vscode-errorForeground, #f44336);
  border: 1px solid var(--vscode-errorForeground, #f44336);
}

.btn-danger:hover:not(:disabled) {
  background: var(--vscode-errorForeground, #f44336);
  color: white;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
