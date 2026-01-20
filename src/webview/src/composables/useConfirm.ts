/**
 * useConfirm - 确认对话框 Composable
 *
 * 使用方式：
 * ```ts
 * const { confirm } = useConfirm();
 *
 * const confirmed = await confirm({
 *   title: '确认操作',
 *   message: '确定要执行此操作吗？',
 *   type: 'warning'
 * });
 *
 * if (confirmed) {
 *   // 用户点击了确定
 * }
 * ```
 */

import { ref, createApp, h } from 'vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

interface ConfirmOptions {
  title?: string;
  message: string;
  type?: 'info' | 'warning' | 'error';
  confirmText?: string;
  cancelText?: string;
}

export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      // 创建一个容器元素
      const container = document.createElement('div');
      document.body.appendChild(container);

      // 创建 Vue 应用实例
      const app = createApp({
        setup() {
          const dialogRef = ref<InstanceType<typeof ConfirmDialog>>();

          const handleConfirm = () => {
            cleanup();
            resolve(true);
          };

          const handleCancel = () => {
            cleanup();
            resolve(false);
          };

          const cleanup = () => {
            app.unmount();
            document.body.removeChild(container);
          };

          // 挂载后显示对话框
          setTimeout(() => {
            dialogRef.value?.show();
          }, 0);

          return () =>
            h(ConfirmDialog, {
              ref: dialogRef,
              ...options,
              onConfirm: handleConfirm,
              onCancel: handleCancel
            });
        }
      });

      // 挂载到容器
      app.mount(container);
    });
  }

  return {
    confirm
  };
}
