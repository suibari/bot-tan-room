import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { NextApiRequest, NextApiResponse } from 'next';

export const runtime = 'edge';

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({
        Bucket: process.env.CF_R2_BUCKET_NAME,
        Key: "bot-tan.vrm",
      }),
      { expiresIn: 3600 }
    );
    res.redirect(302, url);
  } catch {
    res.status(500).json({ error: 'Failed to generate model URL' });
  }
}
