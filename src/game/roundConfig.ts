import type { BossId, RoundMeta } from './types';

function mk(
  label: string,
  chapter: 1 | 2 | 3,
  sub: number,
  kind: RoundMeta['kind'],
): RoundMeta {
  return { label, chapter, sub, kind, enemies: [] };
}

/**
 * 书本第 3 章及以后：沿用原 16 关世界线（1-1…1-5、2-1…2-5、3-1…3-6 首领）。
 * 敌阵在运行时按外部章节池与 seed 解析，见 `roundResolve.ts`。
 */
export const ROUNDS: RoundMeta[] = [
  mk('1-1', 1, 1, 'normal'),
  mk('1-2', 1, 2, 'strategy'),
  mk('1-3', 1, 3, 'normal'),
  mk('1-4', 1, 4, 'normal'),
  mk('1-5', 1, 5, 'reward'),
  mk('2-1', 2, 1, 'normal'),
  mk('2-2', 2, 2, 'strategy'),
  mk('2-3', 2, 3, 'normal'),
  mk('2-4', 2, 4, 'normal'),
  mk('2-5', 2, 5, 'reward'),
  mk('3-1', 3, 1, 'normal'),
  mk('3-2', 3, 2, 'strategy'),
  mk('3-3', 3, 3, 'normal'),
  mk('3-4', 3, 4, 'normal'),
  mk('3-5', 3, 5, 'reward'),
  mk('3-6', 3, 6, 'boss'),
];

/** 书本第 1 章：1-1…1-6 → 1-7 首领，无 2-1 及以后 */
const ROUNDS_BOOK_CHAPTER_1: RoundMeta[] = [
  mk('1-1', 1, 1, 'normal'),
  mk('1-2', 1, 2, 'strategy'),
  mk('1-3', 1, 3, 'normal'),
  mk('1-4', 1, 4, 'normal'),
  mk('1-5', 1, 5, 'reward'),
  mk('1-6', 2, 6, 'normal'),
  mk('1-7', 3, 7, 'boss'),
];

/** 书本第 2 章：1-1…1-6、2-1…2-6 → 2-7 首领 */
const ROUNDS_BOOK_CHAPTER_2: RoundMeta[] = [
  mk('1-1', 1, 1, 'normal'),
  mk('1-2', 1, 2, 'strategy'),
  mk('1-3', 1, 3, 'normal'),
  mk('1-4', 1, 4, 'normal'),
  mk('1-5', 1, 5, 'reward'),
  mk('1-6', 2, 6, 'normal'),
  mk('2-1', 2, 1, 'normal'),
  mk('2-2', 2, 2, 'strategy'),
  mk('2-3', 2, 3, 'normal'),
  mk('2-4', 2, 4, 'normal'),
  mk('2-5', 2, 5, 'reward'),
  mk('2-6', 2, 6, 'normal'),
  mk('2-7', 3, 7, 'boss'),
];

/** 当前书本章节对应的关卡列表（长度 7 / 13 / 16） */
export function roundsForBookChapter(bookChapterId: number): RoundMeta[] {
  if (bookChapterId === 1) return ROUNDS_BOOK_CHAPTER_1;
  if (bookChapterId === 2) return ROUNDS_BOOK_CHAPTER_2;
  return ROUNDS;
}

/**
 * 与旧 16 关进度轴对齐的「难度下标」0…15：用于敌兵数量曲线、敌我数值曲线、战败扣血档等。
 * 特例：第 1 章 1-7 首领等同旧 2-1（下标 5）；第 2 章 2-7 首领等同旧 3-1（下标 10）。
 */
export function legacyProgressRoundIndex(bookChapterId: number, roundIndex: number): number {
  const ri = Math.max(0, Math.floor(roundIndex));
  if (bookChapterId === 1) {
    const map = [0, 1, 2, 3, 4, 4, 5];
    return map[Math.min(ri, map.length - 1)]!;
  }
  if (bookChapterId === 2) {
    const map = [0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 9, 10];
    return map[Math.min(ri, map.length - 1)]!;
  }
  return Math.min(15, ri);
}

export function bossDisplayName(id: BossId): string {
  switch (id) {
    case 'farseer':
      return '先知';
    case 'tauren':
      return '牛头人酋长';
    case 'blademaster':
      return '剑圣';
    case 'white':
      return '白板首领';
    default:
      return id;
  }
}

/** 战败扣血倍率：沿旧 16 关进度轴（legacy 下标） */
export function defeatDamageMultiplierLegacy(legacyRoundIndex: number): number {
  if (legacyRoundIndex >= 10) return 3;
  if (legacyRoundIndex >= 5) return 2;
  return 1;
}
