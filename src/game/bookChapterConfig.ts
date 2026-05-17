import { WOW_BOOK_CHAPTER_COUNT, mobPoolForBookChapter } from './wowBookData';

export { bookChapterRoundStrengthPercent, bookChapterStrengthPercent } from './bookChapterStrength';
export {
  COMBAT_POWER_INDEX_PER_DUNGEON_ORDINAL,
  dungeonCombatPowerIndex,
  dungeonFinaleStrengthPercent,
  dungeonFinaleStrengthPercentByDungeonId,
  productStrengthIncrementsBefore,
} from './bookChapterStrength';

/** 与 `wowBookChapters.json` 章节条数一致 */
export const BOOK_CHAPTER_COUNT = WOW_BOOK_CHAPTER_COUNT;

/** 本章普通战可用的怪物 id 池（来自 `wowBookChapters.json` 的 `monsterGroup`） */
export { mobPoolForBookChapter as mobIdsForBookChapter };
