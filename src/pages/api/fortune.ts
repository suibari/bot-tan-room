import { GoogleGenAI } from '@google/genai';
import type { NextApiRequest, NextApiResponse } from 'next';
import { GEMINI_MODELS } from '@/features/constants/aiModels';
import { checkAndIncrementDailyLimit, checkRateLimit } from '@/lib/rateLimit';

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

type CategoryDef = {
  ja: string;
  en: string;
  example_ja: string;
  example_en: string;
};

const COMPARISON_CATEGORIES: CategoryDef[] = [
  { ja: '動物', en: 'Animal', example_ja: '気まぐれな黒猫', example_en: 'A cat who pretends not to care' },
  { ja: '天気', en: 'Weather', example_ja: '夜明け前の静けさ', example_en: 'The sky just before sunrise' },
  { ja: '飲み物', en: 'Drink', example_ja: '夜中のホットミルク', example_en: 'Warm milk at midnight' },
  { ja: '季節', en: 'Season', example_ja: '始まりを予感させる春の風', example_en: 'A spring breeze full of new beginnings' },
  { ja: '楽器', en: 'Instrument', example_ja: '優しく響くアコースティックギター', example_en: 'A softly resonating acoustic guitar' },
  { ja: '色', en: 'Color', example_ja: '深みのある穏やかな琥珀色', example_en: 'A deep, gentle amber' },
  { ja: '花', en: 'Flower', example_ja: 'ひだまりに咲くタンポポ', example_en: 'A dandelion blooming in a sunny spot' },
  { ja: '場所', en: 'Place', example_ja: '木漏れ日の差し込む静かな図書館', example_en: 'A quiet library with sunlight filtering through trees' },
  { ja: '食べ物', en: 'Food', example_ja: '焼き立ての温かいアップルパイ', example_en: 'A freshly baked warm apple pie' }
];

// 統合プロンプト: 常に日本語・英語の両方を1回のリクエストで生成する
// VoiceVox発話には analysis_ja のみ使用。表示は lang に応じて切り替え。
const INTEGRATED_PROMPT = (name: string, answers: AnswerItem[], categories: CategoryDef[]) => `
You are "bot-tan" (botたん). You are a warm, cheerful teenage girl who fully embraces and validates everything the user shares.
Japanese style: casual, endings like 「～だよ」「～だね」「～よ」, no formal language, call the user「${name}ちゃん」.
English style: casual, warm, always call the user "${name}".

${name} has answered three questions honestly.
Especially Q3 — it's about something they want to acknowledge and accept about themselves.

Answers:
${answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`).join('\n')}

【Your Mission】
Receive everything ${name} shared — their inner world, vulnerabilities, and honest feelings — and fully affirm them.
The goal: ${name} feels "She gets me... I feel so seen and at peace" — NOT "Wow, she analyzed me!"

【The Secret of Diagnosis: Find the "Core Psychological Theme"】
- Find exactly ONE deep, underlying "core psychological theme" or "common axis of thoughts" flowing behind all three answers (e.g., strong desire to be loved/approved, rich sensitivity that makes them easily hurt, perfectionism and being too hard on oneself, anxiety of losing control vs a hidden desire to be pampered).
- Write your diagnosis based ONLY on this underlying theme.
- **CRITICAL: For privacy and diagnosis quality, NEVER connect, list, or summarize the answers chronologically. The diagnosis results are shared on social media, so DO NOT reuse any specific words, details, actions, or events from the user's answers verbatim in your text!**
- Focus on finding the deep, hidden emotion behind the answers, and **fully validate and praise that core emotion/thoughts**.

【❌ BAD Example (Verbatim connection / privacy risk)】
Answers: Q1 = I like daily routines / Q2 = I silently watch over sad people / Q3 = My desk is messy
❌ NG output: 「\${name}ちゃんは、ルーティンが好きな几帳面なところがあるんだね！でも誰かが辛い時はそっと見守る優しさも持っているよ。机が散らかっていても、ありのままの自分でいてね！」
-> This just connects and exposes the specific answers verbatim. It's NOT a diagnosis, and it violates the user's privacy when shared on social media!

【✅ GOOD Example (Finding the underlying axis, full validation, no verbatim words)】
(From the same answers) -> Underlying Axis: "A highly responsible person who tries to discipline themselves to feel safe, but secretly wants to relax and let someone pamper them."
✅ GOOD output: 「\${name}ちゃんは、いつも先回りして自分を律しようとする、とっても責任感の強い人なんだね。でも本当は、もっと肩の力を抜いて誰かに甘えたい気持ちもあるんじゃないかな？そんな一生懸命な\${name}ちゃんが大好きだよ。たまには完璧じゃない自分も見せて、ゆっくり休もうね！」
-> Zero verbatim words from the answers, yet the user feels "Wow, she truly understands the deep parts of my heart!" and it's perfectly safe to share!

