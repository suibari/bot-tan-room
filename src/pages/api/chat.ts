import { GoogleGenAI } from "@google/genai";
import { kv } from "@vercel/kv";
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

  const { messages, userName } = req.body;

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

  // Fetch recent history from KV for context (optional, but good for shared context awareness)
  // For now, we rely on the client sending the conversation history, but the prompt implies "shared history".
  // If "shared history" impacts the bot's *knowledge*, we should prepend relevant past conversation.
  // However, "messages" from body usually contains the current session.
  // The user requirement says "Conversation history... common to all users".
  // This likely means I should Load recent history from KV and append the new message?
  // Or maybe the client sends the whole history?
  // Let's assume the client sends the message log it has (which it fetched from history).
  // But wait, if multiple users talk, the client might be outdated.
  // It's safer to fetch recent history from KV to feed the LLM context if we want "Chat Room" style context.
  // Let's grab the last 10-20 messages from KV to serve as context.

  let recentHistory: any[] = [];
  try {
    const kvHistory = await kv.lrange("chat_history", -20, -1);
    recentHistory = kvHistory.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: `[${m.userName || (m.role === 'assistant' ? 'Bot' : 'User')}] ${m.content}` }],
      // Annotated with name so bot knows who said what
    }));
  } catch (e) {
    console.warn("Failed to fetch KV history for context", e);
  }

  // Combine passed system prompt with recent history from server + current message
  // Note: 'messages' body in typical ChatVRM includes system prompt + current session log.
  // If we want "global shared state", we should probably ignore most of 'messages' passed from client except the system prompt?
  // Or maybe just append the new message to the global history.
  // Simplest interpretation: Use the messages passed by client (which includes system prompt) 
  // but maybe replace the middle implementation with server history?
  // Actually, client 'chatLog' will now be initialized from server history.
  // So client sends [System, ...History, CurrentUserMessage].
  // This seems correct. So 'history' variable above is already based on shared history provided by client state.
  // Just proceed.

  // Save USER message to KV
  if (lastMessage) {
    const userMsg = {
      role: "user",
      content: lastMessage.parts[0].text,
      userName: userName || "Guest",
      timestamp: Date.now()
    };
    try {
      await kv.rpush("chat_history", userMsg);
    } catch (e) { console.error("KV Error", e); }
  }



  if (!lastMessage) {
    res.status(400).json({ message: "No user message found" });
    return;
  }

  try {
    let fullResponse = "";
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
        fullResponse += chunkText;
      }
    }

    // Save ASSISTANT message to KV
    if (fullResponse) {
      const assistantMsg = {
        role: "assistant",
        content: fullResponse,
        timestamp: Date.now()
      };
      try {
        await kv.rpush("chat_history", assistantMsg);
      } catch (e) { console.error("KV Error (Assistant)", e); }
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
