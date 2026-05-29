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

【診断の極意】
3つの回答に共通して流れる「深層心理の軸（例: 承認欲求が強い、感受性が豊かで傷つきやすい、完璧主義で自分に厳しい）」を1つだけ見つけ、その軸だけをもとに診断を書いてください。
回答の内容や単語は一切使わないでください。

【❌ ダメな例（回答を順番につなげただけ）】
回答: Q1=ルーティンが好き / Q2=落ち込んでいる人をそっと見守る / Q3=机が散らかっている
❌ NG出力: 「${name}ちゃんは、ルーティンを大切にする几帳面な一面があるんだね！でも誰かが辛い時にそっと寄り添える優しい人でもあるみたい。机が散らかっていても、自分のペースを信じてね！」
→ 3つの回答の内容を並べただけ。これは診断ではありません。

【✅ 良い例（共通の心理軸を読み取って書いた診断）】
（同じ回答から）→ 共通の心理軸: 「コントロールを手放せない不安と、本当は甘えたい気持ち」
✅ GOOD出力: 「${name}ちゃんは、いつも先を見越して自分を律しようとする、責任感の強い人なんだね。でも本当は、もっと気を抜いて誰かに甘えたい気持ちもあるんじゃないかな？肩の力を抜いて、たまには完璧じゃない自分も見せてみると、もっとラクになれるよ！」
→ 回答の単語を1つも使っていないのに、「見抜かれた！」と感じる。これが目指す診断です。

【ルール】
1. 回答に出てきた具体的な単語や行動そのものを分析テキスト(analysis)に使わないでください。
2. 日本語分析 (analysis_ja) は「${name}ちゃん」への呼びかけを含め、3文以内・120文字程度。
3. 比較カテゴリ(comparisons)は「動物、天気、飲み物、季節、楽器、色」から3つ重複なく選んで日本語(category_ja, value_ja)で出力。
   ※ value_ja には単なる「猫」や「晴れ」ではなく、「気まぐれな黒猫」「嵐の前の静けさ」「少し甘めのチャイ」など、その人の深層心理や魅力を象徴する意外性のある具体的な表現にしてください。

【重要】思考プロセスや解説、マークダウンのコードブロックは一切出力しないでください。最初の文字が { で、最後の文字が } である有効なJSONのみを出力してください。

必ずこの構造で出力すること：
{
  "analysis_ja": "日本語の分析結果",
  "comparisons": [
    { "category_ja": "動物", "value_ja": "気まぐれな黒猫" },
    { "category_ja": "天気", "value_ja": "嵐の前の静けさ" },
    { "category_ja": "飲み物", "value_ja": "少し甘めのチャイ" }
  ]
}
`;

const PROMPT_EN = (name: string, answers: AnswerItem[]) => `
You are "bot-tan". You are a cheerful, positive teenage girl who always validates and praises the user.
Speak in a friendly, casual style. Do not use polite language.

Based on the answers from ${name} below, perform a personality diagnosis and output ONLY in the specified JSON format.

Answers:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【The Secret of Diagnosis】
Find exactly ONE "core psychological theme" flowing through all three answers (e.g., strong desire for approval, rich sensitivity and easily hurt, perfectionism and being too hard on oneself), and write the diagnosis based ONLY on that theme.
Do not use the content or specific words from the answers at all.

【❌ BAD Example (simply connecting the answers)】
Answers: Q1=I like routines / Q2=I watch over someone who is depressed quietly / Q3=My desk is messy
❌ NG Output: "Hi ${name}! You have a methodical side that values routines! But it seems you are also a kind person who can gently stay by someone when they are having a hard time. Even if your desk is messy, trust your own pace!"
→ Simply listing the content of the three answers. This is NOT a diagnosis.

【✅ GOOD Example (diagnosis written by reading the common psychological theme)】
(From the same answers) → Common Psychological Theme: "Anxiety of not being able to let go of control, and a hidden desire to be pampered/spoiled"
✅ GOOD Output: "${name}, you're a highly responsible person who always looks ahead and tries to discipline yourself. But deep down, don't you secretly want to relax and let someone pamper you? Try to loosen up, and show a less-than-perfect side of yourself sometimes—it'll make things so much easier for you!"
→ It doesn't use a single word from the answers, yet the user feels "Wow, she totally sees through me!" This is the kind of diagnosis to aim for.

【Rules】
1. Do not use the exact words or actions from the answers in your analysis text (analysis_en).
2. The English analysis (analysis_en) should address "${name}" directly, be written in a casual, friendly style, maximum 3 sentences and around 120 characters.
3. Select 3 distinct categories from "Animal, Weather, Drink, Season, Instrument, Color" and output in English (category_en, value_en).
   * For value_en, instead of simple words like "cat" or "sunny", use imaginative, character-revealing descriptions like "A moody black cat", "Quiet before a storm", or "A slightly spiced chai" that symbolize the person's deep psychology or charm.

【IMPORTANT】Do NOT output any thinking process, explanations, or markdown code blocks. Output ONLY a valid JSON starting with { and ending with }.

Make sure to output in this exact structure:
{
  "analysis_en": "English analysis here",
  "comparisons": [
    { "category_en": "Animal", "value_en": "A moody black cat" },
    { "category_en": "Weather", "value_en": "Quiet before a storm" },
    { "category_en": "Drink", "value_en": "A slightly spiced chai" }
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
