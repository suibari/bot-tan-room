// Compatibility for clients cached before the Irodori migration.
import type { NextRequest } from "next/server";
import tts from "./tts";
export const runtime = "edge";
export default function handler(req: NextRequest): Promise<Response> {
  if (req.method !== "GET") return Promise.resolve(new Response(null, { status: 405 }));
  return tts(new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: new URL(req.url).searchParams.get("text") }),
  }) as NextRequest);
}
