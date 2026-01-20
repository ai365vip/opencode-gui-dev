/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/webview/index.html',
    './src/webview/src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false, // 禁用 Tailwind 的基础样式重置，避免与 VSCode 样式冲突
  },
}
