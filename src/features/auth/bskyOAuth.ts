import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

// getServiceAuth を呼ぶための rpc スコープを含める。
// これが無いとサーバ側で DID を検証できず、API ルートは 401 になる。
// aud と lxm を絞ってあるので、同意画面に出る権限はセッション発行用途に限定される。
// aud は DID 単体では不正で、サービス種別フラグメントまで必要（仕様: DID service reference）。
// スコープ文字列中では # をパーセントエンコードして %23 と書く。
const SCOPE =
  'atproto rpc:com.bot-tan.room.createSession?aud=did:web:room.bot-tan.com%23bot_tan_room';

let _client: BrowserOAuthClient | null = null;

function createClient(): BrowserOAuthClient {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://room.bot-tan.com';
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocal) {
    const port = window.location.port || '3000';
    // RFC 8252 § 8.3: redirect_uris must use 127.0.0.1, not "localhost"
    const loopbackOrigin = `http://127.0.0.1:${port}`;
    const redirectUri = `${loopbackOrigin}/callback/`;
    const enc = encodeURIComponent;
    const clientId = `http://localhost?redirect_uri=${enc(redirectUri)}&scope=${enc(SCOPE)}`;

    return new BrowserOAuthClient({
      handleResolver: 'https://bsky.social',
      allowHttp: true,
      clientMetadata: {
        client_id: clientId,
        client_name: 'bot-tanのお部屋 (dev)',
        client_uri: window.location.origin,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: SCOPE,
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: false,
      },
    });
  }

  // 本番環境: public/client-metadata.json を参照。redirect_uri は /callback/ を使う
  const redirectUri = `${base}/callback/`;
  return new BrowserOAuthClient({
    handleResolver: 'https://bsky.social',
    clientMetadata: {
      client_id: `${base}/client-metadata.json`,
      client_name: 'bot-tanのお部屋',
      client_uri: base,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
      token_endpoint_auth_method: 'none',
      dpop_bound_access_tokens: true,
    },
  });
}

export function getBskyOAuthClient(): BrowserOAuthClient {
  if (typeof window === 'undefined') {
    throw new Error('getBskyOAuthClient はブラウザ側でのみ呼び出せます');
  }
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

export function resetBskyOAuthClient(): void {
  _client = null;
}
