import type { ILogService } from '../../logService';
import type { IConfigurationService } from '../../configurationService';
import type { IOpencodeClientService } from '../OpencodeClientService';

import type { ChannelState } from './opencodeAgentTypes';

export type OpencodeAgentPromptDeps = {
  logService: ILogService;
  configService: IConfigurationService;
  client: IOpencodeClientService;
  pushProgressEvent: (channelId: string, type: string, summary: string) => void;
  sendToChannel: (channelId: string, event: any) => void;
  getEffectiveAgentName: (state: ChannelState) => string | undefined;
};

export async function sendPrompt(
  deps: OpencodeAgentPromptDeps,
  state: ChannelState,
  userMessage: any
): Promise<void> {
  const blocks = extractUserContentBlocks(userMessage);
  const text = blocks.length > 0 ? extractTextFromBlocks(blocks) : extractUserText(userMessage);
  const trimmed = (text ?? '').trim();

  // 检查是否是会话级命令（/undo, /redo, /compact, /summarize）
  if (trimmed.startsWith('/') && trimmed.length > 1) {
    const commandLine = trimmed.slice(1).trimStart();
    const firstSpace = commandLine.search(/\s/);
    const command = (firstSpace === -1 ? commandLine : commandLine.slice(0, firstSpace))
      .trim()
      .toLowerCase();
    const args = firstSpace === -1 ? '' : commandLine.slice(firstSpace).trimStart();

    switch (command) {
      case 'undo':
        await handleSessionUndo(deps, state);
        return;
      case 'redo':
        await handleSessionRedo(deps, state);
        return;
      case 'compact':
      case 'summarize':
        await handleSessionCompact(deps, state, command as 'compact' | 'summarize');
        return;
    }

    // 其他命令通过 command API 发送
    const modelSetting = (
      state.modelSetting ?? (deps.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '')
    ).trim();
    const variant = String(state.variant ?? '').trim();
    const selectedAgent = deps.getEffectiveAgentName(state);

    const body: any = { command, arguments: args };
    // OpenCode 的 /session/:id/command 接口要求 model 是 string（provider/model）
    if (modelSetting) body.model = modelSetting;
    if (selectedAgent) body.agent = selectedAgent;
    if (variant) body.variant = variant;

    state.running = true;
    deps.pushProgressEvent(state.channelId, 'session', 'running');
    deps.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'init',
      session_id: state.sessionId,
      timestamp: Date.now()
    });
    // /command 在服务端可能会等“整条消息完成”才返回（但内容会先通过 SSE 流出来）。
    // 这里不要 await，否则会在 30s 客户端超时后把主会话误判成失败。
    void deps.client
      .command(state.sessionId, body, state.cwd)
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);

        // 如果只是 HTTP 响应超时，通常命令已经在服务端执行中（输出会继续走 SSE），不要误报失败。
        if (/OpenCode API timeout after/i.test(msg)) {
          deps.logService.warn(
            `[OpencodeAgentService] /${command} request timed out; continuing to wait for SSE output: ${msg}`
          );
          return;
        }

        deps.logService.warn(`[OpencodeAgentService] /${command} failed: ${msg}`);
        sendSlashCommandResult(deps, state, {
          command,
          args,
          ok: false,
          output: msg
        });
        state.running = false;
        deps.sendToChannel(state.channelId, {
          type: 'result',
          is_error: true,
          message: msg,
          timestamp: Date.now()
        });
      });
    return;
  }

  // 正常消息处理
  const { parts, ignoredAttachments } = buildPromptPartsFromBlocks(blocks);

  if (ignoredAttachments.length > 0) {
    const lines = ignoredAttachments.map((a) => `- ${a.name} (${a.mime})：${a.reason}`);
    deps.sendToChannel(state.channelId, {
      type: 'assistant',
      timestamp: Date.now(),
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text:
              `提示：检测到当前模型可能不支持的附件类型，已自动跳过这些附件，避免会话卡死。\n` +
              `你可以把 Excel 导出为 CSV / 复制为文本再发送，或改用图片/PDF。\n` +
              lines.join('\n')
          }
        ]
      }
    });
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', text: text ?? '' });
  }

  const modelSetting = (
    state.modelSetting ?? (deps.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '')
  ).trim();
  const variant = String(state.variant ?? '').trim();
  const selectedAgent = deps.getEffectiveAgentName(state);

  const model = parseModel(modelSetting);

  const body: any = {
    parts
  };

  if (model) {
    body.model = model;
  }

  if (variant) {
    body.variant = variant;
  }

  if (selectedAgent) {
    body.agent = selectedAgent;
  }

  state.running = true;
  deps.pushProgressEvent(state.channelId, 'session', 'running');
  await deps.client.prompt(state.sessionId, body, state.cwd);
}

