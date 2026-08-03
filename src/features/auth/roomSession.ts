// OAuth セッションから、お部屋自身のサーバセッション cookie を確立する。
//
// 流れ:
//   1. 利用者の PDS に getServiceAuth を投げ、aud=お部屋・lxm=セッション発行専用の
//      短命 JWT を作らせる（署名は利用者の atproto 署名鍵）
//   2. その JWT を /api/session に渡す
//   3. サーバが DID ドキュメントの鍵で検証し、通れば HttpOnly cookie を張る
//
// これにより「この DID の持ち主である」ことがサーバ側で検証可能になる。
// 以後 API ルートは cookie だけを身元の出所として使う。

import { ROOM_SERVICE_DID, ROOM_SESSION_LXM } from '@/lib/roomIdentity';

type OAuthSessionLike = {
  did: string;
  fetchHandler: (url: string, init?: RequestInit) => Promise<Response>;
};

/**
 * cookie を確立する。成功したら DID、失敗したら null。
 *
 * 失敗しても呼び出し側は致命扱いにしないこと。認可を更新していない既存利用者は
 * getServiceAuth のスコープを持たないので、ここは正常に失敗しうる。
 * その場合は再認可を促す（cookie が無いと API 側で 401 になる）。
 */
export async function establishRoomSession(
  session: OAuthSessionLike,
): Promise<string | null> {
  try {
    const query = new URLSearchParams({
      aud: ROOM_SERVICE_DID,
      lxm: ROOM_SESSION_LXM,
    });
    const authRes = await session.fetchHandler(
      `/xrpc/com.atproto.server.getServiceAuth?${query.toString()}`,
      { method: 'GET' },
    );
    if (!authRes.ok) {
      // 403 はほぼ「rpc スコープが未付与」。再認可すれば解消する。
      console.warn('[roomSession] getServiceAuth failed:', authRes.status);
      return null;
    }
    const { token } = (await authRes.json()) as { token?: string };
    if (!token) return null;

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('[roomSession] /api/session rejected:', res.status);
      return null;
    }
    const body = (await res.json()) as { did?: string };
    return body.did ?? null;
  } catch (err) {
    console.error('[roomSession] failed to establish server session:', err);
    return null;
  }
}

/**
 * 既にサーバセッション cookie があるか問い合わせる。
 *
 * Nagi からチケット経由で入ってきた利用者はブラウザ側に OAuth セッションを持たない
 * ので、この経路が唯一の身元取得手段になる。
 */
export async function fetchRoomSession(): Promise<string | null> {
  try {
    const res = await fetch('/api/session', { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json()) as { did?: string | null };
    return body.did ?? null;
  } catch {
    return null;
  }
}

const REAUTH_KEY = 'room_session_reauth_attempted';

/**
 * サーバセッションを確立できなかったとき、再認可を1回だけ試してよいか。
 *
 * rpc スコープの追加以前に認可した利用者は getServiceAuth を呼べないので、
 * 一度だけ認可し直してもらう必要がある。再認可しても駄目な場合に無限に
 * リダイレクトし続けないよう、タブ単位で1回に制限する。
 */
export function shouldRetryReauth(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(REAUTH_KEY) !== '1';
}

export function markReauthAttempted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(REAUTH_KEY, '1');
  } catch {
    // 記録できなくても、失敗時はサインアウト状態に落ちるだけで実害はない。
  }
}

/** サインアウト時にサーバ cookie も落とす。 */
export async function clearRoomSession(): Promise<void> {
  try {
    await fetch('/api/session', { method: 'DELETE' });
  } catch {
    // cookie を落とせなくてもクライアント側のサインアウトは進める。
  }
}
