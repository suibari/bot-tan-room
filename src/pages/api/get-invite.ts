import type { NextRequest } from 'next/server';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';
import { Redis } from '@upstash/redis/cloudflare';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  const { searchParams } = new URL(req.url);
  const did = searchParams.get('did');
  if (!did || !did.startsWith('did:')) {
    return json({ message: 'Invalid or missing DID' }, 400);
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    console.warn(`[API get-invite GET] Blocked unauthorized attempt for DID: ${did}. Reason: ${verification.reason}`);
    return json({ message: 'Unauthorized session', reason: verification.reason }, 401);
  }

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