function extractUserContentBlocks(userMessage: any): any[] {
  const content = userMessage?.message?.content ?? userMessage?.content ?? userMessage;

  if (Array.isArray(content)) return content;

  if (typeof content === 'string') {
    const text = String(content);
    return text ? [{ type: 'text', text }] : [];
  }

  return [];
}

function extractTextFromBlocks(blocks: any[]): string {
  return blocks
    .map((b) => {
      if (!b || typeof b !== 'object') return '';
      if (b.type === 'text' && typeof b.text === 'string') return b.text;
      return '';
    })
    .join('\n');
}

type IgnoredAttachment = { name: string; mime: string; reason: string };

function buildPromptPartsFromBlocks(blocks: any[]): { parts: any[]; ignoredAttachments: IgnoredAttachment[] } {
  const parts: any[] = [];
  const ignoredAttachments: IgnoredAttachment[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;

    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text });
      continue;
    }

    if (block.type === 'image') {
      const source = block.source;
      if (!source || typeof source !== 'object' || source.type !== 'base64') continue;
      const mime = normalizeMimeType(source.media_type ?? source.mediaType);
      const data = typeof source.data === 'string' ? source.data : '';
      if (!data) continue;

      parts.push({
        type: 'file',
        url: `data:${mime};base64,${data}`,
        mime,
        filename: `pasted-image-${Date.now()}`
      });
      continue;
    }

    if (block.type === 'document') {
      const source = block.source;
      if (!source || typeof source !== 'object') continue;
      const mime = normalizeMimeType(source.media_type ?? source.mediaType);
      const title = typeof block.title === 'string' ? block.title.trim() : '';
      const name = title || `attachment-${Date.now()}`;

      // OpenAI-compatible providers only support a narrow set of "file" media types (typically images/PDF).
      // For other files, prefer sending their content as plain text (when reasonable) or skip with a warning.
      if (isSupportedFilePartMime(mime)) {
        if (source.type === 'base64') {
          const data = typeof source.data === 'string' ? source.data : '';
          if (!data) continue;
          parts.push({ type: 'file', url: `data:${mime};base64,${data}`, mime, filename: name });
          continue;
        }

        if (source.type === 'text') {
          const textData = typeof source.data === 'string' ? source.data : '';
          if (!textData) continue;
          const base64 = Buffer.from(textData, 'utf8').toString('base64');
          parts.push({ type: 'file', url: `data:${mime};base64,${base64}`, mime, filename: name });
          continue;
        }

        ignoredAttachments.push({ name, mime, reason: '附件数据格式不支持' });
        continue;
      }

      // Text-like files: include as plain text instead of "file" parts to maximize compatibility.
      if (source.type === 'text') {
        const textData = typeof source.data === 'string' ? source.data : '';
        if (!textData) continue;
        parts.push({ type: 'text', text: formatTextAttachment(name, mime, textData) });
        continue;
      }

      if (source.type === 'base64') {
        const data = typeof source.data === 'string' ? source.data : '';
        if (!data) continue;

        if (isLikelyTextAttachment(mime, name)) {
          const decoded = decodeBase64ToUtf8(data, 512 * 1024);
          if (!decoded.text) {
            ignoredAttachments.push({ name, mime, reason: '无法按 UTF-8 解码为文本' });
            continue;
          }
          parts.push({
            type: 'text',
            text: formatTextAttachment(name, mime, decoded.text, decoded.truncated)
          });
          continue;
        }

        ignoredAttachments.push({
          name,
          mime,
          reason: '当前仅支持图片/PDF 作为附件；该类型建议转为 CSV/文本或截图'
        });
        continue;
      }

      ignoredAttachments.push({ name, mime, reason: '附件数据格式不支持' });
    }
  }

  return { parts, ignoredAttachments };
}

