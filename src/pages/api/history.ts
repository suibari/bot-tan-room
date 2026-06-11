import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';

export const runtime = 'edge';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    console.error('Cloudflare Access Client ID/Secret not configured');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (req.method === 'GET') {
    const { did } = req.query;
    if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
      return res.status(400).json({ message: 'Invalid or missing DID' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const verification = await verifyAtprotoToken(token, did);
    if (!verification.verified) {
      console.warn(`[API history GET] Blocked unauthorized attempt for DID: ${did}. Reason: ${verification.reason}`);
      return res.status(401).json({ message: 'Unauthorized session', reason: verification.reason });
    }

    try {
      const response = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
        { headers, keepalive: true }
      );

      if (!response.ok) {
        throw new Error(`DB fetch failed with status ${response.status}`);
      }

      const records = await response.json();
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(200).json({ isFollower: false });
      }

      const follower = records[0];
      const conv_history = follower.conv_history ?? [];
      const regular_level = follower.regular_level ?? 0;

      return res.status(200).json({
        isFollower: true,
        conv_history,
        regular_level,
      });
    } catch (e) {
      console.error('[API history GET error]:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } else if (req.method === 'POST') {
    const { did, conv_history } = req.body;
    if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
      return res.status(400).json({ message: 'Invalid or missing DID' });
    }
    if (!Array.isArray(conv_history)) {
      return res.status(400).json({ message: 'Invalid conv_history format' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const verification = await verifyAtprotoToken(token, did);
    if (!verification.verified) {
      console.warn(`[API history POST] Blocked unauthorized attempt to overwrite history for DID: ${did}. Reason: ${verification.reason}`);
      return res.status(401).json({ message: 'Unauthorized session', reason: verification.reason });
    }

    // Safety validation of conv_history items
    for (const msg of conv_history) {
      if (
        !msg ||
        typeof msg !== 'object' ||
        (msg.role !== 'user' && msg.role !== 'model') ||
        !Array.isArray(msg.parts)
      ) {
        return res.status(400).json({ message: 'Invalid conv_history messages structure' });
      }
    }

    try {
      // Perform PATCH to update only conv_history for this DID
      const response = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ conv_history }),
          keepalive: true,
        }
      );

      if (!response.ok) {
        throw new Error(`DB update failed with status ${response.status}`);
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[API history POST/PATCH error]:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } else {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
}

