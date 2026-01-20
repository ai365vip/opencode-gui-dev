/**
 * EventEmitter - 简单的事件发射器
 *
 * 用于管理事件回调的注册和触发
 * 主要用于 Tool 请求/响应的回调管理和会话状态变更通知
 */
export class EventEmitter<T = any> {
    private callbacks: Array<(data: T) => void> = [];

    /**
     * 添加事件监听器
     * @param callback 回调函数
     * @returns 取消订阅函数
     */
    add(callback: (data: T) => void): () => void {
        this.callbacks.push(callback);

        // 返回取消订阅函数
        return () => {
            const index = this.callbacks.indexOf(callback);
            if (index !== -1) {
                this.callbacks.splice(index, 1);
            }
        };
    }

    /**
     * 触发事件，通知所有监听器
     * @param data 事件数据
     */
    emit(data: T): void {
        for (const callback of this.callbacks) {
            try {
                callback(data);
            } catch (error) {
                console.error('[EventEmitter] Callback error:', error);
            }
        }
    }

    /**
     * 清除所有监听器
     */
    clear(): void {
        this.callbacks = [];
    }

    /**
     * 获取监听器数量
     */
    get listenerCount(): number {
        return this.callbacks.length;
    }
}
