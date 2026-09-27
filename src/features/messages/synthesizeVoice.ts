import { irodoriTts } from "../tts/irodori";
import { TalkStyle } from "./messages";

export const synthesizeVoice = irodoriTts;

export function synthesizeVoiceApi(message: string, speakerX: number, speakerY: number, style: TalkStyle, _apiKey: string) {
  return irodoriTts(message, speakerX, speakerY, style);
}
