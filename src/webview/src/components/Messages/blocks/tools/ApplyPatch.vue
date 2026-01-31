<template>
  <ToolMessageWrapper
    tool-icon="codicon-diff"
    tool-name="ApplyPatch"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-diff-view': hasDiffView }"
  >
    <template #main>
      <span class="tool-label">ApplyPatch</span>
      <template v-if="filesInfo.length > 0">
        <ToolFilePath
          v-for="(fileInfo, index) in filesInfo.slice(0, 1)"
          :key="index"
          :file-path="fileInfo.filePath"
          :context="context"
        />
        <span v-if="filesInfo.length > 1" class="more-files">
          +{{ filesInfo.length - 1 }}
        </span>
      </template>
      <span v-if="diffStats" class="diff-stats">
        <span v-if="diffStats.added > 0" class="stat-add">+{{ diffStats.added }}</span>
        <span v-if="diffStats.removed > 0" class="stat-remove">-{{ diffStats.removed }}</span>
      </span>
    </template>

    <!-- 展开内容：显示 diff 视图 -->
    <template #expandable>
      <!-- Diff 视图 -->
      <div v-if="parsedPatches.length > 0" class="diff-view">
        <!-- 多文件 Patch 视图 -->
        <div
          v-for="(filePatch, fileIndex) in parsedPatches"
          :key="fileIndex"
          class="file-patch"
        >
          <!-- 文件标题栏 -->
          <div class="diff-file-header" @click="toggleFileExpand(fileIndex)">
            <span
              class="codicon expand-icon"
              :class="expandedFiles[fileIndex] ? 'codicon-chevron-down' : 'codicon-chevron-right'"
            ></span>
            <FileIcon :file-name="filePatch.filePath" :size="16" class="file-icon" />
            <span class="file-name">{{ filePatch.fileName }}</span>
            <span v-if="filePatch.stats" class="file-stats">
              <span v-if="filePatch.stats.added > 0" class="stat-add">+{{ filePatch.stats.added }}</span>
              <span v-if="filePatch.stats.removed > 0" class="stat-remove">-{{ filePatch.stats.removed }}</span>
            </span>
          </div>

          <!-- Diff 双列布局:行号 + 内容 -->
          <div v-show="expandedFiles[fileIndex]" class="diff-scroll-container">
            <!-- 左侧:行号列 -->
            <div :ref="el => setLineNumbersRef(fileIndex, el)" class="diff-line-numbers">
              <template v-for="(hunk, hunkIndex) in filePatch.hunks" :key="hunkIndex">
                <!-- Hunk 头信息 -->
                <div class="hunk-header-line">@@</div>
                <div
                  v-for="(line, lineIndex) in hunk.lines"
                  :key="`${hunkIndex}-${lineIndex}`"
                  class="line-number-item"
                  :class="getDiffLineClass(line)"
                >
                  {{ getLineNumber(hunk, lineIndex) }}
                </div>
              </template>
            </div>

            <!-- 右侧:内容列(可滚动) -->
            <div
              :ref="el => setContentRef(fileIndex, el)"
              class="diff-content"
              @scroll="() => handleContentScroll(fileIndex)"
            >
              <template v-for="(hunk, hunkIndex) in filePatch.hunks" :key="hunkIndex">
                <!-- Hunk 头信息 -->
                <div class="hunk-header">
                  <span class="hunk-info">{{ hunk.header }}</span>
                </div>
                <div class="diff-lines">
                  <div
                    v-for="(line, lineIndex) in hunk.lines"
                    :key="`${hunkIndex}-${lineIndex}`"
                    class="diff-line"
                    :class="getDiffLineClass(line)"
                  >
                    <span class="line-prefix">{{ getLinePrefix(line) }}</span>
                    <span class="line-content">{{ getLineContent(line) }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误内容 -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import path from 'path-browserify-esm';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import FileIcon from '@/components/FileIcon.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

interface FilePatch {
  filePath: string;
  fileName: string;
  hunks: Hunk[];
  stats: { added: number; removed: number };
}

const props = defineProps<Props>();

// 文件展开状态
const expandedFiles = reactive<Record<number, boolean>>({});

// DOM 引用
const lineNumbersRefs = reactive<Record<number, HTMLElement | null>>({});
const contentRefs = reactive<Record<number, HTMLElement | null>>({});

function setLineNumbersRef(index: number, el: any) {
  lineNumbersRefs[index] = el;
}

function setContentRef(index: number, el: any) {
  contentRefs[index] = el;
}

// 切换文件展开状态
function toggleFileExpand(index: number) {
  expandedFiles[index] = !expandedFiles[index];
}

// 获取 patch 文本
const patchText = computed(() => {
  return props.toolUse?.input?.patchText || '';
});

// 解析 unified diff 格式的 patch
function parseUnifiedDiff(text: string): FilePatch[] {
  const patches: FilePatch[] = [];
  if (!text) return patches;

  const lines = text.split('\n');
  let currentFile: FilePatch | null = null;
  let currentHunk: Hunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 解析文件头
    // *** Begin Patch / *** End Patch 标记
    if (line.startsWith('*** Begin Patch') || line.startsWith('*** End Patch')) {
      continue;
    }

    // *** Update File: / *** Add File: / *** Delete File:
    if (line.startsWith('*** Update File:') || line.startsWith('*** Add File:') || line.startsWith('*** Delete File:')) {
      // 保存之前的文件
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        patches.push(currentFile);
      }

      const filePath = line.replace(/^\*\*\* (Update|Add|Delete) File:\s*/, '').trim();
      currentFile = {
        filePath,
        fileName: path.basename(filePath),
        hunks: [],
        stats: { added: 0, removed: 0 }
      };
      currentHunk = null;
      // 默认展开第一个文件
      if (patches.length === 0) {
        expandedFiles[0] = true;
      }
      continue;
    }

    // 标准 unified diff 格式: --- a/file
    if (line.startsWith('--- ')) {
      // 保存之前的文件
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        patches.push(currentFile);
      }

      let filePath = line.substring(4).trim();
      // 移除 a/ 或 b/ 前缀
      filePath = filePath.replace(/^[ab]\//, '');
      currentFile = {
        filePath,
        fileName: path.basename(filePath),
        hunks: [],
        stats: { added: 0, removed: 0 }
      };
      currentHunk = null;
      // 默认展开第一个文件
      if (patches.length === 0) {
        expandedFiles[0] = true;
      }
      continue;
    }

    // +++ b/file (跳过，使用 --- 行的文件名)
    if (line.startsWith('+++ ')) {
      continue;
    }

    // 解析 hunk 头: @@ -1,3 +1,4 @@
    if (line.startsWith('@@')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        currentHunk = {
          header: line,
          oldStart: parseInt(match[1], 10),
          oldLines: match[2] ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3], 10),
          newLines: match[4] ? parseInt(match[4], 10) : 1,
          lines: []
        };
      } else {
        // 简化的 @@ 格式
        currentHunk = {
          header: line,
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 0,
          lines: []
        };
      }
      continue;
    }

    // 解析 diff 行
    if (currentFile && currentHunk) {
      if (line.startsWith('-')) {
        currentHunk.lines.push(line);
        currentFile.stats.removed++;
      } else if (line.startsWith('+')) {
        currentHunk.lines.push(line);
        currentFile.stats.added++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push(' ' + line.substring(1));
      }
    } else if (currentFile && !currentHunk) {
      // 没有 @@ 头的简单 diff（如截图中的格式）
      if (line.startsWith('-') || line.startsWith('+')) {
        // 创建一个默认的 hunk
        currentHunk = {
          header: '@@ -1 +1 @@',
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 0,
          lines: []
        };
      }
      if (currentHunk) {
        if (line.startsWith('-')) {
          currentHunk.lines.push(line);
          currentFile.stats.removed++;
        } else if (line.startsWith('+')) {
          currentHunk.lines.push(line);
          currentFile.stats.added++;
        }
      }
    }
  }

  // 保存最后的 hunk 和文件
  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    patches.push(currentFile);
  }

  return patches;
}

