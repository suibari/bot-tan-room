import type { FortuneResult } from '@/pages/api/fortune';

type Props = {
  name: string;
  fortune: FortuneResult;
  lang: 'ja' | 'en';
  isSpeaking?: boolean;
};

const LABELS = {
  ja: {
    animal: '🐾 ラッキーアニマル',
    music: '🎵 ラッキーミュージック',
    zodiac: '⭐ ラッキー星座',
    shareX: 'X でシェア',
    shareBsky: 'Bluesky でシェア',
  },
  en: {
    animal: '🐾 Lucky Animal',
    music: '🎵 Lucky Music',
    zodiac: '⭐ Lucky Zodiac',
    shareX: 'Share on X',
    shareBsky: 'Share on Bluesky',
  },
};

export function FortuneCard({ name, fortune, lang, isSpeaking = false }: Props) {
  const l = LABELS[lang];
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://guestbook.suibari.com';

  const ogParams = new URLSearchParams({
    name,
    message: fortune.message,
    lucky: [fortune.lucky_animal, fortune.lucky_music, fortune.lucky_zodiac].join(','),
    lang,
  });

  const shareUrl = BASE;
  const shareText =
    lang === 'ja'
      ? `${name}の今日の運勢 🌟\n${fortune.message}\n\n全肯定botたんに占ってもらおう👉 ${shareUrl}`
      : `${name}'s fortune today 🌟\n${fortune.message}\n\nGet your fortune from bot-tan 👉 ${shareUrl}`;

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
        {/* name */}
        <p className="text-white/60 text-xs tracking-widest uppercase">
          {lang === 'ja' ? '今日の運勢' : "Today's Fortune"} — {name}
        </p>

        {/* message */}
        <p
          className="text-white text-sm sm:text-base leading-relaxed"
          style={{ borderLeft: '3px solid rgba(150,180,255,0.6)', paddingLeft: '12px' }}
        >
          {fortune.message}
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

        {/* lucky pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { label: l.animal, value: fortune.lucky_animal },
            { label: l.music, value: fortune.lucky_music },
            { label: l.zodiac, value: fortune.lucky_zodiac },
          ].map(({ label, value }) => (
            <span
              key={label}
              className="text-xs px-3 py-1 rounded-full"
              style={{
                background: 'rgba(130,100,255,0.22)',
                border: '1px solid rgba(150,120,255,0.4)',
                color: 'rgba(210,200,255,0.95)',
              }}
            >
              {label}: {value}
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