function normalizeMimeType(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw || 'application/octet-stream';
}

function isSupportedFilePartMime(mime: string): boolean {
  const m = normalizeMimeType(mime);
  return m === 'application/pdf' || m.startsWith('image/');
}

function isLikelyTextAttachment(mime: string, filename: string): boolean {
  const m = normalizeMimeType(mime);
  if (m.startsWith('text/')) return true;
  if (
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/xhtml+xml' ||
    m === 'application/javascript' ||
    m === 'application/typescript' ||
    m === 'application/x-javascript' ||
    m === 'application/x-typescript' ||
    m === 'application/x-yaml' ||
    m === 'application/yaml' ||
    m === 'application/toml' ||
    m === 'application/sql' ||
    m === 'application/graphql' ||
    m === 'application/ndjson'
  ) {
    return true;
  }

  const lower = String(filename ?? '').toLowerCase();
  return (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.json') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.toml') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.py') ||
    lower.endsWith('.go') ||
    lower.endsWith('.rs') ||
    lower.endsWith('.java') ||
    lower.endsWith('.kt') ||
    lower.endsWith('.cs') ||
    lower.endsWith('.cpp') ||
    lower.endsWith('.c') ||
    lower.endsWith('.h') ||
    lower.endsWith('.hpp') ||
    lower.endsWith('.sh') ||
    lower.endsWith('.bat') ||
    lower.endsWith('.ps1') ||
    lower.endsWith('.html') ||
    lower.endsWith('.css') ||
    lower.endsWith('.scss') ||
    lower.endsWith('.less') ||
    lower.endsWith('.xml') ||
    lower.endsWith('.ini') ||
    lower.endsWith('.conf') ||
    lower.endsWith('.log')
  );
}

function decodeBase64ToUtf8(base64: string, maxBytes: number): { text: string; truncated: boolean } {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return { text: '', truncated: false };
  }

  const truncated = maxBytes > 0 && buf.length > maxBytes;
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return { text: slice.toString('utf8'), truncated };
}

function formatTextAttachment(name: string, mime: string, text: string, truncated?: boolean): string {
  const header = `附件：${name} (${mime})${truncated ? '（已截断）' : ''}`;
  return `${header}\n\n\`\`\`\n${text}\n\`\`\``;
}

export function extractUserText(userMessage: any): string {
  const content = userMessage?.message?.content ?? userMessage?.content ?? userMessage;

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (!b || typeof b !== 'object') return '';
        if (b.type === 'text' && typeof b.text === 'string') return b.text;
        return '';
      })
      .join('\n');
  }

  return String(content ?? '');
}

