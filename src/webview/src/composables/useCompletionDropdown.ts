import { ref, computed, watch } from 'vue'
import type {
  CompletionConfig,
  CompletionDropdown,
  DropdownPosition,
  TriggerQuery
} from '../types/completion'
import type { DropdownItemType } from '../types/dropdown'
import { useTriggerDetection } from './useTriggerDetection'
import { useKeyboardNavigation } from './useKeyboardNavigation'

/**
 * 通用补全 Dropdown Composable
 *
 * 封装完整的补全下拉逻辑，支持两种模式：
 * - inline: 输入触发（如 /command, @file）
 * - manual: 手动触发（如按钮点击）
 *
 * @param config 补全配置
 * @returns 补全 dropdown 状态和方法
 *
 * @example
 * // inline 模式
 * const slashCompletion = useCompletionDropdown({
 *   mode: 'inline',
 *   trigger: '/',
 *   provider: getSlashCommands,
 *   toDropdownItem: (cmd) => ({ ... }),
 *   onSelect: (cmd, query) => { ... },
 *   anchorElement: inputRef
 * })
 *
 * @example
 * // manual 模式
 * const commandMenu = useCompletionDropdown({
 *   mode: 'manual',
 *   provider: getCommands,
 *   toDropdownItem: (cmd) => ({ ... }),
 *   onSelect: (cmd) => { ... }
 * })
 */
