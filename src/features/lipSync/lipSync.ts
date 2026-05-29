import { LipSyncAnalyzeResult } from "./lipSyncAnalyzeResult";

const TIME_DOMAIN_DATA_LENGTH = 2048;

export class LipSync {
  public readonly audio: AudioContext;
  public readonly analyser: AnalyserNode;
  public readonly timeDomainData: Float32Array;
  private _currentSource: AudioBufferSourceNode | null = null;
  private _audioElement: HTMLAudioElement | null = null;
  private _mediaElementSource: MediaElementAudioSourceNode | null = null;

  public constructor(audio: AudioContext) {
    this.audio = audio;

    this.analyser = audio.createAnalyser();
    this.timeDomainData = new Float32Array(TIME_DOMAIN_DATA_LENGTH);
  }

  public update(): LipSyncAnalyzeResult {
    this.analyser.getFloatTimeDomainData(this.timeDomainData as any);

    let volume = 0.0;
    for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
      volume = Math.max(volume, Math.abs(this.timeDomainData[i]));
    }

    // cook
    volume = 1 / (1 + Math.exp(-45 * volume + 5));
    if (volume < 0.1) volume = 0;

    return {
      volume,
    };
  }

  public stop() {
    if (this._currentSource) {
      try { this._currentSource.stop(); } catch { /* already stopped */ }
      this._currentSource = null;
    }
    if (this._audioElement) {
      try { this._audioElement.pause(); } catch { /* ignore */ }
      this._audioElement.src = "";
    }
  }

  public async playFromArrayBuffer(buffer: ArrayBuffer, onEnded?: () => void) {
    this.stop();
    const audioBuffer = await this.audio.decodeAudioData(buffer);

    const bufferSource = this.audio.createBufferSource();
    this._currentSource = bufferSource;
    bufferSource.buffer = audioBuffer;

    bufferSource.connect(this.audio.destination);
    bufferSource.connect(this.analyser);
    bufferSource.start();
    bufferSource.addEventListener("ended", () => {
      if (this._currentSource === bufferSource) this._currentSource = null;
      onEnded?.();
    });
  }

  public async playFromURL(url: string, onEnded?: () => void) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    this.playFromArrayBuffer(buffer, onEnded);
  }

  public async playFromStream(url: string, onEnded?: () => void) {
    this.stop();

    if (typeof window === "undefined") {
      onEnded?.();
      return;
    }

    if (!this._audioElement) {
      this._audioElement = new Audio();
      this._audioElement.crossOrigin = "anonymous";
      this._mediaElementSource = this.audio.createMediaElementSource(this._audioElement);
      this._mediaElementSource.connect(this.analyser);
      this.analyser.connect(this.audio.destination);
    }

    const audio = this._audioElement;
    audio.src = url;

    const handleEnded = () => {
      audio.removeEventListener("ended", handleEnded);
      onEnded?.();
    };
    audio.addEventListener("ended", handleEnded);

    if (this.audio.state === "suspended") {
      await this.audio.resume();
    }

    await audio.play();
  }
}
