import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { did } = req.body;
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    console.warn(`[API visit POST] Blocked unauthorized attempt for DID: ${did}. Reason: ${verification.reason}`);
    return res.status(401).json({ message: 'Unauthorized session', reason: verification.reason });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    console.error('Cloudflare Access Client ID/Secret not configured');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // 前回バッジ付与から24h以上経過しているか確認（お誘い・自発来訪問わずバッジ付与条件）
    // 同時に前回来訪日時も取得（グリーティングモード判定用）
    let badgeEligible = false;
    let previousVisitAt: string | null = null;
    try {
      const getRes = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}&select=last_regular_badge_at,last_room_visit_at`,
        { method: 'GET', headers }
      );
      if (getRes.ok) {
        const rows: Array<{ last_regular_badge_at: string | null; last_room_visit_at: string | null }> = await getRes.json();
        const lastBadgeAt = rows[0]?.last_regular_badge_at ? new Date(rows[0].last_regular_badge_at) : null;
        badgeEligible = !lastBadgeAt || (Date.now() - lastBadgeAt.getTime()) > 24 * 60 * 60 * 1000;
        previousVisitAt = rows[0]?.last_room_visit_at ?? null;
      }
    } catch (e) {
      console.warn('[API visit] Failed to fetch follower state, treating as non-eligible visit:', e);
    }

    const now = new Date().toISOString();

    const dbRes = await fetch(
      `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          last_room_visit_at: now,
          room_invite_sent: 0,
          room_badge_pending: badgeEligible ? 1 : 0,
        }),
        keepalive: true,
      }
    );

    if (!dbRes.ok) {
      const errText = await dbRes.text().catch(() => '');
      throw new Error(`DB update failed with status ${dbRes.status}: ${errText}`);
    }

    if (badgeEligible) {
      console.log(`[API visit] Visit eligible for badge for ${did}, room_badge_pending set to 1.`);
    }

    return res.status(200).json({ success: true, previousVisitAt });
  } catch (e: any) {
    console.error('[API visit POST error]:', e);
    return res.status(500).json({ message: 'Internal Server Error', error: e.message || String(e) });
  }
}
