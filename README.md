# OpenCode GUI（VSCode 扩展）

在 VSCode 里提供 OpenCode 的 WebView GUI：自动拉起本地 `opencode server`，并复用 Claudix 的聊天 UI（协议/渲染尽量不动，主要在扩展侧做协议翻译）。

## 快速开始（调试）

1. 安装依赖（首次需要）：`pnpm -C opencode-gui install`
2. 开发模式（推荐，WebView 走 Vite）：
   - 终端运行：`pnpm -C opencode-gui dev`
   - 用 VSCode 打开目录：`opencode-gui/`
   - 按 `F5` 选择：`OpenCode GUI: Run Dev (Vite)`
3. 在弹出的 `Extension Development Host` 窗口里：点击 Activity Bar 的 `OpenCode` 图标打开侧边栏对话。

## 生产模式调试（不走 Vite）

- 构建：`pnpm -C opencode-gui build`
- VSCode 打开 `opencode-gui/` 后按 `F5` 选择：`OpenCode GUI: Run (Extension Host)`

## 常见问题（调试）

- 选择 `OpenCode GUI: Run Dev (Vite)` 后 WebView 空白：
  - 先跑：`pnpm -C opencode-gui dev:webview`（或直接 `pnpm -C opencode-gui dev`）
  - 确认本机能访问：`http://localhost:5174`
- 选择 `OpenCode GUI: Run (Extension Host)` 后界面没有更新：
  - 先跑：`pnpm -C opencode-gui build`（或 `pnpm -C opencode-gui watch` 持续构建）

## 运行前检查

- 系统里要能执行 `opencode`：`opencode --version`
  - 找不到命令时：在 VSCode 设置里改 `opencodeGui.opencodePath`
- 默认服务地址：`opencodeGui.serverBaseUrl`（默认 `http://127.0.0.1:4096`）
- oh-my-opencode profile：可用 `opencodeGui.configDir` 指向对应配置目录

## 使用提示

- 对话框 Slash Commands 支持会话级命令：`/undo`、`/redo`、`/compact`（`/summarize` 为别名）；其中 `/compact` 需要先在顶部选择模型（`provider/model`）。
- 设置页 “OpenCode 配置” 支持表单化编辑（模型/Provider/Plugins/Compaction），并可在编辑器打开 `opencode.json/opencode.jsonc`、`oh-my-opencode.json`、`auth.json`（`auth.json` 含密钥请勿泄露）。

更多开发细节见：`opencode-gui/docs/OPENCODE_GUI_DEV.md`。
