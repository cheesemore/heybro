import {
  allBondStacks,
  classBondHpAtkMultiplier,
  priestBondTeamMultiplier,
  type BoardSlot,
} from './battleBonds';
import { ALLY_DEFS } from './unitDefs';
import type { AllyClass } from './types';

/**
 * 招募三选一卡：假定再选 1 层该职业后的羁绊生命/攻击（含牧师全队加成）。
 * 与进战 `spawnAllies` 的羁绊乘区一致；不含神器、职业等级、装备等。
 */
export function recruitCardBondedStats(
  board: readonly BoardSlot[],
  kind: AllyClass,
): { hp: number; atk: number } {
  const def = ALLY_DEFS[kind];
  const stacks = allBondStacks(board);
  const countAfterPick = stacks[kind] + 1;
  const mult = classBondHpAtkMultiplier(countAfterPick) * priestBondTeamMultiplier(stacks.priest);
  return {
    hp: Math.max(1, Math.round(def.maxHp * mult)),
    atk: Math.max(1, Math.round(def.atk * mult)),
  };
}
