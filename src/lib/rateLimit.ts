import { createClient } from '@vercel/kv';

// Initialize Vercel KV client using custom variables VRM_BOT_* configured in the project
const kv = createClient({
  url: process.env.VRM_BOT_KV_REST_API_URL,
  token: process.env.VRM_BOT_KV_REST_API_TOKEN,
});

/**
 * Gets the current date string formatted as 'YYYY-MM-DD' in Asia/Tokyo (JST) timezone.
 */
function getJstDateString(): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // ja-JP formatter outputs "YYYY/MM/DD", convert to "YYYY-MM-DD"
  return formatter.format(new Date()).replace(/\//g, '-');
}

interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

/**
 * Increments the daily request counter in Vercel KV and checks against the daily limit.
 * If KV errors or is unreachable, it fails open (returns allowed: true) to avoid total downtime.
 */
export async function checkAndIncrementDailyLimit(): Promise<RateLimitResult> {
  const limitStr = process.env.DAILY_GEMINI_REQUEST_LIMIT || '500';
  const limit = parseInt(limitStr, 10);

  const jstDate = getJstDateString();
  const key = `gemini_req_count:${jstDate}`;

  try {
    // Increment atomically
    const count = await kv.incr(key);

    // If it's a newly created key, set expiration TTL (36 hours) for automatic cleanup
    if (count === 1) {
      await kv.expire(key, 36 * 60 * 60);
    }

    const allowed = count <= limit;
    return { allowed, count, limit };
  } catch (error) {
    // Fail open: log the error, but let the user proceed rather than hard crashing
    console.error('[RateLimit] Vercel KV connection error, failing open:', error);
    return { allowed: true, count: 0, limit };
  }
}

/**
 * Checks the daily request status in Vercel KV WITHOUT incrementing it.
 * If KV errors or is unreachable, it fails open (returns allowed: true).
 */
export async function getDailyLimitStatus(): Promise<RateLimitResult> {
  const limitStr = process.env.DAILY_GEMINI_REQUEST_LIMIT || '500';
  const limit = parseInt(limitStr, 10);

  const jstDate = getJstDateString();
  const key = `gemini_req_count:${jstDate}`;

  try {
    const countVal = await kv.get<number>(key);
    const count = countVal || 0;
    const allowed = count < limit;
    return { allowed, count, limit };
  } catch (error) {
    console.error('[RateLimit] Vercel KV connection error, failing open:', error);
    return { allowed: true, count: 0, limit };
  }
}
