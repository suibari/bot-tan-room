import type { NextRequest } from 'next/server';
import { requireDid } from '@/lib/session';
import { Redis } from '@upstash/redis/cloudflare';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  // 身元は署名済みセッション cookie からのみ取る。
  // リクエスト本文・クエリの did は読まない（読むとなりすまし経路が復活する）。
  const auth = await requireDid(req);
  if ('response' in auth) return auth.response;
  const { did } = auth;

  try {
    const redis = new Redis({
      url: process.env.VRM_BOT_KV_REST_API_URL!,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
    });

    const key = `invite:${did}`;
    const invite: { textJa?: string; textEn?: string; text?: string } | null = await redis.get(key);

    if (!invite) {
      return json({ hasInvite: false });
    }

    console.log(`[API get-invite] Found invite for DID: ${did}, deleting key from KV`);
    await redis.del(key);

    const textJa = invite.textJa || invite.text || '';
    const textEn = invite.textEn || invite.text || '';

    return json({ hasInvite: true, textJa, textEn });
  } catch (e) {
    console.error('[API get-invite error]:', e);
    return json({ message: 'Internal Server Error' }, 500);
  }
}
