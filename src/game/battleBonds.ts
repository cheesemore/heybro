import { ALLY_CLASSES } from './constants';
import type { AllyClass, BoardCell } from './types';

export type BoardSlot = BoardCell | null;

/** 敌方攻击距离 ≥ 此值视为「远程」，战士格挡对其生效 */
export const RANGED_ATTACK_RANGE_THRESHOLD = 100;

export function stacksOnBoard(board: readonly BoardSlot[], kind: AllyClass): number {
  let s = 0;
  for (const c of board) {
    if (c && c.kind === kind) s += c.stacks;
  }
  return s;
}

export function allBondStacks(board: readonly BoardSlot[]): Record<AllyClass, number> {
  const o = {} as Record<AllyClass, number>;
  for (const k of ALLY_CLASSES) o[k] = stacksOnBoard(board, k);
  return o;
}

/** 战士/法师/射手/骑士：3/6/10 层羁绊数值档，加法叠加 */
export function classBondHpAtkMultiplier(count: number): number {
  let m = 1;
  if (count >= 3) m += 0.3;
  if (count >= 6) m += 0.5;
  if (count >= 10) m += 0.7;
  return m;
}

/** 牧师：全队生命与攻击加成，阈值 3/6/10 */
export function priestBondTeamMultiplier(priestCount: number): number {
  let m = 1;
  if (priestCount >= 3) m += 0.15;
  if (priestCount >= 6) m += 0.25;
  if (priestCount >= 10) m += 0.35;
  return m;
}

/** 职业终极羁绊：层数总和 ≥15 时激活 */
export function hasBondUltimate(count: number): boolean {
  return count >= 15;
}

/** 极巨化羁绊（红）：层数总和 ≥21 时激活（入场随机 3 个该职业单位） */
export function hasBondMega(count: number): boolean {
  return count >= 21;
}

/** 极巨化：仅放大代币与碰撞半径至此倍数（相对原体型）；不修改攻击力与生命 */
export const BOND_MEGA_RADIUS_MULT = 1.5 as const;
