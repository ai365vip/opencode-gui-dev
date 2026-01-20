# Cursor 式差异预览功能需求规格说明书

## 文档信息

- **项目名称**: Claudix VSCode Extension - Cursor 式差异预览
- **文档版本**: v1.1
- **创建日期**: 2025-11-16
- **最后更新**: 2025-11-16
- **文档状态**: 需求定义
- **负责人**: Claudix 开发团队
- **更新说明**: v1.1 - 添加工作模式集成（default/agent/ask）的详细说明

---

## 1. 项目概述

### 1.1 背景

Cursor 编辑器实现了一种优秀的 AI 代码修改预览机制，允许用户在 AI 修改代码后，通过可视化的红绿对比和独立的接受/拒绝按钮，精细控制每一处修改。这种机制极大提升了 AI 辅助编程的用户体验和安全性。

Claudix 作为基于 Claude Agent SDK 的 VSCode 扩展，需要实现类似的差异预览功能，以提供更好的用户体验和修改控制能力。

### 1.2 目标

实现完整的 Cursor 式差异预览功能，包括：

1. **可视化差异对比**：AI 修改文件后，在编辑器中显示红色（删除）和绿色（新增）的对比标记
2. **独立块控制**：每个修改块独立管理，支持单独接受或拒绝
3. **多次修改叠加**：支持同一文件多次修改，每次修改创建独立的差异块
4. **智能基准追踪**：同位置多次修改时，正确对比上次接受状态和最新修改
5. **高性能支持**：大文件（>5000行）也能流畅运行
6. **完整的用户体验**：快捷键、批量操作、状态持久化

### 1.3 核心价值

- **安全性**：用户可以逐一审查每个修改，避免误操作
- **可控性**：支持部分接受、部分拒绝，灵活控制代码变更
- **可追溯性**：清晰展示每次修改的前后对比
- **效率**：快捷键和批量操作提升审查效率

---

## 2. 核心功能需求

### 2.1 差异标记系统

#### 2.1.1 Conflict Marker 格式

使用类似 Git merge conflict 的标记格式：

```
<<<<<<< Original [block-{uuid}]
旧内容行1
旧内容行2
=======
新内容行1
新内容行2
>>>>>>> Claude's Change
```

**关键设计**：
- `block-{uuid}`: 唯一标识符，基于文件路径 + 起始行号 + 时间戳生成
- 标记行本身不参与渲染，通过装饰器隐藏或淡化显示

#### 2.1.2 可视化渲染

**装饰器类型**：

1. **原始内容装饰**（红色背景）
   ```typescript
   backgroundColor: 'rgba(255, 0, 0, 0.2)'
   before: { contentText: '-', color: 'rgba(255, 0, 0, 0.8)' }
   ```

2. **新增内容装饰**（绿色背景）
   ```typescript
   backgroundColor: 'rgba(0, 255, 0, 0.2)'
   before: { contentText: '+', color: 'rgba(0, 255, 0, 0.8)' }
   ```

3. **标记行装饰**（灰色背景，半透明）
   ```typescript
   backgroundColor: 'rgba(128, 128, 128, 0.15)'
   color: 'rgba(128, 128, 128, 0.6)'
   ```

4. **接受后的淡入动画**
   - 绿色背景渐变到透明（500ms）
   - 提供视觉反馈

### 2.2 CodeLens 交互按钮

#### 2.2.1 单块操作按钮

在每个 conflict marker 起始行上方显示：

```
[1/5] ✅ 接受  ❌ 拒绝  📋 对比详情
```

**按钮定义**：

| 按钮 | 功能 | 快捷键 | 命令ID |
|-----|------|--------|--------|
| ✅ 接受 | 接受当前块的修改 | Cmd+K (Mac) / Ctrl+K (Win) | `claudix.acceptDiffBlock` |
| ❌ 拒绝 | 拒绝当前块的修改 | Cmd+Shift+K | `claudix.rejectDiffBlock` |
| 📋 对比详情 | 在侧边栏显示详细 diff | - | `claudix.showBlockDetail` |

**计数器显示**：
- 格式：`[当前块序号/总块数]`
- 实时更新（接受/拒绝后自动刷新）

#### 2.2.2 全局操作按钮

在文档顶部显示（当存在 ≥2 个块时）：

```
🔄 全部接受  🚫 全部拒绝  📊 查看统计
```

**全局命令**：

| 命令 | 功能 | 快捷键 |
|-----|------|--------|
| 全部接受 | 接受所有未处理的块 | Cmd+Shift+A |
| 全部拒绝 | 拒绝所有未处理的块 | Cmd+Shift+R |
| 查看统计 | 显示修改统计信息 | - |

### 2.3 多次修改叠加机制

#### 2.3.1 场景示例

```
初始状态：
function foo() { return 1; }

AI 修改 1（创建 block-abc）：
function foo() { return 2; }
→ 文件已修改并保存
→ 编辑器显示对比标记

用户接受 block-abc：
→ 删除标记，保留修改
→ 更新基准状态 = { return 2; }

AI 修改 2（同一位置，创建 block-def）：
function foo() { return 3; }
→ 基准对比：{ return 2; } vs { return 3; }
→ 而不是：{ return 1; } vs { return 3; }
```

#### 2.3.2 Block ID 生成规则

```typescript
function generateBlockId(filePath: string, startLine: number): string {
  const fileHash = hashString(filePath).slice(0, 8);
  const timestamp = Date.now();
  return `block-${fileHash}-${startLine}-${timestamp}`;
}
```

**关键设计**：
- 包含时间戳，确保多次修改同一位置时 ID 唯一
- 但通过 `startLine` 可以识别"同位置修改"

#### 2.3.3 基准状态追踪

**数据结构**：

```typescript
interface BlockBaseState {
  blockId: string;
  baseContent: string;      // 对比基准
  baseType: 'original' | 'accepted';  // 基准来源
  lastAcceptedBlockId?: string;  // 如果基准是接受后的，记录那个 block 的 ID
}
```

**更新规则**：

1. **首次修改**：baseContent = 原始内容，baseType = 'original'
2. **接受后再修改**：baseContent = 接受的内容，baseType = 'accepted'
3. **拒绝后再修改**：baseContent 不变（回退到上一个基准）

### 2.4 文件状态同步

#### 2.4.1 三层状态管理

```
Layer 1: 磁盘文件（Disk）
  ↓
  实际保存的内容（AI 修改后的最终结果）

Layer 2: 编辑器缓冲区（Editor Buffer）
  ↓
  包含 conflict markers 的内容
  用户看到的内容

Layer 3: 状态缓存（State Cache）
  ↓
  所有 blocks 的元数据、基准内容、状态
```

#### 2.4.2 同步时机

| 事件 | Layer 1 | Layer 2 | Layer 3 |
|-----|---------|---------|---------|
| AI 修改文件 | ✅ 更新 | ✅ 插入 markers | ✅ 创建 block |
| 用户接受块 | ❌ 不变 | ✅ 删除 markers | ✅ 更新状态 |
| 用户拒绝块 | ✅ 回滚 | ✅ 删除 markers | ✅ 更新状态 |
| 用户保存文件 | ✅ 保存 Layer 2 | ❌ 不变 | ❌ 不变 |

**关键设计**：
- 文件始终保持"修改后"状态（Cursor 的核心机制）
- 拒绝操作通过 WorkspaceEdit 回滚磁盘文件

### 2.5 性能优化

#### 2.5.1 大文件处理策略

**限制规则**：

| 文件大小 | 最大 Block 数 | Diff 算法 | 装饰器策略 |
|---------|-------------|----------|-----------|
| < 1000 行 | 无限制 | Myers Diff | 全量渲染 |
| 1000-5000 行 | 50 个 | Myers Diff | 可见区域优先 |
| > 5000 行 | 20 个 | 增量 Diff | 虚拟滚动 |

