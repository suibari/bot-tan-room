import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!CF_ID || !CF_SECRET) {
    console.error('Cloudflare Access Client ID/Secret not configured');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'CF-Access-Client-Id': CF_ID,
    'CF-Access-Client-Secret': CF_SECRET,
    'Content-Type': 'application/json',
  };

  if (req.method === 'GET') {
    const { did } = req.query;
    if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
      return res.status(400).json({ message: 'Invalid or missing DID' });
    }

    try {
      const response = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`DB fetch failed with status ${response.status}`);
      }

      const records = await response.json();
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(200).json({ isFollower: false });
      }

      const follower = records[0];
      return res.status(200).json({
        isFollower: true,
        conv_history: follower.conv_history ?? [],
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
