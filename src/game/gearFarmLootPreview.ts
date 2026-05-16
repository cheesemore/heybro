import type { GearSlotKind } from './gearSlots';
import { getCurrentChallengeChapterId } from './chapterProgressStorage';
import { listGearItemsForDungeon } from './gearItems';
import { dungeonIdForBookChapter, getWowChapterByBookId } from './wowBookData';

export type GearLootPreviewItem = {
  gearId: string;
  slotKind: GearSlotKind;
  nameCn: string;
};

/** 当前最高进度章节（线性解锁下正在挑战的章节） */
export function gearFarmProgressChapterId(): number {
  return getCurrentChallengeChapterId();
}

export function gearFarmStageTitleForChapter(chapterId: number): string {
  return getWowChapterByBookId(chapterId)?.stageNameCn ?? `第 ${chapterId} 章`;
}

export function gearFarmDungeonNameForChapter(chapterId: number): string {
  return getWowChapterByBookId(chapterId)?.dungeonNameCn ?? '未知副本';
}

/** 当前章节所属副本的 14 件装备（来自 gearItems.json） */
export function gearLootPreviewsForChapter(chapterId: number): GearLootPreviewItem[] {
  const dungeonId = dungeonIdForBookChapter(chapterId);
  return listGearItemsForDungeon(dungeonId).map((row) => ({
    gearId: row.gearId,
    slotKind: row.slotKind,
    nameCn: row.nameCn,
  }));
}

/** @deprecated 使用 gearLootPreviewsForChapter */
export function placeholderLootPreviewsForChapter(chapterId: number): GearLootPreviewItem[] {
  return gearLootPreviewsForChapter(chapterId);
}
