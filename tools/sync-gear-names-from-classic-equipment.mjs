/**
 * 将 tools/classic-vanilla-dungeon-equipment.json 中的中英文装备名
 * 写入 src/game/config/gearItems.json（按 dungeonId + slotKind 对齐）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REF = path.join(__dirname, 'classic-vanilla-dungeon-equipment.json');
const OUT = path.join(root, 'src/game/config/gearItems.json');
const REGISTRY = path.join(root, 'src/game/config/wowBookRegistry.json');

const SLOT_MAP = {
  helm: 'head',
  necklace: 'neck',
  shoulder: 'shoulder',
  chest: 'chest',
  belt: 'waist',
  legs: 'legs',
  boots: 'feet',
  bracers: 'wrist',
  gloves: 'hands',
  ring: 'finger',
  cloak: 'back',
  offhand: 'offHand',
  weapon: 'mainHand',
  trinket: 'trinket',
};

const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const gear = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const cnToId = new Map(reg.dungeons.map((d) => [d.nameCn, d.dungeonId]));

/** @type {Map<string, { nameCn: string, nameEn: string }>} */
const nameByGearId = new Map();
for (const d of ref) {
  const did = cnToId.get(d.dungeon_name_cn);
  if (!did) throw new Error(`reference 副本未在 registry：${d.dungeon_name_cn}`);
  for (const e of d.equipment) {
    const sk = SLOT_MAP[e.slot_en];
    if (!sk) throw new Error(`未知 slot_en：${e.slot_en}（${d.dungeon_name_cn}）`);
    nameByGearId.set(`${did}.${sk}`, { nameCn: e.name_cn, nameEn: e.name_en });
  }
}

if (nameByGearId.size !== gear.items.length) {
  throw new Error(`映射条数 ${nameByGearId.size} ≠ gearItems ${gear.items.length}`);
}

let changed = 0;
const unmapped = [];
for (const it of gear.items) {
  const n = nameByGearId.get(it.gearId);
  if (!n) {
    unmapped.push(it.gearId);
    continue;
  }
  if (it.nameCn !== n.nameCn) {
    it.nameCn = n.nameCn;
    changed += 1;
  }
  if (it.nameEn !== n.nameEn) {
    it.nameEn = n.nameEn;
    changed += 1;
  }
}

if (unmapped.length) {
  throw new Error(`未匹配 gearId：${unmapped.join(', ')}`);
}

const placeholder = gear.items.filter((it) => /·/.test(it.nameCn));
if (placeholder.length) {
  console.warn('仍含「副本·部位」占位名：', placeholder.map((i) => i.gearId));
}

const note =
  '【可手填】items[].nameCn / nameEn（默认来自 tools/classic-vanilla-dungeon-equipment.json；npm run gen:gear-items 会保留已写入名称）';
if (!gear.editConvention.includes('classic-vanilla-dungeon-equipment')) {
  gear.editConvention = gear.editConvention.replace(
    /【可手填】items\[\]\.nameCn[^；]*/,
    note,
  );
}

fs.writeFileSync(OUT, JSON.stringify(gear, null, 2) + '\n', 'utf8');
console.log(`Wrote ${OUT}`);
console.log(`  items: ${gear.items.length}, 更新字段次数: ${changed}, 占位残留: ${placeholder.length}`);
