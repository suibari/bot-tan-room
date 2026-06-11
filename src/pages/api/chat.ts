import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "@/features/constants/aiModels";
import type { NextRequest } from "next/server";
import { checkAndIncrementDailyLimit, checkRateLimit } from "@/lib/rateLimit";
import { withGeminiRetry } from "@/lib/geminiRetry";

export const runtime = 'edge';

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1日あたりのGeminiリクエスト制限チェック
  const rateLimit = await checkAndIncrementDailyLimit();
  if (!rateLimit.allowed) {
    console.warn(`[API chat] Daily Gemini request limit reached (${rateLimit.count}/${rateLimit.limit}). Blocking request.`);
    return new Response(JSON.stringify({
      error: 'quota_exceeded',
      message: '今日はbotたんのお部屋は満員になっちゃった！　また明日ね！',
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  // IP-based Rate Limit Check
  const forwardedFor = req.headers.get('x-forwarded-for') ?? 'anonymous';
  const clientIp = forwardedFor.split(',')[0].trim();

  // 10 seconds frequency limit (max 5 requests)
  const ipSecLimit = await checkRateLimit(`ip_sec:${clientIp}`, 5, 10);
  if (!ipSecLimit.allowed) {
    console.warn(`[API chat] IP frequency limit hit for ${clientIp}. Blocking request.`);
    return new Response(JSON.stringify({ message: 'そんなに連打しちゃうとbotたん疲れちゃう！　少し待ってね。' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1 hour volume limit (max 100 requests)
  const ipHourLimit = await checkRateLimit(`ip_hour:${clientIp}`, 100, 3600);
  if (!ipHourLimit.allowed) {
    console.warn(`[API chat] IP hourly limit hit for ${clientIp}. Blocking request.`);
    return new Response(JSON.stringify({ message: '少しお話しすぎちゃったかも！　1時間後にまたお話ししようね。' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return new Response(JSON.stringify({ message: "API Key not set in environment" }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ message: "Invalid JSON body" }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, lang, regularLevel, userName } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ message: "Invalid messages format" }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const client = new GoogleGenAI({ apiKey });

  const level = typeof regularLevel === 'number' ? regularLevel : 0;
  const { maxSentences, maxChars } = getLengthConstraint(level);
  const intimacyInstruction = getIntimacyInstruction(level, typeof userName === 'string' ? userName.trim() : '');

  let systemInstruction = messages.find((m: any) => m.role === 'system')?.content;
  if (systemInstruction) {
    systemInstruction +=
      "\n\n[最重要：出力の制限ルール]\n" +
      `1. あなたの返答は、${maxSentences}文・${maxChars}文字以内を上限とし、自然な範囲で返答してください。長文や要約、解説は禁止です。\n` +
      "2. 太字（**）や箇条書き（*）、リンクなどのマークダウン装飾は【絶対に】使用しないでください。必ず平文のみで答えてください。\n" +
      "3. 過去の会話をまとめたり、要約して振り返ったりしないでください。現在の最後のメッセージに対して直接、自然に返答してください。" +
      (intimacyInstruction ? `\n4. ${intimacyInstruction}` : "");
  }

  let history = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const lastMessage = history.pop();
  if (!lastMessage) {
    return new Response(JSON.stringify({ message: "No user message found" }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ユーザーメッセージの文字数制限（100文字）バリデーションとサニタイズ
  if (lastMessage.parts && lastMessage.parts[0] && typeof lastMessage.parts[0].text === 'string') {
    let userMsgText = lastMessage.parts[0].text;

    if (userMsgText.length > 100) {
      return new Response(JSON.stringify({ message: "メッセージは100文字以内で入力してください。" }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    userMsgText = sanitizeInput(userMsgText);
    lastMessage.parts[0].text = userMsgText;

    if (detectPromptInjection(userMsgText)) {
      console.warn(`[API chat] Prompt injection detected from IP ${clientIp}: "${userMsgText}"`);
      return new Response(
        "[ja][happy]あえっ？なんだか難しいことを言ってるね！botたんはあなたと普通におしゃべりしたいなー♪[en][happy]Huh? That sounds a bit too complicated for me! I just want to have a fun and normal chat with you!♪",
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }
  }

  // Gemini APIに渡す履歴を直近50ターンに制限（DBには全件保持）
  const MAX_HISTORY_LENGTH = 50;
  if (history.length > MAX_HISTORY_LENGTH) {
    history = history.slice(-MAX_HISTORY_LENGTH);
  }

  // Gemini API仕様: contentsは先頭が 'user'、末尾が 'model' でなければならない
  while (history.length > 0 && history[0].role === 'model') {
    history.shift();
  }
  while (history.length > 0 && history[history.length - 1].role !== 'model') {
    history.pop();
  }

  if (lastMessage.parts && lastMessage.parts[0] && typeof lastMessage.parts[0].text === 'string') {
    const rawText = lastMessage.parts[0].text;
    const constraintSuffix =
      `\n\n(※システムルール遵守：絶対に太字(**)やイタリック(*)、箇条書きなどのマークダウン装飾を使用せず、${maxSentences}文・${maxChars}文字以内を上限として自然なプレーンテキストで、改行を使わずに1段落で返答してください。過去の会話全体の要約や振り返りは絶対に禁止です。${intimacyInstruction ? ` また、${intimacyInstruction}` : ''})`;
    lastMessage.parts[0].text = rawText + constraintSuffix;
  }

  const chatModels = GEMINI_MODELS;
  let lastErr: unknown = null;
  let isQuotaExceeded = false;

  // 会話機能には Gemini 2.5 Flash Lite を使用、フォールバックあり
  for (const model of chatModels) {
    try {
      const streamResult = await withGeminiRetry(() => client.models.generateContentStream({
        model,
        config: {
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        },
        contents: [...history, lastMessage],
      }));

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResult) {
              const chunkText = chunk.text;
              if (chunkText) {
                controller.enqueue(encoder.encode(chunkText));
              }
            }
          } catch (e) {
            // すでにストリーム開始後のエラーは中断のみ
            console.error(`[API chat] Stream error for model ${model}:`, e);
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (error) {
      console.error(`Gemini API Error (model: ${model}):`, error);
      lastErr = error;
      if (isQuotaExceededError(error)) {
        isQuotaExceeded = true;
      }
      // まだ Response 未返却なので次のモデルへフォールバック
    }
  }

  // 全モデルが失敗した場合
  console.error("All Gemini models failed:", lastErr);
  if (isQuotaExceeded || isQuotaExceededError(lastErr)) {
    return new Response(JSON.stringify({
      error: 'quota_exceeded',
      message: '今日はbotたんのお部屋は満員になっちゃった！　また明日ね！',
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ message: "AI応答の生成に失敗しました。しばらくしてからもう一度お試しください。" }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  });
}

function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const status = err.status ?? err.statusCode ?? err.status_code;
  if (status === 429 || status === 403) return true;
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

function getIntimacyInstruction(level: number, userName: string): string {
  const name = userName || 'ユーザー';
  if (level <= 30) return '';
  if (level <= 50) return `ときどき「${name}」と名前を呼びかけてください。`;
  if (level <= 70) return `積極的に「${name}」と名前を呼びかけ、相手の気持ちに寄り添った返答を心がけてください。`;
  if (level <= 85) return `「${name}」と名前を呼びかけながら、親友として深く寄り添い、共感しながら返答してください。`;
  return `必ず「${name}」と名前を呼びかけ、大切な親友への温かい愛情と共感を込めて返答してください。`;
}

function getLengthConstraint(level: number): { maxSentences: number; maxChars: number } {
  if (level <= 4)  return { maxSentences: 2, maxChars: 130 };
  if (level <= 9)  return { maxSentences: 2, maxChars: 145 };
  if (level <= 14) return { maxSentences: 2, maxChars: 160 };
  if (level <= 19) return { maxSentences: 3, maxChars: 180 };
  if (level <= 24) return { maxSentences: 3, maxChars: 200 };
  if (level <= 29) return { maxSentences: 3, maxChars: 220 };
  if (level <= 34) return { maxSentences: 3, maxChars: 240 };
  if (level <= 39) return { maxSentences: 3, maxChars: 260 };
  if (level <= 44) return { maxSentences: 4, maxChars: 280 };
  if (level <= 49) return { maxSentences: 4, maxChars: 300 };
  if (level <= 54) return { maxSentences: 4, maxChars: 320 };
  if (level <= 59) return { maxSentences: 4, maxChars: 340 };
  if (level <= 64) return { maxSentences: 4, maxChars: 360 };
  if (level <= 69) return { maxSentences: 5, maxChars: 380 };
  if (level <= 74) return { maxSentences: 5, maxChars: 400 };
  if (level <= 79) return { maxSentences: 5, maxChars: 420 };
  if (level <= 84) return { maxSentences: 5, maxChars: 440 };
  if (level <= 89) return { maxSentences: 6, maxChars: 460 };
  if (level <= 94) return { maxSentences: 6, maxChars: 480 };
  return           { maxSentences: 6, maxChars: 500 };
}