// 解析后的 patches
const parsedPatches = computed(() => {
  return parseUnifiedDiff(patchText.value);
});

// 文件信息列表
const filesInfo = computed(() => {
  return parsedPatches.value.map(p => ({
    filePath: p.filePath,
    fileName: p.fileName
  }));
});

// 是否有 diff 视图
const hasDiffView = computed(() => {
  return parsedPatches.value.length > 0;
});

// 默认折叠
const shouldExpand = computed(() => {
  return false;
});

// 计算总 diff 统计
const diffStats = computed(() => {
  let added = 0;
  let removed = 0;

  parsedPatches.value.forEach(patch => {
    added += patch.stats.added;
    removed += patch.stats.removed;
  });

  if (added === 0 && removed === 0) return null;
  return { added, removed };
});

// 同步行号列和内容列的垂直滚动
function handleContentScroll(fileIndex: number) {
  const lineNumbers = lineNumbersRefs[fileIndex];
  const content = contentRefs[fileIndex];
  if (lineNumbers && content) {
    lineNumbers.scrollTop = content.scrollTop;
  }
}

// 获取 diff 行的类型类名
function getDiffLineClass(line: string): string {
  if (line.startsWith('-')) return 'diff-line-delete';
  if (line.startsWith('+')) return 'diff-line-add';
  return 'diff-line-context';
}

