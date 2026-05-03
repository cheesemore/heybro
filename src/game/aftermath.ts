import { defeatDamageMultiplier } from './roundConfig';

export type Aftermath = { playerHpDelta: number; lines: string[] };

export function resolveAftermath(
  roundIndex: number,
  perfect: boolean,
  enemyHpRatioRemaining: number,
): Aftermath {
  const mult = defeatDamageMultiplier(roundIndex);
  if (perfect) {
    return {
      playerHpDelta: 2,
      lines: ['完美通关：生命值 +2'],
    };
  }
  const pct = enemyHpRatioRemaining * 100;
  const base = Math.floor(pct / 10) + 1;
  const dmg = base * mult;
  const lines = [
    `未完美通关：敌方剩余约 ${(enemyHpRatioRemaining * 100).toFixed(0)}% 总血量`,
    `基础伤害 ${base}（每 10% 余血 1 点 + 未全灭 1 点）`,
    mult > 1 ? `第 2/3 章战败倍率 ×${mult}，最终扣血 ${dmg}` : `最终扣血 ${dmg}`,
  ];
  return { playerHpDelta: -dmg, lines };
}
