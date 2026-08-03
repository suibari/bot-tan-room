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
  getTokenInfo?: () => Promise<{ scope?: string } | undefined> | { scope?: string } | undefined;
};

export type EstablishResult =
  | { ok: true; did: string }
  /** rpc スコープが未付与。再認可すれば解決する見込みがある。 */
  | { ok: false; reason: 'missing_scope' }
  /** スコープはあるのに失敗した。再認可しても直らないのでループさせない。 */
  | { ok: false; reason: 'failed' };

/** 付与済みスコープにセッション発行用の rpc が含まれているか。 */
async function hasSessionScope(session: OAuthSessionLike): Promise<boolean> {
  try {
    const info = await session.getTokenInfo?.();
    const scope = info?.scope;
    if (typeof scope !== 'string') return false;
    // aud の書式（フラグメントの有無・エンコード）は環境差があるので lxm で判定する。
    return scope.includes(`rpc:${ROOM_SESSION_LXM}`) || scope.includes('rpc:*');
  } catch {
    return false;
  }
}

/**
 * cookie を確立する。
 *
 * 認可を更新していない既存利用者は getServiceAuth のスコープを持たないため、
 * ここは正常に失敗しうる。その場合だけ再認可を促す（cookie が無いと API は 401）。
 */
export async function establishRoomSession(
  session: OAuthSessionLike,
): Promise<EstablishResult> {
  // スコープが無いと分かっているなら、無駄な 403 を出さず再認可へ回す。
  if (!(await hasSessionScope(session))) {
    console.warn('[roomSession] granted scope lacks the session rpc permission');
    return { ok: false, reason: 'missing_scope' };
  }
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
      // スコープはあるはずなので 403 でも再認可では直らない扱いにする
      // （ここでループさせない方が、原因の切り分けもしやすい）。
      console.warn('[roomSession] getServiceAuth failed:', authRes.status);
      return { ok: false, reason: authRes.status === 403 ? 'missing_scope' : 'failed' };
    }
    const { token } = (await authRes.json()) as { token?: string };
    if (!token) return { ok: false, reason: 'failed' };

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('[roomSession] /api/session rejected:', res.status);
      return { ok: false, reason: 'failed' };
    }
    const body = (await res.json()) as { did?: string };
    return body.did ? { ok: true, did: body.did } : { ok: false, reason: 'failed' };
  } catch (err) {
    console.error('[roomSession] failed to establish server session:', err);
    return { ok: false, reason: 'failed' };
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
