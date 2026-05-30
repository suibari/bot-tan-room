import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { createClient } from '@vercel/kv';

// ユーザー指定の環境変数 VRM_BOT_* を使って KV クライアントを初期化
const kv = createClient({
  url: process.env.VRM_BOT_KV_REST_API_URL,
  token: process.env.VRM_BOT_KV_REST_API_TOKEN,
});

type Props = {
  ogImageUrl: string;
  title: string;
  description: string;
};

export default function SharePage({ ogImageUrl, title, description }: Props) {
  const router = useRouter();

  // SNSクローラーはJSを実行しないのでHEADのOGPタグを読む
  // ブラウザでこのURLを開いたユーザーはトップページへリダイレクト
  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={ogImageUrl} />
    </Head>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://guestbook.suibari.com';
  const id = query.id ? String(query.id) : null;

  let name = 'you';
  let analysis = '';
  let c1 = '';
  let c2 = '';
  let c3 = '';
  let lang: 'ja' | 'en' = 'ja';
  let hasLoadedFromKV = false;

  if (id) {
    try {
      // Vercel KV から保存された診断データを取得
      const data = await kv.get<{
        name: string;
        analysis_ja: string;
        analysis_en: string;
        comparisons: Array<{
          category_ja: string;
          value_ja: string;
          category_en: string;
          value_en: string;
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
          c1 = lang === 'ja'
            ? `${comps[0].category_ja}／${comps[0].value_ja}`
            : `${comps[0].category_en}／${comps[0].value_en}`;
          c2 = lang === 'ja'
            ? `${comps[1].category_ja}／${comps[1].value_ja}`
            : `${comps[1].category_en}／${comps[1].value_en}`;
          c3 = lang === 'ja'
            ? `${comps[2].category_ja}／${comps[2].value_ja}`
            : `${comps[2].category_en}／${comps[2].value_en}`;
        }
        hasLoadedFromKV = true;
        console.log(`[Share SSR] Successfully loaded share data from KV for ID: ${id}`);
      } else {
        console.warn(`[Share SSR] Share data for ID: ${id} was not found or invalid. Falling back to query params.`);
      }
    } catch (e) {
      console.error('[Share SSR] Failed to fetch share data from KV, falling back to query params:', e);
    }
  }

  // もし KV からのロードがされなかった、またはデータが空だった場合は、
  // 後方互換性のために従来のクエリパラメータを使用する
  if (!hasLoadedFromKV) {
    name = String(query.name ?? 'you').slice(0, 30);
    const rawAnalysis = String(query.analysis ?? '');
    analysis = rawAnalysis.length > 130 ? rawAnalysis.slice(0, 127) + '...' : rawAnalysis;
    c1 = String(query.c1 ?? '');
    c2 = String(query.c2 ?? '');
    c3 = String(query.c3 ?? '');
    lang = query.lang === 'ja' ? 'ja' : 'en';
  }

  const ogImageUrl = `${BASE}/api/og?${new URLSearchParams({ name, analysis, c1, c2, c3, lang })}`;
  const title =
    lang === 'ja' ? `${name}さんとお部屋で話したよ — bot-tan` : `${name} talked in Bot-tan's Room`;
  const description = analysis;

  return { props: { ogImageUrl, title, description } };
};
