import { koeiromapFreeV1 } from "@/features/koeiromap/koeiromap";
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export default async function handler(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const message = body.message;
  const speakerX = body.speakerX;
  const speakerY = body.speakerY;
  const style = body.style;
  const apiKey = body.apiKey;

  const voice = await koeiromapFreeV1(message, speakerX, speakerY, style, apiKey);

  return new Response(JSON.stringify(voice), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
