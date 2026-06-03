import { useState } from 'react';
import { sendGAEvent } from "@next/third-parties/google";
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
    sharing: '準備中...',
  },
  en: {
    heading: 'A Message from bot-tan',
    shareX: 'Share on X',
    shareBsky: 'Share on Bluesky',
    sharing: 'Preparing...',
  },
};

export function FortuneCard({ name, fortune, lang, isSpeaking = false, flat = false }: Props) {
  const l = LABELS[lang];
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://room-bot-tan.suibari.com';

  // KV保存は「シェアボタンを押したとき」だけ行う
  const [isSharingX, setIsSharingX] = useState(false);
  const [isSharingBsky, setIsSharingBsky] = useState(false);

  const analysis = lang === 'ja' ? fortune.analysis_ja : fortune.analysis_en;
  const comparisons = fortune.comparisons.map((c) => ({
    category: lang === 'ja' ? c.category_ja : c.category_en,
    value: lang === 'ja' ? c.value_ja : c.value_en,
  }));

  const compSummary = comparisons.map((c) => `${c.category}: ${c.value}`).join(' / ');

  /** KVに保存してシェアURLを生成する。失敗時はフォールバックの長いURLを返す */
  const buildShareUrl = async (): Promise<string> => {
    const fallbackParams = new URLSearchParams({
      name,
      analysis,
      c1: `${comparisons[0].category}／${comparisons[0].value}`,
      c2: `${comparisons[1].category}／${comparisons[1].value}`,
      c3: `${comparisons[2].category}／${comparisons[2].value}`,
      lang,
    });
    const fallbackUrl = `${BASE}/share?${fallbackParams.toString()}`;

    try {
      const response = await fetch('/api/share/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        if (data.id) {
          console.log('[FortuneCard] Generated short share ID:', data.id);
          return `${BASE}/share?id=${data.id}`;
        }
      }
    } catch (error) {
      console.error('[FortuneCard] KV save failed, falling back to long URL:', error);
    }

    return fallbackUrl;
  };

  const handleShareX = async () => {
    if (isSharingX) return;
    setIsSharingX(true);
    try {
      sendGAEvent('event', 'share', { method: 'x' });
      const shareUrl = await buildShareUrl();
      const shareText =
        lang === 'ja'
          ? `${name}さんとお部屋で話したよ 🌸\n\n${compSummary}\n\nBotたんのお部屋 👉 ${shareUrl}\n\n#botたんのお部屋`
          : `${name} talked in Bot-tan's Room 🌸\n\n${compSummary}\n\nVisit Bot-tan's Room 👉 ${shareUrl}\n\n#BottanRoom`;
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank');
    } finally {
      setIsSharingX(false);
    }
  };

  const handleShareBsky = async () => {
    if (isSharingBsky) return;
    setIsSharingBsky(true);
    try {
      sendGAEvent('event', 'share', { method: 'bluesky' });
      const shareUrl = await buildShareUrl();
      const shareText =
        lang === 'ja'
          ? `${name}さんとお部屋で話したよ 🌸\n${analysis}\n\n${compSummary}\n\nBotたんのお部屋 👉 ${shareUrl}\n\n#botたんのお部屋`
          : `${name} talked in Bot-tan's Room 🌸\n${analysis}\n\n${compSummary}\n\nVisit Bot-tan's Room 👉 ${shareUrl}\n\n#BottanRoom`;
      window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`, '_blank');
    } finally {
      setIsSharingBsky(false);
    }
  };

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
          className="text-slate-800 fortune-analysis-text leading-relaxed font-bold animate-fadeIn"
          style={{ borderLeft: '4px solid #3a9bd5', paddingLeft: '16px', color: '#1e293b' }}
        >
          {analysis}
        </p>

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

        {/* share buttons — KV save happens here, on click */}
        <div className="flex pt-2" style={{ gap: '8px' }}>
          <button
            onClick={handleShareX}
            disabled={isSharingX || isSharingBsky}
            className="flex-1 min-w-0 text-center font-extrabold rounded-full shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
            style={{
              background: '#0f172a',
              color: '#fff',
              padding: '10px 12px',
              borderRadius: '9999px',
              fontSize: 'clamp(11px, 3vw, 14px)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {isSharingX ? l.sharing : l.shareX}
          </button>
          <button
            onClick={handleShareBsky}
            disabled={isSharingX || isSharingBsky}
            className="flex-1 min-w-0 text-center font-extrabold rounded-full shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
            style={{
              background: '#0085ff',
              color: '#fff',
              padding: '10px 12px',
              borderRadius: '9999px',
              fontSize: 'clamp(11px, 3vw, 14px)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {isSharingBsky ? l.sharing : l.shareBsky}
          </button>
        </div>
      </div>
    </div>
  );
}