// 获取行前缀
function getLinePrefix(line: string): string {
  if (line.startsWith('-') || line.startsWith('+')) {
    return line[0];
  }
  return ' ';
}

// 获取行内容（去除前缀）
function getLineContent(line: string): string {
  if (line.startsWith('-') || line.startsWith('+') || line.startsWith(' ')) {
    return line.substring(1);
  }
  return line;
}

// 计算行号
function getLineNumber(hunk: Hunk, lineIndex: number): string {
  const currentLine = hunk.lines[lineIndex];

  if (currentLine.startsWith('-')) {
    // 删除行：显示旧行号
    let oldLine = hunk.oldStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = hunk.lines[i];
      if (!line.startsWith('+')) {
        oldLine++;
      }
    }
    return String(oldLine);
  } else if (currentLine.startsWith('+')) {
    // 添加行：显示新行号
    let newLine = hunk.newStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = hunk.lines[i];
      if (!line.startsWith('-')) {
        newLine++;
      }
    }
    return String(newLine);
  } else {
    // 上下文行：显示新行号
    let newLine = hunk.newStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = hunk.lines[i];
      if (!line.startsWith('-')) {
        newLine++;
      }
    }
    return String(newLine);
  }
}
</script>

<style scoped>
/* 有 diff 视图时移除左侧边框和边距 */
.has-diff-view :deep(.expandable-content) {
  border-left: none;
  padding: 0;
  margin-left: 0;
}

.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.more-files {
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  margin-left: 4px;
}

.diff-stats {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  font-size: 0.85em;
  font-weight: 500;
}

.stat-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.stat-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: .5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

.file-patch {
  border-bottom: 1px solid var(--vscode-panel-border);
}

.file-patch:last-child {
  border-bottom: none;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}

.diff-file-header:hover {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 70%, transparent);
}

.expand-icon {
  font-size: 12px;
  color: var(--vscode-foreground);
  flex-shrink: 0;
}

.diff-file-header :deep(.mdi),
.diff-file-header :deep(.codicon) {
  flex-shrink: 0;
}

.diff-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
  flex: 1;
}

.file-stats {
  display: flex;
  gap: 4px;
  font-size: 0.85em;
}

.diff-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

/* 左侧行号列 */
.diff-line-numbers {
  width: 50px;
  flex-shrink: 0;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
  border-right: 1px solid var(--vscode-panel-border);
}

.line-number-item {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  text-align: right;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

.hunk-header-line {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  text-align: center;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  background-color: color-mix(in srgb, var(--vscode-diffEditor-insertedLineBackground) 30%, transparent);
}

/* 右侧内容列 */
.diff-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Monaco 风格滚动条 */
.diff-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.diff-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.diff-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.diff-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.diff-content::-webkit-scrollbar-corner {
  background: transparent;
}

.hunk-header {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  background-color: color-mix(in srgb, var(--vscode-diffEditor-insertedLineBackground) 30%, transparent);
  color: var(--vscode-descriptionForeground);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
}

.diff-lines {
  background-color: var(--vscode-editor-background);
  width: fit-content;
  min-width: 100%;
}

.diff-line {
  display: flex;
  font-family: var(--vscode-editor-font-family);
  white-space: nowrap;
  height: 22px;
  line-height: 22px;
}

.line-prefix {
  display: inline-block;
  width: 20px;
  text-align: center;
  padding: 0 4px;
  flex-shrink: 0;
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px 0 4px;
  white-space: pre;
}

.diff-line-delete {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 20%, transparent);
}

.diff-line-delete .line-prefix {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 25%, transparent);
}

.diff-line-delete .line-content {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-line-add {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 20%, transparent);
}

.diff-line-add .line-prefix {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 25%, transparent);
}

.diff-line-add .line-content {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-line-context {
  background-color: var(--vscode-editor-background);
}

.diff-line-context .line-prefix {
  color: color-mix(in srgb, var(--vscode-foreground) 40%, transparent);
}

.diff-line-context .line-content {
  color: var(--vscode-editor-foreground);
}
</style>
