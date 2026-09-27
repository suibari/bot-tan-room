const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, filename);
const { splitText, joinWav } = require('../src/features/tts/wav.ts');
const handler = require('../src/pages/api/tts.ts').default;
const health = require('../src/pages/api/tts-health.ts').default;
const originalFetch = global.fetch;
const keys = ['CF_ACCESS_CLIENT_ID_TTS', 'CF_ACCESS_CLIENT_SECRET_TTS',
  'CF_ACCESS_CLIENT_ID_VOICEVOX', 'CF_ACCESS_CLIENT_SECRET_VOICEVOX', 'TTS_DOMAIN', 'VOICEVOX_DOMAIN', 'VOICEVOX_API_KEY'];
const originalEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
const request = text => new Request('https://room.example/api/tts', {
  method: 'POST', body: JSON.stringify({ text }),
});
const credentials = () => {
  process.env.CF_ACCESS_CLIENT_ID_TTS = 'test-id';
  process.env.CF_ACCESS_CLIENT_SECRET_TTS = 'test-secret';
  delete process.env.TTS_DOMAIN;
};
function wav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const tag = (o, s) => bytes.set(Buffer.from(s), o);
  tag(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + 2 * i, s, true));
  return buffer;
}
test('splits sentences and long Unicode text without dropping characters', () => {
  const text = 'こんにちは。元気？' + '😀'.repeat(601);
  const parts = splitText(text);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(p => Array.from(p).length <= 300));
  assert.equal(parts[0], 'こんにちは。');
  assert.throws(() => splitText('  '));
});
test('joins PCM samples with a single valid WAV header', () => {
  const result = joinWav([wav([1, -2]), wav([3, -4])]);
  assert.equal(result.byteLength, 52);
  const view = new DataView(result);
  assert.equal(view.getUint32(4, true), 44);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual([44, 46, 48, 50].map(i => view.getInt16(i, true)), [1, -2, 3, -4]);
  assert.throws(() => joinWav([new ArrayBuffer(5)]));
  const wrongRate = wav([1]); new DataView(wrongRate).setUint32(24, 48000, true);
  assert.throws(() => joinWav([wrongRate]));
  assert.throws(() => joinWav([wav([1]).slice(0, 44)]));
});
test('rejects invalid input before calling upstream', async () => {
  global.fetch = () => { throw new Error('must not fetch'); };
  assert.equal((await handler(new Request('https://room.example/api/tts'))).status, 405);
  for (const text of ['', ' ', 5, 'あ'.repeat(301)]) assert.equal((await handler(request(text))).status, 400);
  assert.equal((await handler(new Request('https://room.example/api/tts', { method: 'POST', body: 'null' }))).status, 400);
});
test('requires Access credentials', async () => {
  keys.forEach(k => delete process.env[k]);
  assert.equal((await handler(request('こんにちは'))).status, 503);
});
test('calls Irodori over the new hostname and returns WAV', async () => {
  credentials();
  const audio = wav([1, 2]);
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://tts.suibari.com/synthesize');
    assert.equal(options.headers['cf-access-client-id'], 'test-id');
    assert.deepEqual(JSON.parse(options.body), { text: 'こんにちは', wait_load: true });
    assert.equal(options.redirect, 'manual');
    return new Response(audio, { headers: { 'Content-Type': 'audio/wav' } });
  };
  const response = await handler(request('こんにちは'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.arrayBuffer(), audio);
});
test('handles GPU unavailable, rate limits, Access pages and timeouts', async () => {
  credentials();
  for (const status of [503, 429, 403]) {
    global.fetch = async () => new Response('', { status });
    assert.equal((await handler(request('テスト'))).status, status === 403 ? 502 : status);
  }
  global.fetch = async () => new Response('<html>login</html>');
  assert.equal((await handler(request('テスト'))).status, 502);
  global.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
  assert.equal((await handler(request('テスト'))).status, 504);
});
test('health checks Irodori even when model is unloaded', async () => {
  credentials();
  global.fetch = async url => {
    assert.equal(url, 'https://tts.suibari.com/health');
    return Response.json({ loaded: false, voices: ['tsumugi'], default_voice: 'tsumugi' });
  };
  assert.equal((await (await health()).json()).primary, true);
});
function voicevoxHandlers() {
  process.env.VOICEVOX_DOMAIN = 'voicevox.example';
  process.env.CF_ACCESS_CLIENT_ID_VOICEVOX = 'voicevox-id';
  process.env.CF_ACCESS_CLIENT_SECRET_VOICEVOX = 'voicevox-secret';
  delete process.env.VOICEVOX_API_KEY;
  const paths = ['../src/pages/api/voicevox.ts', '../src/pages/api/voicevox-health.ts'];
  return paths.map(path => {
    delete require.cache[require.resolve(path)];
    return require(path).default;
  });
}
const voicevoxRequest = () => new Request('https://room.example/api/voicevox?text=hello&speaker=8');
test('VOICEVOX endpoint uses audio_query and synthesis with its own credentials', async () => {
  const [voicevox] = voicevoxHandlers();
  const calls = [];
  const audio = wav([1, 2]);
  global.fetch = async (url, options) => {
    calls.push(url);
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://voicevox.example');
    assert.equal(parsed.searchParams.get('speaker'), '8');
    assert.equal(options.headers['cf-access-client-id'], 'voicevox-id');
    assert.equal(options.method, 'POST');
    if (parsed.pathname === '/audio_query') {
      assert.equal(parsed.searchParams.get('text'), 'hello');
      return Response.json({ speedScale: 1 });
    }
    assert.equal(parsed.pathname, '/synthesis');
    assert.deepEqual(JSON.parse(options.body), { speedScale: 1 });
    return new Response(audio);
  };
  const response = await voicevox(voicevoxRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(await response.arrayBuffer(), audio);
  assert.equal(calls.length, 2);
});
test('VOICEVOX health uses version, not Irodori health', async () => {
  const [, voicevoxHealth] = voicevoxHandlers();
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://voicevox.example/version');
    assert.equal(options.headers['cf-access-client-secret'], 'voicevox-secret');
    return Response.json('0.25.0');
  };
  assert.equal((await (await voicevoxHealth()).json()).primary, true);
});
test('VOICEVOX failure falls back to VOICEVOX on tts.quest', async () => {
  const [voicevox] = voicevoxHandlers();
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    if (url.startsWith('https://voicevox.example/')) return new Response('', { status: 503 });
    if (url.startsWith('https://api.tts.quest/v3/voicevox/synthesis?')) {
      return Response.json({ mp3StreamingUrl: 'https://audio.example/test.mp3' });
    }
    assert.equal(url, 'https://audio.example/test.mp3');
    return new Response(new Uint8Array([1, 2]));
  };
  const response = await voicevox(voicevoxRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(calls.length, 3);
});
test('app synthesis functions request VOICEVOX speaker 8', async () => {
  const { synthesizeVoice, synthesizeVoiceApi } = require('../src/features/messages/synthesizeVoice.ts');
  global.fetch = async url => {
    const parsed = new URL(url, 'https://room.example');
    assert.equal(parsed.pathname, '/api/voicevox');
    assert.equal(parsed.searchParams.get('speaker'), '8');
    assert.equal(parsed.searchParams.get('text'), 'hello');
    return new Response(wav([1]));
  };
  for (const synthesize of [synthesizeVoice, synthesizeVoiceApi]) {
    const result = await synthesize('hello', 0, 0, 'neutral', '');
    assert.ok(result.audio.startsWith('blob:'));
    URL.revokeObjectURL(result.audio);
  }
});
