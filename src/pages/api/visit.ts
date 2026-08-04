import type { NextRequest } from 'next/server';

export const runtime = 'edge';
import { requireDid } from '@/lib/session';
import { recordRoomEvent } from '@/lib/roomEvents';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  // 身元は署名済みセッション cookie からのみ取る。
  // リクエスト本文の did は読まない（読むとなりすまし経路が復活する）。
  const auth = await requireDid(req);
  if ('response' in auth) return auth.response;
  const { did } = auth;

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

  try {
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

    const nowMs = Date.now();
    const prevMs = previousVisitAt
      ? (() => {
          const normalized = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(previousVisitAt)
            ? previousVisitAt
            : previousVisitAt + 'Z';
          const t = new Date(normalized).getTime();
          return isNaN(t) ? null : t;
        })()
      : null;
    const elapsedMs: number | null = prevMs !== null ? nowMs - prevMs : null;
    const now = new Date(nowMs).toISOString();

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

    // 「遊びに来てくれた」を biorhythm に伝える。タブ復帰でも呼ばれるので、
    // recordRoomEvent 側の間引き（30分）に任せる。
    recordRoomEvent(did, 'greeting').catch(() => {});

    return json({ success: true, previousVisitAt, elapsedMs });
  } catch (e: any) {
    console.error('[API visit POST error]:', e);
    return json({ message: 'Internal Server Error', error: e.message || String(e) }, 500);
  }
}
