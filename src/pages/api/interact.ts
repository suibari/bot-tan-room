import type { NextRequest } from 'next/server';

export const runtime = 'edge';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_AMOUNTS = new Set([10, 20]);

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  const { did, amount } = await req.json();

  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return json({ message: 'Invalid or missing DID' }, 400);
  }
  if (typeof amount !== 'number' || !VALID_AMOUNTS.has(amount)) {
    return json({ message: 'Invalid amount' }, 400);
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return json({ message: 'Unauthorized session', reason: verification.reason }, 401);
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return json({ message: 'Server Configuration Error' }, 500);
  }

  const dbHeaders: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

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

  return json({ success: true });
}
