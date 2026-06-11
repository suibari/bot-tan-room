import type { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis/cloudflare';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  const secretKey = process.env.INVITE_SECRET_KEY;
  if (!secretKey) {
    console.error('[API invite-message error]: INVITE_SECRET_KEY is not configured in environment variables.');
    return json({ message: 'Server Configuration Error' }, 500);
  }

  const authHeader = req.headers.get('authorization');
  const clientKey = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (clientKey !== secretKey) {
    console.warn('[API invite-message] Rejected unauthorized access attempt');
    return json({ message: 'Unauthorized' }, 401);
  }

  const { did, textJa, textEn } = await req.json();
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return json({ message: 'Invalid or missing DID' }, 400);
  }
  if (!textJa || typeof textJa !== 'string' || textJa.trim().length === 0) {
    return json({ message: 'Invalid or missing textJa' }, 400);
  }
  if (!textEn || typeof textEn !== 'string' || textEn.trim().length === 0) {
    return json({ message: 'Invalid or missing textEn' }, 400);
  }

  try {
    const redis = new Redis({
      url: process.env.VRM_BOT_KV_REST_API_URL!,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
    });

    await redis.set(
      `invite:${did}`,
      {
        textJa: textJa.trim(),
        textEn: textEn.trim(),
        createdAt: new Date().toISOString(),
      }
    );

    return json({ success: true });
  } catch (e) {
    console.error('[API invite-message error]:', e);
    return json({ message: 'Internal Server Error' }, 500);
  }
}
