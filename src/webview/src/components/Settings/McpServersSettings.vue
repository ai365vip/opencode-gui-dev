<template>
  <div class="mcp-settings">
    <h3 class="section-title">MCP 服务器配置</h3>
    <p class="section-desc">配置 Model Context Protocol (MCP) 服务器，扩展 OpenCode 的能力</p>

    <!-- 配置范围选择 -->
    <div class="scope-selector">
      <label class="scope-label">配置范围:</label>
      <div class="scope-buttons">
        <button
          :class="['scope-btn', { active: configScope === 'user' }]"
          @click="setScope('user')"
        >
          <span class="codicon codicon-home"></span>
          全局配置
          <span class="scope-hint">(~/.config/opencode/opencode.json)</span>
        </button>
        <button
          :class="['scope-btn', { active: configScope === 'project' }]"
          @click="setScope('project')"
        >
          <span class="codicon codicon-folder"></span>
          项目配置
          <span class="scope-hint">(.opencode/opencode.json)</span>
        </button>
      </div>
    </div>

    <!-- 服务器列表 -->
    <div v-if="serverEntries.length > 0" class="servers-list">
      <div
        v-for="[name, config] in serverEntries"
        :key="name"
        class="server-item"
      >
        <div class="server-header">
          <div class="server-info">
            <span class="codicon codicon-server"></span>
            <div class="server-name-group">
              <span class="server-name">{{ name }}</span>
            </div>
            <span class="server-type-badge">{{ getServerType(config) }}</span>
            <span v-if="!isServerEnabled(config)" class="status-badge disabled">已禁用</span>
            <span v-else class="status-badge enabled">已启用</span>
          </div>
          <div class="server-actions">
            <button
              class="icon-btn"
              :title="!isServerEnabled(config) ? '启用' : '禁用'"
              @click="toggleServer(name, config)"
            >
              <span
                :class="[
                  'codicon',
                  !isServerEnabled(config) ? 'codicon-debug-start' : 'codicon-debug-pause'
                ]"
              ></span>
            </button>
            <button
              class="icon-btn"
              title="编辑"
              @click="editServer(name, config)"
            >
              <span class="codicon codicon-edit"></span>
            </button>
            <button
              class="icon-btn danger"
              title="删除"
              @click="removeServer(name)"
            >
              <span class="codicon codicon-trash"></span>
            </button>
          </div>
        </div>
        <div class="server-details">
          <div v-if="config.type === 'local' && config.command && config.command.length > 0" class="detail-row">
            <span class="detail-label">命令:</span>
            <code class="detail-value">{{ config.command[0] }}</code>
          </div>
          <div v-if="config.type === 'local' && config.command && config.command.length > 1" class="detail-row">
            <span class="detail-label">参数:</span>
            <code class="detail-value">{{ config.command.slice(1).join(' ') }}</code>
          </div>
          <div v-if="config.type === 'remote' && config.url" class="detail-row">
            <span class="detail-label">URL:</span>
            <code class="detail-value">{{ config.url }}</code>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <span class="codicon codicon-server-environment"></span>
      <p>尚未配置任何 MCP 服务器</p>
    </div>

    <!-- 添加按钮 -->
    <div class="action-buttons">
      <button class="add-btn" @click="openAddDialog">
        <span class="codicon codicon-add"></span>
        添加 MCP 服务器
      </button>
      <button class="add-btn secondary" @click="openImportDialog">
        <span class="codicon codicon-json"></span>
        从 JSON 导入
      </button>
    </div>

    <!-- 添加/编辑对话框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click="closeDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h4>{{ isEditing ? '编辑' : '添加' }} MCP 服务器</h4>
          <button class="close-btn" @click="closeDialog">
            <span class="codicon codicon-close"></span>
          </button>
        </div>

        <div class="dialog-body">
          <!-- 服务器名称 -->
          <div class="form-group">
            <label class="form-label">服务器名称</label>
            <input
              v-model="editingServer.name"
              type="text"
              class="form-input"
              placeholder="例如: context7, playwright"
              :disabled="isEditing"
            />
          </div>

          <!-- 服务器类型 -->
          <div class="form-group">
            <label class="form-label">服务器类型</label>
            <select v-model="editingServer.type" class="form-select">
              <option value="local">local (本地命令)</option>
              <option value="remote">remote (URL)</option>
            </select>
          </div>

          <!-- local 配置 -->
          <template v-if="editingServer.type === 'local'">
            <div class="form-group">
              <label class="form-label">命令</label>
              <input
                v-model="editingServer.command"
                type="text"
                class="form-input"
                placeholder="例如: npx, node, python"
              />
            </div>
            <div class="form-group">
              <label class="form-label">参数（每行一个）</label>
              <textarea
                v-model="argsText"
                class="form-textarea"
                placeholder="例如:&#10;-y&#10;@modelcontextprotocol/server-filesystem"
                rows="4"
              ></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">环境变量（可选，JSON格式）</label>
              <textarea
                v-model="envText"
                class="form-textarea"
                placeholder='例如: {"API_KEY": "your-key"}'
                rows="3"
              ></textarea>
            </div>
          </template>

          <!-- remote 配置 -->
          <template v-else-if="editingServer.type === 'remote'">
            <div class="form-group">
              <label class="form-label">URL</label>
              <input
                v-model="editingServer.url"
                type="text"
                class="form-input"
                placeholder="例如: http://localhost:3000/sse 或 https://mcp.example.com"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Headers（可选，JSON格式）</label>
              <textarea
                v-model="headersText"
                class="form-textarea"
                placeholder='例如: {"Authorization": "Bearer token"}'
                rows="3"
              ></textarea>
            </div>
          </template>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialog">取消</button>
          <button class="btn-primary" @click="saveServer">保存</button>
        </div>
      </div>
    </div>

    <!-- JSON 导入对话框 -->
    <div v-if="showImportDialog" class="dialog-overlay" @click="closeImportDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h4>从 JSON 导入 MCP 服务器</h4>
          <button class="close-btn" @click="closeImportDialog">
            <span class="codicon codicon-close"></span>
          </button>
        </div>

        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">粘贴 JSON 配置</label>
            <textarea
              v-model="importJsonText"
              class="form-textarea json-input"
              placeholder='支持两种格式:&#10;&#10;1. 完整格式:&#10;{&#10;  "mcpServers": {&#10;    "postgresql": { ... }&#10;  }&#10;}&#10;&#10;2. 简化格式:&#10;{&#10;  "postgresql": { ... }&#10;}'
              rows="15"
            ></textarea>
          </div>
          <div v-if="importError" class="error-message">
            <span class="codicon codicon-error"></span>
            <span>{{ importError }}</span>
          </div>
          <div v-if="importPreview.length > 0" class="import-preview">
            <p class="preview-title">将导入以下服务器：</p>
            <ul class="preview-list">
              <li v-for="name in importPreview" :key="name">
                <span class="codicon codicon-check"></span>
                {{ name }}
              </li>
            </ul>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeImportDialog">取消</button>
          <button class="btn-primary" @click="parseImportJson" :disabled="!importJsonText.trim()">
            预览
          </button>
          <button class="btn-primary" @click="executeImport" :disabled="importPreview.length === 0">
            导入 ({{ importPreview.length }})
          </button>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="info-box">
      <span class="codicon codicon-info"></span>
      <div>
        <p class="info-title">关于 MCP 服务器</p>
        <p class="info-desc">
          MCP (Model Context Protocol) 服务器允许 OpenCode 访问外部工具和资源。
          修改后需要重启会话才能生效。详情请参考
          <a href="https://modelcontextprotocol.io" target="_blank">MCP 官方文档</a>。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue'
