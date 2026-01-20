<template>
  <DropdownTrigger align="left" :close-on-click-outside="true">
    <template #trigger>
      <div class="mode-dropdown">
        <div class="dropdown-content">
          <i :class="`codicon ${currentModeConfig.icon}`" class="mode-icon" />
          <div class="dropdown-text">
            <span class="dropdown-label">{{ currentModeConfig.label }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        v-for="(pm, index) in primaryAgentModes"
        :key="pm.id"
        :item="{
          id: pm.id,
          label: pm.label,
          detail: pm.description,
          checked: effectivePrimaryAgentMode === pm.id,
          type: 'primary-agent'
        }"
        :is-selected="effectivePrimaryAgentMode === pm.id"
        :index="index"
        @click="() => handlePrimaryAgentSelect(pm.id, close)"
      >
        <template #icon>
          <i :class="`codicon ${pm.icon}`" />
        </template>
      </DropdownItem>
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DropdownTrigger, DropdownItem } from './Dropdown';

export type PrimaryAgentMode = 'build' | 'plan';

export interface PrimaryAgentModeConfig {
  id: PrimaryAgentMode;
  label: string;
  description: string;
  icon: string;
}

const primaryAgentModes: PrimaryAgentModeConfig[] = [
  {
    id: 'build',
    label: 'Build',
    description: '默认助手：工具可用，适合开发执行',
    icon: 'codicon-tools'
  },
  {
    id: 'plan',
    label: 'Plan',
    description: '规划助手：偏分析与计划，少执行',
    icon: 'codicon-lightbulb'
  }
];

interface Props {
  primaryAgentMode?: PrimaryAgentMode;
}

interface Emits {
  (e: 'primary-agent-select', mode: PrimaryAgentMode): void;
}

const props = withDefaults(defineProps<Props>(), {
  primaryAgentMode: undefined
});

const emit = defineEmits<Emits>();

const effectivePrimaryAgentMode = computed<PrimaryAgentMode>(() => {
  return props.primaryAgentMode ?? 'build';
});

const currentModeConfig = computed(() => {
  return (
    primaryAgentModes.find((m) => m.id === effectivePrimaryAgentMode.value) ?? primaryAgentModes[0]
  );
});

function handlePrimaryAgentSelect(mode: PrimaryAgentMode, close: () => void) {
  close();
  emit('primary-agent-select', mode);
}
</script>

<style scoped>
/* Mode dropdown styles - existing look */
.mode-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.mode-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

.mode-icon {
  font-size: 12px;
  flex-shrink: 0;
  opacity: 0.8;
  color: var(--vscode-foreground);
}

.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}

.section-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--vscode-editorGroup-border);
  opacity: 0.6;
}
</style>
