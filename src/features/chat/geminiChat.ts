import { Message } from "../messages/messages";

export async function getGeminiResponseStream(messages: Message[], userName?: string, lang?: 'ja' | 'en', regularLevel?: number) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat`, {
    headers: headers,
    method: "POST",
    body: JSON.stringify({ messages, userName, lang, regularLevel }),
  });

  if (!res.ok || !res.body) {
    if (res.status === 429) {
      throw new Error("quota_exceeded");
    }
    throw new Error("Failed to connect to Chat API");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            controller.enqueue(chunk);
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return stream;
}
