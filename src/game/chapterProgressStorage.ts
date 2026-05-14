import { BOOK_CHAPTER_COUNT } from './bookChapterConfig';
import { ROUNDS } from './roundConfig';

const STORAGE_KEY = 'heybro.chapterProgress.v1';

export type ChapterProgressFileV1 = {
  version: 1;
  clearedChapterIds: number[];
};

export type ChapterProgressFileV2 = {
  version: 2;
  clearedChapterIds: number[];
  /** 章节 id 字符串 -> 回合下标字符串 -> 该关历史最高星 1～3（仅 normal/boss） */
  bestStarByChapterRound: Record<string, Record<string, number>>;
};

const EMPTY_V2: ChapterProgressFileV2 = {
  version: 2,
  clearedChapterIds: [],
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
    return { version: 2, clearedChapterIds: unique, bestStarByChapterRound };
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

/** 世界线内「记星」的战斗回合下标（与 ROUNDS 一致） */
export function combatRoundIndices(): readonly number[] {
  return ROUNDS.map((m, i) => (m.kind === 'normal' || m.kind === 'boss' ? i : -1)).filter((i): i is number => i >= 0);
}

const MAX_STAR_PER_CHAPTER = 3;

/**
 * 通关后按剩余生命记星（已 clamp 到上限）：
 * - 100 血 → 3 星
 * - ≥60 且 &lt;100 → 2 星
 * - &lt;60 → 1 星
 */
export function starsFromHpAfterBattle(hp: number): 1 | 2 | 3 {
  const h = Math.floor(hp);
  if (h >= 100) return 3;
  if (h >= 60) return 2;
  return 1;
}

/** 单关：与历史最高取 max */
export function recordCombatRoundBestStar(chapterId: number, roundIndex: number, hpAfterBattle: number): void {
  const ch = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const ri = Math.max(0, Math.min(ROUNDS.length - 1, Math.floor(roundIndex)));
  const star = starsFromHpAfterBattle(hpAfterBattle);
  const cur = loadChapterProgress();
  const ck = String(ch);
  const rk = String(ri);
  const byRound = { ...(cur.bestStarByChapterRound[ck] ?? {}) };
  const prev = byRound[rk] ?? 0;
  if (star <= prev) {
    return;
  }
  byRound[rk] = star;
  saveChapterProgress({
    ...cur,
    bestStarByChapterRound: { ...cur.bestStarByChapterRound, [ck]: byRound },
  });
}

/**
 * 章节卡片上展示的「亮星」数量 0～3：
 * - 未完整通关该章 → 0（三颗空星）
 * - 已通关 → 各战斗关最高星中的**最低值**（短板决定章节评价）
 */
export function getChapterStarFilledCount(chapterId: number): 0 | 1 | 2 | 3 {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const cur = loadChapterProgress();
  if (!cur.clearedChapterIds.includes(id)) return 0;
  const ck = String(id);
  const map = cur.bestStarByChapterRound[ck] ?? {};
  const combat = combatRoundIndices();
  let minS = 3;
  for (const ri of combat) {
    const raw = map[String(ri)];
    const s = raw != null && raw >= 1 && raw <= 3 ? raw : 3;
    minS = Math.min(minS, s);
  }
  return minS as 0 | 1 | 2 | 3;
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

/** 测试：将指定章节记为已通关，且所有「战斗关」历史最高星一律设为 star（章节展示星 = 各战斗关最低星，故此时即为 star）。 */
export function cheatChapterFullClearWithStar(chapterId: number, star: 1 | 2 | 3): void {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const s = Math.max(1, Math.min(3, Math.floor(star))) as 1 | 2 | 3;
  const cur = loadChapterProgress();
  const ck = String(id);
  const byRound = { ...(cur.bestStarByChapterRound[ck] ?? {}) };
  for (const ri of combatRoundIndices()) {
    byRound[String(ri)] = s;
  }
  const clearedChapterIds = cur.clearedChapterIds.includes(id)
    ? [...cur.clearedChapterIds]
    : [...cur.clearedChapterIds, id].sort((a, b) => a - b);
  saveChapterProgress({
    ...cur,
    bestStarByChapterRound: { ...cur.bestStarByChapterRound, [ck]: byRound },
    clearedChapterIds,
  });
}

/** 测试/作弊：直接写入某战斗关的历史最高星（覆盖原记录，用于地图调试）。 */
export function cheatSetCombatRoundStar(chapterId: number, roundIndex: number, star: 1 | 2 | 3): void {
  const ch = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const ri = Math.max(0, Math.min(ROUNDS.length - 1, Math.floor(roundIndex)));
  const s = Math.max(1, Math.min(3, Math.floor(star))) as 1 | 2 | 3;
  const cur = loadChapterProgress();
  const ck = String(ch);
  const rk = String(ri);
  const byRound = { ...(cur.bestStarByChapterRound[ck] ?? {}) };
  byRound[rk] = s;
  saveChapterProgress({
    ...cur,
    bestStarByChapterRound: { ...cur.bestStarByChapterRound, [ck]: byRound },
  });
}

/** 标记某章已完整通关；幂等，写入本地缓存（自动存档） */
export function markChapterFullyCleared(chapterId: number): void {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const cur = loadChapterProgress();
  if (cur.clearedChapterIds.includes(id)) return;
  const clearedChapterIds = [...cur.clearedChapterIds, id].sort((a, b) => a - b);
  saveChapterProgress({ ...cur, clearedChapterIds });
}
