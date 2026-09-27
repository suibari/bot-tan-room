import type { NextRequest } from "next/server";
import { ttsConfig } from "../../features/tts/config";

export const runtime = "edge";
const json = (error: string, status: number) => new Response(JSON.stringify({ error }), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== "POST") return json("Method not allowed", 405);
  let text: unknown;
  try {
    text = (await req.json()).text;
  } catch {
    return json("Invalid JSON", 400);
  }
  if (typeof text !== "string" || !text.trim() || Array.from(text.trim()).length > 300) {
    return json("text must contain 1–300 characters", 400);
  }
  const config = ttsConfig();
  if (!config.headers) return json("TTS Access credentials are not configured", 503);
  try {
    const upstream = await fetch(`${config.url}/synthesize`, {
      method: "POST",
      headers: { ...config.headers, "Content-Type": "application/json", Accept: "audio/wav" },
      body: JSON.stringify({ text: text.trim(), wait_load: true }),
      signal: AbortSignal.timeout(90000),
      redirect: "manual",
    });
    if (!upstream.ok) {
      return json("TTS synthesis failed", [429, 503].includes(upstream.status) ? upstream.status : 502);
    }
    if (!upstream.headers.get("content-type")?.includes("audio/wav")) {
      return json("Invalid TTS audio response", 502);
    }
    return new Response(await upstream.arrayBuffer(), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return json("TTS unavailable", error instanceof Error && error.name === "TimeoutError" ? 504 : 502);
  }
}
