import { useEffect, useRef, useState } from 'react';

type Post = { text: string; created_at: string };

type CloudItem = {
  id: number;
  text: string;
  x: number;
  y: number;
  size: number;
  blur: number;
  duration: number;
  delay: number;
};

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
    queue = [...queue].sort(() => Math.random() - 0.5); // 終端に達したら再シャッフル
    queueCursor = 0;
  }
  return queue[queueCursor++];
}

let idCounter = 0;

function makeCloud(delay: number): CloudItem {
  return {
    id: idCounter++,
    text: nextText(),
    x: 2 + Math.random() * 84,
    y: 2 + Math.random() * 78,
    size: 11 + Math.random() * 8,
    blur: Math.random() * 1.0,
    duration: 6000 + Math.random() * 6000,
    delay,
  };
}

const MAX_CLOUDS = 18;

export function BackgroundPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [clouds, setClouds] = useState<CloudItem[]>([]);
  const postsRef = useRef<Post[]>([]);

  useEffect(() => {
    const load = () =>
      fetch('/api/posts')
        .then((r) => r.json())
        .then((data: Post[]) => {
          if (Array.isArray(data) && data.length > 0) {
            postsRef.current = data;
            setPosts(data);
          }
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (posts.length === 0) return;

    // キューを初期化してから初期クラウドを生成（300ms ずつずらしてフェードイン）
    initQueue(posts);
    setClouds(Array.from({ length: MAX_CLOUDS }, (_, i) => makeCloud(i * 300)));

    // 定期的に1つずつ差し替え（delay=0 でフラッシュなく即フェードイン）
    const id = setInterval(() => {
      if (postsRef.current.length === 0) return;
      setClouds((prev) => {
        const next = [...prev];
        next[Math.floor(Math.random() * next.length)] = makeCloud(0);
        return next;
      });
    }, 4000);

    return () => clearInterval(id);
  }, [posts]);

  return (
    <>
      {/* 青空グラデーション */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          background: 'linear-gradient(180deg, #3a9bd5 0%, #74c0e8 45%, #b0ddf5 100%)',
        }}
      />

      {/* 雲テキスト */}
      {clouds.length > 0 && (
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none select-none">
          {clouds.map((c) => (
            <span
              key={c.id}
              className="cloud-text absolute whitespace-nowrap font-bold"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                fontSize: `${c.size}px`,
                filter: `blur(${c.blur}px)`,
                animationDuration: `${c.duration}ms`,
                animationDelay: `${c.delay}ms`,
                color: 'rgba(255,255,255,0.92)',
                textShadow:
                  '0 1px 0 rgba(255,255,255,1), 0 2px 8px rgba(30,100,180,0.5), 0 0 20px rgba(255,255,255,0.5)',
              }}
            >
              {c.text}
            </span>
          ))}
        </div>
      )}

      <style jsx global>{`
        .cloud-text {
          /* backwards: delay期間中も opacity:0 を維持 → 明滅しない */
          animation: cloud-fade ease-in-out infinite both;
          animation-fill-mode: backwards;
        }
        @keyframes cloud-fade {
          0%   { opacity: 0;    transform: translateY(5px); }
          18%  { opacity: 0.88; }
          78%  { opacity: 0.88; }
          100% { opacity: 0;    transform: translateY(-10px); }
        }
      `}</style>
    </>
  );
}
