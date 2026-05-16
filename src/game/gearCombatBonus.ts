/** GS 转战力：独立乘区，生命与攻击同比例提升（对棋盘单位与英雄生效） */
export const GS_TO_COMBAT_PERCENT_DIVISOR = 200;

/** 加成百分点 = GS/系数（不先取整；最终 maxHp/atk 在战斗生成时再 round） */
export function gsCombatBonusPercentExact(totalGs: number): number {
  const gs = Math.max(0, Math.floor(totalGs));
  return gs / GS_TO_COMBAT_PERCENT_DIVISOR;
}

/** 展示用：保留两位小数（不含 % 号） */
export function gsCombatBonusPercentDisplay(totalGs: number): string {
  return gsCombatBonusPercentExact(totalGs).toFixed(2);
}

/** 生命/攻击独立乘区 */
export function gsCombatStatMult(totalGs: number): number {
  return 1 + gsCombatBonusPercentExact(totalGs) / 100;
}

/** 0 GS = 100%；含小数（与加成百分点一致） */
export function gsCombatPowerIndex(totalGs: number): number {
  return 100 + gsCombatBonusPercentExact(totalGs);
}

/** 副本表 `topGearSetGs` → 战力指数（保留两位小数） */
export function combatPowerIndexFromGearSetGs(fullSetGs: number): number {
  return Math.round(gsCombatPowerIndex(fullSetGs) * 100) / 100;
}

export function formatGearGsRaidLeaderHint(totalGs: number): string {
  const shown = gsCombatBonusPercentDisplay(totalGs);
  return `（团长说GS高就能进团，这套装备增加生命与攻击 ${shown}%）`;
}
