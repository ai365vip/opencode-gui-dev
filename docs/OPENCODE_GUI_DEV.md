# OpenCode GUI（VSCode 扩展）开发文档

目标：在 `opencode-gui/` 下做一个“和 Claudix UI 一样”的 **OpenCode GUI**，自动拉起本地 OpenCode server，通过 SSE 订阅事件流驱动 UI；并支持“先写入、可一键 revert”，同时兼容 oh-my-opencode 的配置体系。

本项目的关键约束：**前端 WebView 已经是 Claudix 的协议与渲染逻辑**（`launch_claude`/`io_message`/`system`/`assistant`/`result` + `tool_use/tool_result/text/thinking` blocks）。为了最大复用，后端做“协议翻译”，把 OpenCode 的 message/part/event 翻译成现有前端能吃的格式。

当前实现状态：已能在 VSCode 内启动/复用本地 OpenCode server、进行对话、展示事件流、支持一键 revert，并提供 oh-my-opencode 的配置入口（详见 §6）。

---

## 1. 目录与角色

- VSCode 扩展后端：`opencode-gui/src/`
  - 负责：启动/连接 OpenCode server、HTTP 调用、SSE 订阅、把 OpenCode 事件翻译为 WebView 协议、提供 VSCode 命令（Revert、打开配置等）
- WebView 前端：`opencode-gui/src/webview/`
  - 负责：会话 UI、消息展示、Diff Preview、权限弹窗、配置页等（尽量不改）

关键入口（建议从这里读代码）：

- Server 管理：`opencode-gui/src/services/opencode/OpencodeServerService.ts`
- OpenCode HTTP Client：`opencode-gui/src/services/opencode/OpencodeClientService.ts`
- 协议翻译/会话桥接：`opencode-gui/src/services/opencode/OpencodeAgentService.ts`

---

## 2. 协议复用策略（最重要）

### 2.1 前端期望的最小消息流

前端（`src/webview/src/transport/BaseTransport.ts`）初始化会做两件事：

1) `request: { type: "init" }` → 期待 `init_response`  
2) `request: { type: "get_claude_state" }` → 期待 `get_claude_state_response`

前端真正聊天时：

- `launch_claude`：建立一个 channel 的事件流（后端要开始往这个 channel 推事件）
- `io_message`：后续用户输入通过这个消息进入后端（后端要把它转成 OpenCode 的 prompt）
- 后端推回的事件里，最关键是：
  - `system`（subtype: `init`）→ 让 UI 进入 busy
  - `assistant`（content blocks）→ 展示工具调用、输出文本、thinking
  - `user`（tool_result blocks）→ 绑定到对应的 tool_use（前端通过反向查找做关联）
  - `result` → 让 UI 结束 busy，并触发队列处理下一条

### 2.2 翻译层原则

- **前端不动**：不重写 Session/Message/ContentBlock 体系。
- **后端适配**：OpenCode SSE 事件 → 翻译成“Claude 风格”的 message blocks。
- **避免流式增量更新同一条 assistant**：当前前端会把每个 `assistant` 事件当成一条消息入列表；因此更推荐：
  - 工具相关：tool_part → `assistant(tool_use)` + `user(tool_result)`
  - 文本相关：在 step-finish 或 message 完成时，发一条 `assistant(text)`（必要时也可分段发，但会变成多条消息）

---

## 3. OpenCode 服务端与 API（开发必读）

建议把官方文档下载到本地 `_local` 目录，便于离线查阅（见 §7）。

你需要重点关心这些能力：

### 3.1 Server

- health：`GET /global/health`（SDK: `client.global.health()`）
- SSE：`GET /event`（SDK: `client.event.subscribe()`）
- agents：`GET /agent`
- config：`GET /config`

### 3.2 Sessions

- `GET /session`：列出 sessions
- `POST /session`：创建 session
- `GET /session/{id}`：获取 session
- `GET /session/{id}/messages`：获取消息列表（或 `messages/message` 组合，看版本）
- `POST /session/{id}/prompt`：发送用户输入并触发 AI（必要时 `noReply: true` 仅注入上下文）
- `POST /session/{id}/revert`：回滚（支持 `messageID`/`partID`）
- `POST /session/{id}/permissions/{permissionID}`：响应权限请求（once/always/reject）

---

