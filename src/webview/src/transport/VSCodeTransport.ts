import { BaseTransport } from './BaseTransport';
import { EventEmitter } from '../utils/events';
import type { FromExtensionWrapper, WebViewToExtensionMessage } from '../../../shared/messages';

interface VsCodeApi {
    postMessage(message: any): void;
}

export class VSCodeTransport extends BaseTransport {
    private readonly api: VsCodeApi;
    private readonly openedPromise: Promise<void>;
    private readonly closedPromise: Promise<void>;

    override get opened(): Promise<void> {
        return this.openedPromise;
    }

    override get closed(): Promise<void> {
        return this.closedPromise;
    }

    private filteredMessageCount = 0;
    private lastLogTime = Date.now();

    private handleMessage = (event: MessageEvent<FromExtensionWrapper>) => {
        const data = event.data;
        if (!data || data.type !== 'from-extension') {
            return;
        }

        // 过滤掉常规高频消息，只记录重要消息
        const messageType = data.message.type;
        const filteredTypes = new Set([
            'io_message',           // IO消息（高频）
            'response',             // 响应消息（高频）
            'visibility_changed',   // 可见性变化
            'selection_changed'     // 选区变化（高频）
        ]);

        const shouldLog = !filteredTypes.has(messageType);

        if (shouldLog) {
            console.log('📨 [From Extension]', data.message);
        } else {
            // 计数过滤的消息
            this.filteredMessageCount++;
            const now = Date.now();
            // 每10秒汇总一次
            if (now - this.lastLogTime > 10000) {
                if (this.filteredMessageCount > 0) {
                    console.log(`📊 过滤了 ${this.filteredMessageCount} 条常规消息 (io_message, response 等)`);
                    this.filteredMessageCount = 0;
                }
                this.lastLogTime = now;
            }
        }

        // 对于某些消息类型，需要re-dispatch为window message event
        // 因为组件中的监听器期望接收原始window message
        const needRedispatch = [
            'add-selection',
            'add-multiple-files',
            'insert-file-reference',
            'custom-model-added',
        ];

        if (needRedispatch.includes(data.message.type)) {
            // Re-dispatch为window message，供组件监听器使用
            window.dispatchEvent(new MessageEvent('message', {
                data: data.message
            }));

            // 这些消息只需要 re-dispatch 给组件监听器，不需要 enqueue 给 BaseTransport
            return;
        }

        this.fromHost.enqueue(data.message);
    };

    constructor(atMentionEvents: EventEmitter<string>, selectionChangedEvents: EventEmitter<any>) {
        super(atMentionEvents, selectionChangedEvents);

        this.api = (window as any).acquireVsCodeApi();

        // 暴露vscode API到window，供组件使用
        (window as any).vscode = this.api;

        window.addEventListener('message', this.handleMessage);

        this.openedPromise = this.initialize();
        this.closedPromise = new Promise(() => {
            /* resolved when extension disposes webview */
        });
    }

    protected send(message: WebViewToExtensionMessage): void {
        this.api.postMessage(message);
    }

    override close(): void {
        window.removeEventListener('message', this.handleMessage);
        super.close();
    }
}
