import type { NextRequest } from 'next/server';
import { requireDid } from '@/lib/session';
import { recordRoomEvent } from '@/lib/roomEvents';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * conv_history の末尾にある user 発言のテキスト。
 * 何を話したかを biorhythm 側に渡すために使う（形式は Gemini の { role, parts } のまま）。
 */
function lastUserMessage(conv_history: any[]): string | null {
  for (let i = conv_history.length - 1; i >= 0; i--) {
    const msg = conv_history[i];
    if (msg?.role !== 'user') continue;
    const text = msg.parts
      ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    return text || null;
  }
  return null;
}

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
    // 身元は署名済みセッション cookie からのみ取る。
    // リクエスト本文・クエリの did は読まない（読むとなりすまし経路が復活する）。
    const auth = await requireDid(req);
    if ('response' in auth) return auth.response;
    const { did } = auth;

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
    // 身元は署名済みセッション cookie からのみ取る。
    // リクエスト本文・クエリの did は読まない（読むとなりすまし経路が復活する）。
    const auth = await requireDid(req);
    if ('response' in auth) return auth.response;
    const { did } = auth;

    const { conv_history } = await req.json();
    if (!Array.isArray(conv_history)) {
      return json({ message: 'Invalid conv_history format' }, 400);
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

      // biorhythm 側で「さっき〇〇さんと話したこと」を行動に反映させる。
      // ここは1往復ごとに呼ばれるが、間引きは recordRoomEvent が room_events を見て行う
      // （conv_history の長さは累積するので、剰余での間引きは当てにならない）。
      // await するのは必須（edge ランタイムに打ち切られないため。roomEvents.ts 参照）。
      const roomEvent = await recordRoomEvent(did, 'chat', lastUserMessage(conv_history));

      return json({ success: true, roomEvent });
    } catch (e) {
      console.error('[API history POST/PATCH error]:', e);
      return json({ message: 'Internal Server Error' }, 500);
    }
  }

  return json({ message: 'Method Not Allowed' }, 405);
}
