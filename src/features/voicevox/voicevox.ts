import { TalkStyle } from "../messages/messages";

export async function voicevoxTts(
  message: string,
  speakerX: number, // Unused in VoiceVox but kept for signature compatibility if needed
  speakerY: number, // Unused
  style: TalkStyle  // Unused, as we hardcode speaker=8
) {
  // TTS Quest V3 VoiceVox API
  // Reference: https://github.com/ts-klassen/ttsQuestV3Voicevox

  const speakerId = 8; // Hardcoded as per requirements
  const url = `https://api.tts.quest/v3/voicevox/synthesis?speaker=${speakerId}&text=${encodeURIComponent(message)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.mp3StreamingUrl) {
    throw new Error("Failed to generate audio");
  }

  return { audio: data.mp3StreamingUrl };
}
