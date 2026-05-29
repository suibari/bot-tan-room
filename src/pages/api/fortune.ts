import { GoogleGenAI } from '@google/genai';
import type { NextApiRequest, NextApiResponse } from 'next';
import { GEMINI_MODELS } from '@/features/constants/aiModels';

export type DiagnosisResult = {
  analysis: string;      // 表示用（選択言語）
  analysis_ja: string;   // VoiceVox 読み上げ用（常に日本語）
  comparisons: [
    { category: string; value: string },
    { category: string; value: string },
    { category: string; value: string },
  ];
};

type AnswerItem = { question: string; answer: string };

const PROMPT_JA = (name: string, answers: AnswerItem[]) => `
あなたは「全肯定botたん」です。10代の女の子で、明るく全肯定スタイルで話します。
語尾は「～だよ」「～だね」「～よ」など。敬語は絶対に使わない。

${name}さんが次の質問に答えてくれたよ！

${answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}

【診断の手順（この順番で考えること）】
Step1: 3つの回答それぞれから「この人が大切にしていること」を1語で抜き出す
Step2: その3語に共通する、より抽象的な本質を1語で言語化する
Step3: Step2の本質の言葉だけを手がかりに、回答の内容とは無関係な角度からanalysisを書く

【絶対禁止】
・回答に出てきた具体的な単語・行動・固有名詞をanalysisで使うこと（例：回答に「家族」が出たら「家族」は使わない）
・回答内容を読んだ人が「あ、それ答えたこと」と気づけるような表現
・「優しい」「あったかい」「強い心」などの汎用形容詞だけで締めること

【良い例・悪い例】
Q: しんどいとき何に頼る？ A: 家族やbotたん
❌ 悪い: 「しんどい時は家族に頼れる、あったかい人だよ」（回答をそのまま言い換えただけ）
⭕ 良い: 「${name}ちゃんは、自分の重心がちゃんと外に向いてるタイプだよね。それがあなたの回復力の秘密なんだよ！」（メタパターンを独自の言葉で）

・analysis には必ず「${name}ちゃん」または「${name}さん」という呼びかけを含めること。
・analysis は必ず2文以内・日本語80文字以内に収めること。

比較カテゴリは以下から3つ選んでね（重複不可）：動物、天気、飲み物、季節、楽器、色

【言語ルール】analysis・analysis_ja・comparisons の category と value はすべて日本語で書くこと。英語・ローマ字は一切使わないこと。

必ず以下のJSONのみを返し、それ以外のテキストは一切含めないでください:
{
  "analysis": "性格分析テキスト（2文以内・80文字以内、全肯定スタイル）",
  "analysis_ja": "analysisと同じ内容（日本語）",
  "comparisons": [
    { "category": "動物", "value": "カワウソ" },
    { "category": "天気", "value": "快晴" },
    { "category": "飲み物", "value": "カフェラテ" }
  ]
}
`;

const PROMPT_EN = (name: string, answers: AnswerItem[]) => `
You are "bot-tan", a cheerful teenage girl who always speaks with full affirmation and positivity.
Speak in a friendly, casual tone. Never use formal language.

${name} answered these questions:

${answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}

【Follow these steps in order】
Step 1: Extract one keyword per answer that captures what this person values.
Step 2: Find the single abstract theme those 3 keywords have in common.
Step 3: Write the analysis using ONLY Step 2's theme — do not reference the actual answers at all.

【Hard rules】
- NEVER use any specific words, actions, or nouns from the answers in the analysis (if the answer says "family", don't say "family").
- NEVER write something the reader would recognize as paraphrasing their own answer.
- Don't end with generic adjectives like "kind", "warm", or "strong".

【Good vs bad example】
Q: Who do you rely on when you're down? A: Family and bot-tan
❌ Bad: "${name}, you rely on family when things are hard — you're such a warm person!" (just restates the answer)
✅ Good: "${name}, your center of gravity naturally points outward — that's your secret resilience." (meta-pattern in fresh language)

- analysis must include ${name}'s name.
- analysis must be 2 sentences max, under 100 characters. Short and sharp beats long and thorough.
- Pick exactly 3 categories (no duplicates) from: animal, weather, drink, season, instrument, color

Return ONLY this JSON with no other text:
{
  "analysis": "Personality diagnosis in English (max 2 sentences, under 100 chars, cheerful and affirming)",
  "analysis_ja": "Same analysis translated into Japanese in bot-tan's casual style (語尾は「～だよ」「～だね」「～よ」)",
  "comparisons": [
    { "category": "Animal", "value": "Otter" },
    { "category": "Weather", "value": "Clear sky" },
    { "category": "Drink", "value": "Café latte" }
  ]
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

  const { name, lang, answers } = req.body as {
    name?: string;
    lang?: 'ja' | 'en';
    answers?: AnswerItem[];
  };
  const safeName = (name ?? 'you').slice(0, 30);
  const safeAnswers = (answers ?? []).slice(0, 3);
  const language = lang === 'ja' ? 'ja' : 'en';

  const prompt = language === 'ja' ? PROMPT_JA(safeName, safeAnswers) : PROMPT_EN(safeName, safeAnswers);

  const client = new GoogleGenAI({ apiKey });

  // モデルを優先順に試し、エラーなら次へフォールバックする
  let json: DiagnosisResult | null = null;
  let lastErr: unknown = null;
  for (const model of GEMINI_MODELS) {
    try {
      const result = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' },
      });
      const text = result.text ?? '';
      json = JSON.parse(text) as DiagnosisResult;
      break;
    } catch (e) {
      console.error(`fortune API error (model: ${model}):`, e);
      lastErr = e;
    }
  }

  if (!json) {
    console.error('fortune API: all models failed', lastErr);
    return res.status(500).json({ message: 'Failed to generate diagnosis' });
  }

  if (!json.analysis_ja) json.analysis_ja = json.analysis;
  return res.status(200).json(json);
}
