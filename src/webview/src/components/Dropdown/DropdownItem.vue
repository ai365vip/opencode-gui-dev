<template>
  <div :id="item.id || `item-${index}`">
    <div
      ref="itemRef"
      class="dropdown-menu-item rounded"
      :class="{
        'selected': isSelected
      }"
      :data-is-selected="isSelected"
      @click="handleClick"
      @mousedown="handleMouseDown"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @mousemove="handleMouseMove"
    >
      <div class="menu-item-main-content">
        <div class="menu-item-left-section">
          <!-- 图标区域 - 只在有图标时显示 -->
          <span v-if="hasIcon" class="menu-item-icon-span">
            <!-- 自定义图标内容（通过slot） -->
            <slot name="icon" :item="item">
              <!-- 默认图标渲染 -->
              <i v-if="item.icon" :class="`codicon ${item.icon}`"></i>
            </slot>
          </span>

          <!-- 文本区域 -->
          <div class="menu-item-text-section">
            <!-- 主要内容显示 -->
            <div class="file-info-container">
              <span class="monaco-highlighted-label">{{ item.label || item.name }}</span>
            </div>
            <!-- 辅助信息显示（如文件路径、描述等） -->
            <span
              v-if="item.detail"
              :class="item.type === 'command' ? 'description-container' : 'file-path-container'"
            >
              <span class="monaco-highlighted-label file-path-text">{{ item.detail }}</span>
            </span>
          </div>
        </div>

        <!-- 右侧状态区域 -->
        <div v-if="item.rightIcon || item.checked" class="menu-item-right-section">
          <span v-if="item.checked" class="check-icon codicon codicon-check"></span>
          <span v-else-if="item.rightIcon" class="submenu-arrow-icon codicon" :class="item.rightIcon"></span>
        </div>
      </div>
    </div>

    <!-- 自定义 Tooltip - 通过 Teleport 渲染到 body -->
    <Teleport to="body">
      <div
        v-if="showTooltip && tooltipText"
        class="custom-tooltip"
        :style="tooltipStyle"
      >
        {{ tooltipText }}
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots, ref } from 'vue'
import type { DropdownItemData } from '../../types/dropdown'

interface Props {
  item: DropdownItemData
  isSelected?: boolean
  index: number
}

interface Emits {
  (e: 'click', item: DropdownItemData): void
  (e: 'mousedown', event: MouseEvent): void
  (e: 'mouseenter', index: number): void
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false
})

const emit = defineEmits<Emits>()
const slots = useSlots()

const itemRef = ref<HTMLElement>()

// Tooltip 状态
const showTooltip = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
let tooltipTimer: ReturnType<typeof setTimeout> | null = null

// 检查是否有图标
const hasIcon = computed(() => {
  return !!props.item.icon || !!slots.icon
})

// 鼠标悬停时显示的完整 tooltip
const tooltipText = computed(() => {
  const label = props.item.label || props.item.name || ''
  const detail = props.item.detail || ''
  return detail ? `${label}\n${detail}` : label
})

// Tooltip 位置样式
const tooltipStyle = computed(() => ({
  left: `${tooltipX.value}px`,
  top: `${tooltipY.value}px`
}))

// 注意：不在这里使用 scrollIntoView，因为 Dropdown 使用自定义 ScrollableElement
// Dropdown.vue 中的 ensureSelectedVisible() 会处理滚动逻辑
// 使用原生 scrollIntoView 会与 transform-based 滚动冲突，导致空白填充

function handleClick() {
  if (!props.item.disabled) {
    emit('click', props.item)
  }
}

function handleMouseDown(event: MouseEvent) {
  if (!props.item.disabled) {
    emit('mousedown', event)
  }
}

function handleMouseEnter() {
  if (!props.item.disabled) {
    emit('mouseenter', props.index)
  }
  // 延迟显示 tooltip
  tooltipTimer = setTimeout(() => {
    showTooltip.value = true
  }, 500)
}

function handleMouseLeave() {
  // 清除定时器并隐藏 tooltip
  if (tooltipTimer) {
    clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
  showTooltip.value = false
}

function handleMouseMove(event: MouseEvent) {
  // 更新 tooltip 位置
  tooltipX.value = event.clientX + 12
  tooltipY.value = event.clientY + 12
}
</script>

<style scoped>
.dropdown-menu-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.125rem 0.375rem;
  min-width: 0;
  cursor: pointer;
  color: var(--vscode-foreground);
}

/* Hover 样式：较浅的高亮 */
.dropdown-menu-item:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  color: var(--vscode-list-hoverForeground);
}

/* Keyboard 模式下禁用 hover 样式，避免覆盖 selected */
[data-nav="keyboard"] .dropdown-menu-item:hover {
  background-color: transparent;
  color: inherit;
}

/* Selected 样式：更明显的高亮 + 边框 */
.dropdown-menu-item.selected {
  background-color: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  color: var(--vscode-list-hoverForeground);
  outline: 1px dotted var(--vscode-contrastActiveBorder);
  outline-offset: -1px;
}

