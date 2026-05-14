/**
 * 从 docs/reference-classic-vanilla-wow-roguelike-level-design.json 生成：
 * - src/game/config/wowBookMonsters.json
 * - src/game/config/wowBookChapters.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REF = path.join(root, 'docs/reference-classic-vanilla-wow-roguelike-level-design.json');
const OUT_MON = path.join(root, 'src/game/config/wowBookMonsters.json');
const OUT_CH = path.join(root, 'src/game/config/wowBookChapters.json');
const OUT_BOSS = path.join(root, 'src/game/config/wowBookBosses.json');

/** 与 `wowBookData.WOW_BOOK_BOSS_TABLE_DEFAULT` / 原用书白板首领表底一致；首领不分近战远程，不加近战额外攻倍率（由运行时 GLOBAL 乘 atk） */
const DEFAULT_BOOK_BOSS_COMBAT = {
  hitRadius: 80,
  baseMaxHp: 1680,
  baseAtk: 27,
  attackSpeed: 0.65,
  range: 210,
  moveSpeed: 540,
  skillIds: [],
};

/**
 * 原 `enemies.json` 十二兵种：id 与 `ENEMY_CLASSES` 一致，并入单表。
 */
const LEGACY_ENEMY_ROWS = [
  { id: 'grunt', nameCn: '兽人步兵', nameEn: 'Grunt', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 270, baseAtk: 11, attackSpeed: 0.62, range: 42, moveSpeed: 505 },
  { id: 'dread_warrior', nameCn: '亡灵勇士', nameEn: 'Dread Warrior', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 223, baseAtk: 11, attackSpeed: 0.64, range: 44, moveSpeed: 488 },
  { id: 'raider', nameCn: '狼骑兵', nameEn: 'Raider', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 202, baseAtk: 11, attackSpeed: 0.58, range: 42, moveSpeed: 590 },
  { id: 'beserker', nameCn: '狂战士', nameEn: 'Beserker', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 250, baseAtk: 9, attackSpeed: 0.54, range: 42, moveSpeed: 525 },
  { id: 'kodo', nameCn: '科多兽', nameEn: 'Kodo', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 321, baseAtk: 15, attackSpeed: 1.02, range: 48, moveSpeed: 285 },
  { id: 'ultralisk', nameCn: '雷兽', nameEn: 'Ultralisk', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 408, baseAtk: 13, attackSpeed: 0.86, range: 56, moveSpeed: 315 },
  { id: 'abomination', nameCn: '憎恶', nameEn: 'Abomination', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '近战', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 317, baseAtk: 10, attackSpeed: 0.84, range: 50, moveSpeed: 355 },
  { id: 'headhunter', nameCn: '兽人猎头者', nameEn: 'Headhunter', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '远程', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 268, baseAtk: 14, attackSpeed: 0.78, range: 235, moveSpeed: 488 },
  { id: 'darkspear', nameCn: '暗矛猎手', nameEn: 'Darkspear', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '远程', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 262, baseAtk: 12, attackSpeed: 0.74, range: 248, moveSpeed: 498 },
  { id: 'shaman', nameCn: '萨满祭司', nameEn: 'Shaman', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '远程', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 212, baseAtk: 17, attackSpeed: 0.98, range: 218, moveSpeed: 420 },
  { id: 'batrider', nameCn: '蝙蝠骑士', nameEn: 'Batrider', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '远程', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 222, baseAtk: 13, attackSpeed: 0.68, range: 228, moveSpeed: 550 },
  { id: 'catapult', nameCn: '投石车', nameEn: 'Catapult', dungeonId: 'legacy', dungeonNameCn: '模板兵种', attackType: '远程', role: '输出', creatureType: '', traits: [], hitRadius: 36, baseMaxHp: 233, baseAtk: 24, attackSpeed: 1.52, range: 295, moveSpeed: 265 },
];

function mergeLegacyEnemyRows(monsters) {
  const have = new Set(monsters.map((m) => m.id));
  for (const row of LEGACY_ENEMY_ROWS) {
    if (!have.has(row.id)) {
      monsters.push({ ...row, refKey: `legacy::${slug(row.id)}` });
      have.add(row.id);
    }
  }
}

/**
 * 出图/资源命名用全局唯一号；同 id 多次生成时尽量沿用已有编号（读旧 wowBookMonsters.json）。
 * 格式：`U` + 6 位十进制（例 U000042）。
 */
