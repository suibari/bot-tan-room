import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

import { ttsConfig } from "../../features/tts/config";
const HEALTH_TIMEOUT_MS  = 5000;

export default async function handler(_req: NextRequest): Promise<Response> {
  const config = ttsConfig();
  if (!config.headers) {
    return json({ primary: false, responseTimeMs: 0, error: "not_configured" });
  }

  const start = Date.now();
  try {
    const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
    const res = await fetch(`${config.url}/health`, {
      headers: config.headers,
      redirect: "manual",
      signal,
    });
    const responseTimeMs = Date.now() - start;
    if (!res.ok) {
      console.warn(`[/api/tts-health] HTTPエラー: ${res.status} (${responseTimeMs}ms)`);
      return json({ primary: false, responseTimeMs, error: `http_${res.status}` });
    }
    const health = await res.json();
    if (!Array.isArray(health.voices) || !health.default_voice) {
      return json({ primary: false, responseTimeMs, error: "invalid_response" });
    }
    return json({ primary: true, responseTimeMs });
  } catch (e) {
    const responseTimeMs = Date.now() - start;
    if (e instanceof Error && e.name === 'TimeoutError') {
      console.warn(`[/api/tts-health] タイムアウト(${HEALTH_TIMEOUT_MS}ms)`);
      return json({ primary: false, responseTimeMs, error: "timeout" });
    }
    console.error(`[/api/tts-health] 到達不可:`, e);
    return json({ primary: false, responseTimeMs, error: "connection_error" });
  }
}
