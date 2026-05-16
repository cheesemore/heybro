import { isChapterCleared, isDungeonLastChapterCleared, isDungeonPenultimateChapterCleared } from './chapterProgressStorage';
import { getChapterIndexForGearDrop } from './gearDropIndex';
import { getGearItemForDungeonSlot, type GearItemRow } from './gearItems';
import { GEAR_EQUIPMENT_SLOTS, type GearSlotKind } from './gearSlots';
import { listWowBookDungeons, getWowBookDungeonById } from './wowBookRegistry';

export type GearFarmSlotPreview = {
  slotKind: GearSlotKind;
  slotNo: number;
  slotLabelCn: string;
  /** 当前进度下该部位可刷到的装备；未解锁为 null */
  farmGear: GearItemRow | null;
};

function dungeonsUpToOrdinal(maxOrdinal: number) {
  return listWowBookDungeons()
    .filter((d) => d.dungeonOrdinal <= maxOrdinal)
    .sort((a, b) => b.dungeonOrdinal - a.dungeonOrdinal);
}

/**
 * 按进度解析某部位可刷装备：主手=已通关末章的最高副本；饰品=已通关倒数第二章的最高副本；
 * 其余=该部位掉落章已通关的最高副本（不超过当前刷本副本序）。
 */
export function resolveFarmGearForSlot(
  slotKind: GearSlotKind,
  farmDungeonId: string,
): GearItemRow | null {
  const farmDungeon = getWowBookDungeonById(farmDungeonId);
  if (!farmDungeon) return null;

  const dungeons = dungeonsUpToOrdinal(farmDungeon.dungeonOrdinal);

  if (slotKind === 'mainHand') {
    for (const d of dungeons) {
      if (isDungeonLastChapterCleared(d.dungeonId)) {
        return getGearItemForDungeonSlot(d.dungeonId, 'mainHand') ?? null;
      }
    }
    return null;
  }

  if (slotKind === 'trinket') {
    for (const d of dungeons) {
      if (isDungeonPenultimateChapterCleared(d.dungeonId)) {
        return getGearItemForDungeonSlot(d.dungeonId, 'trinket') ?? null;
      }
    }
    return null;
  }

  for (const d of dungeons) {
    const gear = getGearItemForDungeonSlot(d.dungeonId, slotKind);
    if (!gear) continue;
    const ch = getChapterIndexForGearDrop(gear.gearId);
    if (ch != null && isChapterCleared(ch)) return gear;
  }

  return null;
}

/** 14 个部位各自可刷装备（用于预览与 roll 池） */
export function buildGearFarmSlotPreviews(farmDungeonId: string): GearFarmSlotPreview[] {
  return GEAR_EQUIPMENT_SLOTS.map((def) => ({
    slotKind: def.kind,
    slotNo: def.slotNo,
    slotLabelCn: def.labelCn,
    farmGear: resolveFarmGearForSlot(def.kind, farmDungeonId),
  }));
}
