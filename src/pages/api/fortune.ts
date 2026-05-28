import { GoogleGenAI } from '@google/genai';
import type { NextApiRequest, NextApiResponse } from 'next';
import { GEMINI_MODEL } from '@/features/constants/aiModels';

export type FortuneResult = {
  message: string;     // 表示用（選択言語）
  message_ja: string;  // VoiceVox 読み上げ用（常に日本語）
  lucky_animal: string;
  lucky_music: string;
  lucky_zodiac: string;
};

const PROMPT_JA = (name: string) => `
あなたは「全肯定botたん」です。10代の女の子で、明るく全肯定スタイルで話します。
語尾は「～だよ」「～だね」「～よ」など。敬語は絶対に使わない。

${name}さんの今日の占い結果をJSONで返してください。

必ず以下のJSONのみを返し、それ以外のテキストは一切含めないでください:
{
  "message": "今日の運勢メッセージ（2〜3文、全肯定スタイルで明るく励ます内容）",
  "message_ja": "messageと同じ内容（日本語）",
  "lucky_animal": "今日のラッキーアニマル（動物名のみ）",
  "lucky_music": "今日のラッキーミュージック（楽曲またはジャンル）",
  "lucky_zodiac": "今日のラッキー星座（星座名のみ）"
}
`;

const PROMPT_EN = (name: string) => `
You are "bot-tan", a cheerful teenage girl who always speaks with full affirmation and positivity.
Speak in a friendly, casual tone. Never use formal language.

Generate today's fortune for ${name} and return ONLY a JSON object with no other text:
{
  "message": "Today's fortune message in English (2-3 sentences, cheerful and encouraging in bot-tan's style)",
  "message_ja": "Same fortune message translated into Japanese, in bot-tan's casual style (語尾は「～だよ」「～だね」「～よ」)",
  "lucky_animal": "today's lucky animal (name in English)",
  "lucky_music": "today's lucky music (song title or genre in English)",
  "lucky_zodiac": "today's lucky zodiac sign (name in English)"
}
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'API Key not configured' });
  }

  const { name, lang } = req.body as { name?: string; lang?: 'ja' | 'en' };
  const safeName = (name ?? 'you').slice(0, 30);
  const language = lang === 'ja' ? 'ja' : 'en';

  const prompt = language === 'ja' ? PROMPT_JA(safeName) : PROMPT_EN(safeName);

  const client = new GoogleGenAI({ apiKey });

  try {
    const result = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' },
    });

    const text = result.text ?? '';
    const json: FortuneResult = JSON.parse(text);

    // message_ja が欠落している場合のフォールバック
    if (!json.message_ja) json.message_ja = json.message;

    return res.status(200).json(json);
  } catch (e) {
    console.error('fortune API error:', e);
    return res.status(500).json({ message: 'Failed to generate fortune' });
  }
}
