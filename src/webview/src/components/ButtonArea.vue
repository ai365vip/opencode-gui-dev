<template>
  <div class="button-area-container">
    <div class="button-row">
      <!-- Left Section: Dropdowns -->
      <div class="controls-section">
        <!-- Mode Select -->
        <ModeSelect
          :primary-agent-mode="primaryAgentMode"
          @primary-agent-select="(mode) => emit('primary-agent-select', mode)"
        />

        <!-- Model Select -->
        <ModelSelect
          :selected-model="selectedModel"
          @model-select="(modelId) => emit('model-select', modelId)"
        />

        <!-- Variant Select -->
        <DropdownTrigger
          v-if="(availableVariants && availableVariants.length > 0) || selectedVariant"
          align="center"
          :close-on-click-outside="true"
        >
          <template #trigger>
            <div class="variant-dropdown">
              <div class="dropdown-content">
                <div class="dropdown-text">
                  <span class="dropdown-label" :title="variantTitle">{{
                    formatVariantLabel(selectedVariant) || 'Default'
                  }}</span>
                </div>
              </div>
              <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
            </div>
          </template>

          <template #content="{ close }">
            <DropdownItem
              :item="{
                id: '__default__',
                label: 'Default',
                detail: '使用模型默认思考等级',
                checked: !selectedVariant,
                type: 'variant'
              }"
              :is-selected="!selectedVariant"
              :index="0"
              @click="
                () => {
                  emit('variant-select', '');
                  close();
                }
              "
            />
            <DropdownSeparator v-if="availableVariants && availableVariants.length > 0" />
            <DropdownItem
              v-for="(variant, index) in availableVariants"
              :key="variant"
              :item="{
                id: variant,
                label: formatVariantLabel(variant),
                detail: variant,
                checked: selectedVariant === variant,
                type: 'variant'
              }"
              :is-selected="selectedVariant === variant"
              :index="index + 1"
              @click="
                () => {
                  emit('variant-select', variant);
                  close();
                }
              "
            />
          </template>
        </DropdownTrigger>
      </div>

      <!-- Right Section: Token Indicator + Action Buttons -->
      <div class="actions-section">
        <!-- Token Indicator -->
        <TokenIndicator v-if="showProgress" :percentage="progressPercentage" />

        <!-- Progress Button -->
        <button
          class="action-button"
          @click="() => emit('open-progress')"
          aria-label="Session Progress"
          title="Session progress"
        >
          <span class="codicon codicon-pulse text-[16px]!" />
        </button>

        <!-- Command Button with Dropdown -->
        <DropdownTrigger
          ref="commandDropdownRef"
          :show-search="true"
          search-placeholder="Filter commands..."
          align="left"
          :selected-index="commandCompletion.activeIndex.value"
          :data-nav="commandCompletion.navigationMode.value"
          @open="handleDropdownOpen"
          @close="handleDropdownClose"
          @search="handleSearch"
        >
          <!-- 自定义触发器按钮 -->
          <template #trigger>
            <button class="action-button" aria-label="Slash Commands">
              <span class="codicon codicon-italic text-[16px]!" />
            </button>
          </template>

          <!-- 下拉内容 -->
          <template #content="{ close }">
            <div @mouseleave="commandCompletion.handleMouseLeave">
              <template v-for="(item, index) in commandCompletion.items.value" :key="item.id">
                <DropdownSeparator v-if="item.type === 'separator'" />
                <DropdownSectionHeader
                  v-else-if="item.type === 'section-header'"
                  :text="item.text"
                />
                <DropdownItem
                  v-else
                  :item="item"
                  :index="index"
                  :is-selected="index === commandCompletion.activeIndex.value"
                  @click="(item) => handleCommandClick(item, close)"
                  @mouseenter="commandCompletion.handleMouseEnter(index)"
                />
              </template>
            </div>
          </template>
        </DropdownTrigger>

        <!-- Attach File Button -->
        <button
          class="action-button"
          @click="handleAttachClick"
          aria-label="Attach Image/PDF"
          title="Attach image/PDF"
        >
          <span class="codicon codicon-attach text-[16px]!" />
          <input
            ref="fileInputRef"
            type="file"
            multiple
            accept="image/*,application/pdf"
            style="display: none"
            @change="handleFileUpload"
          />
        </button>

        <!-- Submit Button -->
        <button
          class="submit-button"
          @click="handleSubmit"
          :disabled="submitVariant === 'disabled'"
          :data-variant="submitVariant"
          :aria-label="submitVariant === 'stop' ? 'Stop Conversation' : 'Send Message'"
        >
          <span
            v-if="submitVariant === 'stop'"
            class="codicon codicon-debug-stop text-[12px]! bg-(--vscode-editor-background)e-[0.6] rounded-[1px]"
          />
          <span v-else class="codicon codicon-arrow-up-two text-[12px]!" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import TokenIndicator from './TokenIndicator.vue';
