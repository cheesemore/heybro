import chaptersDoc from './config/wowBookChapters.json';
import gearDoc from './config/gearItems.json';
import type { GearDungeonRule } from './gearItems';
import { getNodeProgressMaxForBookChapter } from './gearItems';
import { legacyProgressRoundIndex } from './roundConfig';
import { enemyStatProgressCurve } from './unitDefs';
import { getWowChapterByBookId } from './wowBookData';

const DEFAULT_STRENGTH_INCREMENT = 1.02;
/** 副本战力指数：每座副本 +10×(dungeonOrdinal−1)，如第 1 座 111.2、第 2 座 116.48+10≈126.5 */
export const COMBAT_POWER_INDEX_PER_DUNGEON_ORDINAL = 10;

const dungeonRules = [...(gearDoc.dungeons as GearDungeonRule[])].sort(
  (a, b) => a.dungeonOrdinal - b.dungeonOrdinal,
);

const ruleByOrdinal = new Map(dungeonRules.map((d) => [d.dungeonOrdinal, d]));
const ruleByDungeonId = new Map(dungeonRules.map((d) => [d.dungeonId, d]));

const chaptersPerDungeonId = new Map<string, number>();
for (const c of chaptersDoc.chapters) {
  chaptersPerDungeonId.set(c.dungeonId, (chaptersPerDungeonId.get(c.dungeonId) ?? 0) + 1);
}

/** 此前各副本 `strengthIncrement` 连乘（不含当前副本） */
export function productStrengthIncrementsBefore(dungeonOrdinal: number): number {
  let product = 1;
  for (const d of dungeonRules) {
    if (d.dungeonOrdinal >= dungeonOrdinal) break;
    product *= d.strengthIncrement ?? DEFAULT_STRENGTH_INCREMENT;
  }
  return product;
}

/** 表内 combatPowerIndex + 10×(副本序号−1) */
export function dungeonCombatPowerIndex(dungeonOrdinal: number): number {
  const rule = ruleByOrdinal.get(dungeonOrdinal);
  if (!rule) return 100;
  const ord = Math.max(1, Math.floor(dungeonOrdinal));
  return rule.combatPowerIndex + COMBAT_POWER_INDEX_PER_DUNGEON_ORDINAL * (ord - 1);
}

/** 副本关底章节强度（%）= 有效战力指数 × 此前递增连乘 */
export function dungeonFinaleStrengthPercent(dungeonOrdinal: number): number {
  if (!ruleByOrdinal.get(dungeonOrdinal)) return 100;
  return dungeonCombatPowerIndex(dungeonOrdinal) * productStrengthIncrementsBefore(dungeonOrdinal);
}

export function dungeonFinaleStrengthPercentByDungeonId(dungeonId: string): number {
  const ord = ruleByDungeonId.get(dungeonId)?.dungeonOrdinal;
  return ord != null ? dungeonFinaleStrengthPercent(ord) : 100;
}

/**
 * 书本章节强度（%）：
 * - 第 1 章固定 100%
 * - 副本关底 = 战力指数 × 前面各副本 strengthIncrement 连乘
 * - 同副本内按章线性插值：上一副本关底 → 本副本关底
 */
export function bookChapterStrengthPercent(chapterId: number): number {
  if (chapterId <= 1) return 100;

  const ch = getWowChapterByBookId(chapterId);
  if (!ch) return 100;

  const rule = ruleByDungeonId.get(ch.dungeonId);
  const ordinal = rule?.dungeonOrdinal ?? 1;
  const n = Math.max(1, chaptersPerDungeonId.get(ch.dungeonId) ?? 1);
  const stage = Math.max(1, Math.min(n, ch.stageNumber));

  const thisFinale = dungeonFinaleStrengthPercent(ordinal);
  const prevFinale = ordinal <= 1 ? 100 : dungeonFinaleStrengthPercent(ordinal - 1);

  if (n <= 1) return Math.round(thisFinale);

  const t = (stage - 1) / (n - 1);
  return Math.round(prevFinale + (thisFinale - prevFinale) * t);
}

/**
 * 单节点敌方强度（%）= 本章强度 × 关内节点进度曲线（与 `scaledEnemyHp` / `scaledEnemyAtk` 一致）。
 */
export function bookChapterRoundStrengthPercent(chapterId: number, roundIndex: number): number {
  const bookPct = bookChapterStrengthPercent(chapterId);
  const leg = legacyProgressRoundIndex(chapterId, roundIndex);
  const progMax = getNodeProgressMaxForBookChapter(chapterId);
  return Math.round(bookPct * enemyStatProgressCurve(leg, progMax));
}
