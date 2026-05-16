/**
 * 为 gearItems.json 中每件装备生成占位 PNG：public/assets/gear/<gearId>.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const GEAR_ITEMS = path.join(root, 'src/game/config/gearItems.json');
const OUT_DIR = path.join(root, 'public', 'assets', 'gear');

const SIZE = 128;

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string} gearId */
function svgForGearId(gearId) {
  const dot = gearId.lastIndexOf('.');
  const line1 = dot >= 0 ? gearId.slice(0, dot) : gearId;
  const line2 = dot >= 0 ? gearId.slice(dot + 1) : '';
  const fs1 = line1.length > 18 ? 9 : line1.length > 14 ? 10 : 11;
  const fs2 = line2.length > 12 ? 11 : 13;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="12" fill="#1e293b"/>
  <rect x="8" y="8" width="${SIZE - 16}" height="${SIZE - 16}" rx="8" fill="#334155"/>
  <text x="64" y="52" text-anchor="middle" fill="#94a3b8" font-family="Consolas,monospace" font-size="9">GEAR</text>
  <text x="64" y="${line2 ? 72 : 78}" text-anchor="middle" fill="#f8fafc" font-family="Consolas,monospace" font-size="${fs1}" font-weight="700">${escapeXml(line1)}</text>
  ${
    line2
      ? `<text x="64" y="92" text-anchor="middle" fill="#cbd5e1" font-family="Consolas,monospace" font-size="${fs2}" font-weight="600">${escapeXml(line2)}</text>`
      : ''
  }
  <text x="64" y="112" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="8">placeholder</text>
</svg>`;
}

async function main() {
  const doc = JSON.parse(fs.readFileSync(GEAR_ITEMS, 'utf8'));
  const items = doc.items ?? [];
  if (!items.length) throw new Error('gearItems.json items[] 为空');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let n = 0;
  for (const row of items) {
    const gearId = row.gearId;
    if (typeof gearId !== 'string' || !gearId) continue;
    const out = path.join(OUT_DIR, `${gearId}.png`);
    await sharp(Buffer.from(svgForGearId(gearId))).png().toFile(out);
    n += 1;
  }

  console.log(`Wrote ${n} gear icon placeholders → ${path.relative(root, OUT_DIR)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
