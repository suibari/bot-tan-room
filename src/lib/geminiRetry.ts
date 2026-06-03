export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  const status = e.code ?? e.status ?? e.statusCode;
  if (status === 503) return true;
  const msg = String(e.message ?? '').toLowerCase();
  return msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand');
}

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < maxRetries && isRetryableError(err)) {
        console.warn(`[geminiRetry] 503 detected, retrying (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withGeminiRetry: exhausted retries');
}
