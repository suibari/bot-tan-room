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
  const signal = AbortSignal.timeout(PRIMARY_TIMEOUT_MS);

  let audioQuery: unknown;
  try {
    const queryParams = new URLSearchParams({ speaker, text });
    const queryRes = await fetch(`${baseUrl}/audio_query?${queryParams.toString()}`, {
      method: "POST",
      headers: { ...cfHeaders, "Content-Type": "application/json" },
      signal,
    });
    if (!queryRes.ok) {
      console.error(`[/api/voicevox] Primary audio_query failed: ${queryRes.status}`);
      return null;
    }
    audioQuery = await queryRes.json();
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      console.warn(`[/api/voicevox] Primary timed out after ${PRIMARY_TIMEOUT_MS}ms, falling back`);
    } else {
      console.error("[/api/voicevox] Primary audio_query error:", e);
    }
    return null;
  }

  try {
    const synthParams = new URLSearchParams({ speaker });
    const synthRes = await fetch(`${baseUrl}/synthesis?${synthParams.toString()}`, {
      method: "POST",
      headers: { ...cfHeaders, "Content-Type": "application/json", "Accept": "audio/wav" },
      body: JSON.stringify(audioQuery),
      signal,
    });
    if (!synthRes.ok) {
      console.error(`[/api/voicevox] Primary synthesis failed: ${synthRes.status}`);
      return null;
    }
    return synthRes.arrayBuffer();
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      console.warn(`[/api/voicevox] Primary timed out after ${PRIMARY_TIMEOUT_MS}ms, falling back`);
    } else {
      console.error("[/api/voicevox] Primary synthesis error:", e);
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
