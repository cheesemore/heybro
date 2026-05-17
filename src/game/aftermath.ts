import { defeatDamageMultiplierLegacy } from './roundConfig';

export type Aftermath = { playerHpDelta: number; lines: string[] };

/** 未全歼敌方时的额外惩罚：沿旧 16 关 legacy 进度轴 */
export function imperfectClearExtraPenalty(legacyRoundIndex: number): number {
  if (legacyRoundIndex >= 10) return 15;
  if (legacyRoundIndex >= 5) return 10;
  return 5;
}

const BOSS_DEFEAT_FIXED_HP = 10;

/**
 * @param legacyRoundIndex `legacyProgressRoundIndex(bookChapterId, localRoundIndex)`（0…15）
 * @param _perfectLegacy 已废弃；完美仅由「敌方是否全灭」判定，由调用方传入的 cleared 隐含
 * @param isBossRound 首领战未全歼：固定扣 10 + 首领余血百分比（点）
 */
export function resolveAftermath(
  legacyRoundIndex: number,
  _perfectLegacy: boolean,
  enemyHpRatioRemaining: number,
  isBossRound = false,
): Aftermath {
  const mult = defeatDamageMultiplierLegacy(legacyRoundIndex);
  const cleared = enemyHpRatioRemaining <= 0.0001;

  /** 敌方全灭即完美通关：+2 生命（与己方阵亡无关） */
  if (cleared) {
    return {
      playerHpDelta: 2,
      lines: ['完美 · 生命 +2'],
    };
  }

  const pct = enemyHpRatioRemaining * 100;
  const pctRounded = Math.min(100, Math.max(0, Math.round(pct)));

  if (isBossRound) {
    const total = BOSS_DEFEAT_FIXED_HP + pctRounded;
    return {
      playerHpDelta: -total,
      lines: [`余敌约 ${pctRounded}%`, `扣血 ${total}（${BOSS_DEFEAT_FIXED_HP} + 余血%）`],
    };
  }

  const base = Math.floor(pct / 10) + 1;
  const dmg = base * mult;
  const extra = imperfectClearExtraPenalty(legacyRoundIndex);
  const total = dmg + extra;
  const lines = [`余敌约 ${pctRounded}%`, `扣血 ${total}`];
  return { playerHpDelta: -total, lines };
}
