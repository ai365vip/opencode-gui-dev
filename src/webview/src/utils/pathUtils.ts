export function basename(filePath: string): string {
  const raw = String(filePath ?? '');
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? raw;
}

