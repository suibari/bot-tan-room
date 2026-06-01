import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const input = join(__dirname, '../public/favicon.png');
const outDir = join(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(input).resize(size, size).toFile(join(outDir, name));
  console.log(`Generated ${name}`);
}
