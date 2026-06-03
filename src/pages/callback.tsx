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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #3a9bd5 0%, #74bfe8 50%, #9bf6ff 100%)",
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
