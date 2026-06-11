import type { NextApiRequest, NextApiResponse } from 'next';

export const runtime = 'edge';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { did } = req.query;
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return res.status(401).json({ message: 'Unauthorized session' });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return res.status(500).json({ message: 'Server Configuration Error' });
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
      return res.status(404).json({ message: 'User not found' });
    }
    const giftsArr = giftsRes.ok ? await giftsRes.json() : [];
    const giftCount = Array.isArray(giftsArr) ? giftsArr.length : 0;
    return res.status(200).json({ ...row, gift_count: giftCount });
  } catch (e) {
    console.error('[API user-settings GET error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const { did, reply_freq, is_u18, is_ai_only, is_diary, user_anniv_name, user_anniv_date } = req.body;

  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return res.status(401).json({ message: 'Unauthorized session' });
  }

  if (typeof reply_freq !== 'number' || !Number.isInteger(reply_freq) || reply_freq < 0 || reply_freq > 100) {
    return res.status(400).json({ message: 'reply_freq must be an integer between 0 and 100' });
  }
  if (is_u18 !== 0 && is_u18 !== 1) {
    return res.status(400).json({ message: 'is_u18 must be 0 or 1' });
  }
  if (is_ai_only !== 0 && is_ai_only !== 1) {
    return res.status(400).json({ message: 'is_ai_only must be 0 or 1' });
  }
  if (is_diary !== 0 && is_diary !== 1) {
    return res.status(400).json({ message: 'is_diary must be 0 or 1' });
  }
  if (user_anniv_name !== null && user_anniv_name !== undefined) {
    if (typeof user_anniv_name !== 'string' || user_anniv_name.length > 30) {
      return res.status(400).json({ message: 'user_anniv_name must be a string of max 30 chars' });
    }
  }
  if (user_anniv_date !== null && user_anniv_date !== undefined) {
    if (typeof user_anniv_date !== 'string' || !/^--\d{2}-\d{2}$/.test(user_anniv_date)) {
      return res.status(400).json({ message: 'user_anniv_date must be in --MM-DD format' });
    }
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return res.status(500).json({ message: 'Server Configuration Error' });
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
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[API user-settings PATCH error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ message: 'Method Not Allowed' });
}