**超限处理**：
```
检测到 52 处修改（限制为 50 个）
[显示前 50 个] [全部接受] [全部拒绝]
```

#### 2.5.2 Diff 算法优化

**使用 Myers Diff 算法**：

```typescript
import { diffLines } from 'diff';  // npm: diff

function calculateDiff(oldContent: string, newContent: string): DiffBlock[] {
  const patches = diffLines(oldContent, newContent);

  // Myers 复杂度：O(n * d)，其中 d 是编辑距离
  // 典型场景：d << n，接近 O(n)

  return this.convertPatchesToBlocks(patches);
}
```

**增量 Diff**（针对超大文件）：

```typescript
function incrementalDiff(
  oldContent: string,
  newContent: string,
  changedRanges: vscode.Range[]
): DiffBlock[] {
  // 只对变化范围 ±50 行进行 diff
  const blocks: DiffBlock[] = [];

  for (const range of changedRanges) {
    const expandedRange = expandRange(range, 50);
    const oldChunk = extractLines(oldContent, expandedRange);
    const newChunk = extractLines(newContent, expandedRange);

    blocks.push(...diffLines(oldChunk, newChunk));
  }

  return blocks;
}
```

#### 2.5.3 装饰器虚拟滚动

**仅渲染可见区域**：

```typescript
function updateDecorations(editor: vscode.TextEditor) {
  const visibleRanges = editor.visibleRanges;
  const blocks = this.getBlocksInRanges(visibleRanges);

  // 仅为可见 blocks 设置装饰器
  const decorations = blocks.map(block => ({
    range: block.range,
    hoverMessage: block.summary
  }));

  editor.setDecorations(this.decorationType, decorations);
}

// 监听滚动事件
vscode.window.onDidChangeTextEditorVisibleRanges(event => {
  this.updateDecorations(event.textEditor);
});
```

### 2.6 快捷键支持

#### 2.6.1 完整快捷键列表

