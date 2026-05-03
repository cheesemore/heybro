import { ALLY_CLASSES } from './constants';
import type { ArtifactKind } from './strategyTypes';
import type { AllyClass } from './types';
import { ALLY_DEFS } from './unitDefs';

/** 与 battleBonds 中阈值一致：3 / 6 / 10 数值档，15 终极档 */
export const BOND_TIER_THRESHOLDS = [3, 6, 10, 15] as const;
export type BondTierThreshold = (typeof BOND_TIER_THRESHOLDS)[number];

export function allyBondDisplayName(kind: AllyClass): string {
  return ALLY_DEFS[kind].name;
}

export function bondTierActive(stackSum: number, tier: BondTierThreshold): boolean {
  return stackSum >= tier;
}

/** 短标签，用于备战/战斗入口一排芯片 */
export function bondTierChipLabel(tier: BondTierThreshold): string {
  return `${tier}羁绊`;
}

/**
 * 与代码一致的中文说明（3/6/10 为数值羁绊，15 为职业终极）。
 */
export function bondTierFullDesc(kind: AllyClass, tier: BondTierThreshold): string {
  return BOND_FULL_DESC[kind][tier];
}

const BOND_FULL_DESC: Record<AllyClass, Record<BondTierThreshold, string>> = {
  warrior: {
    3: '【三羁绊】场上战士层数之和≥3：每名战士生命与攻击+30%。',
    6: '【六羁绊】战士层数之和≥6：每名战士在上一档基础上，生命与攻击再+50%。',
    10: '【十羁绊】战士层数之和≥10：每名战士在上一档基础上，生命与攻击再+70%。',
    15:
      '【十五羁绊】战士层数之和≥15：每名战士获得「兽人韧性」——受敌方攻击时更易触发格挡（伤害减半）；未达十五羁绊时仅对远程攻击者格挡，达成后近战与远程均可格挡。十五羁绊下格挡成功时，有 30% 概率以自身攻击力对攻击者造成一次反击伤害。',
  },
  mage: {
    3: '【三羁绊】场上法师层数之和≥3：每名法师生命与攻击+30%。',
    6: '【六羁绊】法师层数之和≥6：每名法师在上一档基础上，生命与攻击再+50%。',
    10: '【十羁绊】法师层数之和≥10：每名法师在上一档基础上，生命与攻击再+70%。',
    15:
      '【十五羁绊】法师层数之和≥15：周期性在敌方阵型落下「流星雨」，对大范围敌人造成伤害，数值为当时场上存活法师攻击力之和；若本局拥有「超级法师」策略，流星雨可暴击。',
  },
  priest: {
    3: '【三羁绊】场上牧师层数之和≥3：全队友方单位（含牧师）生命与攻击+15%。',
    6: '【六羁绊】牧师层数之和≥6：全队在上一档基础上，生命与攻击再+25%。',
    10: '【十羁绊】牧师层数之和≥10：全队在上一档基础上，生命与攻击再+35%。',
    15:
      '【十五羁绊】牧师层数之和≥15：牧师治疗量翻倍；牧师在攻击最近敌人的同时，仍可治疗血量偏低的队友（不受常规治疗距离限制）。',
  },
  archer: {
    3: '【三羁绊】场上射手层数之和≥3：每名射手生命与攻击+30%。',
    6: '【六羁绊】射手层数之和≥6：每名射手在上一档基础上，生命与攻击再+50%。',
    10: '【十羁绊】射手层数之和≥10：每名射手在上一档基础上，生命与攻击再+70%。',
    15:
      '【十五羁绊】射手层数之和≥15：每名射手射程+150；每次普攻有 30% 概率立刻追加一箭（可再次暴击并享受神器等加成）。',
  },
  knight: {
    3: '【三羁绊】场上骑士层数之和≥3：每名骑士生命与攻击+30%。',
    6: '【六羁绊】骑士层数之和≥6：每名骑士在上一档基础上，生命与攻击再+50%。',
    10: '【十羁绊】骑士层数之和≥10：每名骑士在上一档基础上，生命与攻击再+70%。',
    15:
      '【十五羁绊】骑士层数之和≥15：骑士冲锋过程中无敌；受到致命伤害时，若有保留次数，会以约 12% 最大生命存活并向最近敌人发动濒死冲锋，冲锋命中伤害提高。骑士当前生命越低，普通攻击伤害越高。',
  },
};

/** 备战神器在战斗中的邻格加成（与 BattleScreen 逻辑一致） */
export const ARTIFACT_BATTLE_DESC: Record<ArtifactKind, string> = {
  holy_grail: '圣杯：备战界面中，放在圣杯正上方格子里的我方单位，入场时暴击率+20%。',
  shelter: '庇护衣：放在庇护衣正下方格子里的我方单位，入场时生命+50%。',
  cross_star: '十字星：放在十字星的上下左右四格的我方单位，入场时攻击+20%。',
  revenge_spirit:
    '复仇之魂：与神器上下左右相邻的格子，每有一格有我方单位计 1 次链接（最多计 4 次）。战斗开场：每个被计链接的我方格子上的单位失去当前生命值的 20%（至少保留 1）；随后敌方全体再失去「10%×链接次数」的当前生命（每场至少扣 1）。',
};

export function allAllyClassesOrdered(): readonly AllyClass[] {
  return ALLY_CLASSES;
}
