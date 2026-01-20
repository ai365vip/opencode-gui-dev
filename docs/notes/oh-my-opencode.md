# oh-my-opencode（集成笔记）

我们需要“支持 oh-my-opencode”，本质是：**让 OpenCode server 在正确的配置目录/配置文件体系下运行**，并给用户一个能快速定位配置的入口。

> 注意：oh-my-opencode 采用 Sustainable Use License（非商业/内部使用限制）。因此这里只保留“集成所需事实与操作步骤”，不把其文档内容整页拷贝进仓库；如需离线查看，用脚本下载到 `docs/_local`（不提交）。

---

## 配置文件位置（优先级）

来自 ohmyopencode 配置文档的明确描述：

1) 项目级（优先级最高）：`.opencode/oh-my-opencode.json`
2) 用户级：`~/.config/opencode/oh-my-opencode.json`

扩展侧建议：

- “打开配置”命令默认优先打开项目级；不存在则打开用户级；都不存在则提示并提供创建选项（后续实现）。

---

## 与 OpenCode GUI 的关系

oh-my-opencode 会影响：

- agents：例如 `planner-sisyphus`、`librarian`、`explore`、`oracle` 等
- hooks / MCP / LSP / experimental：会改变工具行为、上下文注入、错误恢复等

因此 OpenCode GUI 需要做到：

- 启动 server 时允许指定 `OPENCODE_CONFIG_DIR`（用于 profile/隔离/测试）
  - 对应 VSCode 配置：`opencodeGui.configDir`
- 获取 agents 列表时以 server 返回为准（oh-my-opencode 启用的 agents 会体现在 `/agent`）

---

## 建议最小功能

- 命令：`opencodeGui.openOhMyConfig`
- 行为：
  - 如果工作区存在 `.opencode/oh-my-opencode.json` → 打开它
  - 否则打开 `~/.config/opencode/oh-my-opencode.json`

