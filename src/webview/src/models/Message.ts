/**
 * Message - 消息类
 *
 * 核心功能：
 * 1. 包装消息数据
 * 2. 提供 isEmpty getter（动态计算）
 * 3. 支持 ContentBlockWrapper 响应式 tool_result 关联
 */

import type { ContentBlockType } from '../models/ContentBlock';
import { parseMessageContent } from '../models/contentParsers';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';

/**
 * 消息类型
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'result' | 'tip' | 'slash_command_result';

/**
 * 消息内容数据
 */
export interface MessageData {
  role: MessageRole;
  content: string | ContentBlockWrapper[];
}

/**
 * 消息类
 *
 * 对应原版逻辑：
 * - user/assistant 消息：content 是 ContentBlockWrapper[]
 * - system/result 消息：content 是 string
 */
export class Message {
  id: string;           // Vue v-for key（唯一标识符）
  type: MessageRole;
  message: MessageData;
  timestamp: number;

  // 额外字段（用于 system 和 result 消息）
  subtype?: string;
  session_id?: string;
  is_error?: boolean;

  // 原始消息 ID（用于 resumeSessionAt）
  messageId?: string;  // assistant 消息的 message.id
  uuid?: string;       // SDK 消息的 uuid

  constructor(
    type: MessageRole,
    message: MessageData,
    timestamp: number = Date.now(),
    extra?: {
      id?: string;      // 可选：指定 id（用于流式更新时复用）
      subtype?: string;
      session_id?: string;
      is_error?: boolean;
      messageId?: string;
      uuid?: string;
    }
  ) {
    // 生成唯一 ID（用于 Vue v-for key）
    this.id = extra?.id || `msg_${timestamp}_${Math.random().toString(36).slice(2, 9)}`;
    this.type = type;
    this.message = message;
    this.timestamp = timestamp;

    if (extra) {
      this.subtype = extra.subtype;
      this.session_id = extra.session_id;
      this.is_error = extra.is_error;
      this.messageId = extra.messageId;
      this.uuid = extra.uuid;
    }
  }

  /**
   * isEmpty getter - 判断消息是否为"空"
   *
   * 判断逻辑：
   * 1. system 消息永远不是 empty
   * 2. user/assistant 消息：
   *    - 内容为空数组 → empty
   *    - 所有内容块都是 tool_result → empty
   */
  get isEmpty(): boolean {
    // system 消息永远不是 empty
    if (this.type === 'system') {
      return false;
    }

    const content = this.message.content;

    // 字符串内容不会是 empty
    if (typeof content === 'string') {
      return content.length === 0;
    }

    // ContentBlockWrapper 数组
    if (Array.isArray(content)) {
      // 空数组 → empty
      if (content.length === 0) {
        return true;
      }

      // 所有内容块都是 tool_result → empty
      return content.every((wrapper) => wrapper.content.type === 'tool_result');
    }

    return false;
  }

  /**
   * 静态工厂方法 - 从原始消息创建 Message 实例
   *
   * @param raw 原始消息对象
   * @returns Message 实例或 null
   */
  static fromRaw(raw: any): Message | null {
    if (raw.type === 'user' || raw.type === 'assistant') {
      const rawContent = Array.isArray(raw.message?.content)
        ? raw.message.content
        : raw.message?.content !== undefined
          ? [{ type: 'text', text: String(raw.message.content) }]
          : [];

      // 解析原始 content
      const contentBlocks = parseMessageContent(rawContent);

      // 包装为 ContentBlockWrapper
      const wrappedContent = contentBlocks.map((block) => new ContentBlockWrapper(block));

      // 基于 contentParsers 的解析结果判断消息类型
      let messageType: MessageRole = raw.type;

      // 检查是否为特殊消息类型
      if (raw.type === 'user') {
        const specialType = getSpecialMessageType(contentBlocks);
        if (specialType) {
          messageType = specialType;
        }
      }

      return new Message(
        messageType,
        {
          role: raw.message?.role ?? raw.type,
          content: wrappedContent,
        },
        raw.timestamp || Date.now(),
        {
          messageId: raw.message?.id,  // assistant 消息的 API ID
          uuid: raw.uuid,               // SDK 消息的 UUID
        }
      );
    }

    // 不渲染 system 消息（仅用于状态更新）
    if (raw.type === 'system') {
      return null;
    }

    // 不渲染 result 消息（仅用于结束标志/用量统计等状态更新）
    if (raw.type === 'result') {
      return null;
    }

    // stream_event 等不创建消息
    return null;
  }
}

/**
 * 类型守卫
 */
export function isUserMessage(msg: Message): boolean {
  return msg.type === 'user';
}

export function isAssistantMessage(msg: Message): boolean {
  return msg.type === 'assistant';
}

export function isSystemMessage(msg: Message): boolean {
  return msg.type === 'system';
}

export function isResultMessage(msg: Message): boolean {
  return msg.type === 'result';
}

/**
 * 获取特殊消息类型
 *
 * 基于 contentParsers.ts 的解析结果判断
 * 返回特定的消息类型，用于分化渲染
 */
function getSpecialMessageType(contentBlocks: ContentBlockType[]): MessageRole | null {
  if (contentBlocks.length === 1) {
    const blockType = contentBlocks[0].type;

    if (blockType === 'interrupt') {
      return 'tip';
    }

    if (blockType === 'slash_command_result') {
      return 'slash_command_result';
    }
  }

  return null;
}