function parseModel(value: string): { providerID: string; modelID: string } | undefined {
  if (!value) return undefined;
  const idx = value.indexOf('/');
  if (idx <= 0 || idx === value.length - 1) return undefined;
  const providerID = value.slice(0, idx).trim();
  const modelID = value.slice(idx + 1).trim();
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

async function handleSessionUndo(deps: OpencodeAgentPromptDeps, state: ChannelState): Promise<void> {
  // /undo 依赖 session 处于 idle（后端会 assertNotBusy）；忙碌时先 abort
  state.running = false;
  try {
    await deps.client.abort(state.sessionId, state.cwd);
  } catch {}

  deps.sendToChannel(state.channelId, {
    type: 'system',
    subtype: 'init',
    session_id: state.sessionId,
    timestamp: Date.now()
  });

  try {
    // 获取当前会话状态
    const session = await deps.client.getSession(state.sessionId, state.cwd);
    const revertMessageId = session?.revert?.messageID ?? session?.revertMessageID;

    // 获取用户消息列表
    const messages = await deps.client.listMessages(state.sessionId, state.cwd);
    const items: any[] = Array.isArray(messages) ? messages : (messages?.messages ?? messages?.data ?? []);
    const userMessageIds = items
      .filter((item) => {
        const info = item?.info ?? item?.message ?? item;
        return String(info?.role ?? '').trim() === 'user';
      })
      .map((item) => {
        const info = item?.info ?? item?.message ?? item;
        return String(info?.id ?? '').trim();
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    // 确定要撤销到的目标消息
    let target: string | undefined;
    if (revertMessageId) {
      // 找到 revert 点之前的最后一条用户消息
      for (const id of userMessageIds) {
        if (id < revertMessageId) target = id;
      }
    } else {
      // 没有 revert 点，撤销最后一条
      target = userMessageIds.at(-1);
    }

    if (!target) {
      sendSlashCommandResult(deps, state, {
        command: 'undo',
        ok: true,
        output: '没有可撤销的上一条消息。'
      });
      state.running = false;
      deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
      return;
    }

    await deps.client.revert(state.sessionId, { messageID: target }, state.cwd);

    sendSlashCommandResult(deps, state, {
      command: 'undo',
      ok: true,
      output: '已撤销上一条消息及文件改动。'
    });

    // 清空缓冲区并发送刷新事件
    state.assistantMessageIds.clear();
    state.textParts.clear();
    state.reasoningParts.clear();
    state.sentToolUseIds.clear();

    deps.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'refresh',
      session_id: state.sessionId,
      timestamp: Date.now()
    });

    state.running = false;
    deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    deps.logService.warn(`[OpencodeAgentService] /undo failed: ${msg}`);
    sendSlashCommandResult(deps, state, {
      command: 'undo',
      ok: false,
      output: `撤销失败: ${msg}`
    });
    state.running = false;
    deps.sendToChannel(state.channelId, {
      type: 'result',
      is_error: true,
      message: msg,
      timestamp: Date.now()
    });
  }
}

async function handleSessionRedo(deps: OpencodeAgentPromptDeps, state: ChannelState): Promise<void> {
  // /redo 依赖 session 处于 idle（后端会 assertNotBusy）；忙碌时先 abort
  state.running = false;
  try {
    await deps.client.abort(state.sessionId, state.cwd);
  } catch {}

  deps.sendToChannel(state.channelId, {
    type: 'system',
    subtype: 'init',
    session_id: state.sessionId,
    timestamp: Date.now()
  });

  try {
    // 获取当前会话状态
    const session = await deps.client.getSession(state.sessionId, state.cwd);
    const revertMessageId = session?.revert?.messageID ?? session?.revertMessageID;

    if (!revertMessageId) {
      sendSlashCommandResult(deps, state, {
        command: 'redo',
        ok: true,
        output: '当前没有可重做的撤销记录。'
      });
      state.running = false;
      deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
      return;
    }

    // 获取用户消息列表
    const messages = await deps.client.listMessages(state.sessionId, state.cwd);
    const items: any[] = Array.isArray(messages) ? messages : (messages?.messages ?? messages?.data ?? []);
    const userMessageIds = items
      .filter((item) => {
        const info = item?.info ?? item?.message ?? item;
        return String(info?.role ?? '').trim() === 'user';
      })
      .map((item) => {
        const info = item?.info ?? item?.message ?? item;
        return String(info?.id ?? '').trim();
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    // 找到 revert 点之后的下一条用户消息
    const next = userMessageIds.find((id) => id > revertMessageId);

    if (!next) {
      // 没有下一条，完全取消 revert
      await deps.client.unrevert(state.sessionId, state.cwd);
    } else {
      // 移动到下一条用户消息
      await deps.client.revert(state.sessionId, { messageID: next }, state.cwd);
    }

    sendSlashCommandResult(deps, state, {
      command: 'redo',
      ok: true,
      output: '已重做撤销。'
    });

    // 清空缓冲区并发送刷新事件
    state.assistantMessageIds.clear();
    state.textParts.clear();
    state.reasoningParts.clear();
    state.sentToolUseIds.clear();

    deps.sendToChannel(state.channelId, {
      type: 'system',
      subtype: 'refresh',
      session_id: state.sessionId,
      timestamp: Date.now()
    });

    state.running = false;
    deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    deps.logService.warn(`[OpencodeAgentService] /redo failed: ${msg}`);
    sendSlashCommandResult(deps, state, {
      command: 'redo',
      ok: false,
      output: `重做失败: ${msg}`
    });
    state.running = false;
    deps.sendToChannel(state.channelId, {
      type: 'result',
      is_error: true,
      message: msg,
      timestamp: Date.now()
    });
  }
}

async function handleSessionCompact(
  deps: OpencodeAgentPromptDeps,
  state: ChannelState,
  commandName: 'compact' | 'summarize'
): Promise<void> {
  state.running = true;
  deps.pushProgressEvent(state.channelId, 'session', 'running');
  deps.sendToChannel(state.channelId, {
    type: 'system',
    subtype: 'init',
    session_id: state.sessionId,
    timestamp: Date.now()
  });

  try {
    const modelSetting = (deps.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '').trim();
    const model = parseModel(modelSetting);

    if (!model) {
      sendSlashCommandResult(deps, state, {
        command: commandName,
        ok: false,
        output: '请先在顶部选择用于压缩的模型（provider/model）。'
      });
      state.running = false;
      deps.sendToChannel(state.channelId, { type: 'result', timestamp: Date.now() });
      return;
    }

    await deps.client.summarize(
      state.sessionId,
      { providerID: model.providerID, modelID: model.modelID },
      state.cwd
    );

    sendSlashCommandResult(deps, state, {
      command: commandName,
      ok: true,
      output: '已开始压缩/总结，会在完成后输出总结内容。'
    });

    // summarize 是异步的，输出通过 SSE 返回，session.idle 时结束
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    deps.logService.warn(`[OpencodeAgentService] /compact failed: ${msg}`);
    sendSlashCommandResult(deps, state, {
      command: commandName,
      ok: false,
      output: `压缩失败: ${msg}`
    });
    state.running = false;
    deps.sendToChannel(state.channelId, {
      type: 'result',
      is_error: true,
      message: msg,
      timestamp: Date.now()
    });
  }
}

function sanitizeLocalCommandText(text: string): string {
  const value = String(text ?? '');
  return value
    .replaceAll('<local-command-stdout>', '<local-command-stdout >')
    .replaceAll('</local-command-stdout>', '</local-command-stdout >')
    .replaceAll('<local-command-stderr>', '<local-command-stderr >')
    .replaceAll('</local-command-stderr>', '</local-command-stderr >');
}

function sendSlashCommandResult(
  deps: OpencodeAgentPromptDeps,
  state: ChannelState,
  opts: { command: string; args?: string; ok: boolean; output: string }
): void {
  const command = String(opts.command ?? '').trim();
  if (!command) return;

  const args = String(opts.args ?? '').trim();
  const cmdLine = `/${command}${args ? ` ${args}` : ''}`.trim();
  const body = [cmdLine, String(opts.output ?? '').trim()].filter(Boolean).join('\n');
  const safeBody = sanitizeLocalCommandText(body);
  const tag = opts.ok ? 'local-command-stdout' : 'local-command-stderr';
  const text = `<${tag}>${safeBody}</${tag}>`;

  deps.sendToChannel(state.channelId, {
    type: 'user',
    timestamp: Date.now(),
    message: {
      role: 'user',
      content: [{ type: 'text', text }]
    }
  });
}
