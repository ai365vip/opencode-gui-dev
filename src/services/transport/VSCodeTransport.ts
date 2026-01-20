/**
 * VSCodeTransport - VSCode WebView 传输适配器
 *
 * 职责：
 * 1. 实现 BaseTransport 抽象类
 * 2. 通过 WebViewService 封装 VSCode WebView 通信
 * 3. 在 Agent 和 WebView 之间传递消息
 *
 * 特点：
 * - 将 VSCode 原生 API 与核心逻辑隔离
 * - 通过 DI 注入所有依赖服务
 * - 便于未来替换为其他传输层（如 NestJS WebSocket）
 */

import { BaseTransport } from './BaseTransport';
import { ILogService } from '../logService';
import { IWebViewService } from '../webViewService';

/**
 * VSCode WebView Transport 实现
 */
export class VSCodeTransport extends BaseTransport {
    constructor(
        @IWebViewService private readonly webViewService: IWebViewService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
        this.logService.info('[VSCodeTransport] 已初始化');
    }

    /**
     * 发送消息到 WebView
     */
    send(message: any): void {
        try {
            // 只记录重要消息类型，过滤高频常规消息
            const importantMessages = new Set(['close_channel', 'tool_permission_request']);
            if (importantMessages.has(message.type)) {
                this.logService.info(`[VSCodeTransport] 发送消息: ${message.type}`);
            }
            this.webViewService.postMessage(message);
        } catch (error) {
            this.logService.error('[VSCodeTransport] 发送消息失败:', error);
        }
    }
}

