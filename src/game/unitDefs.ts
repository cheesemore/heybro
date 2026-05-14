/**
 * 数值配置来源：`src/game/config/` 下 JSON。
 *
 * 敌方小怪与 `grunt` 对齐的配表口径见 `constants.ts` 中 `ENEMY_CLASSES` 注释：
 * `baseMaxHp × baseAtk ÷ attackInterval`（`attackInterval` ← `wowBookMonsters.json` 的 `attackSpeed`，单位秒/次）。
 */
import { ALLY_CLASSES, ENEMY_CLASSES, GLOBAL_UNIT_ATK_MULT } from './constants';
import { RANGED_ATTACK_RANGE_THRESHOLD } from './battleBonds';
import alliesJson from './config/allies.json';
import bossesJson from './config/bosses.json';
import wowBookMonstersDoc from './config/wowBookMonsters.json';
import scalingJson from './config/scaling.json';
import type { AllyClass, BossId, EnemyClass } from './types';
import { getSkillById } from './skillsCatalog';

export type AllyDef = {
  /** 战场碰撞/代币半径用的设计像素（逻辑宽度基准 720），再乘 `LAYOUT_SCALE` */
  hitRadius: number;
  name: string;
  maxHp: number;
  atk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
};

export type EnemyDef = {
  hitRadius: number;
  name: string;
  baseMaxHp: number;
  baseAtk: number;
  /** 攻击间隔（秒/次）；战场内写入 `SimUnit.attackInterval`。配表锚点见 `constants.ts` 中 `ENEMY_CLASSES`（`baseMaxHp×baseAtk÷本字段`）。 */
  attackSpeed: number;
  range: number;
  moveSpeed: number;
  /** 挂载的战斗技能 id，见 `config/skills.json` */
  skillIds: string[];
};

export type BossDef = EnemyDef & {
  skillIds: string[];
};

const BOSS_IDS: BossId[] = ['farseer', 'tauren', 'blademaster', 'white'];

function assertRecord<K extends string, V>(
  label: string,
  raw: Record<string, unknown>,
  keys: readonly K[],
  guard: (v: unknown) => v is V,
): Record<K, V> {
  const out = {} as Record<K, V>;
  for (const k of keys) {
    const v = raw[k];
    if (!guard(v)) {
      throw new Error(`[${label}] 缺少或格式错误: ${k}`);
    }
    out[k] = v;
  }
  return out;
}

function isAllyDef(v: unknown): v is AllyDef {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.hitRadius === 'number' &&
    typeof o.name === 'string' &&
    typeof o.maxHp === 'number' &&
    typeof o.atk === 'number' &&
    typeof o.attackSpeed === 'number' &&
    typeof o.range === 'number' &&
    typeof o.moveSpeed === 'number'
  );
}

function isEnemyDef(v: unknown): v is EnemyDef {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.hitRadius === 'number' &&
    typeof o.name === 'string' &&
    typeof o.baseMaxHp === 'number' &&
    typeof o.baseAtk === 'number' &&
    typeof o.attackSpeed === 'number' &&
    typeof o.range === 'number' &&
    typeof o.moveSpeed === 'number'
  );
}

function isBossDef(v: unknown): v is BossDef {
  if (!isEnemyDef(v) || !('skillIds' in v)) return false;
  const ids = (v as BossDef).skillIds;
  return Array.isArray(ids) && ids.every((s) => typeof s === 'string');
}

export const ALLY_DEFS: Record<AllyClass, AllyDef> = assertRecord(
  'allies.json',
  alliesJson as Record<string, unknown>,
  ALLY_CLASSES,
  isAllyDef,
);

type WowMonsterRow = {
  id: string;
  nameCn: string;
  hitRadius: number;
  baseMaxHp: number;
  baseAtk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
  skillIds?: string[];
};

function wowMonsterRowToEnemyDef(row: WowMonsterRow): EnemyDef {
  return {
    hitRadius: row.hitRadius,
    name: row.nameCn,
    baseMaxHp: row.baseMaxHp,
    baseAtk: row.baseAtk,
    attackSpeed: row.attackSpeed,
    range: row.range,
    moveSpeed: row.moveSpeed,
    skillIds: Array.isArray(row.skillIds) ? [...row.skillIds] : [],
  };
}

function buildEnemyDefsFromWowBook(): Record<EnemyClass, EnemyDef> {
  const rows = (wowBookMonstersDoc as { monsters: WowMonsterRow[] }).monsters;
  const out = {} as Record<EnemyClass, EnemyDef>;
  for (const k of ENEMY_CLASSES) {
    const row = rows.find((m) => m.id === k);
    if (!row) {
      throw new Error(
        `[wowBookMonsters.json] 缺少 id="${k}" 的条目（须与 ENEMY_CLASSES 一致，可运行 npm run gen:wow-book 生成含 legacy 的表）`,
      );
    }
    out[k] = wowMonsterRowToEnemyDef(row);
  }
  return out;
}

