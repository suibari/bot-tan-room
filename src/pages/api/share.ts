import { Redis } from '@upstash/redis/cloudflare';
import type { NextApiRequest, NextApiResponse } from 'next';

export const runtime = 'edge';

const redis = new Redis({
  url: process.env.VRM_BOT_KV_REST_API_URL!,
  token: process.env.VRM_BOT_KV_REST_API_TOKEN!,
});

type Comparison = {
  category_ja: string;
  value_ja: string;
  category_en: string;
  value_en: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { name, analysis_ja, analysis_en, comparisons, lang } = req.body as {
      name?: string;
      analysis_ja?: string;
      analysis_en?: string;
      comparisons?: Comparison[];
      lang?: 'ja' | 'en';
    };

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Invalid or missing name' });
    }
    if ((!analysis_ja || typeof analysis_ja !== 'string') && (!analysis_en || typeof analysis_en !== 'string')) {
      return res.status(400).json({ message: 'Invalid or missing analysis content' });
    }

    const safeName = name.slice(0, 30);
    const safeAnalysisJa = (analysis_ja ?? '').slice(0, 500);
    const safeAnalysisEn = (analysis_en ?? '').slice(0, 500);
    const safeLang = lang === 'en' ? 'en' : 'ja';

    const safeComparisons: Comparison[] = [];
    if (Array.isArray(comparisons)) {
      for (const item of comparisons.slice(0, 3)) {
        if (item && typeof item === 'object') {
          safeComparisons.push({
            category_ja: String(item.category_ja ?? '').slice(0, 20),
            value_ja: String(item.value_ja ?? '').slice(0, 50),
            category_en: String(item.category_en ?? '').slice(0, 20),
            value_en: String(item.value_en ?? '').slice(0, 50),
          });
        }
      }
    }

    const id = crypto.randomUUID();
    const key = `share:${id}`;
    await redis.set(
      key,
      {
        name: safeName,
        analysis_ja: safeAnalysisJa,
        analysis_en: safeAnalysisEn,
        comparisons: safeComparisons,
        lang: safeLang,
      },
      { ex: 30 * 24 * 60 * 60 },
    );

    console.log(`[API share] Saved share data to KV with key: ${key}`);

    return res.status(200).json({ id });
  } catch (error) {
    console.error('[API share] Error saving share data:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
