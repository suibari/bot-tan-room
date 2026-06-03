import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    import('@/features/auth/bskyOAuth')
      .then(({ getBskyOAuthClient }) => getBskyOAuthClient().init())
      .then(() => {
        router.replace('/');
      })
      .catch((e: unknown) => {
        // ライブラリが自身でリダイレクト処理中の場合は干渉しない
        if (e instanceof Error && e.message.includes('Redirecting')) return;
        console.error('[callback] OAuth init error:', e);
        router.replace('/');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'ja', ['common'])),
  },
});
