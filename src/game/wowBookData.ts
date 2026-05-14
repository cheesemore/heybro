import { GLOBAL_UNIT_ATK_MULT } from './constants';
import { RANGED_ATTACK_RANGE_THRESHOLD } from './battleBonds';
import chaptersDoc from './config/wowBookChapters.json';
import bossesDoc from './config/wowBookBosses.json';
import monstersDoc from './config/wowBookMonsters.json';
import { getSkillById } from './skillsCatalog';
import type { EnemyClass } from './types';

export type WowMob = {
  id: string;
  /** 出图/资源命名用；表内唯一，格式 `U` + 六位数字 */
  monsterUid: string;
  /** 与 `sourceReference` 中副本 + mob_pool 条目对应：`dungeonId::怪名 slug`；legacy 为 `legacy::<id>` */
  refKey: string;
  nameCn: string;
  nameEn: string;
  dungeonId: string;
  dungeonNameCn: string;
  attackType: string;
  role: string;
  creatureType: string;
  traits: string[];
  hitRadius: number;
  baseMaxHp: number;
  baseAtk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
  /** 与 `wowBookMonsters` / `unitDefs` 同步的可选挂载技能 */
  skillIds?: string[];
};

export type WowChapter = {
  chapterIndex: number;
  dungeonId: string;
  dungeonNameCn: string;
  dungeonNameEn: string;
  stageNumber: number;
  stageNameCn: string;
  monsterGroup: string[];
  finalBoss: {
    nameCn: string;
    nameEn: string;
    attackType: unknown;
    role: unknown;
    creatureType: unknown;
    isFinalBoss: boolean;
  };
};

const chapters = (chaptersDoc as { chapters: WowChapter[] }).chapters;
const monsters = (monstersDoc as { monsters: WowMob[] }).monsters;
const bookBossRows = (bossesDoc as { bosses: WowBookBossRow[] }).bosses;

export const WOW_BOOK_CHAPTER_COUNT = chapters.length;

const mobById = new Map<string, WowMob>(monsters.map((m) => [m.id, m]));

/** 书本关底首领一行：与 `wowBookMonsters` 对齐的战斗基准字段 + 元数据 */
export type WowBookBossRow = {
  id: string;
  chapterIndex: number;
  bossUid?: string;
  /** 碰撞/代币半径（设计像素，同小怪表） */
  hitRadius?: number;
  /** 表定生命基准；战场内仍乘 10 再进 `scaledEnemyHp`（首领池规则） */
  baseMaxHp?: number;
  /** 表定攻击（「乘 GLOBAL 前」的底数；缺省见 `WOW_BOOK_BOSS_TABLE_DEFAULT`） */
  baseAtk?: number;
  /** 秒/次，攻击间隔 */
  attackSpeed?: number;
  range?: number;
  moveSpeed?: number;
  skillIds?: string[];
  /** @deprecated 与 `skillIds` 同义；旧编辑器字段 */
  skills?: string[];
};

/** 章节对应副本 `dungeonId`（用于底图等）；缺省怒焰裂谷 slug */
export function dungeonIdForBookChapter(chapterId: number): string {
  return getWowChapterByBookId(chapterId)?.dungeonId ?? 'ragefire_chasm';
}

