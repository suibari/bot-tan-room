import { useEffect, useRef, useState } from 'react';

type Post = { text: string; created_at: string };

// --- テキストキュー: シャッフルしながら順番に使い、重複を防ぐ ---
let queue: string[] = [];
let queueCursor = 0;

function initQueue(posts: Post[]) {
  queue = posts.map((p) => p.text.slice(0, 60)).sort(() => Math.random() - 0.5);
  queueCursor = 0;
}

function nextText(): string {
  if (queue.length === 0) return '';
  if (queueCursor >= queue.length) {
    queue = [...queue].sort(() => Math.random() - 0.5);
    queueCursor = 0;
  }
  return queue[queueCursor++];
}

const MAX_CLOUDS = 18;

// --- DOM を直接操作してアニメーションを再起動する ---
// React state を経由しないので、他の cloud に一切影響しない
function restartCloudAnimation(el: HTMLSpanElement, delay: number) {
  const x = 2 + Math.random() * 84;
  const y = 2 + Math.random() * 78;
  const size = 11 + Math.random() * 8;
  const blur = Math.random() * 1.0;
  const duration = 15000 + Math.random() * 10000;
  const safeDelay = Math.max(delay, 800); // 最低 800ms: opacity:0 フラッシュを防ぐ

  // テキスト・位置・サイズを更新
  el.textContent = nextText();
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  el.style.fontSize = `${size}px`;
  el.style.filter = `blur(${blur}px)`;

  // アニメーションを強制リセット → 再開
  // animation を 'none' にして offsetWidth でリフローを強制することで
  // ブラウザが同一要素のアニメーションをゼロからやり直す
  el.style.animation = 'none';
  el.style.animationDelay = '';
  el.style.animationDuration = '';
  void el.offsetWidth; // force reflow — この行が重要
  el.style.animationDuration = `${duration}ms`;
  el.style.animationDelay = `${safeDelay}ms`;
  el.style.animation = `cloud-fade ease-in-out both`;
  el.style.animationDuration = `${duration}ms`;
  el.style.animationDelay = `${safeDelay}ms`;
}

// --- グラジェント補間 ---
interface ColorStop { r: number; g: number; b: number; }
interface GradientKeyframe { hour: number; colors: [ColorStop, ColorStop, ColorStop]; }

const gradientKeyframes: GradientKeyframe[] = [
  { hour: 2,    colors: [{ r: 5,   g: 7,   b: 10  }, { r: 12,  g: 21,  b: 36  }, { r: 7,   g: 26,  b: 29  }] },
  { hour: 5,    colors: [{ r: 42,  g: 43,  b: 77  }, { r: 142, g: 111, b: 158 }, { r: 255, g: 202, b: 140 }] },
  { hour: 7.5,  colors: [{ r: 255, g: 211, b: 182 }, { r: 214, g: 228, b: 255 }, { r: 168, g: 230, b: 207 }] },
  { hour: 12,   colors: [{ r: 58,  g: 155, b: 213 }, { r: 116, g: 192, b: 232 }, { r: 155, g: 246, b: 255 }] },
  { hour: 15.5, colors: [{ r: 93,  g: 162, b: 213 }, { r: 161, g: 195, b: 209 }, { r: 249, g: 241, b: 240 }] },
  { hour: 18,   colors: [{ r: 74,  g: 53,  b: 79  }, { r: 255, g: 126, b: 103 }, { r: 255, g: 191, b: 105 }] },
  { hour: 19.5, colors: [{ r: 27,  g: 25,  b: 71  }, { r: 92,  g: 42,  b: 117 }, { r: 179, g: 92,  b: 117 }] },
  { hour: 22,   colors: [{ r: 11,  g: 14,  b: 20  }, { r: 19,  g: 34,  b: 55  }, { r: 13,  g: 39,  b: 41  }] },
];

function getJSTHour(): number {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utc + 3600000 * 9);
  return jst.getHours() + jst.getMinutes() / 60 + jst.getSeconds() / 3600;
}