function assignMonsterUids(monsters) {
  /** @type {Map<string, string>} */
  const prevById = new Map();
  let maxN = 0;
  if (fs.existsSync(OUT_MON)) {
    try {
      const raw = JSON.parse(fs.readFileSync(OUT_MON, 'utf8'));
      for (const m of raw.monsters || []) {
        const uid = m.monsterUid;
        if (typeof m.id === 'string' && typeof uid === 'string' && /^U\d{6}$/.test(uid)) {
          prevById.set(m.id, uid);
          const n = parseInt(uid.slice(1), 10);
          if (n > maxN) maxN = n;
        }
      }
    } catch {
      /* 忽略损坏的旧文件 */
    }
  }
  let next = maxN + 1;
  const order = [...monsters].sort((a, b) => a.id.localeCompare(b.id));
  for (const m of order) {
    const keep = prevById.get(m.id);
    if (keep) {
      m.monsterUid = keep;
    } else {
      m.monsterUid = `U${String(next++).padStart(6, '0')}`;
    }
  }
  const seen = new Set();
  for (const m of monsters) {
    if (seen.has(m.monsterUid)) {
      throw new Error(`monsterUid 重复: ${m.monsterUid} (id=${m.id})`);
    }
    seen.add(m.monsterUid);
  }
}

/**
 * 首领出图 UID，与小怪 `monsterUid`（U 前缀）区分；格式 `B` + 6 位十进制。
 * 重新生成时按 `boss.id` 尽量保留已有 `bossUid`。
 */
function assignBossUids(bossRows) {
  /** @type {Map<string, string>} */
  const prevById = new Map();
  let maxN = 0;
  if (fs.existsSync(OUT_BOSS)) {
    try {
      const raw = JSON.parse(fs.readFileSync(OUT_BOSS, 'utf8'));
      for (const b of raw.bosses || []) {
        const uid = b.bossUid;
        if (typeof b.id === 'string' && typeof uid === 'string' && /^B\d{6}$/.test(uid)) {
          prevById.set(b.id, uid);
          const n = parseInt(uid.slice(1), 10);
          if (n > maxN) maxN = n;
        }
      }
    } catch {
      /* ignore */
    }
  }
  let next = maxN + 1;
  const order = [...bossRows].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const b of order) {
    const keep = prevById.get(b.id);
    if (keep) {
      b.bossUid = keep;
    } else {
      b.bossUid = `B${String(next++).padStart(6, '0')}`;
    }
  }
  const seen = new Set();
  for (const b of bossRows) {
    if (seen.has(b.bossUid)) {
      throw new Error(`bossUid 重复: ${b.bossUid} (id=${b.id})`);
    }
    seen.add(b.bossUid);
  }
}

const MELEE = { hitRadius: 36, maxHp: 270, atk: 11, attackInterval: 0.62, range: 42, moveSpeed: 505 };
const RANGED = { hitRadius: 36, maxHp: 268, atk: 14, attackInterval: 0.78, range: 235, moveSpeed: 488 };