import { applyEdits, modify, parse } from 'jsonc-parser'
import { RuntimeKey } from '../../composables/runtimeContext'

type Scope = 'user' | 'project'

type ConfigState = {
  path: string
  exists: boolean
  isLoaded: boolean
  loading: boolean
  saving: boolean
  parseError: string
  error: string
  sourceText: string
  parsed: any
}

interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
}

interface McpServerConfig {
  type?: 'local' | 'remote'
  command?: string[]
  environment?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | false
  enabled?: boolean
  timeout?: number
}

const runtime = (() => {
  const rt = inject(RuntimeKey)
  if (!rt) throw new Error('[McpServersSettings] Runtime not provided')
  return rt
})()

// 配置范围
const configScope = ref<Scope>('user')

const state = reactive<ConfigState>({
  path: '',
  exists: false,
  isLoaded: false,
  loading: false,
  saving: false,
  parseError: '',
  error: '',
  sourceText: '',
  parsed: {}
})

const showAddDialog = ref(false)
const showImportDialog = ref(false)
const isEditing = ref(false)
const editingServerName = ref('')

const editingServer = ref<{
  name: string
  type: 'local' | 'remote'
  command: string
  url: string
}>({
  name: '',
  type: 'local',
  command: '',
  url: ''
})

const argsText = ref('')
const envText = ref('')
const headersText = ref('')

