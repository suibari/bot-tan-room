const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, filename);
const originalFetch = global.fetch;
const keys = ['CF_ACCESS_CLIENT_ID_VOICEVOX', 'CF_ACCESS_CLIENT_SECRET_VOICEVOX',
  'VOICEVOX_DOMAIN', 'VOICEVOX_API_KEY'];
const originalEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
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
test('retired Irodori API routes have no Pages handlers', () => {
  const apiEntries = fs.readdirSync(join(__dirname, '../src/pages/api'));
  for (const route of ['tts', 'tts-health']) {
    const handlers = apiEntries.filter(entry => entry === route || entry.startsWith(`${route}.`));
    assert.deepEqual(handlers, [], `/api/${route} must remain retired`);
  }
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