export const ENEMY_DEFS: Record<EnemyClass, EnemyDef> = buildEnemyDefsFromWowBook();

for (const k of ENEMY_CLASSES) {
  for (const sid of ENEMY_DEFS[k].skillIds) {
    if (!getSkillById(sid)) {
      throw new Error(`[wowBookMonsters / ${k}] 未知 skillId: ${sid}（须在 config/skills.json 登记）`);
    }
  }
}

export const BOSS_DEFS: Record<BossId, BossDef> = assertRecord(
  'bosses.json',
  bossesJson as Record<string, unknown>,
  BOSS_IDS,
  isBossDef,
);

for (const id of BOSS_IDS) {
  for (const sid of BOSS_DEFS[id].skillIds) {
    if (!getSkillById(sid)) {
      throw new Error(`[bosses.json / ${id}] 未知 skillId: ${sid}（须在 config/skills.json 登记）`);
    }
  }
}

{
  const m = GLOBAL_UNIT_ATK_MULT;
  for (const k of ALLY_CLASSES) {
    const d = ALLY_DEFS[k];
    d.atk = Math.max(1, Math.round(d.atk * m));
  }
  for (const k of ENEMY_CLASSES) {
    const d = ENEMY_DEFS[k];
    d.baseAtk = Math.max(1, Math.round(d.baseAtk * m));
  }
  for (const id of BOSS_IDS) {
    const d = BOSS_DEFS[id];
    d.baseAtk = Math.max(1, Math.round(d.baseAtk * m));
  }
}

/** 敌我近战（射程 < 远程阈值）非首领：在表值与全局倍率之后再 ×1.2 基础攻击 */
const MELEE_BASE_ATK_BONUS = 1.2;
{
  for (const k of ALLY_CLASSES) {
    const d = ALLY_DEFS[k];
    if (d.range < RANGED_ATTACK_RANGE_THRESHOLD) {
      d.atk = Math.max(1, Math.round(d.atk * MELEE_BASE_ATK_BONUS));
    }
  }
  for (const k of ENEMY_CLASSES) {
    const d = ENEMY_DEFS[k];
    if (d.range < RANGED_ATTACK_RANGE_THRESHOLD) {
      d.baseAtk = Math.max(1, Math.round(d.baseAtk * MELEE_BASE_ATK_BONUS));
    }
  }
}

/**
 * 将「表底攻击力」转为与 `ENEMY_DEFS` 一致的战场基准：先乘 `GLOBAL_UNIT_ATK_MULT`，近战再乘 `MELEE_BASE_ATK_BONUS`。
 * 用于 `wowBookMonsters` 等未在加载阶段写入 `ENEMY_DEFS` 的怪。
 */
export function enemyCombatBaseAtkFromTable(baseAtkRaw: number, range: number): number {
  let a = Math.max(1, Math.round(baseAtkRaw * GLOBAL_UNIT_ATK_MULT));
  if (range < RANGED_ATTACK_RANGE_THRESHOLD) {
    a = Math.max(1, Math.round(a * MELEE_BASE_ATK_BONUS));
  }
  return a;
}

type ChapterMult = { hp: number; atk: number };

type ScalingConfig = {
  chapterBattleMultiplier: Record<string, ChapterMult>;
};

const scaling = scalingJson as ScalingConfig;

/**
 * 敌方生命/攻击共用进度倍率（相对表底 `baseMaxHp` / `baseAtk`）。
 * 16 关进度：索引 0 … 15 线性从 1× 至约 6.5×（与旧版终盘同量级），再乘章节强度等。
 */
export function enemyStatProgressCurve(roundIndex: number): number {
  const ri = Math.max(0, Math.min(15, roundIndex));
  return 1 + ((6.5 - 1) * ri) / 15;
}

function chapterMult(chapter: 1 | 2 | 3, kind: 'hp' | 'atk'): number {
  const row = scaling.chapterBattleMultiplier[String(chapter)];
  if (!row || typeof row[kind] !== 'number') {
    throw new Error(`[scaling.json] chapterBattleMultiplier 缺少章节 ${chapter}`);
  }
  return row[kind];
}

/**
 * `roundIndex`：当前世界线内关卡序号 0 … 15（与 `roundConfig.ROUNDS` 一致）。
 * 再乘 `scaling.json` 篇内系数与外部章节强度（书本章节百分比 / 100）。
 */
export function scaledEnemyHp(
  chapter: 1 | 2 | 3,
  roundIndex: number,
  base: number,
  bookStrengthMult = 1,
): number {
  const m = enemyStatProgressCurve(roundIndex) * chapterMult(chapter, 'hp') * bookStrengthMult;
  return Math.round(base * m);
}

export function scaledEnemyAtk(
  chapter: 1 | 2 | 3,
  roundIndex: number,
  base: number,
  bookStrengthMult = 1,
): number {
  const m = enemyStatProgressCurve(roundIndex) * chapterMult(chapter, 'atk') * bookStrengthMult;
  return Math.round(base * m);
}
