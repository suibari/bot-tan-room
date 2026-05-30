import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';
import { createClient } from '@vercel/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { did } = req.query;
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const isVerified = await verifyAtprotoToken(token, did);
  if (!isVerified) {
    console.warn(`[API get-invite GET] Blocked unauthorized attempt for DID: ${did}`);
    return res.status(401).json({ message: 'Unauthorized session' });
  }

  try {
    const kv = createClient({
      url: process.env.VRM_BOT_KV_REST_API_URL,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN,
    });

    const key = `invite:${did}`;
    const invite: { text: string; audioUrl: string } | null = await kv.get(key);

    if (!invite) {
      return res.status(200).json({ hasInvite: false });
    }

    // 1回限りのお迎え表示・再生とするため、KVから該当キーを即時削除する
    console.log(`[API get-invite] Found invite for DID: ${did}, deleting key from KV`);
    await kv.del(key);

    return res.status(200).json({
      hasInvite: true,
      text: invite.text,
      audioUrl: invite.audioUrl,
    });
  } catch (e) {
    console.error('[API get-invite error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
