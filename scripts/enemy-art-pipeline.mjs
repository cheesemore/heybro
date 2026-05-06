/**
 * OpenAI Images → sharp → public/assets/enemies/<id>.png
 * Usage:
 *   node scripts/enemy-art-pipeline.mjs --id grunt
 *   node scripts/enemy-art-pipeline.mjs --all
 * Requires: OPENAI_API_KEY
 * Post-process: trim + max edge 128px PNG only (never downscale-to-32 experiments).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE_WESTERN_INDIE_CARD } from './enemy-art-style.mjs';
import { ALL_ENEMY_PAINT_IDS, ENEMY_ART_SUBJECTS } from './enemy-art-subjects.mjs';
import { exportEnemyPngFromBuffer } from './enemy-art-export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const BOSS_JSON_TO_PAINT = {
  farseeer: 'boss_farseer',
  tauren: 'boss_tauren',
  blademaster: 'boss_blademaster',
};

function loadJson(rel) {
  const p = path.join(root, 'src', 'game', 'config', rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function displayNameForPaint(paintId) {
  const enemies = loadJson('enemies.json');
  if (enemies[paintId]?.name) return enemies[paintId].name;
  const bosses = loadJson('bosses.json');
  for (const [bj, paint] of Object.entries(BOSS_JSON_TO_PAINT)) {
    if (paint === paintId && bosses[bj]?.name) return bosses[bj].name;
  }
  return paintId;
}

function buildPrompt(paintId) {
  const subject = ENEMY_ART_SUBJECTS[paintId];
  if (!subject) throw new Error(`No ENEMY_ART_SUBJECTS entry for: ${paintId}`);
  const nameZh = displayNameForPaint(paintId);
  return [
    STYLE_WESTERN_INDIE_CARD,
    `Single full-body standing character or compact war machine, one subject only.`,
    subject,
    `Pure solid white background (#ffffff), no ground plane, no frame, no UI, no text, no watermark.`,
    `Game unit id "${paintId}", display name context: ${nameZh}.`,
  ].join(' ');
}

function parseArgs(argv) {
  const out = { id: null, all: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--all') out.all = true;
    else if (argv[i] === '--id' && argv[i + 1]) out.id = argv[++i];
  }
  return out;
}

async function openAiGenerateImageB64(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
      quality: 'standard',
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json);
    throw new Error(`OpenAI images error ${res.status}: ${msg}`);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI response missing b64_json');
  return Buffer.from(b64, 'base64');
}

async function runOne(paintId) {
  const prompt = buildPrompt(paintId);
  console.log(`[${paintId}] prompt head:`, prompt.slice(0, 120) + '…');
  const buf = await openAiGenerateImageB64(prompt);
  const { outFile, width, height } = await exportEnemyPngFromBuffer(buf, paintId);
  console.log(`[${paintId}] wrote`, outFile, `${width}x${height}`);
}

async function main() {
  const { id, all } = parseArgs(process.argv);
  const ids = all ? [...ALL_ENEMY_PAINT_IDS] : id ? [id] : [];
  if (ids.length === 0) {
    console.error('Usage: node scripts/enemy-art-pipeline.mjs --id <paintId> | --all');
    process.exit(1);
  }
  for (const paintId of ids) {
    if (!ENEMY_ART_SUBJECTS[paintId]) {
      console.error('Unknown paint id:', paintId);
      process.exit(1);
    }
    await runOne(paintId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
