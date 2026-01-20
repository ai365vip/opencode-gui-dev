<template>
  <div class="skills-settings">
    <h3 class="section-title">Skills 管理</h3>
    <p class="section-desc">
      展示 oh-my-opencode hooks（以 Skills 形式展示）；启用/禁用会写入当前项目的 <code>.opencode/oh-my-opencode.json</code>
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
      <span>正在加载 Skills...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <span class="codicon codicon-error"></span>
      <span>加载失败: {{ error }}</span>
    </div>

    <!-- Skills 列表 -->
    <div v-else-if="skills.length > 0" class="skills-list">
      <div
        v-for="skill in skills"
        :key="skill.id"
        class="skill-card"
        :class="{ disabled: !skill.enabled }"
      >
        <div class="skill-header" @click="selectSkill(skill)">
          <div class="skill-icon">
            <span class="codicon codicon-extensions"></span>
          </div>
          <div class="skill-info">
            <h4 class="skill-name">{{ skill.name }}</h4>
            <span v-if="skill.version" class="skill-version">v{{ skill.version }}</span>
          </div>
          <div class="skill-status">
            <span v-if="skill.enabled" class="status-badge enabled">已启用</span>
            <span v-else class="status-badge disabled">已禁用</span>
          </div>
        </div>
        <p class="skill-description" @click="selectSkill(skill)">{{ skill.description || '无描述' }}</p>
        <div v-if="skill.author || skill.license" class="skill-meta" @click="selectSkill(skill)">
          <div v-if="skill.author" class="meta-item">
            <span class="codicon codicon-person"></span>
            <span>{{ skill.author }}</span>
          </div>
          <div v-if="skill.license" class="meta-item">
            <span class="codicon codicon-law"></span>
            <span>{{ skill.license }}</span>
          </div>
        </div>
        <div class="skill-actions">
          <button
            class="btn-action"
            :class="{ active: skill.enabled }"
            @click.stop="handleToggleSkill(skill)"
            :title="skill.enabled ? '禁用' : '启用'"
          >
            <span :class="skill.enabled ? 'codicon codicon-eye' : 'codicon codicon-eye-closed'"></span>
            <span>{{ skill.enabled ? '禁用' : '启用' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <span class="codicon codicon-extensions"></span>
      <p class="empty-title">未找到 Skills</p>
      <p class="empty-desc">
        请确认已安装 oh-my-opencode，并检查 <code>.opencode/oh-my-opencode.json</code>
      </p>
    </div>

    <!-- Skill 详情对话框 -->
    <div v-if="selectedSkill" class="modal-overlay" @click="closeModal">
      <div class="modal-dialog" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">{{ selectedSkill.name }}</h3>
          <button class="modal-close" @click="closeModal">
            <span class="codicon codicon-close"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="detail-section">
            <label>描述</label>
            <p>{{ selectedSkill.description || '无描述' }}</p>
          </div>
          <div class="detail-section">
            <label>ID</label>
            <p>{{ selectedSkill.id }}</p>
          </div>
          <div v-if="selectedSkill.version" class="detail-section">
            <label>版本</label>
            <p>{{ selectedSkill.version }}</p>
          </div>
          <div v-if="selectedSkill.author" class="detail-section">
            <label>作者</label>
            <p>{{ selectedSkill.author }}</p>
          </div>
          <div v-if="selectedSkill.license" class="detail-section">
            <label>许可证</label>
            <p>{{ selectedSkill.license }}</p>
          </div>
          <div class="detail-section">
            <label>状态</label>
            <p>{{ selectedSkill.enabled ? '已启用' : '已禁用' }}</p>
          </div>
          <div class="detail-section">
            <label>路径</label>
            <p class="path-text">{{ selectedSkill.path }}</p>
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
import type { SkillInfo } from '../../../../shared/messages'

const runtime = inject(RuntimeKey)

if (!runtime) {
  throw new Error('[SkillsSettings] Runtime not provided')
}

const skills = ref<SkillInfo[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const selectedSkill = ref<SkillInfo | null>(null)

onMounted(async () => {
  await loadSkills()
})

async function loadSkills() {
  isLoading.value = true
  error.value = null

  try {
    const connection = await runtime!.connectionManager.get()
    const response = await connection.getSkills()

    if (response.type === 'get_skills_response') {
      skills.value = response.skills
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    console.error('[SkillsSettings] 加载 Skills 失败:', err)
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
    console.error('[SkillsSettings] 打开 oh-my-opencode 配置失败:', err)
  }
}

function selectSkill(skill: SkillInfo) {
  selectedSkill.value = skill
}

function closeModal() {
  selectedSkill.value = null
}

async function handleToggleSkill(skill: SkillInfo) {
  try {
    const connection = await runtime!.connectionManager.get()
    const newEnabled = !skill.enabled

    const response = await connection.toggleSkill(skill.id, newEnabled)

    if (response.type === 'toggle_skill_response' && response.success) {
      // 更新本地状态
      skill.enabled = newEnabled
      console.log(`[SkillsSettings] Skill "${skill.name}" ${newEnabled ? '已启用' : '已禁用'}`)
    } else {
      console.error('[SkillsSettings] 切换失败:', response.error)
      error.value = response.error || '操作失败'
    }
  } catch (err: any) {
    console.error('[SkillsSettings] 切换 Skill 失败:', err)
    error.value = err.message || '操作失败'
  }
}
</script>

<style scoped>
/* 继承 AgentsSettings 的样式，并添加 Skills 特有样式 */
.skills-settings {
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

.skills-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.skill-card {
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
}

.skill-card.disabled {
  opacity: 0.6;
}

.skill-card:hover {
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.skill-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  cursor: pointer;
}

.skill-status {
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

.skill-icon {
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

.skill-icon .codicon {
  font-size: 20px;
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-name {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-version {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 11px;
  font-weight: 600;
}

.skill-status {
  display: flex;
  align-items: flex-start;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}

.status-badge.enabled {
  background: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
  color: var(--vscode-button-foreground);
}

.status-badge.disabled {
  background: var(--vscode-input-background);
  color: var(--vscode-descriptionForeground);
  border: 1px solid var(--vscode-panel-border);
}

.skill-description {
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

.skill-meta {
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
.skill-actions {
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

/* 模态框样式（与 AgentsSettings 相同） */
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--vscode-panel-border);
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--vscode-panel-border);
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
