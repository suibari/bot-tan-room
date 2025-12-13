import fs from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const filePath = path.join(process.cwd(), 'models', 'bot-tan.vrm');

  if (!fs.existsSync(filePath)) {
    // Fallback to public sample if specific model doesn't exist (for development safety)
    // In production, this should probably 404 if the secure model isn't there
    const fallbackPath = path.join(process.cwd(), 'public', 'AvatarSample_B.vrm');
    if (fs.existsSync(fallbackPath)) {
      const stat = fs.statSync(fallbackPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
      });
      const readStream = fs.createReadStream(fallbackPath);
      readStream.pipe(res);
      return;
    }
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
  });

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
}
