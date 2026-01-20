<template>
  <div v-if="pendingFiles.length > 0" class="pending-diffs-bar">
    <button class="pending-diffs-toggle" @click="toggleDropdown">
      <span class="codicon codicon-git-merge"></span>
      <span class="pending-count">{{ totalPendingCount }} 处待确认修改</span>
      <span class="file-count">({{ pendingFiles.length }} 个文件)</span>
      <span class="codicon" :class="isDropdownOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'"></span>
    </button>

    <div v-if="isDropdownOpen" class="pending-diffs-dropdown">
      <div
        v-for="file in pendingFiles"
        :key="file.filePath"
        class="pending-file-item"
        @click="openFile(file)"
      >
        <div class="file-info">
          <span class="codicon codicon-file"></span>
          <span class="file-name">{{ file.fileName }}</span>
        </div>
        <div class="file-stats">
          <span class="stat-add">+{{ file.linesAdded }}</span>
          <span class="stat-remove">-{{ file.linesDeleted }}</span>
          <span class="block-count">{{ file.blockCount }} 处</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';

interface PendingFile {
  filePath: string;
  fileName: string;
  blockCount: number;
  linesAdded: number;
  linesDeleted: number;
  firstBlockLine: number;  // 第一处修改的行号
}

interface Props {
  pendingFiles: PendingFile[];
}

const props = defineProps<Props>();
const runtime = inject(RuntimeKey);

// 默认展开，方便用户看到所有待处理文件
const isDropdownOpen = ref(true);

const totalPendingCount = computed(() => {
  return props.pendingFiles.reduce((sum, file) => sum + file.blockCount, 0);
});

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
}

function openFile(file: PendingFile) {
  if (!runtime) {
    console.warn('[PendingDiffsBar] runtime not available');
    return;
  }

  void runtime.appContext.fileOpener.open(file.filePath, {
    startLine: file.firstBlockLine + 1,
    endLine: file.firstBlockLine + 1,
  });
  isDropdownOpen.value = false;
}
</script>

<style scoped>
.pending-diffs-bar {
  position: relative;
  margin-bottom: 8px;
}

.pending-diffs-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: color-mix(in srgb, var(--vscode-editorWarning-foreground) 15%, transparent);
  border: 1px solid var(--vscode-editorWarning-border);
  border-radius: 4px;
  color: var(--vscode-editorWarning-foreground);
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s ease;
}

.pending-diffs-toggle:hover {
  background-color: color-mix(in srgb, var(--vscode-editorWarning-foreground) 25%, transparent);
  border-color: var(--vscode-editorWarning-foreground);
}

.pending-count {
  font-weight: 500;
}

.file-count {
  opacity: 0.8;
  font-size: 0.85em;
}

.pending-diffs-toggle .codicon:last-child {
  margin-left: auto;
}

.pending-diffs-dropdown {
  position: absolute;
  bottom: 100%;  /* 向上展开，避免遮挡输入框 */
  left: 0;
  right: 0;
  margin-bottom: 4px;  /* 改为 margin-bottom */
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.pending-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.pending-file-item:last-child {
  border-bottom: none;
}

.pending-file-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.file-name {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  font-family: var(--vscode-editor-font-family);
}

.stat-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  font-weight: 500;
}

.stat-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  font-weight: 500;
}

.block-count {
  color: var(--vscode-foreground);
  opacity: 0.7;
}
</style>
