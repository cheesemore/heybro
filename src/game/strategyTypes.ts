/** 第 1 章 1-3 抉择池 */
export type StrategyC1Id =
  | 'c1_warrior_first'
  | 'c1_mage_first'
  | 'c1_priest_first'
  | 'c1_archer_first'
  | 'c1_knight_first'
  | 'c1_yuebao'
  | 'c1_random_deploy'
  | 'c1_head_start'
  | 'c1_lie_flat';

/** 第 2 章 2-3 抉择池 */
export type StrategyC2Id =
  | 'c2_super_warrior'
  | 'c2_super_mage'
  | 'c2_super_priest'
  | 'c2_super_archer'
  | 'c2_super_knight'
  | 'c2_holy_grail'
  | 'c2_shelter'
  | 'c2_cross_star'
  | 'c2_time_master';

/** 第 3 章 3-3 抉择池 */
export type StrategyC3Id =
  | 'c3_turn_tide'
  | 'c3_desperate'
  | 'c3_random_enhance'
  | 'c3_revenge_spirit'
  | 'c3_demon_contract'
  | 'c3_boss_hunter'
  | 'c3_super_double'
  | 'c3_glass_cannon'
  | 'c3_chaotic';

export type StrategyAnyId = StrategyC1Id | StrategyC2Id | StrategyC3Id;

export type ArtifactKind = 'holy_grail' | 'shelter' | 'cross_star' | 'revenge_spirit';