// JSON 导入相关
const importJsonText = ref('')
const importError = ref('')
const importPreview = ref<string[]>([])
const parsedServers = ref<Record<string, McpServerConfig>>({})

// 根据选择的范围显示对应的服务器列表
const serverEntries = computed<Array<[string, McpServerConfig]>>(() => {
  const raw = state.parsed?.mcp
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>)
    .filter(([name]) => !!name)
    .map(([name, cfg]) => [name, normalizeMcpConfig(cfg)] as [string, McpServerConfig])
    .sort((a, b) => a[0].localeCompare(b[0]))
})

// 加载配置
onMounted(async () => {
  await loadConfig()
})

function parseJsoncObject(text: string): { obj: any; error: string } {
  const errors: any[] = []
  const out = parse(text ?? '', errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: true
  }) as any
  if (errors.length > 0) {
    const first = errors[0]
    const offset = typeof first?.offset === 'number' ? first.offset : undefined
    return {
      obj: out && typeof out === 'object' ? out : {},
      error: `JSONC 解析失败${typeof offset === 'number' ? ` (offset ${offset})` : ''}`
    }
  }
  return { obj: out && typeof out === 'object' ? out : {}, error: '' }
}

function applyModify(text: string, jsonPath: Array<string | number>, value: any): string {
  const original = text ?? ''
  const trimmed = original.trim()
  const format = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }

  const apply = (source: string) => {
    const edits = modify(source, jsonPath, value, format)
    return applyEdits(source, edits)
  }
  if (!trimmed) {
    if (value === undefined) return original || '{\n}\n'
    const base = typeof jsonPath[0] === 'number' ? '[\n]\n' : '{\n}\n'
    return apply(base)
  }

  try {
    return apply(original)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (value === undefined && /delete in empty document/i.test(msg)) {
      return original
    }
    throw err
  }
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = String(k ?? '').trim()
    if (!key) continue
    out[key] = typeof v === 'string' ? v : String(v ?? '')
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeMcpConfig(value: unknown): McpServerConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const obj = value as Record<string, unknown>

  const out: McpServerConfig = {}
  if (obj.type === 'local' || obj.type === 'remote') {
    out.type = obj.type
  }

  if (typeof obj.enabled === 'boolean') out.enabled = obj.enabled
  if (typeof obj.timeout === 'number' && Number.isFinite(obj.timeout)) out.timeout = obj.timeout

  if (out.type === 'local') {
    const cmd = Array.isArray(obj.command)
      ? (obj.command as unknown[]).map((v: unknown) => String(v)).filter(Boolean)
      : undefined
    if (cmd && cmd.length > 0) out.command = cmd
    const env = normalizeStringRecord(obj.environment)
    if (env) out.environment = env
    return out
  }

  if (out.type === 'remote') {
    if (typeof obj.url === 'string') out.url = obj.url
    const headers = normalizeStringRecord(obj.headers)
    if (headers) out.headers = headers

    if (obj.oauth === false) out.oauth = false
    else if (obj.oauth && typeof obj.oauth === 'object' && !Array.isArray(obj.oauth)) {
      const o = obj.oauth as Record<string, unknown>
      const oauth: McpOAuthConfig = {}
      if (typeof o.clientId === 'string') oauth.clientId = o.clientId
      if (typeof o.clientSecret === 'string') oauth.clientSecret = o.clientSecret
      if (typeof o.scope === 'string') oauth.scope = o.scope
      out.oauth = oauth
    }

    return out
  }

  // toggle-only entry (e.g. { enabled: false })
  return out
}

