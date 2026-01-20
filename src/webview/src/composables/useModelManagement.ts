import { ref, computed } from 'vue';
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk';

export interface ModelOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
  variants?: string[];
  contextWindow?: number;
}

const FALLBACK_MODELS: ModelOption[] = [];

const STORAGE_KEY_MODEL_STATES = 'opencode-gui-model-states';

function modelInfoToOption(info: ModelInfo): ModelOption {
  const variantsRaw = (info as any)?.variants;
  const variants = Array.isArray(variantsRaw)
    ? variantsRaw.map((v: unknown) => String(v)).filter(Boolean)
    : variantsRaw && typeof variantsRaw === 'object' && !Array.isArray(variantsRaw)
      ? Object.entries(variantsRaw)
          .filter(([, value]) => !(value && typeof value === 'object' && (value as any).disabled))
          .map(([key]) => key)
      : undefined;

  const contextWindow = Number((info as any)?.contextWindow ?? (info as any)?.limit?.context);

  return {
    id: info.value,
    label: info.displayName || info.value,
    value: info.value,
    description: info.description,
    disabled: false,
    variants,
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : undefined
  };
}

const models = ref<ModelOption[]>([...FALLBACK_MODELS]);
const isInitialized = ref(false);

export function useModelManagement() {
  const availableModels = computed(() => models.value || []);

  const initFromBackend = (backendModels: ModelInfo[]) => {
    if (!backendModels || backendModels.length === 0) {
      console.log('[ModelManagement] 后端未返回模型');
      return;
    }

    console.log('[ModelManagement] 从后端初始化模型列表:', backendModels.length, '个');

    const backendOptions = backendModels.map(modelInfoToOption);
    applyModelStates(backendOptions);

    models.value = backendOptions;
    isInitialized.value = true;

    console.log('[ModelManagement] 初始化完成，共', backendOptions.length, '个模型');
  };

  const toggleModelEnabled = (modelValue: string) => {
    if (!modelValue || !models.value) return;

    const model = models.value.find((m) => m?.value === modelValue);
    if (model) {
      model.disabled = !model.disabled;
      saveModelStatesToStorage();
    }
  };

  const saveModelStatesToStorage = () => {
    const modelList = models.value || [];
    const states = modelList.reduce(
      (acc, model) => {
        if (model?.value) {
          acc[model.value] = { disabled: model.disabled || false };
        }
        return acc;
      },
      {} as Record<string, { disabled: boolean }>
    );
    try {
      localStorage.setItem(STORAGE_KEY_MODEL_STATES, JSON.stringify(states));
    } catch (error) {
      console.error('[ModelManagement] Failed to save model states:', error);
    }
  };

  const applyModelStates = (modelList: ModelOption[]) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MODEL_STATES);
      if (stored) {
        const states = JSON.parse(stored) as Record<string, { disabled: boolean }>;
        modelList.forEach((model) => {
          if (model?.value && states[model.value]) {
            model.disabled = states[model.value].disabled;
          }
        });
      }
    } catch (error) {
      console.error('[ModelManagement] Failed to apply model states:', error);
    }
  };

  return {
    availableModels,
    isInitialized: computed(() => isInitialized.value),
    initFromBackend,
    toggleModelEnabled
  };
}
