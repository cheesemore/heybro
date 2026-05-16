import type { GearItemRow, GearQuality } from './gearItems';
import {
  computeGearGs,
  rollGearLevelInRange,
  rollGearRandomFactorPercent,
} from './gearScore';
import type { GearSlotKind } from './gearSlots';
import type { GearFarmLootRoll } from './gearFarmDrops';

/** 玩家持有一件具体装备（含随机等级与 GS） */
export type PlayerGearInstance = {
  instanceId: string;
  gearId: string;
  slotKind: GearSlotKind;
  slotNo: number;
  nameCn: string;
  quality: GearQuality;
  level: number;
  /** Gear Score（主手、饰品计分 ×2） */
  gs: number;
  /** 随机系数 85～100，用于复算或展示 */
  randomFactorPercent: number;
  /** 占位属性，后续接真实数值 */
  attr1: number;
  attr2: number;
};

let instanceSeq = 0;

export function createPlayerGearInstanceId(): string {
  instanceSeq += 1;
  return `gear_${Date.now()}_${instanceSeq}`;
}

export function createPlayerGearInstance(
  gear: GearItemRow,
  quality: GearQuality,
  opts?: { level?: number; randomFactorPercent?: number },
): PlayerGearInstance {
  const level = opts?.level ?? rollGearLevelInRange(gear.levelMin, gear.levelMax);
  const randomFactorPercent = opts?.randomFactorPercent ?? rollGearRandomFactorPercent();
  const gs = computeGearGs(level, quality, randomFactorPercent, gear.slotKind);
  return {
    instanceId: createPlayerGearInstanceId(),
    gearId: gear.gearId,
    slotKind: gear.slotKind,
    slotNo: gear.slotNo,
    nameCn: gear.nameCn,
    quality,
    level,
    gs,
    randomFactorPercent,
    attr1: 1,
    attr2: 2,
  };
}

export function createPlayerGearInstanceFromFarmRoll(roll: GearFarmLootRoll): PlayerGearInstance {
  return createPlayerGearInstance(roll.gear, roll.quality);
}
