/**
 * 递增 src/game/version.ts 中的 GAME_BUILD（供 git pre-commit 调用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const file = path.join(root, 'src', 'game', 'version.ts');

let s = fs.readFileSync(file, 'utf8');
const m = s.match(/export const GAME_BUILD = (\d+)/u);
if (!m) {
  console.error('bump-build: GAME_BUILD not found in', file);
  process.exit(1);
}
const next = parseInt(m[1], 10) + 1;
s = s.replace(/export const GAME_BUILD = \d+/u, `export const GAME_BUILD = ${next}`);
fs.writeFileSync(file, s);
console.log(`bump-build: GAME_BUILD -> ${next}`);
