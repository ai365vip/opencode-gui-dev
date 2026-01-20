/**
 * BaseTransport - 传输层抽象接口
 *
 * 定义 Transport 的基本契约，用于在 Agent 和客户端之间传递消息
 *
 * 实现类：
 * - VSCodeTransport: VSCode WebView 传输实现
 * - NestJSTransport: NestJS WebSocket 传输实现（未来）
 * - ElectronTransport: Electron IPC 传输实现（未来）
 *
 * 设计原则：
 * - 双向通信：send() 发送消息，onMessage() 接收消息
 * - 平台无关：不依赖具体的宿主环境 API
 * - 简单抽象：只定义最核心的传输能力
 */

/**
 * Transport 接口
 *
 * 用于在 Claude Agent 和客户端（WebView/WebSocket/IPC）之间传递消息
 */
export interface ITransport {
    /**
     * 发送消息到客户端
     *
     * @param message - 要发送的消息对象
     */
    send(message: any): void;

    /**
     * 监听来自客户端的消息
     *
     * @param callback - 消息接收回调函数
     */
    onMessage(callback: (message: any) => void): void;
}

/**
 * Transport 抽象基类（可选）
 *
 * 提供一些通用功能，具体实现可以继承此类
 */
export abstract class BaseTransport implements ITransport {
    protected messageCallback?: (message: any) => void;

    /**
     * 发送消息（由子类实现）
     */
    abstract send(message: any): void;

    /**
     * 注册消息监听器
     */
    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    /**
     * 触发消息回调（供子类调用）
     */
    protected triggerMessage(message: any): void {
        if (this.messageCallback) {
            this.messageCallback(message);
        }
    }
}