function findWowBookBossRow(chapterId: number): WowBookBossRow | undefined {
  const id = Math.max(1, Math.min(WOW_BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  return bookBossRows.find((b) => Number(b.chapterIndex) === id);
}

/** 与章节号对应的书本首领表行（`chapterIndex` 与关卡书本章节一致） */
export function getWowBookBossByChapter(chapterId: number): WowBookBossRow | undefined {
  return findWowBookBossRow(chapterId);
}

/**
 * 表底缺省：与 `scripts/generate-wow-book-tables.mjs` 中 `DEFAULT_BOOK_BOSS_COMBAT` 一致。
 * `wowBookBosses` 某字段缺省、整章缺行、或 `chapterId<=0`（仅预览占位）时使用。
 */
export const WOW_BOOK_BOSS_TABLE_DEFAULT = {
  hitRadius: 80,
  baseMaxHp: 1680,
  baseAtk: 27,
  attackSpeed: 0.65,
  range: 210,
  moveSpeed: 540,
} as const;

function mergeWowBookBossCombatFromRow(row: WowBookBossRow | undefined): {
  hitRadiusDesign: number;
  baseMaxHpTable: number;
  combatBaseAtk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
  skillIds: string[];
} {
  const t = WOW_BOOK_BOSS_TABLE_DEFAULT;
  const hitRadiusDesign = typeof row?.hitRadius === 'number' ? row.hitRadius : t.hitRadius;
  const baseMaxHpTable = typeof row?.baseMaxHp === 'number' ? row.baseMaxHp : t.baseMaxHp;
  const combatBaseAtk =
    typeof row?.baseAtk === 'number'
      ? Math.max(1, Math.round(row.baseAtk * GLOBAL_UNIT_ATK_MULT))
      : Math.max(1, Math.round(t.baseAtk * GLOBAL_UNIT_ATK_MULT));
  const attackSpeed = typeof row?.attackSpeed === 'number' ? row.attackSpeed : t.attackSpeed;
  const range = typeof row?.range === 'number' ? row.range : t.range;
  const moveSpeed = typeof row?.moveSpeed === 'number' ? row.moveSpeed : t.moveSpeed;
  const rawList = row?.skillIds ?? row?.skills;
  const skillIds = Array.isArray(rawList)
    ? rawList.filter((sid): sid is string => typeof sid === 'string' && !!getSkillById(sid))
    : [];
  return { hitRadiusDesign, baseMaxHpTable, combatBaseAtk, attackSpeed, range, moveSpeed, skillIds };
}

/**
 * 首领战数值：仅来自 `wowBookBosses.json` 对应该章行 + 上表缺省，不读 `bosses.json`。
 * 返回的 `combatBaseAtk` 已乘 `GLOBAL_UNIT_ATK_MULT`（首领不吃近战额外攻倍率）。
 */
export function resolveWowBookBossCombat(chapterId: number): {
  hitRadiusDesign: number;
  baseMaxHpTable: number;
  combatBaseAtk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
  skillIds: string[];
} {
  const row = chapterId > 0 ? findWowBookBossRow(chapterId) : undefined;
  return mergeWowBookBossCombatFromRow(row);
}

/** `wowBookBosses.json` 中与书本章节号对应的 `bossUid`（立绘 `public/assets/wow-bosses/<uid>.png`） */
export function bossUidForBookChapter(chapterId: number): string | null {
  const row = findWowBookBossRow(chapterId);
  const u = row?.bossUid;
  if (typeof u === 'string' && /^B\d{6}$/.test(u)) return u;
  return null;
}

export function getWowChapterByBookId(chapterId: number): WowChapter | null {
  const idx = chapterId - 1;
  if (idx < 0 || idx >= chapters.length) return null;
  return chapters[idx] ?? null;
}

export function getWowMob(id: string): WowMob | undefined {
  return mobById.get(id);
}

/** 本章普通战可抽到的怪物 id 列表（同副本多关共享 mob_pool） */
export function mobPoolForBookChapter(chapterId: number): readonly string[] {
  const ch = getWowChapterByBookId(chapterId);
  return ch?.monsterGroup ?? [];
}

export function wowChapterStageTitle(chapterId: number): string {
  return getWowChapterByBookId(chapterId)?.stageNameCn ?? `第 ${chapterId} 章`;
}

export function wowFinalBossNameCn(chapterId: number): string {
  return getWowChapterByBookId(chapterId)?.finalBoss.nameCn ?? '';
}

/** 战场立绘 / AI 模板：与现有 EnemyClass 资源对齐 */
export function wowMobEnemyPaint(mob: WowMob): EnemyClass {
  if (mob.range >= RANGED_ATTACK_RANGE_THRESHOLD) {
    return 'headhunter';
  }
  if (mob.role === '坦克') {
    return 'dread_warrior';
  }
  return 'grunt';
}
