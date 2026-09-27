// Irodori accepts at most 300 code points. Prefer sentence boundaries.
export function splitText(text: string): string[] {
  const result: string[] = [];
  for (const sentence of text.trim().match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/gu) ?? []) {
    const chars = Array.from(sentence);
    while (chars.length) {
      const chunk = chars.splice(0, 300).join("").trim();
      if (chunk) result.push(chunk);
    }
  }
  if (!result.length) throw new Error("TTS text is empty");
  return result;
}

// The local Irodori server emits 24 kHz, mono, 16-bit PCM WAV.
// Join PCM data, not entire WAV files (which would leave embedded RIFF headers).
export function joinWav(buffers: ArrayBuffer[]): ArrayBuffer {
  const parts = buffers.map(buffer => {
    const view = new DataView(buffer);
    const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    if (buffer.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Invalid WAV");
    let validFormat = false;
    let pcm: Uint8Array | undefined;
    for (let offset = 12; offset + 8 <= buffer.byteLength;) {
      const size = view.getUint32(offset + 4, true);
      if (offset + 8 + size > buffer.byteLength) throw new Error("Truncated WAV");
      if (tag(offset) === "fmt " && size >= 16) {
        validFormat = view.getUint16(offset + 8, true) === 1 &&
          view.getUint16(offset + 10, true) === 1 &&
          view.getUint32(offset + 12, true) === 24000 &&
          view.getUint16(offset + 22, true) === 16;
      }
      if (tag(offset) === "data") pcm = new Uint8Array(buffer, offset + 8, size);
      offset += 8 + size + (size % 2);
    }
    if (!validFormat || !pcm?.length || pcm.length % 2) throw new Error("Unsupported WAV format");
    return pcm;
  });
  if (!parts.length) throw new Error("No WAV audio");
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new ArrayBuffer(44 + length);
  const bytes = new Uint8Array(output);
  const view = new DataView(output);
  const tag = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
  tag(0, "RIFF"); view.setUint32(4, 36 + length, true); tag(8, "WAVE");
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, length, true);
  let offset = 44;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return output;
}