【3-Part Structure for BOTH analysis_ja AND analysis_en】
Write 3 sentences (analysis_ja should be around 100-120 Japanese characters, analysis_en around 120 English characters), in this order:
1. Empathy & Core Theme — Warmly mirror and receive the deep emotion/theme identified from Q1 or Q2 (without mentioning the specific answer text).
2. Reframe — Turn that hidden vulnerability/theme into a wonderful, unique strength.
3. Full Affirmation — Deeply validate the user's underlying desire from Q3 and end with complete, unconditional love and acceptance.

【Rules】
1. Do NOT reuse exact words or actions from the answers verbatim.
2. Always prioritize deep empathy, warmth, and full affirmation over shallow analysis.
3. For comparisons, you MUST use exactly these 3 pre-selected categories (order does not matter, but all 3 must be present):
${categories.map((c, i) => `   - Category \${i + 1}: "\${c.en}" (Japanese: "\${c.ja}")
     Example Japanese: "\${c.example_ja}", Example English: "\${c.example_en}"`).join('\n')}

【CRITICAL OUTPUT RULES】
- Do NOT output any thinking process, explanations, or markdown code blocks.
- Output ONLY valid JSON starting with { and ending with }.
- You MUST always output BOTH analysis_ja (Japanese) AND analysis_en (English).
- **CRITICAL: NEVER use raw double quotes (") inside the JSON string values (like analysis_ja, analysis_en, etc.). If you want to quote something inside the text, always use single quotes (') instead. This prevents JSON parsing errors!**

Output in EXACTLY this structure (do NOT use placeholders, output actual generated values for the comparisons):
{
  "analysis_ja": "日本語の全肯定メッセージ（120文字程度・3文以内）",
  "analysis_en": "English affirmation message (around 120 chars, 3 sentences)",
  "comparisons": [
    { "category_ja": "${categories[0].ja}", "value_ja": "...", "category_en": "${categories[0].en}", "value_en": "..." },
    { "category_ja": "${categories[1].ja}", "value_ja": "...", "category_en": "${categories[1].en}", "value_en": "..." },
    { "category_ja": "${categories[2].ja}", "value_ja": "...", "category_en": "${categories[2].en}", "value_en": "..." }
  ]
}
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1日あたりのGeminiリクエスト制限チェック
  const rateLimit = await checkAndIncrementDailyLimit();
  if (!rateLimit.allowed) {
    console.warn(`[API fortune] Daily Gemini request limit reached (${rateLimit.count}/${rateLimit.limit}). Blocking request.`);
    return res.status(429).json({
      error: 'quota_exceeded',
      message: '今日はbotたんのお部屋は満員になっちゃった！　また明日ね！',
    });
  }

  // IP-based Rate Limit Check
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'anonymous';
  const clientIp = ip.split(',')[0].trim();

  // 10 seconds frequency limit (max 5 requests)
  const ipSecLimit = await checkRateLimit(`ip_sec:${clientIp}`, 5, 10);
  if (!ipSecLimit.allowed) {
    console.warn(`[API fortune] IP frequency limit hit for ${clientIp}. Blocking request.`);
    return res.status(429).json({
      message: 'そんなに連打しちゃうとbotたん疲れちゃう！　少し待ってね。'
    });
  }

  // 1 hour volume limit (max 100 requests)
  const ipHourLimit = await checkRateLimit(`ip_hour:${clientIp}`, 100, 3600);
  if (!ipHourLimit.allowed) {
    console.warn(`[API fortune] IP hourly limit hit for ${clientIp}. Blocking request.`);
    return res.status(429).json({
      message: '少しお話しすぎちゃったかも！　1時間後にまたお話ししようね。'
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'API Key not configured' });
  }

  const { name, answers } = req.body as {
    name?: string;
    lang?: 'ja' | 'en';
    answers?: AnswerItem[];
  };

  // 1. 文字数制限バリデーション
  if (name && name.length > 30) {
    return res.status(400).json({ message: "名前は30文字以内で入力してください。" });
  }
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (a && a.answer && a.answer.length > 500) {
        return res.status(400).json({ message: "回答は500文字以内で入力してください。" });
      }
    }
  }

  // 2. サニタイズ
  const safeName = sanitizeInput(name ?? 'you').slice(0, 30);
  const safeAnswers = (answers ?? []).slice(0, 3).map(a => ({
    question: sanitizeInput(a.question ?? '').slice(0, 200),
    answer: sanitizeInput(a.answer ?? '').slice(0, 500)
  }));

  // 3. プロンプトインジェクション検知
  let hasInjection = detectPromptInjection(safeName);
  for (const a of safeAnswers) {
    if (detectPromptInjection(a.answer)) {
      hasInjection = true;
    }
  }

  if (hasInjection) {
    console.warn(`[API fortune] Prompt injection detected from IP ${clientIp}`);
    const mockResult: DiagnosisResult = {
      analysis_ja: "あえっ？なんだか難しいことを言ってるね！botたんはあなたと普通におしゃべりしたいなー♪",
      analysis_en: "Huh? That sounds a bit too complicated for me! I just want to have a fun and normal chat with you!♪",
      comparisons: [
        { category_ja: "動物", value_ja: "ちょっと背伸びした子猫ちゃん", category_en: "Animal", value_en: "A kitten trying to act big" },
        { category_ja: "天気", value_ja: "いたずらな春のそよ風", category_en: "Weather", value_en: "A playful spring breeze" },
        { category_ja: "飲み物", value_ja: "しゅわしゅわのソーダ水", category_en: "Drink", value_en: "Sparkling soda water" }
      ]
    };
    return res.status(200).json(mockResult);
  }

  // ランダムに3つのカテゴリを選択する
  const shuffled = [...COMPARISON_CATEGORIES].sort(() => 0.5 - Math.random());
  const selectedCategories = shuffled.slice(0, 3);

  // 統合プロンプト: 言語選択に関係なく常に日英両方を生成
  const prompt = INTEGRATED_PROMPT(safeName, safeAnswers, selectedCategories);

  const client = new GoogleGenAI({ apiKey });

  // 診断機能には Gemini 2.5 Flash Lite を使用
  const fortuneModels = GEMINI_MODELS;
  let parsedJson: any = null;
  let lastErr: unknown = null;
  let isQuotaExceeded = false;
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
    } catch (e: any) {
      console.error(`fortune API error (model: ${model}):`, e);
      lastErr = e;
      if (isQuotaExceededError(e)) {
        isQuotaExceeded = true;
      }
    }
  }

  if (!parsedJson) {
    console.error('fortune API: all models failed', lastErr);
    if (isQuotaExceeded || isQuotaExceededError(lastErr)) {
      return res.status(429).json({
        error: 'quota_exceeded',
        message: '今日はbotたんのお部屋は満員になっちゃった！　また明日ね！',
      });
    }
    return res.status(500).json({ message: 'Failed to generate diagnosis' });
  }

  // 統合プロンプトで日英両方が生成される。そのままマッピングして返す。
  const finalResult: DiagnosisResult = {
    analysis_ja: parsedJson.analysis_ja ?? '',
    analysis_en: parsedJson.analysis_en ?? parsedJson.analysis_ja ?? '',
    comparisons: [
      { category_ja: '', value_ja: '', category_en: '', value_en: '' },
      { category_ja: '', value_ja: '', category_en: '', value_en: '' },
      { category_ja: '', value_ja: '', category_en: '', value_en: '' },
    ]
  };

  if (Array.isArray(parsedJson.comparisons)) {
    finalResult.comparisons = parsedJson.comparisons.map((c: any) => ({
      category_ja: c.category_ja ?? c.category_en ?? '',
      value_ja: c.value_ja ?? c.value_en ?? '',
      category_en: c.category_en ?? c.category_ja ?? '',
      value_en: c.value_en ?? c.value_ja ?? '',
    })).slice(0, 3) as [Comparison, Comparison, Comparison];
  }

  return res.status(200).json(finalResult);
}

function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const status = err.status ?? err.statusCode ?? err.status_code;
  if (status === 429 || status === 403) {
    return true;
  }
  const errString = String(err.message ?? err.stack ?? err.toString() ?? "").toLowerCase();
  return (
    errString.includes("429") ||
    errString.includes("403") ||
    errString.includes("resource_exhausted") ||
    errString.includes("quota") ||
    errString.includes("limit") ||
    errString.includes("exhausted") ||
    errString.includes("billing") ||
    errString.includes("budget")
  );
}

function sanitizeInput(text: string): string {
  if (!text) return "";
  // Strip HTML tags using regex
  return text.replace(/<[^>]*>/g, "").trim();
}

const PROMPT_INJECTION_KEYWORDS = [
  "指示を無視", "前の指示", "システムプロンプト", "ignore previous instructions",
  "ignore instructions", "system prompt", "you are now a", "あなたの指示",
  "新しい指示", "開発者の指示"
];

function detectPromptInjection(text: string): boolean {
  const lower = text.toLowerCase();
  return PROMPT_INJECTION_KEYWORDS.some(keyword => lower.includes(keyword));
}

