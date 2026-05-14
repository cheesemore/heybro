import { WOW_BOOK_CHAPTER_COUNT, mobPoolForBookChapter } from './wowBookData';

/** 与 `wowBookChapters.json` 章节条数一致 */
export const BOOK_CHAPTER_COUNT = WOW_BOOK_CHAPTER_COUNT;

/**
 * 书本章节强度（百分比）：第 1 章 100%，末章与原 30 章制末章（535%）同量级，中间线性插值。
 */
export function bookChapterStrengthPercent(chapterId: number): number {
  const n = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, chapterId));
  if (BOOK_CHAPTER_COUNT <= 1) return 100;
  const t = (n - 1) / (BOOK_CHAPTER_COUNT - 1);
  const lastBonus = 15 * 29;
  return Math.round(100 + t * lastBonus);
}

/** 本章普通战可用的怪物 id 池（来自 `wowBookChapters.json` 的 `monsterGroup`） */
export { mobPoolForBookChapter as mobIdsForBookChapter };