function isServerEnabled(config: McpServerConfig): boolean {
  return config.enabled !== false
}

async function loadConfig(opts?: { silent?: boolean }): Promise<void> {
  if (state.loading) return
  state.loading = true
  if (!opts?.silent) state.error = ''
  state.parseError = ''

  try {
    const connection = await runtime.connectionManager.get()
    const resp = await connection.getOpencodeConfigFile('opencode', configScope.value)
    if (resp?.type !== 'get_opencode_config_file_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`)
    }

    state.path = String(resp.path ?? '')
    state.exists = !!resp.exists
    state.sourceText = String(resp.content ?? '')
    state.isLoaded = true

    const { obj, error } = parseJsoncObject(state.sourceText)
    state.parsed = obj
    state.parseError = error
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
  } finally {
    state.loading = false
  }
}

function getServerType(config: McpServerConfig): string {
  if (config.type === 'local') return 'local'
  if (config.type === 'remote') return 'remote'
  return 'toggle'
}

function editServer(name: string, serverConfig: McpServerConfig) {
  isEditing.value = true
  editingServerName.value = name

  const type = serverConfig.type === 'remote' ? 'remote' : 'local'
  editingServer.value = {
    name,
    type,
    command: '',
    url: ''
  }

  argsText.value = ''
  envText.value = ''
  headersText.value = ''

  if (type === 'local') {
    const cmd = serverConfig.command ?? []
    editingServer.value.command = cmd[0] ?? ''
    argsText.value = cmd.slice(1).join('\n')
    envText.value = serverConfig.environment ? JSON.stringify(serverConfig.environment, null, 2) : ''
  } else {
    editingServer.value.url = serverConfig.url ?? ''
    headersText.value = serverConfig.headers ? JSON.stringify(serverConfig.headers, null, 2) : ''
  }

  showAddDialog.value = true
}

async function toggleServer(name: string, serverConfig: McpServerConfig) {
  if (!name) return
  if (state.parseError) {
    state.error = state.parseError
    return
  }

  let next = state.sourceText
  next = applyModify(next, ['mcp', name, 'enabled'], !isServerEnabled(serverConfig))
  await saveRawConfig(next)
}

async function removeServer(name: string) {
  if (!name) return
  if (state.parseError) {
    state.error = state.parseError
    return
  }

  const ok = window.confirm(`确定删除 MCP 服务器 "${name}" 吗？`)
  if (!ok) return

  let next = state.sourceText
  next = applyModify(next, ['mcp', name], undefined)
  await saveRawConfig(next)
}

async function saveRawConfig(text: string): Promise<void> {
  if (state.saving) return
  if (!state.isLoaded) await loadConfig({ silent: true })
  if (state.parseError) {
    state.error = state.parseError
    return
  }

  state.saving = true
  state.error = ''

  try {
    const connection = await runtime.connectionManager.get()
    const resp = await connection.saveOpencodeConfigFile('opencode', text, configScope.value)
    if (resp?.type !== 'save_opencode_config_file_response') {
      throw new Error(`Unexpected response: ${String(resp?.type ?? resp)}`)
    }
    if (!resp.success) throw new Error(String(resp.error ?? '保存失败'))

    if (typeof resp.path === 'string') state.path = resp.path
    state.exists = true
    state.sourceText = text

    const { obj, error } = parseJsoncObject(state.sourceText)
    state.parsed = obj
    state.parseError = error
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
  } finally {
    state.saving = false
  }
}

