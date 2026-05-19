import { notifyAllyClassUnlocksAfterChapterProgress } from './allyClassUnlockCelebration';
import { BOOK_CHAPTER_COUNT } from './bookChapterConfig';
import { roundsForBookChapter } from './roundConfig';
import { getWowBookDungeonById } from './wowBookRegistry';

const STORAGE_KEY = 'heybro.chapterProgress.v1';

export type ChapterProgressFileV1 = {
  version: 1;
  clearedChapterIds: number[];
};

export type ChapterProgressFileV2 = {
  version: 2;
  clearedChapterIds: number[];
  /** 章节 id -> 通关评价星 1～3（整章打完时按剩余生命记一次） */
  bestStarByChapter: Record<string, number>;
  /** @deprecated 旧版按战斗关记星；仅用于读档迁移，新进度不再写入 */
  bestStarByChapterRound?: Record<string, Record<string, number>>;
};

const EMPTY_V2: ChapterProgressFileV2 = {
  version: 2,
  clearedChapterIds: [],
  bestStarByChapter: {},
  bestStarByChapterRound: {},
};

function safeLocalStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function migrateV1ToV2(v1: ChapterProgressFileV1): ChapterProgressFileV2 {
  return {
    version: 2,
    clearedChapterIds: [...v1.clearedChapterIds],
    bestStarByChapter: {},
    bestStarByChapterRound: {},
  };
}

function parseStored(raw: string | null): ChapterProgressFileV2 {
  if (!raw) return { ...EMPTY_V2, clearedChapterIds: [] };
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return { ...EMPTY_V2, clearedChapterIds: [] };
    const o = j as Record<string, unknown>;
    if (o.version === 1) {
      const v1 = parseV1Only(o);
      return migrateV1ToV2(v1);
    }
    if (o.version !== 2) return { ...EMPTY_V2, clearedChapterIds: [] };
    const arr = o.clearedChapterIds;
    if (!Array.isArray(arr)) return { ...EMPTY_V2, clearedChapterIds: [] };
    const ids = arr.filter(
      (x): x is number =>
        typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= BOOK_CHAPTER_COUNT,
    );
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const chapterStarRaw = o.bestStarByChapter;
    const bestStarByChapter: Record<string, number> = {};
    if (chapterStarRaw && typeof chapterStarRaw === 'object') {
      for (const [ck, sv] of Object.entries(chapterStarRaw as Record<string, unknown>)) {
        if (typeof sv === 'number' && sv >= 1 && sv <= 3) bestStarByChapter[ck] = Math.floor(sv);
      }
    }
    const starRaw = o.bestStarByChapterRound;
    const bestStarByChapterRound: Record<string, Record<string, number>> = {};
    if (starRaw && typeof starRaw === 'object') {
      for (const [ck, rv] of Object.entries(starRaw as Record<string, unknown>)) {
        if (!rv || typeof rv !== 'object') continue;
        const inner: Record<string, number> = {};
        for (const [rk, sv] of Object.entries(rv as Record<string, unknown>)) {
          if (typeof sv === 'number' && sv >= 1 && sv <= 3) inner[rk] = Math.floor(sv);
        }
        if (Object.keys(inner).length) bestStarByChapterRound[ck] = inner;
      }
    }
    return { version: 2, clearedChapterIds: unique, bestStarByChapter, bestStarByChapterRound };
  } catch {
    return { ...EMPTY_V2, clearedChapterIds: [] };
  }
}

function parseV1Only(o: Record<string, unknown>): ChapterProgressFileV1 {
  const arr = o.clearedChapterIds;
  if (!Array.isArray(arr)) return { version: 1, clearedChapterIds: [] };
  const ids = arr.filter(
    (x): x is number =>
      typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= BOOK_CHAPTER_COUNT,
  );
  return { version: 1, clearedChapterIds: [...new Set(ids)].sort((a, b) => a - b) };
}

function saveChapterProgress(data: ChapterProgressFileV2): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 配额满或隐私模式 */
  }
}

