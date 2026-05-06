/**
 * Import an existing PNG (e.g. from Cursor image gen) → same sharp pipeline as enemy-art-pipeline.
 * Usage: node scripts/process-imported-enemy-png.mjs <absolute-or-relative-input.png> <paintId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportEnemyPngFromBuffer } from './enemy-art-export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const input = process.argv[2];
const paintId = process.argv[3];
if (!input || !paintId) {
  console.error('Usage: node scripts/process-imported-enemy-png.mjs <input.png> <paintId>');
  process.exit(1);
}

const abs = path.isAbsolute(input) ? input : path.join(root, input);
const buf = fs.readFileSync(abs);
const r = await exportEnemyPngFromBuffer(buf, paintId);
console.log('OK', r.outFile, r.width, r.height);
