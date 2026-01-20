<template>
  <Icon
    :type="iconType"
    :icon="iconName"
    :size="size"
    :color="iconColor"
    :class-name="props.className"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import { fileExtensionMap, specialFileNameMap, type IconConfig } from '../config/fileIconMap';
import { folderNameMap, defaultFolderIcon, type FolderIconConfig } from '../config/folderIconMap';

interface Props {
  fileName: string;
  size?: number | string;
  className?: string;
  isDirectory?: boolean;
  folderPath?: string; // 目录完整相对路径（可选），用于特殊匹配
}

const props = withDefaults(defineProps<Props>(), {
  size: 16
});

// 获取图标配置（按优先级匹配）
const iconConfig = computed((): IconConfig => {
  const fileName = (props.fileName || '').toLowerCase();
  const baseName = fileName.split('/').pop() || '';

  // 目录图标优先
  if (props.isDirectory) {
    const cfg = resolveFolderIcon(baseName, (props.folderPath || '').toLowerCase())
    return { type: cfg.type, icon: cfg.icon, color: cfg.color }
  }

  // 1) 完整文件名（specialFileNameMap）
  const special = specialFileNameMap[baseName];
  if (special) return special;

  // 2) 完整文件名（fileExtensionMap 内含有些“文件名+扩展名”的条目）
  const fullInExtMap = (fileExtensionMap as Record<string, IconConfig | undefined>)[baseName];
  if (fullInExtMap) return fullInExtMap;

  // 3) 复合后缀匹配（如 spec.ts / d.ts / e2e-spec.ts 等）从长到短
  const parts = baseName.split('.');
  if (parts.length > 1) {
    for (let start = 1; start < parts.length; start++) {
      const suffix = parts.slice(start).join('.');
      const hit = (fileExtensionMap as Record<string, IconConfig | undefined>)[suffix];
      if (hit) return hit;
    }
  }

  // 4) 默认图标
  return { type: 'mdi', icon: 'file' };
});

const iconType = computed(() => iconConfig.value.type);
const iconName = computed(() => iconConfig.value.icon);
const iconColor = computed(() => iconConfig.value.color);

function resolveFolderIcon(name: string, fullPath: string): FolderIconConfig {
  // 特例：.github/workflows 或 github/workflows
  if (fullPath.includes('github/workflows') || fullPath.includes('.github/workflows')) {
    return { type: 'mdi', icon: 'folder-gh-workflows' }
  }
  const base = name.replace(/^\./, '')
  const hit = folderNameMap[base]
  if (hit) return hit
  return defaultFolderIcon
}
</script>
