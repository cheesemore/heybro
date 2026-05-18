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

function buildDraftChoicePool(
  board: BoardCell[],
  artifactBySlot: readonly (ArtifactKind | null)[],
): AllyClass[] {
  const unlocked = getUnlockedAllyClasses();
  const onBoard = distinctAllyClassesOnBoard(board);
  const atClassCap = onBoard.size >= MAX_DISTINCT_ALLY_CLASSES_ON_BOARD;
  return unlocked.filter((k) => {
    if (atClassCap && !onBoard.has(k)) return false;
    return canAcceptPick(board, artifactBySlot, k) || onBoard.has(k);
  });
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
    pool = getUnlockedAllyClasses().filter(
      (k) => canAcceptPick(board, artifactBySlot, k) || distinctAllyClassesOnBoard(board).has(k),
    );
  }
  if (!pool.length) pool = [...getUnlockedAllyClasses()];
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
