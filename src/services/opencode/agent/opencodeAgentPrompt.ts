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
  const text = extractUserText(userMessage);
  const trimmed = (text ?? '').trim();

  // 检查是否是会话级命令（/undo, /redo, /compact, /summarize, /init）
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
      case 'init':
        await handleSessionInit(deps, state, args);
        return;
    }

    // 其他命令通过 command API 发送
    const modelSetting = (
      state.modelSetting ?? (deps.configService.getValue<string>('opencodeGui.selectedModel', '') ?? '')
    ).trim();
    const variant = String(state.variant ?? '').trim();
    const selectedAgent = deps.getEffectiveAgentName(state);
    const model = parseModel(modelSetting);

    const body: any = { command, arguments: args };
    if (model) body.model = model;
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
    await deps.client.command(state.sessionId, body, state.cwd);
    return;
  }

  // 正常消息处理
  const parts = [{ type: 'text', text }];

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

async function handleSessionInit(
  deps: OpencodeAgentPromptDeps,
  state: ChannelState,
  args: string
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
    await deps.client.init(state.sessionId, { arguments: args }, state.cwd);
    sendSlashCommandResult(deps, state, {
      command: 'init',
      args,
      ok: true,
      output: '已开始初始化，会在完成后输出结果。'
    });
    // init 是异步的，输出通过 SSE 返回
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    deps.logService.warn(`[OpencodeAgentService] /init failed: ${msg}`);
    sendSlashCommandResult(deps, state, {
      command: 'init',
      args,
      ok: false,
      output: `初始化失败: ${msg}`
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
