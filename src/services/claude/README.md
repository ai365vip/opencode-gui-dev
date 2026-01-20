# Claude 服务模块

基于依赖注入（DI）的 Claude Agent 核心服务，采用模块化架构设计。

## 目录结构

```
claude/
├── transport/                      # 传输层模块
│   ├── index.ts                   # 统一导出
│   ├── AsyncStream.ts             # 流抽象（通用）
│   ├── BaseTransport.ts           # 传输层抽象基类
│   └── VSCodeTransport.ts         # VSCode WebView 实现
│
├── handlers/                       # 请求处理器
│   ├── types.ts                   # Handler 类型定义
│   ├── sessions.ts                # 会话处理
│   ├── auth.ts                    # 认证处理
│   └── ...                        # 其他 handlers
│
├── ClaudeAgentService.ts          # 核心编排服务
├── ClaudeSdkService.ts            # SDK 薄封装
└── ClaudeSessionService.ts        # 历史会话服务
```

## 架构层次

```
┌─────────────────────────────────────────────────┐
│              ClaudeAgentService                 │  核心编排
│  (编排、路由、会话管理、RPC)                      │
└────────────┬──────────────┬─────────────────────┘
             │              │
    ┌────────▼───────┐ ┌───▼──────────────┐
    │  ITransport    │ │  ClaudeSdkService│      服务层
    │  (传输层接口)   │ │  (SDK 封装)      │
    └────────┬───────┘ └───┬──────────────┘
             │              │
    ┌────────▼───────┐ ┌───▼──────────────┐
    │ BaseTransport  │ │  AsyncStream     │      基础设施
    │ (通用传输逻辑)  │ │  (流抽象)        │
    └────────┬───────┘ └──────────────────┘
             │
    ┌────────▼───────┐
    │VSCodeTransport │                            平台实现
    │(VSCode WebView)│
    └────────────────┘
```

## 核心组件

### 传输层 (transport/)

**BaseTransport** - 抽象基类
- 提供消息缓冲、错误处理、监听器管理
- 定义 ITransport 接口
- 子类只需实现 `doSend()` 和 `doClose()`

**VSCodeTransport** - VSCode 实现
- 继承 BaseTransport
- 封装 VSCode WebView 通信
- 自动管理资源（Disposable）

**AsyncStream** - 流抽象
- 生产者-消费者模式
- 背压控制、错误传播
- 供 Agent、SDK、Transport 复用

### 核心服务

**ClaudeAgentService**
- 管理多个 Claude 会话（channels）
- 路由请求到 handlers
- RPC 请求-响应管理
- 依赖 ITransport 接口（解耦）

**ClaudeSdkService**
- 封装 Claude Agent SDK
- 提供 query() 和 interrupt() 方法
- 配置管理（Options、Hooks、环境变量）

**ClaudeSessionService**
- 历史会话加载和管理
- 提供 listSessions() 和 getSession()
- 内部缓存优化

### Handlers

统一签名：
```typescript
async function handleXxx(
    request: TRequest,
    context: HandlerContext,
    signal?: AbortSignal
): Promise<TResponse>
```

HandlerContext 仅包含服务接口，禁止直接使用 VS Code 原生 API。

## 使用示例

### 初始化

```typescript
// 1. 获取服务实例（通过 DI 容器）
const agentService = instantiationService.get(IClaudeAgentService);
const logService = instantiationService.get(ILogService);

// 2. 创建 Transport
const transport = new VSCodeTransport(webview, logService);

// 3. 初始化 Agent
agentService.init(transport);
```

### 启动会话

```typescript
await agentService.launchClaude(
    'channel-1',
    null,                    // resume
    '/path/to/workspace',
    'claude-sonnet-4-5',
    'default'                // permissionMode
);
```

### 扩展到其他平台

```typescript
// NestJS WebSocket Transport
class NestJSTransport extends BaseTransport {
    constructor(
        private gateway: WebSocketGateway,
        logService: ILogService
    ) {
        super(logService);
        gateway.onMessage((msg) => this.handleIncomingMessage(msg));
    }

    protected doSend(message: any): void {
        this.gateway.emit('message', message);
    }

    protected doClose(): void {
        this.gateway.close();
    }
}

// 使用方式完全相同
const transport = new NestJSTransport(gateway, logService);
agentService.init(transport);
```

## 设计原则

1. **依赖注入**：所有服务通过 DI 容器管理
2. **职责分离**：每个模块有明确的职责边界
3. **接口隔离**：Transport、Handler 等都通过接口定义
4. **开放封闭**：易于扩展（新 Handler、新 Transport），不易修改
5. **平台解耦**：核心逻辑不依赖特定平台 API

## 扩展指南

### 添加新 Handler

1. 在 `handlers/` 创建新文件
2. 实现统一签名的处理函数
3. 在 `ClaudeAgentService.handleRequest()` 添加路由

### 添加新 Transport

1. 继承 `BaseTransport`
2. 实现 `doSend()` 和 `doClose()`
3. 可选：覆盖错误处理方法

### 添加新服务

1. 定义服务接口（使用 createDecorator）
2. 实现服务类
3. 在 serviceRegistry 注册
4. 通过构造函数注入使用

## 测试

传输层模块化设计使得测试更容易：

```typescript
// Mock Transport
class MockTransport extends BaseTransport {
    messages: any[] = [];

    protected doSend(message: any): void {
        this.messages.push(message);
    }

    protected doClose(): void {
        this.messages = [];
    }

    // 模拟接收消息
    simulateMessage(message: any): void {
        this.handleIncomingMessage(message);
    }
}

// 使用 Mock Transport 测试
const mockTransport = new MockTransport(logService);
agentService.init(mockTransport);

// 验证发送的消息
expect(mockTransport.messages).toContainEqual({
    type: 'io_message',
    channelId: 'test',
    // ...
});
```

## 参考文档

- [RefactorFunctions.md](../../../RefactorFunctions.md) - 重构方案详细说明
- [REFACTOR_SUMMARY.md](../../../REFACTOR_SUMMARY.md) - 重构总结和架构分析
