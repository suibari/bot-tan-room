import { voicevoxTts } from "../voicevox/voicevox";
import { TalkStyle } from "./messages";

export const synthesizeVoice = voicevoxTts;

export function synthesizeVoiceApi(message: string, speakerX: number, speakerY: number, style: TalkStyle, _apiKey: string) {
  return voicevoxTts(message, speakerX, speakerY, style);
}
