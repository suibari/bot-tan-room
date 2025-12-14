import { Message } from "../messages/messages";

export async function getGeminiResponseStream(messages: Message[]) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Failed to connect to Chat API");
  }

  const reader = response.body.getReader();
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
