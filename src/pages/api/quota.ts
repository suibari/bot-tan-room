import type { NextRequest } from 'next/server';

export const runtime = 'edge';
import { getDailyLimitStatus } from "@/lib/rateLimit";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  try {
    const rateLimit = await getDailyLimitStatus();
    return json(rateLimit);
  } catch (error) {
    console.error("[API quota] Error getting rate limit status:", error);
    return json({ allowed: true, count: 0, limit: 500, error: String(error) }, 500);
  }
}
