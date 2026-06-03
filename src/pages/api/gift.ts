import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAtprotoToken } from '@/lib/jwtVerifier';
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/features/constants/aiModels";
import { BOTTAN_CHARACTER_SETTINGS } from "@/features/constants/bottanCharacterSettings";
import { withGeminiRetry } from '@/lib/geminiRetry';

const GIFT_MAX_CHARS = 30;

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { did } = req.query;
  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    return res.status(401).json({ message: 'Unauthorized session' });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  const dbHeaders: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const giftsRes = await fetch(
      `${DB_URL}/gifts?did=eq.${encodeURIComponent(did)}&order=created_at.desc&limit=5&select=content,created_at`,
      { headers: dbHeaders, keepalive: true }
    );
    if (!giftsRes.ok) {
      throw new Error(`DB fetch failed with status ${giftsRes.status}`);
    }
    const gifts = await giftsRes.json();
    return res.status(200).json({ gifts });
  } catch (e) {
    console.error('[API gift GET error]:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!CF_ID || !CF_SECRET) {
    console.error('[API gift] Cloudflare Access credentials not configured');
    return res.status(500).json({ message: 'Server Configuration Error' });
  }
  if (!apiKey) {
    return res.status(500).json({ message: 'API Key not configured' });
  }

  const { did, content, lang, userName } = req.body;

  if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
    return res.status(400).json({ message: 'Invalid or missing DID' });
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ message: 'Invalid content' });
  }
  if (content.length > GIFT_MAX_CHARS) {
    return res.status(400).json({ message: `Content exceeds ${GIFT_MAX_CHARS} characters` });
  }

  // Auth
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const verification = await verifyAtprotoToken(token, did);
  if (!verification.verified) {
    console.warn(`[API gift] Unauthorized attempt for DID: ${did}. Reason: ${verification.reason}`);
    return res.status(401).json({ message: 'Unauthorized session' });
  }

  const dbHeaders: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  // 1日1回チェック（UTC基準で当日00:00:00以降）
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const todayIso = todayUtc.toISOString();

  try {
    const giftCheckRes = await fetch(
      `${DB_URL}/gifts?did=eq.${encodeURIComponent(did)}&created_at=gte.${encodeURIComponent(todayIso)}&select=id`,
      { headers: dbHeaders, keepalive: true }
    );
    if (giftCheckRes.ok) {
      const existing = await giftCheckRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        const msg = lang === 'en'
          ? 'You can only send one gift per day! See you tomorrow!'
          : 'プレゼントは1日1回までだよ！また明日ね！';
        return res.status(429).json({ message: msg });
      }
    }
  } catch (e) {
    console.error('[API gift] Daily check error:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }

  const gemini = new GoogleGenAI({ apiKey });

  // コンテンツ審査
  try {
    const moderationRes = await withGeminiRetry(() => gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: `以下のメッセージが政治的・宗教的な内容、または公序良俗に反する内容（暴力・差別・性的表現など）を含む場合のみ{"isAcceptable":false,"reason":"理由"}と返答してください。問題なければ{"isAcceptable":true}のみ返答してください。\n\nメッセージ：「${content}」` }]
      }],
    }));
    const moderationText = moderationRes.text ?? '';
    const jsonMatch = moderationText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const modResult = JSON.parse(jsonMatch[0]);
      if (modResult.isAcceptable === false) {
        const reason = modResult.reason ?? '';
        const msg = lang === 'en'
          ? `Sorry, I can't accept that gift. ${reason}`
          : `そのプレゼントは受け取れないよ。${reason}`;
        return res.status(400).json({ message: msg });
      }
    }
  } catch (e) {
    console.error('[API gift] Moderation error:', e);
    // 審査失敗時は安全のため拒否
    return res.status(500).json({ message: 'Content moderation failed' });
  }

  // DBに保存
  try {
    const insertRes = await fetch(`${DB_URL}/gifts`, {
      method: 'POST',
      headers: {
        ...dbHeaders,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ did, content }),
      keepalive: true,
    });
    if (!insertRes.ok) {
      throw new Error(`DB insert failed with status ${insertRes.status}`);
    }
  } catch (e) {
    console.error('[API gift] DB insert error:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }

  // botたんキャラの感謝メッセージ生成
  const callerName = typeof userName === 'string' && userName.trim() ? userName.trim() : null;
  const nameInstruction = callerName
    ? `相手の名前は「${callerName}」です。必ず名前を呼んで感謝してください。`
    : `相手の名前がわからない場合は「あなた」と呼んでください。`;

  const systemInstruction = `あなたは以下のキャラクター設定に基づいて振る舞います。
${BOTTAN_CHARACTER_SETTINGS}
${nameInstruction}
あなた自身がプレゼントを直接受け取っています。「〜だね」「〜んだね」など観察者・第三者視点の表現は使わず、プレゼントをもらった本人として一人称で喜びや感謝を表現してください。
返答は必ず以下の形式で返してください（他の文章は一切含めないこと）：
[ja][halfHappy]〈日本語の感謝メッセージ 2〜3文〉[en][halfHappy]〈English thank-you message 2-3 sentences〉
感情タグは[halfHappy]または[excited]のどちらかを選択してください。マークダウン装飾は使わないこと。`;

  try {
    const thankYouRes = await withGeminiRetry(() => gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: `「${content}」をもらいました！あなた（botたん）が直接受け取った立場として、一人称で喜びと感謝を伝えてください。` }]
      }],
      config: { systemInstruction },
    }));
    const thankYou = thankYouRes.text?.trim() ?? '';
    return res.status(200).json({ thankYou });
  } catch (e) {
    console.error('[API gift] Thank-you generation error:', e);
    // 生成失敗時はフォールバックメッセージ
    const fallback = lang === 'en'
      ? '[en][halfHappy]Thank you so much for the gift! I\'m really happy!'
      : '[ja][halfHappy]プレゼントありがとう！すっごく嬉しいよ！[en][halfHappy]Thank you so much for the gift! I\'m really happy!';
    return res.status(200).json({ thankYou: fallback });
  }
}
