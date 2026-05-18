import { ALLY_CLASSES, ROGUE_REFRESH_TRIO_COST } from './constants';
import { isDungeonLastChapterCleared } from './chapterProgressStorage';
import type { AllyClass } from './types';

/** 开局即可招募的五个基础职业 */
export const BASE_ALLY_CLASSES: readonly AllyClass[] = [
  'warrior',
  'mage',
  'priest',
  'archer',
  'knight',
] as const;

/** 通关死亡矿井后解锁的扩展职业 */
export const EXTENDED_ALLY_CLASSES: readonly AllyClass[] = [
  'warlock',
  'shaman',
  'assassin',
  'druid',
] as const;

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

/** 死亡矿井（书本第 5～10 章）末关通关 */
export function isDeadminesBookCleared(): boolean {
  return isDungeonLastChapterCleared('deadmines');
}

export function isAllyClassUnlocked(cls: AllyClass): boolean {
  if (devUnlockAllClasses()) return true;
  if ((BASE_ALLY_CLASSES as readonly string[]).includes(cls)) return true;
  return isDeadminesBookCleared();
}

export function getUnlockedAllyClasses(): AllyClass[] {
  return ALLY_CLASSES.filter(isAllyClassUnlocked);
}

export function countUnlockedAllyClasses(): number {
  return getUnlockedAllyClasses().length;
}

export function allyClassUnlockHint(cls: AllyClass): string {
  if (isAllyClassUnlocked(cls)) return '';
  return '通关死亡矿井解锁';
}

/** 每多解锁一个扩展职业，刷新三选一底价 -1，最低 2 金 */
export function rogueRefreshTrioBaseCost(): number {
  const extra = Math.max(0, countUnlockedAllyClasses() - BASE_ALLY_CLASSES.length);
  return Math.max(2, ROGUE_REFRESH_TRIO_COST - extra);
}
