/**
 * 各副本 14 件装备仅落在本副本章节：主手=末章，饰品=倒数第二章，其余 12 部位均衡分摊到各章（每章约 1～2 件，章数多时多为 1 件）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REGISTRY = path.join(root, 'src/game/config/wowBookRegistry.json');
const GEAR_ITEMS = path.join(root, 'src/game/config/gearItems.json');
const STATS_OUT = path.join(root, 'src/game/config/gearDropStats.json');

const FLEX_KINDS = [
  'head',
  'neck',
  'shoulder',
  'chest',
  'waist',
  'legs',
  'feet',
  'wrist',
  'hands',
  'finger',
  'back',
  'offHand',
];

function gearEntry(gearId) {
  return { kind: 'gear', gearId };
}

/** @param {Map<string, object>} gearByKind */
function assignDungeonDrops(dungeon, chaptersInDungeon, gearByKind) {
  const sorted = chaptersInDungeon.slice().sort((a, b) => a.chapterIndex - b.chapterIndex);
  const C = sorted.length;
  if (C < 2) {
    throw new Error(`副本 ${dungeon.dungeonId} 章节数 ${C} < 2`);
  }

  const dropsByIdx = Array.from({ length: C }, () => []);
  const gid = (kind) => gearByKind.get(kind).gearId;

  dropsByIdx[C - 1].push(gearEntry(gid('mainHand')));
  dropsByIdx[C - 2].push(gearEntry(gid('trinket')));

  for (let i = 0; i < FLEX_KINDS.length; i++) {
    const ci = i % C;
    dropsByIdx[ci].push(gearEntry(gid(FLEX_KINDS[i])));
  }

  const chapterDrops = new Map();
  for (let i = 0; i < C; i++) {
    chapterDrops.set(sorted[i].chapterIndex, dropsByIdx[i]);
  }

  const allGearIds = FLEX_KINDS.map((k) => gid(k))
    .concat([gid('mainHand'), gid('trinket')]);

  return {
    chapterDrops,
    onFarm: allGearIds.map((id) => gearEntry(id)),
  };
}

function buildStats(dungeonPlans) {
  const chapterSizeHist = {};
  const gearIdChapterHits = {};

  for (const plan of dungeonPlans) {
    for (const drops of plan.chapterDrops.values()) {
      const n = drops.length;
      chapterSizeHist[n] = (chapterSizeHist[n] ?? 0) + 1;
      for (const d of drops) {
        gearIdChapterHits[d.gearId] = (gearIdChapterHits[d.gearId] ?? 0) + 1;
      }
    }
  }

  const sizes = Object.keys(chapterSizeHist).map(Number);
  return {
    generatedAt: new Date().toISOString(),
    chapterSizeHistogram: chapterSizeHist,
    gearIdChapterHitsCount: Object.keys(gearIdChapterHits).length,
    chapterDropCountMin: sizes.length ? Math.min(...sizes) : 0,
    chapterDropCountMax: sizes.length ? Math.max(...sizes) : 0,
    note: '每件 gearId 仅出现在一个副本；每副本 14 件分摊到该副本全部章节',
  };
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const gearDoc = JSON.parse(fs.readFileSync(GEAR_ITEMS, 'utf8'));

  const gearByDungeon = new Map();
  for (const row of gearDoc.items || []) {
    let m = gearByDungeon.get(row.dungeonId);
    if (!m) {
      m = new Map();
      gearByDungeon.set(row.dungeonId, m);
    }
    m.set(row.slotKind, row);
  }

  const chaptersByDungeon = new Map();
  for (const ch of registry.chapters || []) {
    const list = chaptersByDungeon.get(ch.dungeonId) ?? [];
    list.push(ch);
    chaptersByDungeon.set(ch.dungeonId, list);
  }

  const dungeonPlans = [];

  for (const d of registry.dungeons || []) {
    const gearMap = gearByDungeon.get(d.dungeonId);
    if (!gearMap || gearMap.size < 14) {
      throw new Error(`gearItems 缺少副本 ${d.dungeonId} 的 14 件装备`);
    }
    const chs = chaptersByDungeon.get(d.dungeonId) ?? [];
    dungeonPlans.push({ dungeonId: d.dungeonId, ...assignDungeonDrops(d, chs, gearMap) });
  }

  const planByDungeon = new Map(dungeonPlans.map((p) => [p.dungeonId, p]));

  for (const ch of registry.chapters) {
    const plan = planByDungeon.get(ch.dungeonId);
    ch.drops = plan?.chapterDrops.get(ch.chapterIndex) ?? [];
  }

  for (const d of registry.dungeons) {
    const plan = planByDungeon.get(d.dungeonId);
    if (!plan) continue;
    d.drops = d.drops ?? {};
    d.drops.onFarm = plan.onFarm;
    d.drops.onDungeonClear = d.drops.onDungeonClear ?? [];
  }

  const stats = buildStats(dungeonPlans);
  fs.writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  fs.writeFileSync(STATS_OUT, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
  console.log('Dungeon gear drops written.');
  console.log(JSON.stringify(stats, null, 2));
}

main();
