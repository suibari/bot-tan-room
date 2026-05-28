import type { DiagnosisResult } from '@/pages/api/fortune';

type Props = {
  name: string;
  fortune: DiagnosisResult;
  lang: 'ja' | 'en';
  isSpeaking?: boolean;
};

const LABELS = {
  ja: {
    heading: '全肯定診断結果',
    shareX: 'X でシェア',
    shareBsky: 'Bluesky でシェア',
  },
  en: {
    heading: 'Personality Diagnosis',
    shareX: 'Share on X',
    shareBsky: 'Share on Bluesky',
  },
};

export function FortuneCard({ name, fortune, lang, isSpeaking = false }: Props) {
  const l = LABELS[lang];
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://guestbook.suibari.com';

  const ogParams = new URLSearchParams({
    name,
    analysis: fortune.analysis,
    c1: `${fortune.comparisons[0].category}／${fortune.comparisons[0].value}`,
    c2: `${fortune.comparisons[1].category}／${fortune.comparisons[1].value}`,
    c3: `${fortune.comparisons[2].category}／${fortune.comparisons[2].value}`,
    lang,
  });
  void ogParams; // OGP は index.tsx の <Head> で使用

  const shareUrl = BASE;
  const compSummary = fortune.comparisons.map((c) => `${c.category}: ${c.value}`).join(' / ');
  const shareText =
    lang === 'ja'
      ? `${name}の全肯定診断 🔮\n${fortune.analysis}\n\n${compSummary}\n\nbotたんに診断してもらおう👉 ${shareUrl}`
      : `${name}'s personality diagnosis 🔮\n${fortune.analysis}\n\n${compSummary}\n\nGet diagnosed by bot-tan 👉 ${shareUrl}`;

  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const bskyShareUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden shadow-2xl"
      style={{
        background: 'rgba(10, 20, 50, 0.72)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(120,160,255,0.25)',
      }}
    >
      <div className="p-4 sm:p-5 space-y-3">
        {/* heading */}
        <p className="text-white/60 text-xs tracking-widest uppercase">
          {l.heading} — {name}
        </p>

        {/* analysis text */}
        <p
          className="text-white text-sm sm:text-base leading-relaxed"
          style={{ borderLeft: '3px solid rgba(150,180,255,0.6)', paddingLeft: '12px' }}
        >
          {fortune.analysis}
        </p>

        {/* speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center gap-2 py-1">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="block w-1.5 h-4 rounded-full bg-purple-400"
                  style={{ animation: `bar-bounce 0.9s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
            </span>
            <span className="text-purple-300 text-xs">
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
        <div className="flex flex-wrap gap-2 pt-1">
          {fortune.comparisons.map(({ category, value }) => (
            <span
              key={category}
              className="text-xs px-3 py-1 rounded-full"
              style={{
                background: 'rgba(130,100,255,0.22)',
                border: '1px solid rgba(150,120,255,0.4)',
                color: 'rgba(210,200,255,0.95)',
              }}
            >
              {category}：{value}
            </span>
          ))}
        </div>

        {/* share buttons */}
        <div className="flex gap-2 pt-1">
          <a
            href={xShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs font-bold py-2 px-3 rounded-full transition-opacity hover:opacity-80 active:opacity-60"
            style={{ background: '#000', color: '#fff' }}
          >
            {l.shareX}
          </a>
          <a
            href={bskyShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs font-bold py-2 px-3 rounded-full transition-opacity hover:opacity-80 active:opacity-60"
            style={{ background: '#0085ff', color: '#fff' }}
          >
            {l.shareBsky}
          </a>
        </div>
      </div>
    </div>
  );
}
