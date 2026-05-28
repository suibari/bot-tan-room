import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';

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
  const name = String(query.name ?? 'you').slice(0, 30);
  const analysis = String(query.analysis ?? '').slice(0, 100);
  const c1 = String(query.c1 ?? '');
  const c2 = String(query.c2 ?? '');
  const c3 = String(query.c3 ?? '');
  const lang = query.lang === 'ja' ? 'ja' : 'en';

  const ogImageUrl = `${BASE}/api/og?${new URLSearchParams({ name, analysis, c1, c2, c3, lang })}`;
  const title =
    lang === 'ja' ? `${name}の全肯定診断結果 — bot-tan` : `${name}'s Personality Diagnosis — bot-tan`;
  const description = analysis;

  return { props: { ogImageUrl, title, description } };
};
