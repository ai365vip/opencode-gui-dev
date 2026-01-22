export function buildUsageFromTokens(
  tokens: unknown,
  opts?: { contextWindow?: number }
): any | undefined {
  if (!tokens || typeof tokens !== 'object') return undefined;
  const t: any = tokens;

  const toPositiveInt = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
  };

  const input = toPositiveInt(t.input);
  const output = toPositiveInt(t.output);
  const reasoning = toPositiveInt(t.reasoning);
  const cacheRead = toPositiveInt(t.cache?.read);
  const cacheWrite = toPositiveInt(t.cache?.write);
  const total = input + output + reasoning + cacheRead + cacheWrite;

  if (total <= 0) return undefined;

  const usage: any = {
    input_tokens: input,
    output_tokens: output + reasoning
  };
  if (cacheRead) usage.cache_read_input_tokens = cacheRead;
  if (cacheWrite) usage.cache_creation_input_tokens = cacheWrite;

  const ctx = Number(opts?.contextWindow);
  if (Number.isFinite(ctx) && ctx > 0) {
    usage.context_window = Math.trunc(ctx);
    usage.context_percentage = Math.round((total / ctx) * 100);
  }

  return usage;
}

