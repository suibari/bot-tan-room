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
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error("VoiceVox fetch exception. Entering cooldown:", e);
      throw new Error("Failed to contact VoiceVox proxy.");
    }

    if (!res.ok) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error(`VoiceVox proxy returned error (${res.status}). Entering cooldown.`);
      if (res.status === 429) {
        throw new Error("VoiceVox API rate limit exceeded.");
      }
      throw new Error(`VoiceVox proxy error: ${res.status}`);
    }

    // API always returns binary audio — create a BlobURL for playback
    let blob: Blob;
    try {
      blob = await res.blob();
    } catch (e) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error("VoiceVox: Failed to read audio blob. Entering cooldown.", e);
      throw new Error("Failed to read audio from VoiceVox proxy.");
    }

    const audioUrl = URL.createObjectURL(blob);
    return { audio: audioUrl };
  } finally {
    isFetching = false;
  }
}
