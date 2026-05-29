import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!CF_ID || !CF_SECRET) {
    console.error('[API posts error]: Cloudflare Access Client ID/Secret not configured in environment variables.');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'CF-Access-Client-Id': CF_ID,
    'CF-Access-Client-Secret': CF_SECRET,
  };

  try {
    const [postsRes, repliesRes] = await Promise.all([
      fetch(
        `${DB_URL}/posts?score=gte.80&select=post,created_at&order=created_at.desc&limit=50`,
        { headers }
      ),
      fetch(
        `${DB_URL}/replies?select=reply,created_at&order=created_at.desc&limit=50`,
        { headers }
      ),
    ]);

    if (!postsRes.ok || !repliesRes.ok) {
      const postsStatus = postsRes.status;
      const repliesStatus = repliesRes.status;
      let postsErrText = '';
      let repliesErrText = '';
      try { postsErrText = await postsRes.text(); } catch (_) {}
      try { repliesErrText = await repliesRes.text(); } catch (_) {}

      console.error(
        `[API posts DB fetch failed]:\n` +
        `- posts endpoint: status=${postsStatus}, body=${postsErrText}\n` +
        `- replies endpoint: status=${repliesStatus}, body=${repliesErrText}`
      );
      throw new Error('DB fetch failed');
    }

    const posts: { post: string; created_at: string }[] = await postsRes.json();
    const replies: { reply: string; created_at: string }[] = await repliesRes.json();

    const merged = [
      ...posts.map((p) => ({ text: p.post, created_at: p.created_at })),
      ...replies.map((r) => ({ text: r.reply, created_at: r.created_at })),
    ].sort(() => Math.random() - 0.5); // シャッフルして背景表示用に返す

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(merged);
  } catch (e) {
    console.error('posts API error:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
