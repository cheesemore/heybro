import type { GearQuality } from './gearItems';
import { GEAR_EQUIPMENT_SLOTS, type GearSlotKind } from './gearSlots';

/** 品质乘数（白/绿/蓝/紫/橙） */
export const GEAR_QUALITY_SCORE_MULT: Record<GearQuality, number> = {
  common: 100,
  uncommon: 120,
  rare: 150,
  epic: 190,
  legendary: 250,
};

const LEVEL_GROWTH = 1.07;

/** 主手、饰品：GS 翻倍 */
export function isGearSlotGsDoubled(slotKind: GearSlotKind): boolean {
  return slotKind === 'mainHand' || slotKind === 'trinket';
}

/** 随机系数 85～100（含） */
export function rollGearRandomFactorPercent(): number {
  return 85 + Math.floor(Math.random() * 16);
}

export function rollGearLevelInRange(levelMin: number, levelMax: number): number {
  const lo = Math.min(levelMin, levelMax);
  const hi = Math.max(levelMin, levelMax);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * 单件基础分 = round(1.05^等级 × 品质乘数 × 随机系数% / 100)
 * （武器/饰品请用 `computeGearGs` 含部位倍率）
 */
export function computeGearPowerScore(
  level: number,
  quality: GearQuality,
  randomFactorPercent: number,
): number {
  const lv = Math.max(1, Math.floor(level));
  const mult = GEAR_QUALITY_SCORE_MULT[quality] ?? 100;
  const pct = Math.max(85, Math.min(100, Math.floor(randomFactorPercent)));
  const raw = Math.pow(LEVEL_GROWTH, lv) * mult * (pct / 100);
  return Math.max(1, Math.round(raw));
}

/** 单件 GS（主手、饰品 ×2） */
export function computeGearGs(
  level: number,
  quality: GearQuality,
  randomFactorPercent: number,
  slotKind: GearSlotKind,
): number {
  const base = computeGearPowerScore(level, quality, randomFactorPercent);
  return isGearSlotGsDoubled(slotKind) ? base * 2 : base;
}

/** 14 件同等级/品质/随机系数满roll 的套装总 GS 上限 */
export function computeFullSetGsTotal(opts: {
  level: number;
  quality: GearQuality;
  randomFactorPercent: number;
}): number {
  let total = 0;
  for (const s of GEAR_EQUIPMENT_SLOTS) {
    total += computeGearGs(opts.level, opts.quality, opts.randomFactorPercent, s.kind);
  }
  return total;
}

/** 5 级白板满 roll（随机 100%）全套 GS */
export const GEAR_FULL_SET_GS_LEVEL5_COMMON_MAX = computeFullSetGsTotal({
  level: 5,
  quality: 'common',
  randomFactorPercent: 100,
});

/** 60 级橙色满 roll 全套 GS */
export const GEAR_FULL_SET_GS_LEVEL60_LEGENDARY_MAX = computeFullSetGsTotal({
  level: 60,
  quality: 'legendary',
  randomFactorPercent: 100,
});
