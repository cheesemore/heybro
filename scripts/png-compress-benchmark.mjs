/**
 * 对单张 PNG 做多种压缩方案体积对比（像素尺寸不变）。
 * 用法：node scripts/png-compress-benchmark.mjs [输入png路径]
 * 默认：public/assets/battle-floor-bgs/scholomance.png
 * 输出：test_art/png-compress-benchmark/ 下的样例文件 + REPORT.md
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const inputRel =
  process.argv[2] || path.join('public', 'assets', 'battle-floor-bgs', 'scholomance.png');
const input = path.isAbsolute(inputRel) ? inputRel : path.join(root, inputRel);

const outDir = path.join(root, 'test_art', 'png-compress-benchmark');
const pngquantExe = path.join(root, 'node_modules', 'pngquant-bin', 'vendor', 'pngquant.exe');

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function pct(saved, orig) {
  if (orig <= 0) return '—';
  const r = ((orig - saved) / orig) * 100;
  return `${r.toFixed(1)}% smaller`;
}

function runOxipng(filePath) {
  const q = JSON.stringify(filePath);
  execSync(`npx --yes oxipng -o 4 --strip safe ${q}`, {
    cwd: root,
    stdio: process.env.CI ? 'pipe' : 'inherit',
    shell: true,
  });
}

async function main() {
  if (!fs.existsSync(input)) {
    console.error('Input not found:', input);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const buf = await fs.promises.readFile(input);
  const original = buf.length;
  /** @type {{ name: string; file: string; bytes: number; note?: string }[]} */
  const rows = [{ name: 'original', file: path.relative(root, input), bytes: original }];

  // --- sharp：无损 DEFLATE ---
  const sharpLossless = path.join(outDir, 'sharp-lossless-c9-e10.png');
  await sharp(buf).png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toFile(sharpLossless);
  rows.push({
    name: 'sharp PNG lossless',
    file: path.relative(root, sharpLossless),
    bytes: fs.statSync(sharpLossless).size,
    note: 'compressionLevel=9 effort=10',
  });

  // --- sharp：调色板（有损观感，仍为 PNG）---
  for (const { q, colors } of [
    { q: 80, colors: 256 },
    { q: 70, colors: 256 },
    { q: 75, colors: 128 },
  ]) {
    const out = path.join(outDir, `sharp-palette-q${q}-c${colors}.png`);
    await sharp(buf).png({ palette: true, colors, quality: q }).toFile(out);
    rows.push({
      name: `sharp palette`,
      file: path.relative(root, out),
      bytes: fs.statSync(out).size,
      note: `quality=${q} colors=${colors}`,
    });
  }

  // --- pngquant（若已安装 pngquant-bin）---
  if (fs.existsSync(pngquantExe)) {
    for (const quality of ['80-95', '70-85']) {
      const out = path.join(outDir, `pngquant-quality-${quality.replace(/-/g, '_')}.png`);
      execFileSync(pngquantExe, ['--force', '--quality', quality, '--output', out, input], {
        stdio: process.env.CI ? 'pipe' : 'inherit',
      });
      rows.push({
        name: 'pngquant',
        file: path.relative(root, out),
        bytes: fs.statSync(out).size,
        note: `--quality=${quality}`,
      });
    }
  }

  // --- oxipng：仅重打包，无损像素 ---
  const oxiOnOrig = path.join(outDir, 'oxipng-o4-strip-on-original.png');
  fs.copyFileSync(input, oxiOnOrig);
  runOxipng(oxiOnOrig);
  rows.push({
    name: 'oxipng on original',
    file: path.relative(root, oxiOnOrig),
    bytes: fs.statSync(oxiOnOrig).size,
    note: '-o4 --strip safe',
  });

  const oxiOnSharp = path.join(outDir, 'oxipng-o4-strip-after-sharp-lossless.png');
  fs.copyFileSync(sharpLossless, oxiOnSharp);
  runOxipng(oxiOnSharp);
  rows.push({
    name: 'oxipng after sharp lossless',
    file: path.relative(root, oxiOnSharp),
    bytes: fs.statSync(oxiOnSharp).size,
    note: 'chain: sharp lossless → oxipng',
  });

  // --- 参考：同尺寸 WebP 有损（非 PNG）---
  const webpRef = path.join(outDir, 'reference-webp-q80.webp');
  await sharp(buf).webp({ quality: 80 }).toFile(webpRef);
  rows.push({
    name: 'WebP q=80 (reference only)',
    file: path.relative(root, webpRef),
    bytes: fs.statSync(webpRef).size,
    note: '换格式，仅对比体积',
  });

  const meta = await sharp(buf).metadata();
  const lines = [
    '# PNG 压缩基准（单图）',
    '',
    `- 输入: \`${path.relative(root, input)}\``,
    `- 原始大小: **${fmtBytes(original)}**`,
    `- 像素: **${meta.width}×${meta.height}**`,
    `- 生成目录: \`${path.relative(root, outDir)}\``,
    '',
    '| 方案 | 输出文件 | 大小 | 相对原图 | 备注 |',
    '|------|----------|------|----------|------|',
  ];
  for (const r of rows) {
    if (r.bytes === original && r.name === 'original') {
      lines.push(`| ${r.name} | \`${r.file}\` | ${fmtBytes(r.bytes)} | — | |`);
      continue;
    }
    const rel = pct(r.bytes, original);
    const note = r.note ? r.note.replace(/\|/g, '\\|') : '';
    lines.push(`| ${r.name} | \`${r.file}\` | ${fmtBytes(r.bytes)} | ${rel} | ${note} |`);
  }
  lines.push('', '说明：sharp palette / pngquant 为「颜色量化类」有损观感；oxipng 为无损像素。');
  if (!fs.existsSync(pngquantExe)) {
    lines.push('', '（本机未找到 `node_modules/pngquant-bin/vendor/pngquant.exe`，已跳过 pngquant 行；可 `npm i -D pngquant-bin` 后重跑。）');
  }

  const reportPath = path.join(outDir, 'REPORT.md');
  fs.writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  console.log('\nWritten:', path.relative(root, reportPath));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
