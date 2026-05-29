import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "@/features/constants/aiModels";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
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
  const systemInstruction = messages.find((m: any) => m.role === 'system')?.content;

  const history = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const lastMessage = history.pop();

  // 文脈はクライアントが送る history（現在のセッションの会話ログ）をそのまま使う。
  // 会話履歴の DB(KV) 連携は廃止。

  if (!lastMessage) {
    res.status(400).json({ message: "No user message found" });
    return;
  }

  let fullResponse = "";
  let streamStarted = false; // 最初のチャンク出力後は true（以降フォールバック不可）
  let lastErr: unknown = null;

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
      // すでにクライアントへ書き込み中なら途中で別モデルに切り替えられないので中断
      if (streamStarted) break;
      // まだヘッダー未送信なら次のモデルへフォールバック
    }
  }

  // 全モデルが出力前に失敗した場合
  if (!streamStarted) {
    console.error("All Gemini models failed:", lastErr);
    if (!res.headersSent) {
      res.status(500).json({ message: "AI応答の生成に失敗しました。しばらくしてからもう一度お試しください。" });
    }
    return;
  }

  res.end();
}
