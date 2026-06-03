import { useEffect, useRef } from 'react';

type BubbleState = 'hidden' | 'visible' | 'celebrating';

interface Props {
  state: BubbleState;
  emoji: string;
  pos: { x: number; y: number } | null;
  onHide: () => void;
}

const HEART_DIRECTIONS = [0, 1, 2, 3, 4, 5];
const CELEBRATE_DURATION_MS = 1500;

// CrayonFilterDef は現在不使用だが、将来の再利用のため残す
export function CrayonFilterDef() {
  return null;
}

export default function UtilityBubble({ state, emoji, pos, onHide }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state === 'celebrating') {
      timerRef.current = setTimeout(() => {
        onHide();
      }, CELEBRATE_DURATION_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, onHide]);

  if (state === 'hidden') return null;

  // head右上にオフセット（フォールバックは画面中央右寄り）
  const left = pos ? pos.x + 110 : window.innerWidth * 0.62;
  const top  = pos ? pos.y - 140 : window.innerHeight * 0.08;

  const isCelebrating = state === 'celebrating';

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {/* 吹き出し本体 */}
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          border: '3px solid #222222',
          borderRadius: '16px',
          padding: '14px 20px',
          fontSize: '52px',
          lineHeight: 1,
          animation: isCelebrating
            ? `bubbleOut ${CELEBRATE_DURATION_MS}ms ease-in forwards`
            : 'bubbleIn 250ms ease-out forwards',
          boxShadow: '2px 3px 0px rgba(0,0,0,0.15)',
        }}
      >
        {/* 吹き出しの三角（左下） */}
        <div style={{
          position: 'absolute',
          bottom: '-15px',
          left: '20px',
          width: 0,
          height: 0,
          borderLeft: '9px solid transparent',
          borderRight: '9px solid transparent',
          borderTop: '13px solid #222222',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-11px',
          left: '22px',
          width: 0,
          height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '11px solid #FFFFFF',
        }} />

        {/* 絵文字 */}
        <span role="img">{isCelebrating ? '😍' : emoji}</span>

        {/* ハートパーティクル（celebrating 時のみ） */}
        {isCelebrating && HEART_DIRECTIONS.map((i) => (
          <span
            key={i}
            role="img"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              fontSize: '20px',
              opacity: 1,
              animation: `heartFly${i} ${CELEBRATE_DURATION_MS * 0.8}ms ease-out ${i * 60}ms forwards`,
            }}
          >
            💗
          </span>
        ))}
      </div>
    </div>
  );
}
