import type { BossId, RoundMeta } from './types';

function mk(
  label: string,
  chapter: 1 | 2 | 3,
  sub: number,
  kind: RoundMeta['kind'],
): RoundMeta {
  return { label, chapter, sub, kind, enemies: [] };
}

/**
 * 单条世界线内 16 关：1-1..1-5、2-1..2-5、3-1..3-6（末关首领）。
 * 敌阵在运行时按「外部章节」池与 seed 解析，见 `roundResolve.ts`。
 */
export const ROUNDS: RoundMeta[] = [
  mk('1-1', 1, 1, 'normal'),
  mk('1-2', 1, 2, 'strategy'),
  mk('1-3', 1, 3, 'normal'),
  mk('1-4', 1, 4, 'normal'),
  mk('1-5', 1, 5, 'reward'),
  mk('2-1', 2, 1, 'normal'),
  mk('2-2', 2, 2, 'strategy'),
  mk('2-3', 2, 3, 'normal'),
  mk('2-4', 2, 4, 'normal'),
  mk('2-5', 2, 5, 'reward'),
  mk('3-1', 3, 1, 'normal'),
  mk('3-2', 3, 2, 'strategy'),
  mk('3-3', 3, 3, 'normal'),
  mk('3-4', 3, 4, 'normal'),
  mk('3-5', 3, 5, 'reward'),
  mk('3-6', 3, 6, 'boss'),
];

export function bossDisplayName(id: BossId): string {
  switch (id) {
    case 'farseer':
      return '先知';
    case 'tauren':
      return '牛头人酋长';
    case 'blademaster':
      return '剑圣';
    default:
      return id;
  }
}

/** 战败扣血倍率：第二篇起 2×，第三篇起 3×（按 16 关进度） */
export function defeatDamageMultiplier(roundIndex: number): number {
  if (roundIndex >= 10) return 3;
  if (roundIndex >= 5) return 2;
  return 1;
}
