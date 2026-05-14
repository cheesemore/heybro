import { RANGED_ATTACK_RANGE_THRESHOLD } from './battleBonds';
import chaptersDoc from './config/wowBookChapters.json';
import bossesDoc from './config/wowBookBosses.json';
import monstersDoc from './config/wowBookMonsters.json';
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

export const WOW_BOOK_CHAPTER_COUNT = chapters.length;

const mobById = new Map<string, WowMob>(monsters.map((m) => [m.id, m]));

/** 章节对应副本 `dungeonId`（用于底图等）；缺省怒焰裂谷 slug */
export function dungeonIdForBookChapter(chapterId: number): string {
  return getWowChapterByBookId(chapterId)?.dungeonId ?? 'ragefire_chasm';
}

type WowBossRow = {
  chapterIndex: number;
  bossUid?: string;
};

/** `wowBookBosses.json` 中与书本章节号对应的 `bossUid`（立绘 `public/assets/wow-bosses/<uid>.png`） */
export function bossUidForBookChapter(chapterId: number): string | null {
  const id = Math.max(1, Math.min(WOW_BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const rows = (bossesDoc as { bosses: WowBossRow[] }).bosses;
  const row = rows.find((b) => Number(b.chapterIndex) === id);
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
