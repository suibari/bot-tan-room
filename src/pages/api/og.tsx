import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = { runtime: 'edge' };

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? 'you').slice(0, 30);
  const analysis = (searchParams.get('analysis') ?? '').slice(0, 100);
  const c1 = searchParams.get('c1') ?? '';
  const c2 = searchParams.get('c2') ?? '';
  const c3 = searchParams.get('c3') ?? '';
  const lang = searchParams.get('lang') === 'ja' ? 'ja' : 'en';

  const title = lang === 'ja' ? '全肯定診断' : 'Personality Diagnosis';
  const footer = 'bot-tan on Bluesky @bot-tan.bsky.social';

  const comparisons = [c1, c2, c3].filter(Boolean);

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

        {/* analysis text */}
        <div
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: 26,
            lineHeight: 1.7,
            marginTop: 24,
            borderLeft: '4px solid rgba(160,180,255,0.7)',
            paddingLeft: 24,
            maxWidth: 960,
            display: 'flex',
          }}
        >
          {analysis}
        </div>

        {/* comparison pills */}
        {comparisons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            {comparisons.map((item, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(160,130,255,0.25)',
                  border: '1px solid rgba(160,130,255,0.5)',
                  borderRadius: 999,
                  color: 'rgba(210,200,255,0.95)',
                  fontSize: 22,
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