export function useCompletionDropdown<T>(
  config: CompletionConfig<T>
): CompletionDropdown {
  const {
    mode,
    trigger,
    provider,
    toDropdownItem,
    onSelect,
    anchorElement,
    showSectionHeaders = false,
    searchFields = ['label', 'detail'],
    sectionOrder = []
  } = config

  // 验证配置
  if (mode === 'inline' && !trigger) {
    throw new Error('[useCompletionDropdown] inline 模式必须提供 trigger 参数')
  }

  // === 状态管理 ===
  const isOpen = ref(false)
  const activeIndex = ref(0)
  const query = ref('')
  const triggerQuery = ref<TriggerQuery | undefined>(undefined)
  const rawItems = ref<T[]>([])
  const navigationMode = ref<'keyboard' | 'mouse'>('keyboard') // 导航模式

  // === 触发检测（inline 模式） ===
  const triggerDetection = mode === 'inline' && trigger
    ? useTriggerDetection({ trigger })
    : null

  // === 数据加载（序列化 + 竞态防护） ===
  const requestSeq = ref(0)
  const isLoading = ref(false)

  async function loadItems(searchQuery: string) {
    try {
      // 自增请求号，仅允许最新请求写入
      const seq = ++requestSeq.value
      isLoading.value = true

      const result = provider(searchQuery)
      const data = result instanceof Promise ? await result : result

      // 只采纳最新请求
      if (seq === requestSeq.value) {
        rawItems.value = (data ?? []) as T[]
      }
    } catch (error) {
      console.error('[useCompletionDropdown] 加载数据失败:', error)
      rawItems.value = []
    }
    isLoading.value = false
  }

  // === 项列表处理 ===
  const items = computed<DropdownItemType[]>(() => {
    if (rawItems.value.length === 0) return []

    // 转换为 DropdownItem 格式
    const source = (rawItems.value as unknown as T[]) || []
    let dropdownItems = source.map((it) => toDropdownItem(it as T))

    // manual 模式：处理分组
    if (mode === 'manual' && showSectionHeaders) {
      dropdownItems = organizeItemsWithSections(dropdownItems)
    }

    return dropdownItems
  })

  // 组织项为分组格式
  function organizeItemsWithSections(items: DropdownItemType[]): DropdownItemType[] {
    if (!showSectionHeaders) return items

    const result: DropdownItemType[] = []
    const grouped = new Map<string, DropdownItemType[]>()

    // 按 section 分组
    for (const item of items) {
      const section = (item as any).section || 'Other'
      if (!grouped.has(section)) {
        grouped.set(section, [])
      }
      grouped.get(section)!.push(item)
    }

    // 按指定顺序输出
    const sections = sectionOrder.length > 0
      ? sectionOrder
      : Array.from(grouped.keys())

    for (const section of sections) {
      const sectionItems = grouped.get(section)
      if (!sectionItems || sectionItems.length === 0) continue

      // 添加分隔符（除第一个）
      if (result.length > 0) {
        result.push({
          id: `separator-${section}`,
          type: 'separator'
        } as DropdownItemType)
      }

      // 添加分组标题
      result.push({
        id: `section-${section}`,
        type: 'section-header',
        text: section
      } as DropdownItemType)

      // 添加项
      result.push(...sectionItems)
    }

    return result
  }

  // 可导航的项（排除分隔符和标题）
  const navigableItems = computed<T[]>(() => rawItems.value as unknown as T[])

  // === 位置计算 ===
  const positionRef = ref<DropdownPosition>({ top: 0, left: 0, width: 0, height: 0 })
  const position = computed<DropdownPosition>(() => positionRef.value)

  // 更新位置（可由外部调用）
  function updatePosition(pos: DropdownPosition) {
    positionRef.value = pos
  }

  // 默认位置更新（基于 anchorElement）
  function updateDefaultPosition() {
    if (!anchorElement?.value) {
      positionRef.value = { top: 0, left: 0, width: 0, height: 0 }
      return
    }

    const rect = anchorElement.value.getBoundingClientRect()
    positionRef.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }
  }

  // === 键盘导航 ===
  const navigation = useKeyboardNavigation({
    isOpen,
    items: computed(() => navigableItems.value),
    activeIndex,
    onSelect: (index) => {
      const item = navigableItems.value[index] as unknown as T
      if (item != null) {
        onSelect(item as T, triggerQuery.value)
        close()
      }
    },
    onClose: close,
    supportTab: true,
    supportEscape: mode === 'inline', // inline 模式支持 Escape
    onNavigate: () => {
      // 键盘导航时切换为 keyboard 模式
      navigationMode.value = 'keyboard'
    }
  })

  // === inline 模式：查询评估 ===
  function evaluateQuery(text: string, caretOffset?: number) {
    if (mode !== 'inline' || !triggerDetection) return

    // 获取光标位置
    const caret = caretOffset ?? triggerDetection.getCaretOffset(anchorElement?.value || null)
    if (caret === undefined) {
      triggerQuery.value = undefined
      isOpen.value = false
      return
    }

    // 查找触发查询
    const foundQuery = triggerDetection.findQuery(text, caret)
    triggerQuery.value = foundQuery

    if (foundQuery) {
      query.value = foundQuery.query
      isOpen.value = true
      activeIndex.value = 0
      void loadItems(foundQuery.query)
    } else {
      isOpen.value = false
    }
  }

  // === inline 模式：文本替换 ===
  function replaceText(text: string, replacement: string): string {
    if (mode !== 'inline' || !triggerDetection || !triggerQuery.value) {
      return text
    }

    return triggerDetection.replaceRange(text, triggerQuery.value, replacement)
  }

  // === manual 模式：打开/关闭 ===
  function open() {
    isOpen.value = true
    activeIndex.value = 0
    query.value = ''
    void loadItems('')
  }

  function close() {
    isOpen.value = false
    activeIndex.value = -1 // 关闭时复位为 -1
    query.value = ''
    triggerQuery.value = undefined
    rawItems.value = []
    navigationMode.value = 'keyboard' // 复位导航模式
  }

  // === 鼠标交互 ===
  function handleMouseEnter(index: number) {
    navigationMode.value = 'mouse'
    activeIndex.value = index
  }

  function handleMouseLeave() {
    // 鼠标离开时复位索引为 -1（表示无选中项）
    activeIndex.value = -1
  }

  // === manual 模式：搜索（防抖） ===
  let debounceTimer: number | undefined
  function handleSearch(term: string) {
    query.value = term
    activeIndex.value = 0
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      void loadItems(term)
    }, 120)
  }

  // === 键盘事件处理 ===
  function handleKeydown(event: KeyboardEvent) {
    navigation.handleKeydown(event)
  }

  // === 直接选择当前/指定项（用于鼠标点击等场景） ===
  function selectActive() {
    // 复用导航选择逻辑
    navigation.selectActive()
  }

  function selectIndex(index: number) {
    if (index < 0 || index >= navigableItems.value.length) return
    activeIndex.value = index
    const item = navigableItems.value[index] as unknown as T
    if (item != null) {
      onSelect(item as T, triggerQuery.value)
      close()
    }
  }

  // === 查询变化时重新加载（inline 模式触发；manual 由 handleSearch 触发） ===
  watch(query, (newQuery) => {
    if (mode === 'manual') return
    if (isOpen.value) void loadItems(newQuery)
  })

  // === 列表变化时收敛选中索引，避免越界 ===
  watch(items, (list) => {
    const len = list.length
    if (len === 0) {
      activeIndex.value = -1
      return
    }
    if (activeIndex.value < 0) activeIndex.value = 0
    if (activeIndex.value >= len) activeIndex.value = len - 1
  })

  return {
    isOpen,
    items,
    activeIndex,
    position,
    query,
    triggerQuery,
    navigationMode,
    // 暴露 loading（可选使用）
    // @ts-expect-error: 额外暴露状态，向后兼容
    loading: isLoading,
    open,
    close,
    handleKeydown,
    selectActive,
    selectIndex,
    handleSearch,
    evaluateQuery,
    replaceText,
    handleMouseEnter,
    handleMouseLeave,
    updatePosition
  }
}
