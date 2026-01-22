import { extractUserText } from './opencodeAgentPrompt';
import type { IOpencodeClientService } from '../OpencodeClientService';

export function deriveSessionTitle(initialMessage: any | undefined): string | undefined {
  const text = initialMessage ? extractUserText(initialMessage) : '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > 60 ? cleaned.slice(0, 60) : cleaned;
}

export function extractSessionDirectory(session: any): string | undefined {
  const dir = String(session?.directory ?? session?.path?.cwd ?? '').trim();
  return dir || undefined;
}

export async function resolveSessionDirectory(
  client: IOpencodeClientService,
  sessionId: string,
  fallbackCwd: string
): Promise<string> {
  const id = String(sessionId ?? '').trim();
  if (!id) return fallbackCwd;

  try {
    const session = await client.getSession(id);
    const dir = extractSessionDirectory(session);
    if (dir) return dir;
  } catch {}

  try {
    const session = await client.getSession(id, fallbackCwd);
    const dir = extractSessionDirectory(session);
    if (dir) return dir;
  } catch {}

  return fallbackCwd;
}
