import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { getJSTHour, interpolateBackground } from '@/utils/timeBasedBackground';

export default function CallbackPage() {
  const router = useRouter();
  const [gradient, setGradient] = useState<string>(
    'linear-gradient(180deg, #3a9bd5 0%, #74c0e8 45%, #b0ddf5 100%)'
  );

  useEffect(() => {
    const update = () => setGradient(interpolateBackground(getJSTHour()));
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: gradient,
        transition: "background 1s ease-in-out",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "4px solid rgba(255,255,255,0.3)",
          borderTopColor: "#fff",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'ja', ['common'])),
  },
});
