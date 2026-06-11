import type { NextRequest } from 'next/server';

export const runtime = 'edge';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function handleGet(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const did = searchParams.get('did');
  if (!did || !did.startsWith('did:')) {
    return json({ message: 'Invalid or missing DID' }, 400);
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return json({ message: 'Unauthorized session' }, 401);
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return json({ message: 'Server Configuration Error' }, 500);
  }

  const dbHeaders: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const [dbRes, giftsRes] = await Promise.all([
      fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}&select=created_at,reply_freq,is_u18,is_ai_only,is_diary,last_uranai_at,last_analyze_at,last_cheer_at,conv_history,user_anniv_name,user_anniv_date`,
        { headers: dbHeaders, keepalive: true }
      ),
      fetch(
        `${DB_URL}/gifts?did=eq.${encodeURIComponent(did)}&select=id`,
        { headers: dbHeaders, keepalive: true }
      ),
    ]);
    if (!dbRes.ok) {
      throw new Error(`DB fetch failed with status ${dbRes.status}`);
    }
    const rows = await dbRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return json({ message: 'User not found' }, 404);
    }
    const giftsArr = giftsRes.ok ? await giftsRes.json() : [];
    const giftCount = Array.isArray(giftsArr) ? giftsArr.length : 0;
    return json({ ...row, gift_count: giftCount });
  } catch (e) {
    console.error('[API user-settings GET error]:', e);
    return json({ message: 'Internal Server Error' }, 500);
  }
}

async function handlePatch(req: NextRequest): Promise<Response> {
  const { did, reply_freq, is_u18, is_ai_only, is_diary, user_anniv_name, user_anniv_date } = await req.json();

  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return json({ message: 'Invalid or missing DID' }, 400);
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return json({ message: 'Unauthorized session' }, 401);
  }

  if (typeof reply_freq !== 'number' || !Number.isInteger(reply_freq) || reply_freq < 0 || reply_freq > 100) {
    return json({ message: 'reply_freq must be an integer between 0 and 100' }, 400);
  }
  if (is_u18 !== 0 && is_u18 !== 1) {
    return json({ message: 'is_u18 must be 0 or 1' }, 400);
  }
  if (is_ai_only !== 0 && is_ai_only !== 1) {
    return json({ message: 'is_ai_only must be 0 or 1' }, 400);
  }
  if (is_diary !== 0 && is_diary !== 1) {
    return json({ message: 'is_diary must be 0 or 1' }, 400);
  }
  if (user_anniv_name !== null && user_anniv_name !== undefined) {
    if (typeof user_anniv_name !== 'string' || user_anniv_name.length > 30) {
      return json({ message: 'user_anniv_name must be a string of max 30 chars' }, 400);
    }
  }
  if (user_anniv_date !== null && user_anniv_date !== undefined) {
    if (typeof user_anniv_date !== 'string' || !/^--\d{2}-\d{2}$/.test(user_anniv_date)) {
      return json({ message: 'user_anniv_date must be in --MM-DD format' }, 400);
    }
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return json({ message: 'Server Configuration Error' }, 500);
  }

  const dbHeaders: HeadersInit = {
    'Content-Profile': 'affirmative_bot',
    'Content-Type': 'application/json',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const dbRes = await fetch(
      `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
      {
        method: 'PATCH',
        headers: dbHeaders,
        body: JSON.stringify({ reply_freq, is_u18, is_ai_only, is_diary, user_anniv_name: user_anniv_name ?? null, user_anniv_date: user_anniv_date ?? null }),
        keepalive: true,
      }
    );
    if (!dbRes.ok) {
      throw new Error(`DB patch failed with status ${dbRes.status}`);
    }
    return json({ success: true });
  } catch (e) {
    console.error('[API user-settings PATCH error]:', e);
    return json({ message: 'Internal Server Error' }, 500);
  }
}

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method === 'GET') return handleGet(req);
  if (req.method === 'PATCH') return handlePatch(req);
  return json({ message: 'Method Not Allowed' }, 405);
}
