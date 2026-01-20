import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@vscode/codicons/dist/codicon.css';
import '@mdi/font/css/materialdesignicons.min.css';
import 'virtual:svg-icons-register';

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
  }
}

// 生产环境默认关闭 console.log/debug/info，避免高频日志影响 WebView 性能
// 如需开启：在开发者工具执行 localStorage.setItem('opencode-debug','1') 后重载 WebView
try {
  const debugEnabled = localStorage.getItem('opencode-debug') === '1';
  if (!import.meta.env.DEV && !debugEnabled) {
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
  }
} catch {
  // ignore
}

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');
