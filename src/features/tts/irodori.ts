import { splitText, joinWav } from "./wav";
import { TalkStyle } from "../messages/messages";

// Module-level state for request control
const COOLDOWN_MS = 5000;
let cooldownUntil = 0;
let isFetching = false;

export async function irodoriTts(
  message: string,
  speakerX: number, // Kept for signature compatibility
  speakerY: number, // Unused
  style: TalkStyle  // Voice is configured on the TTS server
) {
  const now = Date.now();

  // 1. Concurrency control (prevent double requests)
  if (isFetching) {
    console.warn("TTS request rejected: another request is currently in progress");
    throw new Error("TTS API is busy. Please wait a moment.");
  }

  // 2. Cooldown (fetch stop period) guard
  if (now < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - now) / 1000);
    console.warn(`TTS request rejected: in cooldown for another ${remaining}s`);
    throw new Error(`TTS API is in cooldown. Please wait ${remaining} seconds.`);
  }

  isFetching = true;

  try {
    const chunks = splitText(message);
    const buffers: ArrayBuffer[] = [];
    for (const text of chunks) {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`TTS proxy error: ${res.status}`);
      buffers.push(await res.arrayBuffer());
    }
    const blob = new Blob([joinWav(buffers)], { type: "audio/wav" });

    const audioUrl = URL.createObjectURL(blob);
    return { audio: audioUrl };
  } catch (error) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    throw error;
  } finally {
    isFetching = false;
  }
}
