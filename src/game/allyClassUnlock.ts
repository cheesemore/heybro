import { ALLY_CLASSES, ROGUE_REFRESH_TRIO_COST } from './constants';
import { isChapterCleared } from './chapterProgressStorage';
import type { AllyClass } from './types';
import { wowChapterStageTitle } from './wowBookData';

/** 开局即可招募的五个基础职业 */
export const BASE_ALLY_CLASSES: readonly AllyClass[] = [
  'warrior',
  'mage',
  'priest',
  'archer',
  'knight',
] as const;

/** 按书本章节通关逐步解锁的扩展职业 */
export const EXTENDED_ALLY_CLASSES: readonly AllyClass[] = [
  'warlock',
  'shaman',
  'assassin',
  'druid',
] as const;

/** 扩展职业：通关对应 `chapterIndex` 关后可在招募三选一等处使用 */
export const ALLY_CLASS_UNLOCK_CHAPTER = {
  warlock: 4,
  shaman: 6,
  assassin: 8,
  druid: 12,
} as const satisfies Partial<Record<AllyClass, number>>;

/** 备战棋盘同时存在的不同兵种上限；达上限后三选一仅出现已在场职业（叠层） */
export const MAX_DISTINCT_ALLY_CLASSES_ON_BOARD = 5;

function devUnlockAllClasses(): boolean {
  if (typeof location === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).get('unlockAllClasses') === '1';
  } catch {
    return false;
  }
}

function unlockChapterForClass(cls: AllyClass): number | null {
  if ((EXTENDED_ALLY_CLASSES as readonly string[]).includes(cls)) {
    return ALLY_CLASS_UNLOCK_CHAPTER[cls as keyof typeof ALLY_CLASS_UNLOCK_CHAPTER];
  }
  return null;
}

export function isAllyClassUnlocked(cls: AllyClass): boolean {
  if (devUnlockAllClasses()) return true;
  if ((BASE_ALLY_CLASSES as readonly string[]).includes(cls)) return true;
  const ch = unlockChapterForClass(cls);
  return ch != null && isChapterCleared(ch);
}

export function getUnlockedAllyClasses(): AllyClass[] {
  return ALLY_CLASSES.filter(isAllyClassUnlocked);
}

export function countUnlockedAllyClasses(): number {
  return getUnlockedAllyClasses().length;
}

export function allyClassUnlockHint(cls: AllyClass): string {
  if (isAllyClassUnlocked(cls)) return '';
  const ch = unlockChapterForClass(cls);
  if (ch == null) return '';
  return `通关${wowChapterStageTitle(ch)}后解锁`;
}

/** 每多解锁一个扩展职业，刷新三选一底价 -1，最低 2 金 */
export function rogueRefreshTrioBaseCost(): number {
  const extra = Math.max(0, countUnlockedAllyClasses() - BASE_ALLY_CLASSES.length);
  return Math.max(2, ROGUE_REFRESH_TRIO_COST - extra);
}