/** 含星级等扩展字段的章节存档 */
export function loadChapterProgress(): ChapterProgressFileV2 {
  const ls = safeLocalStorage();
  if (!ls) return { ...EMPTY_V2, clearedChapterIds: [] };
  return parseStored(ls.getItem(STORAGE_KEY));
}

/** 删除本地章节进度存档；下次读取为空进度。 */
export function clearPersistedChapterProgress(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 该书本章节内参与记星的战斗回合下标（仅 normal / boss） */
export function combatRoundIndicesForChapter(chapterId: number): readonly number[] {
  const ch = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  return roundsForBookChapter(ch)
    .map((m, i) => (m.kind === 'normal' || m.kind === 'boss' ? i : -1))
    .filter((i): i is number => i >= 0);
}

const MAX_STAR_PER_CHAPTER = 3;

/**
 * 整章通关时按剩余生命记星（与单场胜负、是否首领战无关）：
 * - ≤0 → 未通关（0 星，不应写入 cleared）
 * - 1～49 → 1 星
 * - 50～99 → 2 星
 * - ≥100 → 3 星
 */
export function starsFromChapterClearHp(hp: number): 0 | 1 | 2 | 3 {
  const h = Math.floor(hp);
  if (h <= 0) return 0;
  if (h >= 100) return 3;
  if (h >= 50) return 2;
  return 1;
}

/** @deprecated 使用 `starsFromChapterClearHp` */
export function starsFromHpAfterBattle(hp: number): 1 | 2 | 3 {
  const s = starsFromChapterClearHp(hp);
  return s === 0 ? 1 : s;
}

function legacyChapterStarFromRounds(
  roundMap: Record<string, number> | undefined,
  chapterId: number,
): 0 | 1 | 2 | 3 {
  if (!roundMap || !Object.keys(roundMap).length) return 0;
  const combat = combatRoundIndicesForChapter(chapterId);
  let minS = 3;
  for (const ri of combat) {
    const raw = roundMap[String(ri)];
    if (raw == null || raw < 1 || raw > 3) return 0;
    minS = Math.min(minS, raw);
  }
  return minS as 0 | 1 | 2 | 3;
}

/**
 * 整章通关后写入评价星（仅当 hp&gt;0）；与历史最高取 max。
 * 返回星级提升量（招募券同步用）。
 */
export function recordChapterClearStar(chapterId: number, hpAfterChapter: number): number {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const star = starsFromChapterClearHp(hpAfterChapter);
  if (star === 0) return 0;
  const cur = loadChapterProgress();
  const ck = String(id);
  const prev = cur.bestStarByChapter[ck] ?? 0;
  if (star <= prev) return 0;
  saveChapterProgress({
    ...cur,
    bestStarByChapter: { ...cur.bestStarByChapter, [ck]: star },
  });
  return star - prev;
}

/**
 * 章节卡片亮星 0～3：未通关为 0；已通关读整章评价星（旧存档回退为各战斗关最低星）。
 */
export function getChapterStarFilledCount(chapterId: number): 0 | 1 | 2 | 3 {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const cur = loadChapterProgress();
  if (!cur.clearedChapterIds.includes(id)) return 0;
  const ck = String(id);
  const direct = cur.bestStarByChapter[ck];
  if (direct != null && direct >= 1 && direct <= 3) return direct as 1 | 2 | 3;
  return legacyChapterStarFromRounds(cur.bestStarByChapterRound?.[ck], id);
}

/** 全书已获得的章节星之和（每章最多 3，共 BOOK_CHAPTER_COUNT 章） */
export function getTotalStarFilledCount(): number {
  let t = 0;
  for (let c = 1; c <= BOOK_CHAPTER_COUNT; c++) {
    t += getChapterStarFilledCount(c);
  }
  return t;
}

export function maxTotalStars(): number {
  return BOOK_CHAPTER_COUNT * MAX_STAR_PER_CHAPTER;
}

/** 已通关章节数 + 这些章节上已获得星级 / 可拿满星（每章 3 星），用于章节选择顶栏一行文案 */
export function getCompletedChaptersStarSummary(): {
  completedChapterCount: number;
  starsEarned: number;
  starsCapForCompleted: number;
} {
  const prog = loadChapterProgress();
  const cleared = [...new Set(prog.clearedChapterIds)].filter(
    (id) => id >= 1 && id <= BOOK_CHAPTER_COUNT,
  );
  let starsEarned = 0;
  for (const c of cleared) {
    starsEarned += getChapterStarFilledCount(c);
  }
  const completedChapterCount = cleared.length;
  const starsCapForCompleted = completedChapterCount * MAX_STAR_PER_CHAPTER;
  return { completedChapterCount, starsEarned, starsCapForCompleted };
}

export function isChapterCleared(chapterIndex: number): boolean {
  const id = Math.floor(chapterIndex);
  return loadChapterProgress().clearedChapterIds.includes(id);
}

/** 副本末章（关底）已通关 */
export function isDungeonLastChapterCleared(dungeonId: string): boolean {
  const d = getWowBookDungeonById(dungeonId);
  if (!d) return false;
  return isChapterCleared(d.lastChapterIndex);
}

/** 副本倒数第二章已通关（饰品掉落关） */
export function isDungeonPenultimateChapterCleared(dungeonId: string): boolean {
  const d = getWowBookDungeonById(dungeonId);
  const indices = d?.chapterIndices;
  if (!indices || indices.length < 2) return false;
  return isChapterCleared(indices[indices.length - 2]!);
}

/** 书本第 1～4 章均为「怒焰裂谷」地下城；四关均已通关则视为该地下城已通关（用于刷副本等解锁） */
export function isRagefireChasmBookCleared(): boolean {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  for (let c = 1; c <= 4; c++) {
    if (!cleared.has(c)) return false;
  }
  return true;
}

/** 第 1…BOOK_CHAPTER_COUNT 章是否均已通关 */
export function isAllChaptersFullyCleared(): boolean {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  for (let i = 1; i <= BOOK_CHAPTER_COUNT; i++) {
    if (!cleared.has(i)) return false;
  }
  return true;
}

/**
 * 线性解锁下当前应挑战的章节（界面中央只展示这一章）：
 * - 第 1 章默认可挑战；第 N 章需已通关第 N-1 章。
 * - 若存档异常（例如缺前置通关），回退到最先不满足前置的章节。
 * - 全部通关后返回最后一章，可反复挑战。
 */
export function getCurrentChallengeChapterId(): number {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  for (let c = 1; c <= BOOK_CHAPTER_COUNT; c++) {
    const prevCleared = c === 1 || cleared.has(c - 1);
    if (!prevCleared) return c;
    if (!cleared.has(c)) return c;
  }
  return BOOK_CHAPTER_COUNT;
}

/** 测试：将指定章节记为已通关，并写入整章评价星。返回因星级提升而应折算的招募券额度差。 */
export function cheatChapterFullClearWithStar(chapterId: number, star: 1 | 2 | 3): number {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const s = Math.max(1, Math.min(3, Math.floor(star))) as 1 | 2 | 3;
  const cur = loadChapterProgress();
  const ck = String(id);
  const prev = cur.bestStarByChapter[ck] ?? 0;
  const earned = s > prev ? s - prev : 0;
  const clearedChapterIds = cur.clearedChapterIds.includes(id)
    ? [...cur.clearedChapterIds]
    : [...cur.clearedChapterIds, id].sort((a, b) => a - b);
  saveChapterProgress({
    ...cur,
    bestStarByChapter: { ...cur.bestStarByChapter, [ck]: s },
    clearedChapterIds,
  });
  notifyAllyClassUnlocksAfterChapterProgress();
  return earned;
}

/** 标记某章已完整通关；幂等，写入本地缓存（自动存档） */
export function markChapterFullyCleared(chapterId: number): void {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const cur = loadChapterProgress();
  if (cur.clearedChapterIds.includes(id)) return;
  const clearedChapterIds = [...cur.clearedChapterIds, id].sort((a, b) => a - b);
  saveChapterProgress({ ...cur, clearedChapterIds });
  notifyAllyClassUnlocksAfterChapterProgress();
}
