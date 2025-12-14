import { GoogleGenAI } from "@google/genai";
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

  const { messages } = req.body;

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

  if (!lastMessage) {
    res.status(400).json({ message: "No user message found" });
    return;
  }

  try {
    const streamResult = await client.models.generateContentStream({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      },
      contents: [
        ...history,
        lastMessage
      ]
    });

    // Set headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    for await (const chunk of streamResult) {
      const chunkText = chunk.text;
      if (chunkText) {
        res.write(chunkText);
      }
    }

    res.end();

  } catch (error) {
    console.error("Gemini API Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal Server Error" });
    } else {
      res.end();
    }
  }
}
