import { ALLY_CLASSES, BOARD_CELL_MAX_STACKS } from './constants';
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

/** 从 5 兵种中随机不重复取 3 个，用于传统肉鸽三选一 */
export function randomThreeFromFive(): AllyClass[] {
  const pool = [...ALLY_CLASSES];
  shuffleInPlace(pool);
  return [pool[0]!, pool[1]!, pool[2]!];
}

export function boardHasAnyUnit(board: BoardCell[]): boolean {
  return board.some((c) => c !== null);
}
