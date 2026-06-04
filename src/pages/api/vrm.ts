import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Dev: serve local file directly to avoid CORS issues with localhost
  if (process.env.NODE_ENV === 'development') {
    const filePath = path.join(process.cwd(), 'models', 'bot-tan.vrm');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

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
