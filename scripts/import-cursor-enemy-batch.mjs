/**
 * After Cursor GenerateImage writes enemy_<paint>.png into assets/, run:
 *   node scripts/import-cursor-enemy-batch.mjs <absolute-assets-dir>
 * Default: current Cursor project assets path (edit if your machine differs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportEnemyPngFromBuffer } from './enemy-art-export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const DEFAULT_ASSETS =
  'C:\\Users\\Cheese more\\.cursor\\projects\\C-Users-CHEESE-1-AppData-Local-Temp-dedcbdc0-1ab2-48e8-a5eb-cb86ada7fbca\\assets';

const FILES = [
  ['enemy_grunt.png', 'grunt'],
  ['enemy_wolf.png', 'wolf'],
  ['enemy_dread_warrior.png', 'dread_warrior'],
  ['enemy_raider.png', 'raider'],
  ['enemy_beserker.png', 'beserker'],
  ['enemy_kodo.png', 'kodo'],
  ['enemy_ultralisk.png', 'ultralisk'],
  ['enemy_abomination.png', 'abomination'],
  ['enemy_headhunter.png', 'headhunter'],
  ['enemy_darkspear.png', 'darkspear'],
  ['enemy_shaman.png', 'shaman'],
  ['enemy_batrider.png', 'batrider'],
  ['enemy_catapult.png', 'catapult'],
  ['enemy_mirror.png', 'mirror'],
  ['enemy_boss_farseer.png', 'boss_farseer'],
  ['enemy_boss_tauren.png', 'boss_tauren'],
  ['enemy_boss_blademaster.png', 'boss_blademaster'],
];

const dir = process.argv[2] || DEFAULT_ASSETS;
if (!fs.existsSync(dir)) {
  console.error('Assets dir not found:', dir);
  process.exit(1);
}

for (const [file, paintId] of FILES) {
  const fp = path.join(dir, file);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing:', fp);
    continue;
  }
  const buf = fs.readFileSync(fp);
  const r = await exportEnemyPngFromBuffer(buf, paintId);
  console.log('OK', paintId, r.outFile, r.width, r.height);
}
