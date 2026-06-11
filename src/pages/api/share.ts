import { Redis } from '@upstash/redis/cloudflare';
import type { NextRequest } from 'next/server';

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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ message: 'Method Not Allowed' }, 405);
  }

  try {
    const { name, analysis_ja, analysis_en, comparisons, lang } = await req.json() as {
      name?: string;
      analysis_ja?: string;
      analysis_en?: string;
      comparisons?: Comparison[];
      lang?: 'ja' | 'en';
    };

    if (!name || typeof name !== 'string') {
      return json({ message: 'Invalid or missing name' }, 400);
    }
    if ((!analysis_ja || typeof analysis_ja !== 'string') && (!analysis_en || typeof analysis_en !== 'string')) {
      return json({ message: 'Invalid or missing analysis content' }, 400);
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

    return json({ id });
  } catch (error) {
    console.error('[API share] Error saving share data:', error);
    return json({ message: 'Internal Server Error' }, 500);
  }
}
