import type { NextApiRequest, NextApiResponse } from 'next';
import { getUtilities } from '@/utils/utilityAI';

/**
 * DBからbotたんのバイオリズム（気分や状態など）を取得するAPI
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    console.error('[API mood error]: Cloudflare Access Client ID_DB/Secret_DB not configured in environment variables.');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  // Cloudflare Access および Postgrest 用のヘッダー設定
  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // bot_state テーブルから biorhythm データを取得
    const response = await fetch(
      `${DB_URL}/bot_state?key=eq.biorhythm`,
      { headers, keepalive: true }
    );

    if (!response.ok) {
      const status = response.status;
      let errText = '';
      try { errText = await response.text(); } catch (_) {}
      console.error(`[API mood DB fetch failed]: status=${status}, body=${errText}`);
      throw new Error('DB fetch failed');
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Biorhythm not found' });
    }

    // valueカラムが文字列として格納されている場合を考慮してパースする
    let valueObj = data[0].value;
    if (typeof valueObj === 'string') {
      try {
        valueObj = JSON.parse(valueObj);
      } catch (e) {
        console.error('[API mood parse error]: Failed to parse value column as JSON.', e);
      }
    }

    const energy: number = valueObj?.energy ?? 100;

    // Utility計算（JST基準）
    const jstNow = new Date(Date.now() + 9 * 3600_000);
    const jstHour = jstNow.getUTCHours();
    const jstDay = jstNow.getUTCDay();
    const utilities = getUtilities({ hour: jstHour, isWeekend: jstDay === 0 || jstDay === 6, energy });

    // mood（気分）、status（状態）、energy（エネルギー）などを返却
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({
      mood:       valueObj?.mood    ?? 'わたしは、今日もおつかれさま！',
      mood_en:    valueObj?.mood_en ?? '',
      energy,
      status:     valueObj?.status  ?? 'FreeTime',
      utilities,
      updated_at: data[0].updated_at,
    });
  } catch (e) {
    console.error('mood API error:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
