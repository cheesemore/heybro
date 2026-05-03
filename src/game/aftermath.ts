import { defeatDamageMultiplier } from './roundConfig';

export type Aftermath = { playerHpDelta: number; lines: string[] };

export function resolveAftermath(
  roundIndex: number,
  perfect: boolean,
  enemyHpRatioRemaining: number,
): Aftermath {
  const mult = defeatDamageMultiplier(roundIndex);
  const cleared = enemyHpRatioRemaining <= 0.0001;

  /** 仅「清空敌方且完美」+2；清空但非完美（如有我方阵亡）不涨生命 */
  if (cleared && perfect) {
    return {
      playerHpDelta: 2,
      lines: ['完美通关：生命值 +2'],
    };
  }
  if (cleared && !perfect) {
    return {
      playerHpDelta: 0,
      lines: ['战斗胜利（非完美通关）：有我方单位阵亡，生命值不变'],
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
