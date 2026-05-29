import { useEffect, useState } from 'react';
import type { DiagnosisResult } from '@/pages/api/fortune';

type Props = {
  name: string;
  fortune: DiagnosisResult;
  lang: 'ja' | 'en';
  isSpeaking?: boolean;
  flat?: boolean;
};

const LABELS = {
  ja: {
    heading: 'botたんからのメッセージ',
    shareX: 'X でシェア',
    shareBsky: 'Bluesky でシェア',
  },
  en: {
    heading: 'A Message from bot-tan',
    shareX: 'Share on X',
    shareBsky: 'Share on Bluesky',
  },
};

export function FortuneCard({ name, fortune, lang, isSpeaking = false, flat = false }: Props) {
  const l = LABELS[lang];
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://guestbook.suibari.com';

  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    
    // 診断結果データを Vercel KV に保存するためのAPI呼び出し
    const saveShareData = async () => {
      try {
        const response = await fetch('/api/share/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            analysis_ja: fortune.analysis_ja,
            analysis_en: fortune.analysis_en,
            comparisons: fortune.comparisons,
            lang,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { id: string };
          if (active && data.id) {
            setShareId(data.id);
            console.log('[FortuneCard] Successfully generated short share ID:', data.id);
          }
        } else {
          console.error('[FortuneCard] API respond with error status:', response.status);
        }
      } catch (error) {
        console.error('[FortuneCard] Failed to save share data to KV:', error);
      }
    };

    // 新たな診断や設定が渡されたら新しくIDを取得する
    saveShareData();

    return () => {
      active = false;
    };
  }, [name, fortune, lang]);

  const analysis = lang === 'ja' ? fortune.analysis_ja : fortune.analysis_en;
  const comparisons = fortune.comparisons.map((c) => ({
    category: lang === 'ja' ? c.category_ja : c.category_en,
    value: lang === 'ja' ? c.value_ja : c.value_en,
  }));

  const shareParams = new URLSearchParams({
    name,
    analysis,
    c1: `${comparisons[0].category}／${comparisons[0].value}`,
    c2: `${comparisons[1].category}／${comparisons[1].value}`,
    c3: `${comparisons[2].category}／${comparisons[2].value}`,
    lang,
  });

  // Vercel KV からの短縮IDがある場合はそれを使用、無い場合はフォールバックとして従来の長大なクエリパラメータを使用
  const shareUrl = shareId
    ? `${BASE}/share?id=${shareId}`
    : `${BASE}/share?${shareParams.toString()}`;

  const compSummary = comparisons.map((c) => `${c.category}: ${c.value}`).join(' / ');
  const shareText =
    lang === 'ja'
      ? `${name}の全肯定診断 🌸\n${analysis}\n\n${compSummary}\n\nBotたんのお部屋で診断してもらった👉 ${shareUrl}`
      : `${name}'s diagnosis from Bot-tan's Room 🌸\n${analysis}\n\n${compSummary}\n\nVisit Bot-tan's Room 👉 ${shareUrl}`;

  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const bskyShareUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;

  return (
    <div
      className="w-full"
      style={
        flat
          ? { background: 'transparent', border: 'none', boxShadow: 'none' }
          : {
              background: 'rgba(255, 255, 255, 0.65)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid rgba(255, 255, 255, 0.55)',
              boxShadow: '0 10px 30px rgba(15, 32, 67, 0.05)',
              borderRadius: '1.8rem',
              overflow: 'hidden',
            }
      }
    >
      <div style={{ padding: flat ? '0' : '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {/* heading */}
        <p className="text-slate-500 text-xs font-black tracking-widest uppercase" style={{ color: 'rgba(15, 32, 67, 0.6)' }}>
          {l.heading} — {name}
        </p>

        {/* analysis text */}
        <p
          className="text-slate-800 text-base sm:text-lg leading-relaxed font-bold animate-fadeIn"
          style={{ borderLeft: '4px solid #3a9bd5', paddingLeft: '16px', color: '#1e293b' }}
        >
          {analysis}
        </p>

        {/* speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center gap-2 py-1">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="block w-1.5 h-4 rounded-full bg-sky-500"
                  style={{ animation: `bar-bounce 0.9s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
            </span>
            <span className="text-sky-600 font-extrabold text-xs">
              {lang === 'ja' ? '読み上げ中...' : 'Speaking...'}
            </span>
            <style jsx>{`
              @keyframes bar-bounce {
                0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
                50%       { transform: scaleY(1);   opacity: 1;   }
              }
            `}</style>
          </div>
        )}

        {/* comparisons pills */}
        <div className="flex flex-wrap pt-1" style={{ gap: '6px' }}>
          {comparisons.map(({ category, value }) => (
            <span
              key={category}
              className="text-xs font-bold px-4 py-1.5 rounded-full shadow-sm"
              style={{
                background: 'rgba(58, 155, 213, 0.1)',
                border: '1.5px solid rgba(58, 155, 213, 0.25)',
                color: 'rgba(15, 32, 67, 0.85)',
              }}
            >
              {category}：{value}
            </span>
          ))}
        </div>

        {/* share buttons */}
        <div className="flex gap-3 pt-2" style={{ display: 'flex', gap: '10px' }}>
          <a
            href={xShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-sm font-extrabold rounded-full shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: '9999px' }}
          >
            {l.shareX}
          </a>
          <a
            href={bskyShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-sm font-extrabold rounded-full shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: '#0085ff', color: '#fff', padding: '10px 16px', borderRadius: '9999px' }}
          >
            {l.shareBsky}
          </a>
        </div>
      </div>
    </div>
  );
}
