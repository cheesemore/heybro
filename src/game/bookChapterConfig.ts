import type { BossId, EnemyClass } from './types';
import { ENEMY_CLASSES } from './constants';

export const BOOK_CHAPTER_COUNT = 30;

/** 第 n 章强度百分比：100%、115%、130%… 每章 +15% */
export function bookChapterStrengthPercent(chapterId: number): number {
  const n = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, chapterId));
  return 100 + 15 * (n - 1);
}

const BOSS_ROTATION: BossId[] = ['farseer', 'tauren', 'blademaster'];

/** 章节首领循环：先知 → 牛头人酋长 → 剑圣 */
export function bossIdForBookChapter(chapterId: number): BossId {
  const n = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, chapterId));
  return BOSS_ROTATION[(n - 1) % BOSS_ROTATION.length]!;
}

/**
 * 每章 6 种可出战小怪（全章普通战斗只从这 6 种里抽 3 种上场）。
 * 30 章手工分配：相邻章有重叠便于难度爬升，全书覆盖 12 兵种。
 */
export const BOOK_CHAPTER_ENEMY_POOLS: readonly (readonly EnemyClass[])[] = [
  ['grunt', 'dread_warrior', 'raider', 'beserker', 'kodo', 'headhunter'],
  ['dread_warrior', 'raider', 'beserker', 'kodo', 'ultralisk', 'darkspear'],
  ['raider', 'beserker', 'kodo', 'ultralisk', 'abomination', 'shaman'],
  ['beserker', 'kodo', 'ultralisk', 'abomination', 'headhunter', 'batrider'],
  ['kodo', 'ultralisk', 'abomination', 'headhunter', 'darkspear', 'catapult'],
  ['ultralisk', 'abomination', 'headhunter', 'darkspear', 'shaman', 'grunt'],
  ['abomination', 'headhunter', 'darkspear', 'shaman', 'batrider', 'dread_warrior'],
  ['headhunter', 'darkspear', 'shaman', 'batrider', 'catapult', 'raider'],
  ['darkspear', 'shaman', 'batrider', 'catapult', 'grunt', 'beserker'],
  ['shaman', 'batrider', 'catapult', 'grunt', 'dread_warrior', 'kodo'],
  ['batrider', 'catapult', 'grunt', 'dread_warrior', 'raider', 'ultralisk'],
  ['catapult', 'grunt', 'dread_warrior', 'raider', 'beserker', 'abomination'],
  ['grunt', 'raider', 'beserker', 'ultralisk', 'abomination', 'headhunter'],
  ['dread_warrior', 'beserker', 'ultralisk', 'abomination', 'headhunter', 'darkspear'],
  ['raider', 'ultralisk', 'abomination', 'headhunter', 'darkspear', 'shaman'],
  ['beserker', 'abomination', 'headhunter', 'darkspear', 'shaman', 'batrider'],
  ['kodo', 'headhunter', 'darkspear', 'shaman', 'batrider', 'catapult'],
  ['ultralisk', 'darkspear', 'shaman', 'batrider', 'catapult', 'grunt'],
  ['abomination', 'shaman', 'batrider', 'catapult', 'grunt', 'dread_warrior'],
  ['headhunter', 'batrider', 'catapult', 'grunt', 'dread_warrior', 'raider'],
  ['darkspear', 'catapult', 'grunt', 'dread_warrior', 'raider', 'beserker'],
  ['shaman', 'grunt', 'dread_warrior', 'raider', 'beserker', 'kodo'],
  ['batrider', 'dread_warrior', 'raider', 'beserker', 'kodo', 'ultralisk'],
  ['catapult', 'raider', 'beserker', 'kodo', 'ultralisk', 'abomination'],
  ['grunt', 'beserker', 'kodo', 'ultralisk', 'abomination', 'headhunter'],
  ['dread_warrior', 'kodo', 'ultralisk', 'abomination', 'headhunter', 'darkspear'],
  ['raider', 'ultralisk', 'abomination', 'headhunter', 'darkspear', 'shaman'],
  ['beserker', 'abomination', 'headhunter', 'darkspear', 'shaman', 'batrider'],
  ['kodo', 'headhunter', 'darkspear', 'shaman', 'batrider', 'catapult'],
  ['ultralisk', 'darkspear', 'shaman', 'batrider', 'catapult', 'grunt'],
] as const;

export function enemyPoolForBookChapter(chapterId: number): readonly EnemyClass[] {
  const row = BOOK_CHAPTER_ENEMY_POOLS[Math.max(0, Math.min(BOOK_CHAPTER_COUNT - 1, chapterId - 1))];
  return row ?? ENEMY_CLASSES;
}
