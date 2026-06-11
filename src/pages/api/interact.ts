import type { NextApiRequest, NextApiResponse } from 'next';

export const runtime = 'edge';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

const VALID_AMOUNTS = new Set([10, 20]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { did, amount } = req.body;

  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }
  if (typeof amount !== 'number' || !VALID_AMOUNTS.has(amount)) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return res.status(401).json({ message: 'Unauthorized session', reason: verification.reason });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const dbHeaders: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  // DB更新を先に完了させてからレスポンスを返す
  try {
    const getRes = await fetch(
      `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}&select=room_interaction_count`,
      { headers: dbHeaders }
    );
    if (!getRes.ok) throw new Error(`GET failed: ${getRes.status}`);
    const rows = await getRes.json();
    const current: number = rows[0]?.room_interaction_count ?? 0;
    const patchRes = await fetch(`${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`, {
      method: 'PATCH',
      headers: dbHeaders,
      body: JSON.stringify({ room_interaction_count: current + amount }),
    });
    if (!patchRes.ok) throw new Error(`PATCH failed: ${patchRes.status}`);
  } catch (e) {
    console.warn('[interact] room_interaction update failed:', e);
  }

  return res.status(200).json({ success: true });
}
