/**
 * 数值配置来源：`src/game/config/` 下 JSON。
 *
 * 敌方小怪与 `grunt` 对齐的配表口径见 `constants.ts` 中 `ENEMY_CLASSES` 注释：
 * `baseMaxHp × baseAtk ÷ attackInterval`（`attackInterval` ← `wowBookMonsters.json` 的 `attackSpeed`，单位秒/次）。
 */
import { ALLY_CLASSES, ENEMY_CLASSES } from './constants';
import alliesJson from './config/allies.json';
import wowBookMonstersDoc from './config/wowBookMonsters.json';
import scalingJson from './config/scaling.json';
import type { AllyClass, EnemyClass } from './types';
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

/**
 * 书本小怪 `baseAtk` 与 `ENEMY_DEFS` 一致，均为战场直接使用的表底攻击（已含近战/远程差异，无运行时全局倍率）。
 * `range` 参数保留供调用方表达远程/近战语境，当前不参与换算。
 */
export function enemyCombatBaseAtkFromTable(baseAtkRaw: number, _range?: number): number {
  return Math.max(1, Math.round(baseAtkRaw));
}

type ChapterMult = { hp: number; atk: number };

type ScalingConfig = {
  chapterBattleMultiplier: Record<string, ChapterMult>;
};

const scaling = scalingJson as ScalingConfig;

import {
  DEFAULT_NODE_PROGRESS_MAX,
  INTRA_CHAPTER_LEGACY_INDEX_MAX,
} from './gearItems';

/**
 * 关内节点进度倍率：legacy 0 → 1×，legacy 15 → `nodeProgressMax`（来自副本表 `nodeProgressMax`）。
 */
export function enemyStatProgressCurve(
  legacyRoundIndex: number,
  nodeProgressMax = DEFAULT_NODE_PROGRESS_MAX,
): number {
  const ri = Math.max(0, Math.min(INTRA_CHAPTER_LEGACY_INDEX_MAX, legacyRoundIndex));
  const max = Math.max(1, nodeProgressMax);
  return 1 + ((max - 1) * ri) / INTRA_CHAPTER_LEGACY_INDEX_MAX;
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
  legacyRoundIndex: number,
  base: number,
  bookStrengthMult = 1,
  nodeProgressMax = DEFAULT_NODE_PROGRESS_MAX,
): number {
  const m =
    enemyStatProgressCurve(legacyRoundIndex, nodeProgressMax) *
    chapterMult(chapter, 'hp') *
    bookStrengthMult;
  return Math.round(base * m);
}

export function scaledEnemyAtk(
  chapter: 1 | 2 | 3,
  legacyRoundIndex: number,
  base: number,
  bookStrengthMult = 1,
  nodeProgressMax = DEFAULT_NODE_PROGRESS_MAX,
): number {
  const m =
    enemyStatProgressCurve(legacyRoundIndex, nodeProgressMax) *
    chapterMult(chapter, 'atk') *
    bookStrengthMult;
  return Math.round(base * m);
}
