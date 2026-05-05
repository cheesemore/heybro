/**
 * 读取 prompt-template.txt、sprite-sheet-template.txt 与 appeal-blocks，合并 characterSetsData 输出 manifest.json
 * 运行：node scripts/build-character-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPEAL_BLOCKS } from './appeal-blocks.mjs';
import { CHARACTER_SETS } from './characterSetsData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'public', 'character-prompts', 'prompt-template.txt');
const spriteTemplatePath = path.join(root, 'public', 'character-prompts', 'sprite-sheet-template.txt');
const outPath = path.join(root, 'public', 'character-prompts', 'manifest.json');

const template = fs.readFileSync(templatePath, 'utf8');
const spriteTemplate = fs.readFileSync(spriteTemplatePath, 'utf8');

const CLASS_LABEL = {
  warrior: '战士',
  mage: '法师',
  priest: '牧师',
  archer: '射手',
  knight: '骑士',
};

const manifest = CHARACTER_SETS.map((row) => {
  const appeal = APPEAL_BLOCKS[row.appealTier];
  if (!appeal) throw new Error(`Unknown appealTier: ${row.appealTier} for ${row.id}`);
  const prompt = template.replace('<<APPEAL>>', appeal).replace('<<CHARACTER>>', row.character.trim());
  const classLabel = CLASS_LABEL[row.class];
  const spritePrompt = spriteTemplate
    .replaceAll('<<NAME>>', row.nameZh)
    .replaceAll('<<CLASS_LABEL>>', classLabel)
    .replaceAll('<<ID>>', row.id);
  return {
    id: row.id,
    class: row.class,
    classLabel,
    nameZh: row.nameZh,
    ageArchetype: row.ageArchetype,
    appealTier: row.appealTier,
    tags: row.tags ?? [],
    summary: row.summary.trim(),
    prompt,
    spritePrompt,
  };
});

if (manifest.length !== 50) {
  throw new Error(`Expected 50 sets, got ${manifest.length}`);
}

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Wrote', outPath, manifest.length, 'entries');
