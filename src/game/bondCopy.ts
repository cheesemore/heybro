import allyBondDescDoc from './config/allyBondDescriptions.json';
import { allBondStacks, type BoardSlot } from './battleBonds';
import { ALLY_CLASSES } from './constants';
import type { ArtifactKind } from './strategyTypes';
import type { AllyClass } from './types';
import { ALLY_DEFS } from './unitDefs';

/** 与 battleBonds 中阈值一致：3 / 6 / 10 数值档，15 终极档，21 极巨化档（红） */
export const BOND_TIER_THRESHOLDS = [3, 6, 10, 15, 21] as const;
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

type AllyBondDescriptionsDoc = {
  basicSkillByAllyClass?: Record<string, string>;
  byAllyClass: Record<string, Record<string, string>>;
};

function loadAllyBasicSkillFromConfig(): Record<AllyClass, string> {
  const raw = (allyBondDescDoc as AllyBondDescriptionsDoc).basicSkillByAllyClass;
  if (!raw || typeof raw !== 'object') {
    throw new Error('[bondCopy] allyBondDescriptions.json 缺少 basicSkillByAllyClass 对象');
  }
  const out = {} as Record<AllyClass, string>;
  for (const kind of ALLY_CLASSES) {
    const s = raw[kind];
    if (typeof s !== 'string' || !s.trim()) {
      throw new Error(`[bondCopy] allyBondDescriptions.json basicSkillByAllyClass 缺少或为空: ${kind}`);
    }
    out[kind] = s;
  }
  return out;
}

function loadBondFullDescFromConfig(): Record<AllyClass, Record<BondTierThreshold, string>> {
  const raw = allyBondDescDoc.byAllyClass as Record<string, Record<string, string>>;
  const out = {} as Record<AllyClass, Record<BondTierThreshold, string>>;
  for (const kind of ALLY_CLASSES) {
    const row = raw[kind];
    if (!row) {
      throw new Error(`[bondCopy] allyBondDescriptions.json 缺少职业: ${kind}`);
    }
    const tiers = {} as Record<BondTierThreshold, string>;
    for (const t of BOND_TIER_THRESHOLDS) {
      const s = row[String(t)];
      if (!s) {
        throw new Error(`[bondCopy] allyBondDescriptions.json 缺少 ${kind} 档位 ${t}`);
      }
      tiers[t] = s;
    }
    out[kind] = tiers;
  }
  return out;
}

const BOND_FULL_DESC: Record<AllyClass, Record<BondTierThreshold, string>> = loadBondFullDescFromConfig();

const ALLY_BASIC_SKILL_DESC: Record<AllyClass, string> = loadAllyBasicSkillFromConfig();

/** 各职业基础战斗方式（招募「羁绊/规则」浮层羁绊列表与详情顶部展示；文案来自 allyBondDescriptions.json） */
export function allyBasicSkillDesc(kind: AllyClass): string {
  return ALLY_BASIC_SKILL_DESC[kind];
}

/** 备战神器在战斗中的邻格加成（与 BattleScreen 逻辑一致） */
export const ARTIFACT_BATTLE_DESC: Record<ArtifactKind, string> = {
  holy_grail: '圣杯：备战界面中，放在圣杯正上方格子里的我方单位，入场时暴击率+20%。',
  shelter: '庇护衣：放在庇护衣正下方格子里的我方单位，入场时生命+50%。',
  cross_star: '十字星：放在十字星的上下左右四格的我方单位，入场时攻击+20%。',
  revenge_spirit:
    '复仇之魂：与神器上下左右相邻的格子，每有一格有我方单位计 1 次链接（最多计 4 次）。战斗开场：每个被计链接的我方格子上的单位失去当前生命值的 20%（至少保留 1）；随后敌方全体再失去「6%×链接次数」的当前生命（每场至少扣 1）。',
};

export function allAllyClassesOrdered(): readonly AllyClass[] {
  return ALLY_CLASSES;
}

/** 羁绊列表：当前棋盘层数多的职业靠前（同层数保持 `ALLY_CLASSES` 顺序） */
export function allyClassesOrderedByBondStacks(board: readonly BoardSlot[]): AllyClass[] {
  const stacks = allBondStacks(board);
  return [...ALLY_CLASSES].sort((a, b) => {
    const d = stacks[b] - stacks[a];
    if (d !== 0) return d;
    return ALLY_CLASSES.indexOf(a) - ALLY_CLASSES.indexOf(b);
  });
}
