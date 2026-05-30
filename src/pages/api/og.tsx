import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = { runtime: 'edge' };

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? 'you').slice(0, 30);

  const rawAnalysis = searchParams.get('analysis') ?? '';
  const analysis = rawAnalysis.length > 130 ? rawAnalysis.slice(0, 127) + '...' : rawAnalysis;

  const c1 = searchParams.get('c1') ?? '';
  const c2 = searchParams.get('c2') ?? '';
  const c3 = searchParams.get('c3') ?? '';
  const lang = searchParams.get('lang') === 'ja' ? 'ja' : 'en';

  const title = lang === 'ja' ? 'botたんのお部屋' : "Bot-tan's Room";
  const footer = '全肯定botたん on Bluesky @bot-tan.suibari.com';

  const comparisons = [c1, c2, c3].filter(Boolean);

  // ogp.png を背景に使う。半透明の暗色グラデーションを重ねてテキストを読みやすくする
  const host = new URL(req.url).origin;
  const bgImageUrl = `${host}/ogp.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          backgroundImage: [
            'linear-gradient(rgba(4,2,20,0.78), rgba(4,2,20,0.78))',
            `url(${bgImageUrl})`,
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* header */}
        <div
          style={{
            color: 'rgba(180,210,255,0.7)',
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
            color: 'rgba(255,255,255,0.92)',
            fontSize: 24,
            lineHeight: 1.6,
            marginTop: 20,
            borderLeft: '4px solid rgba(160,180,255,0.8)',
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
                  background: 'rgba(160,130,255,0.30)',
                  border: '1px solid rgba(160,130,255,0.6)',
                  borderRadius: 999,
                  color: 'rgba(220,210,255,0.98)',
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
            color: 'rgba(160,180,255,0.75)',
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
