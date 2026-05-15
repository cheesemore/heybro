/**
 * 1) 备份 public/assets 下指定目录的全部 PNG 到 E:\\cursor\\temp（保留子目录名）
 * 2) 背景图：长宽各减半 → pngquant --quality=70-85 → 写回原路径
 * 3) 敌方立绘等目录：仅 pngquant --quality=70-85 → 写回原路径
 *
 * 用法：node scripts/asset-backup-compress-resize.mjs
 * 依赖：sharp、pngquant-bin（devDependencies）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const BACKUP_ROOT = path.join('E:', 'cursor', 'temp', `heybro-assets-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);

const BG_REL = ['assets/dungeon-bgs', 'assets/battle-floor-bgs'];
const PORTRAIT_REL = [
  'assets/enemies',
  'assets/wow-mobs-circle',
  'assets/wow-bosses',
  'assets/wow-bosses-circle',
];

const pngquantExe = path.join(root, 'node_modules', 'pngquant-bin', 'vendor', 'pngquant.exe');

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
}

function copyDirPreserve(relFromPublic, destRoot) {
  const src = path.join(root, 'public', relFromPublic);
  const dest = path.join(destRoot, 'public', relFromPublic);
  fs.mkdirSync(dest, { recursive: true });
  const files = listPngs(src);
  for (const f of files) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  return files.length;
}

function pngquantFile(inputAbs, outputAbs) {
  execFileSync(pngquantExe, ['--quality', '70-85', '--force', '--output', outputAbs, inputAbs], {
    stdio: 'inherit',
  });
}

/** 用临时目录再 copy 覆盖，避免 Windows 上对目标 PNG rename 覆盖触发 EPERM */
function pngquantInPlace(absPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heybro-pq-'));
  try {
    const out = path.join(dir, 'out.png');
    pngquantFile(absPath, out);
    fs.copyFileSync(out, absPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function halveThenQuant(absPath) {
  const meta = await sharp(absPath).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 2 || h < 2) throw new Error(`Image too small to halve: ${absPath} (${w}x${h})`);
  const nw = Math.max(1, Math.round(w / 2));
  const nh = Math.max(1, Math.round(h / 2));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heybro-half-'));
  try {
    const resized = path.join(dir, 'half.png');
    const quant = path.join(dir, 'quant.png');
    await sharp(absPath).resize(nw, nh).png({ compressionLevel: 6 }).toFile(resized);
    pngquantFile(resized, quant);
    fs.copyFileSync(quant, absPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (!fs.existsSync(pngquantExe)) {
    console.error('Missing pngquant. Run: npm install pngquant-bin --save-dev');
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  console.log('Backup root:', BACKUP_ROOT);

  let backed = 0;
  for (const rel of [...BG_REL, ...PORTRAIT_REL]) {
    const n = copyDirPreserve(rel, BACKUP_ROOT);
    console.log(`Backed up ${n} files -> public/${rel}`);
    backed += n;
  }
  console.log('Total PNG backed up:', backed);

  for (const rel of BG_REL) {
    const dir = path.join(root, 'public', rel);
    const files = listPngs(dir);
    console.log(`\n[HALF + pngquant] public/${rel} (${files.length} files)`);
    for (const f of files) {
      const abs = path.join(dir, f);
      console.log('  ', f);
      await halveThenQuant(abs);
    }
  }

  for (const rel of PORTRAIT_REL) {
    const dir = path.join(root, 'public', rel);
    const files = listPngs(dir);
    console.log(`\n[pngquant only] public/${rel} (${files.length} files)`);
    for (const f of files) {
      const abs = path.join(dir, f);
      console.log('  ', f);
      pngquantInPlace(abs);
    }
  }

  console.log('\nDone. Originals copied to:', BACKUP_ROOT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
