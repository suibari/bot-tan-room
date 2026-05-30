import type { NextApiRequest, NextApiResponse } from 'next';
import { put } from '@vercel/blob';
import { createClient } from '@vercel/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Secret Key authentication
  const secretKey = process.env.INVITE_SECRET_KEY;
  if (!secretKey) {
    console.error('[API invite-message error]: INVITE_SECRET_KEY is not configured in environment variables.');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const authHeader = req.headers['authorization'];
  // 'Bearer ' から始まる場合のみ、その後のトークン文字列（7文字目以降）を抽出
  const clientKey = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (clientKey !== secretKey) {
    console.warn('[API invite-message] Rejected unauthorized access attempt');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // 2. Validate input parameters
  const { did, text } = req.body;
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ message: 'Invalid or missing text' });
  }

  try {
    // 3. Synthesize speech using Voicevox API via downstream proxy
    const VOICEVOX_API_KEY = process.env.VOICEVOX_API_KEY ?? '';
    const speakerId = 8; // Hardcoded as per specifications
    const params = new URLSearchParams({
      speaker: String(speakerId),
      text: text.trim(),
      ...(VOICEVOX_API_KEY ? { key: VOICEVOX_API_KEY } : {}),
    });
    const upstreamUrl = `https://api.tts.quest/v3/voicevox/synthesis?${params.toString()}`;

    console.log(`[API invite-message] Requesting Voicevox synthesis for DID: ${did}`);
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      throw new Error(`VoiceVox synthesis proxy failed with status ${upstream.status}`);
    }

    const data = await upstream.json();
    if (!data.mp3StreamingUrl) {
      throw new Error('No mp3StreamingUrl returned in Voicevox response');
    }

    // 4. Download synthesized MP3 binary data
    const mp3Res = await fetch(data.mp3StreamingUrl);
    if (!mp3Res.ok) {
      throw new Error(`Failed to download MP3 file from Voicevox proxy (status: ${mp3Res.status})`);
    }
    const mp3Buffer = await mp3Res.arrayBuffer();

    // 5. Upload MP3 to Vercel Blob with addRandomSuffix=false to overwrite (1 user 1 file)
    console.log(`[API invite-message] Uploading MP3 to Vercel Blob for DID: ${did}`);
    const blob = await put(`invitations/${did}.mp3`, Buffer.from(mp3Buffer), {
      access: 'private',
      contentType: 'audio/mpeg',
      addRandomSuffix: false,
    });

    // 6. Save text and audioUrl to Vercel KV
    console.log(`[API invite-message] Saving metadata to Vercel KV for DID: ${did}`);
    const kv = createClient({
      url: process.env.VRM_BOT_KV_REST_API_URL,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN,
    });

    await kv.set(
      `invite:${did}`,
      {
        text: text.trim(),
        audioUrl: blob.url,
        createdAt: new Date().toISOString(),
      }
    );

    return res.status(200).json({ success: true, audioUrl: blob.url });
  } catch (e) {
    console.error('[API invite-message error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
