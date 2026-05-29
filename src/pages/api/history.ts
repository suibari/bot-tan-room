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

      return res.status(200).json({
        isFollower: true,
        conv_history,
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
      // 100件の上限ルールを適用し、古いものから安全に切り詰める（先頭がuser、末尾がmodelであることを保証）
      const truncatedHistory = truncateHistory(conv_history, 100);

      // Perform PATCH to update only conv_history for this DID
      const response = await fetch(
        `${DB_URL}/followers?did=eq.${encodeURIComponent(did)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ conv_history: truncatedHistory }),
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

// conv_historyの100件上限制約を適用しつつ、先頭がuser、末尾がmodelであることを保証する安全なスライス関数
function truncateHistory(history: any[], maxLength: number = 100): any[] {
  if (history.length <= maxLength) {
    return history;
  }

  // 100を超えているので、古いもの（配列の先頭）から削除する
  let sliced = history.slice(-maxLength);

  // 先頭が 'user' で始まることを保証する
  while (sliced.length > 0 && sliced[0].role !== 'user') {
    sliced.shift(); // 先頭の model などを取り除く
  }

  // 末尾が 'model' で終わることを保証する（Geminiの会話ペア完結の担保）
  while (sliced.length > 0 && sliced[sliced.length - 1].role !== 'model') {
    sliced.pop(); // 末尾の不完全な user を取り除く
  }

  return sliced;
}
