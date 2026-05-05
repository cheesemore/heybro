import { BOOK_CHAPTER_COUNT } from './bookChapterConfig';

const STORAGE_KEY = 'heybro.chapterProgress.v1';

export type ChapterProgressFileV1 = {
  version: 1;
  /** 至少完整通关过一次的章节 id（1…BOOK_CHAPTER_COUNT），升序去重 */
  clearedChapterIds: number[];
};

const EMPTY: ChapterProgressFileV1 = { version: 1, clearedChapterIds: [] };

function safeLocalStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function parseStored(raw: string | null): ChapterProgressFileV1 {
  if (!raw) return { ...EMPTY, clearedChapterIds: [] };
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return { ...EMPTY, clearedChapterIds: [] };
    const o = j as Record<string, unknown>;
    if (o.version !== 1) return { ...EMPTY, clearedChapterIds: [] };
    const arr = o.clearedChapterIds;
    if (!Array.isArray(arr)) return { ...EMPTY, clearedChapterIds: [] };
    const ids = arr.filter(
      (x): x is number =>
        typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= BOOK_CHAPTER_COUNT,
    );
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    return { version: 1, clearedChapterIds: unique };
  } catch {
    return { ...EMPTY, clearedChapterIds: [] };
  }
}

/** 读取章节通关记录（无存储或非浏览器环境则返回空） */
export function loadChapterProgress(): ChapterProgressFileV1 {
  const ls = safeLocalStorage();
  if (!ls) return { ...EMPTY, clearedChapterIds: [] };
  return parseStored(ls.getItem(STORAGE_KEY));
}

function saveChapterProgress(data: ChapterProgressFileV1): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 配额满或隐私模式：静默失败 */
  }
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

/** 第 1…BOOK_CHAPTER_COUNT 章是否均已通关 */
export function isAllChaptersFullyCleared(): boolean {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  for (let i = 1; i <= BOOK_CHAPTER_COUNT; i++) {
    if (!cleared.has(i)) return false;
  }
  return true;
}

/** 标记某章已完整通关；幂等，写入本地缓存（自动存档） */
export function markChapterFullyCleared(chapterId: number): void {
  const id = Math.max(1, Math.min(BOOK_CHAPTER_COUNT, Math.floor(chapterId)));
  const cur = loadChapterProgress();
  if (cur.clearedChapterIds.includes(id)) return;
  const clearedChapterIds = [...cur.clearedChapterIds, id].sort((a, b) => a - b);
  saveChapterProgress({ version: 1, clearedChapterIds });
}
