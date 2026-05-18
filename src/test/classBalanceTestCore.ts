import { ALLY_CLASSES } from '../game/constants';
import type { AllyClass } from '../game/types';

/** 九宫格中间列（上→下） */
export const CLASS_BALANCE_MIDDLE_SLOTS = [1, 4, 7] as const;

export const CLASS_BALANCE_STACKS_PER_CLASS = 15;

export const CLASS_BALANCE_BATTLE_TIME_SCALE = 8;

export const CLASS_SHORT_CN: Record<AllyClass, string> = {
  warrior: '战',
  mage: '法',
  priest: '牧',
  archer: '射',
  knight: '骑',
};

export function formationLabel(formation: readonly [AllyClass, AllyClass, AllyClass]): string {
  return formation.map((c) => CLASS_SHORT_CN[c]).join('');
}

export function classTripleLabel(triple: readonly [AllyClass, AllyClass, AllyClass]): string {
  return triple.map((c) => CLASS_SHORT_CN[c]).join('');
}

export function allMiddleColumnFormations(
  triple: readonly [AllyClass, AllyClass, AllyClass],
): [AllyClass, AllyClass, AllyClass][] {
  const [a, b, c] = triple;
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
}

/** 五职业任选 3（共 10 组，字典序） */
export function enumerateClassTriples(): [AllyClass, AllyClass, AllyClass][] {
  const out: [AllyClass, AllyClass, AllyClass][] = [];
  for (let i = 0; i < ALLY_CLASSES.length; i++) {
    for (let j = i + 1; j < ALLY_CLASSES.length; j++) {
      for (let k = j + 1; k < ALLY_CLASSES.length; k++) {
        out.push([ALLY_CLASSES[i]!, ALLY_CLASSES[j]!, ALLY_CLASSES[k]!]);
      }
    }
  }
  return out;
}

export type BalanceThresholdResult = {
  /** 最低仍能赢的全局修正（%）；101 表示 100% 仍无法获胜 */
  minWinPct: number;
  canWinAt100: boolean;
  /** 二分结束时：≤minWinPct-1 侧（通常败） */
  loseAtPct: number;
  /** 二分结束时：≥minWinPct 侧（通常胜） */
  winAtPct: number;
};

/**
 * 在 [1,100] 上二分：修正越低我方越弱。返回「仍能获胜」的最低整数修正（如 88 表示 87% 败、88% 胜）。
 */
export async function findMinWinningCorrectionPct(
  fight: (pct: number) => Promise<boolean>,
  onTrial?: (pct: number, won: boolean) => void,
): Promise<BalanceThresholdResult> {
  const at100 = await fight(100);
  onTrial?.(100, at100);
  if (!at100) {
    return { minWinPct: 101, canWinAt100: false, loseAtPct: 100, winAtPct: 101 };
  }

  let lo = 1;
  let hi = 100;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const won = await fight(mid);
    onTrial?.(mid, won);
    if (won) hi = mid;
    else lo = mid;
  }

  const loseAt = lo;
  const winAt = hi;
  const loWon = await fight(lo);
  onTrial?.(lo, loWon);
  if (loWon) {
    return { minWinPct: lo, canWinAt100: true, loseAtPct: Math.max(1, lo - 1), winAtPct: lo };
  }
  return { minWinPct: hi, canWinAt100: true, loseAtPct: loseAt, winAtPct: winAt };
}

export type FormationScanRow = {
  triple: [AllyClass, AllyClass, AllyClass];
  formation: [AllyClass, AllyClass, AllyClass];
  formationLabel: string;
  minWinPct: number;
  canWinAt100: boolean;
  loseAtPct: number;
  winAtPct: number;
};

export type TripleBestRow = {
  triple: [AllyClass, AllyClass, AllyClass];
  tripleLabel: string;
  bestFormation: [AllyClass, AllyClass, AllyClass];
  bestFormationLabel: string;
  minWinPct: number;
  canWinAt100: boolean;
};
