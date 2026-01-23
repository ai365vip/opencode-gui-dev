import type { CommandAction } from '../core/AppContext'
import type { RuntimeInstance } from '../composables/useRuntime'
import type { DropdownItemType } from '../types/dropdown'

/**
 * Slash Command 数据提供者
 *
 * 从 CommandRegistry 获取并过滤 slash commands
 */

// 带 section 信息的命令
export interface CommandWithSection extends CommandAction {
  section: string
}

/**
 * 获取 slash commands
 *
 * @param query 搜索查询（可选）
 * @param runtime Runtime 实例
 * @returns 命令列表
 */
export function getSlashCommands(
  query: string,
  runtime: RuntimeInstance | undefined
): CommandAction[] {
  if (!runtime) return []

  const commandsBySection = runtime.appContext.commandRegistry.getCommandsBySection()
  const allCommands = commandsBySection['Slash Commands'] || []

  const normalized = String(query ?? '').trim()

  // 没有输入（只敲了 "/"）：不要直接把所有命令都塞给下拉框，会非常长且影响体验。
  // 只展示一小部分“常用命令” + 少量补全，继续输入即可过滤更多。
  if (!normalized) {
    return pickDefaultSlashCommands(allCommands)
  }

  // 过滤命令：匹配 label 或 description
  const lowerQuery = normalized.toLowerCase()
  const filtered = allCommands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.description?.toLowerCase().includes(lowerQuery)
  )

  return sortAndLimitSlashCommands(filtered, lowerQuery)
}

/**
 * 获取带分组信息的 slash commands（用于 ButtonArea）
 *
 * @param query 搜索查询（可选）
 * @param runtime Runtime 实例
 * @returns 带分组信息的命令列表
 */
export function getSlashCommandsWithSection(
  query: string,
  runtime: RuntimeInstance | undefined
): CommandWithSection[] {
  if (!runtime) return []

  const commandsBySection = runtime.appContext.commandRegistry.getCommandsBySection()
  const results: CommandWithSection[] = []

  const SECTION_ORDER = ['Slash Commands'] as const

  // 遍历分组
  for (const section of SECTION_ORDER) {
    const commands = commandsBySection[section]
    if (!commands || commands.length === 0) continue

    // 过滤命令
    const normalized = String(query ?? '').trim()
    const lowerQuery = normalized.toLowerCase()
    const filteredCommands = normalized
      ? commands.filter(cmd =>
          cmd.label.toLowerCase().includes(lowerQuery) ||
          cmd.description?.toLowerCase().includes(lowerQuery)
        )
      : pickDefaultSlashCommands(commands)

    const finalCommands = normalized
      ? sortAndLimitSlashCommands(filteredCommands, lowerQuery)
      : filteredCommands

    // 添加分组信息
    for (const cmd of finalCommands) {
      results.push({
        ...cmd,
        section
      })
    }
  }

  return results
}

function normalizeSlashLabel(label: string): string {
  const raw = String(label ?? '').trim()
  return raw.startsWith('/') ? raw.slice(1) : raw
}

function pickDefaultSlashCommands(all: CommandAction[]): CommandAction[] {
  const DEFAULT_LIMIT = 24

  // 常用命令优先展示（存在则按顺序加入）
  const favorites = [
    'help',
    'review',
    'refactor',
    'init',
    'model',
    'models',
    'compact',
    'summarize',
    'undo',
    'redo'
  ]

  const byName = new Map<string, CommandAction>()
  for (const cmd of all) {
    byName.set(normalizeSlashLabel(cmd.label).toLowerCase(), cmd)
  }

  const out: CommandAction[] = []
  const added = new Set<string>()

  for (const name of favorites) {
    const cmd = byName.get(name)
    if (!cmd) continue
    const key = cmd.id || cmd.label
    if (added.has(key)) continue
    added.add(key)
    out.push(cmd)
    if (out.length >= DEFAULT_LIMIT) return out
  }

  // 再补一些“非命名空间”的（比如 /superpowers:* 这类太多，默认不全展示）
  for (const cmd of all) {
    if (out.length >= DEFAULT_LIMIT) break
    const name = normalizeSlashLabel(cmd.label).toLowerCase()
    if (!name || name.includes(':')) continue
    const key = cmd.id || cmd.label
    if (added.has(key)) continue
    added.add(key)
    out.push(cmd)
  }

  // 兜底：还不够再补满
  for (const cmd of all) {
    if (out.length >= DEFAULT_LIMIT) break
    const key = cmd.id || cmd.label
    if (added.has(key)) continue
    added.add(key)
    out.push(cmd)
  }

  return out
}

function sortAndLimitSlashCommands(commands: CommandAction[], lowerQuery: string): CommandAction[] {
  const MAX_RESULTS = 60

  const scored = commands.map((cmd) => {
    const label = cmd.label.toLowerCase()
    const desc = cmd.description?.toLowerCase() ?? ''
    const q = lowerQuery

    // 0: 前缀匹配（最相关），1: label 包含，2: desc 包含
    const score = label.startsWith('/' + q) ? 0 : label.includes(q) ? 1 : desc.includes(q) ? 2 : 3

    return { cmd, score, label }
  })

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.label.localeCompare(b.label)
  })

  return scored.slice(0, MAX_RESULTS).map((x) => x.cmd)
}

/**
 * 将 CommandAction 转换为 DropdownItemType
 *
 * @param command 命令对象
 * @returns Dropdown 项
 */
export function commandToDropdownItem(command: CommandAction): DropdownItemType {
  return {
    id: command.id,
    label: command.label,
    detail: command.description,
    icon: 'codicon-symbol-method',
    type: 'command',
    data: { commandId: command.id, command }
  }
}

/**
 * 获取命令的图标
 *
 * @param command 命令对象
 * @returns 图标类名
 */
export function getCommandIcon(command: CommandAction): string | undefined {
  const label = command.label.toLowerCase()

  // Slash commands 使用默认图标
  if (label.startsWith('/')) {
    return 'codicon-symbol-method'
  }

  return undefined
}