function interpolateBackground(hour: number): string {
  const sorted = [...gradientKeyframes].sort((a, b) => a.hour - b.hour);
  let startKf = sorted[sorted.length - 1];
  let endKf = sorted[0];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (hour >= sorted[i].hour && hour < sorted[i + 1].hour) {
      startKf = sorted[i];
      endKf = sorted[i + 1];
      break;
    }
  }
  let t = 0;
  if (startKf.hour <= endKf.hour) {
    t = (hour - startKf.hour) / (endKf.hour - startKf.hour);
  } else {
    const totalDist = (24 - startKf.hour) + endKf.hour;
    const currentDist = hour >= startKf.hour ? (hour - startKf.hour) : (24 - startKf.hour + hour);
    t = currentDist / totalDist;
  }
  const stops = startKf.colors.map((sc, i) => {
    const ec = endKf.colors[i];
    const r = Math.round(sc.r + (ec.r - sc.r) * t);
    const g = Math.round(sc.g + (ec.g - sc.g) * t);
    const b = Math.round(sc.b + (ec.b - sc.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  });
  return `linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`;
}

export function BackgroundPosts() {
  const [gradient, setGradient] = useState<string>(
    'linear-gradient(180deg, #3a9bd5 0%, #74c0e8 45%, #b0ddf5 100%)'
  );
  // cloud span への ref 配列 — React state は使わない
  const poolRef = useRef<(HTMLSpanElement | null)[]>(Array(MAX_CLOUDS).fill(null));
  const initializedRef = useRef(false);

  // --- グラジェント更新（10秒ごと）---
  useEffect(() => {
    const update = () => setGradient(interpolateBackground(getJSTHour()));
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, []);

  // --- posts 取得 → アニメーション開始 ---
  useEffect(() => {
    const startAll = (posts: Post[]) => {
      if (initializedRef.current) {
        // 2回目以降はキューだけ更新して既存アニメーションをそのまま続ける
        initQueue(posts);
        return;
      }
      initQueue(posts);
      // staggered で各 span のアニメーションを開始
      poolRef.current.forEach((el, i) => {
        if (!el) return;
        restartCloudAnimation(el, i * 1200);
      });
      initializedRef.current = true;
    };

    const load = () =>
      fetch('/api/posts')
        .then((r) => r.json())
        .then((data: Post[]) => {
          if (Array.isArray(data) && data.length > 0) startAll(data);
        })
        .catch(() => {});

    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Dynamic JST-based gradient background */}
      <div
        className="absolute inset-0 -z-20 transition-all duration-1000 ease-in-out"
        style={{ background: gradient }}
      />

      {/* 固定数の cloud pool — React state で追加/削除せず DOM ref で直接制御 */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none select-none">
        {Array.from({ length: MAX_CLOUDS }, (_, i) => (
          <span
            key={i}
            ref={(el) => { poolRef.current[i] = el; }}
            className="cloud-item absolute whitespace-nowrap font-bold text-center flex items-center justify-center"
            onAnimationEnd={(e) => {
              // React state を一切変更せず、この span のみを直接更新して再スタート
              restartCloudAnimation(e.currentTarget as HTMLSpanElement, 800);
            }}
            style={{
              // 初期は非表示（posts ロード後に restartCloudAnimation が設定する）
              opacity: 0,
              color: 'rgba(24, 43, 73, 0.85)',
              background: 'rgba(255, 255, 255, 0.52)',
              backdropFilter: 'blur(12px)',
              border: '1.5px solid rgba(255, 255, 255, 0.45)',
              borderRadius: '9999px',
              padding: '0.45em 1.1em',
              boxShadow: '0 8px 32px -4px rgba(31, 76, 107, 0.05)',
              willChange: 'opacity, transform',
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        .cloud-item {
          animation: cloud-fade ease-in-out both;
          animation-fill-mode: backwards;
        }
        @keyframes cloud-fade {
          0%   { opacity: 0;    transform: translateY(12px) scale(0.95); }
          22%  { opacity: 0.85; transform: translateY(0) scale(1); }
          78%  { opacity: 0.85; transform: translateY(0) scale(1); }
          100% { opacity: 0;    transform: translateY(-12px) scale(0.95); }
        }
      `}</style>
    </>
  );
}
