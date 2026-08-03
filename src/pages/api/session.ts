// OAuth でサインインした利用者に、お部屋自身のセッション cookie を発行する。
//
// クライアントは自分の PDS から service auth JWT（aud=お部屋, lxm=セッション発行専用）を
// 取得して POST する。サーバはそれを DID ドキュメントの鍵で検証し、本当にその DID の
// 持ち主だと確認できた場合にだけ cookie を張る。
//
// リクエスト本文から did を受け取らないのが要点。以前は本文の did を身元として
// 扱っており、署名検証が実質機能していなかったため任意の DID になりすませた。

import type { NextRequest } from 'next/server';
import { verifyServiceAuth } from '@/lib/serviceAuthVerifier';
import { createSessionCookie, clearSessionCookie, readSession } from '@/lib/session';
import { ROOM_DID, ROOM_SERVICE_DID, ROOM_SESSION_LXM } from '@/lib/roomIdentity';

export const runtime = 'edge';

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export default async function handler(req: NextRequest): Promise<Response> {
  // 現在のセッションを問い合わせる。Nagi からチケットで入ってきた利用者は
  // ブラウザ側に OAuth セッションを持たないので、これが唯一の身元取得手段になる。
  if (req.method === 'GET') {
    const session = await readSession(req);
    return json(
      session ? { did: session.did } : { did: null },
      200,
      { 'Cache-Control': 'private, no-store' },
    );
  }
  // サインアウト。cookie を落とすだけなので認証は要らない。
  if (req.method === 'DELETE') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }
  if (req.method !== 'POST') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json({ message: 'Missing service auth token' }, 401);

  let did: string;
  try {
    did = await verifyServiceAuth(token, {
      // PDS のバージョンによって aud にフラグメントが載る場合と、落とされて
      // bare DID になる場合がある（Nagi AppView の serviceAuth.ts と同じ事情）。
      // 移行期はどちらも受け入れる。
      audiences: [ROOM_SERVICE_DID, ROOM_DID],
      lxm: ROOM_SESSION_LXM,
    });
  } catch (err) {
    // 失敗理由はサーバログにのみ残す。呼び出し側には区別を返さない。
    console.warn('[api/session] service auth rejected:', err);
    return json({ message: 'Unauthorized' }, 401);
  }

  return json({ did }, 200, { 'Set-Cookie': await createSessionCookie(did) });
}
