/**
 * 战斗「净化」（清我方 debuff）与「驱散」（清敌方 buff）归类与绿色安全执行。
 *
 * - **green**：可在此模块直接清除对应 `SimUnit` 状态字段。
 * - **yellow / red**：仅登记目录，不调用清除逻辑；待萨满/牧师等技能接入时再扩展。
 */

export type PurgeDispelTier = 'green' | 'yellow' | 'red';

export type BattleEffectCatalogEntry = {
  id: string;
  nameCn: string;
  tier: PurgeDispelTier;
  skillIds?: string[];
  note?: string;
};

/** 敌方施加在我方身上的负面效果目录 */
export const ALLY_DEBUFF_FROM_ENEMY_CATALOG: readonly BattleEffectCatalogEntry[] = [
  {
    id: 'stun',
    nameCn: '眩晕',
    tier: 'green',
    skillIds: [
      'skill_tauren_stomp',
      'skill_overload_explosion',
      'skill_rfc4_ch4_shadow_blink',
      'skill_stun',
      'skill_darkspear_slow_knockback',
      'skill_dread_warrior_assault',
    ],
  },
  {
    id: 'move_slow_flat',
    nameCn: '移速减半（固定）',
    tier: 'green',
    skillIds: ['skill_darkspear_slow_knockback'],
  },
  {
    id: 'move_slow_decay',
    nameCn: '击退后衰减减速',
    tier: 'green',
    note: '猛击/冲锋/刀扇/伏击等击退附带',
  },
  {
    id: 'poison_strike',
    nameCn: '淬毒（叠层 DoT）',
    tier: 'green',
    skillIds: ['skill_poison_strike'],
  },
  {
    id: 'rfc3_corrosion',
    nameCn: '腐蚀术（DoT）',
    tier: 'green',
    skillIds: ['skill_rfc3_ch3_corrosion'],
  },
  {
    id: 'knockback_displacement',
    nameCn: '击退 / 击飞位移',
    tier: 'yellow',
    note: '瞬时位移，非挂在单位上的魔法 debuff',
  },
  {
    id: 'ground_burn_zone',
    nameCn: '地面燃烧区',
    tier: 'yellow',
    skillIds: ['skill_catapult_burn_field'],
    note: 'debuff 在地面 patch，离开区域即止',
  },
  {
    id: 'instant_damage_only',
    nameCn: '纯瞬时伤害（无持续负面）',
    tier: 'red',
    note: '闪电链、冲击波、飞刀等；无状态可清',
  },
] as const;

/** 敌方给自己或友方（敌方阵营）的正面效果目录 */
export const ENEMY_BUFF_CATALOG: readonly BattleEffectCatalogEntry[] = [
  {
    id: 'bloodlust',
    nameCn: '嗜血术',
    tier: 'green',
    skillIds: ['skill_shaman_bloodlust'],
  },
  {
    id: 'raider_leap_buff',
    nameCn: '狼骑跃迁强化',
    tier: 'green',
    skillIds: ['skill_raider_leap'],
  },
  {
    id: 'evil_frenzy',
    nameCn: '邪恶狂热',
    tier: 'green',
    skillIds: ['skill_evil_strenth'],
  },
  {
    id: 'magic_shield',
    nameCn: '魔法护盾',
    tier: 'green',
    skillIds: ['skill_overload_explosion', 'skill_mechano_pioneer'],
  },
  {
    id: 'rhahk_warcry_stacks',
    nameCn: '战吼攻击叠层',
    tier: 'green',
    skillIds: ['skill_rhahk_warcry'],
  },
  {
    id: 'defias_fever_aura',
    nameCn: '好好干活（伤害光环）',
    tier: 'yellow',
    skillIds: ['skill_defias_fever'],
    note: '按距离乘算，无单位 buff 字段；需单独驱光环逻辑',
  },
  {
    id: 'berserker_phase',
    nameCn: '狂暴 / 极度狂暴（生命阶段）',
    tier: 'red',
    skillIds: ['skill_berserker'],
  },
  {
    id: 'invincible',
    nameCn: '无敌',
    tier: 'red',
    skillIds: ['skill_vanish_ambush'],
  },
  {
    id: 'boss_channel_cast',
    nameCn: '首领引导 / 蓄力',
    tier: 'red',
    note: '应打断，非驱散',
  },
  {
    id: 'jetpack_flight',
    nameCn: '喷气背包飞行',
    tier: 'red',
    skillIds: ['skill_jetpack_assault'],
  },
  {
    id: 'defias_bandage_channel',
    nameCn: '打绷带引导',
    tier: 'red',
    skillIds: ['skill_defias'],
    note: '应打断，非驱散',
  },
  {
    id: 'crit_passive',
    nameCn: '致命一击等被动暴击',
    tier: 'red',
  },
  {
    id: 'defias_heart',
    nameCn: '迪菲亚之心（减 CD）',
    tier: 'red',
    skillIds: ['skill_defias_heart'],
  },
] as const;

export type AllyDebuffPurgeId =
  | 'stun'
  | 'move_slow_flat'
  | 'move_slow_decay'
  | 'poison_strike'
  | 'rfc3_corrosion';

export type EnemyBuffDispelId =
  | 'bloodlust'
  | 'raider_leap_buff'
  | 'evil_frenzy'
  | 'magic_shield'
  | 'rhahk_warcry_stacks';

/** 净化时可写的我方单位状态切片（与 BattleScreen.SimUnit 字段一致） */
export type AllyDebuffPurgeTarget = {
  side?: 'ally' | 'enemy';
  dead?: boolean;
  stunT?: number;
  moveSlowT?: number;
  moveSlowDecayRem?: number;
  moveSlowDecayDur?: number;
  moveSlowDecayPeak?: number;
  poisonStrikeStacks?: number;
  poisonStrikeRemainSec?: number;
  poisonStrikeSourceId?: number;
  poisonStrikeAtkSnap?: number;
  poisonStrikeTickAcc?: number;
  rfc3CorrosionRemainSec?: number;
  rfc3CorrosionDps?: number;
  rfc3CorrosionTickAcc?: number;
};

