import type { NextRequest } from 'next/server';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    console.error('Cloudflare Access Client ID/Secret not configured');
    return json({ message: 'Server Configuration Error' }, 500);
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (req.method === 'GET') {
    const { searchParams } = new URL(req.url);
    const did = searchParams.get('did');
    if (!did || !did.startsWith('did:')) {
      return json({ message: 'Invalid or missing DID' }, 400);
    }

    const authHeader = req.headers.get('authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const verification = await verifyAtprotoToken(token, did);
    if (!verification.verified) {
      console.warn(`[API history GET] Blocked unauthorized attempt for DID: ${did}. Reason: ${verification.reason}`);
      return json({ message: 'Unauthorized session', reason: verification.reason }, 401);
    }

    try {
      const response = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
        { headers, keepalive: true }
      );

      if (!response.ok) {
        throw new Error(`DB fetch failed with status ${response.status}`);
      }

      const records = await response.json();
      if (!Array.isArray(records) || records.length === 0) {
        return json({ isFollower: false });
      }

      const follower = records[0];
      const conv_history = follower.conv_history ?? [];
      const regular_level = follower.regular_level ?? 0;

      return json({ isFollower: true, conv_history, regular_level });
    } catch (e) {
      console.error('[API history GET error]:', e);
      return json({ message: 'Internal Server Error' }, 500);
    }
  }

  if (req.method === 'POST') {
    const { did, conv_history } = await req.json();
    if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
      return json({ message: 'Invalid or missing DID' }, 400);
    }
    if (!Array.isArray(conv_history)) {
      return json({ message: 'Invalid conv_history format' }, 400);
    }

    const authHeader = req.headers.get('authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const verification = await verifyAtprotoToken(token, did);
    if (!verification.verified) {
      console.warn(`[API history POST] Blocked unauthorized attempt to overwrite history for DID: ${did}. Reason: ${verification.reason}`);
      return json({ message: 'Unauthorized session', reason: verification.reason }, 401);
    }

    for (const msg of conv_history) {
      if (
        !msg ||
        typeof msg !== 'object' ||
        (msg.role !== 'user' && msg.role !== 'model') ||
        !Array.isArray(msg.parts)
      ) {
        return json({ message: 'Invalid conv_history messages structure' }, 400);
      }
    }

    try {
      const response = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ conv_history }),
          keepalive: true,
        }
      );

      if (!response.ok) {
        throw new Error(`DB update failed with status ${response.status}`);
      }

      return json({ success: true });
    } catch (e) {
      console.error('[API history POST/PATCH error]:', e);
      return json({ message: 'Internal Server Error' }, 500);
    }
  }

  return json({ message: 'Method Not Allowed' }, 405);
}
