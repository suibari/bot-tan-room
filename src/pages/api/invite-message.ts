import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis/cloudflare';

export const runtime = 'edge';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const secretKey = process.env.INVITE_SECRET_KEY;
  if (!secretKey) {
    console.error('[API invite-message error]: INVITE_SECRET_KEY is not configured in environment variables.');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const authHeader = req.headers['authorization'];
  const clientKey = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (clientKey !== secretKey) {
    console.warn('[API invite-message] Rejected unauthorized access attempt');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { did, textJa, textEn } = req.body;
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }
  if (!textJa || typeof textJa !== 'string' || textJa.trim().length === 0) {
    return res.status(400).json({ message: 'Invalid or missing textJa' });
  }
  if (!textEn || typeof textEn !== 'string' || textEn.trim().length === 0) {
    return res.status(400).json({ message: 'Invalid or missing textEn' });
  }

  try {
    const redis = new Redis({
      url: process.env.VRM_BOT_KV_REST_API_URL!,
      token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
    });

    await redis.set(
      `invite:${did}`,
      {
        textJa: textJa.trim(),
        textEn: textEn.trim(),
        createdAt: new Date().toISOString(),
      }
    );

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[API invite-message error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