import ModeSelect from './ModeSelect.vue';
import ModelSelect from './ModelSelect.vue';
import {
  DropdownTrigger,
  DropdownItem,
  DropdownSeparator,
  DropdownSectionHeader
} from './Dropdown';
import { RuntimeKey } from '../composables/runtimeContext';
import { useCompletionDropdown } from '../composables/useCompletionDropdown';
import { getSlashCommands, commandToDropdownItem } from '../providers/slashCommandProvider';

interface Props {
  disabled?: boolean;
  loading?: boolean;
  primaryAgentMode?: 'build' | 'plan';
  selectedModel?: string;
  availableVariants?: string[];
  selectedVariant?: string;
  conversationWorking?: boolean;
  hasInputContent?: boolean;
  showProgress?: boolean;
  progressPercentage?: number;
}

interface Emits {
  (e: 'submit'): void;
  (e: 'stop'): void;
  (e: 'attach'): void;
  (e: 'add-attachment', files: FileList): void;
  (e: 'primary-agent-select', mode: 'build' | 'plan'): void;
  (e: 'model-select', modelId: string): void;
  (e: 'variant-select', variant: string): void;
  (e: 'open-progress'): void;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
  primaryAgentMode: undefined,
  selectedModel: '',
  conversationWorking: false,
  hasInputContent: false,
  showProgress: true,
  progressPercentage: 0
});

const emit = defineEmits<Emits>();

const variantTitle = computed(() => {
  const v = (props.selectedVariant ?? '').trim();
  return v ? `Thinking effort: ${v}` : 'Thinking effort: Default';
});

function formatVariantLabel(variant?: string): string {
  const raw = String(variant ?? '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  const known: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High'
  };
  if (known[key]) return known[key];

  // snake_case / kebab-case -> Title Case
  const words = raw
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(' ') : raw;
}

const fileInputRef = ref<HTMLInputElement>();
const commandDropdownRef = ref<InstanceType<typeof DropdownTrigger>>();

const runtime = inject(RuntimeKey);

const commandCompletion = useCompletionDropdown({
  mode: 'manual',
  provider: (query) => getSlashCommands(query, runtime),
  toDropdownItem: commandToDropdownItem,
  onSelect: (command) => {
    if (runtime) {
      runtime.appContext.commandRegistry.executeCommand(command.id);
    }
    commandCompletion.close();
  },
  showSectionHeaders: false,
  searchFields: ['label', 'description']
});

const submitVariant = computed(() => {
  if (props.conversationWorking) {
    return 'stop';
  }

  if (!props.hasInputContent) {
    return 'disabled';
  }

  return 'enabled';
});

function handleSubmit() {
  if (submitVariant.value === 'stop') {
    emit('stop');
  } else if (submitVariant.value === 'enabled') {
    emit('submit');
  }
}

function handleCommandClick(item: any, close: () => void) {
  console.log('Command clicked:', item);

  if (item.data?.command) {
    const index = commandCompletion.items.value.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      commandCompletion.selectIndex(index);
    }
  }

  close();
}

function handleAttachClick() {
  fileInputRef.value?.click();
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    emit('add-attachment', target.files);
    target.value = '';
  }
}

function handleDropdownOpen() {
  commandCompletion.open();
  document.addEventListener('keydown', handleCommandKeydown);
}

function handleDropdownClose() {
  commandCompletion.close();
  document.removeEventListener('keydown', handleCommandKeydown);
}

function handleSearch(term: string) {
  commandCompletion.handleSearch(term);
}

function handleCommandKeydown(event: KeyboardEvent) {
  commandCompletion.handleKeydown(event);
}
</script>

<style scoped>
.button-area-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  flex-shrink: 0;
  cursor: auto;
  width: 100%;
}

.button-row {
  display: grid;
  grid-template-columns: 4fr 1fr;
  align-items: center;
  height: 28px;
  padding-right: 2px;
  box-sizing: border-box;
  flex: 1 1 0%;
  justify-content: space-between;
  width: 100%;
}

.controls-section {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 6px;
  flex-shrink: 1;
  flex-grow: 0;
  min-width: 0;
  min-height: 24px;
  max-width: 100%;
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}

.action-button,
.submit-button {
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    opacity 0.2s ease;
  color: var(--vscode-foreground);
  position: relative;
}

.action-button:hover:not(:disabled) {
  opacity: 1;
}

.action-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.submit-button {
  scale: 1.1;
}

.submit-button[data-variant='enabled'] {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 80%, transparent);
  color: var(--vscode-editor-background);
  opacity: 1;
  outline: 1.5px solid color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent);
  outline-offset: 1px;
}

.submit-button[data-variant='disabled'] {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 80%, transparent);
  color: var(--vscode-editor-background);
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-button[data-variant='stop'] {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 80%, transparent);
  color: var(--vscode-editor-background);
  opacity: 1;
  outline: 1.5px solid color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent);
  outline-offset: 1px;
}

.codicon-modifier-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Variant Dropdown Style - Matches ModelSelect */
.variant-dropdown {
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

.variant-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
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
  max-width: 200px;
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
</style>
