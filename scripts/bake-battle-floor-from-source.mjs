/**
 * 将单张俯视图源图居中裁成 1080:1920，缩放到 GAME 尺寸，写入 public/assets/battle-floor-bgs 下全部 PNG。
 * 用法：node scripts/bake-battle-floor-from-source.mjs [源图路径]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'battle-floor-bgs');
const GAME_W = 1080;
const GAME_H = 1920;
const TARGET_ASPECT = GAME_W / GAME_H;

const defaultSrc = path.join(
  'C:',
  'Users',
  'Somebody',
  '.cursor',
  'projects',
  'e-cursor-heybro',
  'assets',
  'ragefire-chasm-battle-floor-topdown.png',
);
const srcPath = process.argv[2] ?? defaultSrc;

if (!fs.existsSync(srcPath)) {
  console.error('源图不存在:', srcPath);
  process.exit(1);
}
if (!fs.existsSync(OUT_DIR)) {
  console.error('输出目录不存在:', OUT_DIR);
  process.exit(1);
}

const meta = await sharp(srcPath).metadata();
const w = meta.width ?? 0;
const h = meta.height ?? 0;
if (!w || !h) {
  console.error('无法读取源图尺寸');
  process.exit(1);
}

const srcAspect = w / h;
let cropLeft;
let cropTop;
let cropW;
let cropH;
if (srcAspect > TARGET_ASPECT) {
  cropH = h;
  cropW = Math.round(h * TARGET_ASPECT);
  cropLeft = Math.round((w - cropW) / 2);
  cropTop = 0;
} else {
  cropW = w;
  cropH = Math.round(w / TARGET_ASPECT);
  cropLeft = 0;
  cropTop = Math.round((h - cropH) / 2);
}

const pipeline = sharp(srcPath)
  .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
  .resize(GAME_W, GAME_H, { fit: 'fill' })
  .png();

const buf = await pipeline.toBuffer();
const names = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png'));
if (!names.length) {
  console.error('battle-floor-bgs 下无 png');
  process.exit(1);
}
for (const name of names.sort()) {
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, buf);
  console.log('写入', out);
}
console.log('完成，共', names.length, '张，裁切区域', { cropLeft, cropTop, cropW, cropH }, '→', GAME_W, 'x', GAME_H);
