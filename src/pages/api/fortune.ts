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

const PROMPT = (name: string, answers: AnswerItem[]) => `
あなたは「全肯定botたん」です。10代の女の子で、明るく全肯定スタイルで話します。
語尾は「～だよ」「～だね」「～よ」などで、敬語は禁止です。

以下の ${name} さんの回答を元に性格診断を行い、必ず指定のJSONフォーマットでのみ出力してください。

回答一覧:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【ルール】
1. 回答に出てきた具体的な単語や行動そのものを分析テキスト(analysis)に使わないでください。
2. 日本語分析 (analysis_ja) は「${name}ちゃん」への呼びかけを含め、2文以内・80文字以内。
3. 英語版 (analysis_en) は、日本語版と同等の内容をカジュアルな英語で出力（2文以内、日本語版と対応するように）。
4. 比較カテゴリ(comparisons)は「動物、天気、飲み物、季節、楽器、色」から3つ重複なく選んで日英それぞれ出力。

【重要】思考プロセスや解説、マークダウンのコードブロックは一切出力しないでください。最初の文字が { で、最後の文字が } である有効なJSONのみを出力してください。

必ずこの構造で出力すること：
{
  "analysis_ja": "日本語の分析結果",
  "analysis_en": "English analysis (日本語と対応するように)",
  "comparisons": [
    { "category_ja": "動物", "value_ja": "カワウソ", "category_en": "Animal", "value_en": "Otter" },
    { "category_ja": "天気", "value_ja": "快晴", "category_en": "Weather", "value_en": "Clear sky" },
    { "category_ja": "飲み物", "value_ja": "カフェラテ", "category_en": "Drink", "value_en": "Café latte" }
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

  const prompt = PROMPT(safeName, safeAnswers);

  const client = new GoogleGenAI({ apiKey });

  // 診断機能には 31b を使用
  const fortuneModels = ['gemma-4-31b-it'] as const;
  let json: DiagnosisResult | null = null;
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

  // 片方の言語が欠けた場合のフォールバック
  if (!json.analysis_ja) json.analysis_ja = json.analysis_en;
  if (!json.analysis_en) json.analysis_en = json.analysis_ja;
  return res.status(200).json(json);
}
