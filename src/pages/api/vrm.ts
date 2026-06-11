import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export default async function handler(_req: NextRequest): Promise<Response> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CF_R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error('[API vrm] Missing env vars:', {
      CF_ACCOUNT_ID: !!accountId,
      CF_R2_ACCESS_KEY_ID: !!accessKeyId,
      CF_R2_SECRET_ACCESS_KEY: !!secretAccessKey,
      CF_R2_BUCKET_NAME: !!bucketName,
    });
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: bucketName, Key: "bot-tan.vrm" }),
      { expiresIn: 3600 }
    );
    return Response.redirect(url, 302);
  } catch (e) {
    console.error('[API vrm] Failed to generate signed URL:', e);
    return new Response(JSON.stringify({ error: 'Failed to generate model URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
