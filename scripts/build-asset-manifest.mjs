/**
 * 扫描 public 内游戏用到的图片，生成 src/game/config/assetManifest.json
 * 运行：node scripts/build-asset-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const outPath = path.join(root, 'src', 'game', 'config', 'assetManifest.json');

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
/** 仅开发用静态页，不进游戏预加载 */
const EXCLUDE_PREFIXES = ['character-prompts/'];

function walk(dir, baseRel, out) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    const rel = baseRel ? `${baseRel}/${name.name}` : name.name;
    if (name.isDirectory()) {
      if (EXCLUDE_PREFIXES.some((p) => rel === p.replace(/\/$/, '') || rel.startsWith(p))) continue;
      walk(abs, rel, out);
      continue;
    }
    if (!name.isFile()) continue;
    const ext = path.extname(name.name).toLowerCase();
    if (!IMG_EXT.has(ext)) continue;
    const st = fs.statSync(abs);
    if (st.size < 1) continue;
    out.push(rel.replace(/\\/g, '/'));
  }
}

const paths = [];
walk(publicDir, '', paths);
paths.sort();

const doc = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  paths,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath} (${paths.length} assets)`);
