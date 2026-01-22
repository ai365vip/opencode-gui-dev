<!--
OpenCode GUI - Chinese README.
For the English version, see README.md.
Padding: --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-->

# OpenCode GUI（VSCode 扩展）

[English README](README.md)

在 VSCode 里提供 OpenCode 的 WebView 图形界面：通过 HTTP/SSE 连接 OpenCode server（`opencode serve`），将事件流翻译成聊天 UI 协议，并在侧边栏渲染。

<img src="resources/opencode-logo.png" alt="OpenCode logo" width="200" />

## 功能概览

- 在侧边栏使用 OpenCode 聊天 UI
- 复用已有本地 server，或自动拉起 `opencode serve`（仅当 `serverBaseUrl` 为本地地址时）
- 实时展示工具调用与结果
- 快速发送编辑器上下文（`Ctrl+L` / `Cmd+L`、资源管理器右键菜单）
- 一键 Revert 最近一次 OpenCode 改动
- 设置页可编辑常用 OpenCode 配置文件（包含 `oh-my-opencode`）

> 说明：项目处于快速迭代中，功能与 UI 可能会频繁调整。

## 运行环境

- VS Code `>= 1.98`
- 系统中可执行 `opencode`（`opencode --version`）
- 开发需要：Node.js `>= 18` 与 `pnpm`

OpenCode 安装文档：https://opencode.ai/docs

## 安装（从源码构建）

1. 安装依赖：`pnpm install`
2. 构建：`pnpm build`
3. 打包：`pnpm package`（在仓库根目录生成 `.vsix`）
4. VS Code → 扩展 → “从 VSIX 安装…”

## 使用方式

- 点击 Activity Bar 的 **OpenCode** 图标打开侧边栏。
- 顶部选择模型后开始对话。
- 从 VS Code 发送上下文：
  - `Ctrl+L` / `Cmd+L`：发送当前选区（附带文件引用）
  - 资源管理器右键： “添加到 OpenCode”
- 可选：执行命令 “OpenCode: 一键 Revert 最近改动”。

## 配置说明

### VS Code 设置项

- `opencodeGui.opencodePath`：`opencode` 可执行文件路径
- `opencodeGui.serverBaseUrl`：默认 `http://127.0.0.1:4096`  
  如果配置为非本地地址，扩展只连接，不会自动拉起 server。
- `opencodeGui.selectedModel`：默认模型（`provider/model`）
- `opencodeGui.selectedAgent`：默认 agent 名称
- `opencodeGui.configDir`：启动 server 时传入 `OPENCODE_CONFIG_DIR`（适合 oh-my-opencode profile/隔离）
- `opencodeGui.runningWatchdogMs`：会话运行中若连续这么久（毫秒）未收到 SSE 事件则自动中断（防止卡死）；设为 `0` 可关闭。

### OpenCode 配置文件

OpenCode 同时支持 **JSON** 与 **JSONC**（带注释 JSON）。常见路径如下：

- 项目级：`<workspace>/.opencode/opencode.jsonc`（或 `.json`）
- 项目级（oh-my-opencode）：`<workspace>/.opencode/oh-my-opencode.json`
- 用户级（macOS/Linux）：`~/.config/opencode/opencode.jsonc`（或 `.json`）
- 用户级（oh-my-opencode）：`~/.config/opencode/oh-my-opencode.json`
- 认证信息：`~/.local/share/opencode/auth.json`

Windows 下通常会映射到 XDG 对应的系统目录（常见为 `%APPDATA%\\opencode` 存放配置、`%LOCALAPPDATA%\\opencode` 存放数据），也可通过 `XDG_CONFIG_HOME` / `XDG_DATA_HOME` 覆盖。

安全提示：`auth.json` 可能包含 API Key / Token，请勿粘贴到 issue、截图或分享。

## 开发

- `pnpm dev`：启动 WebView 的 Vite dev server + 扩展 watch 构建
- VS Code 按 `F5` 选择：
  - `OpenCode GUI: Run Dev (Vite)`（推荐）
  - `OpenCode GUI: Run (Extension Host)`（更接近生产）
- `pnpm typecheck:all`、`pnpm test`

更多开发细节：`docs/OPENCODE_GUI_DEV.md`

## License

AGPL-3.0

## 致谢

聊天 UI 复用了 [Claudix](https://github.com/Haleclipse/Claudix) / Claude Code UI，并在扩展侧增加了协议兼容/事件流翻译层。
