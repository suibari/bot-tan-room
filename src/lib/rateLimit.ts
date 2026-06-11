import { Redis } from '@upstash/redis/cloudflare';

const redis = new Redis({
  url: process.env.VRM_BOT_KV_REST_API_URL!,
  token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
});

function getJstDateString(): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()).replace(/\//g, '-');
}

interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function checkAndIncrementDailyLimit(): Promise<RateLimitResult> {
  const limitStr = process.env.DAILY_GEMINI_REQUEST_LIMIT || '500';
  const limit = parseInt(limitStr, 10);

  const jstDate = getJstDateString();
  const key = `gemini_req_count:${jstDate}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 36 * 60 * 60);
    }
    const allowed = count <= limit;
    return { allowed, count, limit };
  } catch (error) {
    console.error('[RateLimit] Redis connection error, failing open:', error);
    return { allowed: true, count: 0, limit };
  }
}

export async function getDailyLimitStatus(): Promise<RateLimitResult> {
  const limitStr = process.env.DAILY_GEMINI_REQUEST_LIMIT || '500';
  const limit = parseInt(limitStr, 10);

  const jstDate = getJstDateString();
  const key = `gemini_req_count:${jstDate}`;

  try {
    const countVal = await redis.get<number>(key);
    const count = countVal || 0;
    const allowed = count < limit;
    return { allowed, count, limit };
  } catch (error) {
    console.error('[RateLimit] Redis connection error, failing open:', error);
    return { allowed: true, count: 0, limit };
  }
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const allowed = count <= limit;
    return { allowed, count, limit };
  } catch (error) {
    console.error(`[RateLimit] Error checking custom rate limit for ${key}, failing open:`, error);
    return { allowed: true, count: 0, limit };
  }
}
