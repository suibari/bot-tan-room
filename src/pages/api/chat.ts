import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "@/features/constants/aiModels";
import type { NextApiRequest, NextApiResponse } from "next";
import { checkAndIncrementDailyLimit } from "@/lib/rateLimit";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  // 1日あたりのGeminiリクエスト制限チェック
  const rateLimit = await checkAndIncrementDailyLimit();
  if (!rateLimit.allowed) {
    console.warn(`[API chat] Daily Gemini request limit reached (${rateLimit.count}/${rateLimit.limit}). Blocking request.`);
    return res.status(429).json({
      error: 'quota_exceeded',
      message: '今日はbotたんのお部屋は満員になっちゃった！　また明日ね！',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    res.status(500).json({ message: "API Key not set in environment" });
    return;
  }

  const { messages, lang } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ message: "Invalid messages format" });
    return;
  }

  const client = new GoogleGenAI({ apiKey });

  // System prompt logic
  let systemInstruction = messages.find((m: any) => m.role === 'system')?.content;
  if (systemInstruction) {
    // 確実に出力を抑制するための最重要指示を末尾に追加
    systemInstruction +=
      "\n\n[最重要：出力の制限ルール]\n" +
      "1. あなたの返答は、絶対に2〜3文（120〜200文字程度）の簡潔なプレーンテキストにしてください。長文や要約、解説は禁止です。\n" +
      "2. 太字（**）や箇条書き（*）、リンクなどのマークダウン装飾は【絶対に】使用しないでください。必ず平文のみで答えてください。\n" +
      "3. 過去の会話をまとめたり、要約して振り返ったりしないでください。現在の最後のメッセージに対して直接、自然に返答してください。";
  }

  let history = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const lastMessage = history.pop();

  if (!lastMessage) {
    res.status(400).json({ message: "No user message found" });
    return;
  }

  // ユーザーメッセージの文字数制限（100文字）バリデーション
  if (lastMessage.parts && lastMessage.parts[0] && typeof lastMessage.parts[0].text === 'string') {
    const userMsgText = lastMessage.parts[0].text;
    if (userMsgText.length > 100) {
      res.status(400).json({ message: "メッセージは100文字以内で入力してください。" });
      return;
    }
  }

  // 過去履歴の件数を直近100件に制限して入力トークンを節約（DB保存上限に合わせる）
  const MAX_HISTORY_LENGTH = 100;
  if (history.length > MAX_HISTORY_LENGTH) {
    history = history.slice(-MAX_HISTORY_LENGTH);
  }

  // Gemini APIは会話履歴の開始が 'user' であることを期待するため、
  // 切り詰めた結果先頭が 'model' (assistant) で始まっている場合は、
  // 安全のためそれを削って 'user' から始まるように調整する
  while (history.length > 0 && history[0].role === 'model') {
    history.shift();
  }

  // 最後のユーザー発言の末尾に、強力なフォーマット制約をインジェクションして出力崩れと長文化を完全に防ぐ
  if (lastMessage.parts && lastMessage.parts[0] && typeof lastMessage.parts[0].text === 'string') {
    const rawText = lastMessage.parts[0].text;
    
    // システムの返答ルールをモデルに強制的に意識させるための割り込み命令
    const constraintSuffix = 
      "\n\n(※システムルール遵守：絶対に太字(**)やイタリック(*)、箇条書きなどのマークダウン装飾を使用せず、2〜3文(最大200文字)の簡潔なプレーンテキストで、改行を使わずに1段落で返答してください。過去の会話全体の要約や振り返りは絶対に禁止です。)";
    
    lastMessage.parts[0].text = rawText + constraintSuffix;
  }

  let fullResponse = "";
  let streamStarted = false; // 最初のチャンク出力後は true（以降フォールバック不可）
  let lastErr: unknown = null;
  let isQuotaExceeded = false;

  // 会話機能には Gemini 2.5 Flash Lite を使用
  const chatModels = GEMINI_MODELS;
  for (const model of chatModels) {
    try {
      const streamResult = await client.models.generateContentStream({
        model,
        config: {
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        },
        contents: [
          ...history,
          lastMessage
        ]
      });

      for await (const chunk of streamResult) {
        const chunkText = chunk.text;
        if (chunkText) {
          if (!streamStarted) {
            // 最初の有効チャンクが来たタイミングでヘッダーを送る
            res.writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Transfer-Encoding': 'chunked',
              'Cache-Control': 'no-cache, no-transform',
              'X-Accel-Buffering': 'no', // プロキシのバッファリングを無効化
            });
            res.flushHeaders?.();
            streamStarted = true;
          }
          res.write(chunkText);
          // 圧縮ミドルウェア等が挟まる場合に備えて即時フラッシュ
          (res as unknown as { flush?: () => void }).flush?.();
          fullResponse += chunkText;
        }
      }

      lastErr = null;
      break; // このモデルで正常に完走
    } catch (error) {
      console.error(`Gemini API Error (model: ${model}):`, error);
      lastErr = error;
      if (isQuotaExceededError(error)) {
        isQuotaExceeded = true;
      }
      // すでにクライアントへ書き込み中なら途中で別モデルに切り替えられないので中断
      if (streamStarted) break;
      // まだヘッダー未送信なら次のモデルへフォールバック
    }
  }

  // 全モデルが出力前に失敗した場合
  if (!streamStarted) {
    console.error("All Gemini models failed:", lastErr);
    if (!res.headersSent) {
      if (isQuotaExceeded || isQuotaExceededError(lastErr)) {
        res.status(429).json({
          error: 'quota_exceeded',
          message: '今日はbotたんのお部屋は満員になっちゃった！　また明日ね！',
        });
      } else {
        res.status(500).json({ message: "AI応答の生成に失敗しました。しばらくしてからもう一度お試しください。" });
      }
    }
    return;
  }

  res.end();
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
