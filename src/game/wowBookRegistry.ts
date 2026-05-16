/**
 * 副本 / 章节管理表：`config/wowBookRegistry.json`
 * 表头功能说明、字段注释见 JSON 内 `purpose`、`editConvention`、`fieldGuide`。
 * 由 `npm run gen:wow-book` 生成；战斗细节仍以 `wowBookChapters.json` 为准。
 */
import registryDoc from './config/wowBookRegistry.json';

/** 装备掉落（gearId 见 gearItems.json） */
export type WowBookGearDropEntry = {
  kind: 'gear';
  gearId: string;
};

/** 掉落条目（后续可扩展材料、金币等） */
export type WowBookDropEntry = WowBookGearDropEntry | {
  id: string;
  kind?: string;
  weight?: number;
  [key: string]: unknown;
};

export function isWowBookGearDrop(entry: WowBookDropEntry): entry is WowBookGearDropEntry {
  return entry.kind === 'gear' && typeof (entry as WowBookGearDropEntry).gearId === 'string';
}

export type WowBookDungeonDrops = {
  /** 该副本全部章节通关后 */
  onDungeonClear: WowBookDropEntry[];
  /** 刷副本重复奖励（占位） */
  onFarm: WowBookDropEntry[];
};

export type WowBookDungeonUnlock = {
  /** 是否需上一座副本已通关（第 1 座为 false） */
  requiresPreviousDungeonCleared: boolean;
};

export type WowBookDungeonRow = {
  dungeonOrdinal: number;
  dungeonId: string;
  nameCn: string;
  nameEn: string;
  chapterCount: number;
  firstChapterIndex: number;
  lastChapterIndex: number;
  chapterIndices: number[];
  /** 与 `dungeonBackgroundImageUrl` 所用 id 一致 */
  backgroundAssetId: string;
  drops: WowBookDungeonDrops;
  unlock: WowBookDungeonUnlock;
};

export type WowBookRegistryChapterRow = {
  chapterIndex: number;
  dungeonId: string;
  dungeonOrdinal: number;
  dungeonNameCn: string;
  dungeonNameEn: string;
  stageNumber: number;
  stageNameCn: string;
  isFinalBoss: boolean;
  drops: WowBookDropEntry[];
};

type RegistryDoc = {
  schemaVersion: number;
  dungeonCount: number;
  chapterCount: number;
  dungeons: WowBookDungeonRow[];
  chapters: WowBookRegistryChapterRow[];
};

const doc = registryDoc as RegistryDoc;

const dungeons = doc.dungeons ?? [];
const registryChapters = doc.chapters ?? [];

export const WOW_BOOK_DUNGEON_COUNT = doc.dungeonCount ?? dungeons.length;
export const WOW_BOOK_REGISTRY_CHAPTER_COUNT = doc.chapterCount ?? registryChapters.length;

const dungeonById = new Map<string, WowBookDungeonRow>(dungeons.map((d) => [d.dungeonId, d]));
const dungeonByOrdinal = new Map<number, WowBookDungeonRow>(
  dungeons.map((d) => [d.dungeonOrdinal, d]),
);
const chapterByIndex = new Map<number, WowBookRegistryChapterRow>(
  registryChapters.map((c) => [c.chapterIndex, c]),
);

export function listWowBookDungeons(): readonly WowBookDungeonRow[] {
  return dungeons;
}

export function getWowBookDungeonById(dungeonId: string): WowBookDungeonRow | undefined {
  return dungeonById.get(dungeonId);
}

export function getWowBookDungeonByOrdinal(dungeonOrdinal: number): WowBookDungeonRow | undefined {
  const n = Math.floor(dungeonOrdinal);
  return dungeonByOrdinal.get(n);
}

export function getWowBookRegistryChapter(chapterIndex: number): WowBookRegistryChapterRow | undefined {
  const id = Math.max(1, Math.min(WOW_BOOK_REGISTRY_CHAPTER_COUNT, Math.floor(chapterIndex)));
  return chapterByIndex.get(id);
}

/** 全书章节号 → 第几个地下城（1 起） */
export function dungeonOrdinalForBookChapter(chapterIndex: number): number {
  return getWowBookRegistryChapter(chapterIndex)?.dungeonOrdinal ?? 1;
}

/** 某副本包含的全部 `chapterIndex`（已排序） */
export function chapterIndicesForDungeon(dungeonId: string): readonly number[] {
  return getWowBookDungeonById(dungeonId)?.chapterIndices ?? [];
}

/** 某副本内第几关（1 起） */
export function stageNumberForBookChapter(chapterIndex: number): number {
  return getWowBookRegistryChapter(chapterIndex)?.stageNumber ?? 1;
}
