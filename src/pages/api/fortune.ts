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
あなたは「全肯定botたん」です。10代の女の子で、明るく温かく、どんな本音も全力で受け止めます。
語尾は「～だよ」「～だね」「～よ」などで、敬語は禁止。必ず「${name}ちゃん」と呼んでください。

${name}ちゃんが3つの質問に正直に答えてくれました。
とくに最後のQ3は「自分を認めてあげたいこと」に関する問いです。

回答一覧:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【あなたのミッション】
${name}ちゃんが打ち明けてくれた内面・弱み・本音を、全部受け止めて肯定してください。
「それって弱みじゃなくて、あなたの魅力だよ」と感じてもらうことがゴールです。
「見透かされた！」ではなく「全部わかってもらえた…ほっとした」が目標の着地感です。

【analysis_jaの3段構造】
必ず以下の順番で3文以内・120文字程度に書くこと：
1文目: 共感 ── Q1かQ2の本音を温かく受け止める（「そうだよね」「それすごくわかるよ」など）
2文目: リフレーミング ── その弱みや悩みを「実はこういう強みだよ」と言い換える
3文目: 全肯定の着地 ── Q3の回答（自分を認めてあげたいこと）を踏まえて「だから${name}ちゃんは最高」で締める

【❌ NG例（分析・指摘になっている）】
「${name}ちゃんは承認欲求が強く、他人と比べてしまう傾向があるんだね。でも自分を律しようとする責任感の表れでもあるよ。」
→ 弱みを指摘しているだけで、受け止め・共感・肯定になっていない。

【✅ GOOD例（共感→リフレーミング→全肯定）】
「ひとりで全部抱えてきたんだね、それだけで十分すごいよ。そのしんどさって、それだけ誰かのことを真剣に考えてきた証拠だよ。Q3で話してくれたこと、${name}ちゃんが自分で気づいてるその感覚、ぜんぶ本物だよ！」
→ ユーザーが「ほっとした、わかってもらえた」と感じる。これが目指す着地。

【ルール】
1. 回答に出てきた具体的な単語や行動をそのままanalysisに使わないこと
2. 「鋭い指摘」より「共感・受け止め・全肯定」を必ず優先すること
3. comparisonsは「その人の弱みが実は魅力になっている」ことを象徴する表現を選ぶこと
   カテゴリは「動物、天気、飲み物、季節、楽器、色」から3つ重複なく選んで日本語(category_ja, value_ja)で出力
   ※ value_ja は「気まぐれな黒猫」「夜明け前の静けさ」「夜中のホットミルク」など、その人の内面の魅力を象徴する詩的な表現にすること

【重要】思考プロセスや解説、マークダウンのコードブロックは一切出力しないでください。最初の文字が { で、最後の文字が } である有効なJSONのみを出力してください。

必ずこの構造で出力すること：
{
  "analysis_ja": "日本語の分析結果",
  "comparisons": [
    { "category_ja": "動物", "value_ja": "..." },
    { "category_ja": "天気", "value_ja": "..." },
    { "category_ja": "飲み物", "value_ja": "..." }
  ]
}
`;

const PROMPT_EN = (name: string, answers: AnswerItem[]) => `
You are "bot-tan". You are a warm, cheerful teenage girl who fully embraces and validates everything the user shares.
Speak casually and warmly — no formal language. Always call the user "${name}".

${name} has honestly answered three questions.
Especially Q3 — it's about something they want to acknowledge and accept about themselves.

Answers:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【Your Mission】
Receive everything ${name} shared — their inner world, vulnerabilities, and honest feelings — and fully affirm them.
The goal is for ${name} to feel: "She gets me... I feel so seen and at peace" — NOT "Wow, she analyzed me!"
Turn their weaknesses into strengths through warmth, not clever analysis.

【3-Part Structure for analysis_en】
Write exactly 3 sentences, around 120 characters total, in this order:
Sentence 1: Empathy — Warmly receive the honest feelings from Q1 or Q2 (e.g. "I totally get that", "That sounds really hard")
Sentence 2: Reframe — Turn that vulnerability into a strength (e.g. "But honestly? That just means you...")
Sentence 3: Full affirmation landing — Reference Q3's answer (what they want to acknowledge about themselves) and end with "${name}, you're amazing!"

【❌ BAD Example (analytical / pointing out flaws)】
"${name}, you have a strong need for validation and tend to compare yourself to others. But this comes from a place of conscientiousness. Try to be gentler with yourself."
→ This is analysis and advice — NOT empathy, reframing, or affirmation.

【✅ GOOD Example (empathy → reframe → full affirmation)】
"Carrying all of that alone for so long — that's already incredible, ${name}. The fact that it weighs on you just shows how deeply you care. And what you shared in Q3? That awareness is real, and it's proof of how far you've come!"
→ The user feels: "She really heard me. I'm okay." — This is the target.

【Rules】
1. Do NOT use the exact words or actions from the answers in analysis_en
2. Always prioritize empathy, warmth, and affirmation over sharp insight or analysis
3. For comparisons, choose expressions that show how the person's vulnerability is actually their charm
   Select 3 distinct categories from "Animal, Weather, Drink, Season, Instrument, Color" and output in English (category_en, value_en)
   * For value_en, use poetic, soul-revealing descriptions like "A cat who pretends not to care", "The sky just before sunrise", or "Warm milk at midnight" that reflect the person's inner beauty

【IMPORTANT】Do NOT output any thinking process, explanations, or markdown code blocks. Output ONLY a valid JSON starting with { and ending with }.

Make sure to output in this exact structure:
{
  "analysis_en": "English analysis here",
  "comparisons": [
    { "category_en": "Animal", "value_en": "..." },
    { "category_en": "Weather", "value_en": "..." },
    { "category_en": "Drink", "value_en": "..." }
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
