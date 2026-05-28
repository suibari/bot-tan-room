import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = { runtime: 'edge' };

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? 'you').slice(0, 30);
  const message = (searchParams.get('message') ?? '').slice(0, 120);
  const lucky = searchParams.get('lucky') ?? '';
  const lang = searchParams.get('lang') === 'ja' ? 'ja' : 'en';

  const title = lang === 'ja' ? '今日の運勢' : "Today's Fortune";
  const footer = lang === 'ja'
    ? 'bot-tan on Bluesky @bot-tan.bsky.social'
    : 'bot-tan on Bluesky @bot-tan.bsky.social';

  const luckyItems = lucky
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(160deg, #0f0c29, #302b63, #24243e)',
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* header */}
        <div
          style={{
            color: 'rgba(180,210,255,0.6)',
            fontSize: 22,
            letterSpacing: 6,
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          {title} — bot-tan
        </div>

        {/* name */}
        <div
          style={{
            color: '#fff',
            fontSize: 58,
            fontWeight: 700,
            marginTop: 16,
            display: 'flex',
          }}
        >
          {name}
        </div>

        {/* message */}
        <div
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: 28,
            lineHeight: 1.7,
            marginTop: 24,
            borderLeft: '4px solid rgba(160,180,255,0.7)',
            paddingLeft: 24,
            maxWidth: 960,
            display: 'flex',
          }}
        >
          {message}
        </div>

        {/* lucky pills */}
        {luckyItems.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            {luckyItems.map((item, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(160,130,255,0.25)',
                  border: '1px solid rgba(160,130,255,0.5)',
                  borderRadius: 999,
                  color: 'rgba(210,200,255,0.95)',
                  fontSize: 20,
                  padding: '6px 20px',
                  display: 'flex',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        {/* footer */}
        <div
          style={{
            marginTop: 'auto',
            color: 'rgba(160,180,255,0.7)',
            fontSize: 20,
            display: 'flex',
          }}
        >
          {footer}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
