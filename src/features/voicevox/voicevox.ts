import { TalkStyle } from "../messages/messages";

// Module-level state for request control
const COOLDOWN_MS = 5000;
let cooldownUntil = 0;
let isFetching = false;

export async function voicevoxTts(
  message: string,
  speakerX: number, // Unused in VoiceVox but kept for signature compatibility
  speakerY: number, // Unused
  style: TalkStyle  // Unused, as we hardcode speaker=8
) {
  const now = Date.now();

  // 1. Concurrency control (prevent double requests)
  if (isFetching) {
    console.warn("VoiceVox request rejected: another request is currently in progress");
    throw new Error("VoiceVox API is busy. Please wait a moment.");
  }

  // 2. Cooldown (fetch stop period) guard
  if (now < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - now) / 1000);
    console.warn(`VoiceVox request rejected: in cooldown for another ${remaining}s`);
    throw new Error(`VoiceVox API is in cooldown. Please wait ${remaining} seconds.`);
  }

  isFetching = true;

  try {
    const speakerId = 8; // Hardcoded as per requirements
    const params = new URLSearchParams({
      speaker: String(speakerId),
      text: message,
    });

    let res: Response;
    try {
      res = await fetch(`/api/voicevox?${params.toString()}`);
    } catch (e) {
      // Apply cooldown on network/fetch exceptions
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error("VoiceVox fetch exception. Entering cooldown:", e);
      throw new Error("Failed to contact VoiceVox proxy.");
    }

    if (!res.ok) {
      // Apply cooldown on any non-200 responses (e.g. 429, 500, 502)
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error(`VoiceVox proxy returned error (${res.status}). Entering cooldown.`);
      if (res.status === 429) {
        throw new Error("VoiceVox API rate limit exceeded.");
      }
      throw new Error(`VoiceVox proxy error: ${res.status}`);
    }

    let data: { mp3StreamingUrl?: string };
    try {
      data = await res.json();
    } catch (e) {
      // Apply cooldown if json parsing fails
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error("Failed to parse VoiceVox response JSON. Entering cooldown.");
      throw new Error("Invalid response from VoiceVox proxy.");
    }

    if (!data.mp3StreamingUrl) {
      // Apply cooldown if streaming URL is missing
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error("No mp3StreamingUrl in VoiceVox response. Entering cooldown.");
      throw new Error("Failed to generate audio from VoiceVox.");
    }

    return { audio: data.mp3StreamingUrl };
  } finally {
    isFetching = false;
  }
}

