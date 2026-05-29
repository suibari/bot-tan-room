import { TalkStyle } from "../messages/messages";

// Module-level cooldown: blocks requests for 10 s after the proxy itself gives up (429)
let cooldownUntil = 0;

export async function voicevoxTts(
  message: string,
  speakerX: number, // Unused in VoiceVox but kept for signature compatibility
  speakerY: number, // Unused
  style: TalkStyle  // Unused, as we hardcode speaker=8
) {
  // --- Client-side cooldown guard ---
  const now = Date.now();
  if (now < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - now) / 1000);
    console.warn(`VoiceVox request rejected: in cooldown for another ${remaining}s`);
    throw new Error(`VoiceVox API is in cooldown. Please wait ${remaining} seconds.`);
  }

  // Call our server-side proxy (/api/voicevox).
  // The proxy injects the API key and handles retries — the key is never exposed to the browser.
  const speakerId = 8; // Hardcoded as per requirements
  const params = new URLSearchParams({
    speaker: String(speakerId),
    text: message,
  });

  const res = await fetch(`/api/voicevox?${params.toString()}`);

  if (res.status === 429) {
    // Proxy exhausted its retries — apply client-side cooldown to stop hammering
    console.error("VoiceVox proxy: rate limit reached. Entering 10-second cooldown.");
    cooldownUntil = Date.now() + 10000;
    throw new Error("VoiceVox API rate limit exceeded.");
  }

  if (!res.ok) {
    throw new Error(`VoiceVox proxy error: ${res.status}`);
  }

  const data = await res.json();

  if (!data.mp3StreamingUrl) {
    throw new Error("Failed to generate audio");
  }

  return { audio: data.mp3StreamingUrl };
}

