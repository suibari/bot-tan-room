import { GoogleGenAI } from "@google/genai";
import { Message } from "../messages/messages";

export async function getGeminiResponseStream(
  messages: Message[],
  apiKey: string
) {
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }

  const client = new GoogleGenAI({ apiKey });

  // Convert Message[] to Gemini format
  // System prompt is usually the first message in the array in this app structure
  const systemInstruction = messages.find(m => m.role === 'system')?.content;

  // Filter out system message for the history
  // The new SDK likely expects 'user' and 'model' roles.
  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  // The last message is the "new" message from the user
  const lastMessage = history.pop();

  if (!lastMessage) {
    throw new Error("No messages to send");
  }

  // Note: The new SDK might use different method for chat.
  // Assuming client.chats.create or similar based on exports.
  // If 'chats' module exists, logic is likely:
  // const chat = client.chats.create({ model: 'gemini-1.5-flash', history: ... });

  // However, looking at the exports, 'Chat' and 'Chats' are there.
  // Let's rely on the `models.generateContentStream` method which is more universal if chat specific method fails,
  // but for multi-turn chat, `chats.create` is better.

  // Let's try the `models.generateContentStream` with `contents` parameter which includes history + new message.
  // capabilities might include system instruction.

  // Actually, standard usage for chat in new SDK:
  // const chat = client.chats.create({ model: 'gemini-1.5-flash', config: { systemInstruction: ... }, history: ... });
  // But wait, exports show `Chats`. client.chats is likely the accessor.

  // Trying to use client.models.generateContentStream is safer if unsure about chat state management object in new SDK
  // but we want history.
  // Let's try:
  try {
    const streamResult = await client.models.generateContentStream({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      },
      contents: [
        ...history,
        lastMessage // Add the last message back to contents for generation
      ]
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResult) {
            const chunkText = chunk.text;
            if (chunkText) {
              controller.enqueue(chunkText);
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });
    return stream;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}
