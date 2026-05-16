/**
 * 从 wowBookRegistry 构建装备掉落索引：gearId → 掉落章节。
 */
import registryDoc from './config/wowBookRegistry.json';
import { isWowBookGearDrop, type WowBookDropEntry } from './wowBookRegistry';

const gearIdToChapterIndex = new Map<string, number>();

for (const ch of registryDoc.chapters ?? []) {
  for (const drop of (ch.drops ?? []) as WowBookDropEntry[]) {
    if (!isWowBookGearDrop(drop)) continue;
    if (!gearIdToChapterIndex.has(drop.gearId)) {
      gearIdToChapterIndex.set(drop.gearId, ch.chapterIndex);
    }
  }
}

export function getChapterIndexForGearDrop(gearId: string): number | undefined {
  return gearIdToChapterIndex.get(gearId);
}
