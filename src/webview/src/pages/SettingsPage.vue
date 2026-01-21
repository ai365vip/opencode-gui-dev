<template>
  <div class="settings-page">
    <!-- 头部 -->
    <div class="settings-header">
      <div class="header-left">
        <button class="back-btn" title="返回" @click="$emit('close')">
          <span class="codicon codicon-arrow-left"></span>
        </button>
        <h2 class="settings-title">设置</h2>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="settings-content">
      <!-- 侧边栏导航 -->
      <nav class="settings-nav">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="['nav-item', { active: currentSection === section.id }]"
          @click="currentSection = section.id"
        >
          <span :class="`codicon codicon-${section.icon}`"></span>
          <span class="nav-label">{{ section.label }}</span>
          <span v-if="section.needsRestart" class="badge-restart" title="需要重启会话">!</span>
        </button>
      </nav>

      <!-- 内容面板 -->
        <div class="settings-panel">
          <div class="panel-container">
            <!-- OpenCode 配置 -->
            <OpenCodeFilesSettings v-if="currentSection === 'opencodeFiles'" />
            <OhMySettings v-else-if="currentSection === 'ohMy'" />
 
            <!-- MCP服务器 -->
            <ProvidersSettings v-else-if="currentSection === 'providers'" />
            <McpServersSettings v-else-if="currentSection === 'mcp'" />
 
            <!-- Agents -->
            <AgentsSettings v-else-if="currentSection === 'agents'" />
 
          <!-- Skills -->
          <SkillsSettings v-else-if="currentSection === 'skills'" />
        </div>
      </div>
    </div>
  </div>
</template>

 <script setup lang="ts">
 import { ref } from 'vue'
 import McpServersSettings from '../components/Settings/McpServersSettings.vue'
 import OpenCodeFilesSettings from '../components/Settings/OpenCodeFilesSettings.vue'
 import OhMySettings from '../components/Settings/OhMySettings.vue'
 import ProvidersSettings from '../components/Settings/ProvidersSettings.vue'
 import AgentsSettings from '../components/Settings/AgentsSettings.vue'
 import SkillsSettings from '../components/Settings/SkillsSettings.vue'

interface SettingsSection {
  id: string
  label: string
  icon: string
  needsRestart?: boolean
}

defineEmits<{
  close: []
}>()

const currentSection = ref('opencodeFiles')

 const sections: SettingsSection[] = [
   {
     id: 'opencodeFiles',
     label: 'OpenCode 配置',
     icon: 'json'
   },
   {
     id: 'ohMy',
     label: 'oh-my-opencode',
     icon: 'settings-gear'
   },
   {
     id: 'providers',
     label: 'Providers',
     icon: 'cloud'
   },
  { id: 'mcp', label: 'MCP服务器', icon: 'server', needsRestart: true },
  {
    id: 'agents',
    label: 'Agents',
    icon: 'robot'
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: 'extensions'
  }
]
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

/* 头部 */
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
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
  transition: background-color 0.15s;
}

.back-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.settings-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

/* 内容区域 */
.settings-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 侧边栏导航 */
.settings-nav {
  width: 200px;
  padding: 12px 8px;
  border-right: 1px solid var(--vscode-panel-border);
  overflow-y: auto;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
  position: relative;
}

.nav-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.nav-item.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.nav-label {
  flex: 1;
}

.badge-restart {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
  color: var(--vscode-badge-foreground, var(--vscode-button-foreground));
  font-size: 10px;
  font-weight: bold;
}

/* 内容面板 */
.settings-panel {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px 24px;
}

.panel-container {
  max-width: 800px;
  margin: 0 auto;
  min-height: 100%;
}
</style>
