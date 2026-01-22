import type { OpenCodeToolPart } from './opencodeAgentTypes';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function hasMeaningfulToolInput(input: Record<string, unknown>): boolean {
  const ignored = new Set(['title', 'status']);
  for (const [k, v] of Object.entries(input)) {
    if (ignored.has(k)) continue;
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (isPlainObject(v) && Object.keys(v).length === 0) continue;
    return true;
  }
  return false;
}

export function parseToolRawInput(raw: unknown): Record<string, unknown> | undefined {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;

  const tryJsonObject = (candidate: string): Record<string, unknown> | undefined => {
    try {
      const parsed = JSON.parse(candidate);
      return isPlainObject(parsed) ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };

  const direct = tryJsonObject(text);
  if (direct) return direct;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const sub = tryJsonObject(text.slice(start, end + 1));
    if (sub) return sub;
  }

  const out: Record<string, unknown> = {};
  const pairRe =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(\"([^\"\\\\]|\\\\.)*\"|'([^'\\\\]|\\\\.)*'|[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(text))) {
    const key = m[1];
    let rawVal = m[2];
    if (!key || !rawVal) continue;
    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      rawVal = rawVal.slice(1, -1);
    }
    const lower = rawVal.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      out[key] = lower === 'true';
      continue;
    }
    const num = Number(rawVal);
    if (Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(rawVal)) {
      out[key] = num;
      continue;
    }
    out[key] = rawVal;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function extractPossiblePathFromText(text: string): string | undefined {
  const cleaned = String(text ?? '').trim();
  if (!cleaned) return undefined;

  const normalized = cleaned.replace(/[`"'“”‘’]/g, ' ');
  const match = normalized.match(
    /([A-Za-z]:[\\/][^\s]+|\.[\\/][^\s]+|[\\/][^\s]+|[^\s]+\.[a-zA-Z0-9]{1,8})/
  );
  const candidate = String(match?.[1] ?? '').trim();
  return candidate || undefined;
}

export function buildToolUseInput(part: OpenCodeToolPart): Record<string, unknown> {
  const state: any = part?.state ?? {};

  const input = isPlainObject(state.input) ? { ...(state.input as Record<string, unknown>) } : {};
  if (!hasMeaningfulToolInput(input)) {
    const parsed = parseToolRawInput(state.raw);
    if (parsed) Object.assign(input, parsed);
  }

  const title = typeof state.title === 'string' ? state.title.trim() : '';
  if (title) input.title = title;
  if (typeof state.status === 'string') input.status = state.status;

  const toolKey = String(part.tool ?? '')
    .trim()
    .toLowerCase();
  const isFileTool =
    toolKey === 'read' ||
    toolKey === 'write' ||
    toolKey === 'edit' ||
    toolKey === 'multiedit' ||
    toolKey === 'notebookedit';
  if (isFileTool) {
    const existingPath =
      (typeof (input as any).file_path === 'string' && String((input as any).file_path).trim()) ||
      (typeof (input as any).filePath === 'string' && String((input as any).filePath).trim()) ||
      (typeof (input as any).notebook_path === 'string' &&
        String((input as any).notebook_path).trim()) ||
      (typeof (input as any).path === 'string' && String((input as any).path).trim())
        ? true
        : false;

    if (!existingPath && title) {
      const extracted = extractPossiblePathFromText(title);
      if (extracted) (input as any).file_path = extracted;
    }
  }

  const meta = state.metadata;
  if (meta && typeof meta === 'object') {
    const childSessionId = String(
      (meta as any).sessionId ?? (meta as any).sessionID ?? (meta as any).session_id ?? ''
    ).trim();
    if (childSessionId) {
      const existing = String(
        (input as any).sessionId ?? (input as any).session_id ?? ''
      ).trim();
      if (!existing) {
        (input as any).sessionId = childSessionId;
      }
    }
  }

  return input;
}

export function upsertDelta(
  map: Map<string, { messageID: string; text: string }>,
  partId: string,
  messageID: string,
  delta: string | undefined,
  fullText: string
): void {
  const existing = map.get(partId);
  // Prefer the authoritative full text from the part payload. Some servers include a `delta`
  // field that is cumulative (full-so-far) rather than append-only; trusting it can duplicate
  // content on the UI side.
  if (typeof fullText === 'string') {
    map.set(partId, { messageID, text: fullText });
    return;
  }

  if (typeof delta === 'string' && delta.length > 0) {
    map.set(partId, { messageID, text: (existing?.text ?? '') + delta });
    return;
  }

  map.set(partId, { messageID, text: existing?.text ?? '' });
}
