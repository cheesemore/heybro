import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'assets', 'enemies', 'grunt.png');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="280">
  <rect width="256" height="280" fill="#f8fafc"/>
  <ellipse cx="128" cy="160" rx="72" ry="88" fill="#365314"/>
  <circle cx="128" cy="72" r="48" fill="#4d7c0f"/>
  <text x="128" y="268" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="11">placeholder grunt</text>
</svg>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(out);
const m = await sharp(out).metadata();
console.log('Wrote', out, m.width, 'x', m.height);
