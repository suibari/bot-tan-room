import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VOICEVOX_API_KEY      = process.env.VOICEVOX_API_KEY ?? "";
const VOICEVOX_DOMAIN       = process.env.VOICEVOX_DOMAIN ?? "";
const PRIMARY_TIMEOUT_MS    = 3000;
const CF_ID_VOICEVOX     = process.env.CF_ACCESS_CLIENT_ID_VOICEVOX;
const CF_SECRET_VOICEVOX = process.env.CF_ACCESS_CLIENT_SECRET_VOICEVOX;

async function tryPrimaryVoicevox(text: string, speaker: string): Promise<ArrayBuffer | null> {
  if (!VOICEVOX_DOMAIN || !CF_ID_VOICEVOX || !CF_SECRET_VOICEVOX) {
    console.warn("[/api/voicevox] Primary not configured, skipping");
    return null;
  }

  const baseUrl = `https://${VOICEVOX_DOMAIN}`;
  const cfHeaders = {
    "cf-access-client-id": CF_ID_VOICEVOX,
    "cf-access-client-secret": CF_SECRET_VOICEVOX,
  };

  let audioQuery: unknown;
  try {
    const queryParams = new URLSearchParams({ speaker, text });
    const queryStart = Date.now();
    const querySignal = AbortSignal.timeout(PRIMARY_TIMEOUT_MS);
    const queryRes = await fetch(`${baseUrl}/audio_query?${queryParams.toString()}`, {
      method: "POST",
      headers: { ...cfHeaders, "Content-Type": "application/json" },
      signal: querySignal,
    });
    if (!queryRes.ok) {
      console.error(`[/api/voicevox] [audio_query] HTTPエラー: ${queryRes.status}`);
      return null;
    }
    audioQuery = await queryRes.json();
    console.log(`[/api/voicevox] [audio_query] 成功 (${Date.now() - queryStart}ms)`);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      console.warn(`[/api/voicevox] [audio_query] タイムアウト(${PRIMARY_TIMEOUT_MS}ms) — VOICEVOXは動いているが重い可能性（コールドスタート?）`);
    } else {
      console.error(`[/api/voicevox] [audio_query] 到達不可 — DockerまたはTunnelが落ちている可能性:`, e);
    }
    return null;
  }

  try {
    const synthParams = new URLSearchParams({ speaker });
    const synthStart = Date.now();
    const synthSignal = AbortSignal.timeout(PRIMARY_TIMEOUT_MS);
    const synthRes = await fetch(`${baseUrl}/synthesis?${synthParams.toString()}`, {
      method: "POST",
      headers: { ...cfHeaders, "Content-Type": "application/json", "Accept": "audio/wav" },
      body: JSON.stringify(audioQuery),
      signal: synthSignal,
    });
    if (!synthRes.ok) {
      console.error(`[/api/voicevox] [synthesis] HTTPエラー: ${synthRes.status}`);
      return null;
    }
    const buf = await synthRes.arrayBuffer();
    console.log(`[/api/voicevox] [synthesis] 成功 (${Date.now() - synthStart}ms)`);
    return buf;
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      console.warn(`[/api/voicevox] [synthesis] タイムアウト(${PRIMARY_TIMEOUT_MS}ms) — VOICEVOXは動いているが重い可能性（コールドスタート?）`);
    } else {
      console.error(`[/api/voicevox] [synthesis] 到達不可 — DockerまたはTunnelが落ちている可能性:`, e);
    }
    return null;
  }
}

async function tryFallbackVoicevox(text: string, speaker: string): Promise<{ buf: ArrayBuffer; status: number } | null> {
  const params = new URLSearchParams({
    speaker,
    text,
    ...(VOICEVOX_API_KEY ? { key: VOICEVOX_API_KEY } : {}),
  });

  let upstream: Response;
  try {
    upstream = await fetch(`https://api.tts.quest/v3/voicevox/synthesis?${params.toString()}`);
  } catch (e) {
    console.error("[/api/voicevox] Fallback network error:", e);
    return null;
  }

  if (upstream.status === 429) {
    return { buf: new ArrayBuffer(0), status: 429 };
  }

  if (!upstream.ok) {
    console.error(`[/api/voicevox] Fallback upstream error: ${upstream.status}`);
    return null;
  }

  let mp3StreamingUrl: string | undefined;
  try {
    const data: { mp3StreamingUrl?: string } = await upstream.json();
    mp3StreamingUrl = data.mp3StreamingUrl;
  } catch {
    console.error("[/api/voicevox] Fallback: Invalid JSON from tts.quest");
    return null;
  }

  if (!mp3StreamingUrl) {
    console.error("[/api/voicevox] Fallback: No mp3StreamingUrl in response");
    return null;
  }

  try {
    const mp3Res = await fetch(mp3StreamingUrl);
    if (!mp3Res.ok) {
      console.error(`[/api/voicevox] Fallback MP3 fetch failed: ${mp3Res.status}`);
      return null;
    }
    return { buf: await mp3Res.arrayBuffer(), status: 200 };
  } catch (e) {
    console.error("[/api/voicevox] Fallback MP3 fetch error:", e);
    return null;
  }
}

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const { searchParams } = new URL(req.url);
  const speaker = searchParams.get('speaker');
  const text = searchParams.get('text');
  if (!text || !speaker) {
    return json({ error: "Missing required params: speaker, text" }, 400);
  }

  const wavBuf = await tryPrimaryVoicevox(text, speaker);
  if (wavBuf !== null) {
    console.log(`[/api/voicevox] Primary succeeded (${wavBuf.byteLength} bytes)`);
    return new Response(wavBuf, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wavBuf.byteLength),
      },
    });
  }

  console.warn("[/api/voicevox] Primary failed or skipped, trying fallback");

  const fallback = await tryFallbackVoicevox(text, speaker);
  if (!fallback) {
    return json({ error: "All VoiceVox sources failed" }, 502);
  }
  if (fallback.status === 429) {
    return json({ error: "VoiceVox API rate limit exceeded" }, 429);
  }

  console.log(`[/api/voicevox] Fallback succeeded (${fallback.buf.byteLength} bytes)`);
  return new Response(fallback.buf, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(fallback.buf.byteLength),
    },
  });
}
