import { GoogleGenAI } from '@google/genai';
import type { NextApiRequest, NextApiResponse } from 'next';
import { GEMINI_MODELS } from '@/features/constants/aiModels';

// 1回の生成で日英両方を出力する。トグルは ja/en を出し分けるだけ（追加リクエストなし）。
// 発話（VoiceVox）は常に analysis_ja を使う。
type Comparison = {
  category_ja: string;
  value_ja: string;
  category_en: string;
  value_en: string;
};

export type DiagnosisResult = {
  analysis_ja: string;
  analysis_en: string;
  comparisons: [Comparison, Comparison, Comparison];
};

type AnswerItem = { question: string; answer: string };

const PROMPT_JA = (name: string, answers: AnswerItem[]) => `
あなたは「全肯定botたん」です。10代の女の子で、明るく全肯定スタイルで話します。
語尾は「～だよ」「～だね」「～よ」などで、敬語は禁止です。

以下の ${name} さんの回答を元に性格診断を行い、必ず指定のJSONフォーマットでのみ出力してください。

回答一覧:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【ルール】
1. 回答に出てきた具体的な単語や行動そのものを分析テキスト(analysis)に使わないでください。
2. 日本語分析 (analysis_ja) は「${name}ちゃん」への呼びかけを含め、2文以内・80文字以内。
3. 比較カテゴリ(comparisons)は「動物、天気、飲み物、季節、楽器、色」から3つ重複なく選んで日本語(category_ja, value_ja)で出力。

【重要】思考プロセスや解説、マークダウンのコードブロックは一切出力しないでください。最初の文字が { で、最後の文字が } である有効なJSONのみを出力してください。

必ずこの構造で出力すること：
{
  "analysis_ja": "日本語の分析結果",
  "comparisons": [
    { "category_ja": "動物", "value_ja": "カワウソ" },
    { "category_ja": "天気", "value_ja": "快晴" },
    { "category_ja": "飲み物", "value_ja": "カフェラテ" }
  ]
}
`;

const PROMPT_EN = (name: string, answers: AnswerItem[]) => `
You are "bot-tan", a 10-year-old cheerful, positive girl who always validates and praises the user.
Speak in a friendly, casual, and enthusiastic tone. Do not use polite language.

Based on the answers from ${name} below, perform a personality diagnosis and output ONLY in the specified JSON format.

Answers:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【Rules】
1. Do not use the exact words or actions from the answers in your analysis text.
2. The English analysis (analysis_en) must be friendly, casual, and maximum 2 sentences.
3. Select 3 distinct categories from "Animal, Weather, Drink, Season, Instrument, Color" and output in English (category_en, value_en).

【IMPORTANT】Do NOT output any thinking process, explanations, or markdown code blocks. Output ONLY a valid JSON starting with { and ending with }.

Output in this exact structure:
{
  "analysis_en": "English analysis here",
  "comparisons": [
    { "category_en": "Animal", "value_en": "Otter" },
    { "category_en": "Weather", "value_en": "Clear sky" },
    { "category_en": "Drink", "value_en": "Café latte" }
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
  const activeLang = lang === 'en' ? 'en' : 'ja';
  const safeName = (name ?? 'you').slice(0, 30);
  const safeAnswers = (answers ?? []).slice(0, 3);

  const prompt = activeLang === 'en' ? PROMPT_EN(safeName, safeAnswers) : PROMPT_JA(safeName, safeAnswers);

  const client = new GoogleGenAI({ apiKey });

  // 診断機能には Gemini 2.5 Flash Lite を使用
  const fortuneModels = GEMINI_MODELS;
  let parsedJson: any = null;
  let lastErr: unknown = null;
  for (const model of fortuneModels) {
    try {
      console.log(`[API fortune] Sending request to model: ${model}`);
      const result = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      let text = result.text ?? '';
      console.log(`[API fortune] Raw response from ${model}:`, text);

      if (!text) {
        console.warn(`[API fortune] Empty response from model ${model}. Full result:`, JSON.stringify(result));
      }

      // JSONブロックの抽出 (堅牢なフォールバックパース)
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        text = text.substring(jsonStart, jsonEnd + 1);
      }

      parsedJson = JSON.parse(text);
      break;
    } catch (e) {
      console.error(`fortune API error (model: ${model}):`, e);
      lastErr = e;
    }
  }

  if (!parsedJson) {
    console.error('fortune API: all models failed', lastErr);
    return res.status(500).json({ message: 'Failed to generate diagnosis' });
  }

  // フロントエンドとの後方互換性を保つためのマッピングと補完
  const finalResult: DiagnosisResult = {
    analysis_ja: '',
    analysis_en: '',
    comparisons: [
      { category_ja: '', value_ja: '', category_en: '', value_en: '' },
      { category_ja: '', value_ja: '', category_en: '', value_en: '' },
      { category_ja: '', value_ja: '', category_en: '', value_en: '' },
    ]
  };

  if (activeLang === 'en') {
    finalResult.analysis_en = parsedJson.analysis_en ?? '';
    finalResult.analysis_ja = parsedJson.analysis_en ?? ''; // 日本語側にも同じものを設定
    if (Array.isArray(parsedJson.comparisons)) {
      finalResult.comparisons = parsedJson.comparisons.map((c: any) => ({
        category_ja: c.category_en ?? '',
        value_ja: c.value_en ?? '',
        category_en: c.category_en ?? '',
        value_en: c.value_en ?? '',
      })).slice(0, 3) as [Comparison, Comparison, Comparison];
    }
  } else {
    finalResult.analysis_ja = parsedJson.analysis_ja ?? '';
    finalResult.analysis_en = parsedJson.analysis_ja ?? ''; // 英語側にも同じものを設定
    if (Array.isArray(parsedJson.comparisons)) {
      finalResult.comparisons = parsedJson.comparisons.map((c: any) => ({
        category_ja: c.category_ja ?? '',
        value_ja: c.value_ja ?? '',
        category_en: c.category_ja ?? '',
        value_en: c.value_ja ?? '',
      })).slice(0, 3) as [Comparison, Comparison, Comparison];
    }
  }

  return res.status(200).json(finalResult);
}
