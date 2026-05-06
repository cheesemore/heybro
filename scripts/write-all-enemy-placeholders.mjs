/**
 * Writes a distinct tiny placeholder PNG for every EnemyPaintKind (SVG → sharp → same 128 pipeline as imports).
 * For local testing until real art exists. Run: node scripts/write-all-enemy-placeholders.mjs
 */
import sharp from 'sharp';
import { ALL_ENEMY_PAINT_IDS } from './enemy-art-subjects.mjs';
import { exportEnemyPngFromBuffer } from './enemy-art-export.mjs';

const hues = [140, 200, 260, 30, 0, 60, 300, 180, 220, 100, 320, 40, 10, 280, 160, 240, 350];

for (let i = 0; i < ALL_ENEMY_PAINT_IDS.length; i++) {
  const id = ALL_ENEMY_PAINT_IDS[i];
  const h = hues[i % hues.length];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="220">
  <rect width="200" height="220" fill="#f8fafc"/>
  <rect x="20" y="40" width="160" height="140" rx="12" fill="hsl(${h} 35% 42%)"/>
  <text x="100" y="118" text-anchor="middle" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="11">${id}</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const r = await exportEnemyPngFromBuffer(buf, id);
  console.log(id, r.width, r.height);
}
