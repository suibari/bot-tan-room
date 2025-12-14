import { kv } from '@vercel/kv';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  try {
    const history = await kv.lrange('chat_history', 0, -1);
    res.status(200).json(history);
  } catch (error) {
    console.error("KV Error:", error);
    // Fallback or empty list on error (e.g. if env vars missing locally)
    res.status(200).json([]);
  }
}
