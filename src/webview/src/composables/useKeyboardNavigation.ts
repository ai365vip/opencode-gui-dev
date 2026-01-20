import type { KeyboardNavigationOptions } from '../types/completion'

/**
 * 键盘导航 Composable
 *
 * 封装上下键、Enter、Tab、Escape、PageUp、PageDown 等键盘导航逻辑
 *
 * @param options 导航选项
 * @returns 键盘导航相关函数
 *
 * @example
 * const { handleKeydown, moveNext, movePrev } = useKeyboardNavigation({
 *   isOpen: ref(true),
 *   items: computed(() => [item1, item2]),
 *   activeIndex: ref(0),
 *   onSelect: (index) => console.log('Selected:', index),
 *   onClose: () => console.log('Closed'),
 *   pageSize: 5
 * })
 */
export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    isOpen,
    items,
    activeIndex,
    onSelect,
    onClose,
    supportTab = true,
    supportEscape = true,
    onNavigate,
    pageSize = 5
  } = options

  /**
   * 移动到下一项
   */
  function moveNext() {
    if (items.value.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % items.value.length
    onNavigate?.() // 触发导航回调
  }

  /**
   * 移动到上一项
   */
  function movePrev() {
    if (items.value.length === 0) return
    activeIndex.value =
      (activeIndex.value - 1 + items.value.length) % items.value.length
    onNavigate?.() // 触发导航回调
  }

  /**
   * 向下翻页
   */
  function moveNextPage() {
    if (items.value.length === 0) return
    const newIndex = Math.min(activeIndex.value + pageSize, items.value.length - 1)
    activeIndex.value = newIndex
    onNavigate?.() // 触发导航回调
  }

  /**
   * 向上翻页
   */
  function movePrevPage() {
    if (items.value.length === 0) return
    const newIndex = Math.max(activeIndex.value - pageSize, 0)
    activeIndex.value = newIndex
    onNavigate?.() // 触发导航回调
  }

  /**
   * 选择当前激活的项
   */
  function selectActive() {
    if (items.value.length === 0) return
    onSelect(activeIndex.value)
  }

  /**
   * 重置索引到第一项
   */
  function reset() {
    activeIndex.value = 0
  }

  /**
   * 处理键盘事件
   *
   * @param event 键盘事件
   * @returns 是否处理了该事件
   */
  function handleKeydown(event: KeyboardEvent): boolean {
    // 只在打开且有项时处理
    if (!isOpen.value || items.value.length === 0) {
      return false
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveNext()
        return true

      case 'ArrowUp':
        event.preventDefault()
        movePrev()
        return true

      case 'PageDown':
        event.preventDefault()
        moveNextPage()
        return true

      case 'PageUp':
        event.preventDefault()
        movePrevPage()
        return true

      case 'Enter':
        event.preventDefault()
        selectActive()
        return true

      case 'Tab':
        if (supportTab && !event.shiftKey) {
          event.preventDefault()
          selectActive()
          return true
        }
        break

      case 'Escape':
        if (supportEscape) {
          event.preventDefault()
          onClose()
          return true
        }
        break
    }

    return false
  }

  return {
    handleKeydown,
    moveNext,
    movePrev,
    moveNextPage,
    movePrevPage,
    selectActive,
    reset
  }
}
