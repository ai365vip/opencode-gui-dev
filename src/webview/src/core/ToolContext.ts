/**
 * ToolContext - Tool 执行上下文
 *
 * 管理 Tool 的执行状态和结果
 */

import { signal } from 'alien-signals';

type Signal<T> = ReturnType<typeof signal<T>>;

/**
 * Tool 结果类型
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  is_error?: boolean;
  [key: string]: any;
}

export class ToolContext {
  public readonly channelId: string;
  public readonly toolName: string;
  public readonly inputs: any;

  private toolResultSignal: Signal<ToolResult | undefined>;

  constructor(channelId: string, toolName: string, inputs: any) {
    this.channelId = channelId;
    this.toolName = toolName;
    this.inputs = inputs;
    this.toolResultSignal = signal<ToolResult | undefined>(undefined);
  }

  /**
   * 获取 Tool 结果的 Signal
   */
  get toolResult(): Signal<ToolResult | undefined> {
    return this.toolResultSignal;
  }

  /**
   * 设置 Tool 结果
   * @param result Tool 执行结果
   */
  setToolResult(result: ToolResult): void {
    this.toolResultSignal(result);
  }

  /**
   * 检查 Tool 是否执行成功
   */
  isSuccess(): boolean {
    const result = this.toolResultSignal();
    return result ? result.success && !result.is_error : false;
  }

  /**
   * 检查 Tool 是否执行失败
   */
  isError(): boolean {
    const result = this.toolResultSignal();
    return result ? !result.success || result.is_error === true : false;
  }

  /**
   * 获取错误消息
   */
  getErrorMessage(): string | undefined {
    const result = this.toolResultSignal();
    return result?.error;
  }

  /**
   * 获取输出内容
   */
  getOutput(): string | undefined {
    const result = this.toolResultSignal();
    return result?.output;
  }
}
