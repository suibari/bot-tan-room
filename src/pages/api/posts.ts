import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    console.error('[API posts error]: Cloudflare Access Client ID_DB/Secret_DB not configured in environment variables.');
    return json({ message: 'Server Configuration Error' }, 500);
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const postsRes = await fetch(
      `${DB_URL}/posts?score=gte.80&select=post,created_at&order=created_at.desc&limit=50`,
      { headers, keepalive: true }
    );
    const repliesRes = await fetch(
      `${DB_URL}/replies?select=reply,created_at&order=created_at.desc&limit=50`,
      { headers, keepalive: true }
    );

    if (!postsRes.ok || !repliesRes.ok) {
      const postsStatus = postsRes.status;
      const repliesStatus = repliesRes.status;
      let postsErrText = '';
      let repliesErrText = '';
      try { postsErrText = await postsRes.text(); } catch (_) { }
      try { repliesErrText = await repliesRes.text(); } catch (_) { }

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
    ].sort(() => Math.random() - 0.5);

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate',
      },
    });
  } catch (e) {
    console.error('posts API error:', e);
    return json({ message: 'Internal Server Error' }, 500);
  }
}
