import { EXTENDED_ALLY_CLASSES } from './allyClassUnlock';
import { isAllyClassUnlocked } from './allyClassUnlock';
import type { AllyClass } from './types';

const STORAGE_KEY = 'heybro.allyClassUnlockCelebration.v1';

type CelebrationFileV1 = {
  version: 1;
  /** 已展示过「解锁新职业」弹窗的扩展职业 */
  shown: AllyClass[];
};

const sessionPending: AllyClass[] = [];

function safeLocalStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function loadShown(): Set<AllyClass> {
  const ls = safeLocalStorage();
  if (!ls) return new Set();
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const j = JSON.parse(raw) as CelebrationFileV1;
    if (j?.version !== 1 || !Array.isArray(j.shown)) return new Set();
    return new Set(j.shown.filter((c): c is AllyClass => (EXTENDED_ALLY_CLASSES as readonly string[]).includes(c)));
  } catch {
    return new Set();
  }
}

function saveShown(set: Set<AllyClass>): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const file: CelebrationFileV1 = { version: 1, shown: [...set] };
  ls.setItem(STORAGE_KEY, JSON.stringify(file));
}

export function isAllyClassUnlockCelebrationShown(cls: AllyClass): boolean {
  return loadShown().has(cls);
}

export function markAllyClassUnlockCelebrationShown(cls: AllyClass): void {
  const set = loadShown();
  set.add(cls);
  saveShown(set);
}

/** 已解锁但未展示过庆祝弹窗的扩展职业 */
export function allyClassesNeedingUnlockCelebration(): AllyClass[] {
  return EXTENDED_ALLY_CLASSES.filter((c) => isAllyClassUnlocked(c) && !isAllyClassUnlockCelebrationShown(c));
}

/** 章节进度更新后调用：将新解锁职业加入待弹队列（内存） */
export function notifyAllyClassUnlocksAfterChapterProgress(): AllyClass[] {
  const added: AllyClass[] = [];
  for (const c of allyClassesNeedingUnlockCelebration()) {
    if (!sessionPending.includes(c)) {
      sessionPending.push(c);
      added.push(c);
    }
  }
  return added;
}

/** 进入选关等界面前：把存档中未展示过的解锁职业并入待弹队列 */
export function syncPendingUnlockCelebrationsFromSave(): void {
  for (const c of allyClassesNeedingUnlockCelebration()) {
    if (!sessionPending.includes(c)) sessionPending.push(c);
  }
}

export function hasPendingUnlockCelebration(): boolean {
  return sessionPending.length > 0;
}

export function shiftPendingUnlockCelebration(): AllyClass | null {
  return sessionPending.shift() ?? null;
}

export function clearPersistedAllyClassUnlockCelebration(): void {
  sessionPending.length = 0;
  safeLocalStorage()?.removeItem(STORAGE_KEY);
}
