import type { TriggerQuery, TriggerDetectionOptions } from '../types/completion'

/**
 * 触发符检测 Composable
 *
 * 用于检测输入文本中的触发符（如 '/' 或 '@'），并解析查询信息
 *
 * @param options 检测选项
 * @returns 触发检测相关函数
 *
 * @example
 * const { findQuery, getCaretOffset } = useTriggerDetection({ trigger: '/' })
 * const caret = getCaretOffset(inputElement)
 * const query = findQuery('hello /command world', caret)
 */
export function useTriggerDetection(options: TriggerDetectionOptions) {
  const { trigger, customRegex } = options

  /**
   * 获取光标在文本中的偏移量
   *
   * @param element contenteditable 元素
   * @returns 光标偏移量，失败返回 undefined
   */
  function getCaretOffset(element: HTMLElement | null): number | undefined {
    if (!element) return undefined

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return undefined

    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer)) return undefined

    // 创建一个从元素开始到光标位置的范围
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(element)
    preCaretRange.setEnd(range.endContainer, range.endOffset)

    return preCaretRange.toString().length
  }

  /**
   * 查找文本中的触发查询
   *
   * @param text 输入文本
   * @param caret 光标位置
   * @returns 触发查询信息，未找到返回 undefined
   */
  function findQuery(text: string, caret: number): TriggerQuery | undefined {
    // 构建正则表达式
    // 匹配：行首或空格后的触发符，后跟非空格和非触发符的字符
    const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = customRegex || new RegExp(
      `(?:^|\\s)${escapedTrigger}[^\\s${escapedTrigger}]*`,
      'g'
    )

    const matches = Array.from(text.matchAll(regex))

    for (const match of matches) {
      const matchIndex = match.index ?? 0
      // 找到触发符的实际位置（可能在空格之后）
      const start = text.indexOf(trigger, matchIndex)
      const end = start + match[0].trim().length

      // 检查光标是否在触发范围内
      if (caret > start && caret <= end) {
        return {
          query: text.substring(start + trigger.length, end),
          start,
          end,
          trigger
        }
      }
    }

    return undefined
  }

  /**
   * 替换文本中的触发范围
   *
   * @param text 原始文本
   * @param query 触发查询信息
   * @param replacement 替换文本
   * @returns 替换后的文本
   */
  function replaceRange(
    text: string,
    query: TriggerQuery,
    replacement: string
  ): string {
    const before = text.substring(0, query.start)
    const after = text.substring(query.end)
    // 如果后面没有空格，自动添加一个
    const suffix = after.startsWith(' ') ? '' : ' '
    return `${before}${replacement}${suffix}${after}`
  }

  return {
    findQuery,
    getCaretOffset,
    replaceRange
  }
}
