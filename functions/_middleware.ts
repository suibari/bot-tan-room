/// <reference types="@cloudflare/workers-types" />
import { Redis } from '@upstash/redis/cloudflare';

interface Env {
  VRM_BOT_KV_REST_API_URL: string;
  VRM_BOT_KV_REST_API_TOKEN: string;
}

// share ページの OGP を提供するミドルウェア
// /share, /en/share, /ja/share (末尾スラッシュ有無両対応) に対応
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, ''); // 末尾スラッシュ除去

  const isSharePath =
    path === '/share' || path === '/en/share' || path === '/ja/share';
  if (!isSharePath) {
    return next();
  }

  const BASE = url.origin;
  const id = url.searchParams.get('id');
  const langFromPath: 'ja' | 'en' = path.startsWith('/ja') ? 'ja' : 'en';

  let name = 'you';
  let analysis = '';
  let c1 = '', c2 = '', c3 = '';
  let lang: 'ja' | 'en' = langFromPath;

  if (id && env.VRM_BOT_KV_REST_API_URL && env.VRM_BOT_KV_REST_API_TOKEN) {
    try {
      const redis = new Redis({
        url: env.VRM_BOT_KV_REST_API_URL,
        token: env.VRM_BOT_KV_REST_API_TOKEN,
      });

      const data = await redis.get<{
        name: string;
        analysis_ja: string;
        analysis_en: string;
        comparisons: Array<{
          category_ja: string; value_ja: string;
          category_en: string; value_en: string;
        }>;
        lang: 'ja' | 'en';
      }>(`share:${id}`);

      if (data && typeof data === 'object') {
        name = String(data.name ?? 'you').slice(0, 30);
        lang = data.lang === 'en' ? 'en' : 'ja';
        const rawAnalysis = String(lang === 'ja' ? (data.analysis_ja ?? '') : (data.analysis_en ?? ''));
        analysis = rawAnalysis.length > 130 ? rawAnalysis.slice(0, 127) + '...' : rawAnalysis;

        if (Array.isArray(data.comparisons) && data.comparisons.length >= 3) {
          const comps = data.comparisons;
          c1 = lang === 'ja' ? `${comps[0].category_ja}／${comps[0].value_ja}` : `${comps[0].category_en}／${comps[0].value_en}`;
          c2 = lang === 'ja' ? `${comps[1].category_ja}／${comps[1].value_ja}` : `${comps[1].category_en}／${comps[1].value_en}`;
          c3 = lang === 'ja' ? `${comps[2].category_ja}／${comps[2].value_ja}` : `${comps[2].category_en}／${comps[2].value_en}`;
        }
      }
    } catch (e) {
      console.error('[Share Middleware] Failed to fetch share data:', e);
    }
  }

  const ogImageUrl = `${BASE}/api/og/?${new URLSearchParams({ name, analysis, c1, c2, c3, lang })}`;
  const title = lang === 'ja'
    ? `${name}さんとお部屋で話したよ — bot-tan`
    : `${name} talked in Bot-tan's Room`;

  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(analysis)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(analysis)}">
  <meta property="og:image" content="${esc(ogImageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${esc(ogImageUrl)}">
  <meta http-equiv="refresh" content="0; url=/">
</head>
<body>
  <script>window.location.replace('/');</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
