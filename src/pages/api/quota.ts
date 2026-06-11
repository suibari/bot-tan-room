import type { NextApiRequest, NextApiResponse } from "next";

export const runtime = 'edge';
import { getDailyLimitStatus } from "@/lib/rateLimit";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  try {
    const rateLimit = await getDailyLimitStatus();
    return res.status(200).json(rateLimit);
  } catch (error) {
    console.error("[API quota] Error getting rate limit status:", error);
    return res.status(500).json({ allowed: true, count: 0, limit: 500, error: String(error) });
  }
}