/* Hover + Selected 同时存在：selected 样式优先，背景稍深 */
.dropdown-menu-item.selected:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 25%, transparent);
  outline: 1px solid var(--vscode-contrastActiveBorder);
}

/* Keyboard 模式下 selected + hover 保持 selected 样式不变 */
[data-nav="keyboard"] .dropdown-menu-item.selected:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  outline: 1px dotted var(--vscode-contrastActiveBorder);
}

.dropdown-menu-item:hover .file-info-container,
.dropdown-menu-item:hover .option-info-container,
.dropdown-menu-item:hover .file-path-container,
.dropdown-menu-item:hover .description-container,
.dropdown-menu-item.selected .file-info-container,
.dropdown-menu-item.selected .option-info-container,
.dropdown-menu-item.selected .file-path-container,
.dropdown-menu-item.selected .description-container {
  color: var(--vscode-panelTitle-activeForeground);
}

/* Keyboard 模式下 hover 不改变文本颜色 */
[data-nav="keyboard"] .dropdown-menu-item:hover .file-info-container,
[data-nav="keyboard"] .dropdown-menu-item:hover .option-info-container,
[data-nav="keyboard"] .dropdown-menu-item:hover .file-path-container,
[data-nav="keyboard"] .dropdown-menu-item:hover .description-container {
  color: inherit;
}


.menu-item-main-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
  width: 100%;
}

.menu-item-left-section {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  height: 16px;
}

.menu-item-icon-span {
  flex-shrink: 0;
  width: 16px;
  min-width: 16px;
  color: var(--vscode-foreground);
  display: flex !important;
  align-items: center;
  justify-content: center;
  font-size: 12px !important;
}

.dropdown-menu-item:hover .menu-item-icon-span,
.dropdown-menu-item.selected .menu-item-icon-span {
  color: var(--vscode-list-activeSelectionForeground);
}

/* Keyboard 模式下 hover 不改变图标颜色 */
[data-nav="keyboard"] .dropdown-menu-item:hover .menu-item-icon-span {
  color: var(--vscode-foreground);
}

.menu-item-text-section {
  display: flex;
  width: 100%;
  align-items: center;
  min-width: 0;
  gap: 0.25rem;
  height: 17px;
}

.file-info-container,
.option-info-container {
  max-width: 100%;
  color: var(--vscode-panelTitle-activeForeground);
  flex-shrink: 0;
}


.monaco-highlighted-label {
  color: inherit;
  font-size: 12px;
  line-height: 17px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  display: block;
  width: 100%;
}

.file-path-container {
  direction: rtl;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  color: var(--vscode-panelTitle-activeForeground);
  flex-shrink: 1;
  opacity: 0.6;
}

/* 命令描述容器：不使用 rtl，省略后面的文本 */
.description-container {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  color: var(--vscode-panelTitle-activeForeground);
  flex-shrink: 1;
  opacity: 0.6;
}


.file-path-text {
  font-size: 9px;
  line-height: 17px;
  unicode-bidi: embed;
}

.menu-item-right-section {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: 0.25rem;
}

.submenu-arrow-icon {
  color: var(--vscode-foreground);
  margin-right: 0 !important;
  font-size: 8px !important;
  flex-shrink: 0;
  opacity: 0.6;
}

.dropdown-menu-item:hover .submenu-arrow-icon,
.dropdown-menu-item.selected .submenu-arrow-icon {
  color: var(--vscode-list-activeSelectionForeground);
  opacity: 1;
}

/* Keyboard 模式下 hover 不改变箭头图标 */
[data-nav="keyboard"] .dropdown-menu-item:hover .submenu-arrow-icon {
  color: var(--vscode-foreground);
  opacity: 0.6;
}

.check-icon {
  color: var(--vscode-foreground);
  margin-right: 0 !important;
  font-size: 8px !important;
  flex-shrink: 0;
}

.dropdown-menu-item:hover .check-icon,
.dropdown-menu-item.selected .check-icon {
  color: var(--vscode-list-activeSelectionForeground);
}

/* Keyboard 模式下 hover 不改变勾选图标 */
[data-nav="keyboard"] .dropdown-menu-item:hover .check-icon {
  color: var(--vscode-foreground);
}

.highlight {
  color: var(--vscode-list-highlightForeground);
  font-weight: 700;
}


.codicon:not(.bg-codicon-icon) {
  font-size: 12px !important;
}
</style>

<!-- 全局 Tooltip 样式（不使用 scoped，因为 Teleport 到 body） -->
<style>
.custom-tooltip {
  position: fixed;
  z-index: 10000;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-line;
  max-width: 300px;
  word-wrap: break-word;
  pointer-events: none;
  /* VSCode 主题适配 */
  background-color: var(--vscode-editorHoverWidget-background, #252526);
  color: var(--vscode-editorHoverWidget-foreground, #cccccc);
  border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
  box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
}
</style>
