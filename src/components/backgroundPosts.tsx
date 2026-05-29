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
    duration: 15000 + Math.random() * 10000,
    delay,
  };
}

const MAX_CLOUDS = 18;

interface ColorStop {
  r: number;
  g: number;
  b: number;
}

interface GradientKeyframe {
  hour: number;
  colors: [ColorStop, ColorStop, ColorStop];
}

const gradientKeyframes: GradientKeyframe[] = [
  { hour: 2, colors: [{ r: 5, g: 7, b: 10 }, { r: 12, g: 21, b: 36 }, { r: 7, g: 26, b: 29 }] },
  { hour: 5, colors: [{ r: 42, g: 43, b: 77 }, { r: 142, g: 111, b: 158 }, { r: 255, g: 202, b: 140 }] },
  { hour: 7.5, colors: [{ r: 255, g: 211, b: 182 }, { r: 214, g: 228, b: 255 }, { r: 168, g: 230, b: 207 }] },
  { hour: 12, colors: [{ r: 58, g: 155, b: 213 }, { r: 116, g: 192, b: 232 }, { r: 155, g: 246, b: 255 }] },
  { hour: 15.5, colors: [{ r: 93, g: 162, b: 213 }, { r: 161, g: 195, b: 209 }, { r: 249, g: 241, b: 240 }] },
  { hour: 18, colors: [{ r: 74, g: 53, b: 79 }, { r: 255, g: 126, b: 103 }, { r: 255, g: 191, b: 105 }] },
  { hour: 19.5, colors: [{ r: 27, g: 25, b: 71 }, { r: 92, g: 42, b: 117 }, { r: 179, g: 92, b: 117 }] },
  { hour: 22, colors: [{ r: 11, g: 14, b: 20 }, { r: 19, g: 34, b: 55 }, { r: 13, g: 39, b: 41 }] },
];

function getJSTHour(): number {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jstDate = new Date(utc + 3600000 * 9);
  const hours = jstDate.getHours();
  const minutes = jstDate.getMinutes();
  const seconds = jstDate.getSeconds();
  return hours + minutes / 60 + seconds / 3600;
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
  
  const stops = startKf.colors.map((startColor, index) => {
    const endColor = endKf.colors[index];
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * t);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * t);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  });
  
  return `linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`;
}

export function BackgroundPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [clouds, setClouds] = useState<CloudItem[]>([]);
  const [gradient, setGradient] = useState<string>('linear-gradient(180deg, #3a9bd5 0%, #74c0e8 45%, #b0ddf5 100%)');
  const postsRef = useRef<Post[]>([]);

  // Update background gradient on mount and every 10 seconds for perfectly smooth transitions
  useEffect(() => {
    const updateBg = () => {
      const hour = getJSTHour();
      setGradient(interpolateBackground(hour));
    };
    updateBg();
    const id = setInterval(updateBg, 10000);
    return () => clearInterval(id);
  }, []);

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

    initQueue(posts);
    setClouds(Array.from({ length: MAX_CLOUDS }, (_, i) => makeCloud(i * 1200)));
  }, [posts]);

  const handleAnimationEnd = (id: number) => {
    setClouds((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      return [...filtered, makeCloud(0)];
    });
  };

  return (
    <>
      {/* Dynamic JST-based gradient background */}
      <div
        className="absolute inset-0 -z-20 transition-all duration-1000 ease-in-out"
        style={{
          background: gradient,
        }}
      />

      {/* Floating clouds formatted as gentle glass capsules */}
      {clouds.length > 0 && (
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none select-none">
          {clouds.map((c) => (
            <span
              key={c.id}
              className="cloud-text absolute whitespace-nowrap font-bold text-center flex items-center justify-center"
              onAnimationEnd={() => handleAnimationEnd(c.id)}
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                fontSize: `${c.size}px`,
                filter: `blur(${c.blur}px)`,
                animationDuration: `${c.duration}ms`,
                animationDelay: `${c.delay}ms`,
                color: 'rgba(24, 43, 73, 0.85)', // gentle charcoal-blue text
                background: 'rgba(255, 255, 255, 0.52)', // soft white frosted glass bubble
                backdropFilter: 'blur(12px)',
                border: '1.5px solid rgba(255, 255, 255, 0.45)',
                borderRadius: '9999px',
                padding: '0.45em 1.1em',
                boxShadow: '0 8px 32px -4px rgba(31, 76, 107, 0.05)',
              }}
            >
              {c.text}
            </span>
          ))}
        </div>
      )}

      <style jsx global>{`
        .cloud-text {
          animation: cloud-fade ease-in-out both;
          animation-fill-mode: backwards;
        }
        @keyframes cloud-fade {
          0%   { opacity: 0;    transform: translateY(12px) scale(0.95); }
          22%  { opacity: 0.85;  transform: translateY(0) scale(1); }
          78%  { opacity: 0.85;  transform: translateY(0) scale(1); }
          100% { opacity: 0;    transform: translateY(-12px) scale(0.95); }
        }
      `}</style>
    </>
  );
}
