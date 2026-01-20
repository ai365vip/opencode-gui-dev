<template>
  <DropdownTrigger
    ref="dropdownRef"
    align="left"
    :width="320"
    @open="handleOpen"
    @close="handleClose"
  >
    <template #trigger>
      <button
        class="mcp-trigger-button"
        :class="{ 'has-servers': projectServers.length > 0 }"
        :title="projectServers.length > 0 ? `项目MCP (${enabledCount}/${projectServers.length})` : '项目MCP (无)'"
      >
        <span class="codicon codicon-server-process" />
        <span v-if="projectServers.length > 0" class="server-count">{{ enabledCount }}</span>
      </button>
    </template>

    <template #content="{ close }">
      <div class="mcp-quick-manager">
        <div class="manager-header">
          <span class="header-title">
            <span class="codicon codicon-server-process" />
            项目 MCP
          </span>
        </div>

        <div class="server-list" v-if="projectServers.length > 0">
          <div
            v-for="server in projectServers"
            :key="server.name"
            class="server-item"
            @click="toggleServer(server)"
          >
            <div class="server-info">
              <span class="codicon codicon-server" />
              <div class="server-details">
                <div class="server-name">{{ server.name }}</div>
                <div v-if="server.description" class="server-desc">{{ server.description }}</div>
              </div>
            </div>
            <div class="server-toggle">
              <span
                :class="['toggle-indicator', server.disabled ? 'disabled' : 'enabled']"
                :title="server.disabled ? '已禁用' : '已启用'"
              >
                <span :class="['codicon', server.disabled ? 'codicon-circle-slash' : 'codicon-pass-filled']" />
              </span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <span class="codicon codicon-info" />
          <p>当前项目未配置MCP服务器</p>
        </div>

      </div>
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { DropdownTrigger } from './Dropdown'
import { RuntimeKey } from '../composables/runtimeContext'

interface McpServerConfig {
  description?: string
  type?: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled?: boolean
}

interface McpServer {
  name: string
  config: McpServerConfig
  description?: string
  disabled?: boolean
}

const runtime = inject(RuntimeKey)
const dropdownRef = ref<InstanceType<typeof DropdownTrigger>>()

const projectServers = ref<McpServer[]>([])
const isLoading = ref(false)

const enabledCount = computed(() => {
  return projectServers.value.filter(s => !s.disabled).length
})

async function loadProjectServers() {
  if (!runtime) {
    console.error('[McpQuickManager] Runtime 未初始化')
    return
  }

  isLoading.value = true
  try {
    const connection = await runtime.connectionManager.get()
    const response = await connection.getClaudeConfig('project', 'mcp')

    const mcpServers = response.config.mcpServers || {}
    projectServers.value = Object.entries(mcpServers).map(([name, config]) => ({
      name,
      config: config as McpServerConfig,
      description: (config as McpServerConfig).description,
      disabled: (config as McpServerConfig).disabled || false
    }))

    console.log('[McpQuickManager] 项目MCP服务器加载完成:', projectServers.value.length)
  } catch (error) {
    console.error('[McpQuickManager] 加载项目MCP失败:', error)
  } finally {
    isLoading.value = false
  }
}

async function toggleServer(server: McpServer) {
  if (!runtime) return

  try {
    const connection = await runtime.connectionManager.get()

    const newDisabledState = !server.disabled

    const updatedConfig = {
      ...server.config,
      disabled: newDisabledState
    }

    const currentServers = projectServers.value.reduce((acc, s) => {
      acc[s.name] = s.name === server.name ? updatedConfig : s.config
      return acc
    }, {} as Record<string, McpServerConfig>)

    const plainServers = JSON.parse(JSON.stringify(currentServers))

    await connection.saveClaudeConfig(
      { mcpServers: plainServers },
      'project',
      'mcp'
    )

    server.disabled = newDisabledState
    console.log(`[McpQuickManager] ${server.name} ${newDisabledState ? '已禁用' : '已启用'}`)
  } catch (error) {
    console.error('[McpQuickManager] 切换服务器状态失败:', error)
  }
}

function handleOpen() {
  loadProjectServers()
}

function handleClose() {
  // 关闭时无需操作
}

onMounted(() => {
  loadProjectServers()
})
</script>

<style scoped>
.mcp-trigger-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  color: var(--vscode-foreground);
  opacity: 0.5;
}

.mcp-trigger-button:hover {
  opacity: 1;
}

.mcp-trigger-button.has-servers {
  opacity: 0.8;
}

.mcp-trigger-button.has-servers:hover {
  opacity: 1;
}

.server-count {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 9px;
  font-weight: 600;
  padding: 0 3px;
  border-radius: 8px;
  min-width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.mcp-quick-manager {
  display: flex;
  flex-direction: column;
  max-height: 400px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-dropdown-border);
  background: var(--vscode-dropdown-background);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-foreground);
}


.server-list {
  overflow-y: auto;
  max-height: 280px;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-dropdown-border) 50%, transparent);
}

.server-item:last-child {
  border-bottom: none;
}

.server-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.server-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.server-info .codicon {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.8;
}

.server-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.server-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-desc {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-toggle {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.toggle-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  transition: background 0.15s;
}

.toggle-indicator.enabled {
  color: var(--vscode-testing-iconPassed, #73c991);
}

.toggle-indicator.disabled {
  color: var(--vscode-errorForeground, #f48771);
  opacity: 0.6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  gap: 12px;
  color: var(--vscode-descriptionForeground);
}

.empty-state .codicon {
  font-size: 32px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 12px;
  text-align: center;
}

</style>
