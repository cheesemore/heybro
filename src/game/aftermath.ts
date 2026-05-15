import { defeatDamageMultiplier } from './roundConfig';

export type Aftermath = { playerHpDelta: number; lines: string[] };

/** 未全歼敌方时的额外惩罚：第二篇起 10，第三篇起 15（按 16 关进度） */
export function imperfectClearExtraPenalty(roundIndex: number): number {
  if (roundIndex >= 10) return 15;
  if (roundIndex >= 5) return 10;
  return 5;
}

/**
 * @param _perfectLegacy 已废弃；完美仅由「敌方是否全灭」判定，由调用方传入的 cleared 隐含
 */
export function resolveAftermath(
  roundIndex: number,
  _perfectLegacy: boolean,
  enemyHpRatioRemaining: number,
): Aftermath {
  const mult = defeatDamageMultiplier(roundIndex);
  const cleared = enemyHpRatioRemaining <= 0.0001;

  /** 敌方全灭即完美通关：+2 生命（与己方阵亡无关） */
  if (cleared) {
    return {
      playerHpDelta: 2,
      lines: ['完美 · 生命 +2'],
    };
  }

  const pct = enemyHpRatioRemaining * 100;
  const base = Math.floor(pct / 10) + 1;
  const dmg = base * mult;
  const extra = imperfectClearExtraPenalty(roundIndex);
  const total = dmg + extra;
  const pctRounded = Math.min(100, Math.max(0, Math.round(pct)));
  const lines = [`余敌约 ${pctRounded}%`, `扣血 ${total}`];
  return { playerHpDelta: -total, lines };
}
