import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const EXPORT_MAX_EDGE = 128;

export async function exportEnemyPngFromBuffer(buf, paintId) {
  const trimmed = await sharp(buf)
    .trim()
    .resize({
      width: EXPORT_MAX_EDGE,
      height: EXPORT_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  const outDir = path.join(root, 'public', 'assets', 'enemies');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${paintId}.png`);
  fs.writeFileSync(outFile, trimmed);
  const meta = await sharp(outFile).metadata();
  return { outFile, width: meta.width, height: meta.height };
}
