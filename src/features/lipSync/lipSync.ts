import { LipSyncAnalyzeResult } from "./lipSyncAnalyzeResult";

const TIME_DOMAIN_DATA_LENGTH = 512;

export class LipSync {
  public readonly audio: AudioContext;
  public readonly analyser: AnalyserNode;
  public readonly gainNode: GainNode;
  public readonly timeDomainData: Float32Array;
  private _currentSource: AudioBufferSourceNode | null = null;
  private _audioElement: HTMLAudioElement | null = null;
  private _mediaElementSource: MediaElementAudioSourceNode | null = null;

  public constructor(audio: AudioContext) {
    this.audio = audio;

    this.analyser = audio.createAnalyser();
    this.analyser.fftSize = TIME_DOMAIN_DATA_LENGTH;
    this.gainNode = audio.createGain();
    this.analyser.connect(this.gainNode);
    this.gainNode.connect(audio.destination);
    this.timeDomainData = new Float32Array(TIME_DOMAIN_DATA_LENGTH);
  }

  public setMuted(muted: boolean) {
    this.gainNode.gain.value = muted ? 0 : 1;
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

  public async playFromArrayBuffer(buffer: ArrayBuffer, onEnded?: () => void, onPlayStart?: () => void) {
    this.stop();
    if (this.audio.state === "suspended") {
      await this.audio.resume();
    }
    const audioBuffer = await this.audio.decodeAudioData(buffer);

    const bufferSource = this.audio.createBufferSource();
    this._currentSource = bufferSource;
    bufferSource.buffer = audioBuffer;

    bufferSource.connect(this.analyser);
    
    // 再生が開始される直前にコールバックを実行
    onPlayStart?.();
    
    bufferSource.start();
    bufferSource.addEventListener("ended", () => {
      if (this._currentSource === bufferSource) this._currentSource = null;
      onEnded?.();
    });
  }

  public async playFromURL(url: string, onEnded?: () => void, onPlayStart?: () => void) {
    try {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      await this.playFromArrayBuffer(buffer, onEnded, onPlayStart);
    } catch (e) {
      console.error("[LipSync] playFromURL error:", e);
      onPlayStart?.();
      onEnded?.();
    }
  }

  /**
   * URLからMP3を全取得してArrayBufferとして再生する。
   * TTS プロキシは合成済みの WAV を返すため、
   * 先に全取得してからデコードすることで再生途切れを防ぐ。
   */
  public async playFromStream(url: string, onEnded?: () => void, onPlayStart?: () => void) {
    if (typeof window === "undefined") {
      onPlayStart?.();
      onEnded?.();
      return;
    }
    try {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      await this.playFromArrayBuffer(buffer, onEnded, onPlayStart);
    } catch (e) {
      console.error("[LipSync] playFromStream fetch error:", e);
      onPlayStart?.();
      onEnded?.();
    }
  }
}
