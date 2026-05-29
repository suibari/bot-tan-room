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
    onComplete?: () => void
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
      return url;
    });

    prevFetchPromise = fetchPromise;
    prevSpeakPromise = Promise.all([fetchPromise, prevSpeakPromise]).then(
      ([audioUrl]) => {
        onStart?.();
        if (!audioUrl) {
          return;
        }
        return viewer.model?.speakStream(audioUrl, screenplay);
      }
    );
    prevSpeakPromise.then(() => {
      viewer.model?.emoteController?.playEmotion("neutral");
      onComplete?.();
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