/** 驱散时可写的敌方单位状态切片 */
export type EnemyBuffDispelTarget = {
  side?: 'ally' | 'enemy';
  dead?: boolean;
  bloodlustT?: number;
  attackInterval?: number;
  attackIntervalBase?: number;
  raiderLeapBuffT?: number;
  evilFrenzyBuffT?: number;
  shield?: number;
  rhahkWarcryStacks?: number;
  rhahkWarcryBaseAtk?: number;
  atk?: number;
};

export type PurgeAllyGreenResult = {
  cleared: AllyDebuffPurgeId[];
  hadAny: boolean;
};

export type DispelEnemyGreenResult = {
  cleared: EnemyBuffDispelId[];
  hadAny: boolean;
};

const GREEN_ALLY_DEBUFF_IDS = new Set<AllyDebuffPurgeId>(
  ALLY_DEBUFF_FROM_ENEMY_CATALOG.filter((e) => e.tier === 'green').map((e) => e.id as AllyDebuffPurgeId),
);

const GREEN_ENEMY_BUFF_IDS = new Set<EnemyBuffDispelId>(
  ENEMY_BUFF_CATALOG.filter((e) => e.tier === 'green').map((e) => e.id as EnemyBuffDispelId),
);

export function catalogTier(id: string, catalog: readonly BattleEffectCatalogEntry[]): PurgeDispelTier | null {
  return catalog.find((e) => e.id === id)?.tier ?? null;
}

export function isGreenAllyDebuff(id: string): id is AllyDebuffPurgeId {
  return GREEN_ALLY_DEBUFF_IDS.has(id as AllyDebuffPurgeId);
}

export function isGreenEnemyBuff(id: string): id is EnemyBuffDispelId {
  return GREEN_ENEMY_BUFF_IDS.has(id as EnemyBuffDispelId);
}

/** 列出目录中某 tier 的条目 id */
export function catalogIdsByTier(
  catalog: readonly BattleEffectCatalogEntry[],
  tier: PurgeDispelTier,
): string[] {
  return catalog.filter((e) => e.tier === tier).map((e) => e.id);
}

/**
 * 净化：仅清除 **green** 类我方 debuff 状态。
 * 不处理击退 tween、地面火区、纯伤害。
 */
export function purgeAllyDebuffsGreen(u: AllyDebuffPurgeTarget): PurgeAllyGreenResult {
  const cleared: AllyDebuffPurgeId[] = [];
  if (u.dead || u.side !== 'ally') {
    return { cleared, hadAny: false };
  }

  if ((u.stunT ?? 0) > 0) {
    u.stunT = 0;
    cleared.push('stun');
  }
  if ((u.moveSlowT ?? 0) > 0) {
    u.moveSlowT = 0;
    cleared.push('move_slow_flat');
  }
  if ((u.moveSlowDecayRem ?? 0) > 0 || (u.moveSlowDecayPeak ?? 0) > 0) {
    u.moveSlowDecayRem = 0;
    u.moveSlowDecayDur = 0;
    u.moveSlowDecayPeak = 0;
    cleared.push('move_slow_decay');
  }
  if ((u.poisonStrikeRemainSec ?? 0) > 0 || (u.poisonStrikeStacks ?? 0) > 0) {
    u.poisonStrikeRemainSec = undefined;
    u.poisonStrikeStacks = undefined;
    u.poisonStrikeSourceId = undefined;
    u.poisonStrikeAtkSnap = undefined;
    u.poisonStrikeTickAcc = undefined;
    cleared.push('poison_strike');
  }
  if ((u.rfc3CorrosionRemainSec ?? 0) > 0) {
    u.rfc3CorrosionRemainSec = undefined;
    u.rfc3CorrosionDps = undefined;
    u.rfc3CorrosionTickAcc = undefined;
    cleared.push('rfc3_corrosion');
  }

  return { cleared, hadAny: cleared.length > 0 };
}

/**
 * 驱散：仅清除 **green** 类敌方 buff 状态。
 * 不处理光环、无敌、狂暴阶段、引导等。
 */
export function dispelEnemyBuffsGreen(u: EnemyBuffDispelTarget): DispelEnemyGreenResult {
  const cleared: EnemyBuffDispelId[] = [];
  if (u.dead || u.side !== 'enemy') {
    return { cleared, hadAny: false };
  }

  if ((u.bloodlustT ?? 0) > 0) {
    u.bloodlustT = 0;
    const base = u.attackIntervalBase ?? u.attackInterval;
    if (base != null) u.attackInterval = base;
    cleared.push('bloodlust');
  }
  if ((u.raiderLeapBuffT ?? 0) > 0) {
    u.raiderLeapBuffT = 0;
    cleared.push('raider_leap_buff');
  }
  if ((u.evilFrenzyBuffT ?? 0) > 0) {
    u.evilFrenzyBuffT = 0;
    cleared.push('evil_frenzy');
  }
  if ((u.shield ?? 0) > 0) {
    u.shield = 0;
    cleared.push('magic_shield');
  }
  if ((u.rhahkWarcryStacks ?? 0) > 0) {
    u.rhahkWarcryStacks = 0;
    if (u.rhahkWarcryBaseAtk != null) {
      u.atk = Math.max(1, u.rhahkWarcryBaseAtk);
    }
    cleared.push('rhahk_warcry_stacks');
  }

  return { cleared, hadAny: cleared.length > 0 };
}