function slug(s) {
  return String(s || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'x';
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd01(id, salt) {
  return (hash32(id + '\0' + salt) % 10000) / 10000;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normAttackType(raw) {
  const s = String(raw || '').trim();
  if (s.includes('远程')) return '远程';
  if (s.includes('近战')) return '近战';
  return '近战';
}

function normRole(raw) {
  const s = String(raw || '').trim();
  if (s.includes('坦克')) return '坦克';
  if (s.includes('辅助')) return '辅助';
  if (s.includes('输出')) return '输出';
  return '输出';
}

function deriveStats(id, attackType, role) {
  const melee = attackType === '近战';
  const base = melee ? { ...MELEE } : { ...RANGED };
  const jitter = 0.92 + rnd01(id, 'hp') * 0.16;

  let hp = base.maxHp * jitter;
  let atk = base.atk * (0.95 + rnd01(id, 'atk') * 0.1);
  let interval = base.attackInterval * (0.95 + rnd01(id, 'iv') * 0.1);
  let range = base.range;
  let move = base.moveSpeed * (0.96 + rnd01(id, 'mv') * 0.08);

  if (melee && role === '坦克') {
    hp *= 1.18;
    atk *= 0.9;
    interval *= 1.08;
  } else if (melee && role === '输出') {
    hp *= 0.94;
    atk *= 1.06;
    interval *= 0.96;
  } else if (melee && role === '辅助') {
    hp *= 1.05;
    atk *= 0.92;
    interval *= 1.15;
    move *= 0.94;
  }

  if (!melee && role === '坦克') {
    hp *= 1.12;
    atk *= 0.93;
    interval *= 1.05;
    range = clamp(range * 0.92, 120, 280);
  } else if (!melee && role === '输出') {
    range = clamp(range * (0.88 + rnd01(id, 'rg') * 0.2), 160, 320);
    hp *= clamp(1.05 - (range - 235) / 500, 0.85, 1.08);
  } else if (!melee && role === '辅助') {
    atk *= 0.93;
    interval *= 1.28;
    hp *= 0.92;
    range = clamp(range * 0.95, 180, 260);
  }

  return {
    hitRadius: base.hitRadius,
    maxHp: Math.round(hp),
    atk: round2(clamp(atk, 6, 40)),
    attackInterval: round2(clamp(interval, 0.4, 2.2)),
    range: Math.round(range),
    moveSpeed: Math.round(move),
  };
}

const book = JSON.parse(fs.readFileSync(REF, 'utf8'));

/** @type {Map<string, object>} */
const monsterById = new Map();

function uniqueMobId(dungeonId, nameEn, nameCn) {
  let id = `mob_${slug(nameEn || nameCn)}`;
  if (!monsterById.has(id)) return id;
  id = `mob_${dungeonId}_${slug(nameEn || nameCn)}`;
  if (!monsterById.has(id)) return id;
  let n = 2;
  while (monsterById.has(`${id}_${n}`)) n++;
  return `${id}_${n}`;
}

for (const dungeon of book) {
  const dungeonId = slug(dungeon.name_en || dungeon.name_cn);
  for (const mob of dungeon.mob_pool || []) {
    const id = uniqueMobId(dungeonId, mob.name_en, mob.name_cn);
    const attackType = normAttackType(mob.attack_type);
    const role = normRole(mob.role);
    const stats = deriveStats(id, attackType, role);
    const mobSlug = slug(mob.name_en || mob.name_cn);
    monsterById.set(id, {
      id,
      refKey: `${dungeonId}::${mobSlug}`,
      nameCn: mob.name_cn,
      nameEn: mob.name_en,
      dungeonId,
      dungeonNameCn: dungeon.name_cn,
      attackType,
      role,
      creatureType: mob.creature_type ?? '',
      traits: [],
      hitRadius: stats.hitRadius,
      baseMaxHp: stats.maxHp,
      baseAtk: stats.atk,
      attackSpeed: stats.attackInterval,
      range: stats.range,
      moveSpeed: stats.moveSpeed,
    });
  }
}

const monsters = [...monsterById.values()].sort((a, b) => a.id.localeCompare(b.id));
mergeLegacyEnemyRows(monsters);
monsters.sort((a, b) => a.id.localeCompare(b.id));
assignMonsterUids(monsters);

function mobIdFor(dungeonId, mob) {
  const idSimple = `mob_${slug(mob.name_en || mob.name_cn)}`;
  const m0 = monsterById.get(idSimple);
  if (m0 && m0.dungeonId === dungeonId && m0.nameCn === mob.name_cn && m0.nameEn === mob.name_en) return m0.id;
  const idPref = `mob_${dungeonId}_${slug(mob.name_en || mob.name_cn)}`;
  const m1 = monsterById.get(idPref);
  if (m1) return m1.id;
  for (const m of monsters) {
    if (m.dungeonId === dungeonId && m.nameCn === mob.name_cn && m.nameEn === mob.name_en) return m.id;
  }
  return idPref;
}

const chapters = [];
let chapterIndex = 0;
for (const dungeon of book) {
  const dungeonId = slug(dungeon.name_en || dungeon.name_cn);
  const mobIds = (dungeon.mob_pool || []).map((mob) => mobIdFor(dungeonId, mob));
  for (const st of dungeon.stages || []) {
    chapterIndex += 1;
    const boss = st.boss || {};
    chapters.push({
      chapterIndex,
      dungeonId,
      dungeonNameCn: dungeon.name_cn,
      dungeonNameEn: dungeon.name_en,
      stageNumber: st.stage_number,
      stageNameCn: st.stage_name_cn,
      monsterGroup: mobIds,
      finalBoss: {
        nameCn: boss.name_cn,
        nameEn: boss.name_en,
        attackType: boss.attack_type,
        role: boss.role,
        creatureType: boss.creature_type,
        isFinalBoss: !!boss.is_final_boss,
      },
    });
  }
}

const monsterDoc = {
  schemaVersion: 2,
  generator: 'scripts/generate-wow-book-tables.mjs',
  designBaseline: 'docs/unit-stat-design-baseline.md',
  sourceReference: 'docs/reference-classic-vanilla-wow-roguelike-level-design.json',
  editConvention:
    '小怪唯一数值源。`id` 在表内唯一（slug）。`monsterUid` 为出图/资源用稳定唯一号（U+六位数字），重新跑生成脚本时同 `id` 会尽量保留原 `monsterUid`。`refKey` = `dungeonId::mob_pool 怪名 slug`，与参考 JSON 中副本 `slug(name_en|name_cn)` + 该条 mob_pool 怪名 slug 一一对应；legacy 十二兵种为 `legacy::<id>`。立绘可用 `public/assets/wow-mobs/<monsterUid>.png` 或 `<id>.png`；未提供则仍用 enemyPaint 的 `public/assets/enemies/<paint>.png`。',
  monsters,
};

const chapterDoc = {
  schemaVersion: 1,
  generator: 'scripts/generate-wow-book-tables.mjs',
  sourceReference: 'docs/reference-classic-vanilla-wow-roguelike-level-design.json',
  editConvention:
    '章节顺序与关底 Boss 以本文件为准；若改某关可用怪组，改对应项的 monsterGroup（id 须存在于 wowBookMonsters.json）。',
  chapters,
};

const bossRows = chapters.map((ch) => {
  const b = ch.finalBoss;
  const slugBoss = slug(b.nameEn || b.nameCn || 'boss');
  return {
    id: `boss_ch${ch.chapterIndex}_${slugBoss}`,
    chapterIndex: ch.chapterIndex,
    stageNumber: ch.stageNumber,
    stageNameCn: ch.stageNameCn,
    dungeonId: ch.dungeonId,
    dungeonNameCn: ch.dungeonNameCn,
    dungeonNameEn: ch.dungeonNameEn,
    nameCn: b.nameCn,
    nameEn: b.nameEn,
    attackType: normAttackType(b.attackType),
    role: normRole(b.role),
    creatureType: String(b.creatureType ?? ''),
    isFinalBoss: !!b.isFinalBoss,
    combatBossId: 'white',
    ...DEFAULT_BOOK_BOSS_COMBAT,
  };
});

/** 重跑时按 id 合并旧表中的战斗字段与 skillIds，避免覆盖手调数值 */
function mergeBossRowsFromPrevious(newRows) {
  /** @type {Map<string, object>} */
  const prev = new Map();
  if (fs.existsSync(OUT_BOSS)) {
    try {
      const raw = JSON.parse(fs.readFileSync(OUT_BOSS, 'utf8'));
      for (const row of raw.bosses || []) {
        if (typeof row.id === 'string') prev.set(row.id, row);
      }
    } catch {
      /* ignore */
    }
  }
  const keys = ['hitRadius', 'baseMaxHp', 'baseAtk', 'attackSpeed', 'range', 'moveSpeed', 'skillIds', 'bossUid'];
  for (const row of newRows) {
    const old = prev.get(row.id);
    if (!old) continue;
    for (const k of keys) {
      if (old[k] == null) continue;
      if (k === 'skillIds' && !Array.isArray(old.skillIds) && Array.isArray(old.skills)) {
        row.skillIds = [...old.skills];
      } else {
        row[k] = old[k];
      }
    }
  }
}

mergeBossRowsFromPrevious(bossRows);

assignBossUids(bossRows);

const bossDoc = {
  schemaVersion: 3,
  generator: 'scripts/generate-wow-book-tables.mjs',
  editConvention:
    '每条对应一章关卡首领（chapterIndex 同 wowBookChapters）。战斗基准：hitRadius、baseMaxHp、baseAtk、attackSpeed、range、moveSpeed、skillIds（缺省与 wowBookData.WOW_BOOK_BOSS_TABLE_DEFAULT / 本脚本 DEFAULT_BOOK_BOSS_COMBAT 一致）；重跑脚本时按 id 从旧文件合并上述字段与 bossUid。进场 HP 仍 baseMaxHp×10 后 scaledEnemyHp。bossUid 立绘 public/assets/wow-bosses/<bossUid>.png。',
  bosses: bossRows,
};

fs.writeFileSync(OUT_MON, JSON.stringify(monsterDoc, null, 2) + '\n', 'utf8');
fs.writeFileSync(OUT_CH, JSON.stringify(chapterDoc, null, 2) + '\n', 'utf8');
fs.writeFileSync(OUT_BOSS, JSON.stringify(bossDoc, null, 2) + '\n', 'utf8');

console.log('Wrote', monsters.length, 'monsters ->', path.relative(root, OUT_MON));
console.log('Wrote', chapters.length, 'chapters ->', path.relative(root, OUT_CH));
console.log('Wrote', bossRows.length, 'boss rows ->', path.relative(root, OUT_BOSS));
