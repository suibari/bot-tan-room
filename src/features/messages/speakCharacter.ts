import { wait } from "@/utils/wait";
import { voicevoxTts } from "../voicevox/voicevox";
import { Viewer } from "../vrmViewer/viewer";
import { Screenplay } from "./messages";
import { Talk } from "./messages";

const createSpeakCharacter = () => {
  let lastTime = 0;
  let prevFetchPromise: Promise<unknown> = Promise.resolve();
  let prevSpeakPromise: Promise<unknown> = Promise.resolve();

  return (
    screenplay: Screenplay,
    viewer: Viewer,
    koeiroApiKey: string,
    onStart?: () => void,
    onComplete?: () => void,
    onReject?: () => void
  ) => {
    const fetchPromise = prevFetchPromise.then(async () => {
      const now = Date.now();
      if (now - lastTime < 1000) {
        await wait(1000 - (now - lastTime));
      }

      const url = await fetchAudioUrl(screenplay.talk, koeiroApiKey).catch(
        () => null
      );
      lastTime = Date.now();
      if (!url) return null;

      // MP3のダウンロードもここで先行実施して ArrayBuffer として返す。
      // これにより prevSpeakPromise 内で残るのは「デコード→再生」だけになり、
      // onStart (= 画面表示切り替え) と発話開始のタイムラグが最小化される。
      try {
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        return buffer;
      } catch (e) {
        console.error("[speakCharacter] MP3 download error:", e);
        return null;
      }
    });

    prevFetchPromise = fetchPromise;
    let isRejected = false;

    prevSpeakPromise = Promise.all([fetchPromise, prevSpeakPromise]).then(
      ([audioBuffer]) => {
        if (!audioBuffer) {
          isRejected = true;
          onReject?.();
          return;
        }
        // ArrayBuffer 受け取り版 speak を使う。
        // onStart は playFromArrayBuffer 内の bufferSource.start() 直前に発火する。
        return viewer.model?.speak(audioBuffer as ArrayBuffer, screenplay, onStart);
      }
    ).catch((e) => {
      console.error("[speakCharacter] prevSpeakPromise error:", e);
      isRejected = true;
      onReject?.();
      return null;
    });

    prevSpeakPromise.then(() => {
      if (!isRejected) {
        viewer.model?.emoteController?.playEmotion("neutral");
        onComplete?.();
      }
    });

    return prevSpeakPromise;
  };
};

export const speakCharacter = createSpeakCharacter();

export const fetchAudioUrl = async (
  talk: Talk,
  apiKey: string
): Promise<string> => {
  const ttsVoice = await voicevoxTts(
    talk.message,
    talk.speakerX,
    talk.speakerY,
    talk.style
  );
  const url = ttsVoice.audio;

  if (url == null) {
    throw new Error("Something went wrong");
  }
  return url;
};

export const fetchAudio = async (
  talk: Talk,
  apiKey: string
): Promise<ArrayBuffer> => {
  const url = await fetchAudioUrl(talk, apiKey);
  const resAudio = await fetch(url);
  const buffer = await resAudio.arrayBuffer();
  return buffer;
};
