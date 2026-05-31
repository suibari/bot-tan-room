import type { NextApiRequest, NextApiResponse } from "next";

type VoicevoxErrorResponse = {
  error: string;
};

const VOICEVOX_API_KEY   = process.env.VOICEVOX_API_KEY ?? "";
const VOICEVOX_DOMAIN    = process.env.VOICEVOX_DOMAIN ?? "";
const CF_ID_VOICEVOX     = process.env.CF_ACCESS_CLIENT_ID_VOICEVOX;
const CF_SECRET_VOICEVOX = process.env.CF_ACCESS_CLIENT_SECRET_VOICEVOX;

async function tryPrimaryVoicevox(text: string, speaker: string): Promise<Buffer | null> {
  if (!VOICEVOX_DOMAIN || !CF_ID_VOICEVOX || !CF_SECRET_VOICEVOX) {
    console.warn("[/api/voicevox] Primary not configured, skipping");
    return null;
  }

  const baseUrl = `https://${VOICEVOX_DOMAIN}`;
  const cfHeaders = {
    "cf-access-client-id": CF_ID_VOICEVOX,
    "cf-access-client-secret": CF_SECRET_VOICEVOX,
  };

  // Step 1: audio_query
  let audioQuery: unknown;
  try {
    const queryParams = new URLSearchParams({ speaker, text });
    const queryRes = await fetch(`${baseUrl}/audio_query?${queryParams.toString()}`, {
      method: "POST",
      headers: { ...cfHeaders, "Content-Type": "application/json" },
    });
    if (!queryRes.ok) {
      console.error(`[/api/voicevox] Primary audio_query failed: ${queryRes.status}`);
      return null;
    }
    audioQuery = await queryRes.json();
  } catch (e) {
    console.error("[/api/voicevox] Primary audio_query error:", e);
    return null;
  }

  // Step 2: synthesis
  try {
    const synthParams = new URLSearchParams({ speaker });
    const synthRes = await fetch(`${baseUrl}/synthesis?${synthParams.toString()}`, {
      method: "POST",
      headers: { ...cfHeaders, "Content-Type": "application/json", "Accept": "audio/wav" },
      body: JSON.stringify(audioQuery),
    });
    if (!synthRes.ok) {
      console.error(`[/api/voicevox] Primary synthesis failed: ${synthRes.status}`);
      return null;
    }
    return Buffer.from(await synthRes.arrayBuffer());
  } catch (e) {
    console.error("[/api/voicevox] Primary synthesis error:", e);
    return null;
  }
}

async function tryFallbackVoicevox(text: string, speaker: string): Promise<{ buf: Buffer; status: number } | null> {
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
    return { buf: Buffer.alloc(0), status: 429 };
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
    return { buf: Buffer.from(await mp3Res.arrayBuffer()), status: 200 };
  } catch (e) {
    console.error("[/api/voicevox] Fallback MP3 fetch error:", e);
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VoicevoxErrorResponse | never>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { speaker, text } = req.query;
  if (!text || !speaker) {
    return res.status(400).json({ error: "Missing required params: speaker, text" });
  }

  const speakerStr = String(speaker);
  const textStr = String(text);

  // Primary: self-hosted VoiceVox
  const wavBuf = await tryPrimaryVoicevox(textStr, speakerStr);
  if (wavBuf !== null) {
    console.log(`[/api/voicevox] Primary succeeded (${wavBuf.byteLength} bytes)`);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", wavBuf.byteLength);
    res.status(200).send(wavBuf as never);
    return;
  }

  console.warn("[/api/voicevox] Primary failed or skipped, trying fallback");

  // Fallback: api.tts.quest
  const fallback = await tryFallbackVoicevox(textStr, speakerStr);
  if (!fallback) {
    return res.status(502).json({ error: "All VoiceVox sources failed" });
  }
  if (fallback.status === 429) {
    return res.status(429).json({ error: "VoiceVox API rate limit exceeded" });
  }

  console.log(`[/api/voicevox] Fallback succeeded (${fallback.buf.byteLength} bytes)`);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", fallback.buf.byteLength);
  res.status(200).send(fallback.buf as never);
}
