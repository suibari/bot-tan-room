// Server-side only. Access credentials must never be sent to the browser.
export function ttsConfig() {
  const id = process.env.CF_ACCESS_CLIENT_ID_TTS ?? process.env.CF_ACCESS_CLIENT_ID_VOICEVOX;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET_TTS ?? process.env.CF_ACCESS_CLIENT_SECRET_VOICEVOX;
  return {
    url: `https://${process.env.TTS_DOMAIN || "tts.suibari.com"}`,
    headers: id && secret ? {
      "cf-access-client-id": id,
      "cf-access-client-secret": secret,
    } : undefined,
  };
}