## 4. oh-my-opencode 兼容策略（必须）

oh-my-opencode 的关键是：它通过自己的配置文件改变 OpenCode 的行为（启用 agents、hooks、MCP、LSP、实验特性等）。

我们在扩展侧至少要做到：

1) **允许用户指定 `OPENCODE_CONFIG_DIR`**（用于 profile/隔离），并透传给 `opencode serve` 进程  
   - VSCode 配置项：`opencodeGui.configDir`
2) **提供“一键打开 oh-my-opencode 配置”命令**
   - 按优先级查找：
     - 项目：`.opencode/oh-my-opencode.json`
     - 全局：`~/.config/opencode/oh-my-opencode.json`

更多细节见：`opencode-gui/docs/notes/oh-my-opencode.md`。

### 4.1 GUI 侧的显示与配置来源

- Agents 页面：展示 server `/agent` 返回的 agents；启用/禁用写入当前项目 `.opencode/oh-my-opencode.json`
- Skills 页面：以 “Skills” 形式展示 oh-my-opencode hooks（启用/禁用写入 `disabled_hooks`）
- UI 提供“打开 oh-my-opencode 配置”入口：前端调用 `open_config_file(oh-my-opencode)`，由扩展侧打开对应文件

---

## 5. Revert（先写入、可一键回滚）

OpenCode 本身提供 `session.revert`，语义上更像“撤销某个 message/part 造成的变更”。

扩展侧建议做的最小实现：

- 在收到 OpenCode 事件时，记录“最近一次可回滚的锚点”：
  - 优先：`ToolPart`/`StepFinishPart` 中能定位到的 `messageID`/`partID`
  - 兜底：assistant message 的 `messageID`
- 命令 `opencodeGui.revertLastChange`：
  - 调用 `POST /session/{id}/revert`
  - 成功后在 UI 插入一条提示（或刷新 session）

---

## 6. 分阶段实现清单（按这个做就能跑起来）

### Phase 0：基础工程自洽

- [x] `opencode-gui/src/extension.ts` 的 viewId/commands 全部切到 `opencode.*` / `opencodeGui.*`
- [x] DI `serviceRegistry` 替换为 OpenCode 版本（注册 Opencode* services）
- [x] `esbuild.ts` 去掉 Claude CLI 相关逻辑，仅打包 VSCode extension

验收：扩展能在 VSCode 中启动，侧边栏能打开 WebView（即使还不能对话）。

### Phase 1：Server 管理

- [x] `OpencodeServerService.ensureServer()`：
  - 本地优先复用已有 server
  - 否则自动 `spawn opencode serve --hostname --port`
  - 用 `GET /global/health` 探测 ready

验收：打开扩展时能自动拉起 server，日志能看到 server URL。

### Phase 2：HTTP Client + SSE

- [x] 用 `fetch` 实现最小 OpenCode client（避免 ESM/CJS 兼容坑）
- [x] 订阅 `GET /event?directory=<cwd>`，解析 SSE，分发到当前会话/频道

验收：能打印 SSE event.type，并能拿到 session/message/part 的结构。

### Phase 3：协议翻译（让 UI 真正显示）

- [x] 实现 `OpencodeAgentService`：
  - 接 `launch_claude` / `io_message` / `interrupt_claude` / `request`
  - 把 OpenCode 事件翻译成 `assistant/user/result`
- [x] 最小可视化：
  - tool → tool_use/tool_result
  - text → text block
  - reasoning → thinking block（如果需要）

验收：UI 可以完整跑一轮“用户提问 → 工具调用 → 输出文本 → 结束 busy”。

### Phase 4：Revert + oh-my-opencode

- [x] `opencodeGui.revertLastChange` 能回滚
- [x] `opencodeGui.openOhMyConfig` 能打开配置文件

验收：能对同一 session 连续“生成改动 → 一键回滚”。

---

## 7. 上游文档本地保存（推荐）

出于协作与上下文一致性，建议把上游文档下载到本地（但不提交到 git）：

- 脚本：`opencode-gui/scripts/sync-docs.ps1`
- 输出目录（已 gitignore）：`opencode-gui/docs/_local/`

同步后建议重点看：

- `docs/_local/opencode/server.mdx`
- `docs/_local/opencode/sdk.mdx`
- `docs/_local/oh-my-opencode/configuration.html`
