import { useEffect, useRef, useState } from 'react';
import { getJSTHour, interpolateBackground } from '@/utils/timeBasedBackground';

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
  const blur = 1.0 + Math.random() * 1.5;
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
              color: 'rgba(255, 255, 255, 0.75)',
              background: 'none',
              border: 'none',
              padding: '0.25em 0.5em',
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
          22%  { opacity: 0.35; transform: translateY(0) scale(1); }
          78%  { opacity: 0.35; transform: translateY(0) scale(1); }
          100% { opacity: 0;    transform: translateY(-12px) scale(0.95); }
        }
      `}</style>
    </>
  );
}
