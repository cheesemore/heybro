/**
 * 数值配置来源：`src/game/config/` 下 JSON。
 */
import { ALLY_CLASSES, ENEMY_CLASSES, GLOBAL_UNIT_ATK_MULT } from './constants';
import { RANGED_ATTACK_RANGE_THRESHOLD } from './battleBonds';
import alliesJson from './config/allies.json';
import bossesJson from './config/bosses.json';
import enemiesJson from './config/enemies.json';
import scalingJson from './config/scaling.json';
import type { AllyClass, BossId, EnemyClass } from './types';

export type AllyDef = {
  name: string;
  maxHp: number;
  atk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
};

export type EnemyDef = {
  name: string;
  baseMaxHp: number;
  baseAtk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
};

export type BossDef = EnemyDef & {
  skills: string[];
};

const BOSS_IDS: BossId[] = ['farseer', 'tauren', 'blademaster'];

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
    typeof o.name === 'string' &&
    typeof o.baseMaxHp === 'number' &&
    typeof o.baseAtk === 'number' &&
    typeof o.attackSpeed === 'number' &&
    typeof o.range === 'number' &&
    typeof o.moveSpeed === 'number'
  );
}

function isBossDef(v: unknown): v is BossDef {
  if (!isEnemyDef(v) || !('skills' in v)) return false;
  const skills = (v as BossDef).skills;
  return Array.isArray(skills) && skills.every((s) => typeof s === 'string');
}

export const ALLY_DEFS: Record<AllyClass, AllyDef> = assertRecord(
  'allies.json',
  alliesJson as Record<string, unknown>,
  ALLY_CLASSES,
  isAllyDef,
);

export const ENEMY_DEFS: Record<EnemyClass, EnemyDef> = assertRecord(
  'enemies.json',
  enemiesJson as Record<string, unknown>,
  ENEMY_CLASSES,
  isEnemyDef,
);

export const BOSS_DEFS: Record<BossId, BossDef> = assertRecord(
  'bosses.json',
  bossesJson as Record<string, unknown>,
  BOSS_IDS,
  isBossDef,
);

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
