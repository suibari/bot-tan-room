import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VOICEVOX_DOMAIN    = process.env.VOICEVOX_DOMAIN ?? "";
const CF_ID_VOICEVOX     = process.env.CF_ACCESS_CLIENT_ID_VOICEVOX;
const CF_SECRET_VOICEVOX = process.env.CF_ACCESS_CLIENT_SECRET_VOICEVOX;
const HEALTH_TIMEOUT_MS  = 5000;

export default async function handler(_req: NextRequest): Promise<Response> {
  if (!VOICEVOX_DOMAIN || !CF_ID_VOICEVOX || !CF_SECRET_VOICEVOX) {
    return json({ primary: false, responseTimeMs: 0, error: "not_configured" });
  }

  const start = Date.now();
  try {
    const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
    const res = await fetch(`https://${VOICEVOX_DOMAIN}/version`, {
      headers: {
        "cf-access-client-id": CF_ID_VOICEVOX,
        "cf-access-client-secret": CF_SECRET_VOICEVOX,
      },
      signal,
    });
    const responseTimeMs = Date.now() - start;
    if (!res.ok) {
      console.warn(`[/api/voicevox-health] HTTPエラー: ${res.status} (${responseTimeMs}ms)`);
      return json({ primary: false, responseTimeMs, error: `http_${res.status}` });
    }
    console.log(`[/api/voicevox-health] primary ok (${responseTimeMs}ms)`);
    return json({ primary: true, responseTimeMs });
  } catch (e) {
    const responseTimeMs = Date.now() - start;
    if (e instanceof Error && e.name === 'TimeoutError') {
      console.warn(`[/api/voicevox-health] タイムアウト(${HEALTH_TIMEOUT_MS}ms)`);
      return json({ primary: false, responseTimeMs, error: "timeout" });
    }
    console.error(`[/api/voicevox-health] 到達不可:`, e);
    return json({ primary: false, responseTimeMs, error: "connection_error" });
  }
}