| 功能 | macOS | Windows/Linux | 上下文要求 |
|-----|-------|---------------|----------|
| 接受当前块 | Cmd+K | Ctrl+K | 光标在 block 内 |
| 拒绝当前块 | Cmd+Shift+K | Ctrl+Shift+K | 光标在 block 内 |
| 跳到下一个块 | Cmd+] | Ctrl+] | 文件有 blocks |
| 跳到上一个块 | Cmd+[ | Ctrl+[ | 文件有 blocks |
| 接受所有 | Cmd+Shift+A | Ctrl+Shift+A | 文件有 blocks |
| 拒绝所有 | Cmd+Shift+R | Ctrl+Shift+R | 文件有 blocks |
| 切换预览模式 | Cmd+Option+P | Ctrl+Alt+P | 全局 |

#### 2.6.2 智能光标定位

```typescript
// 接受/拒绝后，光标自动跳到下一个 block
async acceptBlock(blockId: string) {
  await this.removeBlockMarkers(blockId);

  const nextBlock = this.getNextBlock(blockId);
  if (nextBlock) {
    this.moveCursorToBlock(nextBlock.id);
  }
}
```

### 2.7 状态持久化

#### 2.7.1 保存时机

- VSCode 退出前自动保存
- 每次接受/拒绝操作后保存
- 每 30 秒自动保存一次（防止崩溃丢失）

#### 2.7.2 存储格式

**位置**: `.vscode/claudix-diff-state.json`

```json
{
  "version": "1.0",
  "files": {
    "src/App.tsx": {
      "blocks": [
        {
          "id": "block-a1b2c3d4-10-1700123456789",
          "startLine": 10,
          "endLine": 15,
          "baseContent": "const foo = 1;",
          "currentContent": "const foo = 2;",
          "status": "pending",
          "createdAt": 1700123456789,
          "lastModified": 1700123456789
        }
      ],
      "originalContent": "/* 完整的原始文件内容 */",
      "lastSyncTime": 1700123456789
    }
  }
}
```

#### 2.7.3 恢复逻辑

```typescript
// VSCode 启动时
async restoreState() {
  const state = await this.loadStateFromDisk();

  for (const [filePath, fileState] of Object.entries(state.files)) {
    const doc = await vscode.workspace.openTextDocument(filePath);

    // 检查文件是否被外部修改
    if (this.isFileModifiedExternally(doc, fileState)) {
      // 提示用户选择：保留状态 or 丢弃状态
      await this.promptRestoreChoice(filePath);
    } else {
      // 自动恢复 markers
      await this.restoreMarkersForFile(filePath, fileState);
    }
  }
}
```

### 2.8 错误处理和容错

#### 2.8.1 Marker 格式校验

```typescript
function validateConflictMarkers(doc: vscode.TextDocument): ValidationResult {
  const lines = doc.getText().split('\n');
  const errors: MarkerError[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('<<<<<<<')) {
      // 检查是否有对应的 ======= 和 >>>>>>>
      const separatorIndex = findNextLine(lines, i, '=======');
      const endIndex = findNextLine(lines, i, '>>>>>>>');

      if (separatorIndex === -1 || endIndex === -1) {
        errors.push({
          line: i,
          type: 'incomplete_marker',
          message: 'Conflict marker 格式不完整'
        });
      }

      if (separatorIndex > endIndex) {
        errors.push({
          line: i,
          type: 'invalid_order',
          message: 'Marker 顺序错误'
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

#### 2.8.2 用户手动编辑检测

```typescript
vscode.workspace.onDidChangeTextDocument(event => {
  if (this.isUserEdit(event)) {
    // 用户手动编辑了带 markers 的文件
    const affectedBlocks = this.findAffectedBlocks(event);

    for (const block of affectedBlocks) {
      if (this.isMarkerDamaged(block)) {
        // Marker 被破坏，标记为失效
        this.invalidateBlock(block.id);

        vscode.window.showWarningMessage(
          `检测到 ${block.filePath} 的差异标记被手动修改，已自动清理该块`,
          '撤销编辑', '忽略'
        );
      }
    }
  }
});
```

#### 2.8.3 AI 修改冲突处理

**场景**：用户还未处理完上次的 blocks，AI 又修改了同一文件

**策略**：

```typescript
async onAIModifyFile(filePath: string) {
  const existingBlocks = this.getBlocks(filePath);

  if (existingBlocks.length > 0) {
    // 有未处理的 blocks
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(filePath)} 还有 ${existingBlocks.length} 处未确认的修改`,
      '先处理旧修改', '继续（会叠加）', '清空旧修改'
    );

    if (choice === '清空旧修改') {
      await this.clearAllBlocks(filePath);
    } else if (choice === '先处理旧修改') {
      return;  // 中止本次修改
    }
    // '继续' 则正常叠加
  }

  // 正常处理 AI 修改
  await this.processAIEdit(filePath);
}
```

### 2.9 工作模式集成

#### 2.9.1 工作模式定义

Claudix 支持三种工作模式，通过输入框旁的模式选择器切换：

| 模式 | 图标 | 说明 | 差异预览行为 |
|-----|------|------|------------|
| **Default** | 🔍 | 默认模式 | ✅ **启用差异预览**<br>显示 conflict markers<br>需要用户逐一确认 |
| **Agent** | 🤖 | 自主模式 | ❌ **禁用差异预览**<br>AI 修改直接应用<br>无需用户确认 |
| **Ask** | ❓ | 询问模式 | ⚠️ **每次修改前询问**<br>弹窗让用户选择是否预览 |

#### 2.9.2 Default 模式（差异预览）

**行为流程**：

```
1. 用户发送消息（模式选择器显示 "Default"）
   ↓
2. AI 调用 Write/Edit 工具
   ↓
3. ClaudeAgentService 检测到 workMode = 'default'
   ↓
4. 标记文件：DiffPreviewService.markFileForAIEdit(filePath)
   ↓
5. 工具真实执行，文件被修改
   ↓
6. DiffPreviewService 拦截修改
   ↓
7. 计算 diff，插入 conflict markers
   ↓
8. 显示红绿对比 + CodeLens 按钮
   ↓
9. 用户逐一接受/拒绝修改
```

**关键特性**：
- ✅ 完整的差异预览功能
- ✅ 红绿高亮显示
- ✅ CodeLens 按钮（接受/拒绝）
- ✅ 支持多次修改叠加
- ✅ 状态持久化

**用户体验**：
```
编辑器显示：
  <<<<<<< Original [block-abc]
  - const x = 1;
  =======
  + const x = 2;
  >>>>>>> Claude's Change

状态栏：
  [Claudix] 📝 3 处待确认修改 | [接受 Cmd+K]
```

#### 2.9.3 Agent 模式（自动应用）

**行为流程**：

```
1. 用户发送消息（模式选择器显示 "Agent"）
   ↓
2. AI 调用 Write/Edit 工具
   ↓
3. ClaudeAgentService 检测到 workMode = 'agent'
   ↓
4. 跳过差异预览逻辑
   ↓
5. 工具直接执行，文件被修改
   ↓
6. 显示简单的成功提示
   ↓
7. AI 继续后续操作（无需等待用户确认）
```

**关键特性**：
- ❌ **不显示 conflict markers**
- ❌ **不显示红绿对比**
- ❌ **不显示 CodeLens 按钮**
- ✅ 修改立即生效，无需确认
- ✅ 可选：显示简单的通知（"已自动应用 3 处修改"）

**用户体验**：
```
编辑器显示：
  const x = 2;  // 直接是修改后的内容，无标记

状态栏：
  [Claudix] ✅ 已自动应用 3 处修改
```

**适用场景**：
- 信任 AI 的修改
- 快速原型开发
- 批量重构任务
- 紧急 bug 修复

#### 2.9.4 Ask 模式（按需选择）

**行为流程**：

```
1. 用户发送消息（模式选择器显示 "Ask"）
   ↓
2. AI 调用 Write/Edit 工具
   ↓
3. ClaudeAgentService 检测到 workMode = 'ask'
   ↓
4. 弹窗询问用户：
   "AI 即将修改 3 个文件，您希望："
   [显示差异预览] [直接应用] [取消]
   ↓
5a. 用户选择 "显示差异预览"
    → 进入 Default 模式流程
   ↓
5b. 用户选择 "直接应用"
    → 进入 Agent 模式流程
   ↓
5c. 用户选择 "取消"
    → 中止工具执行
```

**关键特性**：
- ⚠️ 每次修改前弹窗确认
- ✅ 用户可动态选择是否预览
- ✅ 可记住选择（"不再询问本次会话"）

**用户体验**：
```
弹窗内容：
  ┌────────────────────────────────────┐
  │ AI 即将修改文件                      │
  │                                    │
  │ 📁 src/App.tsx (15 处修改)          │
  │ 📁 src/utils/helper.ts (3 处修改)   │
  │                                    │
  │ 您希望：                            │
  │ [🔍 显示差异预览] [🤖 直接应用] [❌ 取消] │
  │                                    │
  │ ☑ 本次会话记住我的选择              │
  └────────────────────────────────────┘
```

#### 2.9.5 模式切换逻辑

**切换时机**：

1. **会话开始前**：用户选择模式
2. **会话进行中**：可随时切换模式
3. **切换后立即生效**：下一次 AI 修改生效

**已有 blocks 的处理**：

```typescript
async onWorkModeChanged(newMode: WorkMode, oldMode: WorkMode) {
  if (newMode === 'agent' && oldMode !== 'agent') {
    // 进入 Agent（包括 permissionMode=acceptEdits 的自动映射）
    // 自动接受所有待处理 blocks：不弹窗，不需要任何确认
    await this.acceptAllPendingBlocks();
  }
}
```

#### 2.9.6 配置选项

```json
{
  // 默认工作模式
  "claudix.workMode.default": "default",

  // Agent 模式是否显示简单通知
  "claudix.workMode.agent.showNotification": true,

  // Ask 模式是否记住选择
  "claudix.workMode.ask.rememberChoice": true,

  // Ask 模式记住选择的有效期（秒）
  "claudix.workMode.ask.rememberDuration": 3600,

  // 切换模式时的已有 blocks 处理策略
  "claudix.workMode.switchBehavior": "acceptAll"  // 'prompt' | 'acceptAll' | 'rejectAll' | 'keep'
}
```

#### 2.9.7 与 ClaudeAgentService 的集成

**接口定义**：

```typescript
// ClaudeAgentService.ts
export class ClaudeAgentService {
  private workMode: WorkMode = 'default';

  async canUseTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> {
    // 检查是否是文件修改工具
    if (toolName === 'Write' || toolName === 'Edit') {
      const filePath = input.file_path as string;

      // 根据工作模式决定是否启用差异预览
      if (this.workMode === 'default') {
        // Default 模式：启用差异预览
        this.diffPreviewService.markFileForAIEdit(filePath, this.channelId);
        return { allowed: true };
      } else if (this.workMode === 'agent') {
        // Agent 模式：跳过差异预览
        return { allowed: true };
      } else if (this.workMode === 'ask') {
        // Ask 模式：询问用户
        const choice = await this.promptUserChoice(filePath);

        if (choice === 'preview') {
          this.diffPreviewService.markFileForAIEdit(filePath, this.channelId);
        }

        return { allowed: choice !== 'cancel' };
      }
    }

    // 其他工具正常处理
    return super.canUseTool(toolName, input);
  }

  setWorkMode(mode: WorkMode): void {
    const oldMode = this.workMode;
    this.workMode = mode;

    // 通知差异预览服务
    this.diffPreviewService.onWorkModeChanged(mode, oldMode);
  }
}
```

#### 2.9.8 UI 集成点

**1. 模式选择器（ChatInputBox）**

```vue
<!-- 已存在的 ModeSelect 组件 -->
<ModeSelect
  :permission-mode="permissionMode"
  :work-mode="workMode"  <!-- 新增 -->
  @mode-select="handleModeSelect"
  @work-mode-change="handleWorkModeChange"  <!-- 新增 -->
/>
```

**2. 状态栏提示**

```typescript
// 根据工作模式显示不同的状态
if (workMode === 'default' && hasBlocks) {
  statusBar.text = `📝 ${blockCount} 处待确认修改`;
} else if (workMode === 'agent') {
  statusBar.text = `🤖 自动应用模式`;
} else if (workMode === 'ask') {
  statusBar.text = `❓ 询问模式`;
}
```

**3. 设置页面（SettingsPage.vue）**

```vue
<div class="setting-item">
  <label>默认工作模式</label>
  <select v-model="defaultWorkMode">
    <option value="default">Default - 差异预览</option>
    <option value="agent">Agent - 自动应用</option>
    <option value="ask">Ask - 每次询问</option>
  </select>
  <p class="help-text">
    控制 AI 修改文件时的行为：
    - Default：显示红绿对比，需要确认
    - Agent：直接应用，无需确认
    - Ask：每次询问是否预览
  </p>
</div>
```

#### 2.9.9 兼容性说明

**向后兼容**：

- 旧版本配置（仅有 `permissionMode`）：
  - `permissionMode: 'default'` → 映射为 `workMode: 'default'`
  - `permissionMode: 'agent'` → 映射为 `workMode: 'agent'`

**数据迁移**：

```typescript
// 检测旧配置并迁移
async migrateOldConfig() {
  const config = vscode.workspace.getConfiguration('claudix');
  const permissionMode = config.get('permissionMode');
  const workMode = config.get('workMode');

  if (permissionMode && !workMode) {
    // 旧版本配置，迁移
    const newWorkMode = permissionMode === 'agent' ? 'agent' : 'default';
    await config.update('workMode', newWorkMode, true);

    vscode.window.showInformationMessage(
      '已自动迁移配置：permissionMode → workMode'
    );
  }
}
```

---

## 3. 技术架构设计

### 3.1 模块划分

```
src/services/diffPreview/
├── DiffPreviewService.ts          # 核心服务（对外接口）
├── state/
│   ├── DiffStateManager.ts        # 状态管理器
│   ├── DiffBlock.ts               # Block 数据模型
│   └── FileState.ts               # 文件状态模型
├── diff/
│   ├── DiffCalculator.ts          # Diff 计算引擎
│   ├── MyersDiff.ts               # Myers 算法实现
│   └── IncrementalDiff.ts         # 增量 Diff
├── marker/
│   ├── MarkerInserter.ts          # Marker 插入逻辑
│   ├── MarkerParser.ts            # Marker 解析逻辑
│   └── MarkerValidator.ts         # Marker 校验逻辑
├── ui/
│   ├── DecorationManager.ts       # 装饰器管理
│   ├── CodeLensProvider.ts        # CodeLens 提供者
│   └── VirtualScrollManager.ts    # 虚拟滚动优化
├── persistence/
│   ├── StateSerializer.ts         # 状态序列化
│   └── StateRestorer.ts           # 状态恢复
└── utils/
    ├── BlockIdGenerator.ts        # Block ID 生成
    ├── FileWatcher.ts             # 文件监听包装
    └── PerformanceMonitor.ts      # 性能监控
```

### 3.2 核心接口定义

#### 3.2.1 DiffPreviewService（主服务）

```typescript
export interface IDiffPreviewService {
  /**
   * 标记文件即将被 AI 修改
   */
  markFileForAIEdit(filePath: string, channelId: string): void;

  /**
   * 处理 AI 修改（核心入口）
   */
  handleAIEdit(filePath: string, oldContent: string, newContent: string): Promise<void>;

  /**
   * 接受单个 block
   */
  acceptBlock(blockId: string): Promise<void>;

  /**
   * 拒绝单个 block
   */
  rejectBlock(blockId: string): Promise<void>;

  /**
   * 接受文件的所有 blocks
   */
  acceptAllBlocks(filePath: string): Promise<void>;

  /**
   * 拒绝文件的所有 blocks
   */
  rejectAllBlocks(filePath: string): Promise<void>;

  /**
   * 获取文件的所有 blocks
   */
  getBlocks(filePath: string): DiffBlock[];

  /**
   * 清空文件的所有 blocks
   */
  clearBlocks(filePath: string): Promise<void>;

  /**
   * 启用/禁用差异预览功能
   */
  setEnabled(enabled: boolean): void;

  /**
   * 获取统计信息
   */
  getStats(): DiffStats;
}
```

#### 3.2.2 DiffBlock（数据模型）

```typescript
export interface DiffBlock {
  // 唯一标识
  id: string;

  // 文件信息
  filePath: string;

  // 位置信息（基于当前文档的行号）
  startLine: number;          // <<<<<<< 所在行
  separatorLine: number;      // ======= 所在行
  endLine: number;            // >>>>>>> 所在行

  // 内容快照
  baseContent: string;        // 基准内容（原始或上次接受的）
  currentContent: string;     // 当前修改内容

  // 基准类型
  baseType: 'original' | 'accepted';
  baseBlockId?: string;       // 如果基准是接受后的，记录那个 block 的 ID

  // 状态
  status: 'pending' | 'accepted' | 'rejected' | 'invalidated';

  // 时间戳
  createdAt: number;
  lastModified: number;
  processedAt?: number;       // 接受或拒绝的时间

  // 元数据
  changeType: 'add' | 'delete' | 'modify';  // 变更类型
  linesAdded: number;
  linesDeleted: number;

  // AI 信息
  aiChannelId?: string;       // 关联的 AI channel
  aiToolName?: string;        // 使用的工具名（Write/Edit）
}
```

#### 3.2.3 FileState（文件状态）

```typescript
export interface FileState {
  filePath: string;

  // 内容快照
  originalContent: string;       // 初始状态（第一次 AI 修改前）
  currentDiskContent: string;    // 磁盘上的最新内容

  // Blocks 管理
  blocks: Map<string, DiffBlock>;
  blockOrder: string[];          // Block 的顺序（从上到下）

  // 状态追踪
  isMarkedForAIEdit: boolean;
  markedChannelId?: string;
  lastAIEditTime: number;

  // 统计信息
  totalBlocksCreated: number;
  totalBlocksAccepted: number;
  totalBlocksRejected: number;

  // 文件哈希（用于检测外部修改）
  contentHash: string;

  // 同步时间
  lastSyncTime: number;
}
```

#### 3.2.4 DiffCalculator（Diff 引擎）

```typescript
export interface IDiffCalculator {
  /**
   * 计算两个内容的差异
   */
  calculate(
    oldContent: string,
    newContent: string,
    options?: DiffOptions
  ): DiffResult;

  /**
   * 增量计算（仅计算变化范围）
   */
  calculateIncremental(
    oldContent: string,
    newContent: string,
    changedRanges: vscode.Range[]
  ): DiffResult;
}

export interface DiffOptions {
  algorithm: 'myers' | 'simple';     // Diff 算法
  maxBlockSize: number;              // 单个 block 最大行数
  ignoreWhitespace: boolean;         // 是否忽略空白
  contextLines: number;              // 上下文行数（默认 0）
}

export interface DiffResult {
  blocks: DiffBlockData[];
  stats: {
    totalLines: number;
    addedLines: number;
    deletedLines: number;
    modifiedLines: number;
  };
  performance: {
    duration: number;
    algorithm: string;
  };
}

export interface DiffBlockData {
  startLine: number;
  endLine: number;
  deletedLines: string[];
  addedLines: string[];
  changeType: 'add' | 'delete' | 'modify';
}
```

### 3.3 工作流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     AI 修改文件流程                           │
└─────────────────────────────────────────────────────────────┘

1. ClaudeAgentService.canUseTool('Write' | 'Edit')
   ↓
2. DiffPreviewService.markFileForAIEdit(filePath, channelId)
   ↓ （标记：30秒内的文件修改视为 AI 修改）
3. SDK 执行工具，文件被真实修改
   ↓
4. vscode.workspace.onDidChangeTextDocument 触发
   ↓
5. 检测到是 AI 修改 (isMarkedForAIEdit = true)
   ↓
6. DiffPreviewService.handleAIEdit(filePath, oldContent, newContent)
   ├─ a. DiffCalculator.calculate(oldContent, newContent)
   │     → 返回 DiffResult
   ├─ b. DiffStateManager.processNewDiff(filePath, diffResult)
   │     → 创建/更新 DiffBlocks
   │     → 处理同位置多次修改（更新基准）
   ├─ c. MarkerInserter.insertMarkers(filePath, blocks)
   │     → 构建带 conflict markers 的内容
   │     → 使用 WorkspaceEdit 替换文档
   ├─ d. DecorationManager.applyDecorations(filePath, blocks)
   │     → 设置红绿装饰器
   ├─ e. CodeLensProvider.refresh()
   │     → 显示接受/拒绝按钮
   └─ f. StateSerializer.saveState()
         → 持久化状态


┌─────────────────────────────────────────────────────────────┐
│                   用户接受 Block 流程                         │
└─────────────────────────────────────────────────────────────┘

1. 用户点击 [✅ 接受] 或按下 Cmd+K
   ↓
2. DiffPreviewService.acceptBlock(blockId)
   ├─ a. DiffStateManager.updateBlockStatus(blockId, 'accepted')
   │     → 更新 block.status = 'accepted'
   │     → 记录 block.processedAt = Date.now()
   ├─ b. MarkerInserter.removeMarkers(blockId)
   │     → 删除该 block 的 conflict markers
   │     → 保留新内容（绿色部分）
   ├─ c. DecorationManager.removeDecorations(blockId)
   │     → 移除红绿装饰器
   │     → 可选：短暂显示"接受成功"动画
   ├─ d. 更新基准状态
   │     → fileState.baseContent[位置] = block.currentContent
   │     → fileState.baseType[位置] = 'accepted'
   ├─ e. CodeLensProvider.refresh()
   │     → 更新计数器（如 [1/5] → [1/4]）
   ├─ f. StateSerializer.saveState()
   │     → 持久化状态
   └─ g. 智能跳转
         → 光标跳到下一个未处理的 block


┌─────────────────────────────────────────────────────────────┐
│                   用户拒绝 Block 流程                         │
└─────────────────────────────────────────────────────────────┘

1. 用户点击 [❌ 拒绝] 或按下 Cmd+Shift+K
   ↓
2. DiffPreviewService.rejectBlock(blockId)
   ├─ a. DiffStateManager.updateBlockStatus(blockId, 'rejected')
   ├─ b. MarkerInserter.removeMarkers(blockId)
   │     → 删除 conflict markers
   │     → 保留旧内容（红色部分）
   ├─ c. 回滚磁盘文件
   │     → const contentToRestore = block.baseContent
   │     → WorkspaceEdit 替换该范围的内容
   ├─ d. DecorationManager.removeDecorations(blockId)
   ├─ e. CodeLensProvider.refresh()
   └─ f. StateSerializer.saveState()


┌─────────────────────────────────────────────────────────────┐
│                   同位置多次修改处理                          │
└─────────────────────────────────────────────────────────────┘

初始状态：
  const x = 1;

AI 修改 1（创建 block-A）：
  const x = 2;
  → baseContent = "const x = 1;"
  → currentContent = "const x = 2;"
  → baseType = 'original'

用户接受 block-A：
  → 更新基准：
    baseContent[位置] = "const x = 2;"
    baseType[位置] = 'accepted'
    baseBlockId[位置] = 'block-A'

AI 修改 2（同位置，创建 block-B）：
  const x = 3;
  → 检测到该位置有基准状态
  → baseContent = "const x = 2;"  （来自 block-A）
  → currentContent = "const x = 3;"
  → baseType = 'accepted'
  → baseBlockId = 'block-A'

  → Marker 显示：
    <<<<<<< Original [block-B]
    const x = 2;  // 红色（来自上次接受的状态）
    =======
    const x = 3;  // 绿色
    >>>>>>> Claude's Change
```

---

## 4. 数据流设计

### 4.1 状态管理架构

```
全局单例：DiffStateManager
  ↓
Map<filePath, FileState>
  ↓
FileState {
  blocks: Map<blockId, DiffBlock>
  originalContent: string
  ...
}
```

### 4.2 事件驱动流

```typescript
// 核心事件
export type DiffPreviewEvent =
  | { type: 'block_created', blockId: string, filePath: string }
  | { type: 'block_accepted', blockId: string, filePath: string }
  | { type: 'block_rejected', blockId: string, filePath: string }
  | { type: 'block_invalidated', blockId: string, reason: string }
  | { type: 'all_blocks_cleared', filePath: string }
  | { type: 'state_restored', fileCount: number };

// 事件总线
export class DiffEventBus {
  private emitter = new vscode.EventEmitter<DiffPreviewEvent>();

  readonly onEvent = this.emitter.event;

  emit(event: DiffPreviewEvent) {
    this.emitter.fire(event);
  }
}

// 订阅示例
diffEventBus.onEvent(event => {
  switch (event.type) {
    case 'block_accepted':
      // 更新统计
      // 发送遥测
      // 显示通知
      break;
  }
});
```

### 4.3 缓存策略

```typescript
class DiffStateCache {
  // L1 缓存：活跃文件的完整状态（内存）
  private activeFiles = new Map<string, FileState>();

  // L2 缓存：非活跃文件的元数据（内存）
  private inactiveFiles = new Map<string, FileMetadata>();

  // L3 缓存：持久化存储（磁盘）
  private disk: StateSerializer;

  // 缓存策略
  async get(filePath: string): Promise<FileState> {
    // 1. 查 L1
    if (this.activeFiles.has(filePath)) {
      return this.activeFiles.get(filePath);
    }

    // 2. 查 L2，从磁盘加载完整状态
    if (this.inactiveFiles.has(filePath)) {
      const state = await this.disk.loadFile(filePath);
      this.activeFiles.set(filePath, state);
      return state;
    }

    // 3. 不存在，返回空状态
    return this.createEmptyState(filePath);
  }

  // LRU 淘汰策略
  evictLRU() {
    if (this.activeFiles.size > 10) {  // 最多缓存 10 个文件
      const oldest = this.findOldestFile();
      this.moveToL2(oldest);
    }
  }
}
```

---

## 5. 用户界面设计

### 5.1 编辑器内显示

#### 示例 1：单个 Block

```typescript
// 文件：src/App.tsx
10: import React from 'react';
11:
12: [1/3] ✅ 接受  ❌ 拒绝  📋 详情
13: <<<<<<< Original [block-abc]
14: - function App() {
15: -   return <div>Hello</div>;
16: - }
17: =======
18: + function App(): JSX.Element {
19: +   return <div>Hello World</div>;
20: + }
21: >>>>>>> Claude's Change
22:
23: export default App;
```

**视觉效果**：
- 第 14-16 行：红色背景 + 左侧 "-" 符号
- 第 18-20 行：绿色背景 + 左侧 "+" 符号
- 第 13、17、21 行：灰色半透明背景
- 第 12 行：CodeLens 按钮（悬浮在代码上方）

#### 示例 2：多个 Blocks

```typescript
// 文件顶部显示全局按钮
[文件有 3 处待确认的修改] 🔄 全部接受  🚫 全部拒绝  📊 统计

1: import React from 'react';
2:
3: [1/3] ✅ 接受  ❌ 拒绝
4: <<<<<<< Original [block-abc]
...
10: >>>>>>> Claude's Change
11:
12: [2/3] ✅ 接受  ❌ 拒绝
13: <<<<<<< Original [block-def]
...
```

### 5.2 状态栏提示

```
# 文件有未处理的 blocks
[Claudix] 📝 3 处待确认修改 | [下一个 Cmd+]] [接受 Cmd+K]

# 正在处理
[Claudix] ⚙️ 正在计算差异...

# 全部处理完成
[Claudix] ✅ 所有修改已处理
```

### 5.3 侧边栏面板（可选）

**位置**：Activity Bar 新增 "Diff Preview" 图标

**内容**：

```
Diff Preview
─────────────────────────────

📁 src/App.tsx (3 处修改)
  ├─ [1] 第 12 行：添加类型注解
  │    ✅ 接受  ❌ 拒绝
  ├─ [2] 第 45 行：修复拼写错误
  │    ✅ 接受  ❌ 拒绝
  └─ [3] 第 89 行：优化性能
       ✅ 接受  ❌ 拒绝

📁 src/utils/helper.ts (1 处修改)
  └─ [1] 第 5 行：添加错误处理
       ✅ 接受  ❌ 拒绝

─────────────────────────────
全局操作：
  [接受所有] [拒绝所有] [清空]
```

### 5.4 快速面板（Cmd+Shift+P）

```
> Claudix: 接受当前块
> Claudix: 拒绝当前块
> Claudix: 接受所有修改
> Claudix: 拒绝所有修改
> Claudix: 跳到下一个差异块
> Claudix: 跳到上一个差异块
> Claudix: 清空所有差异块
> Claudix: 显示差异统计
> Claudix: 切换差异预览模式
> Claudix: 导出差异报告
```

---

## 6. 配置选项

### 6.1 用户配置（settings.json）

```json
{
  "claudix.diffPreview.enabled": true,
  "claudix.diffPreview.autoSave": false,
  "claudix.diffPreview.maxBlocksPerFile": 50,
  "claudix.diffPreview.diffAlgorithm": "myers",
  "claudix.diffPreview.showLineNumbers": true,
  "claudix.diffPreview.colorScheme": {
    "added": "rgba(0, 255, 0, 0.2)",
    "deleted": "rgba(255, 0, 0, 0.2)",
    "marker": "rgba(128, 128, 128, 0.15)"
  },
  "claudix.diffPreview.codeLens.enabled": true,
  "claudix.diffPreview.codeLens.showCount": true,
  "claudix.diffPreview.persistence.enabled": true,
  "claudix.diffPreview.persistence.location": ".vscode/claudix-diff-state.json",
  "claudix.diffPreview.performance.virtualScroll": true,
  "claudix.diffPreview.performance.maxFileSize": 10000,
  "claudix.diffPreview.notifications.onAccept": false,
  "claudix.diffPreview.notifications.onReject": true,
  "claudix.diffPreview.shortcuts.accept": "cmd+k",
  "claudix.diffPreview.shortcuts.reject": "cmd+shift+k"
}
```

### 6.2 工作模式集成

#### 6.2.1 基础配置

```json
{
  // 默认工作模式
  "claudix.workMode": "default",  // 'default' | 'agent' | 'ask'

  // 工作模式行为说明：
  // - 'default': 启用差异预览，显示 conflict markers，需要用户逐一确认
  // - 'agent': 禁用差异预览，AI 修改直接应用，无需用户确认
  // - 'ask': 每次修改前弹窗询问用户选择预览或直接应用
}
```

#### 6.2.2 Default 模式配置

```json
{
  // Default 模式：差异预览的详细配置
  "claudix.workMode.default.enabled": true,

  // 是否在接受修改后显示成功动画
  "claudix.workMode.default.showAcceptAnimation": true,

  // 接受修改后的动画持续时间（毫秒）
  "claudix.workMode.default.animationDuration": 500,

  // 是否在状态栏显示待处理块的数量
  "claudix.workMode.default.showPendingCount": true,

  // 是否自动跳转到第一个差异块
  "claudix.workMode.default.autoFocusFirstBlock": true
}
```

#### 6.2.3 Agent 模式配置

```json
{
  // Agent 模式：自动应用的详细配置
  "claudix.workMode.agent.enabled": true,

  // 是否显示"已自动应用修改"的通知
  "claudix.workMode.agent.showNotification": true,

  // 通知显示时长（毫秒，0 表示不自动关闭）
  "claudix.workMode.agent.notificationDuration": 3000,

  // 通知类型
  "claudix.workMode.agent.notificationType": "statusBar",  // 'statusBar' | 'toast' | 'none'

  // 是否记录自动应用的日志
  "claudix.workMode.agent.logChanges": true
}
```

#### 6.2.4 Ask 模式配置

```json
{
  // Ask 模式：询问行为的详细配置
  "claudix.workMode.ask.enabled": true,

  // 是否允许用户勾选"记住我的选择"
  "claudix.workMode.ask.allowRememberChoice": true,

  // 记住选择的有效期（秒，-1 表示永久）
  "claudix.workMode.ask.rememberDuration": 3600,

  // 弹窗显示的详细程度
  "claudix.workMode.ask.detailLevel": "summary",  // 'minimal' | 'summary' | 'detailed'

  // minimal: 仅显示文件数量
  // summary: 显示文件名和修改数量（默认）
  // detailed: 显示完整的修改预览
}
```

#### 6.2.5 模式切换配置

```json
{
  // 切换工作模式时，对已有差异块的处理策略
  "claudix.workMode.switchBehavior": "prompt",
  // 可选值：
  // - 'prompt': 弹窗询问用户（默认）
  // - 'acceptAll': 自动接受所有未处理的块
  // - 'rejectAll': 自动拒绝所有未处理的块
  // - 'keep': 保留所有块，不做处理

  // 切换模式时是否显示确认提示
  "claudix.workMode.switchConfirmation": true,

  // 快速切换工作模式的快捷键（Cmd+Option+M）
  "claudix.workMode.quickSwitch.enabled": true
}
```

#### 6.2.6 与差异预览功能的联动

```json
{
  // 当 workMode = 'default' 时，以下差异预览配置才会生效：
  "claudix.diffPreview.enabled": true,
  "claudix.diffPreview.maxBlocksPerFile": 50,
  "claudix.diffPreview.diffAlgorithm": "myers",
  // ... 其他差异预览配置（见 6.1 节）

  // 当 workMode = 'agent' 时，差异预览功能自动禁用
  // 当 workMode = 'ask' 时，根据用户选择动态启用/禁用
}
```

#### 6.2.7 完整配置示例

```json
{
  // === 工作模式基础配置 ===
  "claudix.workMode": "default",

  // === Default 模式配置 ===
  "claudix.workMode.default.enabled": true,
  "claudix.workMode.default.showAcceptAnimation": true,
  "claudix.workMode.default.animationDuration": 500,
  "claudix.workMode.default.showPendingCount": true,
  "claudix.workMode.default.autoFocusFirstBlock": true,

  // === Agent 模式配置 ===
  "claudix.workMode.agent.enabled": true,
  "claudix.workMode.agent.showNotification": true,
  "claudix.workMode.agent.notificationDuration": 3000,
  "claudix.workMode.agent.notificationType": "statusBar",
  "claudix.workMode.agent.logChanges": true,

  // === Ask 模式配置 ===
  "claudix.workMode.ask.enabled": true,
  "claudix.workMode.ask.allowRememberChoice": true,
  "claudix.workMode.ask.rememberDuration": 3600,
  "claudix.workMode.ask.detailLevel": "summary",

  // === 模式切换配置 ===
  "claudix.workMode.switchBehavior": "prompt",
  "claudix.workMode.switchConfirmation": true,
  "claudix.workMode.quickSwitch.enabled": true,

  // === 差异预览配置（仅在 default 模式生效）===
  "claudix.diffPreview.enabled": true,
  "claudix.diffPreview.maxBlocksPerFile": 50,
  "claudix.diffPreview.diffAlgorithm": "myers",
  "claudix.diffPreview.colorScheme": {
    "added": "rgba(0, 255, 0, 0.2)",
    "deleted": "rgba(255, 0, 0, 0.2)",
    "marker": "rgba(128, 128, 128, 0.15)"
  }
}
```

#### 6.2.8 推荐配置场景

**场景 1：谨慎开发者（推荐新手）**

```json
{
  "claudix.workMode": "default",
  "claudix.workMode.default.autoFocusFirstBlock": true,
  "claudix.diffPreview.maxBlocksPerFile": 30,
  "claudix.diffPreview.notifications.onAccept": true,
  "claudix.diffPreview.notifications.onReject": true
}
```

**场景 2：高效开发者（推荐熟练用户）**

```json
{
  "claudix.workMode": "ask",
  "claudix.workMode.ask.allowRememberChoice": true,
  "claudix.workMode.ask.rememberDuration": 7200,
  "claudix.workMode.quickSwitch.enabled": true,
  "claudix.diffPreview.shortcuts.accept": "cmd+k"
}
```

**场景 3：信任 AI（推荐紧急情况）**

```json
{
  "claudix.workMode": "agent",
  "claudix.workMode.agent.showNotification": true,
  "claudix.workMode.agent.logChanges": true,
  "claudix.workMode.switchBehavior": "keep"
}
```

---

## 7. 性能指标要求

### 7.1 响应时间

| 操作 | 目标时间 | 最大容忍时间 |
|-----|---------|------------|
| Diff 计算（<1000 行） | < 100ms | < 300ms |
| Diff 计算（1000-5000 行） | < 500ms | < 1s |
| Diff 计算（>5000 行） | < 2s | < 5s |
| 插入 Markers | < 50ms | < 200ms |
| 接受/拒绝操作 | < 50ms | < 100ms |
| 装饰器渲染 | < 30ms | < 100ms |
| CodeLens 更新 | < 50ms | < 150ms |

### 7.2 内存占用

| 场景 | 目标 | 最大容忍 |
|-----|------|---------|
| 单文件状态（1000 行） | < 500KB | < 1MB |
| 10 个文件缓存 | < 10MB | < 20MB |
| 持久化文件大小 | < 1MB | < 5MB |

### 7.3 性能监控

```typescript
class PerformanceMonitor {
  private metrics: Map<string, PerformanceEntry[]> = new Map();

  measure<T>(operation: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      this.record(operation, duration);

      // 警告慢操作
      if (duration > SLOW_THRESHOLD[operation]) {
        console.warn(`[Performance] ${operation} took ${duration}ms (expected < ${SLOW_THRESHOLD[operation]}ms)`);
      }
    }
  }

  getReport(): PerformanceReport {
    // 生成性能报告
  }
}
```

---

## 8. 测试要求

### 8.1 单元测试覆盖率

| 模块 | 目标覆盖率 |
|-----|----------|
| DiffCalculator | 95% |
| DiffStateManager | 90% |
| MarkerInserter | 85% |
| MarkerParser | 90% |
| BlockIdGenerator | 100% |
| StateSerializer | 85% |

### 8.2 关键测试场景

#### 场景 1：基本 Diff 流程

```typescript
test('should create diff blocks when AI modifies file', async () => {
  const oldContent = 'const x = 1;';
  const newContent = 'const x = 2;';

  await service.handleAIEdit('test.ts', oldContent, newContent);

  const blocks = service.getBlocks('test.ts');
  expect(blocks).toHaveLength(1);
  expect(blocks[0].baseContent).toBe(oldContent);
  expect(blocks[0].currentContent).toBe(newContent);
});
```

#### 场景 2：同位置多次修改

```typescript
test('should update base content after accepting block', async () => {
  // 第一次修改
  await service.handleAIEdit('test.ts', 'const x = 1;', 'const x = 2;');
  const block1 = service.getBlocks('test.ts')[0];

  // 接受
  await service.acceptBlock(block1.id);

  // 第二次修改同一位置
  await service.handleAIEdit('test.ts', 'const x = 2;', 'const x = 3;');
  const block2 = service.getBlocks('test.ts')[0];

  // 验证基准是上次接受的内容
  expect(block2.baseContent).toBe('const x = 2;');
  expect(block2.baseType).toBe('accepted');
  expect(block2.baseBlockId).toBe(block1.id);
});
```

#### 场景 3：Marker 格式校验

```typescript
test('should detect invalid marker format', () => {
  const invalidContent = `
    <<<<<<< Original [block-123]
    old content
    >>>>>>> Claude's Change
  `;  // 缺少 =======

  const result = validator.validate(invalidContent);
  expect(result.valid).toBe(false);
  expect(result.errors[0].type).toBe('incomplete_marker');
});
```

#### 场景 4：大文件性能

```typescript
test('should handle large file efficiently', async () => {
  const largeFile = generateLargeFile(10000);  // 10000 行
  const modified = modifyLines(largeFile, [100, 500, 1000]);

  const start = performance.now();
  await service.handleAIEdit('large.ts', largeFile, modified);
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(2000);  // < 2s
});
```

#### 场景 5：状态持久化

```typescript
test('should restore state after restart', async () => {
  // 创建 blocks
  await service.handleAIEdit('test.ts', 'old', 'new');
  const originalBlocks = service.getBlocks('test.ts');

  // 模拟重启
  await service.dispose();
  const newService = new DiffPreviewService();
  await newService.restoreState();

  // 验证状态恢复
  const restoredBlocks = newService.getBlocks('test.ts');
  expect(restoredBlocks).toEqual(originalBlocks);
});
```

### 8.3 集成测试

#### 与 ClaudeAgentService 集成

```typescript
test('should integrate with ClaudeAgentService', async () => {
  const agentService = new ClaudeAgentService();
  const diffService = new DiffPreviewService();

  // 模拟 AI 执行 Write 工具
  const toolInput = {
    file_path: 'test.ts',
    content: 'new content'
  };

  // 监听文件修改
  const blocks = await new Promise(resolve => {
    setTimeout(() => {
      resolve(diffService.getBlocks('test.ts'));
    }, 100);
  });

  await agentService.executeTool('Write', toolInput);

  expect(blocks).toHaveLength(1);
});
```

### 8.4 E2E 测试

```typescript
test('E2E: complete user workflow', async () => {
  // 1. AI 修改文件
  await simulateAIEdit('test.ts', 'old', 'new');

  // 2. 用户查看 diff
  const editor = await vscode.window.showTextDocument('test.ts');
  expect(editor.document.getText()).toContain('<<<<<<<');

  // 3. 用户接受修改
  await vscode.commands.executeCommand('claudix.acceptDiffBlock', blockId);

  // 4. 验证 markers 已移除
  expect(editor.document.getText()).not.toContain('<<<<<<<');

  // 5. 验证文件内容正确
  expect(editor.document.getText()).toBe('new');
});
```

---

## 9. 风险评估与缓解

### 9.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| 无限循环（插入 markers 触发监听） | 高 | 中 | 严格的标记位管理 + 单元测试 |
| 大文件性能问题 | 中 | 高 | Myers Diff + 虚拟滚动 + 限制 block 数量 |
| Marker 格式被破坏 | 中 | 中 | 实时校验 + 自动清理 + 用户提示 |
| 状态不一致（内存 vs 磁盘） | 高 | 低 | 定时同步 + 哈希校验 |
| 用户手动编辑冲突 | 低 | 高 | 容错处理 + 清晰的提示 |

### 9.2 用户体验风险

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 不理解 Conflict Markers | 中 | 首次使用引导 + 文档说明 |
| 误操作（错误接受/拒绝） | 中 | 撤销功能（Cmd+Z） + 确认对话框（可选） |
| 视觉混乱（太多 markers） | 低 | 限制显示数量 + 折叠功能 |
| 性能卡顿 | 高 | 性能监控 + 降级策略 |

### 9.3 兼容性风险

| 风险 | 缓解措施 |
|-----|---------|
| VSCode API 变更 | 使用稳定 API + 版本检测 |
| 与其他扩展冲突 | 命名空间隔离 + 礼貌的 API 使用 |
| 跨平台差异（Windows/Mac/Linux） | 路径规范化 + 平台特定测试 |

---

## 10. 里程碑与交付物

### 10.1 开发里程碑

| 阶段 | 目标 | 交付物 | 预估时间 |
|-----|------|--------|---------|
| M1：基础架构 | 搭建核心模块和数据结构 | DiffStateManager, DiffBlock 模型 | 2 天 |
| M2：Diff 引擎 | 实现 Myers Diff 算法 | DiffCalculator, MyersDiff | 2 天 |
| M3：Marker 系统 | 实现 marker 插入/解析/校验 | MarkerInserter, MarkerParser | 2 天 |
| M4：UI 层 | 实现装饰器和 CodeLens | DecorationManager, CodeLensProvider | 2 天 |
| M5：集成与测试 | 与 ClaudeAgentService 集成 | 完整工作流 | 2 天 |
| M6：优化与打磨 | 性能优化、状态持久化 | 生产就绪版本 | 3 天 |

**总预估**：13 个工作日

### 10.2 交付物清单

- [ ] 完整的源代码（约 2000 行）
- [ ] 单元测试（覆盖率 ≥ 85%）
- [ ] 集成测试套件
- [ ] 用户文档（使用指南）
- [ ] 开发者文档（架构说明）
- [ ] 性能测试报告
- [ ] 已知问题和限制说明

---

## 11. 参考文档

### 11.1 VSCode 官方文档

1. **TextDocument API**
   - URL: https://code.visualstudio.com/api/references/vscode-api#TextDocument
   - 用途：文档内容读取、修改监听

2. **TextEditorDecorationType API**
   - URL: https://code.visualstudio.com/api/references/vscode-api#TextEditorDecorationType
   - 用途：红绿装饰器实现

3. **CodeLensProvider API**
   - URL: https://code.visualstudio.com/api/references/vscode-api#CodeLensProvider
   - 用途：接受/拒绝按钮实现

4. **WorkspaceEdit API**
   - URL: https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit
   - 用途：文件修改操作

5. **onDidChangeTextDocument Event**
   - URL: https://code.visualstudio.com/api/references/vscode-api#workspace.onDidChangeTextDocument
   - 用途：文件修改监听

6. **Configuration API**
   - URL: https://code.visualstudio.com/api/references/vscode-api#workspace.getConfiguration
   - 用途：用户配置管理

### 11.2 Diff 算法参考

1. **Myers Diff 算法论文**
   - 标题: "An O(ND) Difference Algorithm and Its Variations"
   - 作者: Eugene W. Myers
   - 年份: 1986
   - URL: http://www.xmailserver.org/diff2.pdf

2. **diff NPM 包**
   - URL: https://www.npmjs.com/package/diff
   - 版本: ^5.1.0
   - 用途：成熟的 Diff 算法实现

3. **fast-diff 库**
   - URL: https://www.npmjs.com/package/fast-diff
   - 用途：高性能 diff 实现（备选）

### 11.3 Git Conflict Markers 规范

1. **Git 官方文档**
   - URL: https://git-scm.com/docs/git-merge#_how_conflicts_are_presented
   - 用途：Conflict Marker 格式参考

2. **VSCode Git 扩展源码**
   - URL: https://github.com/microsoft/vscode/tree/main/extensions/git
   - 用途：学习如何处理 conflict markers

### 11.4 类似产品参考

1. **Cursor 编辑器**
   - URL: https://cursor.sh
   - 参考点：差异预览 UI、交互流程

2. **GitHub Copilot**
   - URL: https://github.com/features/copilot
   - 参考点：内联建议显示

3. **GitLens 扩展**
   - URL: https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens
   - 参考点：CodeLens 按钮设计

### 11.5 Claude Agent SDK 文档

1. **SDK 官方文档**
   - URL: https://github.com/anthropics/claude-agent-sdk
   - 版本: 2.0.42
   - 用途：工具系统集成

2. **Permission System**
   - 文件: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
   - 用途：理解权限检查流程

3. **Tool Schemas**
   - 文件: `node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts`
   - 用途：Write/Edit 工具的输入输出定义

### 11.6 TypeScript 参考

1. **TypeScript 官方手册**
   - URL: https://www.typescriptlang.org/docs/handbook/intro.html
   - 用途：类型定义最佳实践

2. **Type Challenges**
   - URL: https://github.com/type-challenges/type-challenges
   - 用途：复杂类型定义参考

### 11.7 性能优化参考

1. **VSCode Performance Wiki**
   - URL: https://github.com/microsoft/vscode/wiki/Performance-Issues
   - 用途：性能优化最佳实践

2. **Web Vitals**
   - URL: https://web.dev/vitals/
   - 用途：性能指标定义

3. **React Virtualization**
   - URL: https://github.com/bvaughn/react-virtualized
   - 用途：虚拟滚动实现参考

### 11.8 测试框架文档

1. **Jest 官方文档**
   - URL: https://jestjs.io/docs/getting-started
   - 用途：单元测试框架

2. **@vscode/test-electron**
   - URL: https://www.npmjs.com/package/@vscode/test-electron
   - 用途：VSCode 扩展集成测试

---

## 12. 附录

### 12.1 术语表

| 术语 | 定义 |
|-----|------|
| Diff Block | 单个修改块，包含原始内容和修改内容的对比 |
| Conflict Marker | 差异标记，格式类似 Git merge conflict |
| Base Content | 对比基准内容，可能是原始内容或上次接受的内容 |
| CodeLens | VSCode 提供的代码上方悬浮按钮 |
| Decoration | VSCode 提供的文本装饰功能（背景色、前缀符号等） |
| Myers Diff | 一种高效的 diff 算法，复杂度 O(n*d) |
| Virtual Scroll | 虚拟滚动，仅渲染可见区域，提升性能 |
| State Persistence | 状态持久化，保存到磁盘以防重启丢失 |

### 12.2 示例代码片段

#### 生成 Block ID

```typescript
import { createHash } from 'crypto';

function generateBlockId(filePath: string, startLine: number): string {
  const fileHash = createHash('md5')
    .update(filePath)
    .digest('hex')
    .slice(0, 8);
  const timestamp = Date.now();
  return `block-${fileHash}-L${startLine}-T${timestamp}`;
}

// 示例输出: "block-a1b2c3d4-L15-T1700123456789"
```

#### Myers Diff 使用示例

```typescript
import { diffLines } from 'diff';

function calculateDiff(oldContent: string, newContent: string): DiffBlock[] {
  const changes = diffLines(oldContent, newContent);
  const blocks: DiffBlock[] = [];

  let currentLine = 0;
  for (const change of changes) {
    if (change.added || change.removed) {
      blocks.push({
        startLine: currentLine,
        endLine: currentLine + change.count,
        deletedLines: change.removed ? change.value.split('\n') : [],
        addedLines: change.added ? change.value.split('\n') : [],
        changeType: change.added ? 'add' : change.removed ? 'delete' : 'modify'
      });
    }

    if (!change.added) {
      currentLine += change.count;
    }
  }

  return blocks;
}
```

#### Conflict Marker 构建

```typescript
function buildConflictMarker(block: DiffBlock): string {
  const lines: string[] = [];

  lines.push(`<<<<<<< Original [${block.id}]`);
  lines.push(...block.deletedLines);
  lines.push('=======');
  lines.push(...block.addedLines);
  lines.push(">>>>>>> Claude's Change");

  return lines.join('\n');
}

// 示例输出:
// <<<<<<< Original [block-abc]
// const x = 1;
// =======
// const x = 2;
// >>>>>>> Claude's Change
```

### 12.3 配置示例

#### .vscode/settings.json

```json
{
  "claudix.diffPreview.enabled": true,
  "claudix.diffPreview.maxBlocksPerFile": 30,
  "claudix.diffPreview.diffAlgorithm": "myers",
  "claudix.diffPreview.colorScheme": {
    "added": "rgba(0, 255, 0, 0.15)",
    "deleted": "rgba(255, 0, 0, 0.15)",
    "marker": "rgba(128, 128, 128, 0.1)"
  },
  "claudix.diffPreview.shortcuts": {
    "accept": "cmd+k",
    "reject": "cmd+shift+k",
    "nextBlock": "cmd+]",
    "prevBlock": "cmd+["
  }
}
```

#### keybindings.json

```json
[
  {
    "key": "cmd+k",
    "command": "claudix.acceptDiffBlock",
    "when": "editorTextFocus && claudix.hasDiffBlocks"
  },
  {
    "key": "cmd+shift+k",
    "command": "claudix.rejectDiffBlock",
    "when": "editorTextFocus && claudix.hasDiffBlocks"
  },
  {
    "key": "cmd+]",
    "command": "claudix.nextDiffBlock",
    "when": "editorTextFocus && claudix.hasDiffBlocks"
  },
  {
    "key": "cmd+[",
    "command": "claudix.prevDiffBlock",
    "when": "editorTextFocus && claudix.hasDiffBlocks"
  }
]
```

---

## 13. 文档变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|-----|------|------|---------|
| v1.0 | 2025-11-16 | Claude Code | 初始版本，完整需求定义 |
| v1.1 | 2025-11-16 | Claude Code | 添加工作模式集成（2.9 章节），扩展 6.2 配置选项，明确 default/agent/ask 三种模式的差异预览行为 |

---

## 14. 审批与签字

| 角色 | 姓名 | 签字 | 日期 |
|-----|------|------|------|
| 产品经理 | | | |
| 技术负责人 | | | |
| 开发工程师 | | | |
| 测试工程师 | | | |

---

**文档结束**