async function setScope(scope: Scope): Promise<void> {
  if (scope === configScope.value) return
  if (showAddDialog.value || showImportDialog.value) {
    const ok = window.confirm('切换范围会关闭当前对话框，是否继续？')
    if (!ok) return
    closeDialog()
    closeImportDialog()
  }
  configScope.value = scope
  await loadConfig({ silent: true })
}

function openAddDialog(): void {
  state.error = ''
  isEditing.value = false
  editingServerName.value = ''
  editingServer.value = { name: '', type: 'local', command: '', url: '' }
  argsText.value = ''
  envText.value = ''
  headersText.value = ''
  showAddDialog.value = true
}

function openImportDialog(): void {
  importError.value = ''
  importPreview.value = []
  parsedServers.value = {}
  importJsonText.value = ''
  showImportDialog.value = true
}

function parseObjectJson(text: string): Record<string, string> | undefined {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  const normalized = normalizeStringRecord(parsed)
  if (!normalized) throw new Error('JSON 必须是对象，例如 {\"KEY\": \"VALUE\"}')
  return normalized
}

async function saveServer(): Promise<void> {
  state.error = ''

  const name = String(editingServer.value.name ?? '').trim()
  if (!name) {
    state.error = '请输入服务器名称'
    return
  }
  if (state.parseError) {
    state.error = state.parseError
    return
  }

  const originalName = isEditing.value ? String(editingServerName.value ?? '').trim() : ''
  const existingRaw =
    originalName && state.parsed?.mcp && typeof state.parsed.mcp === 'object' && !Array.isArray(state.parsed.mcp)
      ? (state.parsed.mcp as Record<string, unknown>)[originalName]
      : undefined
  const existing = existingRaw ? normalizeMcpConfig(existingRaw) : undefined
  const enabled = typeof existing?.enabled === 'boolean' ? existing.enabled : true
  const timeout = typeof existing?.timeout === 'number' ? existing.timeout : undefined

  try {
    let serverCfg: McpServerConfig

    if (editingServer.value.type === 'local') {
      const cmd = String(editingServer.value.command ?? '').trim()
      if (!cmd) {
        state.error = '请输入命令'
        return
      }

      const args = String(argsText.value ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      serverCfg = {
        type: 'local',
        command: [cmd, ...args],
        enabled,
        environment: envText.value.trim() ? parseObjectJson(envText.value) : undefined
      }
    } else {
      const url = String(editingServer.value.url ?? '').trim()
      if (!url) {
        state.error = '请输入 URL'
        return
      }

      serverCfg = {
        type: 'remote',
        url,
        enabled,
        headers: headersText.value.trim() ? parseObjectJson(headersText.value) : undefined
      }

      if (existing?.oauth !== undefined) serverCfg.oauth = existing.oauth
    }

    if (typeof timeout === 'number') serverCfg.timeout = timeout

    let next = state.sourceText
    if (originalName && originalName !== name) {
      next = applyModify(next, ['mcp', originalName], undefined)
    }
    next = applyModify(next, ['mcp', name], serverCfg)

    await saveRawConfig(next)
    if (!state.error) closeDialog()
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
  }
}

function closeDialog(): void {
  showAddDialog.value = false
  isEditing.value = false
  editingServerName.value = ''
  editingServer.value = { name: '', type: 'local', command: '', url: '' }
  argsText.value = ''
  envText.value = ''
  headersText.value = ''
}

/**
 * 解析并预览 JSON 导入
 */
function parseImportJson(): void {
  importError.value = ''
  importPreview.value = []
  parsedServers.value = {}

  try {
    const json = JSON.parse(importJsonText.value) as any

    let servers: Record<string, unknown> = {}
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      if (json.mcp && typeof json.mcp === 'object' && !Array.isArray(json.mcp)) servers = json.mcp
      else if (json.mcpServers && typeof json.mcpServers === 'object' && !Array.isArray(json.mcpServers)) {
        servers = json.mcpServers
      } else servers = json
    } else {
      importError.value = '无效的 JSON 格式'
      return
    }

    const validServers: Record<string, McpServerConfig> = {}
    const serverNames: string[] = []

    for (const [name, serverConfig] of Object.entries(servers)) {
      const id = String(name ?? '').trim()
      if (!id) continue

      const converted = coerceImportServerConfig(serverConfig)
      if (!converted) {
        importError.value = `服务器 "${id}" 配置格式错误`
        return
      }

      validServers[id] = converted
      serverNames.push(id)
    }

    if (serverNames.length === 0) {
      importError.value = '未找到有效的服务器配置'
      return
    }

    parsedServers.value = validServers
    importPreview.value = serverNames.sort((a, b) => a.localeCompare(b))
  } catch (error) {
    importError.value = 'JSON 解析失败: ' + (error instanceof Error ? error.message : String(error))
  }
}

