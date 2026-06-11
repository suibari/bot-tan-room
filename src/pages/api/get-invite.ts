import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';
import { Redis } from '@upstash/redis/cloudflare';

export const runtime = 'edge';

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
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    console.warn(`[API get-invite GET] Blocked unauthorized attempt for DID: ${did}. Reason: ${verification.reason}`);
    return res.status(401).json({ message: 'Unauthorized session', reason: verification.reason });
  }

  try {
    const redis = new Redis({
      url: process.env.VRM_BOT_KV_REST_API_URL!,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
    });

    const key = `invite:${did}`;
    const invite: { textJa?: string; textEn?: string; text?: string } | null = await redis.get(key);

    if (!invite) {
      return res.status(200).json({ hasInvite: false });
    }

    console.log(`[API get-invite] Found invite for DID: ${did}, deleting key from KV`);
    await redis.del(key);

    const textJa = invite.textJa || invite.text || '';
    const textEn = invite.textEn || invite.text || '';

    return res.status(200).json({
      hasInvite: true,
      textJa,
      textEn,
    });
  } catch (e) {
    console.error('[API get-invite error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
