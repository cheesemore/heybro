import {
  GEAR_QUALITY_LABELS_CN,
  getGearDungeonRule,
  type GearItemRow,
  type GearQuality,
  type GearQualityWeights,
} from './gearItems';
import { gearFarmProgressChapterId } from './gearFarmLootPreview';
import { buildGearFarmSlotPreviews } from './gearFarmProgress';
import type { GearSlotKind } from './gearSlots';
import { dungeonIdForBookChapter } from './wowBookData';

export const GEAR_QUALITY_COLORS: Record<GearQuality, number> = {
  common: 0xffffff,
  uncommon: 0x1eff00,
  rare: 0x0070dd,
  epic: 0xa335ee,
  legendary: 0xff8000,
};

export type GearFarmDropRateRow = {
  label: string;
  rate: string;
  color: number;
};

export type GearFarmLootRoll = {
  gear: GearItemRow;
  quality: GearQuality;
  slotKind: GearSlotKind;
  displayLine: string;
  tipColor: number;
};

export function gearFarmDungeonIdForProgress(): string {
  return dungeonIdForBookChapter(gearFarmProgressChapterId());
}

export { buildGearFarmSlotPreviews } from './gearFarmProgress';
export type { GearFarmSlotPreview } from './gearFarmProgress';

/** 当前进度下可参与随机掉落的部位（每部位至多一件） */
export function listFarmableSlotsForDungeon(farmDungeonId: string): GearSlotKind[] {
  return buildGearFarmSlotPreviews(farmDungeonId)
    .filter((p) => p.farmGear != null)
    .map((p) => p.slotKind);
}

export function buildGearFarmDropRateRows(dungeonId: string): GearFarmDropRateRow[] {
  const rule = getGearDungeonRule(dungeonId);
  if (!rule) return [];

  const levelLabel = `${rule.levelMin}-${rule.levelMax}级`;
  return rule.qualities.map((q) => ({
    label: `${levelLabel}${GEAR_QUALITY_LABELS_CN[q]}装备`,
    rate: `掉率${rule.qualityWeightsPercent[q] ?? 0}%`,
    color: GEAR_QUALITY_COLORS[q],
  }));
}

function rollQuality(weights: GearQualityWeights): GearQuality {
  const entries = Object.entries(weights).filter(
    (e): e is [GearQuality, number] => typeof e[1] === 'number' && e[1] > 0,
  );
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return 'common';
  let r = Math.random() * total;
  for (const [q, w] of entries) {
    r -= w;
    if (r <= 0) return q;
  }
  return entries[entries.length - 1]![0];
}

/**
 * 先随机部位（在已解锁池内），再随机品质，再取该部位当前进度对应 gearId。
 */
export function rollGearFarmLoot(farmDungeonId: string): GearFarmLootRoll | null {
  const rule = getGearDungeonRule(farmDungeonId);
  if (!rule) return null;

  const previews = buildGearFarmSlotPreviews(farmDungeonId).filter((p) => p.farmGear != null);
  if (previews.length === 0) return null;

  const pick = previews[Math.floor(Math.random() * previews.length)]!;
  const gear = pick.farmGear!;
  const quality = rollQuality(rule.qualityWeightsPercent);
  const qLabel = GEAR_QUALITY_LABELS_CN[quality];
  return {
    gear,
    quality,
    slotKind: pick.slotKind,
    displayLine: `${qLabel} ${gear.nameCn}`,
    tipColor: GEAR_QUALITY_COLORS[quality],
  };
}