function coerceImportServerConfig(value: unknown): McpServerConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const obj = value as Record<string, unknown>
  const enabledFromOld = obj.disabled === true ? false : typeof obj.enabled === 'boolean' ? obj.enabled : true

  if (obj.type === 'local') {
    const cmd = Array.isArray(obj.command)
      ? (obj.command as unknown[]).map((v: unknown) => String(v)).filter(Boolean)
      : undefined
    if (!cmd || cmd.length === 0) return undefined
    return {
      type: 'local',
      command: cmd,
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : enabledFromOld,
      environment: normalizeStringRecord(obj.environment),
      timeout: typeof obj.timeout === 'number' && Number.isFinite(obj.timeout) ? obj.timeout : undefined
    }
  }

  if (obj.type === 'remote') {
    const url = typeof obj.url === 'string' ? obj.url.trim() : ''
    if (!url) return undefined
    return {
      type: 'remote',
      url,
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : enabledFromOld,
      headers: normalizeStringRecord(obj.headers),
      oauth:
        obj.oauth === false
          ? false
          : obj.oauth && typeof obj.oauth === 'object' && !Array.isArray(obj.oauth)
            ? (obj.oauth as McpOAuthConfig)
            : undefined,
      timeout: typeof obj.timeout === 'number' && Number.isFinite(obj.timeout) ? obj.timeout : undefined
    }
  }

  // 兼容旧 GUI 格式 (stdio/sse/http)
  const legacyType = obj.type
  if (legacyType === 'stdio' || legacyType === undefined) {
    const command = typeof obj.command === 'string' ? obj.command.trim() : ''
    if (!command) return undefined
    const args = Array.isArray(obj.args) ? (obj.args as unknown[]).map((v) => String(v)).filter(Boolean) : []
    return {
      type: 'local',
      command: [command, ...args],
      enabled: enabledFromOld,
      environment: normalizeStringRecord(obj.env ?? obj.environment),
      timeout: typeof obj.timeout === 'number' && Number.isFinite(obj.timeout) ? obj.timeout : undefined
    }
  }

  if (legacyType === 'sse' || legacyType === 'http') {
    const url = typeof obj.url === 'string' ? obj.url.trim() : ''
    if (!url) return undefined
    return {
      type: 'remote',
      url,
      enabled: enabledFromOld,
      headers: normalizeStringRecord(obj.headers),
      timeout: typeof obj.timeout === 'number' && Number.isFinite(obj.timeout) ? obj.timeout : undefined
    }
  }

  if (typeof obj.enabled === 'boolean') return { enabled: obj.enabled }
  return undefined
}

/**
 * 执行导入
 */
async function executeImport(): Promise<void> {
  if (importPreview.value.length === 0) return
  if (state.parseError) {
    importError.value = state.parseError
    return
  }

  try {
    let next = state.sourceText
    for (const name of importPreview.value) {
      const cfg = parsedServers.value[name]
      if (!cfg) continue
      next = applyModify(next, ['mcp', name], cfg)
    }
    await saveRawConfig(next)
    if (!state.error) closeImportDialog()
  } catch (err) {
    importError.value = err instanceof Error ? err.message : String(err)
  }
}

/**
 * 关闭导入对话框
 */
