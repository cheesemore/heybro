/**
 * 副本装备表：`config/gearItems.json`
 * 每副本 14 件（每部位 1 件）；副本级等级区间与品质概率见 `dungeons[]`。
 */
import gearDoc from './config/gearItems.json';
import type { GearSlotKind } from './gearSlots';
import { dungeonIdForBookChapter } from './wowBookData';

/** 白 / 绿 / 蓝 / 紫 / 橙 */
export type GearQuality =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type GearQualityWeights = Partial<Record<GearQuality, number>>;

export type GearDungeonRule = {
  dungeonId: string;
  dungeonOrdinal: number;
  nameCn: string;
  levelMin: number;
  levelMax: number;
  qualityTierId: string;
  /** 本副本可出现的品质列表 */
  qualities: GearQuality[];
  /** 各品质掉落权重（百分比，合计 100） */
  qualityWeightsPercent: GearQualityWeights;
  /** 为 true 时 gen:gear-items 不覆盖等级/品质字段 */
  manual?: boolean;
  /** 本副本顶级全套（满级+最高品质+满 roll）总 GS */
  topGearSetGs: number;
  /** 战力指数：100 + topGearSetGs/200（与玩家装备 GS 转战力规则一致） */
  combatPowerIndex: number;
  /** 强度递增系数；本副本关底强度 = 战力指数 × 此前各副本递增连乘 */
  strengthIncrement: number;
  /**
   * 进本后关内节点进度曲线上限：legacy 0→15 时敌方进度倍率从 1× 线性到该值（默认 6.5）。
   * 见 `enemyStatProgressCurve` / `scaledEnemyHp`。
   */
  nodeProgressMax: number;
};

export const INTRA_CHAPTER_LEGACY_INDEX_MAX = 15;
export const DEFAULT_NODE_PROGRESS_MAX = 6.5;

export type GearItemRow = {
  gearId: string;
  dungeonId: string;
  dungeonOrdinal: number;
  slotKind: GearSlotKind;
  slotNo: number;
  nameCn: string;
  levelMin: number;
  levelMax: number;
  qualities: GearQuality[];
  qualityWeightsPercent: GearQualityWeights;
};

type GearItemsDoc = {
  schemaVersion: number;
  slotCount: number;
  dungeonCount: number;
  itemCount: number;
  qualityLabelsCn?: Record<GearQuality, string>;
  dungeons: GearDungeonRule[];
  items: GearItemRow[];
};

const doc = gearDoc as GearItemsDoc;
const items = doc.items ?? [];
const dungeonRules = doc.dungeons ?? [];

const byGearId = new Map<string, GearItemRow>(items.map((r) => [r.gearId, r]));
const byDungeonId = new Map<string, GearItemRow[]>();
const ruleByDungeonId = new Map<string, GearDungeonRule>(
  dungeonRules.map((d) => [d.dungeonId, d]),
);

for (const row of items) {
  const list = byDungeonId.get(row.dungeonId) ?? [];
  list.push(row);
  byDungeonId.set(row.dungeonId, list);
}

for (const [dungeonId, list] of byDungeonId) {
  list.sort((a, b) => a.slotNo - b.slotNo);
  if (list.length !== doc.slotCount) {
    console.warn(
      `[gearItems] 副本 ${dungeonId} 装备数为 ${list.length}，期望 ${doc.slotCount}`,
    );
  }
}

export const GEAR_QUALITY_ORDER: readonly GearQuality[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/** 品质列表中的最高档（用于刷本预览等） */
export function highestGearQuality(qualities: readonly GearQuality[]): GearQuality {
  let pick: GearQuality = 'common';
  let rank = -1;
  for (const q of qualities) {
    const r = GEAR_QUALITY_ORDER.indexOf(q);
    if (r > rank) {
      rank = r;
      pick = q;
    }
  }
  return pick;
}

export const GEAR_QUALITY_LABELS_CN: Record<GearQuality, string> = {
  common: doc.qualityLabelsCn?.common ?? '普通',
  uncommon: doc.qualityLabelsCn?.uncommon ?? '精良',
  rare: doc.qualityLabelsCn?.rare ?? '稀有',
  epic: doc.qualityLabelsCn?.epic ?? '史诗',
  legendary: doc.qualityLabelsCn?.legendary ?? '传说',
};

export const GEAR_ITEMS_PER_DUNGEON = doc.slotCount ?? 14;
export const GEAR_ITEM_COUNT = doc.itemCount ?? items.length;

export function getGearDungeonRule(dungeonId: string): GearDungeonRule | undefined {
  return ruleByDungeonId.get(dungeonId);
}

export function getGearDungeonCombatPowerIndex(dungeonId: string): number | undefined {
  return getGearDungeonRule(dungeonId)?.combatPowerIndex;
}

export function getNodeProgressMaxForDungeon(dungeonId: string): number {
  const v = getGearDungeonRule(dungeonId)?.nodeProgressMax;
  return typeof v === 'number' && v >= 1 ? v : DEFAULT_NODE_PROGRESS_MAX;
}

export function getNodeProgressMaxForBookChapter(bookChapterId: number): number {
  return getNodeProgressMaxForDungeon(dungeonIdForBookChapter(bookChapterId));
}

export function listGearDungeonRules(): readonly GearDungeonRule[] {
  return dungeonRules;
}

export function getGearItemById(gearId: string): GearItemRow | undefined {
  return byGearId.get(gearId);
}

export function getGearItemForDungeonSlot(
  dungeonId: string,
  slotKind: GearSlotKind,
): GearItemRow | undefined {
  return byDungeonId.get(dungeonId)?.find((r) => r.slotKind === slotKind);
}

/** 某副本全部 14 件装备（按 slotNo 排序） */
export function listGearItemsForDungeon(dungeonId: string): readonly GearItemRow[] {
  return byDungeonId.get(dungeonId) ?? [];
}

export function listAllGearItems(): readonly GearItemRow[] {
  return items;
}
