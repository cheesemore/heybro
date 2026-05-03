import { ALLY_CLASSES, BOARD_CELL_MAX_STACKS } from './constants';
import type { AllyClass, BoardCell } from './types';

export function canAcceptPick(board: BoardCell[], kind: AllyClass): boolean {
  if (board.some((c) => c?.kind === kind)) return true;
  return board.some((c) => c === null);
}

export function applyPick(board: BoardCell[], kind: AllyClass): boolean {
  if (!canAcceptPick(board, kind)) return false;
  const existing = board.findIndex((c) => c?.kind === kind);
  if (existing >= 0) {
    const cell = board[existing]!;
    board[existing] = { kind, stacks: Math.min(BOARD_CELL_MAX_STACKS, cell.stacks + 1) };
    return true;
  }
  const empties = board
    .map((c, i) => (c === null ? i : -1))
    .filter((i): i is number => i >= 0);
  const idx = empties[Math.floor(Math.random() * empties.length)]!;
  board[idx] = { kind, stacks: 1 };
  return true;
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
