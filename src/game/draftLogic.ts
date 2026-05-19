import { BOARD_CELL_MAX_STACKS } from './constants';
import { getUnlockedAllyClasses, MAX_DISTINCT_ALLY_CLASSES_ON_BOARD } from './allyClassUnlock';
import type { ArtifactKind } from './strategyTypes';
import type { AllyClass, BoardCell } from './types';

/** 该格可放新兵种：无兵且无神器的空格，或已有同兵种可叠层 */
export function canAcceptPick(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
  kind: AllyClass,
): boolean {
  if (board.some((c) => c?.kind === kind)) return true;
  for (let i = 0; i < 9; i++) {
    if (board[i] === null && artifactBySlot[i] === null) return true;
  }
  return false;
}

/** 选牌成功时返回落点九宫格索引（叠层时为该兵种所在格） */
export function applyPick(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
  kind: AllyClass,
): number | null {
  if (!canAcceptPick(board, artifactBySlot, kind)) return null;
  const existing = board.findIndex((c) => c?.kind === kind);
  if (existing >= 0) {
    const cell = board[existing]!;
    board[existing] = { kind, stacks: Math.min(BOARD_CELL_MAX_STACKS, cell.stacks + 1) };
    return existing;
  }
  const empties: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null && artifactBySlot[i] === null) empties.push(i);
  }
  if (!empties.length) return null;
  const idx = empties[Math.floor(Math.random() * empties.length)]!;
  board[idx] = { kind, stacks: 1 };
  return idx;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

export function distinctAllyClassesOnBoard(board: BoardCell[]): Set<AllyClass> {
  const s = new Set<AllyClass>();
  for (const c of board) {
    if (c) s.add(c.kind);
  }
  return s;
}

/** 策略/奖励关发兵、三选一：达 5 兵种上限后仅含已在场职业；否则含可新入场的已解锁职业 */
export function allyClassesEligibleForGrant(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
): AllyClass[] {
  const onBoard = distinctAllyClassesOnBoard(board);
  const atClassCap = onBoard.size >= MAX_DISTINCT_ALLY_CLASSES_ON_BOARD;
  return getUnlockedAllyClasses().filter((k) => {
    if (onBoard.has(k)) return true;
    if (atClassCap) return false;
    return canAcceptPick(board, artifactBySlot, k);
  });
}

/**
 * 奖励关等：随机一个可获得的职业（达上限时只从场上已有职业中抽，可叠层）。
 */
export function randomAllyClassForGrant(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
): AllyClass | null {
  const pool = allyClassesEligibleForGrant(board, artifactBySlot);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * 策略「随机获得若干不同兵种」：一次至多 n 个**不同**职业，且不会让场上职业种类超过 5。
 */
export function randomDistinctAllyClassesForGrant(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
  n: number,
): AllyClass[] {
  const simulated = distinctAllyClassesOnBoard(board);
  const picked: AllyClass[] = [];
  let pool = allyClassesEligibleForGrant(board, artifactBySlot);
  shuffleInPlace(pool);
  for (const k of pool) {
    if (picked.length >= n) break;
    if (picked.includes(k)) continue;
    if (!simulated.has(k) && simulated.size >= MAX_DISTINCT_ALLY_CLASSES_ON_BOARD) continue;
    picked.push(k);
    simulated.add(k);
  }
  return picked;
}

/** 超级加倍等：从场上已有兵种中随机选一个职业 */
export function randomAllyClassOnBoard(board: BoardCell[]): AllyClass | null {
  const kinds = [...distinctAllyClassesOnBoard(board)];
  if (!kinds.length) return null;
  return kinds[Math.floor(Math.random() * kinds.length)]!;
}

function buildDraftChoicePool(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
): AllyClass[] {
  return allyClassesEligibleForGrant(board, artifactBySlot);
}

/**
 * 从已解锁职业中随机不重复取最多 3 个（受棋盘 5 兵种上限与空格约束）。
 */
export function randomThreeDraftChoices(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
): AllyClass[] {
  let pool = buildDraftChoicePool(board, artifactBySlot);
  if (pool.length < 3) {
    pool = allyClassesEligibleForGrant(board, artifactBySlot);
  }
  shuffleInPlace(pool);
  return pool.slice(0, Math.min(3, pool.length));
}

/** @deprecated 使用 randomThreeDraftChoices(board, artifactBySlot) */
export function randomThreeFromFive(): AllyClass[] {
  const board: BoardCell[] = Array.from({ length: 9 }, () => null);
  const artifactBySlot: (ArtifactKind | null)[] = Array.from({ length: 9 }, () => null);
  return randomThreeDraftChoices(board, artifactBySlot);
}

export function boardHasAnyUnit(board: BoardCell[]): boolean {
  return board.some((c) => c !== null);
}