function closeImportDialog(): void {
  showImportDialog.value = false
  importJsonText.value = ''
  importError.value = ''
  importPreview.value = []
  parsedServers.value = {}
}
</script>

<style scoped>
.mcp-settings {
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

.servers-list {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-item {
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
}

.server-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.server-name-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.server-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.server-description {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-type-badge {
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-badge.enabled {
  background: var(--vscode-testing-iconPassed, #73c991);
  color: var(--vscode-button-foreground, #fff);
}

.status-badge.disabled {
  background: var(--vscode-errorForeground, #f48771);
  color: var(--vscode-button-foreground, #fff);
}

.server-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
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

.icon-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.icon-btn.danger:hover {
  background: var(--vscode-errorForeground);
  color: var(--vscode-errorBackground);
}

.server-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.detail-label {
  color: var(--vscode-descriptionForeground);
  min-width: 50px;
}

.detail-value {
  color: var(--vscode-textPreformat-foreground);
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  flex: 1;
  word-break: break-all;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
}

.empty-state .codicon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.add-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.add-btn.secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.add-btn.secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.dialog-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
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

.close-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
  font-family: var(--vscode-font-family);
}

.form-select {
  cursor: pointer;
  /* 覆盖系统默认样式 */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  /* 添加自定义下拉箭头 - 使用 CSS 绘制三角形 */
  background-image: linear-gradient(45deg, transparent 50%, var(--vscode-input-foreground) 50%),
                    linear-gradient(135deg, var(--vscode-input-foreground) 50%, transparent 50%);
  background-position: calc(100% - 16px) calc(50% - 2px),
                       calc(100% - 12px) calc(50% - 2px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  background-color: var(--vscode-input-background);
  padding-right: 32px;
}

.form-select:hover {
  border-color: var(--vscode-inputOption-activeBorder, var(--vscode-focusBorder));
}

.form-select option {
  background-color: var(--vscode-dropdown-background, var(--vscode-input-background)) !important;
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground)) !important;
  padding: 4px 8px;
}

.form-select option:hover {
  background-color: var(--vscode-list-hoverBackground, var(--vscode-inputOption-activeBackground)) !important;
  color: var(--vscode-list-hoverForeground, var(--vscode-foreground)) !important;
}

.form-select option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-textarea {
  resize: vertical;
  font-family: var(--vscode-editor-font-family);
  line-height: 1.5;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

.dialog-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--vscode-panel-border);
}

.btn-secondary,
.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.info-box {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 6px;
  background: var(--vscode-textBlockQuote-background, var(--vscode-editor-inactiveSelectionBackground));
  border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground);
}

.info-box .codicon {
  font-size: 20px;
  color: var(--vscode-notificationsInfoIcon-foreground);
  flex-shrink: 0;
  margin-top: 2px;
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

.info-desc a {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.info-desc a:hover {
  text-decoration: underline;
}

/* JSON 导入样式 */
.json-input {
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  line-height: 1.5;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-top: 12px;
  border-radius: 4px;
  background: var(--vscode-inputValidation-errorBackground, rgba(244, 135, 113, 0.1));
  border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
  color: var(--vscode-errorForeground);
  font-size: 12px;
}

.error-message .codicon {
  flex-shrink: 0;
}

.import-preview {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
  border: 1px solid var(--vscode-panel-border);
}

.preview-title {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vscode-foreground);
}

.preview-list .codicon {
  color: var(--vscode-testing-iconPassed, #73c991);
}

/* 配置范围选择器 */
.scope-selector {
  margin-bottom: 20px;
  padding: 12px;
  border-radius: 4px;
  background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--vscode-panel-border);
}

.scope-label {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.scope-buttons {
  display: flex;
  gap: 8px;
}

.scope-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  border: 2px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scope-btn:hover {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-hoverBackground);
}

.scope-btn.active {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.scope-btn .codicon {
  font-size: 16px;
}

.scope-hint {
  font-size: 11px;
  opacity: 0.7;
  font-weight: normal;
  font-family: var(--vscode-font-family);
}
</style>
