// お部屋自身のセッション cookie。サーバ署名なので、中身の DID は改竄できない。
//
// これが導入される以前は、API ルートがリクエスト本文の `did` をそのまま身元として
// 扱っていた（jwtVerifier の「構造検証」フォールバックが署名を確認せず素通りさせて
// いたため、任意の DID になりすませる状態だった）。以後、身元の出所はこの cookie だけ。

const COOKIE_NAME = 'bt_session';

/**
 * 絶対期限。スライドさせない。
 *
 * SSO では失効が伝播しない（利用者が PDS 側で認可を取り消しても、発行済みの
 * セッションはこの期限まで生き続ける）ので、その窓を有限に保つ必要がある。
 * 14日は OAuth 経路の refresh 上限（public client で約2週間）と揃えてあり、
 * 来訪経路によって寿命が変わらないようにしている。
 * 切れても Nagi から来直せば0クリックで復帰するので、体感コストはほぼない。
 */
export const SESSION_MAX_AGE_SEC = 14 * 24 * 60 * 60;

function secret(): string {
  const value = process.env.ROOM_SESSION_SECRET;
  if (!value) throw new Error('ROOM_SESSION_SECRET is not set');
  return value;
}

function b64u(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64u(new Uint8Array(sig));
}

/** タイミング差で署名を推測されないよう、長さと内容を定時間で比較する。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface RoomSession {
  did: string;
  expiresAt: number;
}

/** Set-Cookie ヘッダの値を作る。 */
export async function createSessionCookie(did: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = `${did}|${expiresAt}`;
  const value = `${b64u(new TextEncoder().encode(payload))}.${await hmac(payload)}`;
  // SameSite=Lax: Nagi からのトップレベル遷移では送られ、サードパーティからの
  // 埋め込み要求では送られない。HttpOnly でスクリプトからは読めない。
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ].join('; ');
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/**
 * リクエストからセッションを読み出す。署名か期限が不正なら null。
 * 呼び出し側は「null なら未認証」として扱うこと。
 */
export async function readSession(req: Request): Promise<RoomSession | null> {
  const raw = readCookie(req.headers.get('cookie'), COOKIE_NAME);
  if (!raw) return null;
  const [body, signature] = raw.split('.');
  if (!body || !signature) return null;

  let payload: string;
  try {
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    payload = new TextDecoder().decode(
      Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) =>
        c.charCodeAt(0),
      ),
    );
  } catch {
    return null;
  }

  // 署名を先に確認する。中身を解釈するのはその後。
  if (!timingSafeEqual(signature, await hmac(payload))) return null;

  const separator = payload.lastIndexOf('|');
  if (separator < 0) return null;
  const did = payload.slice(0, separator);
  const expiresAt = Number(payload.slice(separator + 1));
  if (!did.startsWith('did:') || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null;

  return { did, expiresAt };
}

/**
 * API ルート用。認証済みの DID を返し、無ければ 401 用のレスポンスを返す。
 *
 * リクエスト本文の did は一切見ない。呼び出し側も本文から did を読まないこと
 * （読むと、なりすまし経路が復活する）。
 */
export async function requireDid(
  req: Request,
): Promise<{ did: string } | { response: Response }> {
  const session = await readSession(req);
  if (!session) {
    return {
      response: new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  return { did: session.did };
}
