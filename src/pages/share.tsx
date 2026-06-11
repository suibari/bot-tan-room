import { useEffect } from 'react';
import { useRouter } from 'next/router';

// OGP はルートレベルの Cloudflare Pages Function (_middleware.ts) で提供
// ブラウザで開いたユーザーはトップページへリダイレクト
export default function SharePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null;
}
