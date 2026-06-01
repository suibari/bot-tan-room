import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

const SCOPE = 'atproto';

let _client: BrowserOAuthClient | null = null;

function createClient(): BrowserOAuthClient {
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocal) {
    const port = window.location.port;
    const origin = `http://127.0.0.1:${port}`;
    // ルート '/' を redirect_uri に使う。trailingSlash:true でも '/' は '/' のままなので
    // パスマッチが壊れない（/oauth/callback だと /oauth/callback/ にリダイレクトされ破綻する）
    const redirectUri = `${origin}/`;
    const enc = encodeURIComponent;
    const clientId = `http://localhost?redirect_uri=${enc(redirectUri)}&scope=${enc(SCOPE)}`;

    return new BrowserOAuthClient({
      handleResolver: 'https://bsky.social',
      allowHttp: true,
      clientMetadata: {
        client_id: clientId,
        client_name: 'bot-tanのお部屋 (dev)',
        client_uri: origin,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: SCOPE,
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: false,
      },
    });
  }

  // 本番・プレビュー共通: window.location.origin で自動検出し動的APIルートを参照
  const origin = window.location.origin;
  const redirectUri = `${origin}/`;
  return new BrowserOAuthClient({
    handleResolver: 'https://bsky.social',
    clientMetadata: {
      client_id: `${origin}/api/client-metadata`,
      client_name: 'bot-tanのお部屋',
      client_uri: origin,
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
