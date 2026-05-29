import type { NextApiRequest, NextApiResponse } from "next";

type VoicevoxSuccessResponse = {
  mp3StreamingUrl: string;
};

type VoicevoxErrorResponse = {
  error: string;
};

const VOICEVOX_API_KEY = process.env.VOICEVOX_API_KEY ?? "";
const MAX_RETRIES = 2;
const RETRY_WAIT_MS = 3000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VoicevoxSuccessResponse | VoicevoxErrorResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { speaker, text } = req.query;

  if (!text || !speaker) {
    return res.status(400).json({ error: "Missing required params: speaker, text" });
  }

  // Build upstream URL — API key is injected server-side only (never exposed to browser)
  const params = new URLSearchParams({
    speaker: String(speaker),
    text: String(text),
    ...(VOICEVOX_API_KEY ? { key: VOICEVOX_API_KEY } : {}),
  });

  const upstreamUrl = `https://api.tts.quest/v3/voicevox/synthesis?${params.toString()}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl);
    } catch (e) {
      console.error("[/api/voicevox] Network error:", e);
      return res.status(500).json({ error: "Network error while contacting VoiceVox API" });
    }

    if (upstream.status === 429) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[/api/voicevox] 429 received, retrying (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
        continue;
      }
      console.error("[/api/voicevox] 429 persists after retries — returning 429 to client");
      return res.status(429).json({ error: "VoiceVox API rate limit exceeded" });
    }

    if (!upstream.ok) {
      console.error(`[/api/voicevox] Upstream error: ${upstream.status}`);
      return res.status(upstream.status).json({ error: `VoiceVox API error: ${upstream.status}` });
    }

    let data: { mp3StreamingUrl?: string };
    try {
      data = await upstream.json();
    } catch {
      return res.status(502).json({ error: "Invalid JSON from VoiceVox API" });
    }

    if (!data.mp3StreamingUrl) {
      return res.status(502).json({ error: "No mp3StreamingUrl in VoiceVox response" });
    }

    return res.status(200).json({ mp3StreamingUrl: data.mp3StreamingUrl });
  }

  // Fallback (should not be reached)
  return res.status(429).json({ error: "VoiceVox API rate limit exceeded after retries" });
}
