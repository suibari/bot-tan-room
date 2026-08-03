// Nagi から渡された SSO チケットを検証し、お部屋自身のセッション cookie を張る。
//
// この経路では OAuth を一切走らせない。お部屋は DID しか必要としないので、
// 検証済みのチケットだけでサインインが成立する。

import type { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis/cloudflare';
import { createVerifier } from '@suibari/nagi-passport/verify';
import { safeReturnTo } from '@suibari/nagi-passport/browser';
import { createSessionCookie } from '@/lib/session';
import { NAGI_PASSPORT_ISSUER, ROOM_ORIGIN } from '@/lib/roomIdentity';

export const runtime = 'edge';

// 環境変数はリクエストスコープでしか読めない（Cloudflare の edge runtime では
// モジュール初期化時の process.env が空になりうる）ので、初回リクエストまで遅延させる。
// JWKS のキャッシュを効かせたいので、一度作ったものは isolate 内で使い回す。
let cachedVerifier: ReturnType<typeof createVerifier> | undefined;

function getVerifier() {
  if (!cachedVerifier) {
    const redis = new Redis({
      url: process.env.VRM_BOT_KV_REST_API_URL!,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
    });
    // 単回使用の記録。SET NX EX は「存在しなければ書き込む」を不可分に行うので、
    // 同一チケットが同時に2回提示されても片方しか通らない。
    const store = {
      consume: async (jti: string, ttlSeconds: number): Promise<boolean> =>
        (await redis.set(`nagipp:${jti}`, 1, { nx: true, ex: ttlSeconds })) === 'OK',
    };
    cachedVerifier = createVerifier({
      issuer: NAGI_PASSPORT_ISSUER,
      // 自分の origin を固定値で書く。リクエスト由来の値を使うと他アプリ宛の
      // チケットを受け入れてしまう。
      audience: ROOM_ORIGIN,
      jwksUrl: `${NAGI_PASSPORT_ISSUER}/.well-known/nagi-passport-jwks.json`,
      store,
    });
  }
  return cachedVerifier;
}

export default async function handler(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const ticket = url.searchParams.get('ticket');
  // 戻り先は自サイト内の相対パスだけ通す（オープンリダイレクト対策）。
  const returnTo = safeReturnTo(url.searchParams.get('return_to'));

  if (!ticket) {
    return Response.redirect(new URL('/', url.origin).toString(), 302);
  }

  let did: string;
  try {
    ({ did } = await getVerifier().verify(ticket));
  } catch (err) {
    // チケットが無効でも締め出さず、通常のサインイン導線へ戻す。
    console.warn('[api/sso] ticket rejected:', err);
    return Response.redirect(new URL('/', url.origin).toString(), 302);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(returnTo, url.origin).toString(),
      'Set-Cookie': await createSessionCookie(did),
      // チケット付き URL がキャッシュ・共有されないようにする。
      'Cache-Control': 'no-store',
    },
  });
}
