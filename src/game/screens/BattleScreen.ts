import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import {
  ALLY_CLASSES,
  BATTLE_COLLISION_RADIUS_COEFF,
  BATTLE_COLLISION_RADIUS_COEFF_BOSS,
  BATTLE_MOVE_SPEED_MULT,
  BOARD_CELL_MAX_STACKS,
  BOSS_BATTLE_SECONDS,
  GAME_HEIGHT,
  GAME_WIDTH,
  LAYOUT_SCALE,
  NORMAL_BATTLE_SECONDS,
} from '../constants';
import {
  bindGamePointerTap,
  playSkillHitSfx,
  playSkillLaunchSfx,
  startScreenMusic,
  stopScreenMusic,
} from '../gameAudio';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { createStyledGameButton } from '../ui/gameButtons';
import { SynergyOverlay } from './SynergyOverlay';
import { isBotModeActive } from '../bot/context';
import { botRegisterScreen, botUnregisterScreen } from '../bot/registry';
import type { AllyClass, BattleOutcome, BossId, EnemyClass, RoundMeta } from '../types';
import type { RunState } from '../runState';
import { ALLY_DEFS, ENEMY_DEFS, enemyCombatBaseAtkFromTable, scaledEnemyAtk, scaledEnemyHp } from '../unitDefs';
import {
  allyInPunchSector,
  countAlliesInPunchSector,
  countAlliesNearOpenSegment,
  distPointToSegment,
  isBossConfiguredSkill,
  type BossPunchWindupState,
  type BossRhahkSmashWindupState,
  type BossRushChargeState,
  type BossBladeStormChannelState,
  type BossJetpackAssaultState,
  type BossOverloadExplosionChannelState,
  type BossRushWindupState,
  type BossSkillCastState,
  type BossVanishAmbushState,
} from '../bossConfiguredSkillTypes';
import { BossPunchSectorWarnFx } from '../bossPunchSectorWarnFx';
import { BossRushLineWarnFx } from '../bossRushLineWarnFx';
import { BossSmashCircleWarnFx } from '../bossSmashCircleWarnFx';
import {
  attachRhahkSmashCrackOverlay,
  destroyRhahkWarcryPresentation,
  isRhahkWarcryPresentationDone,
  redrawRhahkWarcryBossRim,
  RhahkCleaveXSlashFx,
  type RhahkWarcryPresentation,
  spawnRhahkWarcryPresentation,
  tickRhahkWarcryPresentation,
} from '../rhahkBossFx';
import {
  buildElasticBombGraphic,
  createBladeStormTrail,
  drawBladeStormKnifeRing,
  flashFanKnifeHit,
  pushBladeStormTrailPoint,
  redrawBladeStormTrail,
  spawnBladeStormShatter,
  spawnBlinkAfterimage,
  spawnFanKnifeProjectile,
  spawnVoidWalkAfterimage,
  spawnVoidWalkTrailSegment,
  tickBladeStormShatter,
  tickBlinkAfterimages,
  tickFanKnifeProjectiles,
  tickVoidWalkAfterimages,
  type BladeStormShatterBit,
  type BladeStormTrailFx,
  type BlinkAfterimageFx,
  type FanKnifeProjectileFx,
  type VoidWalkAfterimageFx,
} from '../genericSkillFx';
import {
  OverloadExplosionRangeWarnFx,
  attachOverloadShieldBubble,
  destroyOverloadShieldBubble,
  redrawOverloadShieldBubble,
  spawnOverloadExplosionWave,
  overloadLaserColorCountFromStacks,
  spawnOverloadLaserBeam,
  spawnOverloadShieldBreak,
  tickOverloadExplosionWaves,
  tickOverloadLaserBeams,
  tickOverloadShieldBreaks,
  type OverloadExplosionWaveFx,
  type OverloadLaserBeamFx,
  type OverloadShieldBreakFx,
} from '../gilnidSkillFx';
import {
  JetpackAssaultFx,
  buildBangBangBombGraphic,
  buildGreenskinBasicOrbGraphic,
  buildGyroMissileGraphic,
  createGyroMissileTrail,
  fadeDestroyGyroMissileTrail,
  pushGyroMissileTrailPoint,
  spawnJetpackSmokePuff,
  tickJetpackSmokePuffs,
  type GyroMissileTrailFx,
  type JetpackSmokePuffFx,
} from '../greenskinSkillFx';
import {
  VanishInvulnRingFx,
  spawnVanishAmbushStrike,
  tickVanishAmbushStrikeFx,
} from '../vancleefSkillFx';
import {
  dispelEnemyBuffsGreen,
  purgeAllyDebuffsGreen,
  type DispelEnemyGreenResult,
  type PurgeAllyGreenResult,
} from '../battlePurgeDispel';
import type { SkillDef } from '../skillsCatalog';
import { gsCombatStatMult } from '../gearCombatBonus';
import {
  allyBattleSlotCenter,
  clampBattleSpawnXY,
  enemyBossSpawnCenter,
  enemyMinionSpawnXY,
  heroDeployBattleSlot,
  BATTLE_PLAYFIELD_Y_OFFSET_PX,
} from '../battleSpawnLayout';
import { getNodeProgressMaxForBookChapter } from '../gearItems';
import { sumEquippedGearGs } from '../playerGearStorage';
import { getSkillById, skillFiresInBattle, skillParamDesignPx, skillParamNumber } from '../skillsCatalog';
import {
  getHeroDef,
  heroDisplayNameWithSkillTier,
  heroQualityAccent,
  heroStarStatMult,
  ARCHER_STRONG_STRIKE_BLUE_ID,
  isArcherSnareTrapHero,
  isKnightHolySanctionHero,
  isMageArcaneMissilesHero,
  isPriestMassShelterHero,
  isWarriorWhirlwindHero,
  KNIGHT_HOLY_SANCTION_BLUE_ID,
  MAGE_ARCANE_BLUE_ID,
  PRIEST_SHELTER_BLUE_ID,
  WARRIOR_WHIRL_BLUE_ID,
} from '../heroRegistry';
import type { HeroId } from '../heroRegistry';
import { classLevelStatMult, getClassLevel } from '../classProgressStorage';
import { getDeployedHeroIds, loadHeroMeta, maxHeroDeploySlots } from '../heroMetaStorage';
import { mobIdsForBookChapter } from '../bookChapterConfig';
import { bossDisplayName, legacyProgressRoundIndex } from '../roundConfig';
import {
  bossUidForBookChapter,
  dungeonIdForBookChapter,
  getWowMob,
  resolveWowBookBossCombat,
  wowMobEnemyPaint,
} from '../wowBookData';
import {
  allBondStacks,
  archerBondDoubleShotChance,
  archerBondFocusCap,
  archerBondRangeBonusDesign,
  BOND_MEGA_RADIUS_MULT,
  BOND_MEGA_STAT_MULT,
  classBondHpAtkMultiplier,
  hasBondMega,
  KNIGHT_BOND_CHARGE_STUN_SEC,
  KNIGHT_BOND_DEATH_DENY_HEAL_RATIO,
  KNIGHT_BOND_DEATH_DENY_INVINC_SEC,
  KNIGHT_BOND_MOVE_HEAL_DIST_DESIGN,
  KNIGHT_BOND_MOVE_HEAL_MAX_HP_RATIO,
  KNIGHT_CHARGE_COOLDOWN_SEC,
  KNIGHT_CHARGE_MIN_DIST_DESIGN,
  MAGE_BOND_ELEMENT_DAMAGE_BONUS,
  MAGE_BOND_METEOR_ATK_COEFF,
  MAGE_BOND_METEOR_INTERVAL_SEC,
  mageBondArcaneWardHits,
  mageBondSplashRadiusDesign,
  knightBondChargeDamageMult,
  priestBondHealCoeff,
  PRIEST_BOND_LOW_HP_HEAL_MULT,
  PRIEST_BOND_LOW_HP_HEAL_THRESHOLD,
  priestBondTeamMultiplier,
  RANGED_ATTACK_RANGE_THRESHOLD,
  warlockBondFearDurationSec,
  warlockBondLifestealRatio,
  WARLOCK_FEAR_PROC_CHANCE,
  WARLOCK_SOUL_FIRE_CD_SEC,
  WARLOCK_SOUL_FIRE_DAMAGE_MULT,
  WARLOCK_SOUL_FIRE_HP_ABOVE_RATIO,
  WARLOCK_SOUL_FIRE_SELF_COST_MAX_HP_RATIO,
  shamanBondBloodlustAtkSpeedMult,
  shamanBondBloodlustDurationSec,
  shamanBondHealWaveTargets,
  shamanBondTeamMultiplier,
  shamanBondWindfuryChance,
  SHAMAN_HEAL_WAVE_ATK_MULT,
  SHAMAN_WINDFURY_EXTRA_HITS,
  SHAMAN_WINDFURY_HIT_GAP_SEC,
  druidBondTeamMultiplier,
  DRUID_BEAR_DAMAGE_RETAIN,
  DRUID_BEAR_SWIPE_EVERY_N_ATTACKS,
  DRUID_BEAR_SWIPE_HALF_ANGLE_DEG,
  DRUID_CASTER_RANGE_DESIGN,
  DRUID_REJUV_COOLDOWN_SEC,
  DRUID_REJUV_DURATION_SEC,
  DRUID_REJUV_HEAL_MAX_HP_RATIO_PER_SEC,
  ASSASSIN_BOND3_CRIT_BONUS,
  ASSASSIN_BOND6_DODGE_CHANCE,
  ASSASSIN_BOND6_DODGE_DURATION_SEC,
  ASSASSIN_BOND10_BLINK_STUN_SEC,
  ASSASSIN_VANISH_BODY_ALPHA,
  ASSASSIN_VANISH_FADE_SEC,
  ASSASSIN_VANISH_HEAL_MAX_HP_PER_SEC,
  ASSASSIN_VANISH_HOLD_SEC,
  ASSASSIN_VANISH_HP_THRESHOLD,
  warriorBondBlockChance,
  warriorBondBlockDamageRetain,
  warriorBondBlocksRanged,
  warriorBondCounterOnBlock,
} from '../battleBonds';
import type {
  EnemyPaintKind,
  FloatEntry,
  GroundBurnPatch,
  HitSparkBurst,
  HolySanctionStrikeFx,
  MeteorAnim,
  RayBurstFx,
  RingPulse,
  SlashFx,
  TinySparkFx,
} from '../battleVisuals';
import type { ProjectileVisualStyle } from '../battleVisuals';
import {
  DruidBearSwipeArcFx,
  attachAllyBondBloodlustGlow,
  attachWarlockFearSpiralFx,
  tickWarlockFearSpiralFx,
  buildProjectileGraphic,
  tickAllyBondBloodlustGlow,
  createArcherSnareTrapRing,
  createKnightAura,
  spawnArcaneTrailSpark,
  spawnDeathTrailSpark,
  spawnShadowTrailSpark,
  spawnDualShotSlash,
  drawMulanWhirlwindBladeRing,
  destroyOverloadExplosionChannelBanner,
  spawnFloatNumber,
  spawnOverloadExplosionChannelBanner,
  tickOverloadExplosionChannelBanner,
  spawnHealBurst,
  spawnHolySanctionStrike,
  spawnMeteorAnim,
  spawnRingPulse,
  spawnGroundBurnPatch,
  spawnHitSparkBurst,
  tickFloatEntries,
  tickHitSparkBursts,
  tickHolySanctionStrikes,
  tickMeteorAnims,
  tickRayBurstFx,
  tickRingPulses,
  tickSlashFx,
  tickTinySparks,
} from '../battleVisuals';
import { mountStretchedBattleFloorBackground } from '../dungeonBackground';
import {
  BATTLE_ALLY_HP_RING_COLOR,
  BATTLE_ENEMY_HP_RING_COLOR,
  createBattleAllyToken,
  createBattleEnemyToken,
  createBattleHeroToken,
  swapAllyTokenPortrait,
  swapHeroTokenPortrait,
  redrawHpRingPair,
  redrawHpRingWithShield,
  unitFloatLabelOffsetYForInnerR,
  battleTokenDiskFillRadiusPx,
  battleTokenHpRingOuterRadiusPx,
} from '../unitCircleTokens';

const KNOCKBACK_TWEEN_DUR = 0.3;
const DEATH_FLIGHT_MAX_T = 2.85;
const DEATH_EXIT_MARGIN = Math.round(320 * LAYOUT_SCALE);
const BATTLE_FINISH_POST_DELAY_SEC = 1;
const HIT_FLASH_DUR = 0.11;
const ATTACK_LUNGE_DUR = 0.12;
/**
 * 相对 `effectiveSkillRangeTo` 的基础容差；`meleeEngagementMarginPx` 会再按碰撞半径加宽。
 * 软碰撞每帧末尾推开单位，若整圈判距过紧会卡在「略远于 reach」且本帧 `travel≈0` → `u.cd` 永不减（战士等近战常见）。
 */
const DEFAULT_ATTACK_RANGE_SLACK_PX = Math.max(5, Math.round(6 * LAYOUT_SCALE));

/** 顶 HUD 棕色实底高度（与 `mountStretchedBattleFloorBackground` 上沿一致） */
const BATTLE_HUD_TOP_PLATE_H_PX = Math.round((126 + 20 + 10) * LAYOUT_SCALE);

/**
 * 进程内跨战斗记忆：伤害统计面板是否展开（测试战与普通战共用；刷新页面后重置）。
 * 用户展开过后续战斗默认展开；收起后后续战斗默认收起。
 */
let battleStatsPanelExpandedSession = false;

const MAGE_SPLASH_COEFF = 0.5;

/** 法师签名英雄（mage_01 / mage_02）奥术飞弹 */
const ARCANE_MISSILE_CD_SEC = 12;
const ARCANE_MISSILE_CHANNEL_SEC = 3;
const ARCANE_MISSILE_INTERVAL_DEFAULT = 0.5;
const ARCANE_MISSILE_INTERVAL_BOND10 = 0.3;
const ARCANE_MISSILE_COEF_BASE = 1.5;
const ARCANE_MISSILE_COEF_BOND6 = 2.25;

/** 法师签名英雄（mage_01 / mage_02）奥术飞弹 */
const HOLY_SANCTION_CD_SEC = 18;
const HOLY_SANCTION_COEF_BASE = 2;
const HOLY_SANCTION_COEF_BOND6 = 4;
const HOLY_SANCTION_STUN_SEC = 10;
const HOLY_SANCTION_STUN_BOSS_SEC = 1;
const HOLY_SANCTION_BOND15_CD_PULSE_SEC = 5;
/** 旋风斩：表定周身逻辑半径（设计 px）；战士签名英雄 warrior_01 / warrior_02 共用 */
const MULAN_WHIRL_STRIKE_RADIUS_DESIGN_PX = 50;
const MULAN_WHIRL_R_BASE = Math.round(MULAN_WHIRL_STRIKE_RADIUS_DESIGN_PX * LAYOUT_SCALE);
/** 触发后禁止再次触发旋风斩（秒），与环效/飘字约 1s 演出对齐 */
const MULAN_WHIRL_PROC_LOCK_SEC = 1;
/** 旋风斩刀刃内缘：在环形血条描边外缘之外再留出的设计像素（乘 `LAYOUT_SCALE`） */
const MULAN_WHIRL_BLADE_OUTSIDE_HP_RING_DESIGN_PX = 2;
const METEOR_SPLASH_RADIUS = Math.round(300 * LAYOUT_SCALE);
const ARCHER_KITE_WARN_DIST = Math.round(100 * LAYOUT_SCALE);

const KNOCKBACK_PAD_X = Math.round(38 * LAYOUT_SCALE);
const ARENA_Y_MIN = Math.round(192 * LAYOUT_SCALE) + BATTLE_PLAYFIELD_Y_OFFSET_PX;
const ARENA_Y_MAX = Math.round(1108 * LAYOUT_SCALE) + BATTLE_PLAYFIELD_Y_OFFSET_PX;
const KNIGHT_CHARGE_SPEED_MULT = 2.65;
const KNIGHT_CHARGE_HIT_DIST = Math.round(48 * LAYOUT_SCALE);
const KNIGHT_CHARGE_MIN_DIST_PX = Math.round(KNIGHT_CHARGE_MIN_DIST_DESIGN * LAYOUT_SCALE);
const KNIGHT_MOVE_HEAL_THRESH_PX = Math.round(KNIGHT_BOND_MOVE_HEAL_DIST_DESIGN * LAYOUT_SCALE);
const SKILL_HERO_ARCHER_SNARE_TRAP = 'skill_hero_archer_snare_trap';
const SNARE_TRAP_BUFF_SEC = 10;
const SNARE_TRAP_EFFECT_SEC = 2;
const SNARE_TRAP_EFFECT_SEC_BOND6 = 3;
const SNARE_TRAP_STUN_SEC = 3;
/** 敌方被动：免疫恐惧等硬控（挂载于 `skillIds`） */
const SKILL_CC_IMMUNE = 'skill_cc_immune';

/** 与 `skillIds` / `wowBookMonsters` 中小怪跃后排技能一致 */
const MINION_LEAP_SKILL_IDS = ['skill_batrider_leap', 'skill_raider_leap', 'skill_beserker_leap'] as const;

/** 怒焰裂谷第三关首领（祈求者耶戈什）专属 */
const RFC3_CH3_SKILL_GROUP_SHADOW = 'skill_rfc3_ch3_group_shadow_sword';
const RFC3_CH3_SKILL_SUMMON = 'skill_rfc3_ch3_summon_rite';
const RFC3_CH3_SKILL_CORROSION = 'skill_rfc3_ch3_corrosion';
const SKILL_BLADE_STORM = 'skill_blade_storm';
const SKILL_BLINK_FAN = 'skill_blink_fan';
const SKILL_POISON_STRIKE = 'skill_poison_strike';
const SKILL_OVERLOAD_EXPLOSION = 'skill_overload_explosion';
const SKILL_OVERLOAD_LASER = 'skill_overload_laser';
const SKILL_MECHANO_PIONEER = 'skill_mechano_pioneer';
const SKILL_BANG_BANG_BOMB = 'skill_bang_bang_bomb';
const SKILL_JETPACK_ASSAULT = 'skill_jetpack_assault';
const SKILL_GYRO_MISSILE_DEFENSE = 'skill_gyro_missile_defense';
const SKILL_VANISH_AMBUSH = 'skill_vanish_ambush';
const SKILL_SUMMON_MOB_POOL = 'skill_summon_mob_pool';
const SKILL_DEFIAS_HEART = 'skill_defias_heart';
const SKILL_DEFIAS_BANDAGE = 'skill_defias';
const SKILL_DEFIAS_FEVER = 'skill_defias_fever';
/** 好好干活：光环半径（设计像素，表外） */
const DEFIAS_FEVER_AURA_RADIUS_DESIGN = 180;
const SKILL_ENEMY_HEAVY_STUN = 'skill_stun';
const SKILL_ELASTIC_BOMB = 'skill_bomb';
const SKILL_VOID_WALK = 'skill_voidwalker';
/** 虚空行走：突进移速倍率、残影间隔（秒，表外） */
const VOID_WALK_SPEED_MULT = 2;
const VOID_WALK_AFTERIMAGE_INTERVAL_SEC = 0.055;
const SKILL_TAUREN_STOMP = 'skill_tauren_stomp';
const SKILL_TAUREN_SHOCKWAVE = 'skill_tauren_shockwave';
/** 踩地板 / 冲击波：周期冷却与开场初动（秒，表外；技能表 params 为伤害/范围） */
const TAUREN_STOMP_CD_SEC = 10;
const TAUREN_SHOCKWAVE_CD_SEC = 8;
const TAUREN_STOMP_INIT_CD_SEC = 3;
const TAUREN_SHOCKWAVE_INIT_CD_SEC = 2;
/** 消失·伏击：淡出至完全透明（秒，表外） */
const VANISH_AMBUSH_FADE_SEC = 1.5;
/** 消失·伏击：完全透明维持（秒，表外） */
const VANISH_AMBUSH_HOLD_SEC = 0.5;
/** 消失·伏击：潜行总时长 = 淡出 + 维持 */
const VANISH_AMBUSH_VANISH_SEC = VANISH_AMBUSH_FADE_SEC + VANISH_AMBUSH_HOLD_SEC;
/** 消失·伏击：伏击瞬间瞬移至目标背后（设计像素，表外） */
const VANISH_AMBUSH_BACK_DIST_DESIGN = 100;
/** 消失·伏击：命中时推开其他友方（设计像素） */
const VANISH_AMBUSH_PUSH_DESIGN = 150;
/** 喷气背包：随机航点与当前位置最小间距（720 设计像素系） */
const JETPACK_MIN_WAYPOINT_DESIGN = 300;
/** 过载爆炸：护盾被击破后的晕眩（秒，表外） */
const OVERLOAD_EXPLOSION_BREAK_STUN_SEC = 3;
/** 过载爆炸：引导成功爆炸命中我方的眩晕（秒，表外；skills.json params 最多 5 项） */
const OVERLOAD_EXPLOSION_HIT_STUN_SEC = 8;
/** 剑刃风暴：表外固定预警时长（秒） */
const BLADE_STORM_WARN_SEC = 0.5;
/** 闪现刀扇：甩刀阶段总时长（秒） */
const BLINK_FAN_VOLLEY_SEC = 2;

/** 怒焰裂谷第四关首领（巴扎兰）专属 */
const RFC4_CH4_SKILL_MIND_LASH = 'skill_rfc4_ch4_mind_lash';
const RFC4_CH4_SKILL_SHADOW_BLINK = 'skill_rfc4_ch4_shadow_blink';
/** 精神鞭笞：写死规则（不占 params 槽） */
const RFC4_MIND_LASH_TICK_SEC = 1;
/** 精神鞭笞：治疗量 = 实际造成伤害 ×该倍率 */
const RFC4_MIND_LASH_LIFESTEAL_OF_DAMAGE = 2;
/** 暗影闪现：眩晕半径（720 设计像素系） */
const RFC4_SHADOW_BLINK_STUN_RADIUS_DESIGN = 300;

type Rfc4MindLashChannelFx = {
  linesGfx: Graphics;
};

type Rfc4MindLashChannel = {
  t: number;
  targetIds: number[];
  dmgTickAcc: number;
  fx: Rfc4MindLashChannelFx;
};

/** 跃后排：锚点纵向偏移（设计像素），属兵种演出非表调数值 */
const LEAP_NYOFF_DESIGN_BATRIDER = 58;
const LEAP_NYOFF_DESIGN_RAIDER = 44;
const LEAP_NYOFF_DESIGN_BESERKER = 36;
/** 投石车燃烧区 tick 受击火花概率（演出） */
const CATAPULT_BURN_SPARK_CHANCE = 0.45;

/** 拉克佐·顺劈斩：普攻触发概率（写死，非表参） */
const RHAKH_CLEAVE_PROC_CHANCE = 0.35;
/** 拉克佐·猛击：主目标伤害系数 = 范围系数 × 该倍率 */
const RHAKH_SMASH_PRIMARY_DMG_MULT = 3;

/** 弹道无有效发射者单位时，用于命中判定的等效半径下限 */
const PROJECTILE_HIT_BASE = Math.round(28 * LAYOUT_SCALE);
/** 生成时在格点上的随机偏移幅度 */
const SPAWN_SCATTER = Math.round(36 * LAYOUT_SCALE);

function artifactBuffsForAllySlot(run: RunState, slot: number): { hpMult: number; atkMult: number; crit: number } {
  let hpMult = 1;
  let atkMult = 1;
  let crit = 0;
  for (let g = 0; g < 9; g++) {
    const art = run.artifactBySlot[g];
    if (!art) continue;
    if (art === 'holy_grail') {
      const above = g - 3;
      if (above === slot) crit += 0.2;
    } else if (art === 'shelter') {
      const below = g + 3;
      if (below === slot) hpMult *= 1.5;
    } else if (art === 'cross_star') {
      const ortho =
        (g - 3 === slot && g >= 3) ||
        (g + 3 === slot && g < 6) ||
        (g - 1 === slot && g % 3 !== 0) ||
        (g + 1 === slot && g % 3 !== 2);
      if (ortho) atkMult *= 1.2;
    }
  }
  return { hpMult, atkMult, crit };
}

type BattleProjectile = {
  gfx: Graphics;
  x: number;
  y: number;
  speed: number;
  targetId: number;
  /** 用于命中半径：大体型首领等 */
  attackerId?: number;
  life: number;
  onHit: () => void;
  style: ProjectileVisualStyle;
  /** 关联 `skills.json` id，用于发射/命中音效（普攻不传） */
  skillId?: string;
  /** 暗影箭：拖尾微粒累积 */
  shadowTrailAcc?: number;
};

type BangBangBombProjectile = {
  gfx: Graphics;
  x: number;
  y: number;
  speed: number;
  targetId: number;
  attackerId: number;
  life: number;
  onHit: () => void;
  skillId?: string;
};

type GyroHomingMissile = {
  gfx: Graphics;
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  arcLift: number;
  targetId: number;
  attackerId: number;
  trailAcc: number;
  skillId: string;
  trail?: GyroMissileTrailFx;
  onHit: () => void;
};

type DamageCtx = {
  attacker?: SimUnit;
  /** 溅射、流星雨等可再走格挡 */
  bypassBlock?: boolean;
  damageTag?: 'crit' | 'magic';
  /** 为 true 时伤害无视护盾（真实伤害） */
  trueDamage?: boolean;
  /** 为 false 时不飘字（如盾反的连锁） */
  showFloat?: boolean;
  /** 战士生命共享：防止均摊递归 */
  skipWarriorShare?: boolean;
  /** 近战单位普通攻击（非技能弹道/溅射）；用于概率击退 */
  meleeBasic?: boolean;
  /** skill_hot_strike：受击目标加强闪红与火花 */
  hotStrikeHeavy?: boolean;
  /** skill_poison_strike：毒 DoT 跳伤，不叠层 */
  poisonStrikeDot?: boolean;
};

type BossBlinkFanVolleyState = {
  t: number;
  dur: number;
  knifeAcc: number;
  knifeInterval: number;
  coeff: number;
  maxTargets: number;
  knifeRange: number;
};

type FanKnifeSlashFlash = { g: Graphics; t: number };

type MulanWhirlwindRingFx = {
  g: Graphics;
  t: number;
  unitId: number;
  strikeRadiusPx: number;
  spin: number;
  scarlet: boolean;
  /** 已播伤害飘字档位数 0..10（每 0.1s 一档，共 10 次） */
  damageFloatEmitted: number;
  hits: { enemyUnitId: number; parts: readonly number[]; tag: 'crit' | 'magic' }[];
};

type SimUnit = {
  unitId: number;
  side: 'ally' | 'enemy';
  /** 战场站位与判距锚点：圆形代币「圆盘几何中心」世界坐标（与碰撞圆心、`hitRadiusPx` 一致） */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  attackInterval: number;
  /** 攻速嗜血等未加速前的攻击间隔 */
  attackIntervalBase?: number;
  /** 表定攻击/治疗距离（720 设计像素）；战场判距见 `weaponReachPx` / `effectiveSkillRangeTo`（乘 LAYOUT_SCALE 并加双方 `hitRadiusPx`） */
  range: number;
  speed: number;
  /** 未减速前的移动速度（用于暗矛减速等） */
  speedBase: number;
  cd: number;
  dead: boolean;
  /** 碰撞圆半径（已乘 LAYOUT_SCALE），来自配置 `hitRadius`；与表 `range`（720 设计像素，见 `weaponReachPx`）共同决定 `effectiveSkillRangeTo` */
  hitRadiusPx: number;
  root: Container;
  body: Container;
  hpRingCur?: Graphics;
  hpRingLost?: Graphics;
  hpRingShield?: Graphics;
  /** 环形血条几何与配色（战斗代币） */
  tokenRing?: { cx: number; cy: number; ringR: number; thick: number; solidColor: number };
  aura?: Graphics;
  /** 诱捕陷阱脚底环（局部圆心对齐代币中心） */
  snareTrapGfx?: Graphics;
  /** 诱捕陷阱：待触发窗口 + 触发后减伤窗口 */
  snareTrapBuff?: { armedRemainSec: number; activeRemainSec: number; stunUsed?: boolean };
  bossId?: BossId;
  allyKind?: AllyClass;
  enemyPaint?: EnemyPaintKind;
  /** 挂载技能 id（`config/skills.json`）；书本首领来自 `wowBookBosses`，小怪来自 `wowBookMonsters` */
  skillIds: string[];
  /** 射手：最近一次普攻「出手」锁定的敌人 id（用于专注叠层；与弹道命中顺序解耦） */
  archerLockedAttackTargetId?: number | null;
  archerFocusStacks?: number;
  /** 骑士 */
  knightState?: 'charge' | 'fight';
  knightCooldown?: number;
  knightChargeTargetId?: number | null;
  /** 十五羁绊：尚可用一次免死（30% 血 + 3 秒无敌） */
  knightDeathDenyLeft?: number;
  invincibleT?: number;
  knightInvulnFx?: VanishInvulnRingFx;
  knightMoveHealAccPx?: number;
  arcaneWardHitsLeft?: number;
  enemyCreatureType?: string;
  invulnerable?: boolean;
  /** 无敌：免疫伤害与控制，不可被选为目标；飞行物命中无效 */
  invincible?: boolean;
  /** 战士盾反闪一下 */
  flashT?: number;
  /** 近战挥砍/突刺动画剩余时间 */
  atkLungeT?: number;
  atkLungeDx?: number;
  atkLungeDy?: number;
  /** 来自备战第几格（神器 / 复仇等用）；英雄无格位 */
  allySourceSlot?: number;
  /** 英雄实例（被动与升星等） */
  heroId?: HeroId;
  /** 神器等额外暴击率 */
  bonusCrit?: number;
  /** 跃入后排：剩余冷却（秒），仅部分敌方 */
  enemyLeapCd?: number;
  /** 牛头踩地板等：剩余眩晕时间（秒），仅我方 */
  stunT?: number;
  /** 术士恐惧：剩余时间（秒）；朝 `fearDir` 逃跑，不可攻击/施法 */
  fearT?: number;
  fearDirX?: number;
  fearDirY?: number;
  warlockFearSpiralFx?: Container;
  warlockFearSpiralPhase?: number;
  /** 十五羁绊灵魂之火剩余冷却（秒） */
  warlockSoulFireCdRem?: number;
  /** 德鲁伊：熊 / 远程形态 */
  druidForm?: 'bear' | 'caster';
  druidBearSwipeCount?: number;
  /** 萨满（我方）：治疗波 / 闪电箭 交替 */
  shamanAbilityPhase?: 'heal' | 'bolt';
  shamanBondBloodlustGlow?: Container;
  shamanBondBloodlustGlowPhase?: number;
  /** 友方回春术（远程德鲁伊十羁绊） */
  rejuvenation?: { remainSec: number; healAcc: number; sourceId: number };
  druidRejuvCdRem?: number;
  /** 刺客 */
  assassinBlinkStunNext?: boolean;
  assassinDodgeRem?: number;
  assassinVanishUsed?: boolean;
  assassinVanishPhase?: 'fade' | 'hold';
  assassinVanishFadeRem?: number;
  assassinVanishHoldRem?: number;
  shamanWindfuryPending?: { hitsLeft: number; gapRem: number; targetId: number; dmg: number };
  /** 萨满嗜血术剩余时间（秒） */
  bloodlustT?: number;
  /** 狼骑兵跃入后排后：攻速 +100%、来自我方的伤害 -50%，剩余秒数 */
  raiderLeapBuffT?: number;
  /** 敌方萨满：嗜血术技能冷却累积（秒） */
  shamanBloodlustCd?: number;
  /** 亡灵勇士：突击仅能使用一次 */
  dreadAssaultUsed?: boolean;
  /** skill_shadow_bot：暗影箭剩余冷却（秒），0 表示可放；开场 0 */
  shadowBoltCdRem?: number;
  /** skill_evil_strenth：狂热剩余时间 / 技能冷却（秒），均开场 0（冷却完毕） */
  evilFrenzyBuffT?: number;
  evilFrenzyCdRem?: number;
  /** skill_boom：死亡时自爆后直接移除，无飞出动画 */
  boomSkipDeathAnim?: boolean;
  /** 暗矛击退：移动速度 -50%，剩余秒数 */
  moveSlowT?: number;
  /** 线性衰减减速（如冲锋击飞）：剩余秒、总时长、峰值比例（0.95 = 最高减 95% 移速） */
  moveSlowDecayRem?: number;
  moveSlowDecayDur?: number;
  moveSlowDecayPeak?: number;
  /** 穆兰旋风斩：触发后锁定再判定（秒） */
  mulanWhirlwindProcLockT?: number;
  /** 艾拉瑞奥术飞弹：引导结束后剩余冷却（秒） */
  heroArcaneCdRem?: number;
  /** 奥术飞弹引导中 */
  heroArcaneChannel?: { targetId: number; t: number; boltsFired: number };
  /** 当前护盾值（非 buff；上限不超过 maxHp） */
  shield?: number;
  /** 群体庇护技能剩余冷却（秒），牧师签名英雄 priest_01 / priest_02 */
  heroShelterCdRem?: number;
  /** 神圣制裁剩余冷却（秒），骑士签名英雄 knight_01 / knight_02 */
  heroHolySanctionCdRem?: number;
  /** 书本首领：配置型技能蓄力 / 冲锋中（仅 skill_boss_*） */
  bossSkillCast?: BossSkillCastState;
  /** skill_berserker：表底攻击力（随阶段乘算后再写入 `atk`） */
  bossBerserkBaseAtk?: number;
  /** skill_rhahk_warcry：战吼叠层前的表底攻击 */
  rhahkWarcryBaseAtk?: number;
  /** skill_rhahk_warcry：已释放战吼次数（攻击 +params[2]%×层数，无上限） */
  rhahkWarcryStacks?: number;
  /** 战吼叠层：圆盘描边（叠在立绘 rim 之上） */
  rhahkWarcryRimG?: Graphics;
  /** 顺劈斩命中：血环闪白剩余秒 */
  rhahkCleaveFlashT?: number;
  /** 猛击主目标裂痕 overlay */
  rhahkSmashCrackGfx?: Graphics;
  rhahkSmashCrackT?: number;
  /** 0 常态；1 一阶段狂暴；2 极度狂暴 */
  bossBerserkStage?: 0 | 1 | 2;
  /** 怒火粒子：喷发间隔累积 */
  bossBerserkSparkAcc?: number;
  /** 击退：ease-out 缓动位移 */
  knockbackTween?: { elapsed: number; dur: number; sx: number; sy: number; tx: number; ty: number };
  /** 喷气背包等：飞行中不参与软碰撞分离 */
  collisionDisabled?: boolean;
  /** 非首领死亡：根节点沿抛物线飞出；代币本体绕圆心自转（非绕脚底公转） */
  deathAnim?: {
    elapsed: number;
    /** 超时兜底（秒），正常情况下飞出屏外即销毁 */
    maxT: number;
    wx: number;
    wy: number;
    vx: number;
    vy: number;
    g: number;
    spin: number;
    trailTimer: number;
  };
  /** 受击闪白剩余时间 */
  hitFlashT?: number;
  hitFlashOverlay?: Graphics;
  /** 法师奥术飞弹引导：圆盘肖像上的「走 CD」式扇形遮罩（非整身 tint） */
  heroChannelDiskOverlay?: Graphics;
  /** 怒焰裂谷第三关：群体暗影剑冷却剩余（秒） */
  rfc3GroupShadowCdRem?: number;
  /** 怒焰裂谷第三关：召唤术冷却剩余（秒） */
  rfc3SummonCdRem?: number;
  /** 怒焰裂谷第三关：腐蚀术冷却剩余（秒） */
  rfc3CorrosionCdRem?: number;
  /** 耶戈什腐蚀术：DoT 剩余时长（秒） */
  rfc3CorrosionRemainSec?: number;
  /** 腐蚀 DoT 每秒伤害（施放时按首领攻击力快照） */
  rfc3CorrosionDps?: number;
  /** 腐蚀 DoT 小数累积 */
  rfc3CorrosionFrac?: number;
  /** 怒焰裂谷第四关：群体精神鞭笞引导中 */
  rfc4MindLashChannel?: Rfc4MindLashChannel;
  /** 怒焰裂谷第四关：精神鞭笞引导结束后的冷却（秒）；引导中不计时 */
  rfc4MindLashCdRem?: number;
  /** 怒焰裂谷第四关：暗影闪现冷却（秒） */
  rfc4ShadowBlinkCdRem?: number;
  /** skill_blink_fan：甩刀阶段 */
  bossBlinkFanVolley?: BossBlinkFanVolleyState;
  /** skill_poison_strike：叠层 */
  poisonStrikeStacks?: number;
  poisonStrikeRemainSec?: number;
  poisonStrikeSourceId?: number;
  poisonStrikeAtkSnap?: number;
  /** 淬毒 DoT：距下次 1 秒跳伤累积 */
  poisonStrikeTickAcc?: number;
  /** 飞刀命中白色刀痕 */
  fanKnifeSlashGfx?: Graphics;
  fanKnifeSlashT?: number;
  /** skill_overload_laser：未击杀累计威力加点（%） */
  overloadLaserPowerBonus?: number;
  /** skill_mechano_pioneer：本场是否已触发 */
  mechanoPioneerUsed?: boolean;
  /** 过载爆炸引导：蓝白护盾罩 */
  overloadShieldBubbleGfx?: Graphics;
  /** 剑刃风暴预警：圆缘闪红相位 */
  bladeStormWarnFlashT?: number;
  /** skill_bang_bang_bomb：普攻计数（满间隔后归零并发射炸弹） */
  bangBangBombAtkCount?: number;
  /** skill_gyro_missile_defense：待反击的远程攻击者 unitId */
  gyroRetaliateTargetId?: number | null;
  /** skill_gyro_missile_defense：发射间隔累积 */
  gyroMissileFireAcc?: number;
  /** skill_defias：本场是否已用过绷带 */
  defiasBandageUsed?: boolean;
  /** skill_defias：打绷带引导中 */
  defiasBandageChannel?: { t: number; healAcc: number };
  /** skill_stun：重击剩余冷却（秒），开场 0 */
  enemyHeavyStunCdRem?: number;
  /** skill_bomb：弹性炸弹剩余冷却（秒） */
  enemyBombCdRem?: number;
  /** skill_voidwalker：虚空行走冷却（秒），开场 0 */
  voidWalkCdRem?: number;
  /** skill_voidwalker：突进中 */
  voidWalkDash?: {
    targetId: number;
    tx: number;
    ty: number;
    dmgCoeff: number;
    trailAcc: number;
    lastX: number;
    lastY: number;
  };
  tokenDisk?: Container;
  tokenLetter?: Text;
  tokenInnerR?: number;
};

/** 开场 3/2/1 各占 0.5s，期间战斗逻辑不推进 */
const BATTLE_OPENING_COUNTDOWN_SEC = 1.5;
const BATTLE_OPENING_COUNTDOWN_STEP_SEC = 0.5;

export class BattleScreen extends Container {
  private readonly app: Application;
  private readonly run: RunState;
  private readonly meta: RoundMeta;
  private readonly onEnd: (outcome: BattleOutcome) => void;
  private readonly _tick: (ticker: Ticker) => void;
  private timeLeft = 0;
  private timeLimit = NORMAL_BATTLE_SECONDS;
  private elapsed = 0;
  private units: SimUnit[] = [];
  private initialEnemyHp = 0;
  private currentEnemyHp = 0;
  private initialAllyHp = 0;
  private currentAllyHp = 0;
  /** 书本首领配置技能：剩余冷却（秒），key `${unitId}|${skillId}` */
  private bossSkillCdRemain = new Map<string, number>();
  /** 上次该技能释放结束时间（用于多技能就绪时轮转） */
  private bossSkillLastFinish = new Map<string, number>();
  /** 屏幕振动剩余时间 / 幅度（逻辑像素量级） */
  private battleShakeRemain = 0;
  private battleShakeMag = 0;
  private ended = false;
  /** 战斗已分出胜负，延后展示结算（等死亡飞出等播完） */
  private pendingFinishOutcome: BattleOutcome | null = null;
  private finishPostDelayLeft = 0;
  /** 独立测试页注入；`devBattleHooks` 清空后仍保留本场 */
  private devBattleTimeScale = 1;
  private devBattleFinishPostDelaySec = BATTLE_FINISH_POST_DELAY_SEC;
  private hudTimer: Text;
  private hudAllyBar: Graphics;
  private hudAllyLabel: Text;
  private hudEnemyBar: Graphics;
  private hudEnemyLabel: Text;

  /** 本场战斗：我方对敌造成的实际扣血（仅统计敌方 HP 减少量） */
  private readonly battleStatsDmgHero = new Map<HeroId, number>();
  private readonly battleStatsDmgClass = new Map<AllyClass, number>();
  /** 本场战斗：我方造成的治疗 + 护盾（护盾按实际叠加上限计） */
  private readonly battleStatsHealHero = new Map<HeroId, number>();
  private readonly battleStatsHealClass = new Map<AllyClass, number>();
  private statsPanelExpanded = false;
  private statsViewHeal = false;
  private statsUiDirty = true;
  private statsUiRoot!: Container;
  private statsHeaderLabel!: Text;
  private statsExpandRoot!: Container;
  private statsTabDamageLbl!: Text;
  private statsTabHealLbl!: Text;
  private statsLinesRoot!: Container;
  private statsListBg!: Graphics;

  private nextUnitId = 1;
  private readonly bondStacks: ReturnType<typeof allBondStacks>;
  /** 十五层法羁绊：开场满冷却 */
  private meteorCd = 999;

  private readonly unitLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly floatLayer = new Container();
  private floatWords: FloatEntry[] = [];
  private ringFx: RingPulse[] = [];
  private mulanWhirlRings: MulanWhirlwindRingFx[] = [];
  private meteors: MeteorAnim[] = [];
  private slashes: SlashFx[] = [];
  private healBursts: RayBurstFx[] = [];
  private holySanctionStrikes: HolySanctionStrikeFx[] = [];
  private projectiles: BattleProjectile[] = [];
  private hitSparks: HitSparkBurst[] = [];
  private catapultBurns: Array<{
    patch: GroundBurnPatch;
    dmg: number;
    acc: number;
    r: number;
    tickSec: number;
  }> = [];
  private deathTrailSparks: TinySparkFx[] = [];
  private rhahkCleaveFx: RhahkCleaveXSlashFx[] = [];
  private druidBearSwipeFx: DruidBearSwipeArcFx[] = [];
  private rhahkWarcryFx: RhahkWarcryPresentation[] = [];
  private bladeStormShatter: BladeStormShatterBit[] = [];
  private bladeStormTrail: BladeStormTrailFx | null = null;
  private blinkAfterimages: BlinkAfterimageFx[] = [];
  private voidWalkAfterimages: VoidWalkAfterimageFx[] = [];
  private fanKnives: FanKnifeProjectileFx[] = [];
  private fanKnifeSlashFlashes: FanKnifeSlashFlash[] = [];
  private overloadExplosionWaves: OverloadExplosionWaveFx[] = [];
  private overloadShieldBreaks: OverloadShieldBreakFx[] = [];
  private overloadLaserBeams: OverloadLaserBeamFx[] = [];
  private bangBombProjectiles: BangBangBombProjectile[] = [];
  private gyroHomingMissiles: GyroHomingMissile[] = [];
  private jetpackSmokePuffs: JetpackSmokePuffFx[] = [];
  private gyroMissileTrailFade: GyroMissileTrailFx[] = [];
  /** 开发：复合特效验收战场 */
  private readonly uiTestBattle: boolean;
  private uiTestSkillAcc = 0;
  private uiTestKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** 开场倒计时剩余（秒）；为 0 时战斗开始 */
  private openingCountdownT = 0;
  private readonly countdownGiant: Text;

  constructor(app: Application, run: RunState, meta: RoundMeta, onEnd: (outcome: BattleOutcome) => void) {
    super();
    this.sortableChildren = true;
    this.app = app;
    this.run = run;
    this.meta = meta;
    this.onEnd = onEnd;
    const devHooksEarly = run.devBattleHooks;
    if (devHooksEarly) {
      if (typeof devHooksEarly.battleTimeScale === 'number' && devHooksEarly.battleTimeScale > 0) {
        this.devBattleTimeScale = devHooksEarly.battleTimeScale;
      }
      if (typeof devHooksEarly.battleFinishPostDelaySec === 'number') {
        this.devBattleFinishPostDelaySec = Math.max(0, devHooksEarly.battleFinishPostDelaySec);
      }
    }
    this.uiTestBattle = !!meta.uiTestBattle;
    this.uiTestSkillAcc = this.uiTestBattle ? -0.45 : 0;
    this.statsPanelExpanded = isBotModeActive() ? true : battleStatsPanelExpandedSession;
    if (isBotModeActive()) battleStatsPanelExpandedSession = true;

    const bondFromBoard = allBondStacks(run.board);
    const bondOv = run.devBattleHooks?.bondStacksBattleOverride;
    if (bondOv) {
      const merged = { ...bondFromBoard };
      for (const k of ALLY_CLASSES) {
        if (bondOv[k] !== undefined) merged[k] = bondOv[k]!;
      }
      this.bondStacks = merged;
    } else {
      this.bondStacks = bondFromBoard;
    }
    this.meteorCd = this.bondStacks.mage >= 15 ? MAGE_BOND_METEOR_INTERVAL_SEC : 999;

    this.timeLimit = meta.uiTestBattle
      ? 120
      : (meta.kind === 'boss' ? BOSS_BATTLE_SECONDS : NORMAL_BATTLE_SECONDS) + run.battleTimeBonusSec;
    this.timeLeft = this.timeLimit;

    mountStretchedBattleFloorBackground(this, dungeonIdForBookChapter(this.run.bookChapterId));

    /** 顶 HUD：棕色实底，高度至敌方总血量条下缘 +10 设计 px；底区仍半透明压暗 */
    const hudTopPlateH = BATTLE_HUD_TOP_PLATE_H_PX;
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, hudTopPlateH).fill(0x3d2e1f);
    bg.rect(0, Math.round(1380 * LAYOUT_SCALE), GAME_WIDTH, GAME_HEIGHT - Math.round(1380 * LAYOUT_SCALE)).fill({
      color: 0x020617,
      alpha: 0.5,
    });
    this.addChild(bg);

    const stars = new Graphics();
    for (let i = 0; i < 130; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.round(170 * LAYOUT_SCALE) + Math.random() * (GAME_HEIGHT - Math.round(340 * LAYOUT_SCALE));
      const rr = (Math.random() * 1.6 + 0.25) * LAYOUT_SCALE;
      stars.circle(sx, sy, rr).fill({ color: 0xe2e8f0, alpha: 0.035 + Math.random() * 0.08 });
    }
    this.addChild(stars);

    const hudPad = Math.round(28 * LAYOUT_SCALE);
    if (meta.uiTestBattle) {
      const hint = new Text({
        text:
          'UI测试：巴扎兰首领 · 术/萨/刺/德四新兵种 · 羁绊21 · 歼敌或倒计时 · 控制台 [HeyBro/ui-test]',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(20 * LAYOUT_SCALE),
          fill: 0xfbbf24,
          wordWrap: true,
          wordWrapWidth: GAME_WIDTH - Math.round(56 * LAYOUT_SCALE),
          lineHeight: Math.round(28 * LAYOUT_SCALE),
        },
      });
      hint.position.set(hudPad, Math.round(176 * LAYOUT_SCALE));
      this.addChild(hint);
    }

    this.addChild(this.unitLayer);
    const alliesSpawned = this.spawnAllies();
    this.applyBond25Mega(alliesSpawned);
    const heroUnits = this.spawnDeployedHeroes(alliesSpawned);
    this.units = [...alliesSpawned, ...heroUnits, ...this.spawnEnemies(meta)];
    this.jitterChaosSpawnPositions();
    this.applyBattleOpenArcherSnareTrap();
    this.applyDruidBattleSetup(this.units);
    this.applyBondBattleOpenBuffs(this.units);
    this.applyRevengeSpiritOpening();
    this.applyUnitCollisionSeparation(5);
    const devHooks = this.run.devBattleHooks;
    const devHp = devHooks?.postSpawnHpMult;
    const devHpSkipBoss = devHooks?.postSpawnHpMultSkipBoss === true;
    if (typeof devHp === 'number' && devHp > 0 && devHp !== 1) {
      for (const u of this.units) {
        if (devHpSkipBoss && u.bossId) continue;
        u.maxHp = Math.max(1, Math.round(u.maxHp * devHp));
        u.hp = Math.min(u.maxHp, Math.round(u.hp * devHp));
      }
    }
    const devBossHp = devHooks?.postSpawnBossHpMult;
    if (typeof devBossHp === 'number' && devBossHp > 0 && devBossHp !== 1) {
      for (const u of this.units) {
        if (!u.bossId) continue;
        u.maxHp = Math.max(1, Math.round(u.maxHp * devBossHp));
        u.hp = Math.min(u.maxHp, Math.round(u.hp * devBossHp));
      }
    }
    if (this.run.devBattleHooks) this.run.devBattleHooks = undefined;

    this.initialEnemyHp = this.units.filter((u) => u.side === 'enemy').reduce((s, u) => s + u.maxHp, 0);
    this.currentEnemyHp = this.units.filter((u) => u.side === 'enemy').reduce((s, u) => s + u.hp, 0);
    this.initialAllyHp = this.units.filter((u) => u.side === 'ally').reduce((s, u) => s + u.maxHp, 0);
    this.currentAllyHp = this.units.filter((u) => u.side === 'ally').reduce((s, u) => s + u.hp, 0);

    for (const u of this.units) this.unitLayer.addChild(u.root);
    this.addChild(this.fxLayer);
    this.addChild(this.floatLayer);

    this.hudTimer = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(28 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '700',
      },
    });
    this.hudTimer.position.set(hudPad, Math.round(12 * LAYOUT_SCALE));
    this.addChild(this.hudTimer);

    this.hudAllyLabel = new Text({
      text: '我方总血量',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(19 * LAYOUT_SCALE),
        fill: 0x86efac,
      },
    });
    this.hudAllyLabel.position.set(hudPad, Math.round(44 * LAYOUT_SCALE));
    this.addChild(this.hudAllyLabel);

    this.hudAllyBar = new Graphics();
    this.hudAllyBar.position.set(hudPad, Math.round(70 * LAYOUT_SCALE));
    this.addChild(this.hudAllyBar);

    this.hudEnemyLabel = new Text({
      text: '敌方总血量',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(19 * LAYOUT_SCALE),
        fill: 0x93c5fd,
      },
    });
    this.hudEnemyLabel.position.set(hudPad, Math.round(100 * LAYOUT_SCALE));
    this.addChild(this.hudEnemyLabel);

    this.hudEnemyBar = new Graphics();
    this.hudEnemyBar.position.set(hudPad, Math.round(126 * LAYOUT_SCALE));
    this.addChild(this.hudEnemyBar);

    this.mountBattleStatsPanel();
    this.mountBattleBondButton();
    if (isBotModeActive()) this.syncBattleStatsPanelLayout();

    this.openingCountdownT =
      this.uiTestBattle || meta.skipBattleOpeningCountdown ? 0 : BATTLE_OPENING_COUNTDOWN_SEC;
    this.countdownGiant = new Text({
      text: '3',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(220 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '900',
        dropShadow: { alpha: 0.88, blur: 16, color: 0x000000, distance: 5 },
      },
    });
    this.countdownGiant.anchor.set(0.5, 0.5);
    this.countdownGiant.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.countdownGiant.zIndex = 5000;
    this.countdownGiant.visible = this.openingCountdownT > 0;
    this.addChild(this.countdownGiant);

    if (this.uiTestBattle) {
      this.uiTestKeyHandler = (e: KeyboardEvent): void => {
        if (this.ended) return;
        if (e.code !== 'KeyT' || e.repeat) return;
        e.preventDefault();
        this.fireUiTestSkillBurst();
      };
      window.addEventListener('keydown', this.uiTestKeyHandler);
    }

    attachScreenDebugLabel(this, 'BattleScreen');
    startScreenMusic('battle');

    if (isBotModeActive()) {
      botRegisterScreen({ kind: 'battle' });
    }

    this._tick = (ticker) => this.updateFrame(ticker.deltaMS / 1000);
    this.app.ticker.add(this._tick);
  }

  override destroy(): void {
    botUnregisterScreen('battle');
    stopScreenMusic();
    if (this.uiTestKeyHandler) {
      window.removeEventListener('keydown', this.uiTestKeyHandler);
      this.uiTestKeyHandler = null;
    }
    for (const r of this.mulanWhirlRings) {
      r.g.destroy();
    }
    this.mulanWhirlRings.length = 0;
    this.app.ticker.remove(this._tick);
    super.destroy({ children: true });
  }

  private allocUnitId(): number {
    return this.nextUnitId++;
  }

  private bossEnemyPaint(id: BossId): EnemyPaintKind {
    if (id === 'farseer' || id === 'white') return 'boss_farseer';
    if (id === 'tauren') return 'boss_tauren';
    return 'boss_blademaster';
  }

  /** 稳定伪随机偏移，避免同格单位完全叠点 */
  private scatterOffset(seed: number): { jx: number; jy: number } {
    const s = Math.sin(seed * 12.9898) * 43758.5453;
    const t = s - Math.floor(s);
    const s2 = Math.sin((seed + 41) * 78.233) * 28411.13;
    const u = s2 - Math.floor(s2);
    return { jx: (t * 2 - 1) * SPAWN_SCATTER, jy: (u * 2 - 1) * SPAWN_SCATTER };
  }

  /** 射程 / 够得着判距：完整碰撞半径（不受碰撞系数影响） */
  private hitRadius(u: SimUnit): number {
    return u.hitRadiusPx;
  }

  private collisionRadiusCoeff(u: SimUnit): number {
    return u.bossId ? BATTLE_COLLISION_RADIUS_COEFF_BOSS : BATTLE_COLLISION_RADIUS_COEFF;
  }

  /** 软碰撞分离用半径；可小于 `hitRadiusPx` 以允许代币视觉重叠 */
  private collisionRadiusPx(u: SimUnit): number {
    if (u.collisionDisabled) return 0;
    return u.hitRadiusPx * this.collisionRadiusCoeff(u);
  }

  /**
   * 普攻/追击：在 `effectiveSkillRangeTo` 之外再加的像素（软碰撞与取整会把双方卡在略大于表定 reach 的位置）。
   */
  private meleeEngagementMarginPx(u: SimUnit, target: SimUnit): number {
    const rSum = this.hitRadius(u) + this.hitRadius(target);
    return Math.max(
      DEFAULT_ATTACK_RANGE_SLACK_PX,
      Math.round(4 * LAYOUT_SCALE) + Math.round(0.22 * rSum),
    );
  }

  /** 代币 root 相对圆心向下的偏移（屏幕 +Y）；与 `unitCircleTokens` 圆盘局部圆心 (0,-innerR) 一致 */
  private unitTokenRootYOffsetPx(u: SimUnit): number {
    return u.tokenInnerR ?? u.hitRadiusPx;
  }

  private syncUnitRootFromStance(u: SimUnit): void {
    const ir = this.unitTokenRootYOffsetPx(u);
    u.root.position.set(u.x, u.y + ir);
  }

  /**
   * 战斗飘字竖直锚点：以代币圆心（`stanceY`，即 `SimUnit.y`）为基准，在其**上方**（屏幕 −Y）固定距离处；
   * 与 `spawnFloatNumber` 内文字 `anchor(0.5, 1)`（底边对齐）配合。
   */
  private floatAnchorYAt(stanceY: number, hitRadiusPx: number): number {
    const above = Math.round(12 * LAYOUT_SCALE) + Math.round(hitRadiusPx * 0.22);
    return stanceY - above;
  }

  private floatAnchorY(u: SimUnit): number {
    return this.floatAnchorYAt(u.y, u.hitRadiusPx);
  }

  /**
   * 战斗圆形代币圆盘几何中心世界坐标；与 `SimUnit.x` / `SimUnit.y`（站位圆心）一致。
   */
  private unitBattleTokenCenterXY(u: SimUnit): { x: number; y: number } {
    return { x: u.x, y: u.y };
  }

  /** 开发 · uiTestBattle：一次性打出多种飘字与 FX，便于验收层级与可读性 */
  private fireUiTestSkillBurst(): void {
    const refR = Math.round(ALLY_DEFS.warrior.hitRadius * LAYOUT_SCALE);
    const ally = this.alive('ally')[0];
    const enemy = this.alive('enemy')[0];
    const cx = GAME_WIDTH * 0.5;
    const cy = Math.round(540 * LAYOUT_SCALE);
    const ax = ally?.x ?? cx - Math.round(140 * LAYOUT_SCALE);
    const ay = ally?.y ?? cy;
    const ex = enemy?.x ?? cx + Math.round(140 * LAYOUT_SCALE);
    const ey = enemy?.y ?? cy;

    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, ex, enemy ? this.floatAnchorY(enemy) : this.floatAnchorYAt(ey, refR), '-99', 'damage'),
    );
    this.floatWords.push(
      spawnFloatNumber(
        this.floatLayer,
        ex,
        enemy ? this.floatAnchorY(enemy) - 36 : this.floatAnchorYAt(ey, refR) - 36,
        '-222',
        'crit',
      ),
    );
    this.floatWords.push(
      spawnFloatNumber(
        this.floatLayer,
        ex,
        enemy ? this.floatAnchorY(enemy) - 72 : this.floatAnchorYAt(ey, refR) - 72,
        '-88',
        'magic',
      ),
    );
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, ax, ally ? this.floatAnchorY(ally) : this.floatAnchorYAt(ay, refR), '+55', 'heal'),
    );
    this.floatWords.push(
      spawnFloatNumber(
        this.floatLayer,
        ax,
        ally ? this.floatAnchorY(ally) - 34 : this.floatAnchorYAt(ay, refR) - 34,
        '格挡',
        'block',
      ),
    );
    this.floatWords.push(spawnFloatNumber(this.floatLayer, cx, this.floatAnchorYAt(cy, refR), '测试技能', 'buff'));

    this.ringFx.push(
      spawnRingPulse(this.fxLayer, ex, enemy ? enemy.y : ey, 52, 0x38bdf8, 0.42),
    );
    this.ringFx.push(
      spawnRingPulse(this.fxLayer, ax, ally ? ally.y : ay, 64, 0x4ade80, 0.38),
    );
    this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, ex, ey));
    this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, ax, ay));
    this.healBursts.push(spawnHealBurst(this.fxLayer, ax, ay));
    this.slashes.push(spawnDualShotSlash(this.fxLayer, ex, ey));
    this.meteors.push(spawnMeteorAnim(this.fxLayer, ex, ey, METEOR_SPLASH_RADIUS));
    const cat = getSkillById('skill_catapult_burn_field');
    const cr = skillParamDesignPx(cat, 0, 88);
    const tickSec = skillParamNumber(cat, 2, 0.32);
    this.catapultBurns.push({
      patch: spawnGroundBurnPatch(this.fxLayer, cx, cy + Math.round(48 * LAYOUT_SCALE), cr),
      dmg: 0,
      acc: 0,
      r: cr,
      tickSec,
    });
  }

  private enemyIsHardControlled(u: SimUnit): boolean {
    return (u.stunT ?? 0) > 0 || (u.fearT ?? 0) > 0;
  }

  private effectiveAttackInterval(u: SimUnit): number {
    const base = u.attackIntervalBase ?? u.attackInterval;
    const sh = getSkillById('skill_shaman_bloodlust');
    let mult = (u.bloodlustT ?? 0) > 0 ? skillParamNumber(sh, 3, 1.5) : 1;
    const rd = getSkillById('skill_raider_leap');
    if ((u.raiderLeapBuffT ?? 0) > 0 && this.unitHasSkill(u, 'skill_raider_leap')) {
      mult *= skillParamNumber(rd, 2, 2);
    }
    return Math.max(0.12, base / mult);
  }

  private syncUnitMoveSpeed(u: SimUnit): void {
    if (u.dead) return;
    if (u.speedBase == null) u.speedBase = u.speed;
    let slowMult = 1;
    if ((u.moveSlowT ?? 0) > 0) slowMult = 0.5;
    if ((u.moveSlowDecayRem ?? 0) > 0 && (u.moveSlowDecayDur ?? 0) > 0 && (u.moveSlowDecayPeak ?? 0) > 0) {
      const ratio = (u.moveSlowDecayRem ?? 0) / (u.moveSlowDecayDur ?? 1);
      slowMult *= 1 - (u.moveSlowDecayPeak ?? 0) * ratio;
    }
    u.speed = u.speedBase * slowMult;
  }

  /** 受击者沿远离攻击者方向被推开（ease-out）；首领不受击退 */
  private knockbackTargetFromAttacker(target: SimUnit, attacker: SimUnit, dist: number): void {
    if (target.dead || target.bossId || (target.invulnerable && target.side === 'ally')) return;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.hypot(dx, dy) || 1;
    let tx = target.x + (dx / d) * dist;
    let ty = target.y + (dy / d) * dist;
    if (target.side === 'ally') {
      const c = this.clampAllyKnockbackXY(tx, ty, this.unitTokenRootYOffsetPx(target));
      tx = c.x;
      ty = c.y;
    } else {
      const c = this.clampEnemyKnockbackXY(tx, ty, this.unitTokenRootYOffsetPx(target));
      tx = c.x;
      ty = c.y;
    }
    target.knockbackTween = {
      elapsed: 0,
      dur: KNOCKBACK_TWEEN_DUR,
      sx: target.x,
      sy: target.y,
      tx,
      ty,
    };
    if (Math.random() < 0.55) {
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 36, '击退', 'magic'),
    );
  }

  /** 将友方沿远离 (ox,oy) 方向推开（ease-out） */
  private knockbackAllyFromPoint(a: SimUnit, ox: number, oy: number, dist: number, instant = false): void {
    if (a.side !== 'ally' || a.dead || a.invulnerable) return;
    const dx = a.x - ox;
    const dy = a.y - oy;
    const d = Math.hypot(dx, dy) || 1;
    let tx = a.x + (dx / d) * dist;
    let ty = a.y + (dy / d) * dist;
    const c = this.clampAllyKnockbackXY(tx, ty, this.unitTokenRootYOffsetPx(a));
    tx = c.x;
    ty = c.y;
    if (instant) {
      a.x = tx;
      a.y = ty;
      delete a.knockbackTween;
      this.syncUnitRootFromStance(a);
      return;
    }
    a.knockbackTween = {
      elapsed: 0,
      dur: KNOCKBACK_TWEEN_DUR,
      sx: a.x,
      sy: a.y,
      tx,
      ty,
    };
  }

  private clampAllyKnockbackXY(x: number, y: number, rootYOffset: number): { x: number; y: number } {
    return {
      x: Math.max(KNOCKBACK_PAD_X, Math.min(GAME_WIDTH - KNOCKBACK_PAD_X, x)),
      y: Math.max(ARENA_Y_MIN - rootYOffset, Math.min(ARENA_Y_MAX - rootYOffset, y)),
    };
  }

  private clampEnemyKnockbackXY(x: number, y: number, rootYOffset: number): { x: number; y: number } {
    const padX = Math.round(38 * LAYOUT_SCALE);
    const yLo = Math.round(195 * LAYOUT_SCALE) + BATTLE_PLAYFIELD_Y_OFFSET_PX;
    const yHi = Math.round(1100 * LAYOUT_SCALE) + BATTLE_PLAYFIELD_Y_OFFSET_PX;
    return {
      x: Math.max(padX, Math.min(GAME_WIDTH - padX, x)),
      y: Math.max(yLo - rootYOffset, Math.min(yHi - rootYOffset, y)),
    };
  }

  private maybeDarkspearKnockback(attacker: SimUnit, target: SimUnit): void {
    if (attacker.side !== 'enemy' || !this.unitHasSkill(attacker, 'skill_darkspear_slow_knockback') || target.side !== 'ally' || target.dead) return;
    const ds = getSkillById('skill_darkspear_slow_knockback');
    if (Math.random() >= skillParamNumber(ds, 0, 0.1)) return;
    this.logBattleSkill('skill_darkspear_slow_knockback', attacker, `→ ${this.unitDebugLabel(target)}`);
    this.knockbackAllyFromPoint(target, attacker.x, attacker.y, skillParamDesignPx(ds, 1, 100));
    this.applyAllyStun(target, skillParamNumber(ds, 2, 1));
    target.moveSlowT = skillParamNumber(ds, 3, 5);
    this.syncUnitMoveSpeed(target);
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    this.slashes.push(spawnDualShotSlash(this.fxLayer, target.x, target.y));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 52, 0x2dd4bf, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 76, 0x0d9488, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 34, 0xf0fdfa, 0.32));
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 48, '击退', 'magic'),
    );
  }

  private syncRhahkWarcryAtk(u: SimUnit): void {
    if (!this.unitHasSkill(u, 'skill_rhahk_warcry') || u.rhahkWarcryBaseAtk == null) return;
    const def = getSkillById('skill_rhahk_warcry');
    const perStack = skillParamNumber(def, 2, 10) / 100;
    const stacks = u.rhahkWarcryStacks ?? 0;
    u.atk = Math.max(1, Math.round(u.rhahkWarcryBaseAtk * (1 + perStack * stacks)));
  }

  /** 拉克佐·顺劈斩：近战普攻后概率扇形额外伤害 */
  private rhahkCleaveFollowup(attacker: SimUnit, primary: SimUnit): void {
    if (!this.unitHasSkill(attacker, 'skill_rhahk_cleave') || attacker.dead || primary.dead) return;
    if (Math.random() >= RHAKH_CLEAVE_PROC_CHANCE) return;
    const def = getSkillById('skill_rhahk_cleave');
    if (!def) return;
    const coeff = skillParamNumber(def, 0, 85) / 100;
    const rOuter = skillParamDesignPx(def, 1, 125) + this.hitRadius(attacker);
    const halfRad = ((skillParamNumber(def, 2, 90) / 180) * Math.PI) / 2;
    const aim = Math.atan2(primary.y - attacker.y, primary.x - attacker.x);
    const ac = this.unitBattleTokenCenterXY(attacker);
    const cx = ac.x;
    const cy = ac.y;
    const dmg = Math.max(1, Math.round(attacker.atk * coeff));
    let hits = 0;
    for (const a of this.alive('ally')) {
      if (a.unitId === primary.unitId) continue;
      if (!allyInPunchSector(a.x, a.y, a.hitRadiusPx, cx, cy, aim, halfRad, rOuter)) continue;
      hits += 1;
      this.applyDamage(a, dmg, { attacker, damageTag: 'magic', meleeBasic: true });
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
      a.rhahkCleaveFlashT = Math.max(a.rhahkCleaveFlashT ?? 0, 0.2);
    }
    const sector = new RhahkCleaveXSlashFx(cx, cy, aim, rOuter);
    this.fxLayer.addChild(sector);
    this.rhahkCleaveFx.push(sector);

    if (hits > 0) {
      this.logBattleSkill('skill_rhahk_cleave', attacker, `扇形额外命中=${hits}`);
    }
  }

  private knockbackAllyRadialFromPoint(a: SimUnit, cx: number, cy: number, distPx: number): void {
    if (a.side !== 'ally' || a.dead || a.invulnerable) return;
    const dx = a.x - cx;
    const dy = a.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const want = distPx * (0.9 + Math.random() * 0.25);
    const ir = this.unitTokenRootYOffsetPx(a);
    const capped = this.clampAllyKnockbackXY(a.x + nx * want, a.y + ny * want, ir);
    a.knockbackTween = {
      elapsed: 0,
      dur: KNOCKBACK_TWEEN_DUR,
      sx: a.x,
      sy: a.y,
      tx: capped.x,
      ty: capped.y,
    };
    a.moveSlowDecayRem = 2.2;
    a.moveSlowDecayDur = 2.2;
    a.moveSlowDecayPeak = 0.55;
    this.syncUnitMoveSpeed(a);
  }

  private abominationCleaveFollowup(attacker: SimUnit, primary: SimUnit): void {
    if (!this.unitHasSkill(attacker, 'skill_abomination_cleave') || attacker.dead || primary.dead) return;
    const ab = getSkillById('skill_abomination_cleave');
    const cleaveR = skillParamDesignPx(ab, 0, 62);
    const maxExtra = Math.floor(skillParamNumber(ab, 1, 2));
    const extras = this.alive('ally')
      .filter((a) => a.unitId !== primary.unitId)
      .map((a) => ({ a, d: Math.hypot(a.x - primary.x, a.y - primary.y) }))
      .filter((o) => o.d <= cleaveR)
      .sort((A, B) => A.d - B.d)
      .slice(0, maxExtra)
      .map((o) => o.a);
    const cleave = Math.max(1, Math.round(attacker.atk * skillParamNumber(ab, 2, 0.55)));
    for (const a of extras) {
      this.applyDamage(a, cleave, { attacker, damageTag: 'magic' });
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
    }
    if (extras.length) {
      this.logBattleSkill('skill_abomination_cleave', attacker, `extras=${extras.length} primary=#${primary.unitId}`);
      this.ringFx.push(spawnRingPulse(this.fxLayer, primary.x, primary.y, 56, 0x4ade80, 0.35));
    }
  }

  private applyBloodlustBuff(_caster: SimUnit, recipient: SimUnit): void {
    this.logBattleSkill(
      'skill_shaman_bloodlust',
      _caster,
      `→ ${this.unitDebugLabel(recipient)}`,
    );
    const sh = getSkillById('skill_shaman_bloodlust');
    const buffSec = skillParamNumber(sh, 2, 12);
    const atkMul = skillParamNumber(sh, 3, 1.5);
    recipient.bloodlustT = buffSec;
    const base = recipient.attackIntervalBase ?? recipient.attackInterval;
    recipient.attackIntervalBase = base;
    recipient.attackInterval = base / atkMul;
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, recipient.x, this.floatAnchorY(recipient) - 40, '嗜血术', 'buff'),
    );
    for (let k = 0; k < 3; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, recipient.x, recipient.y + k * 3, 52 + k * 12, 0xdc2626, 0.36 + k * 0.05),
      );
    }
  }

  private tickShamanBloodlustAll(dt: number): void {
    const shDef = getSkillById('skill_shaman_bloodlust');
    const skillCd = skillParamNumber(shDef, 0, 6);
    const lustR = skillParamDesignPx(shDef, 1, 228);
    for (const u of this.units) {
      if (u.dead || !this.unitHasSkill(u, 'skill_shaman_bloodlust')) continue;
      u.shamanBloodlustCd = (u.shamanBloodlustCd ?? 0) + dt;
      if ((u.shamanBloodlustCd ?? 0) < skillCd) continue;
      u.shamanBloodlustCd = 0;
      const pool = this.alive('enemy').filter((e) => {
        if ((e.bloodlustT ?? 0) > 0) return false;
        return Math.hypot(e.x - u.x, e.y - u.y) <= lustR;
      });
      const others = pool.filter((e) => e.unitId !== u.unitId);
      let recip: SimUnit | null = null;
      if (others.length) {
        others.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
        recip = others[0]!;
      } else if ((u.bloodlustT ?? 0) <= 0) {
        recip = u;
      }
      if (recip) this.applyBloodlustBuff(u, recip);
    }
  }

  private tickCatapultBurns(dt: number): void {
    for (let i = this.catapultBurns.length - 1; i >= 0; i--) {
      const b = this.catapultBurns[i]!;
      b.patch.t += dt;
      b.acc += dt;
      const k = b.patch.t / b.patch.max;
      const pulse = 0.88 + Math.sin(b.patch.t * 12) * 0.1;
      b.patch.g.alpha = (0.48 + (1 - k) * 0.52) * pulse;
      b.patch.g.scale.set(1 + Math.sin(b.patch.t * 8) * 0.06);
      if (b.acc >= b.tickSec) {
        b.acc = 0;
        for (const a of this.alive('ally')) {
          if (Math.hypot(a.x - b.patch.x, a.y - b.patch.y) <= b.r) {
            this.applyDamage(a, b.dmg, {});
            if (Math.random() < CATAPULT_BURN_SPARK_CHANCE) this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
          }
        }
      }
      if (b.patch.t >= b.patch.max) {
        b.patch.g.destroy();
        this.catapultBurns.splice(i, 1);
      }
    }
  }

  private spawnCatapultBurnField(x: number, y: number, atk: number): void {
    const cat = getSkillById('skill_catapult_burn_field');
    const r = skillParamDesignPx(cat, 0, 88);
    const tickDmgCoeff = skillParamNumber(cat, 1, 0.2);
    const tickSec = skillParamNumber(cat, 2, 0.32);
    const patch = spawnGroundBurnPatch(this.fxLayer, x, y, r);
    const dmg = Math.max(1, Math.round(atk * tickDmgCoeff));
    this.catapultBurns.push({ patch, dmg, acc: 0, r, tickSec });
  }

  /**
   * 表定「武器/普攻」在 **720 设计像素** 下的延伸距离；与 `hitRadiusPx`（已乘 `LAYOUT_SCALE`）相加前须先换算到战场像素。
   */
  private weaponReachPx(u: SimUnit): number {
    return Math.round(u.range * LAYOUT_SCALE);
  }

  /**
   * 普攻/治疗等「能否够到」：表 `range` 为 720 设计像素下的净延伸，圆心距判定时加上双方碰撞半径（与 `hitRadiusPx` 同空间）。
   */
  private effectiveSkillRangeTo(caster: SimUnit, target: SimUnit): number {
    return this.weaponReachPx(caster) + this.hitRadius(caster) + this.hitRadius(target);
  }

  /** 全单位软碰撞：按 `BATTLE_COLLISION_RADIUS_COEFF` 推开过近单位，并夹在场内（不影响射程） */
  private applyUnitCollisionSeparation(iterations: number): void {
    const padX = Math.round(38 * LAYOUT_SCALE);
    const yMin = Math.round(192 * LAYOUT_SCALE);
    const yMax = Math.round(1108 * LAYOUT_SCALE);

    const clampOne = (u: SimUnit): void => {
      const ir = this.unitTokenRootYOffsetPx(u);
      u.x = Math.max(padX, Math.min(GAME_WIDTH - padX, u.x));
      u.y = Math.max(yMin - ir, Math.min(yMax - ir, u.y));
      this.syncUnitRootFromStance(u);
    };

    for (let it = 0; it < iterations; it++) {
      const alive = this.units.filter((u) => !u.dead);
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i]!;
          const b = alive[j]!;
          if (a.collisionDisabled || b.collisionDisabled) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1e-4;
          const minD = this.collisionRadiusPx(a) + this.collisionRadiusPx(b);
          if (dist >= minD) continue;
          const bothAlly = a.side === 'ally' && b.side === 'ally';
          const push = (minD - dist) * (bothAlly ? 0.34 : 0.52);
          const nx = dx / dist;
          const ny = dy / dist;
          if (a.bossId && !b.bossId) {
            b.x += nx * push * 2;
            b.y += ny * push * 2;
          } else if (b.bossId && !a.bossId) {
            a.x -= nx * push * 2;
            a.y -= ny * push * 2;
          } else {
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }
    for (const u of this.units) {
      if (!u.dead) clampOne(u);
    }
  }

  /** 同一格多单位：在格心周围微偏移排开 */
  private allySubSpawnXY(slot: number, index: number, n: number): { x: number; y: number } {
    const { x: cx, y: cy } = allyBattleSlotCenter(slot);
    const sc = this.scatterOffset(slot * 19 + index * 11 + n * 5);
    if (n <= 1) {
      return { x: cx + sc.jx * 0.22, y: cy + sc.jy * 0.22 };
    }
    const cols = Math.min(4, n);
    const rows = Math.ceil(n / cols);
    const colI = index % cols;
    const rowI = Math.floor(index / cols);
    const stepX = Math.round(36 * LAYOUT_SCALE);
    const stepY = Math.round(28 * LAYOUT_SCALE);
    const ox = (colI - (cols - 1) / 2) * stepX;
    const oy = (rowI - (rows - 1) / 2) * stepY;
    return { x: cx + ox + sc.jx * 0.18, y: cy + oy + sc.jy * 0.18 };
  }

  /** 开局站位：约束在 arena 内（与 `battleSpawnLayout` 一致） */
  private clampBattleSpawnXY(x: number, y: number): { x: number; y: number } {
    return clampBattleSpawnXY(x, y);
  }

  /** 九宫格索引 0–8；每种兵按层数拆成多个模型，出生点落在对应格中心附近 */
  private battleGearStatMult(): number {
    const ov = this.run.devBattleHooks?.gearGsBattleOverride;
    const gs = ov !== undefined ? ov : sumEquippedGearGs();
    return gsCombatStatMult(gs);
  }

  private spawnAllies(): SimUnit[] {
    const out: SimUnit[] = [];
    const teamM =
      priestBondTeamMultiplier(this.bondStacks.priest) *
      shamanBondTeamMultiplier(this.bondStacks.shaman) *
      druidBondTeamMultiplier(this.bondStacks.druid);

    for (let slot = 0; slot < 9; slot++) {
      const cell = this.run.board[slot];
      if (!cell) continue;
      const def = ALLY_DEFS[cell.kind];
      const stacks = Math.min(cell.stacks, BOARD_CELL_MAX_STACKS);
      const classM = classBondHpAtkMultiplier(this.bondStacks[cell.kind]);
      const mult = classM * teamM;
      const ab = artifactBuffsForAllySlot(this.run, slot);

      const n = Math.max(1, stacks);
      /** 每层数对应场上一个独立模型；每个模型满血满攻，不平分格内总池 */
      const bossHpM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalHpMult : 1;
      const bossAtkM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalAtkMult : 1;
      const growHp = this.run.externalGrowth.permanentMaxHpMult;
      const growAtk = this.run.externalGrowth.permanentDamageMult;
      const gearM = this.battleGearStatMult();
      const classProg = classLevelStatMult(getClassLevel(cell.kind));
      const eachHp = Math.max(
        1,
        Math.round(def.maxHp * mult * ab.hpMult * bossHpM * growHp * gearM * classProg),
      );
      const eachAtk = Math.max(
        1,
        Math.round(def.atk * mult * ab.atkMult * bossAtkM * growAtk * gearM * classProg),
      );

      let range = def.range;
      if (cell.kind === 'archer') {
        range += Math.round(archerBondRangeBonusDesign(this.bondStacks.archer) * LAYOUT_SCALE);
      }

      for (let i = 0; i < n; i++) {
        const { x, y } = this.allySubSpawnXY(slot, i, n);
        if (cell.kind === 'knight') {
          out.push(
            this.makeUnit('ally', x, y, eachHp, eachAtk, def.attackSpeed, def.range, def.moveSpeed, def.name, {
              allyKind: 'knight',
              knightState: 'fight',
              knightCooldown: 0,
              knightChargeTargetId: null,
              knightDeathDenyLeft: this.bondStacks.knight >= 15 ? 1 : 0,
              allySourceSlot: slot,
              bonusCrit: ab.crit,
              hitRadiusDesign: def.hitRadius,
            }),
          );
        } else {
          out.push(
            this.makeUnit('ally', x, y, eachHp, eachAtk, def.attackSpeed, range, def.moveSpeed, def.name, {
              allyKind: cell.kind,
              allySourceSlot: slot,
              bonusCrit: ab.crit,
              hitRadiusDesign: def.hitRadius,
              warlockSoulFireCdRem: cell.kind === 'warlock' ? 0 : undefined,
              shamanAbilityPhase: cell.kind === 'shaman' ? 'heal' : undefined,
            }),
          );
        }
      }
    }
    return out;
  }

  /**
   * 已部署英雄登场点：优先落在同职业棋盘单位的格心质心；
   * 否则落在强化上阵栏对应前排九宫格（slot 6–8）。
   */
  private heroDeployedSpawnXY(
    boardAllies: SimUnit[],
    cls: AllyClass,
    deploySlotIndex: number,
  ): { x: number; y: number } {
    const mates = boardAllies.filter((u) => u.side === 'ally' && !u.heroId && u.allyKind === cls);
    if (mates.length > 0) {
      const cx = mates.reduce((s, u) => s + u.x, 0) / mates.length;
      const cy = mates.reduce((s, u) => s + u.y, 0) / mates.length;
      const sc = this.scatterOffset(900 + deploySlotIndex * 17);
      return { x: cx + sc.jx * 0.18, y: cy + sc.jy * 0.22 };
    }
    const slot = heroDeployBattleSlot(deploySlotIndex);
    const { x, y } = allyBattleSlotCenter(slot);
    const sc = this.scatterOffset(910 + deploySlotIndex * 19);
    return { x: x + sc.jx * 0.2, y: y + sc.jy * 0.2 };
  }

  /** 强化界面部署的英雄；含星级与职业羁绊乘区；登场点见 heroDeployedSpawnXY */
  private spawnDeployedHeroes(boardAllies: SimUnit[]): SimUnit[] {
    const hooks = this.run.devBattleHooks;
    const cap = hooks
      ? Math.max(1, Math.floor(hooks.heroSlotCap))
      : maxHeroDeploySlots();
    const deployed = hooks?.heroDeploy ?? getDeployedHeroIds();
    const meta = loadHeroMeta();
    const teamM =
      priestBondTeamMultiplier(this.bondStacks.priest) *
      shamanBondTeamMultiplier(this.bondStacks.shaman) *
      druidBondTeamMultiplier(this.bondStacks.druid);
    const bossHpM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalHpMult : 1;
    const bossAtkM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalAtkMult : 1;
    const growHp = this.run.externalGrowth.permanentMaxHpMult;
    const growAtk = this.run.externalGrowth.permanentDamageMult;
    const gearM = this.battleGearStatMult();
    const classProgFor = (cls: AllyClass): number => classLevelStatMult(getClassLevel(cls));
    const out: SimUnit[] = [];
    for (let s = 0; s < cap; s++) {
      const hid = deployed[s];
      if (!hid) continue;
      const hd = getHeroDef(hid);
      if (!hd) continue;
      const entry = meta.heroes[hid];
      const stars = entry?.stars ?? 1;
      const starM = heroStarStatMult(stars);
      const cls = hd.allyClass;
      const classM = classBondHpAtkMultiplier(this.bondStacks[cls]);
      const mult = classM * teamM;
      const cProg = classProgFor(cls);
      let eachHp = Math.max(
        1,
        Math.round(hd.maxHp * starM * mult * bossHpM * growHp * gearM * cProg),
      );
      if (hid === PRIEST_SHELTER_BLUE_ID) {
        eachHp = Math.max(1, Math.round(eachHp * 1.1));
      }
      let eachAtk = Math.max(
        1,
        Math.round(hd.atk * starM * mult * bossAtkM * growAtk * gearM * cProg),
      );
      if (hid === KNIGHT_HOLY_SANCTION_BLUE_ID) {
        eachAtk = Math.max(1, Math.round(eachAtk * 1.1));
      }
      let range = hd.range;
      if (cls === 'archer') {
        range += Math.round(archerBondRangeBonusDesign(this.bondStacks.archer) * LAYOUT_SCALE);
      }
      if (hid === ARCHER_STRONG_STRIKE_BLUE_ID) range += 50;
      const heroBonusCrit = hid === MAGE_ARCANE_BLUE_ID ? 0.1 : 0;
      const { x: sx, y: sy } = this.heroDeployedSpawnXY(boardAllies, cls, s);
      if (cls === 'knight') {
        out.push(
          this.makeUnit('ally', sx, sy, eachHp, eachAtk, hd.attackSpeed, hd.range, hd.moveSpeed, hd.name, {
            allyKind: 'knight',
            knightState: 'fight',
            knightCooldown: 0,
            knightChargeTargetId: null,
            knightDeathDenyLeft: this.bondStacks.knight >= 15 ? 1 : 0,
            bonusCrit: heroBonusCrit,
            hitRadiusDesign: hd.hitRadius,
            heroId: hid,
          }),
        );
      } else {
        out.push(
          this.makeUnit('ally', sx, sy, eachHp, eachAtk, hd.attackSpeed, range, hd.moveSpeed, hd.name, {
            allyKind: cls,
            bonusCrit: heroBonusCrit,
            hitRadiusDesign: hd.hitRadius,
            heroId: hid,
          }),
        );
      }
    }
    return out;
  }

  /** 开场羁绊：法师奥术护盾、术士恐惧术等 */
  private applyBondBattleOpenBuffs(units: SimUnit[]): void {
    const wardHits = mageBondArcaneWardHits(this.bondStacks.mage);
    if (wardHits > 0) {
      for (const u of units) {
        if (u.dead || u.side !== 'ally' || u.allyKind !== 'mage') continue;
        u.arcaneWardHitsLeft = wardHits;
      }
    }
    if (this.bondStacks.warlock >= 10) {
      this.castWarlockOpeningFearVolley(units);
    }
    if (this.bondStacks.shaman >= 6) {
      this.castShamanBondOpeningBloodlust(units);
    }
    if (this.bondStacks.assassin >= 6) {
      for (const u of units) {
        if (u.dead || u.side !== 'ally' || u.allyKind !== 'assassin') continue;
        u.assassinDodgeRem = ASSASSIN_BOND6_DODGE_DURATION_SEC;
      }
    }
  }

  private mageSplashRadiusPx(): number {
    return Math.round(mageBondSplashRadiusDesign(this.bondStacks.mage) * LAYOUT_SCALE);
  }

  /** 我方单位眩晕（十羁绊牧师免疫） */
  private applyAllyStun(u: SimUnit, stunSec: number): void {
    if (stunSec <= 0 || u.dead || u.side !== 'ally') return;
    if (u.allyKind === 'priest' && this.bondStacks.priest >= 10) return;
    u.stunT = Math.max(u.stunT ?? 0, stunSec);
  }

  /** 敌方是否免疫术士恐惧（首领、控制免疫、过载护盾引导、喷气/消失飞行等） */
  private unitImmuneToWarlockFear(u: SimUnit): boolean {
    if (u.side !== 'enemy' || u.dead) return true;
    if (u.bossId) return true;
    if (this.unitHasSkill(u, SKILL_CC_IMMUNE)) return true;
    if (this.unitHasOverloadExplosionSuperArmor(u)) return true;
    const cast = u.bossSkillCast;
    if (cast?.kind === 'jetpack_assault' || cast?.kind === 'vanish_ambush') return true;
    return false;
  }

  private pickWarlockOpeningFearTarget(exclude: Set<number>): SimUnit | null {
    let best: SimUnit | null = null;
    for (const e of this.alive('enemy')) {
      if (exclude.has(e.unitId)) continue;
      if (this.unitImmuneToWarlockFear(e)) continue;
      if ((e.fearT ?? 0) > 0) continue;
      if (!best || e.atk > best.atk) best = e;
    }
    return best;
  }

  private castWarlockOpeningFearVolley(units: SimUnit[]): void {
    const warlocks = units.filter((u) => u.side === 'ally' && !u.dead && u.allyKind === 'warlock');
    if (!warlocks.length) return;
    const claimed = new Set<number>();
    for (const w of warlocks) {
      const tgt = this.pickWarlockOpeningFearTarget(claimed);
      if (!tgt) break;
      this.applyWarlockFear(w, tgt);
      claimed.add(tgt.unitId);
    }
  }

  /** 恐惧：定身施法、按触发时方向逃跑；可打断非首领引导/蓄力 */
  private applyWarlockFear(source: SimUnit, target: SimUnit): void {
    if (this.unitImmuneToWarlockFear(target)) return;
    const dur = warlockBondFearDurationSec(this.bondStacks.warlock);
    if (dur <= 0) return;
    let dx = target.x - source.x;
    let dy = target.y - source.y;
    const mag = Math.hypot(dx, dy) || 1;
    dx /= mag;
    dy /= mag;
    target.fearDirX = dx;
    target.fearDirY = dy;
    target.fearT = Math.max(target.fearT ?? 0, dur);
    target.stunT = 0;
    if (target.tokenInnerR != null && !target.warlockFearSpiralFx) {
      target.warlockFearSpiralFx = attachWarlockFearSpiralFx(target.body, target.tokenInnerR);
      target.warlockFearSpiralPhase = 0;
    }
    this.interruptNonBossEnemyCastFromControl(target);
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, target.hitRadiusPx * 1.6, 0x7c3aed, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, target.hitRadiusPx * 2.2, 0xc4b5fd, 0.32));
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 36, '恐惧', 'magic'),
    );
  }

  private tryWarlockFearOnHit(source: SimUnit, target: SimUnit): void {
    if (source.allyKind !== 'warlock' || target.side !== 'enemy' || target.dead) return;
    if (Math.random() >= WARLOCK_FEAR_PROC_CHANCE) return;
    this.applyWarlockFear(source, target);
  }

  private onWarlockAllyHit(source: SimUnit, target: SimUnit, hpLoss: number): void {
    if (source.allyKind !== 'warlock' || hpLoss <= 0) return;
    this.tryWarlockFearOnHit(source, target);
    const ls = warlockBondLifestealRatio(this.bondStacks.warlock);
    if (ls > 0) {
      const heal = Math.max(1, Math.round(hpLoss * ls));
      this.applyHeal(source, heal, source);
    }
  }

  private tickWarlockSoulFire(u: SimUnit, dt: number): void {
    u.warlockSoulFireCdRem = Math.max(0, (u.warlockSoulFireCdRem ?? 0) - dt);
    if (this.bondStacks.warlock < 15) return;
    if ((u.stunT ?? 0) > 0) return;
    if (u.hp / Math.max(1, u.maxHp) <= WARLOCK_SOUL_FIRE_HP_ABOVE_RATIO) return;
    if ((u.warlockSoulFireCdRem ?? 0) > 0) return;
    const tgt = this.nearestEnemy(u);
    if (!tgt) return;
    const cost = Math.max(1, Math.round(u.maxHp * WARLOCK_SOUL_FIRE_SELF_COST_MAX_HP_RATIO));
    if (u.hp <= cost) return;
    u.hp = Math.max(1, u.hp - cost);
    this.syncUnitHpRing(u);
    u.warlockSoulFireCdRem = WARLOCK_SOUL_FIRE_CD_SEC;
    const dmg = Math.max(1, Math.round(u.atk * WARLOCK_SOUL_FIRE_DAMAGE_MULT));
    const uid = u.unitId;
    const tid = tgt.unitId;
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, u.x, this.floatAnchorY(u) - 40, '灵魂之火', 'magic'),
    );
    this.queueProjectile(
      u,
      tid,
      () => {
        const a = this.units.find((x) => x.unitId === uid && !x.dead);
        const t = this.byId(tid);
        if (!a || !t) return;
        this.applyDamage(t, dmg, { attacker: a, damageTag: 'magic', bypassBlock: true });
        this.ringFx.push(spawnRingPulse(this.fxLayer, t.x, t.y, t.hitRadiusPx * 2.4, 0x9333ea, 0.5));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, t.x, t.y));
      },
      { style: 'ally_warlock_soul_fire', speedMul: 0.72 },
    );
  }

  /** 恐惧中：沿锁定方向逃跑（秒） */
  private tickEnemyFearMove(u: SimUnit, dt: number): boolean {
    const rem = u.fearT ?? 0;
    if (rem <= 0 || u.side !== 'enemy') return false;
    u.fearT = Math.max(0, rem - dt);
    let fx = u.fearDirX ?? 0;
    let fy = u.fearDirY ?? 0;
    const mag = Math.hypot(fx, fy);
    if (mag < 1e-4) {
      fx = 1;
      fy = 0;
    } else {
      fx /= mag;
      fy /= mag;
    }
    const step = u.speed * dt;
    u.x += fx * step;
    u.y += fy * step;
    this.syncUnitRootFromStance(u);
    return (u.fearT ?? 0) > 0;
  }

  private applyMegaStatsToUnit(u: SimUnit): void {
    const radiusMult = BOND_MEGA_RADIUS_MULT;
    const statMult = BOND_MEGA_STAT_MULT;
    const hr = u.hitRadiusPx;
    u.hitRadiusPx = Math.max(1, Math.round(hr * radiusMult));
    if (u.tokenInnerR != null) {
      u.tokenInnerR = Math.max(1, Math.round(u.tokenInnerR * radiusMult));
    }
    u.atk = Math.max(1, Math.round(u.atk * statMult));
    u.maxHp = Math.max(1, Math.round(u.maxHp * statMult));
    u.hp = Math.min(u.maxHp, Math.round(u.hp * statMult));
    u.root.scale.set(radiusMult);
    this.syncUnitRootFromStance(u);
    this.syncUnitHpRing(u);
  }

  /** 二十一极巨化羁绊：每种职业层数≥21 时，该职业随机 3 个入场小兵极巨化（半径×1.25，血攻×3） */
  private applyBond25Mega(allies: SimUnit[]): void {
    for (const kind of ALLY_CLASSES) {
      if (kind === 'druid') continue;
      if (!hasBondMega(this.bondStacks[kind])) continue;
      const pool = allies.filter((u) => u.allyKind === kind && !u.heroId);
      if (!pool.length) continue;
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = pool[i]!;
        pool[i] = pool[j]!;
        pool[j] = t;
      }
      const n = Math.min(3, pool.length);
      for (let k = 0; k < n; k++) {
        this.applyMegaStatsToUnit(pool[k]!);
      }
    }
  }

  /** 德鲁伊：划分熊/远程形态并换立绘，再对最靠前 3 名做 21 极巨化（须先换图再 scale，否则会 1.25× 叠两次） */
  private applyDruidBattleSetup(units: SimUnit[]): void {
    const druids = units.filter((u) => u.side === 'ally' && !u.dead && u.allyKind === 'druid');
    if (!druids.length) return;

    const byFront = [...druids].sort((a, b) => a.y - b.y);
    const frontBearSlots = Math.ceil(byFront.length / 2);
    const bearIds = new Set<number>();
    for (const u of byFront.slice(0, frontBearSlots)) bearIds.add(u.unitId);
    for (const u of byFront) {
      if (u.heroId) bearIds.add(u.unitId);
    }

    const meleeR = ALLY_DEFS.druid.range;
    const casterR = Math.round(DRUID_CASTER_RANGE_DESIGN * LAYOUT_SCALE);

    for (const u of druids) {
      if (bearIds.has(u.unitId)) {
        u.druidForm = 'bear';
        u.maxHp = Math.max(1, u.maxHp * 2);
        u.hp = Math.min(u.maxHp, u.hp * 2);
        u.atk = Math.max(1, u.atk * 2);
        u.range = meleeR;
        u.druidBearSwipeCount = 0;
        if (u.tokenDisk && u.tokenLetter && u.tokenInnerR != null) {
          if (u.heroId) {
            swapHeroTokenPortrait(
              { disk: u.tokenDisk, letter: u.tokenLetter },
              u.tokenInnerR,
              u.heroId,
              'druid',
              true,
            );
          } else {
            swapAllyTokenPortrait(
              { disk: u.tokenDisk, letter: u.tokenLetter },
              u.tokenInnerR,
              'druid',
              'druid_bear',
            );
          }
        }
      } else {
        u.druidForm = 'caster';
        u.range = casterR;
      }
      this.syncUnitHpRing(u);
    }

    if (hasBondMega(this.bondStacks.druid)) {
      const sorted = [...druids].sort((a, b) => a.y - b.y);
      for (let k = 0; k < Math.min(3, sorted.length); k++) {
        this.applyMegaStatsToUnit(sorted[k]!);
      }
    }
  }

  private applyAllyBondBloodlustBuff(recipient: SimUnit, shamanStacks: number): void {
    const dur = shamanBondBloodlustDurationSec(shamanStacks);
    const atkMul = shamanBondBloodlustAtkSpeedMult(shamanStacks);
    recipient.bloodlustT = dur;
    const base = recipient.attackIntervalBase ?? recipient.attackInterval;
    recipient.attackIntervalBase = base;
    recipient.attackInterval = base / atkMul;
    const sc = recipient.root.scale.x || 1;
    recipient.root.scale.set(sc * 1.1);
    if (!recipient.shamanBondBloodlustGlow && recipient.tokenInnerR != null) {
      recipient.shamanBondBloodlustGlow = attachAllyBondBloodlustGlow(recipient.body, recipient.tokenInnerR);
      recipient.shamanBondBloodlustGlowPhase = 0;
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, recipient.x, this.floatAnchorY(recipient) - 40, '嗜血术', 'buff'),
    );
    for (let k = 0; k < 3; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, recipient.x, recipient.y, recipient.hitRadiusPx * (1.1 + k * 0.12), 0xdc2626, 0.38),
      );
    }
  }

  private castShamanBondOpeningBloodlust(units: SimUnit[]): void {
    const stacks = this.bondStacks.shaman;
    for (const u of units) {
      if (u.dead || u.side !== 'ally') continue;
      this.applyAllyBondBloodlustBuff(u, stacks);
    }
  }

  /** 治疗波：仅对需要治疗的友方生效（性质同牧师治疗，无技能名/数值跳字） */
  private tryCastShamanHealWave(shaman: SimUnit): boolean {
    const n = shamanBondHealWaveTargets(this.bondStacks.shaman);
    const ranked = this.alive('ally')
      .filter((a) => this.allyNeedsHeal(a))
      .map((a) => ({ a, pct: a.hp / Math.max(1, a.maxHp) }))
      .sort((p, q) => p.pct - q.pct);
    if (!ranked.length) return false;
    const picks = ranked.slice(0, n);
    for (const { a } of picks) {
      const heal = Math.max(1, Math.round(shaman.atk * SHAMAN_HEAL_WAVE_ATK_MULT));
      this.applyHeal(a, heal, shaman, { silent: true });
    }
    return true;
  }

  private pickShamanLightningBoltTarget(u: SimUnit): SimUnit | null {
    const tgt = this.nearestEnemy(u);
    if (!tgt) return null;
    const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    const aim = this.effectiveSkillRangeTo(u, tgt) + this.meleeEngagementMarginPx(u, tgt);
    if (dist > aim) return null;
    return tgt;
  }

  /** 闪电箭：等同普攻伤害的远程弹道（无技能名/伤害跳字；风怒仍可能飘字） */
  private castShamanLightningBolt(shaman: SimUnit, target: SimUnit): void {
    const dmg = Math.max(1, Math.round(shaman.atk));
    const uid = shaman.unitId;
    const tid = target.unitId;
    this.queueProjectile(
      shaman,
      tid,
      () => {
        const a = this.units.find((x) => x.unitId === uid && !x.dead);
        const t = this.byId(tid);
        if (!a || !t) return;
        this.applyDamage(t, dmg, { attacker: a, showFloat: false });
        this.maybeShamanWindfury(a, t, dmg);
      },
      { style: 'ally_shaman_lightning' },
    );
  }

  private maybeShamanWindfury(shaman: SimUnit, firstTarget: SimUnit, baseDmg: number): void {
    const chance = shamanBondWindfuryChance(this.bondStacks.shaman);
    if (chance <= 0 || Math.random() >= chance) return;
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, shaman.x, this.floatAnchorY(shaman) - 52, '风怒', 'buff'),
    );
    shaman.shamanWindfuryPending = {
      hitsLeft: SHAMAN_WINDFURY_EXTRA_HITS,
      gapRem: SHAMAN_WINDFURY_HIT_GAP_SEC,
      targetId: firstTarget.unitId,
      dmg: baseDmg,
    };
  }

  private tickShamanWindfuryPending(u: SimUnit, dt: number): void {
    const w = u.shamanWindfuryPending;
    if (!w || w.hitsLeft <= 0) {
      u.shamanWindfuryPending = undefined;
      return;
    }
    w.gapRem -= dt;
    if (w.gapRem > 0) return;
    w.gapRem = SHAMAN_WINDFURY_HIT_GAP_SEC;
    const t = this.byId(w.targetId);
    if (!t || t.dead) {
      u.shamanWindfuryPending = undefined;
      return;
    }
    this.applyDamage(t, w.dmg, { attacker: u, showFloat: false });
    w.hitsLeft -= 1;
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, t.x, t.y));
  }

  /**
   * 萨满：治疗波 / 闪电箭固定交替（仅普攻间隔，治疗波无独立 CD）。
   * 当前相位无法施放则本拍发呆，仍切换相位并进入下一轮间隔。
   */
  private tickShamanAlly(u: SimUnit, dt: number, kbActive: boolean): void {
    if (kbActive || (u.stunT ?? 0) > 0) return;
    this.tickShamanWindfuryPending(u, dt);
    u.cd -= dt;

    if (u.cd <= 0) {
      const phase = u.shamanAbilityPhase ?? 'heal';
      if (phase === 'heal') {
        this.tryCastShamanHealWave(u);
        u.shamanAbilityPhase = 'bolt';
      } else {
        const tgt = this.pickShamanLightningBoltTarget(u);
        if (tgt) this.castShamanLightningBolt(u, tgt);
        u.shamanAbilityPhase = 'heal';
      }
      u.cd = Math.max(0.35, this.effectiveAttackInterval(u));
      return;
    }

    const target = this.nearestEnemy(u);
    if (!target) return;
    const dx = target.x - u.x;
    const dy = target.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const aimDist = this.effectiveSkillRangeTo(u, target) + this.meleeEngagementMarginPx(u, target);
    const nx = dx / dist;
    const ny = dy / dist;
    const stepLen = u.speed * dt;
    const travel = Math.min(stepLen, Math.max(0, dist - aimDist));
    const stuck =
      dist > aimDist &&
      travel < Math.min(1.25, stepLen * 0.04) &&
      dist <= aimDist + Math.max(18, Math.round(24 * LAYOUT_SCALE));
    if (dist <= aimDist || stuck) return;
    u.x += nx * travel;
    u.y += ny * travel;
    this.syncUnitRootFromStance(u);
  }

  private maybeDruidBearSwipe(bear: SimUnit, primary: SimUnit): void {
    if (bear.druidForm !== 'bear' || this.bondStacks.druid < 6) return;
    const n = (bear.druidBearSwipeCount ?? 0) + 1;
    bear.druidBearSwipeCount = n;
    if (n % DRUID_BEAR_SWIPE_EVERY_N_ATTACKS !== 0) return;
    const halfRad = ((DRUID_BEAR_SWIPE_HALF_ANGLE_DEG * Math.PI) / 180);
    const aim = Math.atan2(primary.y - bear.y, primary.x - bear.x);
    const rOuter = bear.hitRadiusPx + this.hitRadius(bear);
    const dmg = Math.max(1, Math.round(bear.atk));
    let hits = 0;
    for (const e of this.alive('enemy')) {
      if (e.unitId === primary.unitId) continue;
      if (!allyInPunchSector(e.x, e.y, e.hitRadiusPx, bear.x, bear.y, aim, halfRad, rOuter)) continue;
      hits += 1;
      this.applyDamage(e, dmg, { attacker: bear, meleeBasic: true });
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, e.x, e.y));
    }
    const swipeFx = new DruidBearSwipeArcFx(bear.x, bear.y, aim, rOuter);
    this.fxLayer.addChild(swipeFx);
    this.druidBearSwipeFx.push(swipeFx);
    if (hits > 0) {
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, bear.x, this.floatAnchorY(bear) - 36, '横扫', 'magic'),
      );
    }
  }

  private pickRejuvenationTarget(_caster: SimUnit): SimUnit | null {
    const allies = this.alive('ally');
    const without = allies.filter((a) => !(a.rejuvenation && (a.rejuvenation.remainSec ?? 0) > 0));
    const pool = without.length ? without : allies;
    let best = pool[0] ?? null;
    for (const a of pool) {
      if (!best) {
        best = a;
        continue;
      }
      const aRej = a.rejuvenation;
      const bRej = best.rejuvenation;
      const aPct = a.hp / Math.max(1, a.maxHp);
      const bPct = best.hp / Math.max(1, best.maxHp);
      if (without.length) {
        if (aPct < bPct) best = a;
      } else if (aRej && bRej) {
        if ((aRej.remainSec ?? 0) < (bRej.remainSec ?? 0)) best = a;
      } else if (aPct < bPct) {
        best = a;
      }
    }
    return best;
  }

  private tickDruidCasterRejuvenation(u: SimUnit, dt: number): void {
    if (u.druidForm !== 'caster' || this.bondStacks.druid < 10) return;
    u.druidRejuvCdRem = Math.max(0, (u.druidRejuvCdRem ?? 0) - dt);
    if ((u.druidRejuvCdRem ?? 0) > 0) return;
    const tgt = this.pickRejuvenationTarget(u);
    if (!tgt) return;
    u.druidRejuvCdRem = DRUID_REJUV_COOLDOWN_SEC;
    tgt.rejuvenation = { remainSec: DRUID_REJUV_DURATION_SEC, healAcc: 0, sourceId: u.unitId };
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, tgt.x, this.floatAnchorY(tgt) - 36, '回春术', 'heal'),
    );
    this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, tgt.hitRadiusPx * 1.2, 0x4ade80, 0.38));
  }

  private tickRejuvenationHoT(u: SimUnit, dt: number): void {
    const r = u.rejuvenation;
    if (!r || (r.remainSec ?? 0) <= 0) return;
    r.remainSec = Math.max(0, r.remainSec - dt);
    r.healAcc = (r.healAcc ?? 0) + dt;
    while ((r.healAcc ?? 0) >= 1) {
      r.healAcc -= 1;
      const heal = Math.max(1, Math.round(u.maxHp * DRUID_REJUV_HEAL_MAX_HP_RATIO_PER_SEC));
      const src = this.byId(r.sourceId);
      this.applyHeal(u, heal, src ?? undefined);
    }
    if (r.remainSec <= 0) u.rejuvenation = undefined;
  }

  private assassinMeleeEnemyInRange(u: SimUnit): boolean {
    for (const e of this.alive('enemy')) {
      const dist = Math.hypot(e.x - u.x, e.y - u.y);
      const reach = this.effectiveSkillRangeTo(u, e) + this.meleeEngagementMarginPx(u, e);
      if (dist <= reach) return true;
    }
    return false;
  }

  private pickAssassinBlinkTarget(u: SimUnit): SimUnit | null {
    const enemies = this.alive('enemy');
    if (!enemies.length) return null;
    const ranged = enemies.filter((e) => e.range >= RANGED_ATTACK_RANGE_THRESHOLD);
    const pool = ranged.length ? ranged : enemies;
    let best = pool[0]!;
    let bestD = Math.hypot(best.x - u.x, best.y - u.y);
    for (const e of pool) {
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private tryAssassinBlinkStrike(u: SimUnit): boolean {
    if (u.allyKind !== 'assassin' || u.assassinVanishPhase) return false;
    if (this.assassinMeleeEnemyInRange(u)) return false;
    const tgt = this.pickAssassinBlinkTarget(u);
    if (!tgt) return false;
    const ang = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    const land = Math.max(
      this.effectiveSkillRangeTo(u, tgt) * 0.55,
      u.hitRadiusPx + tgt.hitRadiusPx + Math.round(8 * LAYOUT_SCALE),
    );
    u.x = tgt.x - Math.cos(ang) * land;
    u.y = tgt.y - Math.sin(ang) * land;
    this.syncUnitRootFromStance(u);
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, u.hitRadiusPx * 1.4, 0xfff569, 0.45));
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, u.x, this.floatAnchorY(u) - 32, '闪现', 'magic'),
    );
    if (this.bondStacks.assassin >= 10) u.assassinBlinkStunNext = true;
    return true;
  }

  private tickAssassinVanish(u: SimUnit, dt: number): boolean {
    if (u.allyKind !== 'assassin' || !u.assassinVanishPhase) return false;
    u.invincible = true;
    if (u.assassinVanishPhase === 'fade') {
      u.assassinVanishFadeRem = Math.max(0, (u.assassinVanishFadeRem ?? 0) - dt);
      const p = 1 - (u.assassinVanishFadeRem ?? 0) / ASSASSIN_VANISH_FADE_SEC;
      u.root.alpha = 1 - p * (1 - ASSASSIN_VANISH_BODY_ALPHA);
      if ((u.assassinVanishFadeRem ?? 0) <= 0) {
        u.assassinVanishPhase = 'hold';
        u.assassinVanishHoldRem = ASSASSIN_VANISH_HOLD_SEC;
        u.root.alpha = ASSASSIN_VANISH_BODY_ALPHA;
      }
      return true;
    }
    u.root.alpha = ASSASSIN_VANISH_BODY_ALPHA;
    u.assassinVanishHoldRem = Math.max(0, (u.assassinVanishHoldRem ?? 0) - dt);
    const heal = Math.max(1, Math.round(u.maxHp * ASSASSIN_VANISH_HEAL_MAX_HP_PER_SEC * dt));
    this.applyHeal(u, heal, u);
    if ((u.assassinVanishHoldRem ?? 0) <= 0) {
      u.assassinVanishPhase = undefined;
      u.invincible = false;
      u.root.alpha = 1;
      this.tryAssassinBlinkStrike(u);
    }
    return true;
  }

  private tryAssassinVanishOnLowHp(u: SimUnit): void {
    if (u.allyKind !== 'assassin' || u.assassinVanishUsed || this.bondStacks.assassin < 15) return;
    if (u.hp / Math.max(1, u.maxHp) >= ASSASSIN_VANISH_HP_THRESHOLD) return;
    u.assassinVanishUsed = true;
    u.assassinVanishPhase = 'fade';
    u.assassinVanishFadeRem = ASSASSIN_VANISH_FADE_SEC;
    u.invincible = true;
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, u.x, this.floatAnchorY(u) - 48, '消失', 'buff'),
    );
  }

  /** 绝命乱斗：敌我初始站位随机 */
  private jitterChaosSpawnPositions(): void {
    if (!this.run.chaoticBattle) return;
    const xmin = Math.round(52 * LAYOUT_SCALE);
    const xmax = GAME_WIDTH - xmin;
    const ymin = Math.round(220 * LAYOUT_SCALE);
    const ymax = Math.round(1040 * LAYOUT_SCALE);
    for (const u of this.units) {
      const ir = this.unitTokenRootYOffsetPx(u);
      u.x = xmin + Math.random() * (xmax - xmin);
      u.y = ymin + Math.random() * (ymax - ymin) - ir;
      this.syncUnitRootFromStance(u);
    }
  }

  /** 复仇之魂：开场按备战神器邻格结算 */
  private applyRevengeSpiritOpening(): void {
    const run = this.run;
    for (let g = 0; g < 9; g++) {
      if (run.artifactBySlot[g] !== 'revenge_spirit') continue;
      let links = 0;
      const deltas = [-3, 3, -1, 1];
      for (const d of deltas) {
        const n = g + d;
        if (n < 0 || n > 8) continue;
        if (d === -1 && g % 3 === 0) continue;
        if (d === 1 && g % 3 === 2) continue;
        if (!run.board[n]) continue;
        links += 1;
        const cut = 0.2;
        for (const u of this.units) {
          if (u.side !== 'ally' || u.dead) continue;
          if (u.heroId || u.allySourceSlot !== n) continue;
          const loss = Math.max(1, Math.round(u.hp * cut));
          u.hp = Math.max(1, u.hp - loss);
        }
      }
      const L = Math.min(4, links);
      if (L <= 0) continue;
      const pct = 0.06 * L;
      for (const e of this.units) {
        if (e.side !== 'enemy' || e.dead) continue;
        const loss = Math.max(1, Math.round(e.hp * pct));
        e.hp = Math.max(1, e.hp - loss);
      }
    }
    this.recomputeEnemyHp();
  }

  /**
   * 敌方：首领固定上半场正中；小怪落在上半场内、略远离中线，
   * 按射程升序：远程靠上缘、近战更靠中线侧（黄金角打散）。
   */
  private spawnEnemies(meta: RoundMeta): SimUnit[] {
    const bosses: SimUnit[] = [];
    type PendingEnemy = {
      range: number;
      waveOrder: number;
      mk: (x: number, y: number) => SimUnit;
    };
    const pending: PendingEnemy[] = [];
    let waveOrder = 0;
    const { chapter } = meta;
    const ri = legacyProgressRoundIndex(this.run.bookChapterId, this.run.currentRoundIndex);
    const bookM = this.run.bookChapterStrengthMult();
    const progMax = getNodeProgressMaxForBookChapter(this.run.bookChapterId);

    for (const wave of meta.enemies) {
      if (wave.type === 'boss' && wave.bossId) {
        const bc = resolveWowBookBossCombat(this.run.bookChapterId);
        const hp = scaledEnemyHp(chapter, ri, bc.baseMaxHpTable, bookM, progMax);
        const atk = scaledEnemyAtk(chapter, ri, bc.combatBaseAtk, bookM, progMax);
        const bossLabel =
          wave.wowBossDisplayName && wave.wowBossDisplayName.trim().length > 0
            ? wave.wowBossDisplayName.trim()
            : bossDisplayName(wave.bossId);
        const bossCircleUid = bossUidForBookChapter(this.run.bookChapterId) ?? undefined;
        const bp = enemyBossSpawnCenter();
        bosses.push(
          this.makeUnit(
            'enemy',
            bp.x,
            bp.y,
            hp,
            atk,
            bc.attackSpeed * 0.5,
            bc.range,
            bc.moveSpeed,
            bossLabel,
            {
              bossId: wave.bossId,
              hitRadiusDesign: bc.hitRadiusDesign,
              wowCirclePortraitUid: bossCircleUid,
              bossSkillIds: bc.skillIds,
            },
          ),
        );
        continue;
      }

      if (wave.wowMobId) {
        const mob = getWowMob(wave.wowMobId);
        const type = wave.type as keyof typeof ENEMY_DEFS;
        const paint = type as EnemyPaintKind;
        if (!mob) {
          const def = ENEMY_DEFS[type];
          for (let k = 0; k < wave.count; k++) {
            const wo = waveOrder++;
            const hp = scaledEnemyHp(chapter, ri, def.baseMaxHp, bookM, progMax);
            const atk = scaledEnemyAtk(chapter, ri, def.baseAtk, bookM, progMax);
            pending.push({
              range: def.range,
              waveOrder: wo,
              mk: (x, y) =>
                this.makeUnit('enemy', x, y, hp, atk, def.attackSpeed, def.range, def.moveSpeed, def.name, {
                  enemyPaint: paint,
                  hitRadiusDesign: def.hitRadius,
                }),
            });
          }
          continue;
        }
        const baseAtk = enemyCombatBaseAtkFromTable(mob.baseAtk, mob.range);
        for (let k = 0; k < wave.count; k++) {
          const wo = waveOrder++;
          const hp = scaledEnemyHp(chapter, ri, mob.baseMaxHp, bookM, progMax);
          const atk = scaledEnemyAtk(chapter, ri, baseAtk, bookM, progMax);
          pending.push({
            range: mob.range,
            waveOrder: wo,
            mk: (x, y) =>
                this.makeUnit('enemy', x, y, hp, atk, mob.attackSpeed, mob.range, mob.moveSpeed, mob.nameCn, {
                  enemyPaint: paint,
                  hitRadiusDesign: mob.hitRadius,
                  wowCirclePortraitUid: mob.monsterUid,
                  enemyCreatureType: mob.creatureType,
                  /** 仅书本行 `skillIds`（缺省或省略 = 无技能）；不按 `enemyPaint` 模板回填 */
                  enemySkillIds: [...(mob.skillIds ?? [])],
                }),
          });
        }
        continue;
      }

      const type = wave.type as keyof typeof ENEMY_DEFS;
      const def = ENEMY_DEFS[type];
      for (let k = 0; k < wave.count; k++) {
        const wo = waveOrder++;
        const hp = scaledEnemyHp(chapter, ri, def.baseMaxHp, bookM, progMax);
        const atk = scaledEnemyAtk(chapter, ri, def.baseAtk, bookM, progMax);
        pending.push({
          range: def.range,
          waveOrder: wo,
          mk: (x, y) =>
            this.makeUnit('enemy', x, y, hp, atk, def.attackSpeed, def.range, def.moveSpeed, def.name, {
              enemyPaint: type as EnemyPaintKind,
              hitRadiusDesign: def.hitRadius,
            }),
        });
      }
    }

    pending.sort((a, b) => (a.range !== b.range ? a.range - b.range : a.waveOrder - b.waveOrder));

    const minions: SimUnit[] = [];
    const n = pending.length;

    for (let i = 0; i < n; i++) {
      const pe = pending[i]!;
      const rangeRank = n > 1 ? i / (n - 1) : 0.5;
      const ej = this.scatterOffset(ri * 97 + i * 41 + pe.waveOrder * 13);
      const p = enemyMinionSpawnXY(1 - rangeRank, i, pe.waveOrder, ej.jx, ej.jy);
      minions.push(pe.mk(p.x, p.y));
    }

    return [...bosses, ...minions];
  }

  /**
   * 创建战斗单位。`x` / `y` 为代币 **root** 世界坐标（与圆形代币子节点局部 (0,-innerR) 圆心衔接）；
   * `SimUnit.x` / `SimUnit.y` 存为圆盘几何中心（站位与判距锚点）。
   */
  private makeUnit(
    side: 'ally' | 'enemy',
    x: number,
    y: number,
    hp: number,
    atk: number,
    attackSpeed: number,
    range: number,
    moveSpeed: number,
    _label: string,
    opts: {
      bossId?: BossId;
      allyKind?: AllyClass;
      enemyPaint?: EnemyPaintKind;
      knightState?: SimUnit['knightState'];
      knightCooldown?: number;
      knightChargeTargetId?: number | null;
      knightDeathDenyLeft?: number;
      warlockSoulFireCdRem?: number;
      shamanAbilityPhase?: 'heal' | 'bolt';
      enemyCreatureType?: string;
      invulnerable?: boolean;
      collisionDisabled?: boolean;
      allySourceSlot?: number;
      bonusCrit?: number;
      /** 来自 allies.json / wowBookMonsters；缺省按步兵 */
      hitRadiusDesign?: number;
      heroId?: HeroId;
      /** 用书圆形代币立绘：`monsterUid` 或 `bossUid` */
      wowCirclePortraitUid?: string;
      /**
       * 非首领小怪：
       * - 书本 `wowMobId`：`enemySkillIds` 必传，且仅来自该行的 `skillIds`（缺省 = `[]`），**不回填** `ENEMY_DEFS[enemyPaint]`。
       * - 仅 `enemyPaint`（无书本 id）：`enemySkillIds` 未传时用 `ENEMY_DEFS[enemyPaint].skillIds`（与 `wowBookMonsters` 中同名 id 行一致）。
       */
      enemySkillIds?: string[];
      /**
       * 书本首领：`resolveWowBookBossCombat` 解析出的 `skillIds`（可空）；未传 `bossSkillIds` 时视为无额外技能。
       */
      bossSkillIds?: string[];
    } = {},
  ): SimUnit {
    const root = new Container();

    const hitRadiusPx = Math.round((opts.hitRadiusDesign ?? ENEMY_DEFS.grunt.hitRadius) * LAYOUT_SCALE);

    let aura: Graphics | undefined;
    if (side === 'ally' && opts.allyKind === 'knight') {
      aura = createKnightAura(hitRadiusPx);
      aura.position.set(0, -hitRadiusPx);
      aura.visible = false;
      root.addChild(aura);
    }

    let body: Container;
    let hpRingCur: Graphics | undefined;
    let hpRingLost: Graphics | undefined;
    let hpRingShield: Graphics | undefined;
    let tokenRing: SimUnit['tokenRing'];
    let tokenDisk: Container | undefined;
    let tokenLetter: Text | undefined;
    let tokenInnerR: number | undefined;

    if (side === 'ally' && opts.allyKind) {
      const parts = opts.heroId
        ? createBattleHeroToken(opts.heroId, opts.allyKind, hitRadiusPx)
        : createBattleAllyToken(opts.allyKind, hitRadiusPx);
      body = parts.root;
      hpRingCur = parts.ringCur;
      hpRingLost = parts.ringLost;
      hpRingShield = parts.ringShield;
      tokenDisk = parts.disk;
      tokenLetter = parts.letter;
      tokenInnerR = hitRadiusPx;
      tokenRing = {
        cx: parts.cx,
        cy: parts.cy,
        ringR: parts.ringR,
        thick: parts.thick,
        solidColor: BATTLE_ALLY_HP_RING_COLOR,
      };
    } else if (side === 'enemy') {
      const ep = opts.bossId ? this.bossEnemyPaint(opts.bossId) : opts.enemyPaint ?? 'grunt';
      const parts = createBattleEnemyToken(ep, hitRadiusPx, {
        wowCirclePortraitUid: opts.wowCirclePortraitUid,
      });
      body = parts.root;
      hpRingCur = parts.ringCur;
      hpRingLost = parts.ringLost;
      hpRingShield = parts.ringShield;
      tokenDisk = parts.disk;
      tokenLetter = parts.letter;
      tokenInnerR = hitRadiusPx;
      tokenRing = {
        cx: parts.cx,
        cy: parts.cy,
        ringR: parts.ringR,
        thick: parts.thick,
        solidColor: BATTLE_ENEMY_HP_RING_COLOR,
      };
    } else {
      const g = new Graphics();
      g.circle(0, -hitRadiusPx, hitRadiusPx).fill(0x94a3b8).stroke({
        width: 2,
        color: 0x0f172a,
        alpha: 0.5,
      });
      body = new Container();
      body.addChild(g);
    }
    root.addChild(body);

    if (opts.heroId) {
      const hd = getHeroDef(opts.heroId);
      if (hd) {
        const nameStr = heroDisplayNameWithSkillTier(hd.name, this.bondStacks[hd.allyClass]);
        const fy = unitFloatLabelOffsetYForInnerR(hitRadiusPx);
        const nameTag = new Text({
          text: nameStr,
          style: {
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
            fontSize: Math.max(10, Math.round(12 * LAYOUT_SCALE)),
            fill: heroQualityAccent(hd.quality),
            fontWeight: '700',
            stroke: { color: 0x0f172a, width: Math.max(1, Math.round(1 * LAYOUT_SCALE)) },
          },
        });
        nameTag.anchor.set(0.5, 1);
        nameTag.position.set(0, -fy - Math.round(2 * LAYOUT_SCALE));
        root.addChild(nameTag);
      }
    }

    let hitFlashOverlay: Graphics | undefined;
    if (tokenInnerR != null) {
      hitFlashOverlay = new Graphics();
      hitFlashOverlay.circle(0, -tokenInnerR, tokenInnerR * 0.94).fill({ color: 0xffffff, alpha: 0 });
      body.addChild(hitFlashOverlay);
    }

    const enemyPaint: EnemyPaintKind | undefined =
      side === 'enemy' ? (opts.bossId ? this.bossEnemyPaint(opts.bossId) : opts.enemyPaint ?? 'grunt') : undefined;

    const stanceIr = tokenInnerR ?? hitRadiusPx;
    const stanceX = x;
    const stanceY = y - stanceIr;

    let skillIds: string[] = [];
    if (side === 'ally' && opts.heroId && isMageArcaneMissilesHero(opts.heroId)) {
      skillIds = ['skill_hero_mage_arcane_missiles'];
    } else if (side === 'ally' && opts.heroId && isPriestMassShelterHero(opts.heroId)) {
      skillIds = ['skill_hero_priest_mass_shelter'];
    } else if (side === 'ally' && opts.heroId && isArcherSnareTrapHero(opts.heroId)) {
      skillIds = [SKILL_HERO_ARCHER_SNARE_TRAP];
    } else if (side === 'ally' && opts.heroId && isKnightHolySanctionHero(opts.heroId)) {
      skillIds = ['skill_hero_knight_holy_sanction'];
    } else if (side === 'enemy') {
      if (opts.bossId) {
        skillIds = opts.bossSkillIds !== undefined ? [...opts.bossSkillIds] : [];
      } else if (opts.enemyPaint) {
        const cls = opts.enemyPaint as EnemyClass;
        if (cls in ENEMY_DEFS) {
          skillIds =
            opts.enemySkillIds !== undefined ? [...opts.enemySkillIds] : [...ENEMY_DEFS[cls].skillIds];
        }
      }
    }

    let heroChannelDiskOverlay: Graphics | undefined;
    if (
      tokenDisk &&
      tokenInnerR != null &&
      ((opts.heroId && isMageArcaneMissilesHero(opts.heroId)) ||
        (side === 'enemy' && opts.bossId && skillIds.includes(RFC4_CH4_SKILL_MIND_LASH)))
    ) {
      heroChannelDiskOverlay = new Graphics();
      heroChannelDiskOverlay.visible = false;
      tokenDisk.addChild(heroChannelDiskOverlay);
    }

    const u: SimUnit = {
      unitId: this.allocUnitId(),
      side,
      x: stanceX,
      y: stanceY,
      hp,
      maxHp: hp,
      atk,
      attackInterval: attackSpeed,
      attackIntervalBase: attackSpeed,
      range,
      speed: moveSpeed * BATTLE_MOVE_SPEED_MULT,
      speedBase: moveSpeed * BATTLE_MOVE_SPEED_MULT,
      cd: 0,
      dead: false,
      hitRadiusPx,
      root,
      body,
      hpRingCur,
      hpRingLost,
      hpRingShield,
      tokenRing,
      tokenDisk,
      tokenLetter,
      tokenInnerR,
      hitFlashOverlay,
      heroChannelDiskOverlay,
      aura,
      bossId: opts.bossId,
      allyKind: opts.allyKind,
      enemyPaint,
      skillIds,
      archerLockedAttackTargetId: null,
      archerFocusStacks: 0,
      knightState: opts.knightState,
      knightCooldown: opts.knightCooldown,
      knightChargeTargetId: opts.knightChargeTargetId ?? null,
      knightDeathDenyLeft: opts.knightDeathDenyLeft,
      warlockSoulFireCdRem: opts.warlockSoulFireCdRem,
      shamanAbilityPhase: opts.shamanAbilityPhase,
      enemyCreatureType: opts.enemyCreatureType,
      invulnerable: opts.invulnerable,
      collisionDisabled: opts.collisionDisabled,
      allySourceSlot: opts.allySourceSlot,
      bonusCrit: opts.bonusCrit,
      enemyLeapCd:
        side === 'enemy' && skillIds.some((id) => (MINION_LEAP_SKILL_IDS as readonly string[]).includes(id))
          ? 1.2 + Math.random() * 1.8
          : undefined,
      shamanBloodlustCd:
        side === 'enemy' && skillIds.includes('skill_shaman_bloodlust')
          ? Math.random() * skillParamNumber(getSkillById('skill_shaman_bloodlust'), 0, 6) * (2.2 / 6)
          : undefined,
      dreadAssaultUsed: side === 'enemy' && skillIds.includes('skill_dread_warrior_assault') ? false : undefined,
      shadowBoltCdRem: side === 'enemy' && skillIds.includes('skill_shadow_bot') ? 0 : undefined,
      evilFrenzyCdRem: side === 'enemy' && skillIds.includes('skill_evil_strenth') ? 0 : undefined,
      evilFrenzyBuffT: side === 'enemy' && skillIds.includes('skill_evil_strenth') ? 0 : undefined,
      enemyHeavyStunCdRem: side === 'enemy' && skillIds.includes(SKILL_ENEMY_HEAVY_STUN) ? 0 : undefined,
      enemyBombCdRem:
        side === 'enemy' && skillIds.includes(SKILL_ELASTIC_BOMB)
          ? skillParamNumber(getSkillById(SKILL_ELASTIC_BOMB), 1, 3)
          : undefined,
      voidWalkCdRem: side === 'enemy' && skillIds.includes(SKILL_VOID_WALK) ? 0 : undefined,
      heroId: opts.heroId,
    };
    if (side === 'enemy' && skillIds.includes('skill_berserker')) {
      u.bossBerserkBaseAtk = atk;
      u.bossBerserkStage = 0;
      u.bossBerserkSparkAcc = 0;
    }
    if (side === 'enemy' && skillIds.includes('skill_rhahk_warcry')) {
      u.rhahkWarcryBaseAtk = atk;
      u.rhahkWarcryStacks = 0;
      if (tokenDisk && tokenInnerR != null) {
        const rim = new Graphics();
        rim.eventMode = 'none';
        tokenDisk.addChild(rim);
        u.rhahkWarcryRimG = rim;
        redrawRhahkWarcryBossRim(rim, tokenInnerR, 0);
      }
    }
    if (side === 'enemy' && opts.bossId) {
      if (skillIds.includes(RFC3_CH3_SKILL_GROUP_SHADOW)) {
        const d = getSkillById(RFC3_CH3_SKILL_GROUP_SHADOW);
        if (d) u.rfc3GroupShadowCdRem = skillParamNumber(d, 1, 3);
      }
      if (skillIds.includes(RFC3_CH3_SKILL_SUMMON)) {
        const d = getSkillById(RFC3_CH3_SKILL_SUMMON);
        if (d) u.rfc3SummonCdRem = skillParamNumber(d, 1, 10);
      }
      if (skillIds.includes(RFC3_CH3_SKILL_CORROSION)) {
        const d = getSkillById(RFC3_CH3_SKILL_CORROSION);
        if (d) u.rfc3CorrosionCdRem = skillParamNumber(d, 1, 0);
      }
      if (skillIds.includes(RFC4_CH4_SKILL_MIND_LASH)) {
        u.rfc4MindLashCdRem = 0;
      }
      if (skillIds.includes(RFC4_CH4_SKILL_SHADOW_BLINK)) {
        const d = getSkillById(RFC4_CH4_SKILL_SHADOW_BLINK);
        if (d) u.rfc4ShadowBlinkCdRem = skillParamNumber(d, 1, 5);
      }
    }
    this.syncUnitRootFromStance(u);
    if (opts.heroId) {
      u.root.scale.set(1.06);
    }
    return u;
  }

  private syncUnitHpRing(u: SimUnit): void {
    if (u.dead) return;
    const tr = u.tokenRing;
    const rc = u.hpRingCur;
    const rl = u.hpRingLost;
    const rs = u.hpRingShield;
    if (!tr || !rc || !rl) return;
    u.shield = Math.min(u.maxHp, Math.max(0, Math.floor(u.shield ?? 0)));
    const ratio = u.hp / Math.max(1, u.maxHp);
    const shRatio = (u.shield ?? 0) / Math.max(1, u.maxHp);
    const ringColor = (u.rhahkCleaveFlashT ?? 0) > 0 ? 0xffffff : tr.solidColor;
    if (rs) {
      redrawHpRingWithShield(rc, rl, rs, tr.cx, tr.cy, tr.ringR, tr.thick, ratio, shRatio, ringColor);
    } else {
      redrawHpRingPair(rc, rl, tr.cx, tr.cy, tr.ringR, tr.thick, ratio, ringColor);
    }
  }

  private tickRhahkUnitFx(u: SimUnit, dt: number): void {
    if ((u.rhahkCleaveFlashT ?? 0) > 0) u.rhahkCleaveFlashT = Math.max(0, (u.rhahkCleaveFlashT ?? 0) - dt);
    if ((u.rhahkSmashCrackT ?? 0) > 0) {
      u.rhahkSmashCrackT = Math.max(0, (u.rhahkSmashCrackT ?? 0) - dt);
      if (u.rhahkSmashCrackT <= 0 && u.rhahkSmashCrackGfx) {
        u.rhahkSmashCrackGfx.destroy();
        u.rhahkSmashCrackGfx = undefined;
      }
    }
  }

  private tickRhahkPresentationFx(dt: number): void {
    for (let i = this.druidBearSwipeFx.length - 1; i >= 0; i--) {
      const fx = this.druidBearSwipeFx[i]!;
      if (fx.tick(dt)) {
        fx.destroy({ children: true });
        this.druidBearSwipeFx.splice(i, 1);
      }
    }
    for (let i = this.rhahkCleaveFx.length - 1; i >= 0; i--) {
      const fx = this.rhahkCleaveFx[i]!;
      if (fx.tick(dt)) {
        fx.destroy({ children: true });
        this.rhahkCleaveFx.splice(i, 1);
      }
    }
    for (let i = this.rhahkWarcryFx.length - 1; i >= 0; i--) {
      const pres = this.rhahkWarcryFx[i]!;
      tickRhahkWarcryPresentation(pres, dt);
      if (isRhahkWarcryPresentationDone(pres)) {
        destroyRhahkWarcryPresentation(pres);
        this.rhahkWarcryFx.splice(i, 1);
      }
    }
  }

  private syncHitFlash(u: SimUnit, dt: number): void {
    const fo = u.hitFlashOverlay;
    if (!fo) return;
    if (!u.hitFlashT || u.hitFlashT <= 0) {
      fo.alpha = 0;
      return;
    }
    u.hitFlashT -= dt;
    const phase = Math.max(0, Math.min(1, u.hitFlashT / HIT_FLASH_DUR));
    fo.alpha = phase * 0.82;
  }

  /** 书本首领圆形立绘在 tokenDisk 上时，狂暴染色与 body 同步 */
  private syncEnemyTokenDiskTintForBerserk(u: SimUnit): void {
    const disk = u.tokenDisk;
    if (!disk || u.side !== 'enemy' || !u.bossId) return;
    if (this.unitHasSkill(u, 'skill_berserker') && (u.bossBerserkStage ?? 0) >= 1 && !u.dead) {
      disk.tint = u.body.tint;
    } else {
      disk.tint = 0xffffff;
    }
  }

  /** @returns 击退缓动是否仍在进行 */
  private tickKnockbackTween(u: SimUnit, dt: number): boolean {
    const kb = u.knockbackTween;
    if (!kb) return false;
    kb.elapsed += dt;
    const p = Math.min(1, kb.elapsed / kb.dur);
    const e = 1 - (1 - p) ** 3;
    u.x = kb.sx + (kb.tx - kb.sx) * e;
    u.y = kb.sy + (kb.ty - kb.sy) * e;
    this.syncUnitRootFromStance(u);
    if (p >= 1) {
      delete u.knockbackTween;
      return false;
    }
    return true;
  }

  /** 死亡飞出初速度：根节点抛物线平移（水平匀速 + 重力）；自转由 `body.origin` + `body.rotation` 实现 */
  private buildDeathLaunch(sx: number): {
    vx: number;
    vy: number;
    g: number;
    maxT: number;
  } {
    const s = LAYOUT_SCALE;
    const sign = sx >= GAME_WIDTH * 0.5 ? 1 : -1;
    const vx0 = sign * (360 + Math.random() * 420) * s + (Math.random() - 0.5) * 140 * s;
    const vy0 = -(1050 + Math.random() * 720) * s;
    const g = (1850 + Math.random() * 580) * s;
    const maxT = DEATH_FLIGHT_MAX_T + Math.random() * 0.85;
    return { vx: vx0, vy: vy0, g, maxT };
  }

  private tickDeathAnimations(dt: number): void {
    const boomRemove: SimUnit[] = [];
    for (const u of this.units) {
      if (u.dead && u.boomSkipDeathAnim && !u.deathAnim) boomRemove.push(u);
    }
    for (const u of boomRemove) {
      u.root.destroy({ children: true });
      const ix = this.units.indexOf(u);
      if (ix >= 0) this.units.splice(ix, 1);
    }

    const remove: SimUnit[] = [];
    const M = DEATH_EXIT_MARGIN;
    for (const u of this.units) {
      const da = u.deathAnim;
      if (!da) continue;
      da.elapsed += dt;
      da.trailTimer += dt;
      const ir = u.tokenInnerR ?? u.hitRadiusPx;
      while (da.trailTimer >= 0.019) {
        da.trailTimer -= 0.019;
        this.deathTrailSparks.push(spawnDeathTrailSpark(this.fxLayer, da.wx, da.wy - ir));
      }
      da.vy += da.g * dt;
      da.wx += da.vx * dt;
      da.wy += da.vy * dt;
      u.root.position.set(da.wx, da.wy);
      u.body.rotation += da.spin * dt;
      const off =
        da.wx < -M || da.wx > GAME_WIDTH + M || da.wy < -M || da.wy > GAME_HEIGHT + M;
      if (!off) {
        u.root.alpha = Math.max(0.62, 1 - da.elapsed * 0.065);
      } else {
        u.root.alpha = Math.max(0, u.root.alpha - dt * 3.4);
      }
      if (off || da.elapsed >= da.maxT) {
        u.root.destroy({ children: true });
        remove.push(u);
      }
    }
    for (const u of remove) {
      const ix = this.units.indexOf(u);
      if (ix >= 0) this.units.splice(ix, 1);
    }
  }

  private leapBacklineCdBase(u: SimUnit): number {
    if (this.unitHasSkill(u, 'skill_batrider_leap')) {
      return skillParamNumber(getSkillById('skill_batrider_leap'), 0, 7.2);
    }
    if (this.unitHasSkill(u, 'skill_raider_leap')) {
      return skillParamNumber(getSkillById('skill_raider_leap'), 1, 9);
    }
    return skillParamNumber(getSkillById('skill_beserker_leap'), 0, 10.5);
  }

  private leapBacklineNyOffDesign(u: SimUnit): number {
    if (this.unitHasSkill(u, 'skill_batrider_leap')) return LEAP_NYOFF_DESIGN_BATRIDER;
    if (this.unitHasSkill(u, 'skill_raider_leap')) return LEAP_NYOFF_DESIGN_RAIDER;
    return LEAP_NYOFF_DESIGN_BESERKER;
  }

  /**
   * 狼骑兵 / 狂战士 / 蝙蝠骑士：冷却结束跃迁至「距该刺客当前位置最远」的存活我方单位附近（视为后排）。
   */
  private endDefiasBandageChannel(u: SimUnit, reason: string): void {
    u.defiasBandageChannel = undefined;
    u.defiasBandageUsed = true;
    this.logBattleSkill(SKILL_DEFIAS_BANDAGE, u, reason);
  }

  private defiasBandageRetreatStep(u: SimUnit, dt: number): void {
    const ir = this.unitTokenRootYOffsetPx(u);
    const padX = Math.round(38 * LAYOUT_SCALE);
    const yLo = Math.round(192 * LAYOUT_SCALE) - ir;
    const yHi = Math.round(1108 * LAYOUT_SCALE) - ir;
    const dL = u.x - padX;
    const dR = GAME_WIDTH - padX - u.x;
    const dT = u.y - yLo;
    const dB = yHi - u.y;
    const minD = Math.min(dL, dR, dT, dB);
    const stop = Math.max(8, Math.round(14 * LAYOUT_SCALE));
    if (minD <= stop) return;

    let tx = u.x;
    let ty = u.y;
    if (minD === dL) tx = padX + stop;
    else if (minD === dR) tx = GAME_WIDTH - padX - stop;
    else if (minD === dT) ty = yLo + stop;
    else ty = yHi - stop;

    const dx = tx - u.x;
    const dy = ty - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = u.speed * dt * 0.9;
    const move = Math.min(step, dist);
    u.x += (dx / dist) * move;
    u.y += (dy / dist) * move;
    this.syncUnitRootFromStance(u);
  }

  private tickDefiasBandageHeal(u: SimUnit, ch: { healAcc: number }, pctPerSec: number, dt: number): void {
    ch.healAcc += dt;
    if (ch.healAcc < 1) return;
    ch.healAcc -= 1;
    const heal = Math.max(1, Math.round(u.maxHp * (pctPerSec / 100)));
    u.hp = Math.min(u.maxHp, u.hp + heal);
    this.syncUnitHpRing(u);
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, u.x, this.floatAnchorY(u) - 28, `+${heal}`, 'heal'),
    );
    if (Math.random() < 0.35) {
      this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 32, 0x86efac, 0.38));
    }
  }

  /** 迪菲亚成员补给：低血引导撤边打绷带；返回 true 时本帧不普攻/追击 */
  private tickDefiasBandage(u: SimUnit, dt: number): boolean {
    if (u.side !== 'enemy' || u.dead || !this.unitHasSkill(u, SKILL_DEFIAS_BANDAGE)) return false;
    const def = getSkillById(SKILL_DEFIAS_BANDAGE);
    if (!def) return false;

    const ch = u.defiasBandageChannel;
    if (ch) {
      if ((u.stunT ?? 0) > 0) {
        this.endDefiasBandageChannel(u, 'bandage_interrupt_stun');
        return false;
      }
      const dur = skillParamNumber(def, 2, 20);
      const pct = skillParamNumber(def, 1, 3);
      ch.t += dt;
      this.tickDefiasBandageHeal(u, ch, pct, dt);
      this.defiasBandageRetreatStep(u, dt);
      if (ch.t >= dur) {
        this.endDefiasBandageChannel(u, 'bandage_complete');
      }
      return true;
    }

    if (u.defiasBandageUsed) return false;
    const gate = skillParamNumber(def, 0, 40) / 100;
    if (u.hp / Math.max(1, u.maxHp) > gate) return false;

    u.defiasBandageChannel = { t: 0, healAcc: 0 };
    u.stunT = 0;
    this.floatWords.push(
      spawnFloatNumber(
        this.floatLayer,
        u.x,
        this.floatAnchorY(u) - Math.round(44 * LAYOUT_SCALE),
        '打绷带',
        'buff',
      ),
    );
    this.logBattleSkill(SKILL_DEFIAS_BANDAGE, u, 'bandage_start');
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 40, 0xa7f3d0, 0.45));
    return true;
  }

  private tickEnemyBacklineLeap(u: SimUnit, dt: number): boolean {
    const leapIds = MINION_LEAP_SKILL_IDS as readonly string[];
    if (!u.skillIds.some((id) => leapIds.includes(id))) return false;

    u.enemyLeapCd = (u.enemyLeapCd ?? 2) - dt;
    if ((u.enemyLeapCd ?? 0) > 0) return false;

    const allies = this.alive('ally');
    if (!allies.length) {
      u.enemyLeapCd = 2;
      return false;
    }

    let anchor = allies[0]!;
    let bestDist = -1;
    for (const a of allies) {
      const d = Math.hypot(a.x - u.x, a.y - u.y);
      if (d > bestDist) {
        bestDist = d;
        anchor = a;
      }
    }

    const arenaL = Math.round(44 * LAYOUT_SCALE);
    const arenaR = GAME_WIDTH - arenaL;
    const arenaT = Math.round(195 * LAYOUT_SCALE) + BATTLE_PLAYFIELD_Y_OFFSET_PX;
    const arenaB = Math.round(1100 * LAYOUT_SCALE) + BATTLE_PLAYFIELD_Y_OFFSET_PX;

    const jx = (Math.random() - 0.5) * Math.round(150 * LAYOUT_SCALE);
    const nx = Math.max(arenaL, Math.min(arenaR, anchor.x + jx));
    const nyOff = this.leapBacklineNyOffDesign(u);
    const ny = Math.max(
      arenaT,
      Math.min(arenaB, anchor.y + this.unitTokenRootYOffsetPx(anchor) + nyOff * LAYOUT_SCALE),
    );

    const ox = u.x;
    const oy = u.y;
    u.x = nx;
    u.y = ny;
    this.syncUnitRootFromStance(u);

    this.ringFx.push(spawnRingPulse(this.fxLayer, ox, oy, 46, 0xf97316, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, nx, u.y, 58, 0xfbbf24, 0.52));

    if (this.unitHasSkill(u, 'skill_raider_leap')) {
      const rd = getSkillById('skill_raider_leap');
      u.raiderLeapBuffT = skillParamNumber(rd, 0, 5);
      this.ringFx.push(spawnRingPulse(this.fxLayer, nx, u.y, 72, 0xfde047, 0.48));
    }

    if (this.unitHasSkill(u, 'skill_batrider_leap')) {
      const bat = getSkillById('skill_batrider_leap');
      const rAo = skillParamDesignPx(bat, 1, 50);
      const pct = skillParamNumber(bat, 2, 50) / 100;
      const dmgEach = Math.max(1, Math.round(u.atk * pct));
      for (const a of this.alive('ally')) {
        const reach = rAo + this.hitRadius(a);
        if (Math.hypot(a.x - nx, a.y - ny) <= reach) {
          this.applyDamage(a, dmgEach, { attacker: u, damageTag: 'magic' });
        }
      }
      this.ringFx.push(spawnRingPulse(this.fxLayer, nx, u.y, Math.max(40, Math.round(rAo * 0.9)), 0xa855f7, 0.55));
    }

    const baseCd = this.leapBacklineCdBase(u);
    u.enemyLeapCd = baseCd + Math.random() * 2.2;
    const leapSkillId =
      MINION_LEAP_SKILL_IDS.find((id) => u.skillIds.includes(id)) ?? 'skill_unknown_leap';
    this.logBattleSkill(leapSkillId, u, `→(${Math.round(nx)},${Math.round(ny)})`);
    return true;
  }

  private unitHasSkill(u: SimUnit, skillId: string): boolean {
    return u.skillIds.length > 0 && u.skillIds.includes(skillId);
  }

  private unitDebugLabel(u: SimUnit): string {
    if (u.bossId) return `boss:${u.bossId}#${u.unitId}`;
    if (u.heroId) return `hero:${u.heroId}#${u.unitId}`;
    if (u.allyKind) return `ally:${u.allyKind}#${u.unitId}`;
    if (u.enemyPaint) return `enemy:${u.enemyPaint}#${u.unitId}`;
    return `${u.side}#${u.unitId}`;
  }

  /**
   * 与 `logDevBattleTest` 同 sink：写入 `RunState.devBattleTestLog`（首领/技能测试页右下面板等）。
   * 行前缀 `[battle-skill]`；表外事件用 `nameCn` + 任意 `eventId`。
   */
  private logBattleEvent(nameCn: string, eventId: string, caster: SimUnit, detail?: string): void {
    const extra = detail ? ` | ${detail}` : '';
    this.logDevBattleTest(
      `[battle-skill] t=${this.elapsed.toFixed(2)}s ${nameCn} (${eventId}) caster=${this.unitDebugLabel(caster)}${extra}`,
    );
  }

  /** `skillId` 须存在于 `skills.json`（名称取 `nameCn`）；输出见 `logBattleEvent`。 */
  private logBattleSkill(skillId: string, caster: SimUnit, detail?: string): void {
    const sk = getSkillById(skillId);
    this.logBattleEvent(sk?.nameCn ?? skillId, skillId, caster, detail);
  }

  /** 在施法者头顶飘技能中文名（与嗜血术等一致，入 `floatWords` 由 tick 驱动） */
  private floatBattleSkillName(skillId: string, caster: SimUnit): void {
    const sk = getSkillById(skillId);
    const label = (sk?.nameCn ?? skillId).trim() || skillId;
    const yOff = Math.round(44 * LAYOUT_SCALE);
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, caster.x, this.floatAnchorY(caster) - yOff, label, 'buff'),
    );
  }

  /** 对战士/法师/射手/骑士脆弱：乘区叠乘；含英雄（同 allyKind）。 */
  private enemyClassWeaknessMult(enemy: SimUnit, allyAttacker: SimUnit): number {
    const k = allyAttacker.allyKind;
    if (!k) return 1;
    let m = 1;
    const pairs: Array<[string, AllyClass]> = [
      ['skill_warrior_weak', 'warrior'],
      ['skill_mage_weak', 'mage'],
      ['skill_archer_weak', 'archer'],
      ['skill_knight_weak', 'knight'],
    ];
    for (const [sid, cls] of pairs) {
      if (k !== cls || !this.unitHasSkill(enemy, sid)) continue;
      const sk = getSkillById(sid);
      m *= 1 + skillParamNumber(sk, 0, 50) / 100;
    }
    return m;
  }

  private tickEnemyEvilFrenzy(u: SimUnit, dt: number): void {
    if (!this.unitHasSkill(u, 'skill_evil_strenth')) return;
    const def = getSkillById('skill_evil_strenth');
    if (!def) return;
    u.evilFrenzyBuffT = Math.max(0, (u.evilFrenzyBuffT ?? 0) - dt);
    u.evilFrenzyCdRem = Math.max(0, (u.evilFrenzyCdRem ?? 0) - dt);
    if ((u.evilFrenzyCdRem ?? 0) > 0) return;
    const buffSec = skillParamNumber(def, 1, 6);
    const cdSec = skillParamNumber(def, 0, 10);
    u.evilFrenzyBuffT = buffSec;
    u.evilFrenzyCdRem = cdSec;
    this.logBattleSkill('skill_evil_strenth', u, `buffSec=${buffSec.toFixed(1)} cdSec=${cdSec.toFixed(1)}`);
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 52, 0xdc2626, 0.48));
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 78, 0xf87171, 0.4));
  }

  private tickEnemyShadowBoltTry(u: SimUnit, dt: number): void {
    if (!this.unitHasSkill(u, 'skill_shadow_bot')) return;
    const def = getSkillById('skill_shadow_bot');
    if (!def) return;
    const period = skillParamNumber(def, 0, 10);
    u.shadowBoltCdRem = Math.max(0, (u.shadowBoltCdRem ?? 0) - dt);
    if (this.enemyIsHardControlled(u)) return;
    if ((u.shadowBoltCdRem ?? 0) > 0) return;
    const tgt = this.nearestAlly(u);
    if (!tgt) return;
    const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    if (dist > this.effectiveSkillRangeTo(u, tgt)) return;
    u.shadowBoltCdRem = period;
    this.logBattleSkill('skill_shadow_bot', u, `→ ${this.unitDebugLabel(tgt)}`);
    const uid = u.unitId;
    const tid = tgt.unitId;
    const pct = skillParamNumber(def, 1, 300) / 100;
    this.queueProjectile(
      u,
      tid,
      () => {
        const a = this.units.find((x) => x.unitId === uid && !x.dead);
        const t = this.byId(tid);
        if (!a || !t) return;
        const dps = Math.max(1, Math.round(a.atk * pct));
        this.applyDamage(t, dps, { attacker: a, damageTag: 'magic' });
        const tx = t.x;
        const ty = t.y;
        this.ringFx.push(spawnRingPulse(this.fxLayer, tx, t.y, 22, 0x581c87, 0.36));
        this.ringFx.push(spawnRingPulse(this.fxLayer, tx, t.y, 48, 0x7e22ce, 0.42));
        this.ringFx.push(spawnRingPulse(this.fxLayer, tx, t.y, 72, 0xc4b5fd, 0.38));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, tx, ty));
      },
      { style: 'enemy_shadow_bolt', speedMul: 0.88, skillId: 'skill_shadow_bot' },
    );
  }

  /** skill_defias_fever：附近敌方增伤；带 skill_defias 的受益方用 params[1]；多光环取最高一档 */
  private enemyDefiasFeverDamageMult(attacker: SimUnit): number {
    if (attacker.side !== 'enemy' || attacker.dead) return 1;
    const def = getSkillById(SKILL_DEFIAS_FEVER);
    if (!def) return 1;
    const auraR = Math.round(DEFIAS_FEVER_AURA_RADIUS_DESIGN * LAYOUT_SCALE);
    const pctNormal = skillParamNumber(def, 0, 15);
    const pctDefias = skillParamNumber(def, 1, 30);
    let bestPct = 0;
    for (const carrier of this.alive('enemy')) {
      if (carrier.unitId === attacker.unitId) continue;
      if (!this.unitHasSkill(carrier, SKILL_DEFIAS_FEVER)) continue;
      const dist = Math.hypot(attacker.x - carrier.x, attacker.y - carrier.y);
      if (dist > auraR + this.hitRadius(attacker) + this.hitRadius(carrier)) continue;
      const pct = this.unitHasSkill(attacker, SKILL_DEFIAS_BANDAGE) ? pctDefias : pctNormal;
      bestPct = Math.max(bestPct, pct);
    }
    return 1 + bestPct / 100;
  }

  private tickEnemyHeavyStunTry(u: SimUnit, dt: number): void {
    if (!this.unitHasSkill(u, SKILL_ENEMY_HEAVY_STUN)) return;
    const def = getSkillById(SKILL_ENEMY_HEAVY_STUN);
    if (!def) return;
    u.enemyHeavyStunCdRem = Math.max(0, (u.enemyHeavyStunCdRem ?? 0) - dt);
    if (this.enemyIsHardControlled(u)) return;
    if ((u.enemyHeavyStunCdRem ?? 0) > 0) return;
    const tgt = this.nearestAlly(u);
    if (!tgt) return;
    const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    if (dist > this.effectiveSkillRangeTo(u, tgt)) return;
    const period = skillParamNumber(def, 0, 6);
    u.enemyHeavyStunCdRem = period;
    const coeff = skillParamNumber(def, 1, 200) / 100;
    const stunSec = skillParamNumber(def, 2, 3);
    const dmg = Math.max(1, Math.round(u.atk * coeff));
    this.applyDamage(tgt, dmg, { attacker: u });
    this.applyAllyStun(tgt, stunSec);
    this.floatBattleSkillName(SKILL_ENEMY_HEAVY_STUN, u);
    this.logBattleSkill(SKILL_ENEMY_HEAVY_STUN, u, `→ ${this.unitDebugLabel(tgt)} stun=${stunSec.toFixed(1)}s`);
    this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, 28, 0xfbbf24, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, 56, 0xf59e0b, 0.38));
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, tgt.x, tgt.y));
  }

  private tickEnemyElasticBombTry(u: SimUnit, dt: number): void {
    if (!this.unitHasSkill(u, SKILL_ELASTIC_BOMB)) return;
    const def = getSkillById(SKILL_ELASTIC_BOMB);
    if (!def) return;
    u.enemyBombCdRem = Math.max(0, (u.enemyBombCdRem ?? 0) - dt);
    if (this.enemyIsHardControlled(u)) return;
    if ((u.enemyBombCdRem ?? 0) > 0) return;
    const allies = this.alive('ally');
    if (!allies.length) return;
    const tgt = allies[Math.floor(Math.random() * allies.length)]!;
    u.enemyBombCdRem = skillParamNumber(def, 0, 12);
    this.castEnemyElasticBomb(u, tgt);
  }

  private castEnemyElasticBomb(attacker: SimUnit, target: SimUnit): void {
    const def = getSkillById(SKILL_ELASTIC_BOMB);
    if (!def) return;
    this.floatBattleSkillName(SKILL_ELASTIC_BOMB, attacker);
    const uid = attacker.unitId;
    const tid = target.unitId;
    const splashR = skillParamDesignPx(def, 2, 100);
    const coeff = skillParamNumber(def, 3, 35) / 100;
    const kbDist = skillParamDesignPx(def, 4, 300);
    const m = this.projectileMuzzleXY(attacker, target);
    const gfx = buildElasticBombGraphic();
    gfx.position.set(m.x, m.y);
    this.fxLayer.addChild(gfx);
    const onBombHit = () => {
      const a = this.byId(uid);
      const primary = this.byId(tid);
      if (!a || a.dead) return;
      const cx = primary?.x ?? a.x;
      const cy = primary?.y ?? a.y;
      const inSplash: SimUnit[] = [];
      for (const ally of this.alive('ally')) {
        if (Math.hypot(ally.x - cx, ally.y - cy) > splashR + ally.hitRadiusPx) continue;
        inSplash.push(ally);
      }
      for (const ally of inSplash) {
        this.knockbackAllyFromPoint(ally, cx, cy, kbDist, true);
      }
      this.applyUnitCollisionSeparation(4);
      const dmg = Math.max(1, Math.round(a.atk * coeff));
      for (const ally of inSplash) {
        this.applyDamage(ally, dmg, { attacker: a, damageTag: 'magic' });
      }
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, cx, cy));
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, splashR, 0x7f1d1d, 0.5));
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, Math.round(splashR * 0.55), 0xef4444, 0.42));
    };
    this.bangBombProjectiles.push({
      gfx,
      x: m.x,
      y: m.y,
      speed: Math.round(680 * LAYOUT_SCALE),
      targetId: tid,
      attackerId: uid,
      life: 0,
      onHit: onBombHit,
      skillId: SKILL_ELASTIC_BOMB,
    });
    playSkillLaunchSfx(SKILL_ELASTIC_BOMB);
    this.logBattleSkill(SKILL_ELASTIC_BOMB, attacker, `→ ${this.unitDebugLabel(target)}`);
  }

  private voidWalkLandingXY(u: SimUnit, tgt: SimUnit): { x: number; y: number } {
    const dx = tgt.x - u.x;
    const dy = tgt.y - u.y;
    const d = Math.hypot(dx, dy) || 1;
    const landDist = this.hitRadius(u) + tgt.hitRadiusPx + Math.round(10 * LAYOUT_SCALE);
    const raw = { x: tgt.x - (dx / d) * landDist, y: tgt.y - (dy / d) * landDist };
    return this.clampBattleSpawnXY(raw.x, raw.y);
  }

  /** @returns 本帧是否由虚空行走接管（突进中或刚发动） */
  private tickEnemyVoidWalk(u: SimUnit, dt: number): boolean {
    if (!this.unitHasSkill(u, SKILL_VOID_WALK)) return false;
    const def = getSkillById(SKILL_VOID_WALK);
    if (!def) return false;

    const dash = u.voidWalkDash;
    if (dash) {
      u.collisionDisabled = true;
      const prevX = u.x;
      const prevY = u.y;
      const dx = dash.tx - u.x;
      const dy = dash.ty - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const stepLen = u.speed * dt * VOID_WALK_SPEED_MULT;
      dash.trailAcc += dt;
      while (dash.trailAcc >= VOID_WALK_AFTERIMAGE_INTERVAL_SEC) {
        dash.trailAcc -= VOID_WALK_AFTERIMAGE_INTERVAL_SEC;
        this.voidWalkAfterimages.push(
          spawnVoidWalkAfterimage(this.fxLayer, u.x, u.y, u.hitRadiusPx * 0.95),
        );
      }
      if (dist <= stepLen + Math.round(6 * LAYOUT_SCALE)) {
        u.x = dash.tx;
        u.y = dash.ty;
        this.syncUnitRootFromStance(u);
        this.voidWalkAfterimages.push(
          spawnVoidWalkAfterimage(this.fxLayer, u.x, u.y, u.hitRadiusPx),
        );
        const tgt = this.byId(dash.targetId);
        if (tgt && !tgt.dead) {
          const dmg = Math.max(1, Math.round(u.atk * dash.dmgCoeff));
          this.applyDamage(tgt, dmg, { attacker: u, damageTag: 'magic' });
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, tgt.x, tgt.y));
        }
        u.voidWalkDash = undefined;
        u.collisionDisabled = false;
        u.body.alpha = 1;
        u.voidWalkCdRem = skillParamNumber(def, 0, 8);
        this.logBattleSkill(SKILL_VOID_WALK, u, tgt ? `命中 #${tgt.unitId}` : '到达');
      } else {
        u.x += (dx / dist) * stepLen;
        u.y += (dy / dist) * stepLen;
        this.syncUnitRootFromStance(u);
        if (Math.hypot(u.x - dash.lastX, u.y - dash.lastY) > Math.round(4 * LAYOUT_SCALE)) {
          this.voidWalkAfterimages.push(
            spawnVoidWalkTrailSegment(this.fxLayer, dash.lastX, dash.lastY, u.x, u.y),
          );
          dash.lastX = u.x;
          dash.lastY = u.y;
        }
      }
      if (Math.hypot(u.x - prevX, u.y - prevY) > 1) {
        u.body.alpha = 0.72 + 0.28 * Math.sin(this.elapsed * 22);
      }
      return true;
    }

    u.body.alpha = 1;
    u.collisionDisabled = false;
    u.voidWalkCdRem = Math.max(0, (u.voidWalkCdRem ?? 0) - dt);
    if (this.enemyIsHardControlled(u)) return false;
    if ((u.voidWalkCdRem ?? 0) > 0) return false;

    const ranged = this.alive('ally').filter((a) => this.isRangedAttacker(a));
    if (!ranged.length) return false;
    const tgt = ranged[Math.floor(Math.random() * ranged.length)]!;
    const land = this.voidWalkLandingXY(u, tgt);
    const coeff = skillParamNumber(def, 1, 200) / 100;
    u.voidWalkDash = {
      targetId: tgt.unitId,
      tx: land.x,
      ty: land.y,
      dmgCoeff: coeff,
      trailAcc: 0,
      lastX: u.x,
      lastY: u.y,
    };
    u.collisionDisabled = true;
    this.floatBattleSkillName(SKILL_VOID_WALK, u);
    this.voidWalkAfterimages.push(spawnVoidWalkAfterimage(this.fxLayer, u.x, u.y, u.hitRadiusPx));
    this.voidWalkAfterimages.push(
      spawnVoidWalkTrailSegment(this.fxLayer, u.x, u.y, land.x, land.y),
    );
    playSkillLaunchSfx(SKILL_VOID_WALK);
    this.logBattleSkill(SKILL_VOID_WALK, u, `→ ${this.unitDebugLabel(tgt)}`);
    return true;
  }

  /** 怒焰裂谷第三关首领专属：群体暗影剑 / 召唤术 / 腐蚀术（与 skill_shadow_bot 等逻辑分离） */
  private tickRfc3Ch3BossExclusiveSkills(u: SimUnit, dt: number): void {
    if (!u.bossId || u.dead) return;
    if (u.rfc4MindLashChannel) return;
    if (
      !u.skillIds.includes(RFC3_CH3_SKILL_GROUP_SHADOW) &&
      !u.skillIds.includes(RFC3_CH3_SKILL_SUMMON) &&
      !u.skillIds.includes(RFC3_CH3_SKILL_CORROSION)
    ) {
      return;
    }
    const canCast = (u.stunT ?? 0) <= 0;

    if (u.skillIds.includes(RFC3_CH3_SKILL_GROUP_SHADOW)) {
      const def = getSkillById(RFC3_CH3_SKILL_GROUP_SHADOW);
      if (def) {
        u.rfc3GroupShadowCdRem = Math.max(0, (u.rfc3GroupShadowCdRem ?? 0) - dt);
        if (canCast && (u.rfc3GroupShadowCdRem ?? 0) <= 0) {
          this.castRfc3GroupShadowSword(u, def);
          u.rfc3GroupShadowCdRem = skillParamNumber(def, 0, 4);
        }
      }
    }
    if (u.skillIds.includes(RFC3_CH3_SKILL_SUMMON)) {
      const def = getSkillById(RFC3_CH3_SKILL_SUMMON);
      if (def) {
        u.rfc3SummonCdRem = Math.max(0, (u.rfc3SummonCdRem ?? 0) - dt);
        if (canCast && (u.rfc3SummonCdRem ?? 0) <= 0) {
          this.castRfc3SummonRite(u, def);
          u.rfc3SummonCdRem = skillParamNumber(def, 0, 24);
        }
      }
    }
    if (u.skillIds.includes(RFC3_CH3_SKILL_CORROSION)) {
      const def = getSkillById(RFC3_CH3_SKILL_CORROSION);
      if (def) {
        u.rfc3CorrosionCdRem = Math.max(0, (u.rfc3CorrosionCdRem ?? 0) - dt);
        if (canCast && (u.rfc3CorrosionCdRem ?? 0) <= 0) {
          this.tryCastRfc3Corrosion(u, def);
          u.rfc3CorrosionCdRem = skillParamNumber(def, 0, 3);
        }
      }
    }
  }

  /** 怒焰裂谷第四关巴扎兰：群体暗影箭 / 精神鞭笞选目标无视射程（全场存活我方） */
  private rfc4Ch4BossSkillsIgnoreSkillRange(u: SimUnit): boolean {
    return (
      u.skillIds.includes(RFC4_CH4_SKILL_MIND_LASH) || u.skillIds.includes(RFC4_CH4_SKILL_SHADOW_BLINK)
    );
  }

  private castRfc3GroupShadowSword(u: SimUnit, def: SkillDef): void {
    this.floatBattleSkillName(RFC3_CH3_SKILL_GROUP_SHADOW, u);
    const maxT = Math.max(1, Math.floor(skillParamNumber(def, 2, 6)));
    const pct = skillParamNumber(def, 3, 100) / 100;
    const ignoreRange = this.rfc4Ch4BossSkillsIgnoreSkillRange(u);
    const pool = ignoreRange
      ? this.alive('ally')
      : this.alive('ally').filter((a) => {
          const dist = Math.hypot(a.x - u.x, a.y - u.y);
          return dist <= this.effectiveSkillRangeTo(u, a);
        });
    if (!pool.length) {
      this.logBattleSkill(RFC3_CH3_SKILL_GROUP_SHADOW, u, 'no_targets_in_range');
      return;
    }
    const picks = [...pool];
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = picks[i]!;
      picks[i] = picks[j]!;
      picks[j] = t;
    }
    const n = Math.min(maxT, picks.length);
    this.logBattleSkill(RFC3_CH3_SKILL_GROUP_SHADOW, u, `targets=${n}`);
    const uid = u.unitId;
    for (let i = 0; i < n; i++) {
      const tgt = picks[i]!;
      const tid = tgt.unitId;
      this.queueProjectile(
        u,
        tid,
        () => {
          const caster = this.byId(uid);
          const t = this.byId(tid);
          if (!caster || !t) return;
          const dmg = Math.max(1, Math.round(caster.atk * pct));
          this.applyDamage(t, dmg, { attacker: caster, damageTag: 'magic' });
          const tx = t.x;
          const ty = t.y;
          this.ringFx.push(spawnRingPulse(this.fxLayer, tx, ty, 22, 0x581c87, 0.36));
          this.ringFx.push(spawnRingPulse(this.fxLayer, tx, ty, 48, 0x7e22ce, 0.42));
          this.ringFx.push(spawnRingPulse(this.fxLayer, tx, ty, 72, 0xc4b5fd, 0.38));
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, tx, ty));
        },
        {
          style: 'enemy_shadow_bolt',
          speedMul: 0.88,
          volleyIndex: i,
          volleyCount: n,
          skillId: RFC3_CH3_SKILL_GROUP_SHADOW,
        },
      );
    }
  }

  private spawnChapterMobSummonWave(cx: number, cy: number, count: number, groupTag: number): void {
    const pool = mobIdsForBookChapter(this.run.bookChapterId);
    if (!pool.length) return;
    const chapter = this.meta.chapter;
    const ri = legacyProgressRoundIndex(this.run.bookChapterId, this.run.currentRoundIndex);
    const bookM = this.run.bookChapterStrengthMult();
    const progMax = getNodeProgressMaxForBookChapter(this.run.bookChapterId);
    let addMax = 0;
    let addCur = 0;
    for (let i = 0; i < count; i++) {
      const id = pool[Math.floor(Math.random() * pool.length)]!;
      const mob = getWowMob(id);
      if (!mob) continue;
      const paint = wowMobEnemyPaint(mob) as EnemyPaintKind;
      const baseAtk = enemyCombatBaseAtkFromTable(mob.baseAtk, mob.range);
      const hp = scaledEnemyHp(chapter, ri, mob.baseMaxHp, bookM, progMax);
      const atk = scaledEnemyAtk(chapter, ri, baseAtk, bookM, progMax);
      const sc = this.scatterOffset(ri * 131 + i * 17 + groupTag * 59 + id.length * 3);
      const rawX = cx + sc.jx * 0.4 + (i - (count - 1) / 2) * Math.round(48 * LAYOUT_SCALE);
      const rawY = cy + sc.jy * 0.34 + groupTag * Math.round(56 * LAYOUT_SCALE);
      const p = this.clampBattleSpawnXY(rawX, rawY);
      const unit = this.makeUnit('enemy', p.x, p.y, hp, atk, mob.attackSpeed, mob.range, mob.moveSpeed, mob.nameCn, {
        enemyPaint: paint,
        hitRadiusDesign: mob.hitRadius,
        wowCirclePortraitUid: mob.monsterUid,
        enemySkillIds: [...(mob.skillIds ?? [])],
      });
      this.units.push(unit);
      this.unitLayer.addChild(unit.root);
      addMax += unit.maxHp;
      addCur += unit.hp;
    }
    this.initialEnemyHp += addMax;
    this.currentEnemyHp += addCur;
  }

  private castMobPoolSummon(caster: SimUnit, skillId: string): void {
    const def = getSkillById(skillId);
    if (!def) return;
    this.floatBattleSkillName(skillId, caster);
    const groups = Math.max(1, Math.floor(skillParamNumber(def, 3, 2)));
    const per = Math.max(1, Math.floor(skillParamNumber(def, 2, 3)));
    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const centerX = GAME_WIDTH * 0.5;
    const centerY = arenaTop + arenaH * 0.46;
    this.logBattleSkill(skillId, caster, `groups=${groups} each=${per}`);
    for (let g = 0; g < groups; g++) {
      const gx = centerX + (g === 0 ? -Math.round(72 * LAYOUT_SCALE) : Math.round(72 * LAYOUT_SCALE));
      this.spawnChapterMobSummonWave(gx, centerY, per, g);
      this.ringFx.push(spawnRingPulse(this.fxLayer, gx, centerY, 40, 0x94a3b8, 0.45));
      this.ringFx.push(spawnRingPulse(this.fxLayer, gx, centerY, 68, 0x64748b, 0.32));
    }
    this.applyUnitCollisionSeparation(3);
    this.triggerBattleScreenShake(0.14, Math.round(9 * LAYOUT_SCALE));
  }

  private castRfc3SummonRite(u: SimUnit, _def: SkillDef): void {
    this.castMobPoolSummon(u, RFC3_CH3_SKILL_SUMMON);
  }

  private castBossMobPoolSummon(boss: SimUnit): void {
    this.castMobPoolSummon(boss, SKILL_SUMMON_MOB_POOL);
    this.bossPutSkillOnCooldown(boss, SKILL_SUMMON_MOB_POOL);
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private tryCastRfc3Corrosion(u: SimUnit, def: SkillDef): void {
    this.floatBattleSkillName(RFC3_CH3_SKILL_CORROSION, u);
    const dur = skillParamNumber(def, 3, 24);
    const pctPerSec = skillParamNumber(def, 2, 50) / 100;
    const pool = this.alive('ally').filter((a) => (a.rfc3CorrosionRemainSec ?? 0) <= 0);
    if (!pool.length) {
      this.logBattleSkill(RFC3_CH3_SKILL_CORROSION, u, 'no_uneroded_target');
      return;
    }
    const tgt = pool[Math.floor(Math.random() * pool.length)]!;
    const dps = Math.max(1, Math.round(u.atk * pctPerSec));
    tgt.rfc3CorrosionRemainSec = dur;
    tgt.rfc3CorrosionDps = dps;
    tgt.rfc3CorrosionFrac = 0;
    this.logBattleSkill(RFC3_CH3_SKILL_CORROSION, u, `→ ${this.unitDebugLabel(tgt)} dps=${dps} dur=${dur}`);
    this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, 28, 0x22c55e, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, 52, 0x4ade80, 0.42));
  }

  private tickAllyRfc3CorrosionDot(u: SimUnit, dt: number): void {
    const rem = u.rfc3CorrosionRemainSec ?? 0;
    if (rem <= 0) return;
    const boss = this.units.find((x) => x.bossId && !x.dead);
    const dps = u.rfc3CorrosionDps ?? 0;
    u.rfc3CorrosionRemainSec = rem - dt;
    u.rfc3CorrosionFrac = (u.rfc3CorrosionFrac ?? 0) + dps * dt;
    const chunk = Math.floor(u.rfc3CorrosionFrac ?? 0);
    if (chunk > 0) {
      u.rfc3CorrosionFrac = (u.rfc3CorrosionFrac ?? 0) - chunk;
      this.applyDamage(u, chunk, { attacker: boss ?? undefined, damageTag: 'magic' });
    }
    if ((u.rfc3CorrosionRemainSec ?? 0) <= 0) {
      u.rfc3CorrosionRemainSec = undefined;
      u.rfc3CorrosionDps = undefined;
      u.rfc3CorrosionFrac = undefined;
    }
  }

  /** 精神鞭笞连线：双方代币圆盘几何中心（`SimUnit.x` / `SimUnit.y`） */
  private unitMindLashLineAnchor(u: SimUnit): { x: number; y: number } {
    return this.unitBattleTokenCenterXY(u);
  }

  private createRfc4MindLashChannelFx(): Rfc4MindLashChannelFx {
    const linesGfx = new Graphics();
    this.fxLayer.addChild(linesGfx);
    return { linesGfx };
  }

  private disposeRfc4MindLashChannelFx(fx: Rfc4MindLashChannelFx): void {
    fx.linesGfx.destroy();
  }

  private hideBossMindLashChannelOverlay(u: SimUnit): void {
    const g = u.heroChannelDiskOverlay;
    if (!g) return;
    g.visible = false;
    g.clear();
  }

  private tickRfc4MindLashChannelFx(boss: SimUnit, ch: Rfc4MindLashChannel): void {
    const fx = ch.fx;
    const from = this.unitMindLashLineAnchor(boss);
    const lw = Math.max(2, Math.round(2.8 * LAYOUT_SCALE));
    const g = fx.linesGfx;
    g.clear();
    for (const tid of ch.targetIds) {
      const t = this.byId(tid);
      if (!t || t.dead) continue;
      const to = this.unitMindLashLineAnchor(t);
      g.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    g.stroke({ width: lw, color: 0x1e1b4b, alpha: 0.92 });
    for (const tid of ch.targetIds) {
      const t = this.byId(tid);
      if (!t || t.dead) continue;
      const to = this.unitMindLashLineAnchor(t);
      g.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    g.stroke({ width: Math.max(1, lw - 1), color: 0x7c3aed, alpha: 0.55 });
  }

  private interruptRfc4MindLashChannel(u: SimUnit, reason: string): void {
    const ch = u.rfc4MindLashChannel;
    if (!ch) return;
    this.disposeRfc4MindLashChannelFx(ch.fx);
    this.hideBossMindLashChannelOverlay(u);
    u.rfc4MindLashChannel = undefined;
    const def = getSkillById(RFC4_CH4_SKILL_MIND_LASH);
    u.rfc4MindLashCdRem = skillParamNumber(def, 0, 10);
    this.logBattleSkill(RFC4_CH4_SKILL_MIND_LASH, u, `channel_interrupt:${reason}`);
  }

  private finishRfc4MindLashChannel(u: SimUnit): void {
    const ch = u.rfc4MindLashChannel;
    if (!ch) return;
    this.disposeRfc4MindLashChannelFx(ch.fx);
    this.hideBossMindLashChannelOverlay(u);
    u.rfc4MindLashChannel = undefined;
    const def = getSkillById(RFC4_CH4_SKILL_MIND_LASH);
    u.rfc4MindLashCdRem = skillParamNumber(def, 0, 10);
    this.logBattleSkill(RFC4_CH4_SKILL_MIND_LASH, u, 'channel_end');
  }

  private startRfc4MindLashChannel(u: SimUnit, def: SkillDef): void {
    const maxT = Math.max(1, Math.floor(skillParamNumber(def, 2, 18)));
    const pool = this.alive('ally');
    if (!pool.length) {
      this.logBattleSkill(RFC4_CH4_SKILL_MIND_LASH, u, 'no_targets_in_range');
      return;
    }
    const picks = [...pool];
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = picks[i]!;
      picks[i] = picks[j]!;
      picks[j] = t;
    }
    const n = Math.min(maxT, picks.length);
    const targetIds = picks.slice(0, n).map((a) => a.unitId);
    const fx = this.createRfc4MindLashChannelFx();
    u.rfc4MindLashChannel = { t: 0, targetIds, dmgTickAcc: 0, fx };
    this.floatBattleSkillName(RFC4_CH4_SKILL_MIND_LASH, u);
    this.logBattleSkill(RFC4_CH4_SKILL_MIND_LASH, u, `channel_start targets=${n}`);
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 48, 0x581c87, 0.45));
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 78, 0x4c1d95, 0.38));
  }

  private tickRfc4MindLashDamageTick(u: SimUnit, def: SkillDef, ch: Rfc4MindLashChannel): void {
    const living = ch.targetIds.map((id) => this.byId(id)).filter((t): t is SimUnit => !!t && !t.dead);
    if (!living.length) return;
    const pct = skillParamNumber(def, 4, 30) / 100;
    const stealPct = RFC4_MIND_LASH_LIFESTEAL_OF_DAMAGE;
    let totalHpLost = 0;
    for (const t of living) {
      const dmg = Math.max(1, Math.round(u.atk * pct));
      const hp0 = t.hp;
      const sh0 = t.shield ?? 0;
      this.applyDamage(t, dmg, { attacker: u, damageTag: 'magic' });
      totalHpLost += Math.max(0, hp0 - t.hp);
      totalHpLost += Math.max(0, sh0 - (t.shield ?? 0));
      if (Math.random() < 0.35) {
        this.ringFx.push(spawnRingPulse(this.fxLayer, t.x, t.y, 24, 0x6d28d9, 0.4));
      }
    }
    if (totalHpLost > 0 && stealPct > 0) {
      const heal = Math.max(1, Math.round(totalHpLost * stealPct));
      this.applyHeal(u, heal, u);
      this.recomputeEnemyHp();
    }
  }

  private tickRfc4MindLashChannelFrame(u: SimUnit, def: SkillDef, dt: number): void {
    const ch = u.rfc4MindLashChannel;
    if (!ch) return;
    const channelSec = skillParamNumber(def, 1, 10);
    const tickSec = RFC4_MIND_LASH_TICK_SEC;
    ch.t += dt;
    ch.dmgTickAcc += dt;
    this.tickRfc4MindLashChannelFx(u, ch);
    while (ch.dmgTickAcc >= tickSec) {
      ch.dmgTickAcc -= tickSec;
      this.tickRfc4MindLashDamageTick(u, def, ch);
    }
    const anyAlive = ch.targetIds.some((id) => {
      const t = this.byId(id);
      return t && !t.dead;
    });
    if (!anyAlive) {
      this.logBattleSkill(RFC4_CH4_SKILL_MIND_LASH, u, 'channel_end_all_targets_dead');
      this.finishRfc4MindLashChannel(u);
      return;
    }
    if (ch.t >= channelSec) {
      this.finishRfc4MindLashChannel(u);
    }
  }

  private castRfc4ShadowBlink(u: SimUnit, def: SkillDef): void {
    this.floatBattleSkillName(RFC4_CH4_SKILL_SHADOW_BLINK, u);
    const stunR = Math.round(RFC4_SHADOW_BLINK_STUN_RADIUS_DESIGN * LAYOUT_SCALE);
    const stunSec = skillParamNumber(def, 2, 3);
    const blinkX = u.x;
    const blinkY = u.y;
    let stunned = 0;
    for (const a of this.alive('ally')) {
      if (Math.hypot(a.x - blinkX, a.y - blinkY) > stunR) continue;
      this.applyAllyStun(a, stunSec);
      stunned += 1;
      this.ringFx.push(spawnRingPulse(this.fxLayer, a.x, a.y, 32, 0x581c87, 0.48));
    }
    this.ringFx.push(spawnRingPulse(this.fxLayer, blinkX, blinkY, stunR, 0x312e81, 0.35));
    this.ringFx.push(spawnRingPulse(this.fxLayer, blinkX, blinkY, Math.round(stunR * 0.55), 0x7c3aed, 0.5));

    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const arenaPad = Math.round(12 * LAYOUT_SCALE);
    const margin = Math.round(52 * LAYOUT_SCALE);
    const minX = arenaPad + margin;
    const maxX = GAME_WIDTH - arenaPad - margin;
    const minY = arenaTop + margin;
    const maxY = arenaTop + arenaH - margin;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const counts = [0, 0, 0, 0];
    for (const a of this.alive('ally')) {
      const q = (a.x >= cx ? 1 : 0) + (a.y >= cy ? 2 : 0);
      counts[q]! += 1;
    }
    let bestQ = 0;
    let bestN = counts[0]!;
    for (let q = 1; q < 4; q++) {
      if (counts[q]! < bestN) {
        bestN = counts[q]!;
        bestQ = q;
      }
    }
    const corners = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: minX, y: maxY },
      { x: maxX, y: maxY },
    ];
    const dest = corners[bestQ]!;
    const p = this.clampBattleSpawnXY(dest.x, dest.y);
    u.x = p.x;
    u.y = p.y;
    this.syncUnitRootFromStance(u);
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 48, 0x4c1d95, 0.42));
    this.logBattleSkill(RFC4_CH4_SKILL_SHADOW_BLINK, u, `stun=${stunned} then_quad=${bestQ}`);
  }

  /** 怒焰裂谷第四关首领专属：群体精神鞭笞 / 暗影闪现 */
  private tickRfc4Ch4BossExclusiveSkills(u: SimUnit, dt: number): void {
    if (!u.bossId || u.dead) return;
    if (!u.skillIds.includes(RFC4_CH4_SKILL_MIND_LASH) && !u.skillIds.includes(RFC4_CH4_SKILL_SHADOW_BLINK)) {
      return;
    }
    const mindDef = getSkillById(RFC4_CH4_SKILL_MIND_LASH);
    const blinkDef = getSkillById(RFC4_CH4_SKILL_SHADOW_BLINK);

    if (u.rfc4MindLashChannel && mindDef) {
      this.tickRfc4MindLashChannelFrame(u, mindDef, dt);
      return;
    }

    const canCast = (u.stunT ?? 0) <= 0;

    if (u.skillIds.includes(RFC4_CH4_SKILL_MIND_LASH) && mindDef) {
      u.rfc4MindLashCdRem = Math.max(0, (u.rfc4MindLashCdRem ?? 0) - dt);
    }
    if (u.skillIds.includes(RFC4_CH4_SKILL_SHADOW_BLINK) && blinkDef) {
      u.rfc4ShadowBlinkCdRem = Math.max(0, (u.rfc4ShadowBlinkCdRem ?? 0) - dt);
    }

    if (!canCast) return;

    if (u.skillIds.includes(RFC4_CH4_SKILL_MIND_LASH) && mindDef && (u.rfc4MindLashCdRem ?? 0) <= 0) {
      const hpGate = skillParamNumber(mindDef, 3, 75) / 100;
      if (u.hp / Math.max(1, u.maxHp) < hpGate) {
        this.startRfc4MindLashChannel(u, mindDef);
        if (u.rfc4MindLashChannel) return;
      }
    }

    if (
      u.skillIds.includes(RFC4_CH4_SKILL_SHADOW_BLINK) &&
      blinkDef &&
      (u.rfc4ShadowBlinkCdRem ?? 0) <= 0
    ) {
      this.castRfc4ShadowBlink(u, blinkDef);
      u.rfc4ShadowBlinkCdRem = skillParamNumber(blinkDef, 0, 15);
    }
  }

  private procSkillBoomExplosion(dead: SimUnit): void {
    const bo = getSkillById('skill_boom');
    if (!bo) return;
    this.logBattleSkill('skill_boom', dead, 'death_explosion');
    const r = skillParamDesignPx(bo, 0, 50);
    const pct = skillParamNumber(bo, 1, 100) / 100;
    const base = Math.max(1, Math.round(dead.atk * pct));
    const cx = dead.x;
    const cy = dead.y;
    const deadR = this.hitRadius(dead);
    const cols = [0xf97316, 0xfbbf24, 0xfca5a5, 0xfef08a] as const;
    for (let k = 0; k < 4; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, cx, dead.y, Math.round(28 * LAYOUT_SCALE) + k * Math.round(42 * LAYOUT_SCALE), cols[k]!, 0.42 + k * 0.06),
      );
    }
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, cx, dead.y));
    for (const a of this.alive('ally')) {
      if (Math.hypot(a.x - cx, a.y - cy) <= r + this.hitRadius(a) + deadR) {
        this.applyDamage(a, base, { attacker: dead, damageTag: 'magic', bypassBlock: true });
      }
    }
  }

  private alive(side: 'ally' | 'enemy'): SimUnit[] {
    return this.units.filter((u) => u.side === side && !u.dead);
  }

  private byId(id: number | null | undefined): SimUnit | null {
    if (id == null) return null;
    return this.units.find((u) => u.unitId === id && !u.dead) ?? null;
  }

  private isRangedAttacker(u: SimUnit): boolean {
    return u.range >= RANGED_ATTACK_RANGE_THRESHOLD;
  }

  /** 指向性弹道：从施法者圆盘边缘朝目标方向伸出，避免从圆心叠射 */
  private projectileMuzzleXY(caster: SimUnit, target: SimUnit): { x: number; y: number } {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const edge = Math.max(Math.round(14 * LAYOUT_SCALE), caster.hitRadiusPx * 0.68);
    return { x: caster.x + nx * edge, y: caster.y + ny * edge };
  }

  /** 弹道视觉飞向目标圆心并在近心处结算；普攻射程仍用 `effectiveSkillRangeTo` 等原逻辑 */
  private projectileHomesToTargetCenter(style: ProjectileVisualStyle): boolean {
    switch (style) {
      case 'ally_mage':
      case 'ally_archer':
      case 'ally_priest':
      case 'ally_arcane_missile':
      case 'ally_warlock':
      case 'ally_warlock_soul_fire':
      case 'ally_druid':
      case 'ally_shaman_lightning':
      case 'ally_generic':
      case 'enemy_shadow_bolt':
      case 'enemy_headhunter':
      case 'enemy_boss_magic':
        return true;
      default:
        return false;
    }
  }

  private projectileStyleFor(u: SimUnit): ProjectileVisualStyle {
    if (u.side === 'ally') {
      switch (u.allyKind) {
        case 'mage':
          return 'ally_mage';
        case 'archer':
          return 'ally_archer';
        case 'priest':
          return 'ally_priest';
        case 'warlock':
          return 'ally_warlock';
        case 'druid':
          return u.druidForm === 'caster' ? 'ally_druid' : 'ally_generic';
        case 'shaman':
          return 'ally_shaman_lightning';
        default:
          return 'ally_generic';
      }
    }
    if (u.bossId === 'farseer' || u.bossId === 'white') return 'enemy_boss_magic';
    if (this.unitHasSkill(u, 'skill_shadow_bot')) return 'enemy_shadow_bolt';
    if (u.range >= RANGED_ATTACK_RANGE_THRESHOLD) {
      if (this.unitHasSkill(u, 'skill_shaman_bloodlust') || this.unitHasSkill(u, 'skill_catapult_burn_field')) {
        return 'enemy_boss_magic';
      }
      if (
        u.enemyPaint === 'headhunter' ||
        u.enemyPaint === 'darkspear' ||
        this.unitHasSkill(u, 'skill_batrider_leap')
      ) {
        return 'enemy_headhunter';
      }
    }
    return 'enemy_generic';
  }

  private queueProjectile(
    attacker: SimUnit,
    targetId: number,
    onHit: () => void,
    opts?: {
      style?: ProjectileVisualStyle;
      speedMul?: number;
      volleyIndex?: number;
      volleyCount?: number;
      skillId?: string;
      customGfx?: Graphics;
    },
  ): void {
    const skillId = opts?.skillId;
    if (skillId) playSkillLaunchSfx(skillId);
    const style = opts?.style ?? this.projectileStyleFor(attacker);
    const speedMul = opts?.speedMul ?? 1;
    const tgt = this.byId(targetId);
    let sx = attacker.x;
    let sy = attacker.y;
    if (tgt && this.projectileHomesToTargetCenter(style)) {
      const m = this.projectileMuzzleXY(attacker, tgt);
      sx = m.x;
      sy = m.y;
      const n = opts?.volleyCount ?? 1;
      if (n > 1 && opts?.volleyIndex != null) {
        const dx = tgt.x - attacker.x;
        const dy = tgt.y - attacker.y;
        const base = Math.atan2(dy, dx);
        const spread = Math.min(0.42, 0.07 * (n - 1));
        const off = (opts.volleyIndex - (n - 1) / 2) * spread;
        const r = Math.max(Math.round(10 * LAYOUT_SCALE), attacker.hitRadiusPx * 0.35);
        sx += Math.cos(base + off + Math.PI / 2) * r;
        sy += Math.sin(base + off + Math.PI / 2) * r;
      }
    }
    const gfx = opts?.customGfx ?? buildProjectileGraphic(style);
    gfx.position.set(sx, sy);
    this.fxLayer.addChild(gfx);
    this.projectiles.push({
      gfx,
      x: sx,
      y: sy,
      speed: Math.round(800 * LAYOUT_SCALE * speedMul),
      targetId,
      attackerId: attacker.unitId,
      life: 0,
      onHit,
      style,
      skillId,
      shadowTrailAcc:
        style === 'enemy_shadow_bolt' || style === 'ally_arcane_missile' ? 0 : undefined,
    });
  }

  private tickProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.life += dt;
      if (p.life > 4) {
        p.gfx.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }
      const tgt = this.byId(p.targetId);
      if (!tgt) {
        p.gfx.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }
      const tx = tgt.x;
      const ty = tgt.y;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const src = p.attackerId != null ? this.byId(p.attackerId) : null;
      const rSrc = src && !src.dead ? this.hitRadius(src) : PROJECTILE_HIT_BASE;
      const centerHoming = this.projectileHomesToTargetCenter(p.style);
      const hitDist = centerHoming
        ? Math.max(Math.round(12 * LAYOUT_SCALE), rSrc * 0.42)
        : this.hitRadius(tgt) + rSrc;
      if (dist <= hitDist) {
        if (tgt.invincible) {
          p.gfx.destroy();
          this.projectiles.splice(i, 1);
          continue;
        }
        if (p.skillId) playSkillHitSfx(p.skillId);
        p.onHit();
        p.gfx.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }
      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.gfx.position.set(p.x, p.y);
      p.gfx.rotation = Math.atan2(dy, dx);
      if (p.style === 'enemy_shadow_bolt') {
        p.shadowTrailAcc = (p.shadowTrailAcc ?? 0) + dt;
        while ((p.shadowTrailAcc ?? 0) >= 0.024) {
          p.shadowTrailAcc = (p.shadowTrailAcc ?? 0) - 0.024;
          this.deathTrailSparks.push(spawnShadowTrailSpark(this.fxLayer, p.x, p.y));
        }
      } else if (p.style === 'ally_arcane_missile') {
        p.shadowTrailAcc = (p.shadowTrailAcc ?? 0) + dt;
        while ((p.shadowTrailAcc ?? 0) >= 0.007) {
          p.shadowTrailAcc = (p.shadowTrailAcc ?? 0) - 0.007;
          this.deathTrailSparks.push(spawnArcaneTrailSpark(this.fxLayer, p.x, p.y));
          this.deathTrailSparks.push(spawnArcaneTrailSpark(this.fxLayer, p.x, p.y));
        }
      }
      const pulse = 1 + 0.14 * Math.sin(p.life * 28);
      p.gfx.scale.set(LAYOUT_SCALE * pulse);
    }
  }

  private castBangBangBomb(attacker: SimUnit, target: SimUnit, nx: number, ny: number): void {
    const def = getSkillById(SKILL_BANG_BANG_BOMB);
    if (!def) return;
    this.floatBattleSkillName(SKILL_BANG_BANG_BOMB, attacker);
    const uid = attacker.unitId;
    const tid = target.unitId;
    const primaryDmg = attacker.atk;
    const splashCoeff = 0.5;
    const splashR = skillParamDesignPx(def, 1, 50);
    const kbMin = skillParamDesignPx(def, 2, 200);
    const kbMax = skillParamDesignPx(def, 3, 400);
    const gfx = buildBangBangBombGraphic();
    const m = this.projectileMuzzleXY(attacker, target);
    gfx.position.set(m.x, m.y);
    this.fxLayer.addChild(gfx);
    const onBombHit = () => {
      const a = this.byId(uid);
      const primary = this.byId(tid);
      if (!a || a.dead) return;
      const cx = primary?.x ?? a.x;
      const cy = primary?.y ?? a.y;
      const inSplash: SimUnit[] = [];
      for (const ally of this.alive('ally')) {
        const d = Math.hypot(ally.x - cx, ally.y - cy);
        if (d > splashR + ally.hitRadiusPx) continue;
        inSplash.push(ally);
      }
      for (const ally of inSplash) {
        const kb = kbMin + Math.random() * Math.max(0, kbMax - kbMin);
        this.knockbackAllyFromPoint(ally, cx, cy, kb, true);
      }
      this.applyUnitCollisionSeparation(4);
      for (const ally of inSplash) {
        if (primary && ally.unitId === primary.unitId) {
          this.applyDamage(ally, Math.max(1, primaryDmg), {
            attacker: a,
            damageTag: 'magic',
            meleeBasic: true,
          });
        } else {
          const splash = Math.max(1, Math.round(a.atk * splashCoeff));
          this.applyDamage(ally, splash, { attacker: a, damageTag: 'magic' });
        }
      }
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, cx, cy));
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, splashR, 0x1f2937, 0.45));
    };
    this.bangBombProjectiles.push({
      gfx,
      x: m.x,
      y: m.y,
      speed: Math.round(720 * LAYOUT_SCALE),
      targetId: tid,
      attackerId: uid,
      life: 0,
      onHit: onBombHit,
    });
    attacker.cd = Math.max(0.25, this.effectiveAttackInterval(attacker));
    attacker.atkLungeT = ATTACK_LUNGE_DUR;
    attacker.atkLungeDx = nx;
    attacker.atkLungeDy = ny;
    playSkillLaunchSfx(SKILL_BANG_BANG_BOMB);
    this.logBattleSkill(SKILL_BANG_BANG_BOMB, attacker, `→ #${target.unitId}`);
  }

  private tickBangBangBombProjectiles(dt: number): void {
    for (let i = this.bangBombProjectiles.length - 1; i >= 0; i--) {
      const p = this.bangBombProjectiles[i]!;
      p.life += dt;
      if (p.life > 4) {
        p.gfx.destroy();
        this.bangBombProjectiles.splice(i, 1);
        continue;
      }
      const tgt = this.byId(p.targetId);
      if (!tgt) {
        p.gfx.destroy();
        this.bangBombProjectiles.splice(i, 1);
        continue;
      }
      const tx = tgt.x;
      const ty = tgt.y;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const src = this.byId(p.attackerId);
      const rSrc = src && !src.dead ? this.hitRadius(src) : PROJECTILE_HIT_BASE;
      const hitDist = Math.max(Math.round(12 * LAYOUT_SCALE), rSrc * 0.42);
      if (dist <= hitDist + tgt.hitRadiusPx) {
        if (p.skillId) playSkillHitSfx(p.skillId);
        else playSkillHitSfx(SKILL_BANG_BANG_BOMB);
        p.onHit();
        p.gfx.destroy();
        this.bangBombProjectiles.splice(i, 1);
        continue;
      }
      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.gfx.position.set(p.x, p.y);
      p.gfx.rotation = Math.atan2(dy, dx);
    }
  }

  private maybeRecordGyroMissileRetaliateTarget(defender: SimUnit, attacker: SimUnit | undefined): void {
    if (!attacker || attacker.dead || attacker.side !== 'ally') return;
    if (!this.unitHasSkill(defender, SKILL_GYRO_MISSILE_DEFENSE)) return;
    if (!this.isRangedAttacker(attacker)) return;
    defender.gyroRetaliateTargetId = attacker.unitId;
    if (defender.gyroMissileFireAcc == null) defender.gyroMissileFireAcc = 0;
  }

  private fireGyroRetaliationMissile(defender: SimUnit, target: SimUnit): void {
    const def = getSkillById(SKILL_GYRO_MISSILE_DEFENSE);
    if (!def) return;
    const coeff = skillParamNumber(def, 1, 100) / 100;
    const dmg = Math.max(1, Math.round(defender.atk * coeff));
    const m = this.projectileMuzzleXY(defender, target);
    const gfx = buildGyroMissileGraphic();
    gfx.position.set(m.x, m.y);
    this.fxLayer.addChild(gfx);
    const dur = 0.95;
    const arcLift = Math.round(95 * LAYOUT_SCALE);
    const uid = defender.unitId;
    const tid = target.unitId;
    const onHit = () => {
      const d = this.byId(uid);
      const t = this.byId(tid);
      if (!d || d.dead) return;
      if (!t || t.dead) {
        d.gyroRetaliateTargetId = null;
        return;
      }
      this.applyDamage(t, dmg, { attacker: d, damageTag: 'magic' });
      d.gyroRetaliateTargetId = null;
      playSkillHitSfx(SKILL_GYRO_MISSILE_DEFENSE);
      this.logBattleSkill(SKILL_GYRO_MISSILE_DEFENSE, d, `命中 #${tid}`);
    };
    const trail = createGyroMissileTrail(this.fxLayer);
    pushGyroMissileTrailPoint(trail, m.x, m.y);
    this.gyroHomingMissiles.push({
      gfx,
      x: m.x,
      y: m.y,
      sx: m.x,
      sy: m.y,
      tx: target.x,
      ty: target.y,
      t: 0,
      dur,
      arcLift,
      targetId: tid,
      attackerId: uid,
      trailAcc: 0,
      skillId: SKILL_GYRO_MISSILE_DEFENSE,
      trail,
      onHit,
    });
    playSkillLaunchSfx(SKILL_GYRO_MISSILE_DEFENSE);
  }

  private tickGyroHomingMissiles(dt: number): void {
    for (let i = this.gyroHomingMissiles.length - 1; i >= 0; i--) {
      const m = this.gyroHomingMissiles[i]!;
      m.t += dt;
      const tgt = this.byId(m.targetId);
      if (!tgt || tgt.dead) {
        const d = this.byId(m.attackerId);
        if (d) d.gyroRetaliateTargetId = null;
        m.gfx.destroy();
        if (m.trail) this.gyroMissileTrailFade.push(m.trail);
        this.gyroHomingMissiles.splice(i, 1);
        continue;
      }
      m.tx = tgt.x;
      m.ty = tgt.y;
      const k = Math.min(1, m.t / m.dur);
      const bx = m.sx + (m.tx - m.sx) * k;
      const by = m.sy + (m.ty - m.sy) * k;
      const arc = -m.arcLift * 4 * k * (1 - k);
      const px = bx;
      const py = by + arc;
      if (m.trail) pushGyroMissileTrailPoint(m.trail, px, py);
      m.x = px;
      m.y = py;
      m.gfx.position.set(px, py);
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      m.gfx.rotation = Math.atan2(dy, dx);
      if (k >= 1 || Math.hypot(dx, dy) < Math.round(16 * LAYOUT_SCALE)) {
        m.onHit?.();
        m.gfx.destroy();
        if (m.trail) this.gyroMissileTrailFade.push(m.trail);
        this.gyroHomingMissiles.splice(i, 1);
      }
    }
    for (let i = this.gyroMissileTrailFade.length - 1; i >= 0; i--) {
      if (fadeDestroyGyroMissileTrail(this.gyroMissileTrailFade[i]!, dt)) {
        this.gyroMissileTrailFade.splice(i, 1);
      }
    }
  }

  private tickGyroMissileDefensePassive(u: SimUnit, dt: number): void {
    if (!this.unitHasSkill(u, SKILL_GYRO_MISSILE_DEFENSE) || u.dead) return;
    const def = getSkillById(SKILL_GYRO_MISSILE_DEFENSE);
    if (!def) return;
    const interval = skillParamNumber(def, 0, 0.2);
    const tid = u.gyroRetaliateTargetId;
    if (tid == null) return;
    const target = this.byId(tid);
    if (!target || target.dead || target.side !== 'ally') {
      u.gyroRetaliateTargetId = null;
      return;
    }
    if (this.gyroHomingMissiles.some((m) => m.attackerId === u.unitId)) return;
    u.gyroMissileFireAcc = (u.gyroMissileFireAcc ?? 0) + dt;
    if (u.gyroMissileFireAcc < interval) return;
    u.gyroMissileFireAcc = 0;
    this.fireGyroRetaliationMissile(u, target);
  }

  private pickJetpackWaypoint(fromX: number, fromY: number): { x: number; y: number } {
    const minD = JETPACK_MIN_WAYPOINT_DESIGN * LAYOUT_SCALE;
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minD + Math.random() * minD * 1.4;
      const raw = this.clampBattleSpawnXY(fromX + Math.cos(ang) * dist, fromY + Math.sin(ang) * dist);
      if (Math.hypot(raw.x - fromX, raw.y - fromY) >= minD * 0.92) return raw;
    }
    const ang = Math.random() * Math.PI * 2;
    return this.clampBattleSpawnXY(fromX + Math.cos(ang) * minD, fromY + Math.sin(ang) * minD);
  }

  private startJetpackBezierSegment(st: BossJetpackAssaultState, boss: SimUnit): void {
    st.p0x = boss.x;
    st.p0y = boss.y;
    const end = this.pickJetpackWaypoint(boss.x, boss.y);
    st.p2x = end.x;
    st.p2y = end.y;
    const mx = (st.p0x + st.p2x) * 0.5;
    const my = (st.p0y + st.p2y) * 0.5;
    const dx = st.p2x - st.p0x;
    const dy = st.p2y - st.p0y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const off = (30 + Math.random() * 20) * LAYOUT_SCALE * (Math.random() < 0.5 ? 1 : -1);
    st.cpx = mx + px * off;
    st.cpy = my + py * off;
    st.segT = 0;
    const speed = boss.speedBase * st.speedMult * BATTLE_MOVE_SPEED_MULT;
    const approxLen = len * 1.15;
    st.segDur = Math.max(0.35, approxLen / Math.max(80, speed));
  }

  private quadBezierPoint(
    p0x: number,
    p0y: number,
    cpx: number,
    cpy: number,
    p2x: number,
    p2y: number,
    t: number,
  ): { x: number; y: number } {
    const u = 1 - t;
    return {
      x: u * u * p0x + 2 * u * t * cpx + t * t * p2x,
      y: u * u * p0y + 2 * u * t * cpy + t * t * p2y,
    };
  }

  private quadBezierTangent(
    p0x: number,
    p0y: number,
    cpx: number,
    cpy: number,
    p2x: number,
    p2y: number,
    t: number,
  ): { x: number; y: number } {
    const u = 1 - t;
    return {
      x: 2 * u * (cpx - p0x) + 2 * t * (p2x - cpx),
      y: 2 * u * (cpy - p0y) + 2 * t * (p2y - cpy),
    };
  }

  private jetpackKnockbackAllyAlongTangent(
    ally: SimUnit,
    tdx: number,
    tdy: number,
    kbDist: number,
  ): void {
    if (ally.dead || ally.invulnerable) return;
    const d = Math.hypot(tdx, tdy) || 1;
    const nx = tdx / d;
    const ny = tdy / d;
    const ir = this.unitTokenRootYOffsetPx(ally);
    const capped = this.clampAllyKnockbackXY(ally.x + nx * kbDist, ally.y + ny * kbDist, ir);
    ally.knockbackTween = {
      elapsed: 0,
      dur: KNOCKBACK_TWEEN_DUR,
      sx: ally.x,
      sy: ally.y,
      tx: capped.x,
      ty: capped.y,
    };
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, ally.x, this.floatAnchorY(ally) - 36, '击退', 'magic'),
    );
  }

  private startBossJetpackAssault(boss: SimUnit): void {
    const def = getSkillById(SKILL_JETPACK_ASSAULT);
    if (!def) return;
    this.floatBattleSkillName(SKILL_JETPACK_ASSAULT, boss);
    const dur = skillParamNumber(def, 2, 8);
    const speedMult = skillParamNumber(def, 3, 3);
    const kbDist = skillParamDesignPx(def, 4, 150);
    let jetpackFx: JetpackAssaultFx | undefined;
    if (boss.body) {
      jetpackFx = new JetpackAssaultFx();
      boss.body.addChild(jetpackFx);
    }
    const st: BossJetpackAssaultState = {
      kind: 'jetpack_assault',
      skillId: SKILL_JETPACK_ASSAULT,
      t: 0,
      dur,
      speedMult,
      kbDist,
      segT: 0,
      segDur: 1,
      p0x: boss.x,
      p0y: boss.y,
      cpx: boss.x,
      cpy: boss.y,
      p2x: boss.x,
      p2y: boss.y,
      jetpackFx,
      pulsePhase: 0,
      hitAllyIds: new Set(),
    };
    boss.bossSkillCast = st;
    boss.collisionDisabled = true;
    this.startJetpackBezierSegment(st, boss);
    this.logBattleSkill(SKILL_JETPACK_ASSAULT, boss, '喷气背包开始');
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private finishBossJetpackAssault(boss: SimUnit, st: BossJetpackAssaultState): void {
    st.jetpackFx?.destroy({ children: true });
    boss.bossSkillCast = undefined;
    boss.collisionDisabled = false;
    this.syncUnitRootFromStance(boss);
    this.applyUnitCollisionSeparation(4);
    this.bossPutSkillOnCooldown(boss, SKILL_JETPACK_ASSAULT);
    this.logBattleSkill(SKILL_JETPACK_ASSAULT, boss, '喷气背包结束');
  }

  private destroyWarlockFearSpiralFx(u: SimUnit): void {
    if (!u.warlockFearSpiralFx) return;
    u.warlockFearSpiralFx.destroy({ children: true });
    u.warlockFearSpiralFx = undefined;
    u.warlockFearSpiralPhase = undefined;
  }

  private onBattleUnitDied(victim: SimUnit): void {
    this.destroyWarlockFearSpiralFx(victim);
    for (const u of this.units) {
      if (u.dead || !this.unitHasSkill(u, SKILL_DEFIAS_HEART)) continue;
      this.applyDefiasHeartCooldownTick(u);
    }
  }

  /** 迪菲亚之心：场上死亡时，拥有者正在转冷的主动技 -1s */
  private applyDefiasHeartCooldownTick(owner: SimUnit): void {
    for (const sid of owner.skillIds) {
      if (!isBossConfiguredSkill(sid)) continue;
      const k = this.bossSkillStateKey(owner, sid);
      const cur = this.bossSkillCdRemain.get(k) ?? 0;
      if (cur <= 1e-4) continue;
      this.bossSkillCdRemain.set(k, Math.max(0, cur - 1));
    }
  }

  private positionBossBehindAlly(boss: SimUnit, ally: SimUnit, backDistPx: number): void {
    const dx = ally.x - boss.x;
    const dy = ally.y - boss.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const p = this.clampBattleSpawnXY(ally.x + nx * backDistPx, ally.y + ny * backDistPx);
    boss.x = p.x;
    boss.y = p.y;
    this.syncUnitRootFromStance(boss);
  }

  private resolveBossOutgoingCritDamage(
    boss: SimUnit,
    baseDmg: number,
    forceCrit: boolean,
  ): { dmg: number; tag?: DamageCtx['damageTag'] } {
    let crit = forceCrit;
    if (!crit) {
      const bc = getSkillById('skill_boss_crit');
      if (this.unitHasSkill(boss, 'skill_boss_crit') && Math.random() < skillParamNumber(bc, 0, 20) / 100) {
        crit = true;
      } else {
        const bm = getSkillById('skill_blademaster_crit');
        if (this.unitHasSkill(boss, 'skill_blademaster_crit') && Math.random() < skillParamNumber(bm, 0, 0.35)) {
          crit = true;
        } else if (this.unitHasSkill(boss, 'skill_normal_crit')) {
          const nc = getSkillById('skill_normal_crit');
          if (Math.random() < skillParamNumber(nc, 0, 20) / 100) crit = true;
        }
      }
    }
    let dmg = baseDmg;
    if (crit) {
      if (this.unitHasSkill(boss, 'skill_boss_crit')) {
        dmg *= skillParamNumber(getSkillById('skill_boss_crit'), 1, 3);
      } else if (this.unitHasSkill(boss, 'skill_blademaster_crit')) {
        dmg *= skillParamNumber(getSkillById('skill_blademaster_crit'), 1, 2);
      } else {
        dmg *= skillParamNumber(getSkillById('skill_normal_crit'), 1, 2);
      }
      return { dmg: Math.max(1, Math.round(dmg)), tag: 'crit' };
    }
    return { dmg: Math.max(1, Math.round(baseDmg)), tag: undefined };
  }

  private clearBossVanishAmbushFx(boss: SimUnit, st: BossVanishAmbushState): void {
    st.invulnFx?.destroy({ children: true });
    st.invulnFx = undefined;
    if (st.ambushFx) {
      st.ambushFx.root.destroy({ children: true });
      st.ambushFx = undefined;
    }
    boss.invincible = false;
    if (boss.root) boss.root.alpha = 1;
  }

  private startBossVanishAmbush(boss: SimUnit): void {
    const def = getSkillById(SKILL_VANISH_AMBUSH);
    if (!def) return;
    const target = this.pickLowestHpAlly();
    if (!target) return;
    this.floatBattleSkillName(SKILL_VANISH_AMBUSH, boss);
    const coeff = skillParamNumber(def, 2, 350) / 100;
    const pushR = Math.round(VANISH_AMBUSH_PUSH_DESIGN * LAYOUT_SCALE);
    const backDist = Math.round(VANISH_AMBUSH_BACK_DIST_DESIGN * LAYOUT_SCALE);
    boss.invincible = true;
    boss.stunT = 0;
    let invulnFx: VanishInvulnRingFx | undefined;
    if (boss.body) {
      invulnFx = new VanishInvulnRingFx();
      boss.body.addChild(invulnFx);
    }
    boss.bossSkillCast = {
      kind: 'vanish_ambush',
      skillId: SKILL_VANISH_AMBUSH,
      t: 0,
      vanishDur: VANISH_AMBUSH_VANISH_SEC,
      targetId: target.unitId,
      coeff,
      pushR,
      backDist,
      invulnFx,
      ringSpin: 0,
    };
    this.logBattleSkill(SKILL_VANISH_AMBUSH, boss, `消失·伏击 → #${target.unitId}`);
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private applyVanishAmbushImpact(boss: SimUnit, st: BossVanishAmbushState): void {
    const target = this.byId(st.targetId);
    if (target && !target.dead) {
      this.positionBossBehindAlly(boss, target, st.backDist);
    }
    const innerR = boss.tokenInnerR ?? boss.hitRadiusPx;
    const isCrit = !!(target && !target.dead && this.isRangedAttacker(target));
    if (target && !target.dead) {
      st.ambushFx = spawnVanishAmbushStrike(this.fxLayer, target.x, target.y, target.hitRadiusPx, isCrit);
    } else {
      st.ambushFx = spawnVanishAmbushStrike(this.fxLayer, boss.x, boss.y, innerR, false);
    }
    boss.root.alpha = 1;
    boss.invincible = false;
    if (target && !target.dead) {
      const base = Math.max(1, Math.round(boss.atk * st.coeff));
      const { dmg, tag } = this.resolveBossOutgoingCritDamage(boss, base, isCrit);
      this.applyDamage(target, dmg, { attacker: boss, damageTag: tag ?? 'magic', bypassBlock: true });
      if (isCrit) {
        this.floatWords.push(
          spawnFloatNumber(
            this.floatLayer,
            target.x,
            this.floatAnchorY(target) - Math.round(52 * LAYOUT_SCALE),
            '暴击',
            'crit',
          ),
        );
      }
      if (target.hitFlashOverlay) target.hitFlashT = HIT_FLASH_DUR * (isCrit ? 3.2 : 2.4);
      for (let k = 0; k < (isCrit ? 4 : 2); k++) {
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x + (k - 1) * 6 * LAYOUT_SCALE, target.y));
      }
    }
    const pushDist = Math.round(st.pushR * (0.92 + Math.random() * 0.2));
    for (const a of this.alive('ally')) {
      if (target && a.unitId === target.unitId) continue;
      const d = Math.hypot(a.x - boss.x, a.y - boss.y);
      if (d > st.pushR + a.hitRadiusPx) continue;
      this.knockbackAllyRadialFromPoint(a, boss.x, boss.y, pushDist);
    }
    this.triggerBattleScreenShake(isCrit ? 0.26 : 0.2, Math.round((isCrit ? 14 : 11) * LAYOUT_SCALE));
    this.bossPutSkillOnCooldown(boss, SKILL_VANISH_AMBUSH);
    this.logBattleSkill(SKILL_VANISH_AMBUSH, boss, target && !target.dead ? '伏击命中' : '伏击落空');
  }

  private finishBossVanishAmbush(boss: SimUnit, st: BossVanishAmbushState): void {
    this.clearBossVanishAmbushFx(boss, st);
    boss.bossSkillCast = undefined;
  }

  private tickBossVanishAmbush(boss: SimUnit, st: BossVanishAmbushState, dt: number): void {
    if (st.ambushFx) {
      const innerR = boss.tokenInnerR ?? boss.hitRadiusPx;
      if (tickVanishAmbushStrikeFx(st.ambushFx, dt, innerR)) {
        st.ambushFx.root.destroy({ children: true });
        st.ambushFx = undefined;
        this.finishBossVanishAmbush(boss, st);
      }
      return;
    }
    st.t += dt;
    st.ringSpin += dt * 2.4;
    let alpha = 1;
    if (st.t < VANISH_AMBUSH_FADE_SEC) {
      alpha = 1 - st.t / VANISH_AMBUSH_FADE_SEC;
    } else if (st.t < VANISH_AMBUSH_VANISH_SEC) {
      alpha = 0;
    }
    if (boss.root) boss.root.alpha = alpha;
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    const pulse01 = 0.5 + 0.5 * Math.sin(st.t * 7);
    if (st.invulnFx) st.invulnFx.redraw(ir, pulse01, st.ringSpin);
    if (st.t >= st.vanishDur) {
      st.invulnFx?.destroy({ children: true });
      st.invulnFx = undefined;
      this.applyVanishAmbushImpact(boss, st);
    }
  }

  private tickBossJetpackAssault(boss: SimUnit, st: BossJetpackAssaultState, dt: number): void {
    st.t += dt;
    st.pulsePhase += dt * 6;
    const pulse01 = 0.5 + 0.5 * Math.sin(st.pulsePhase);
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    if (st.jetpackFx) st.jetpackFx.redraw(ir, pulse01);

    st.segT += dt;
    const segK = Math.min(1, st.segT / st.segDur);
    const pos = this.quadBezierPoint(st.p0x, st.p0y, st.cpx, st.cpy, st.p2x, st.p2y, segK);
    const tan = this.quadBezierTangent(st.p0x, st.p0y, st.cpx, st.cpy, st.p2x, st.p2y, Math.min(0.99, segK));
    if (st.jetpackFx) st.jetpackFx.setMoveDir(tan.x, tan.y);

    const prevX = boss.x;
    const prevY = boss.y;
    boss.x = pos.x;
    boss.y = pos.y;
    this.syncUnitRootFromStance(boss);

    if (Math.hypot(boss.x - prevX, boss.y - prevY) > 2) {
      this.jetpackSmokePuffs.push(spawnJetpackSmokePuff(this.fxLayer, (prevX + boss.x) * 0.5, (prevY + boss.y) * 0.5));
    }

    const br = this.hitRadius(boss);
    for (const a of this.alive('ally')) {
      const d = Math.hypot(a.x - boss.x, a.y - boss.y);
      if (d > br + a.hitRadiusPx + 6) continue;
      const key = a.unitId;
      if (st.hitAllyIds.has(key)) continue;
      st.hitAllyIds.add(key);
      this.jetpackKnockbackAllyAlongTangent(a, tan.x, tan.y, st.kbDist);
    }

    if (segK >= 1) {
      st.hitAllyIds.clear();
      if (st.t >= st.dur) {
        this.finishBossJetpackAssault(boss, st);
        return;
      }
      this.startJetpackBezierSegment(st, boss);
    }
  }

  private beginDefaultAttack(u: SimUnit, target: SimUnit, dist: number, dx: number, dy: number): void {
    if (u.side === 'enemy' && this.unitHasSkill(u, SKILL_BANG_BANG_BOMB)) {
      const bb = getSkillById(SKILL_BANG_BANG_BOMB);
      const interval = Math.max(1, Math.round(skillParamNumber(bb, 0, 5)));
      const next = (u.bangBangBombAtkCount ?? 0) + 1;
      if (next >= interval) {
        u.bangBangBombAtkCount = 0;
        const nd = dist || 1;
        this.castBangBangBomb(u, target, dx / nd, dy / nd);
        return;
      }
      u.bangBangBombAtkCount = next;
    }
    if (u.side === 'ally' && u.allyKind === 'archer') {
      const prev = u.archerLockedAttackTargetId;
      const next = target.unitId;
      if (prev != null && prev !== next) {
        u.archerFocusStacks = 0;
      }
      u.archerLockedAttackTargetId = next;
    }
    let dmg = u.atk;
    let enemyTag: DamageCtx['damageTag'] | undefined;
    if (u.side === 'enemy') {
      const bc = getSkillById('skill_boss_crit');
      if (this.unitHasSkill(u, 'skill_boss_crit') && Math.random() < skillParamNumber(bc, 0, 20) / 100) {
        dmg *= skillParamNumber(bc, 1, 3);
        enemyTag = 'crit';
      } else {
        const bm = getSkillById('skill_blademaster_crit');
        if (this.unitHasSkill(u, 'skill_blademaster_crit') && Math.random() < skillParamNumber(bm, 0, 0.35)) {
          dmg *= skillParamNumber(bm, 1, 2);
          enemyTag = 'crit';
        } else if (this.unitHasSkill(u, 'skill_normal_crit')) {
          const nc = getSkillById('skill_normal_crit');
          const pCrit = skillParamNumber(nc, 0, 20) / 100;
          if (Math.random() < pCrit) {
            dmg *= skillParamNumber(nc, 1, 2);
            enemyTag = 'crit';
          }
        }
      }
    }
    u.cd = Math.max(0.25, this.effectiveAttackInterval(u));
    const nx = dx / dist;
    const ny = dy / dist;
    const uid = u.unitId;
    const tid = target.unitId;
    const dmgF = dmg;
    const tagF = enemyTag;
    if (this.isRangedAttacker(u)) {
      this.queueProjectile(u, tid, () => {
        const a = this.units.find((x) => x.unitId === uid && !x.dead);
        const t = this.byId(tid);
        if (!a || !t) return;
        if (a.side === 'ally') {
          this.dealAllyHit(a, t, dmgF);
          this.maybeDoubleShotArcher(a, t, a.atk);
        } else {
          if (this.unitHasSkill(a, 'skill_hot_strike')) {
            this.applyBossHotStrikeMelee(a, t, dmgF, tagF);
          } else {
            this.applyDamage(t, dmgF, { attacker: a, damageTag: tagF });
          }
          if (this.unitHasSkill(a, 'skill_catapult_burn_field')) {
            this.spawnCatapultBurnField(t.x, t.y, a.atk);
          }
        }
      });
      u.atkLungeT = ATTACK_LUNGE_DUR;
      u.atkLungeDx = nx;
      u.atkLungeDy = ny;
    } else {
      if (u.side === 'ally') {
        this.dealAllyHit(u, target, dmgF);
        this.maybeDoubleShotArcher(u, target, u.atk);
      } else if (this.unitHasSkill(u, SKILL_BANG_BANG_BOMB)) {
        this.queueProjectile(
          u,
          tid,
          () => {
            const a = this.units.find((x) => x.unitId === uid && !x.dead);
            const t = this.byId(tid);
            if (!a || !t) return;
            this.applyDamage(t, dmgF, { attacker: a, damageTag: enemyTag, meleeBasic: true });
          },
          { customGfx: buildGreenskinBasicOrbGraphic(), speedMul: 1.05 },
        );
      } else if (this.unitHasSkill(u, 'skill_hot_strike')) {
        this.applyBossHotStrikeMelee(u, target, dmgF, enemyTag);
        if (this.unitHasSkill(u, 'skill_abomination_cleave')) {
          this.abominationCleaveFollowup(u, target);
        }
        if (this.unitHasSkill(u, 'skill_rhahk_cleave')) {
          this.rhahkCleaveFollowup(u, target);
        }
      } else {
        this.applyDamage(target, dmgF, { attacker: u, damageTag: enemyTag, meleeBasic: true });
        if (this.unitHasSkill(u, 'skill_abomination_cleave')) {
          this.abominationCleaveFollowup(u, target);
        }
        if (this.unitHasSkill(u, 'skill_rhahk_cleave')) {
          this.rhahkCleaveFollowup(u, target);
        }
      }
      u.atkLungeT = ATTACK_LUNGE_DUR;
      u.atkLungeDx = nx;
      u.atkLungeDy = ny;
    }
  }

  /**
   * skill_hot_strike：普攻（近战出手或远程弹道命中）在 params[0] 个额外目标与主目标之间分摊 (1+params[0]) 倍普攻伤害；
   * 索敌以首领当前站位为圆心、近战射程 + margin；范围内人数不足时由命中单位分摊总倍率。
   */
  private applyBossHotStrikeMelee(
    u: SimUnit,
    primary: SimUnit,
    baseDmg: number,
    damageTag: DamageCtx['damageTag'] | undefined,
  ): void {
    const hs = getSkillById('skill_hot_strike');
    const extra = Math.max(0, Math.round(skillParamNumber(hs, 0, 2)));
    const cap = 1 + extra;
    const pad = Math.round(5 * LAYOUT_SCALE);
    const inMelee = (a: SimUnit): boolean => {
      const d = Math.hypot(a.x - u.x, a.y - u.y);
      const aim = this.effectiveSkillRangeTo(u, a) + this.meleeEngagementMarginPx(u, a) + pad;
      return d <= aim;
    };
    let candidates = this.alive('ally').filter(inMelee);
    if (!candidates.some((c) => c.unitId === primary.unitId)) {
      candidates = [primary, ...candidates.filter((c) => c.unitId !== primary.unitId)];
    }
    let hits: SimUnit[];
    if (candidates.length === 0) {
      hits = [primary];
    } else if (candidates.length <= cap) {
      hits = [...candidates];
    } else {
      const rest = candidates.filter((c) => c.unitId !== primary.unitId);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = rest[i]!;
        rest[i] = rest[j]!;
        rest[j] = tmp;
      }
      hits = [primary, ...rest.slice(0, cap - 1)];
    }
    this.playBossHotStrikePresentation(u, hits);
    const per = Math.max(1, Math.round((baseDmg * cap) / Math.max(1, hits.length)));
    for (const t of hits) {
      this.applyDamage(t, per, {
        attacker: u,
        damageTag,
        meleeBasic: true,
        hotStrikeHeavy: true,
      });
    }
  }

  /** skill_hot_strike：首领侧火环 + 各命中点预警式脉冲，与逐目标强受击叠化 */
  private playBossHotStrikePresentation(boss: SimUnit, hits: readonly SimUnit[]): void {
    const ir = Math.max(boss.hitRadiusPx, Math.round(24 * LAYOUT_SCALE));
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y, Math.round(ir * 2.05), 0xf97316, 0.5));
    this.ringFx.push(
      spawnRingPulse(this.fxLayer, boss.x, boss.y, Math.round(ir * 2.75), 0xfbbf24, 0.54, { delay: 0.045 }),
    );
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, boss.x, boss.y));
    for (const t of hits) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, t.x, t.y, Math.max(28, Math.round(t.hitRadiusPx * 1.08)), 0xfca5a5, 0.38, {
          flow: 'shrink',
        }),
      );
      this.ringFx.push(
        spawnRingPulse(this.floatLayer, t.x, t.y, Math.max(40, Math.round(t.hitRadiusPx * 1.72)), 0xef4444, 0.44, {
          delay: 0.035,
        }),
      );
    }
  }

  /** skill_berserker：按当前生命百分比即时同步阶段、攻击力；阶段变化时飘字「狂暴」/「极度狂暴」并播环与火星 */
  private syncBossBerserkFromHp(u: SimUnit): void {
    if (!this.unitHasSkill(u, 'skill_berserker') || u.dead) return;
    const base = u.bossBerserkBaseAtk ?? u.atk;
    const sk = getSkillById('skill_berserker');
    const p0 = skillParamNumber(sk, 0, 50);
    const p1 = skillParamNumber(sk, 1, 50);
    const p2 = skillParamNumber(sk, 2, 20);
    const p3 = skillParamNumber(sk, 3, 100);
    const hpP = (u.hp / Math.max(1, u.maxHp)) * 100;
    let stage: 0 | 1 | 2 = 0;
    let mult = 1;
    if (hpP <= p2) {
      stage = 2;
      mult = 1 + p3 / 100;
    } else if (hpP <= p0) {
      stage = 1;
      mult = 1 + p1 / 100;
    }
    const prev = u.bossBerserkStage ?? 0;
    u.bossBerserkStage = stage;
    u.atk = Math.max(1, Math.round(base * mult));
    if (stage !== prev) {
      const fy = this.floatAnchorY(u) - Math.round(52 * LAYOUT_SCALE);
      if (stage === 1) {
        this.floatWords.push(spawnFloatNumber(this.floatLayer, u.x, fy, '狂暴', 'crit'));
        this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, u.hitRadiusPx * 2.15, 0xf97316, 0.52));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
      } else if (stage === 2) {
        this.floatWords.push(spawnFloatNumber(this.floatLayer, u.x, fy, '极度狂暴', 'crit'));
        this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, u.hitRadiusPx * 2.45, 0xdc2626, 0.58));
        this.ringFx.push(
          spawnRingPulse(this.fxLayer, u.x, u.y, u.hitRadiusPx * 3.05, 0x7f1d1d, 0.5, { delay: 0.05 }),
        );
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
        this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, u.x, u.y));
      }
    }
  }

  private nearestEnemy(from: SimUnit): SimUnit | null {
    let best: SimUnit | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of this.alive('enemy')) {
      if (u.invincible) continue;
      const d = Math.hypot(u.x - from.x, u.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private farthestEnemy(from: SimUnit): SimUnit | null {
    let best: SimUnit | null = null;
    let bestD = -1;
    for (const u of this.alive('enemy')) {
      const d = Math.hypot(u.x - from.x, u.y - from.y);
      if (d > bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private nearestAlly(from: SimUnit): SimUnit | null {
    let best: SimUnit | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of this.alive('ally')) {
      const d = Math.hypot(u.x - from.x, u.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private allyNeedsHeal(a: SimUnit): boolean {
    return a.hp < a.maxHp - 0.5;
  }

  /**
   * 治疗目标：优先**其他**友军（逻辑同旧版，集合不含自己）。
   * 没有别的友军需要奶时：仅当自己血量低于 50% 最大生命才自奶，否则返回 null，走普攻最近敌人。
   * 避免「单人牧师不满血就一直奶自己、从不打怪」。
   */
  private pickPriestHealTarget(u: SimUnit): { target: SimUnit; inRange: boolean } | null {
    const score = (a: SimUnit): number => a.hp / Math.max(1, a.maxHp);
    const others = this.alive('ally').filter((a) => a.unitId !== u.unitId && this.allyNeedsHeal(a));

    if (others.length) {
      if (this.bondStacks.priest >= 15) {
        let worst = others[0]!;
        for (const a of others) if (score(a) < score(worst)) worst = a;
        return { target: worst, inRange: true };
      }
      let bestIn: SimUnit | null = null;
      let bestS = Number.POSITIVE_INFINITY;
      for (const a of others) {
        const d = Math.hypot(a.x - u.x, a.y - u.y);
        const healAim = this.effectiveSkillRangeTo(u, a) + this.meleeEngagementMarginPx(u, a);
        if (d <= healAim && score(a) < bestS) {
          bestS = score(a);
          bestIn = a;
        }
      }
      if (bestIn) return { target: bestIn, inRange: true };
      let worst = others[0]!;
      for (const a of others) if (score(a) < score(worst)) worst = a;
      return { target: worst, inRange: false };
    }

    if (this.allyNeedsHeal(u) && u.hp / Math.max(1, u.maxHp) < 0.5) {
      return { target: u, inRange: true };
    }
    return null;
  }

  private applyHeal(target: SimUnit, amount: number, src?: SimUnit, opts?: { silent?: boolean }): void {
    if (target.dead) return;
    if (src?.allyKind === 'priest' && this.bondStacks.priest >= 6) {
      this.battlePurgeAllyGreen(target);
    }
    const prev = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const gained = Math.round(target.hp - prev);
    if (gained <= 0) return;
    if (src?.side === 'ally') this.bumpBattleHealStat(src, gained);
    if (src?.allyKind === 'priest' || src?.allyKind === 'shaman') {
      const ir = target.hitRadiusPx;
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, ir * 1.14, 0xbef264, 0.34));
    } else {
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 40, 0x4ade80, 0.45));
      if (src) this.ringFx.push(spawnRingPulse(this.fxLayer, src.x, src.y, 24, 0xa7f3d0, 0.35));
    }
    if (!opts?.silent) {
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target), `+${gained}`, 'heal'),
      );
    }
    this.healBursts.push(spawnHealBurst(this.fxLayer, target.x, target.y));
  }

  /** 为任意单位叠加护盾（数值，上限 maxHp） */
  private grantUnitShield(u: SimUnit, add: number, src?: SimUnit): void {
    if (u.dead || add <= 0) return;
    const cap = u.maxHp;
    const cur = Math.max(0, Math.floor(u.shield ?? 0));
    const next = Math.min(cap, cur + Math.round(add));
    const gained = next - cur;
    u.shield = next;
    const cx = u.x;
    const ir = u.hitRadiusPx;
    const purp = [0x4c1d95, 0x6b21a8, 0x7c3aed, 0x9333ea, 0xa855f7, 0xc4b5fd] as const;
    for (let i = 0; i < 18; i++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, cx, u.y, ir * 2.42, purp[i % purp.length]!, 0.36 + (i % 4) * 0.04, {
          flow: 'shrink',
          delay: i * 0.016,
        }),
      );
    }
    if (src) {
      this.ringFx.push(spawnRingPulse(this.fxLayer, src.x, src.y, 26, 0xe9d5ff, 0.34));
    }
    if (gained > 0) {
      if (src?.side === 'ally') this.bumpBattleHealStat(src, gained);
      this.floatWords.push(
        spawnFloatNumber(
          this.floatLayer,
          u.x,
          this.floatAnchorY(u) - Math.round(22 * LAYOUT_SCALE),
          `获得护盾${gained}`,
          'shield',
        ),
      );
    }
    this.syncUnitHpRing(u);
  }

  /** 群体庇护冷却上限（秒）：读 `skills.json` params[0]/[1]，羁绊≥6 用较短值 */
  private priestMassShelterCooldownCapSec(): number {
    const sk = getSkillById('skill_hero_priest_mass_shelter');
    const base = skillParamNumber(sk, 0, 48);
    const bond6 = skillParamNumber(sk, 1, 36);
    return this.bondStacks.priest >= 6 ? bond6 : base;
  }

  /** 塞拉菲群体庇护；无存活友方时返回 false（不进入冷却） */
  private tryCastPriestMassShelter(hero: SimUnit): boolean {
    const allies = this.alive('ally');
    if (!allies.length) return false;
    const priestN = allies.filter((a) => a.allyKind === 'priest').length;
    const pb = this.bondStacks.priest;
    const maxT = pb >= 15 ? allies.length : Math.min(Math.max(0, priestN), allies.length);
    if (maxT <= 0) return false;
    const sorted = [...allies].sort((a, b) => {
      const sa = (a.shield ?? 0) > 0 ? 1 : 0;
      const sb = (b.shield ?? 0) > 0 ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.hp - b.hp;
    });
    const skShelter = getSkillById('skill_hero_priest_mass_shelter');
    const shieldCoef = skillParamNumber(skShelter, 2, 2);
    const lowHpRatio = skillParamNumber(skShelter, 3, 0.5);
    const addShield = Math.max(0, Math.round(hero.atk * shieldCoef));
    for (let i = 0; i < maxT && i < sorted.length; i++) {
      const t = sorted[i]!;
      this.grantUnitShield(t, addShield, hero);
      if (pb >= 10 && t.hp / Math.max(1, t.maxHp) < lowHpRatio) {
        const healAmt = hero.atk * (this.bondStacks.priest >= 15 ? 4 : 2);
        this.applyHeal(t, healAmt, hero);
      }
    }
    const tgtIds = sorted.slice(0, maxT).map((u) => u.unitId);
    this.logBattleSkill(
      'skill_hero_priest_mass_shelter',
      hero,
      `targets=${maxT} shieldEach=${addShield} bondPriest=${pb} unitIds=[${tgtIds.join(',')}]`,
    );
    return true;
  }

  /** 羁绊15：首领进入蓄力或冲锋引导时，格温妮神圣制裁冷却中则 -5s */
  private pulseKnightHolySanctionCdFromBossCast(): void {
    if (this.bondStacks.knight < 15) return;
    for (const u of this.alive('ally')) {
      if (!isKnightHolySanctionHero(u.heroId)) continue;
      const cd = u.heroHolySanctionCdRem ?? 0;
      if (cd <= 1e-4) continue;
      u.heroHolySanctionCdRem = Math.max(0, cd - HOLY_SANCTION_BOND15_CD_PULSE_SEC);
    }
  }

  private tryCastKnightHeroHolySanction(hero: SimUnit, target: SimUnit): boolean {
    if (target.dead) return false;
    const kb = this.bondStacks.knight;
    const coef = kb >= 6 ? HOLY_SANCTION_COEF_BOND6 : HOLY_SANCTION_COEF_BASE;
    const dmg = Math.max(1, Math.round(hero.atk * coef));
    this.holySanctionStrikes.push(
      spawnHolySanctionStrike(this.fxLayer, target.x, target.y, target.hitRadiusPx),
    );
    this.applyDamage(target, dmg, { attacker: hero });
    if (!target.dead) {
      const stunT = target.bossId ? HOLY_SANCTION_STUN_BOSS_SEC : HOLY_SANCTION_STUN_SEC;
      this.applyEnemyHardControlStun(target, stunT);
    }
    if (kb >= 10) {
      this.applyHeal(hero, hero.maxHp * 0.1, hero);
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 38, '神圣制裁', 'magic'),
    );
    this.ringFx.push(
      spawnRingPulse(this.fxLayer, target.x, target.y, target.hitRadiusPx * 2.4, 0xfef9c3, 0.42),
    );
    const stunLog = target.dead ? 'dead' : `${target.bossId ? HOLY_SANCTION_STUN_BOSS_SEC : HOLY_SANCTION_STUN_SEC}s`;
    this.logBattleSkill('skill_hero_knight_holy_sanction', hero, `dmg=${dmg} stun=${stunLog} boss=${!!target.bossId}`);
    return true;
  }

  private tickKnightHeroHolySanction(u: SimUnit, dt: number): void {
    const cdLeft = u.heroHolySanctionCdRem ?? 0;
    if (cdLeft > 0) {
      u.heroHolySanctionCdRem = Math.max(0, cdLeft - dt);
      return;
    }
    const tgt = this.nearestEnemy(u);
    if (!tgt) return;
    const dx = tgt.x - u.x;
    const dy = tgt.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = this.effectiveSkillRangeTo(u, tgt);
    const margin = this.meleeEngagementMarginPx(u, tgt);
    if (dist > reach + margin) return;
    if (this.tryCastKnightHeroHolySanction(u, tgt)) {
      u.heroHolySanctionCdRem = HOLY_SANCTION_CD_SEC;
    }
  }

  private applyDamage(target: SimUnit, amount: number, ctx?: DamageCtx): void {
    if (target.dead || amount <= 0) return;

    if (target.invincible) return;

    if (target.invulnerable && target.side === 'ally' && !this.knightIsCharging(target)) return;

    if (
      target.side === 'ally' &&
      target.allyKind === 'assassin' &&
      (target.assassinDodgeRem ?? 0) > 0 &&
      ctx?.attacker?.side === 'enemy' &&
      Math.random() < ASSASSIN_BOND6_DODGE_CHANCE
    ) {
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 28, '闪避', 'buff'),
      );
      return;
    }

    if (
      !ctx?.skipWarriorShare &&
      this.run.warriorDamageShare &&
      target.side === 'ally' &&
      target.allyKind === 'warrior' &&
      ctx?.attacker?.side === 'enemy'
    ) {
      const pool = this.alive('ally').filter((u) => u.allyKind === 'warrior');
      if (pool.length > 1) {
        const share = amount / pool.length;
        for (const w of pool) {
          this.applyDamage(w, share, { ...ctx, skipWarriorShare: true });
        }
        return;
      }
    }

    let amt = amount;
    if (target.side === 'enemy' && ctx?.attacker?.side === 'ally') {
      amt *= this.run.damageDealtMultAllies;
      if (this.unitHasSkill(target, 'skill_ultralisk_mage_fragile') && ctx.attacker.allyKind === 'mage') {
        const ul = getSkillById('skill_ultralisk_mage_fragile');
        amt *= skillParamNumber(ul, 0, 2);
      }
      amt *= this.enemyClassWeaknessMult(target, ctx.attacker);
      if ((target.evilFrenzyBuffT ?? 0) > 0 && this.unitHasSkill(target, 'skill_evil_strenth')) {
        const ev = getSkillById('skill_evil_strenth');
        amt *= 1 + skillParamNumber(ev, 3, 30) / 100;
      }
      if ((target.raiderLeapBuffT ?? 0) > 0 && this.unitHasSkill(target, 'skill_raider_leap')) {
        const rd = getSkillById('skill_raider_leap');
        amt *= skillParamNumber(rd, 3, 0.5);
      }
      if (target.bossId && this.run.bossDamageBonusVsFinalBoss > 0 && this.meta.kind === 'boss') {
        amt *= 1 + this.run.bossDamageBonusVsFinalBoss;
      }
      if (
        this.bondStacks.mage >= 10 &&
        target.enemyCreatureType === '元素'
      ) {
        amt *= 1 + MAGE_BOND_ELEMENT_DAMAGE_BONUS;
      }
    }
    if (target.side === 'ally' && ctx?.attacker?.side === 'enemy') {
      amt *= this.run.damageTakenMultAllies;
      if (
        (ctx.attacker.evilFrenzyBuffT ?? 0) > 0 &&
        this.unitHasSkill(ctx.attacker, 'skill_evil_strenth')
      ) {
        const ev = getSkillById('skill_evil_strenth');
        amt *= 1 + skillParamNumber(ev, 2, 50) / 100;
      }
      amt *= this.enemyDefiasFeverDamageMult(ctx.attacker);
      if (
        target.allyKind === 'priest' &&
        this.run.priestAllyProtection &&
        this.alive('ally').some((a) => a.allyKind !== 'priest')
      ) {
        amt *= 0.5;
      }
      if (target.druidForm === 'bear' && target.allyKind === 'druid' && this.bondStacks.druid >= 3) {
        amt *= DRUID_BEAR_DAMAGE_RETAIN;
      }
    }

    const showFloat = ctx?.showFloat !== false;
    let blockedLabel = false;
    if (
      target.side === 'ally' &&
      target.allyKind === 'mage' &&
      (target.arcaneWardHitsLeft ?? 0) > 0 &&
      ctx?.attacker?.side === 'enemy' &&
      !ctx?.bypassBlock &&
      !ctx?.trueDamage
    ) {
      target.arcaneWardHitsLeft = Math.max(0, (target.arcaneWardHitsLeft ?? 0) - 1);
      if (showFloat) {
        this.floatWords.push(
          spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 24, '护盾', 'shield'),
        );
      }
      return;
    }

    if (!ctx?.bypassBlock && target.side === 'ally' && target.allyKind === 'warrior' && ctx?.attacker && ctx.attacker.side === 'enemy') {
      const srcRanged = ctx.attacker.range >= RANGED_ATTACK_RANGE_THRESHOLD;
      const ws = this.bondStacks.warrior;
      const canTryBlock = !srcRanged || warriorBondBlocksRanged(ws);
      if (canTryBlock) {
        let extraChance = 0;
        if (target.heroId === WARRIOR_WHIRL_BLUE_ID || target.heroId === 'warrior_02') extraChance += 0.1;
        if (Math.random() < warriorBondBlockChance(ws, extraChance)) {
          const before = amt;
          amt *= warriorBondBlockDamageRetain(ws);
          if (before > amt + 0.01) blockedLabel = true;
          if (warriorBondCounterOnBlock(ws) && ctx.attacker) {
            this.applyDamage(ctx.attacker, target.atk, { attacker: target, bypassBlock: true });
            target.flashT = 0.14;
            this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 52, 0xfde047, 0.42));
          }
        }
      }
    }
    if (target.side === 'ally' && ctx?.attacker?.side === 'enemy') {
      amt = this.applyArcherSnareTrapMitigate(target, amt, ctx);
    }

    let dmgToHp = Math.max(0, Math.round(amt));
    let shieldAbsorbed = 0;
    if (!ctx?.trueDamage && dmgToHp > 0) {
      const sh0 = Math.floor(target.shield ?? 0);
      if (sh0 > 0) {
        const absorb = Math.min(sh0, dmgToHp);
        target.shield = Math.max(0, sh0 - absorb);
        dmgToHp -= absorb;
        shieldAbsorbed = absorb;
      }
    }

    if (
      target.side === 'ally' &&
      target.allyKind === 'knight' &&
      (target.knightDeathDenyLeft ?? 0) > 0 &&
      dmgToHp >= target.hp
    ) {
      target.knightDeathDenyLeft = 0;
      target.hp = Math.max(1, Math.round(target.maxHp * KNIGHT_BOND_DEATH_DENY_HEAL_RATIO));
      target.invincible = true;
      target.invincibleT = KNIGHT_BOND_DEATH_DENY_INVINC_SEC;
      target.knightState = 'fight';
      target.collisionDisabled = false;
      target.knightChargeTargetId = null;
      if (target.knightInvulnFx) {
        target.knightInvulnFx.destroy({ children: true });
      }
      const ir = target.tokenInnerR ?? target.hitRadiusPx;
      const fx = new VanishInvulnRingFx();
      fx.position.set(0, -ir);
      target.body.addChild(fx);
      target.knightInvulnFx = fx;
      this.floatWords.push(
        spawnFloatNumber(
          this.floatLayer,
          target.x,
          this.floatAnchorY(target) - Math.round(44 * LAYOUT_SCALE),
          '无敌',
          'buff',
        ),
      );
      this.syncUnitHpRing(target);
      return;
    }

    const prevHp = target.hp;
    const rawAfter = target.hp - dmgToHp;
    target.hp = Math.min(target.maxHp, Math.max(0, rawAfter));
    if (target.side === 'ally' && target.allyKind === 'assassin' && target.hp > 0) {
      this.tryAssassinVanishOnLowHp(target);
    }
    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
      this.clearSnareTrapGfx(target);
      this.onBattleUnitDied(target);
      if (!target.bossId) {
        if (target.hpRingCur) target.hpRingCur.visible = false;
        if (target.hpRingLost) target.hpRingLost.visible = false;
        if (target.hpRingShield) target.hpRingShield.visible = false;
        if (this.unitHasSkill(target, 'skill_boom')) {
          this.procSkillBoomExplosion(target);
          target.boomSkipDeathAnim = true;
          target.root.visible = false;
        } else {
          const launch = this.buildDeathLaunch(target.x);
          const ir = target.tokenInnerR ?? target.hitRadiusPx;
          target.deathAnim = {
            elapsed: 0,
            maxT: launch.maxT,
            wx: target.x,
            wy: target.y + ir,
            vx: launch.vx,
            vy: launch.vy,
            g: launch.g,
            spin: (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 32),
            trailTimer: 0,
          };
          target.root.visible = true;
          target.root.alpha = 1;
          target.body.rotation = 0;
          target.body.origin.set(0, -ir);
        }
      } else {
        target.root.visible = false;
      }
    }
    this.recomputeEnemyHp();

    const lost = Math.max(0, Math.round(prevHp - target.hp));
    if (lost > 0 && target.side === 'enemy' && ctx?.attacker?.side === 'ally') {
      this.bumpBattleDamageStat(ctx.attacker, lost);
    }
    if (lost > 0 && target.hitFlashOverlay) {
      target.hitFlashT = HIT_FLASH_DUR * (ctx?.hotStrikeHeavy ? 3.5 : 1);
    }
    if (ctx?.attacker && !target.dead && ctx.attacker.side === 'enemy' && target.side === 'ally') {
      this.maybeDarkspearKnockback(ctx.attacker, target);
    }
    if (lost > 0 && ctx?.attacker && !ctx.poisonStrikeDot) {
      this.maybeStackPoisonStrike(ctx.attacker, target);
    }
    if (target.side === 'enemy' && ctx?.attacker && !ctx.attacker.dead) {
      this.maybeRecordGyroMissileRetaliateTarget(target, ctx.attacker);
    }
    if (
      lost > 0 &&
      ctx?.meleeBasic &&
      ctx.damageTag !== 'magic' &&
      ctx.attacker &&
      !ctx.attacker.dead &&
      ctx.attacker.side === 'ally' &&
      !target.bossId &&
      ctx.attacker.range < RANGED_ATTACK_RANGE_THRESHOLD &&
      Math.random() < 0.2
    ) {
      const kb = Math.round((20 + Math.random() * 30) * LAYOUT_SCALE);
      this.knockbackTargetFromAttacker(target, ctx.attacker, kb);
    }
    if (lost <= 0 && shieldAbsorbed > 0 && showFloat) {
      this.floatWords.push(
        spawnFloatNumber(
          this.floatLayer,
          target.x,
          this.floatAnchorY(target),
          `-${shieldAbsorbed}`,
          'block',
        ),
      );
    }
    if (lost > 0 && showFloat) {
      const kind =
        ctx?.damageTag === 'crit' ? 'crit' : ctx?.damageTag === 'magic' ? 'magic' : 'damage';
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target), `-${lost}`, kind),
      );
      if (ctx?.hotStrikeHeavy) {
        this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, target.x, target.y));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x + target.hitRadiusPx * 0.22, target.y));
        this.ringFx.push(
          spawnRingPulse(this.fxLayer, target.x, target.y, target.hitRadiusPx * 1.45, 0xef4444, 0.42),
        );
        this.ringFx.push(
          spawnRingPulse(this.floatLayer, target.x, target.y, target.hitRadiusPx * 2.05, 0xf97316, 0.48, {
            delay: 0.04,
          }),
        );
      } else if (Math.random() < 0.45) {
        this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, target.x, target.y));
      }
    }
    if (blockedLabel && showFloat && target.allyKind === 'warrior') {
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 28, '格挡', 'block'),
      );
    }
    if (target.bossId && this.unitHasSkill(target, 'skill_berserker') && target.bossBerserkBaseAtk != null && !target.dead) {
      this.syncBossBerserkFromHp(target);
    }
  }

  private recomputeEnemyHp(): void {
    this.currentEnemyHp = this.alive('enemy').reduce((s, u) => s + u.hp, 0);
  }

  private allyOutgoingDamageMult(_u: SimUnit): number {
    return 1;
  }

  private knightIsCharging(u: SimUnit): boolean {
    return u.allyKind === 'knight' && u.knightState === 'charge';
  }

  /** 硬控命中：打断非首领的蓄力/引导（骑士冲锋、术士恐惧等） */
  private interruptNonBossEnemyCastFromControl(target: SimUnit): boolean {
    if (target.side !== 'enemy' || target.dead || target.bossId) return false;

    if (target.defiasBandageChannel) {
      this.endDefiasBandageChannel(target, 'knight_charge_interrupt');
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 32, '打断', 'magic'),
      );
      return true;
    }

    const st = target.bossSkillCast;
    if (!st) return false;

    if (st.kind === 'blade_storm_warn' || st.kind === 'blade_storm_channel') {
      this.interruptBossBladeStorm(target, '骑士冲锋·打断');
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 32, '打断', 'magic'),
      );
      return true;
    }
    if (st.kind === 'overload_explosion_channel') {
      this.interruptBossOverloadExplosion(target, '骑士冲锋·打断', false);
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 32, '打断', 'magic'),
      );
      return true;
    }
    if (st.kind === 'punch_windup' || st.kind === 'rush_windup' || st.kind === 'rhahk_smash_windup') {
      st.warnFx.destroy({ children: true });
      target.bossSkillCast = undefined;
      this.bossPutSkillOnCooldown(target, st.skillId);
      this.logBattleSkill(st.skillId, target, '蓄力·骑士冲锋打断');
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 32, '打断', 'magic'),
      );
      return true;
    }
    if (st.kind === 'rush_charge') {
      if (st.warnFx) this.disposeBossRushWarnFx(st);
      target.bossSkillCast = undefined;
      this.bossPutSkillOnCooldown(target, 'skill_boss_rush');
      this.logBattleSkill('skill_boss_rush', target, '冲锋·骑士冲锋打断');
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target) - 32, '打断', 'magic'),
      );
      return true;
    }
    return false;
  }

  private beginKnightCharge(u: SimUnit): void {
    u.knightState = 'charge';
    u.collisionDisabled = true;
    u.invulnerable = false;
    const t = this.farthestEnemy(u);
    u.knightChargeTargetId = t?.unitId ?? null;
  }

  private tickKnightMoveHeal(u: SimUnit, movedPx: number): void {
    if (this.bondStacks.knight < 10 || movedPx <= 0) return;
    u.knightMoveHealAccPx = (u.knightMoveHealAccPx ?? 0) + movedPx;
    while ((u.knightMoveHealAccPx ?? 0) >= KNIGHT_MOVE_HEAL_THRESH_PX) {
      u.knightMoveHealAccPx = (u.knightMoveHealAccPx ?? 0) - KNIGHT_MOVE_HEAL_THRESH_PX;
      const heal = Math.max(1, Math.round(u.maxHp * KNIGHT_BOND_MOVE_HEAL_MAX_HP_RATIO));
      this.applyHeal(u, heal, u);
    }
  }

  private snareTrapEffectSec(): number {
    return this.bondStacks.archer >= 6 ? SNARE_TRAP_EFFECT_SEC_BOND6 : SNARE_TRAP_EFFECT_SEC;
  }

  private snareTrapAppliesTo(u: SimUnit): boolean {
    if (this.bondStacks.archer >= 15) return this.isRangedAttacker(u);
    return u.allyKind === 'archer';
  }

  private ensureSnareTrapGfx(u: SimUnit): void {
    if (u.snareTrapGfx || u.dead) return;
    const ir = u.hitRadiusPx;
    const g = createArcherSnareTrapRing(ir);
    g.position.set(0, -ir);
    u.root.addChildAt(g, 0);
    u.snareTrapGfx = g;
  }

  private syncSnareTrapGfxVisual(u: SimUnit): void {
    const b = u.snareTrapBuff;
    const g = u.snareTrapGfx;
    if (!g) return;
    if (!b) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const active = b.activeRemainSec > 0;
    g.tint = active ? 0xfef08a : 0xffffff;
    g.alpha = active ? 0.95 : 0.72;
  }

  private clearSnareTrapGfx(u: SimUnit): void {
    if (u.snareTrapGfx) {
      u.snareTrapGfx.destroy();
      u.snareTrapGfx = undefined;
    }
  }

  private grantSnareTrapBuff(u: SimUnit): void {
    u.snareTrapBuff = { armedRemainSec: SNARE_TRAP_BUFF_SEC, activeRemainSec: 0 };
  }

  /** 陷阱首次触发：脚底环 + 脉冲（上 Buff 时不播） */
  private playSnareTrapTriggerFx(u: SimUnit): void {
    this.ensureSnareTrapGfx(u);
    this.syncSnareTrapGfxVisual(u);
    const c = this.unitBattleTokenCenterXY(u);
    this.ringFx.push(spawnRingPulse(this.fxLayer, c.x, c.y, u.hitRadiusPx * 1.85, 0x84cc16, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, c.x, c.y, u.hitRadiusPx * 2.1, 0xa3e635, 0.48));
  }

  private applyBattleOpenArcherSnareTrap(): void {
    const caster = this.alive('ally').find((u) => isArcherSnareTrapHero(u.heroId));
    if (!caster) return;
    for (const a of this.alive('ally')) {
      if (!this.snareTrapAppliesTo(a)) continue;
      this.grantSnareTrapBuff(a);
    }
    this.floatBattleSkillName(SKILL_HERO_ARCHER_SNARE_TRAP, caster);
    this.logBattleSkill(SKILL_HERO_ARCHER_SNARE_TRAP, caster, 'opening_trap');
  }

  private tickArcherSnareTrapBuffs(dt: number): void {
    for (const u of this.alive('ally')) {
      const b = u.snareTrapBuff;
      if (!b) continue;
      if (b.activeRemainSec > 0) {
        b.activeRemainSec = Math.max(0, b.activeRemainSec - dt);
        if (b.activeRemainSec <= 0) {
          u.snareTrapBuff = undefined;
          this.clearSnareTrapGfx(u);
        } else {
          this.syncSnareTrapGfxVisual(u);
        }
        continue;
      }
      if (b.armedRemainSec > 0) {
        b.armedRemainSec = Math.max(0, b.armedRemainSec - dt);
        if (b.armedRemainSec <= 0) {
          u.snareTrapBuff = undefined;
        }
      }
    }
  }

  private isPhysicalDamage(ctx?: DamageCtx): boolean {
    return ctx?.damageTag !== 'magic';
  }

  private trySnareTrapStun(buff: NonNullable<SimUnit['snareTrapBuff']>, attacker: SimUnit): void {
    if (this.bondStacks.archer < 10) return;
    if (buff.stunUsed || attacker.bossId) return;
    attacker.stunT = Math.max(attacker.stunT ?? 0, SNARE_TRAP_STUN_SEC);
    buff.stunUsed = true;
    this.ringFx.push(spawnRingPulse(this.fxLayer, attacker.x, attacker.y, 40, 0x86efac, 0.45));
  }

  private applyArcherSnareTrapMitigate(target: SimUnit, amt: number, ctx?: DamageCtx): number {
    const b = target.snareTrapBuff;
    if (!b) return amt;
    if (!ctx?.attacker || ctx.attacker.side !== 'enemy') return amt;
    if (!this.isPhysicalDamage(ctx)) return amt;

    if (b.activeRemainSec > 0) {
      this.trySnareTrapStun(b, ctx.attacker);
      this.syncSnareTrapGfxVisual(target);
      return 1;
    }
    if (b.armedRemainSec > 0) {
      b.activeRemainSec = this.snareTrapEffectSec();
      this.trySnareTrapStun(b, ctx.attacker);
      this.playSnareTrapTriggerFx(target);
      return 1;
    }
    return amt;
  }

  private dealAllyHit(u: SimUnit, target: SimUnit, baseDmg: number, ctx?: DamageCtx): void {
    let dmg = baseDmg * this.allyOutgoingDamageMult(u);
    if (u.allyKind === 'archer') {
      const cap = archerBondFocusCap(this.bondStacks.archer);
      if (target.unitId === u.archerLockedAttackTargetId) {
        const st = Math.min(cap, u.archerFocusStacks ?? 0);
        dmg *= 1 + 0.03 * st;
        u.archerFocusStacks = Math.min(cap, st + 1);
      }
    }
    let damageTag: DamageCtx['damageTag'] =
      u.allyKind === 'mage' || u.allyKind === 'warlock' ? 'magic' : ctx?.damageTag;
    let critP = (u.bonusCrit ?? 0) + this.run.chaoticAllyCritBonus;
    if (u.allyKind === 'mage') critP += this.run.mageCritChance;
    if (u.allyKind === 'archer') critP += this.run.archerCritChance;
    if (u.allyKind === 'assassin' && this.bondStacks.assassin >= 3) critP += ASSASSIN_BOND3_CRIT_BONUS;
    if (Math.random() < critP) {
      if (u.allyKind === 'archer') dmg *= this.run.archerCritDamageMult;
      else dmg *= 1.5;
      damageTag = 'crit';
    }
    const hpBefore = u.allyKind === 'warlock' ? target.hp : 0;
    this.applyDamage(target, dmg, {
      ...ctx,
      attacker: u,
      damageTag,
      meleeBasic: !this.isRangedAttacker(u),
    });
    if (u.allyKind === 'warlock') {
      this.onWarlockAllyHit(u, target, Math.max(0, hpBefore - target.hp));
    }
    if (u.allyKind === 'assassin' && u.assassinBlinkStunNext && !target.dead && !target.bossId) {
      u.assassinBlinkStunNext = false;
      this.applyEnemyHardControlStun(target, ASSASSIN_BOND10_BLINK_STUN_SEC);
    }
    if (u.druidForm === 'bear') {
      this.maybeDruidBearSwipe(u, target);
    }
    this.maybeMulanWhirlwindAfterAllyHit(u, target);
    if (Math.random() < 0.55) {
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    }
    if (u.allyKind === 'mage') {
      const splashR = this.mageSplashRadiusPx();
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, splashR, 0x38bdf8, 0.38));
      const splashDmg = Math.max(1, Math.round(u.atk * MAGE_SPLASH_COEFF));
      for (const e of this.alive('enemy')) {
        if (e.unitId === target.unitId) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= splashR + e.hitRadiusPx) {
          this.applyDamage(e, splashDmg, { attacker: u, damageTag: 'magic' });
        }
      }
    }
  }

  private interruptHeroArcaneMissilesChannel(u: SimUnit): void {
    if (!u.heroArcaneChannel) return;
    u.heroArcaneChannel = undefined;
    u.heroArcaneCdRem = ARCANE_MISSILE_CD_SEC;
    this.logBattleSkill('skill_hero_mage_arcane_missiles', u, 'channel_interrupt');
  }

  private finishHeroArcaneMissilesChannel(u: SimUnit): void {
    u.heroArcaneChannel = undefined;
    u.heroArcaneCdRem = ARCANE_MISSILE_CD_SEC;
    this.logBattleSkill('skill_hero_mage_arcane_missiles', u, 'channel_end');
  }

  /** 法师签名英雄（mage_01 / mage_02）：奥术飞弹引导；返回 true 时本帧不再走通用普攻/移动尾段 */
  private tickHeroMageArcaneMissiles(u: SimUnit, dt: number, kbActive: boolean): boolean {
    const mageBond = this.bondStacks.mage;
    const interval = mageBond >= 10 ? ARCANE_MISSILE_INTERVAL_BOND10 : ARCANE_MISSILE_INTERVAL_DEFAULT;
    const maxBolts = Math.ceil(ARCANE_MISSILE_CHANNEL_SEC / interval - 1e-9);
    const ch = u.heroArcaneChannel;

    if (ch) {
      const target = this.byId(ch.targetId);
      if (!target || target.dead) {
        this.interruptHeroArcaneMissilesChannel(u);
        return false;
      }
      const dx = target.x - u.x;
      const dy = target.y - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = this.effectiveSkillRangeTo(u, target);
      const margin = this.meleeEngagementMarginPx(u, target);
      const aimDist = reach + margin;
      const rangeSlack = Math.max(8, Math.round(10 * LAYOUT_SCALE));
      if (dist > aimDist + rangeSlack) {
        this.interruptHeroArcaneMissilesChannel(u);
        return false;
      }

      ch.t += dt;
      const coef = mageBond >= 6 ? ARCANE_MISSILE_COEF_BOND6 : ARCANE_MISSILE_COEF_BASE;
      while (ch.boltsFired < maxBolts && ch.t + 1e-8 >= ch.boltsFired * interval) {
        const uid = u.unitId;
        const tid = ch.targetId;
        ch.boltsFired += 1;
        this.queueProjectile(
          u,
          tid,
          () => {
            this.dealHeroArcaneMissileHit(uid, tid, coef);
          },
          { style: 'ally_arcane_missile', speedMul: 1.2 },
        );
      }

      if (ch.t >= ARCANE_MISSILE_CHANNEL_SEC) {
        this.finishHeroArcaneMissilesChannel(u);
      }

      if (!kbActive && dist > aimDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const stepLen = u.speed * dt;
        const travel = Math.min(stepLen, Math.max(0, dist - aimDist));
        u.x += nx * travel;
        u.y += ny * travel;
        this.syncUnitRootFromStance(u);
      }
      return true;
    }

    const cdLeft = u.heroArcaneCdRem ?? 0;
    if (cdLeft > 0) {
      u.heroArcaneCdRem = Math.max(0, cdLeft - dt);
    }
    if ((u.heroArcaneCdRem ?? 0) > 0) return false;
    if (kbActive) return false;

    const target = this.nearestEnemy(u);
    if (!target) return false;
    const dx = target.x - u.x;
    const dy = target.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = this.effectiveSkillRangeTo(u, target);
    const margin = this.meleeEngagementMarginPx(u, target);
    const aimDist = reach + margin;
    if (dist > aimDist) return false;

    u.heroArcaneChannel = { targetId: target.unitId, t: 0, boltsFired: 0 };
    this.floatWords.push(
      spawnFloatNumber(
        this.floatLayer,
        u.x,
        this.floatAnchorY(u) - Math.round(40 * LAYOUT_SCALE),
        '奥术飞弹',
        'magic',
      ),
    );
    this.logBattleSkill(
      'skill_hero_mage_arcane_missiles',
      u,
      `channel_start → #${target.unitId} bondMage=${mageBond}`,
    );
    return true;
  }

  private dealHeroArcaneMissileHit(attackerUid: number, targetUid: number, coef: number): void {
    const attacker = this.byId(attackerUid);
    const target = this.byId(targetUid);
    if (!attacker || !target || attacker.dead || target.dead) return;
    const mageBond = this.bondStacks.mage;
    let dmg = Math.max(1, Math.round(attacker.atk * coef * this.allyOutgoingDamageMult(attacker)));
    let critP = (attacker.bonusCrit ?? 0) + this.run.chaoticAllyCritBonus + this.run.mageCritChance;
    let critMul = 1.5;
    if (mageBond >= 15 && target.bossId) {
      critP += 0.5;
      critMul *= 1.5;
    }
    let damageTag: DamageCtx['damageTag'] = 'magic';
    if (Math.random() < critP) {
      dmg = Math.max(1, Math.round(dmg * critMul));
      damageTag = 'crit';
    }
    this.applyDamage(target, dmg, { attacker, damageTag });
    this.ringFx.push(
      spawnRingPulse(
        this.floatLayer,
        target.x,
        target.y,
        Math.round(36 * LAYOUT_SCALE),
        0x7dd3fc,
        0.42,
      ),
    );
    if (Math.random() < 0.5) {
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    }
  }

  /** 旋风斩刀刃外沿：`strike` + 自身碰撞 + 存活敌方最大碰撞（与伤害 `reach` 外扩一致） */
  private mulanWhirlwindOuterRadiusPx(u: SimUnit, strikeR: number): number {
    const ru = this.hitRadius(u);
    let maxRe = Math.round(18 * LAYOUT_SCALE);
    for (const e of this.alive('enemy')) maxRe = Math.max(maxRe, this.hitRadius(e));
    return strikeR + ru + maxRe;
  }

  /**
   * 旋风斩**播放**用几何：原点为圆盘中心；内缘在环形血条外缘外 `MULAN_WHIRL_BLADE_OUTSIDE_HP_RING_DESIGN_PX`（设计 px）；
   * 外缘为 `mulanWhirlwindOuterRadiusPx`（与伤害判距外扩一致），每帧随场上敌人更新。
   */
  private mulanWhirlwindBladeGeometry(
    u: SimUnit,
    strikeRadiusPx: number,
  ): { innerR: number; outerR: number } | null {
    const ir = u.tokenInnerR ?? u.hitRadiusPx;
    const strike = strikeRadiusPx;
    if (!(strike > 0 && ir >= 0 && Number.isFinite(strike) && Number.isFinite(ir))) return null;
    const outerR = this.mulanWhirlwindOuterRadiusPx(u, strike);
    const tr = u.tokenRing;
    let innerR: number;
    if (tr) {
      const hpOuter = battleTokenHpRingOuterRadiusPx(tr.ringR, tr.thick);
      innerR = hpOuter + Math.round(MULAN_WHIRL_BLADE_OUTSIDE_HP_RING_DESIGN_PX * LAYOUT_SCALE);
    } else {
      const fillR = battleTokenDiskFillRadiusPx(ir);
      const hubPad = Math.max(2, 2 * LAYOUT_SCALE);
      innerR = fillR + hubPad;
    }
    const minBlade = Math.max(2.5, 3 * LAYOUT_SCALE);
    const bladeLen = outerR - innerR;
    if (!(bladeLen > minBlade && outerR > innerR)) return null;
    return { innerR, outerR };
  }

  /** 开发测试页右下日志：`devBattleTestLog`；含旋风斩分段与 `[battle-skill]`。 */
  private logDevBattleTest(line: string): void {
    this.run.devBattleTestLog?.(line);
  }

  /** 战士签名英雄（warrior_01 / warrior_02）：普攻命中后对周身敌方追加旋风斩（数值档与 `heroRegistry` 文案一致） */
  private maybeMulanWhirlwindAfterAllyHit(u: SimUnit, _primary: SimUnit): void {
    if (u.side !== 'ally' || !isWarriorWhirlwindHero(u.heroId)) return;
    if ((u.mulanWhirlwindProcLockT ?? 0) > 0) return;
    const w = this.bondStacks.warrior;
    const procP = w >= 10 ? 0.25 : 0.15;
    if (Math.random() >= procP) return;
    u.mulanWhirlwindProcLockT = MULAN_WHIRL_PROC_LOCK_SEC;
    const dmgCoef = w >= 6 ? 0.8 : 0.4;
    const radius = MULAN_WHIRL_R_BASE;
    this.logBattleEvent('旋风斩', 'hero_mulan_whirlwind', u, `warriorBond=${w} strikeDesignPx=${MULAN_WHIRL_STRIKE_RADIUS_DESIGN_PX}`);
    const whirlRed = w >= 15;
    const basePer = u.atk * dmgCoef;
    const hits: { enemyUnitId: number; parts: readonly number[]; tag: 'crit' | 'magic' }[] = [];
    let healTargetCount = 0;
    const ru = this.hitRadius(u);
    for (const e of this.alive('enemy')) {
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      /** 表定旋风半径为「周身」逻辑距离；判距为圆心距叠加双方碰撞圆 */
      const reach = radius + ru + this.hitRadius(e);
      if (d > reach) continue;
      let hit = basePer;
      if (whirlRed && e.hp / Math.max(1, e.maxHp) <= 0.5) hit *= 2;
      const rounded = Math.max(1, Math.round(hit));
      const tag: 'crit' | 'magic' = whirlRed ? 'crit' : 'magic';
      this.applyDamage(e, rounded, { attacker: u, damageTag: tag, showFloat: false });
      this.logDevBattleTest(`旋风斩·伤害 entity=${e.unitId} ${rounded}`);
      hits.push({ enemyUnitId: e.unitId, parts: this.splitDamageIntoTenParts(rounded), tag });
      healTargetCount += 1;
    }
    const geom = this.mulanWhirlwindBladeGeometry(u, radius);
    if (!geom) {
      this.logDevBattleTest(`旋风斩·无飘字(几何) 仍结算命中=${hits.length}`);
      if (w >= 10 && healTargetCount > 0) {
        const heal = Math.max(1, Math.round(u.maxHp * 0.03 * healTargetCount));
        this.applyHeal(u, heal, u);
      }
      return;
    }
    const c = this.unitBattleTokenCenterXY(u);
    const irTok = u.tokenInnerR ?? u.hitRadiusPx;
    this.floatWords.push(
      spawnFloatNumber(
        this.floatLayer,
        c.x,
        c.y - unitFloatLabelOffsetYForInnerR(irTok) * 0.42,
        '旋风斩',
        'buff',
      ),
    );
    const g = new Graphics();
    this.fxLayer.addChild(g);
    this.mulanWhirlRings.push({
      g,
      t: 0,
      unitId: u.unitId,
      strikeRadiusPx: radius,
      spin: 0,
      scarlet: whirlRed,
      damageFloatEmitted: 0,
      hits,
    });
    if (w >= 10 && healTargetCount > 0) {
      const heal = Math.max(1, Math.round(u.maxHp * 0.03 * healTargetCount));
      this.applyHeal(u, heal, u);
    }
  }

  /** 将整数总伤拆成 10 份（之和等于 total），用于旋风斩 1 秒内 10 次飘字表现 */
  private splitDamageIntoTenParts(total: number): number[] {
    const t = Math.max(0, Math.round(total));
    const parts = Array.from({ length: 10 }, () => 0);
    if (t === 0) return parts;
    const base = Math.floor(t / 10);
    let rem = t - base * 10;
    for (let i = 0; i < 10; i++) parts[i] = base;
    for (let i = 0; i < rem; i++) parts[i]! += 1;
    return parts;
  }

  private tickMulanWhirlwindRings(dt: number): void {
    for (let i = this.mulanWhirlRings.length - 1; i >= 0; i--) {
      const r = this.mulanWhirlRings[i]!;
      const u = this.byId(r.unitId);
      if (!u || u.dead) {
        r.g.destroy();
        this.mulanWhirlRings.splice(i, 1);
        continue;
      }
      r.t += dt;
      const geom = this.mulanWhirlwindBladeGeometry(u, r.strikeRadiusPx);
      if (!geom) {
        r.g.destroy();
        this.mulanWhirlRings.splice(i, 1);
        continue;
      }
      const { innerR, outerR } = geom;
      const c = this.unitBattleTokenCenterXY(u);
      r.g.position.set(c.x, c.y);
      r.spin += dt * Math.PI * 26;
      drawMulanWhirlwindBladeRing(r.g, innerR, outerR, r.spin, r.scarlet);

      while (r.damageFloatEmitted < 10 && r.t + 1e-9 >= (r.damageFloatEmitted + 1) * 0.1) {
        const k = r.damageFloatEmitted;
        r.damageFloatEmitted += 1;
        for (const h of r.hits) {
          const chunk = h.parts[k] ?? 0;
          if (chunk <= 0) continue;
          const e = this.byId(h.enemyUnitId);
          if (!e || e.dead) continue;
          const jx = ((((h.enemyUnitId * 17 + k * 5) % 11) - 5) * LAYOUT_SCALE) / 1.2;
          const jy = ((((h.enemyUnitId * 3 + k * 7) % 9) - 4) * LAYOUT_SCALE) / 1.4;
          const kind = h.tag === 'crit' ? 'crit' : 'magic';
          this.logDevBattleTest(`旋风斩·数字 ${k + 1}/10 entity=${h.enemyUnitId} ${chunk}`);
          this.floatWords.push(
            spawnFloatNumber(
              this.floatLayer,
              e.x + jx,
              this.floatAnchorY(e) + jy * 0.35,
              `-${chunk}`,
              kind,
            ),
          );
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, e.x + jx * 0.35, e.y + jy * 0.25));
        }
      }

      if (r.t >= MULAN_WHIRL_PROC_LOCK_SEC) {
        r.g.destroy();
        this.mulanWhirlRings.splice(i, 1);
      }
    }
  }

  private maybeDoubleShotArcher(u: SimUnit, target: SimUnit, baseDmg: number): void {
    const p = archerBondDoubleShotChance(this.bondStacks.archer);
    if (u.allyKind !== 'archer' || p <= 0) return;
    if (Math.random() >= p) return;
    u.cd = Math.max(0.08, this.effectiveAttackInterval(u) * 0.35);
    this.slashes.push(spawnDualShotSlash(this.fxLayer, u.x, u.y));
    const uid = u.unitId;
    const tid = target.unitId;
    this.queueProjectile(u, tid, () => {
      const a = this.units.find((x) => x.unitId === uid && !x.dead);
      const t = this.byId(tid);
      if (!a || !t) return;
      this.dealAllyHit(a, t, baseDmg);
    });
  }

  private tickMeteor(dt: number): void {
    if (this.bondStacks.mage < 15) return;
    const mages = this.alive('ally').filter((u) => u.allyKind === 'mage');
    if (!mages.length) return;
    this.meteorCd -= dt;
    if (this.meteorCd > 0) return;
    this.meteorCd = MAGE_BOND_METEOR_INTERVAL_SEC;
    const enemies = this.alive('enemy');
    if (!enemies.length) return;
    const epicenter = enemies[Math.floor(Math.random() * enemies.length)]!;
    const sumAtk = mages.reduce((s, m) => s + m.atk, 0);
    const dmgEach = Math.max(1, Math.round(sumAtk * MAGE_BOND_METEOR_ATK_COEFF));
    let meteorTag: 'crit' | 'magic' = 'magic';
    if (this.run.mageMeteorCrits && Math.random() < this.run.mageCritChance) {
      meteorTag = 'crit';
    }
    this.meteors.push(spawnMeteorAnim(this.fxLayer, epicenter.x, epicenter.y, METEOR_SPLASH_RADIUS));
    for (const e of enemies) {
      const d = Math.hypot(e.x - epicenter.x, e.y - epicenter.y);
      if (d <= METEOR_SPLASH_RADIUS + e.hitRadiusPx) {
        let dmg = dmgEach;
        if (meteorTag === 'crit') dmg = Math.round(dmg * 1.5);
        this.applyDamage(e, dmg, {
          attacker: mages[0],
          bypassBlock: true,
          damageTag: meteorTag,
        });
      }
    }
  }

  private tickKnightCharge(u: SimUnit, dt: number): void {
    let tgt = this.byId(u.knightChargeTargetId);
    if (!tgt || tgt.dead) tgt = this.farthestEnemy(u);
    if (!tgt) {
      u.knightState = 'fight';
      u.collisionDisabled = false;
      u.knightCooldown = KNIGHT_CHARGE_COOLDOWN_SEC;
      u.knightChargeTargetId = null;
      return;
    }
    u.knightChargeTargetId = tgt.unitId;
    const dx = tgt.x - u.x;
    const dy = tgt.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rSum = this.hitRadius(u) + this.hitRadius(tgt);
    const chargeHitDist = KNIGHT_CHARGE_HIT_DIST + rSum;
    if (dist <= chargeHitDist) {
      const mul = knightBondChargeDamageMult(this.bondStacks.knight);
      this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, 70, 0xfbbf24, 0.42));
      let dmgHit = u.atk * mul;
      if (tgt.bossId) dmgHit *= this.run.knightVsBossDamageMult;
      this.applyDamage(tgt, dmgHit, { attacker: u });
      this.interruptNonBossEnemyCastFromControl(tgt);
      if (this.bondStacks.knight >= 6 && !tgt.bossId && !tgt.dead) {
        this.applyEnemyHardControlStun(tgt, KNIGHT_BOND_CHARGE_STUN_SEC);
      }
      u.knightState = 'fight';
      u.collisionDisabled = false;
      u.knightCooldown = KNIGHT_CHARGE_COOLDOWN_SEC;
      u.knightChargeTargetId = null;
      return;
    }
    const sp = u.speed * KNIGHT_CHARGE_SPEED_MULT;
    const nx = dx / dist;
    const ny = dy / dist;
    const step = sp * dt;
    const travel = Math.min(step, Math.max(0, dist - chargeHitDist * 0.85));
    u.x += nx * travel;
    u.y += ny * travel;
    this.tickKnightMoveHeal(u, travel);
    this.syncUnitRootFromStance(u);
  }

  private tickPriest(u: SimUnit, dt: number, targetEnemy: SimUnit | null): void {
    if (u.heroId && isPriestMassShelterHero(u.heroId)) {
      const cdCap = this.priestMassShelterCooldownCapSec();
      const rem = u.heroShelterCdRem ?? 0;
      if (rem > 0) {
        u.heroShelterCdRem = Math.max(0, rem - dt);
      } else {
        if (this.tryCastPriestMassShelter(u)) {
          u.heroShelterCdRem = cdCap;
        } else {
          u.heroShelterCdRem = 0.35;
        }
      }
    }

    const healPick = this.pickPriestHealTarget(u);
    let healAmt = u.atk * priestBondHealCoeff(this.bondStacks.priest);

    if (healPick) {
      const ht = healPick.target;
      if (
        this.bondStacks.priest >= 15 &&
        ht.hp / Math.max(1, ht.maxHp) < PRIEST_BOND_LOW_HP_HEAL_THRESHOLD
      ) {
        healAmt *= PRIEST_BOND_LOW_HP_HEAL_MULT;
      }
      if (healPick.inRange || this.bondStacks.priest >= 15) {
        u.cd -= dt;
        if (u.cd <= 0) {
          this.applyHeal(ht, healAmt, u);
          u.cd = Math.max(0.25, this.effectiveAttackInterval(u));
        }
        return;
      }
      const healDx = ht.x - u.x;
      const healDy = ht.y - u.y;
      const healDist = Math.hypot(healDx, healDy) || 1;
      const healReach = this.effectiveSkillRangeTo(u, ht);
      const healMargin = this.meleeEngagementMarginPx(u, ht);
      const healAim = healReach + healMargin;
      if (healDist > healAim) {
        const nx = healDx / healDist;
        const ny = healDy / healDist;
        const stepLen = u.speed * dt;
        const travel = Math.min(stepLen, Math.max(0, healDist - healAim));
        u.x += nx * travel;
        u.y += ny * travel;
        this.syncUnitRootFromStance(u);
      }
      return;
    }

    if (!targetEnemy) return;
    const dx = targetEnemy.x - u.x;
    const dy = targetEnemy.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const atkReach = this.effectiveSkillRangeTo(u, targetEnemy);
    const atkMargin = this.meleeEngagementMarginPx(u, targetEnemy);
    const atkAim = atkReach + atkMargin;
    const stepLen = u.speed * dt;
    const travelAtk = Math.min(stepLen, Math.max(0, dist - atkAim));
    const atkStuck =
      dist > atkAim &&
      travelAtk < Math.min(1.25, stepLen * 0.04) &&
      dist <= atkAim + Math.max(18, Math.round(24 * LAYOUT_SCALE));
    if (dist <= atkAim || atkStuck) {
      u.cd -= dt;
      if (u.cd <= 0) {
        const dmg = u.atk;
        const uid = u.unitId;
        const tid = targetEnemy.unitId;
        u.cd = Math.max(0.25, this.effectiveAttackInterval(u));
        if (this.isRangedAttacker(u)) {
          const nx = dx / dist;
          const ny = dy / dist;
          this.queueProjectile(u, tid, () => {
            const a = this.units.find((x) => x.unitId === uid && !x.dead);
            const t = this.byId(tid);
            if (!a || !t) return;
            this.applyDamage(t, dmg, { attacker: a });
          });
          u.atkLungeT = ATTACK_LUNGE_DUR;
          u.atkLungeDx = nx;
          u.atkLungeDy = ny;
        } else {
          this.applyDamage(targetEnemy, dmg, { attacker: u, meleeBasic: !this.isRangedAttacker(u) });
          u.atkLungeT = ATTACK_LUNGE_DUR;
          u.atkLungeDx = dx / dist;
          u.atkLungeDy = dy / dist;
        }
      }
    } else {
      const nx = dx / dist;
      const ny = dy / dist;
      u.x += nx * travelAtk;
      u.y += ny * travelAtk;
      this.syncUnitRootFromStance(u);
    }
  }

  /** 蓄力轰击：扇形半角 15°（弧度） */
  private static readonly BOSS_PUNCH_HALF_RAD = ((75 / 2) / 180) * Math.PI;

  private bossSkillStateKey(boss: SimUnit, skillId: string): string {
    return `${boss.unitId}|${skillId}`;
  }

  private bossSkillInitialCdSec(skillId: string, def: SkillDef | undefined): number {
    if (skillId === SKILL_TAUREN_STOMP) return TAUREN_STOMP_INIT_CD_SEC;
    if (skillId === SKILL_TAUREN_SHOCKWAVE) return TAUREN_SHOCKWAVE_INIT_CD_SEC;
    return skillParamNumber(def, 1, 0);
  }

  private bossSkillCooldownSec(skillId: string, def: SkillDef | undefined): number {
    if (skillId === SKILL_TAUREN_STOMP) return TAUREN_STOMP_CD_SEC;
    if (skillId === SKILL_TAUREN_SHOCKWAVE) return TAUREN_SHOCKWAVE_CD_SEC;
    return skillParamNumber(def, 0, 12);
  }

  private ensureBossConfiguredCdInit(boss: SimUnit): void {
    for (const sid of boss.skillIds) {
      if (!isBossConfiguredSkill(sid)) continue;
      const def = getSkillById(sid);
      if (!skillFiresInBattle(def)) continue;
      const k = this.bossSkillStateKey(boss, sid);
      if (this.bossSkillCdRemain.has(k)) continue;
      this.bossSkillCdRemain.set(k, this.bossSkillInitialCdSec(sid, def));
    }
  }

  private tickBossConfiguredSkillCds(boss: SimUnit, dt: number, skipSkillId: string | null): void {
    for (const sid of boss.skillIds) {
      if (!isBossConfiguredSkill(sid)) continue;
      const def = getSkillById(sid);
      if (!skillFiresInBattle(def)) continue;
      if (skipSkillId && sid === skipSkillId) continue;
      const k = this.bossSkillStateKey(boss, sid);
      const cur = this.bossSkillCdRemain.get(k) ?? 0;
      this.bossSkillCdRemain.set(k, Math.max(0, cur - dt));
    }
  }

  private bossConfiguredSkillMayCast(boss: SimUnit, skillId: string): boolean {
    if (skillId === SKILL_SUMMON_MOB_POOL) {
      const def = getSkillById(skillId);
      const gate = skillParamNumber(def, 4, 50) / 100;
      if (boss.hp / Math.max(1, boss.maxHp) > gate) return false;
    }
    return true;
  }

  private pickReadyBossSkill(boss: SimUnit): string | null {
    let best: string | null = null;
    let bestFinish = Number.POSITIVE_INFINITY;
    let bestOrder = 999;
    const allies = this.alive('ally');
    if (!allies.length) return null;
    boss.skillIds.forEach((sid, ord) => {
      if (!isBossConfiguredSkill(sid)) return;
      const def = getSkillById(sid);
      if (!skillFiresInBattle(def)) return;
      if (!this.bossConfiguredSkillMayCast(boss, sid)) return;
      const k = this.bossSkillStateKey(boss, sid);
      const cd = this.bossSkillCdRemain.get(k) ?? 0;
      if (cd > 1e-4) return;
      const fin = this.bossSkillLastFinish.get(k) ?? -1e9;
      if (fin < bestFinish || (fin === bestFinish && ord < bestOrder)) {
        bestFinish = fin;
        bestOrder = ord;
        best = sid;
      }
    });
    return best;
  }

  private startBossSkillFromReady(boss: SimUnit, skillId: string): void {
    if (skillId === 'skill_boss_punch') this.startBossPunchWindup(boss);
    else if (skillId === 'skill_boss_rush') this.startBossRushWindup(boss);
    else if (skillId === 'skill_rhahk_smash') this.startBossRhahkSmashWindup(boss);
    else if (skillId === 'skill_rhahk_warcry') this.castRhahkWarcry(boss);
    else if (skillId === SKILL_BLADE_STORM) this.startBossBladeStormWarn(boss);
    else if (skillId === SKILL_BLINK_FAN) this.castBossBlinkFan(boss);
    else if (skillId === SKILL_OVERLOAD_EXPLOSION) this.startBossOverloadExplosion(boss);
    else if (skillId === SKILL_OVERLOAD_LASER) this.castBossOverloadLaser(boss);
    else if (skillId === SKILL_JETPACK_ASSAULT) this.startBossJetpackAssault(boss);
    else if (skillId === SKILL_VANISH_AMBUSH) this.startBossVanishAmbush(boss);
    else if (skillId === SKILL_SUMMON_MOB_POOL) this.castBossMobPoolSummon(boss);
    else if (skillId === SKILL_TAUREN_STOMP) this.castTaurenStomp(boss);
    else if (skillId === SKILL_TAUREN_SHOCKWAVE) this.castTaurenShockwave(boss);
  }

  private bossArenaRayMaxDist(x: number, y: number, dx: number, dy: number): number {
    const arenaPad = Math.round(12 * LAYOUT_SCALE);
    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const margin = Math.round(52 * LAYOUT_SCALE);
    const minX = arenaPad + margin;
    const maxX = GAME_WIDTH - arenaPad - margin;
    const minY = arenaTop + margin;
    const maxY = arenaTop + arenaH - margin;
    let tMax = 1e9;
    if (dx > 1e-6) tMax = Math.min(tMax, (maxX - x) / dx);
    else if (dx < -1e-6) tMax = Math.min(tMax, (minX - x) / dx);
    if (dy > 1e-6) tMax = Math.min(tMax, (maxY - y) / dy);
    else if (dy < -1e-6) tMax = Math.min(tMax, (minY - y) / dy);
    return Math.max(0, tMax);
  }

  private pickBossPunchAimAngle(boss: SimUnit): number {
    const allies = this.alive('ally').map((a) => ({ x: a.x, y: a.y, hitRadiusPx: a.hitRadiusPx }));
    if (!allies.length) return 0;
    const def = getSkillById('skill_boss_punch');
    const rTab = skillParamDesignPx(def, 2, 200);
    const rOuter = rTab + this.hitRadius(boss);
    let bestA = 0;
    let bestN = -1;
    for (let deg = 0; deg < 360; deg += 4) {
      const ang = (deg / 180) * Math.PI;
      const n = countAlliesInPunchSector(allies, boss.x, boss.y, ang, BattleScreen.BOSS_PUNCH_HALF_RAD, rOuter);
      if (n > bestN) {
        bestN = n;
        bestA = ang;
      }
    }
    return bestA;
  }

  private pickBossRushLine(boss: SimUnit, lineLen: number): { dirx: number; diry: number; effLen: number } {
    const allies = this.alive('ally').map((a) => ({ x: a.x, y: a.y, hitRadiusPx: a.hitRadiusPx }));
    const bx = boss.x;
    const by = boss.y;
    const halfW = this.hitRadius(boss);
    let bestDx = 1;
    let bestDy = 0;
    let bestScore = -1;
    for (let deg = 0; deg < 360; deg += 4) {
      const ang = (deg / 180) * Math.PI;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const tEdge = this.bossArenaRayMaxDist(bx, by, dx, dy) - Math.round(4 * LAYOUT_SCALE);
      const eff = Math.min(lineLen, tEdge);
      const ex = bx + dx * eff;
      const ey = by + dy * eff;
      const n = countAlliesNearOpenSegment(allies, bx, by, ex, ey, halfW);
      if (n > bestScore) {
        bestScore = n;
        bestDx = dx;
        bestDy = dy;
      }
    }
    const tEdge = this.bossArenaRayMaxDist(bx, by, bestDx, bestDy) - Math.round(4 * LAYOUT_SCALE);
    const effLen = Math.max(Math.round(24 * LAYOUT_SCALE), Math.min(lineLen, tEdge));
    return { dirx: bestDx, diry: bestDy, effLen };
  }

  private interruptRhahkSmash(boss: SimUnit, st: BossRhahkSmashWindupState, reason: string): void {
    st.warnFx.destroy({ children: true });
    boss.bossSkillCast = undefined;
    this.bossPutSkillOnCooldown(boss, 'skill_rhahk_smash');
    this.logBattleSkill('skill_rhahk_smash', boss, reason);
  }

  private startBossRhahkSmashWindup(boss: SimUnit): void {
    const def = getSkillById('skill_rhahk_smash');
    if (!def) return;
    const primary = this.nearestAlly(boss);
    if (!primary) return;
    const dur = skillParamNumber(def, 2, 2);
    const rMax = skillParamDesignPx(def, 4, 125);
    const cx = primary.x;
    const cy = primary.y;
    const warnFx = new BossSmashCircleWarnFx({ cx, cy, rMax, windupSec: dur });
    this.fxLayer.addChildAt(warnFx, 0);
    boss.bossSkillCast = {
      kind: 'rhahk_smash_windup',
      skillId: 'skill_rhahk_smash',
      t: 0,
      dur,
      targetId: primary.unitId,
      cx,
      cy,
      rMax,
      warnFx,
    };
    this.logBattleSkill('skill_rhahk_smash', boss, `蓄力开始 → #${primary.unitId}`);
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private applyRhahkSmashImpact(boss: SimUnit, st: BossRhahkSmashWindupState): void {
    const def = getSkillById('skill_rhahk_smash');
    const coeff = skillParamNumber(def, 3, 180) / 100;
    const primary = this.byId(st.targetId);
    const kbDist = Math.round(40 * LAYOUT_SCALE);
    let any = false;
    let hitPrimary = false;
    for (const a of this.alive('ally')) {
      const d = Math.hypot(a.x - st.cx, a.y - st.cy);
      if (d > st.rMax + a.hitRadiusPx) continue;
      const isPrimary = primary && !primary.dead && a.unitId === primary.unitId;
      const mult = isPrimary ? RHAKH_SMASH_PRIMARY_DMG_MULT : 1;
      any = true;
      const dmg = Math.max(1, Math.round(boss.atk * coeff * mult));
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
      if (isPrimary) {
        hitPrimary = true;
        if (a.rhahkSmashCrackGfx) {
          a.rhahkSmashCrackGfx.destroy();
          a.rhahkSmashCrackGfx = undefined;
        }
        const innerR = a.tokenInnerR ?? a.hitRadiusPx;
        a.rhahkSmashCrackGfx = attachRhahkSmashCrackOverlay(a.body, innerR);
        a.rhahkSmashCrackT = 1.35;
      } else {
        this.knockbackAllyRadialFromPoint(a, st.cx, st.cy, kbDist);
      }
      if (a.hitFlashOverlay) a.hitFlashT = HIT_FLASH_DUR * (isPrimary ? 2.8 : 2.2);
      for (let k = 0; k < (isPrimary ? 4 : 2); k++) {
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x + (k - 1) * 8 * LAYOUT_SCALE, a.y));
      }
    }
    this.bossPutSkillOnCooldown(boss, 'skill_rhahk_smash');
    this.logBattleSkill('skill_rhahk_smash', boss, any ? '猛击结算' : '未命中');
    this.triggerBattleScreenShake(hitPrimary ? 0.28 : 0.18, Math.round((hitPrimary ? 16 : 10) * LAYOUT_SCALE));
  }

  private castRhahkWarcry(boss: SimUnit): void {
    const def = getSkillById('skill_rhahk_warcry');
    if (!def) return;
    if (boss.rhahkWarcryBaseAtk == null) boss.rhahkWarcryBaseAtk = boss.atk;
    const healPct = skillParamNumber(def, 3, 10) / 100;
    const heal = Math.max(1, Math.round(boss.maxHp * healPct));
    boss.hp = Math.min(boss.maxHp, boss.hp + heal);
    boss.rhahkWarcryStacks = (boss.rhahkWarcryStacks ?? 0) + 1;
    this.syncRhahkWarcryAtk(boss);
    if (boss.rhahkWarcryRimG && boss.tokenInnerR != null) {
      redrawRhahkWarcryBossRim(boss.rhahkWarcryRimG, boss.tokenInnerR, boss.rhahkWarcryStacks);
    }
    this.syncUnitHpRing(boss);
    if (boss.tokenDisk && boss.tokenInnerR != null) {
      const pres = spawnRhahkWarcryPresentation(
        this.fxLayer,
        boss.x,
        boss.y,
        this.hitRadius(boss),
        boss.tokenDisk,
        boss.tokenInnerR,
      );
      this.rhahkWarcryFx.push(pres);
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, boss.x, this.floatAnchorY(boss) - 44, '战吼', 'buff'),
    );
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, boss.x, this.floatAnchorY(boss) - 12, `+${heal}`, 'heal'),
    );
    this.bossPutSkillOnCooldown(boss, 'skill_rhahk_warcry');
    this.logBattleSkill(
      'skill_rhahk_warcry',
      boss,
      `层数=${boss.rhahkWarcryStacks} 攻=${boss.atk} 治疗=${heal}`,
    );
  }

  private tickGenericSkillPresentationFx(dt: number): void {
    tickBladeStormShatter(this.bladeStormShatter, dt);
    tickBlinkAfterimages(this.blinkAfterimages, dt);
    tickVoidWalkAfterimages(this.voidWalkAfterimages, dt);
    tickOverloadExplosionWaves(this.overloadExplosionWaves, dt);
    tickOverloadShieldBreaks(this.overloadShieldBreaks, dt);
    tickOverloadLaserBeams(this.overloadLaserBeams, dt);
    this.tickBangBangBombProjectiles(dt);
    this.tickGyroHomingMissiles(dt);
    tickJetpackSmokePuffs(this.jetpackSmokePuffs, dt);
    const { arrived } = tickFanKnifeProjectiles(this.fanKnives, dt);
    for (const p of arrived) {
      const tgt = this.byId(p.targetId);
      if (tgt && !tgt.dead) {
        const ir = tgt.tokenInnerR ?? tgt.hitRadiusPx;
        if (tgt.fanKnifeSlashGfx) tgt.fanKnifeSlashGfx.destroy();
        tgt.fanKnifeSlashGfx = flashFanKnifeHit(tgt.body, ir);
        tgt.fanKnifeSlashT = 0.14;
      }
    }
    for (let i = this.fanKnifeSlashFlashes.length - 1; i >= 0; i--) {
      const f = this.fanKnifeSlashFlashes[i]!;
      f.t += dt;
      f.g.alpha = Math.max(0, 1 - f.t / 0.14);
      if (f.t >= 0.14) {
        f.g.destroy();
        this.fanKnifeSlashFlashes.splice(i, 1);
      }
    }
    for (const u of this.units) {
      if ((u.fanKnifeSlashT ?? 0) > 0) {
        u.fanKnifeSlashT = Math.max(0, (u.fanKnifeSlashT ?? 0) - dt);
        if ((u.fanKnifeSlashT ?? 0) <= 0 && u.fanKnifeSlashGfx) {
          u.fanKnifeSlashGfx.destroy();
          u.fanKnifeSlashGfx = undefined;
        }
      }
    }
  }

  private maybeStackPoisonStrike(attacker: SimUnit, target: SimUnit): void {
    if (!this.unitHasSkill(attacker, SKILL_POISON_STRIKE)) return;
    if (attacker.dead || target.dead || target.side !== 'ally' || attacker.side !== 'enemy') return;
    const def = getSkillById(SKILL_POISON_STRIKE);
    if (!def) return;
    const maxStacks = Math.max(1, Math.round(skillParamNumber(def, 2, 100)));
    const dur = skillParamNumber(def, 1, 10);
    const prevStacks = target.poisonStrikeStacks ?? 0;
    const stacks = Math.min(maxStacks, prevStacks + 1);
    target.poisonStrikeStacks = stacks;
    target.poisonStrikeRemainSec = dur;
    target.poisonStrikeSourceId = attacker.unitId;
    target.poisonStrikeAtkSnap = attacker.atk;
    if (prevStacks === 0) {
      target.poisonStrikeTickAcc = 0;
    }
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 24, 0x22c55e, 0.42));
    if (stacks === 1 || stacks % 5 === 0) {
      this.logBattleSkill(SKILL_POISON_STRIKE, attacker, `→ #${target.unitId} 层=${stacks}`);
    }
  }

  private tickAllyPoisonStrikeDot(u: SimUnit, dt: number): void {
    const rem = u.poisonStrikeRemainSec ?? 0;
    const stacks = u.poisonStrikeStacks ?? 0;
    if (rem <= 0 || stacks <= 0) {
      if (rem <= 0) {
        u.poisonStrikeRemainSec = undefined;
        u.poisonStrikeStacks = undefined;
        u.poisonStrikeSourceId = undefined;
        u.poisonStrikeAtkSnap = undefined;
        u.poisonStrikeTickAcc = undefined;
      }
      return;
    }
    const def = getSkillById(SKILL_POISON_STRIKE);
    const pct = skillParamNumber(def, 0, 3) / 100;
    const srcId = u.poisonStrikeSourceId;
    const src = srcId != null ? (this.byId(srcId) ?? undefined) : undefined;
    const atk =
      src && !src.dead && this.unitHasSkill(src, SKILL_POISON_STRIKE)
        ? src.atk
        : (u.poisonStrikeAtkSnap ?? 0);
    u.poisonStrikeRemainSec = rem - dt;
    u.poisonStrikeTickAcc = (u.poisonStrikeTickAcc ?? 0) + dt;
    if ((u.poisonStrikeTickAcc ?? 0) >= 1) {
      u.poisonStrikeTickAcc = (u.poisonStrikeTickAcc ?? 0) - 1;
      const dmg = Math.max(1, Math.round(atk * pct * stacks));
      this.applyDamage(u, dmg, {
        attacker: src,
        damageTag: 'magic',
        poisonStrikeDot: true,
        showFloat: true,
      });
    }
    if ((u.poisonStrikeRemainSec ?? 0) <= 0) {
      u.poisonStrikeRemainSec = undefined;
      u.poisonStrikeStacks = undefined;
      u.poisonStrikeSourceId = undefined;
      u.poisonStrikeAtkSnap = undefined;
      u.poisonStrikeTickAcc = undefined;
    }
  }

  private syncBladeStormWarnRim(boss: SimUnit, t: number, dur: number): void {
    const phase = Math.floor((t / Math.max(0.08, dur)) * 6);
    const on = phase % 2 === 0;
    boss.body.tint = on ? 0xef4444 : 0xffffff;
  }

  private restoreBossTokenRingAfterBladeWarn(boss: SimUnit): void {
    boss.body.tint = 0xffffff;
    this.syncUnitHpRing(boss);
  }

  private interruptBossBladeStorm(boss: SimUnit, reason: string): void {
    const st = boss.bossSkillCast;
    if (!st || (st.kind !== 'blade_storm_warn' && st.kind !== 'blade_storm_channel')) return;
    if (st.kind === 'blade_storm_channel') {
      const c = this.unitBattleTokenCenterXY(boss);
      this.bladeStormShatter.push(...spawnBladeStormShatter(this.fxLayer, c.x, c.y));
      st.bladeGfx.destroy();
      if (this.bladeStormTrail) {
        this.bladeStormTrail.g.destroy();
        this.bladeStormTrail = null;
      }
    }
    boss.bossSkillCast = undefined;
    boss.bladeStormWarnFlashT = undefined;
    this.restoreBossTokenRingAfterBladeWarn(boss);
    this.bossPutSkillOnCooldown(boss, SKILL_BLADE_STORM);
    this.logBattleSkill(SKILL_BLADE_STORM, boss, reason);
  }

  private startBossBladeStormWarn(boss: SimUnit): void {
    const def = getSkillById(SKILL_BLADE_STORM);
    if (!def) return;
    boss.bossSkillCast = {
      kind: 'blade_storm_warn',
      skillId: SKILL_BLADE_STORM,
      t: 0,
      dur: BLADE_STORM_WARN_SEC,
    };
    this.logBattleSkill(SKILL_BLADE_STORM, boss, '预警');
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private beginBossBladeStormChannel(boss: SimUnit): void {
    const def = getSkillById(SKILL_BLADE_STORM);
    if (!def) return;
    const dur = skillParamNumber(def, 2, 8);
    const radius = skillParamDesignPx(def, 4, 100);
    const coeff = skillParamNumber(def, 3, 100) / 100;
    const bladeGfx = new Graphics();
    bladeGfx.eventMode = 'none';
    const c = this.unitBattleTokenCenterXY(boss);
    bladeGfx.position.set(c.x, c.y);
    this.fxLayer.addChild(bladeGfx);
    if (this.bladeStormTrail) this.bladeStormTrail.g.destroy();
    this.bladeStormTrail = createBladeStormTrail(this.fxLayer);
    boss.bossSkillCast = {
      kind: 'blade_storm_channel',
      skillId: SKILL_BLADE_STORM,
      t: 0,
      dur,
      radius,
      coeffPerSec: coeff,
      spin: 0,
      bladeGfx,
      dmgTickAcc: 0,
    };
    this.restoreBossTokenRingAfterBladeWarn(boss);
    this.logBattleSkill(SKILL_BLADE_STORM, boss, `引导开始 r=${radius}`);
  }

  private bladeStormBladeGeometry(boss: SimUnit, radius: number): { innerR: number; outerR: number } | null {
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    const fillR = battleTokenDiskFillRadiusPx(ir);
    const innerR = fillR + Math.round(4 * LAYOUT_SCALE);
    const outerR = radius + this.hitRadius(boss);
    if (outerR <= innerR + 2) return null;
    return { innerR, outerR };
  }

  private moveBossDuringBladeStorm(boss: SimUnit, dt: number, radius: number): void {
    const allies = this.alive('ally');
    if (!allies.length) return;
    const inRange = allies.filter((a) => {
      const d = Math.hypot(a.x - boss.x, a.y - boss.y);
      return d <= radius + a.hitRadiusPx + this.hitRadius(boss);
    });
    const target = inRange.length ? this.nearestAlly(boss) : this.nearestAlly(boss);
    if (!target) return;
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = this.effectiveSkillRangeTo(boss, target);
    const margin = this.meleeEngagementMarginPx(boss, target);
    const aimDist = reach + margin;
    if (dist <= aimDist) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const step = boss.speed * dt;
    const travel = Math.min(step, dist - aimDist);
    if (travel <= 0) return;
    const nxPos = boss.x + nx * travel;
    const nyPos = boss.y + ny * travel;
    const c = this.clampBattleSpawnXY(nxPos, nyPos);
    boss.x = c.x;
    boss.y = c.y;
    this.syncUnitRootFromStance(boss);
  }

  private tickBossBladeStormChannel(boss: SimUnit, st: BossBladeStormChannelState, dt: number): void {
    st.t += dt;
    st.spin += dt * Math.PI * 22;
    this.moveBossDuringBladeStorm(boss, dt, st.radius);
    const c = this.unitBattleTokenCenterXY(boss);
    if (this.bladeStormTrail) {
      pushBladeStormTrailPoint(this.bladeStormTrail, c.x, c.y);
      redrawBladeStormTrail(this.bladeStormTrail);
    }
    const geom = this.bladeStormBladeGeometry(boss, st.radius);
    if (geom) {
      st.bladeGfx.position.set(c.x, c.y);
      drawBladeStormKnifeRing(st.bladeGfx, geom.innerR, geom.outerR, st.spin);
    }
    st.dmgTickAcc += dt;
    if (st.dmgTickAcc >= 1) {
      st.dmgTickAcc -= 1;
      const dmg = Math.max(1, Math.round(boss.atk * st.coeffPerSec));
      for (const a of this.alive('ally')) {
        const d = Math.hypot(a.x - boss.x, a.y - boss.y);
        if (d > st.radius + a.hitRadiusPx + this.hitRadius(boss)) continue;
        this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
      }
    }
    if (st.t >= st.dur) {
      st.bladeGfx.destroy();
      if (this.bladeStormTrail) {
        this.bladeStormTrail.g.destroy();
        this.bladeStormTrail = null;
      }
      boss.bossSkillCast = undefined;
      this.bossPutSkillOnCooldown(boss, SKILL_BLADE_STORM);
      this.logBattleSkill(SKILL_BLADE_STORM, boss, '引导结束');
    }
  }

  private pickBlinkFanDestination(): { x: number; y: number } | null {
    const allies = this.alive('ally');
    if (!allies.length) return null;
    const clusterR = Math.round(100 * LAYOUT_SCALE);
    const candidates: { x: number; y: number }[] = allies.map((a) => ({ x: a.x, y: a.y }));
    for (let i = 0; i < allies.length; i++) {
      for (let j = i + 1; j < allies.length; j++) {
        candidates.push({
          x: (allies[i]!.x + allies[j]!.x) / 2,
          y: (allies[i]!.y + allies[j]!.y) / 2,
        });
      }
    }
    let best = candidates[0]!;
    let bestN = -1;
    for (const p of candidates) {
      let n = 0;
      for (const a of allies) {
        if (Math.hypot(a.x - p.x, a.y - p.y) <= clusterR) n += 1;
      }
      if (n > bestN) {
        bestN = n;
        best = p;
      }
    }
    return this.clampBattleSpawnXY(best.x, best.y);
  }

  private pushAlliesFromBlink(boss: SimUnit, pushR: number): void {
    const br = this.hitRadius(boss);
    for (const a of this.alive('ally')) {
      const d = Math.hypot(a.x - boss.x, a.y - boss.y);
      const minD = br + a.hitRadiusPx + 4;
      if (d >= minD) continue;
      const need = minD - d + pushR;
      this.knockbackAllyFromPoint(a, boss.x, boss.y, need);
    }
  }

  private castBossBlinkFan(boss: SimUnit): void {
    const def = getSkillById(SKILL_BLINK_FAN);
    if (!def) return;
    const dest = this.pickBlinkFanDestination();
    if (!dest) return;
    const x0 = boss.x;
    const y0 = boss.y;
    this.blinkAfterimages.push(spawnBlinkAfterimage(this.fxLayer, x0, y0, dest.x, dest.y));
    boss.x = dest.x;
    boss.y = dest.y;
    this.syncUnitRootFromStance(boss);
    this.pushAlliesFromBlink(boss, Math.round(36 * LAYOUT_SCALE));
    const interval = skillParamNumber(def, 2, 0.2);
    boss.bossBlinkFanVolley = {
      t: 0,
      dur: BLINK_FAN_VOLLEY_SEC,
      knifeAcc: 0,
      knifeInterval: interval,
      coeff: skillParamNumber(def, 3, 15) / 100,
      maxTargets: Math.max(1, Math.round(skillParamNumber(def, 4, 6))),
      knifeRange: Math.round(140 * LAYOUT_SCALE),
    };
    this.bossPutSkillOnCooldown(boss, SKILL_BLINK_FAN);
    this.logBattleSkill(SKILL_BLINK_FAN, boss, `闪现 (${Math.round(dest.x)},${Math.round(dest.y)})`);
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private fireBossBlinkFanKnives(boss: SimUnit, volley: BossBlinkFanVolleyState): void {
    const allies = this.alive('ally')
      .map((a) => ({ a, d: Math.hypot(a.x - boss.x, a.y - boss.y) }))
      .filter((x) => x.d <= volley.knifeRange + x.a.hitRadiusPx + this.hitRadius(boss))
      .sort((p, q) => p.d - q.d)
      .slice(0, volley.maxTargets);
    const c = this.unitBattleTokenCenterXY(boss);
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    const edge = battleTokenDiskFillRadiusPx(ir);
    for (const { a } of allies) {
      const ac = this.unitBattleTokenCenterXY(a);
      const ang = Math.atan2(ac.y - c.y, ac.x - c.x);
      const sx = c.x + Math.cos(ang) * edge;
      const sy = c.y + Math.sin(ang) * edge;
      this.fanKnives.push(spawnFanKnifeProjectile(this.fxLayer, sx, sy, ac.x, ac.y, a.unitId));
      const dmg = Math.max(1, Math.round(boss.atk * volley.coeff));
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic' });
    }
    if (allies.length) {
      this.logBattleSkill(SKILL_BLINK_FAN, boss, `刀扇 hit=${allies.length}`);
    }
  }

  private tickBossBlinkFanVolley(boss: SimUnit, dt: number): void {
    const v = boss.bossBlinkFanVolley;
    if (!v) return;
    if (boss.dead || (boss.stunT ?? 0) > 0) {
      boss.bossBlinkFanVolley = undefined;
      return;
    }
    v.t += dt;
    v.knifeAcc += dt;
    while (v.knifeAcc >= v.knifeInterval - 1e-6) {
      v.knifeAcc -= v.knifeInterval;
      this.fireBossBlinkFanKnives(boss, v);
    }
    if (v.t >= v.dur) boss.bossBlinkFanVolley = undefined;
  }

  private startBossPunchWindup(boss: SimUnit): void {
    const def = getSkillById('skill_boss_punch');
    if (!def) return;
    const dur = skillParamNumber(def, 3, 3);
    const rTab = skillParamDesignPx(def, 2, 200);
    const aim = this.pickBossPunchAimAngle(boss);
    const rOuter = rTab + this.hitRadius(boss);
    const warnFx = new BossPunchSectorWarnFx({
      cx: boss.x,
      cy: boss.y,
      aimAngle: aim,
      halfSpreadRad: BattleScreen.BOSS_PUNCH_HALF_RAD,
      rOuter,
      windupSec: dur,
    });
    this.fxLayer.addChildAt(warnFx, 0);
    boss.bossSkillCast = {
      kind: 'punch_windup',
      skillId: 'skill_boss_punch',
      t: 0,
      dur,
      aimAngle: aim,
      rOuter,
      cx: boss.x,
      cy: boss.y,
      warnFx,
    };
    this.logBattleSkill('skill_boss_punch', boss, '蓄力开始');
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private startBossRushWindup(boss: SimUnit): void {
    const def = getSkillById('skill_boss_rush');
    if (!def) return;
    const dur = skillParamNumber(def, 3, 3);
    const lineLen = skillParamDesignPx(def, 2, 600);
    const { dirx, diry, effLen } = this.pickBossRushLine(boss, lineLen);
    const halfW = this.hitRadius(boss);
    const sx = boss.x;
    const sy = boss.y;
    const warnFx = new BossRushLineWarnFx({
      startX: sx,
      startY: sy,
      dirx,
      diry,
      lineLen: effLen,
      halfW,
      windupSec: dur,
    });
    this.fxLayer.addChildAt(warnFx, 0);
    boss.bossSkillCast = {
      kind: 'rush_windup',
      skillId: 'skill_boss_rush',
      t: 0,
      dur,
      lineLen: effLen,
      halfW,
      dirx,
      diry,
      endX: sx + dirx * effLen,
      endY: sy + diry * effLen,
      startX: sx,
      startY: sy,
      warnFx,
    };
    this.logBattleSkill('skill_boss_rush', boss, '冲锋蓄力');
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private bossPutSkillOnCooldown(boss: SimUnit, skillId: string): void {
    const def = getSkillById(skillId);
    const cd = this.bossSkillCooldownSec(skillId, def);
    this.bossPutSkillOnCooldownSec(boss, skillId, cd);
  }

  private castTaurenStomp(boss: SimUnit): void {
    const def = getSkillById(SKILL_TAUREN_STOMP);
    if (!def) return;
    const coeff = skillParamNumber(def, 0, 0.105);
    const stunSec = skillParamNumber(def, 1, 2.6);
    const r = skillParamDesignPx(def, 2, 680);
    const dmg = Math.max(1, Math.round(boss.atk * coeff));
    let hit = 0;
    for (const a of this.alive('ally')) {
      const d = Math.hypot(a.x - boss.x, a.y - boss.y);
      if (d > r + a.hitRadiusPx) continue;
      hit += 1;
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
      this.applyAllyStun(a, stunSec);
      if (a.hitFlashOverlay) a.hitFlashT = HIT_FLASH_DUR * 1.8;
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
    }
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y, r * 0.35, 0x78716c, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y, r, 0xa8a29e, 0.32));
    this.triggerBattleScreenShake(0.2, Math.round(10 * LAYOUT_SCALE));
    this.floatBattleSkillName(SKILL_TAUREN_STOMP, boss);
    this.bossPutSkillOnCooldown(boss, SKILL_TAUREN_STOMP);
    this.logBattleSkill(SKILL_TAUREN_STOMP, boss, hit ? `命中${hit}` : '未命中');
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private castTaurenShockwave(boss: SimUnit): void {
    const def = getSkillById(SKILL_TAUREN_SHOCKWAVE);
    if (!def) return;
    const tgt = this.nearestAlly(boss);
    if (!tgt) return;
    let dirx = tgt.x - boss.x;
    let diry = tgt.y - boss.y;
    const mag = Math.hypot(dirx, diry) || 1;
    dirx /= mag;
    diry /= mag;
    const lenDesign = skillParamDesignPx(def, 0, 780);
    const halfW = skillParamDesignPx(def, 1, 70);
    const coeff = skillParamNumber(def, 2, 0.7125);
    const effLen = Math.min(lenDesign, this.bossArenaRayMaxDist(boss.x, boss.y, dirx, diry));
    const ax = boss.x;
    const ay = boss.y;
    const bx = ax + dirx * effLen;
    const by = ay + diry * effLen;
    let hit = 0;
    for (const a of this.alive('ally')) {
      const segD = distPointToSegment(a.x, a.y, ax, ay, bx, by);
      if (segD > halfW + a.hitRadiusPx) continue;
      const apx = a.x - ax;
      const apy = a.y - ay;
      let t = (apx * dirx + apy * diry) / Math.max(effLen, 1);
      t = Math.max(0, Math.min(1, t));
      const falloff = 1 - 0.55 * t;
      const dmg = Math.max(1, Math.round(boss.atk * coeff * falloff));
      hit += 1;
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
      if (a.hitFlashOverlay) a.hitFlashT = HIT_FLASH_DUR * 1.4;
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
    }
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const pulseR = Math.round(halfW * (0.55 + 0.25 * (1 - t)));
      this.ringFx.push(spawnRingPulse(this.fxLayer, px, py, pulseR, 0x38bdf8, 0.28 + 0.12 * (1 - t)));
    }
    this.floatBattleSkillName(SKILL_TAUREN_SHOCKWAVE, boss);
    this.bossPutSkillOnCooldown(boss, SKILL_TAUREN_SHOCKWAVE);
    this.logBattleSkill(SKILL_TAUREN_SHOCKWAVE, boss, hit ? `命中${hit}` : '未命中');
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private bossPutSkillOnCooldownSec(boss: SimUnit, skillId: string, cdSec: number): void {
    const k = this.bossSkillStateKey(boss, skillId);
    this.bossSkillCdRemain.set(k, Math.max(0, cdSec));
    this.bossSkillLastFinish.set(k, this.elapsed);
  }

  private refreshBossActiveSkillCds(boss: SimUnit): void {
    for (const sid of boss.skillIds) {
      if (!isBossConfiguredSkill(sid)) continue;
      const k = this.bossSkillStateKey(boss, sid);
      this.bossSkillCdRemain.set(k, 0);
    }
  }

  /** 过载爆炸引导中且护盾>0：免疫硬控 */
  private unitHasOverloadExplosionSuperArmor(u: SimUnit): boolean {
    return u.bossSkillCast?.kind === 'overload_explosion_channel' && (u.shield ?? 0) > 0;
  }

  private applyEnemyHardControlStun(target: SimUnit, stunSec: number, force = false): void {
    if (target.side !== 'enemy' || stunSec <= 0) return;
    if (target.invincible) return;
    if (!force && this.unitHasOverloadExplosionSuperArmor(target)) return;
    target.stunT = Math.max(target.stunT ?? 0, stunSec);
  }

  /**
   * 净化：仅清除 {@link battlePurgeDispel} 中 **green** 类我方 debuff。
   * 黄/红条目待萨满、牧师等技能扩展后再接。
   */
  battlePurgeAllyGreen(u: SimUnit): PurgeAllyGreenResult {
    const r = purgeAllyDebuffsGreen(u);
    if (!r.hadAny) return r;
    if (r.cleared.includes('stun')) {
      if (u.heroArcaneChannel) this.interruptHeroArcaneMissilesChannel(u);
      if (u.rfc4MindLashChannel) this.interruptRfc4MindLashChannel(u, 'purge');
      u.body.tint = 0xffffff;
    }
    this.syncUnitMoveSpeed(u);
    return r;
  }

  /**
   * 驱散：仅清除 {@link battlePurgeDispel} 中 **green** 类敌方 buff。
   */
  battleDispelEnemyGreen(u: SimUnit): DispelEnemyGreenResult {
    const r = dispelEnemyBuffsGreen(u);
    if (!r.hadAny) return r;
    if (r.cleared.includes('magic_shield') && u.overloadShieldBubbleGfx) {
      destroyOverloadShieldBubble(u.overloadShieldBubbleGfx);
      u.overloadShieldBubbleGfx = undefined;
    }
    if (r.cleared.includes('rhahk_warcry_stacks') && u.rhahkWarcryRimG && u.tokenInnerR != null) {
      redrawRhahkWarcryBossRim(u.rhahkWarcryRimG, u.tokenInnerR, 0);
    }
    this.syncUnitHpRing(u);
    return r;
  }

  private pickLowestHpAlly(): SimUnit | null {
    const allies = this.alive('ally');
    if (!allies.length) return null;
    let best = allies[0]!;
    for (const a of allies) {
      if (a.hp < best.hp) best = a;
    }
    return best;
  }

  private grantOverloadExplosionChannelShield(boss: SimUnit): void {
    const add = Math.max(1, Math.round(boss.maxHp * 0.1));
    const cap = boss.maxHp;
    const cur = Math.max(0, Math.floor(boss.shield ?? 0));
    boss.shield = Math.min(cap, cur + add);
    const gained = boss.shield - cur;
    if (gained > 0) {
      this.floatWords.push(
        spawnFloatNumber(
          this.floatLayer,
          boss.x,
          this.floatAnchorY(boss) - Math.round(22 * LAYOUT_SCALE),
          `护盾+${gained}`,
          'shield',
        ),
      );
    }
    this.syncUnitHpRing(boss);
    if (boss.overloadShieldBubbleGfx) destroyOverloadShieldBubble(boss.overloadShieldBubbleGfx);
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    if (boss.body) {
      boss.overloadShieldBubbleGfx = attachOverloadShieldBubble(boss.body, ir);
    }
  }

  private disposeBossOverloadExplosionFx(boss: SimUnit, st?: BossOverloadExplosionChannelState): void {
    destroyOverloadExplosionChannelBanner(st?.channelBanner);
    st?.rangeWarnFx?.destroy({ children: true });
    if (st?.shieldGfx) destroyOverloadShieldBubble(st.shieldGfx);
    if (boss.overloadShieldBubbleGfx) {
      destroyOverloadShieldBubble(boss.overloadShieldBubbleGfx);
      boss.overloadShieldBubbleGfx = undefined;
    }
  }

  private interruptBossOverloadExplosion(boss: SimUnit, reason: string, shieldBroken: boolean): void {
    const st = boss.bossSkillCast;
    if (st?.kind !== 'overload_explosion_channel') return;
    const c = this.unitBattleTokenCenterXY(boss);
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    if (shieldBroken) {
      this.overloadShieldBreaks.push(spawnOverloadShieldBreak(this.fxLayer, c.x, c.y, ir));
    }
    this.disposeBossOverloadExplosionFx(boss, st);
    boss.bossSkillCast = undefined;
    boss.body.scale.set(1);
    if (shieldBroken) {
      boss.stunT = Math.max(boss.stunT ?? 0, OVERLOAD_EXPLOSION_BREAK_STUN_SEC);
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, boss.x, this.floatAnchorY(boss) - 40, '护盾破碎', 'magic'),
      );
    }
    this.bossPutSkillOnCooldown(boss, SKILL_OVERLOAD_EXPLOSION);
    this.logBattleSkill(SKILL_OVERLOAD_EXPLOSION, boss, reason);
  }

  private applyBossOverloadExplosionImpact(boss: SimUnit, st: BossOverloadExplosionChannelState): void {
    const c = this.unitBattleTokenCenterXY(boss);
    const stunSec = OVERLOAD_EXPLOSION_HIT_STUN_SEC;
    this.overloadExplosionWaves.push(spawnOverloadExplosionWave(this.fxLayer, c.x, c.y, st.radius));
    this.triggerBattleScreenShake(0.32, Math.round(18 * LAYOUT_SCALE));
    let hits = 0;
    for (const a of this.alive('ally')) {
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (d > st.radius + a.hitRadiusPx + this.hitRadius(boss)) continue;
      hits += 1;
      const dmg = Math.max(1, Math.round(boss.atk * st.coeff));
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
      if (stunSec > 0) this.applyAllyStun(a, stunSec);
      if (a.hitFlashOverlay) a.hitFlashT = HIT_FLASH_DUR * 2.5;
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, boss.x, this.floatAnchorY(boss) - 48, '爆炸', 'crit'),
    );
    this.logBattleSkill(SKILL_OVERLOAD_EXPLOSION, boss, `爆炸命中=${hits}`);
  }

  private startBossOverloadExplosion(boss: SimUnit): void {
    const def = getSkillById(SKILL_OVERLOAD_EXPLOSION);
    if (!def) return;
    this.grantOverloadExplosionChannelShield(boss);
    const dur = skillParamNumber(def, 2, 8);
    const radius = skillParamDesignPx(def, 4, 300);
    const coeff = skillParamNumber(def, 3, 250) / 100;
    const rangeWarnFx = new OverloadExplosionRangeWarnFx();
    this.fxLayer.addChild(rangeWarnFx);
    const bc = this.unitBattleTokenCenterXY(boss);
    rangeWarnFx.tick(bc.x, bc.y, radius, 0);
    const bannerY = this.floatAnchorY(boss) - Math.round(52 * LAYOUT_SCALE);
    const channelBanner = spawnOverloadExplosionChannelBanner(this.floatLayer, bc.x, bannerY);
    boss.bossSkillCast = {
      kind: 'overload_explosion_channel',
      skillId: SKILL_OVERLOAD_EXPLOSION,
      t: 0,
      dur,
      radius,
      coeff,
      channelHadShield: (boss.shield ?? 0) > 0,
      shieldGfx: boss.overloadShieldBubbleGfx,
      pulsePhase: 0,
      rangeWarnFx,
      channelBanner,
    };
    this.logBattleSkill(SKILL_OVERLOAD_EXPLOSION, boss, `引导开始 护盾=${boss.shield ?? 0}`);
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private tickBossOverloadExplosionChannel(boss: SimUnit, st: BossOverloadExplosionChannelState, dt: number): void {
    st.t += dt;
    const bc = this.unitBattleTokenCenterXY(boss);
    if (st.channelBanner) {
      const bannerY = this.floatAnchorY(boss) - Math.round(52 * LAYOUT_SCALE);
      tickOverloadExplosionChannelBanner(st.channelBanner, bc.x, bannerY, dt);
    }
    st.rangeWarnFx?.tick(bc.x, bc.y, st.radius, st.t);
    st.pulsePhase += dt * 5.5;
    const pulse01 = 0.5 + 0.5 * Math.sin(st.pulsePhase);
    const ir = boss.tokenInnerR ?? boss.hitRadiusPx;
    if (st.shieldGfx) redrawOverloadShieldBubble(st.shieldGfx, ir, pulse01);
    if (boss.overloadShieldBubbleGfx) redrawOverloadShieldBubble(boss.overloadShieldBubbleGfx, ir, pulse01);
    const scale = 1 + pulse01 * 0.06;
    boss.body.scale.set(scale);
    if (st.channelHadShield && (boss.shield ?? 0) <= 0) {
      this.interruptBossOverloadExplosion(boss, '护盾破裂·中断', true);
      return;
    }
    if ((boss.shield ?? 0) > 0) st.channelHadShield = true;
    if (st.t >= st.dur) {
      this.applyBossOverloadExplosionImpact(boss, st);
      this.disposeBossOverloadExplosionFx(boss, st);
      boss.bossSkillCast = undefined;
      boss.body.scale.set(1);
      this.bossPutSkillOnCooldown(boss, SKILL_OVERLOAD_EXPLOSION);
    }
  }

  private castBossOverloadLaser(boss: SimUnit): void {
    const def = getSkillById(SKILL_OVERLOAD_LASER);
    if (!def) return;
    const target = this.pickLowestHpAlly();
    if (!target) return;
    this.floatBattleSkillName(SKILL_OVERLOAD_LASER, boss);
    const basePct = skillParamNumber(def, 2, 200);
    const step = skillParamNumber(def, 3, 50);
    const bonus = boss.overloadLaserPowerBonus ?? 0;
    const powerPct = basePct + bonus;
    const strengthenStacks = step > 0 ? Math.floor(bonus / step) : 0;
    const laserColors = overloadLaserColorCountFromStacks(strengthenStacks);
    const bc = this.unitBattleTokenCenterXY(boss);
    const tc = this.unitBattleTokenCenterXY(target);
    const dmg = Math.max(1, Math.round((boss.atk * powerPct) / 100));
    this.overloadLaserBeams.push(
      spawnOverloadLaserBeam(this.fxLayer, bc.x, bc.y, tc.x, tc.y, laserColors),
    );
    const prevHp = target.hp;
    this.applyDamage(target, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
    const killed = target.dead || target.hp <= 0;
    if (killed) {
      boss.overloadLaserPowerBonus = 0;
      const halfCd = skillParamNumber(def, 0, 6) / 2;
      this.bossPutSkillOnCooldownSec(boss, SKILL_OVERLOAD_LASER, halfCd);
      this.logBattleSkill(SKILL_OVERLOAD_LASER, boss, `击杀 #${target.unitId} 威力=${powerPct}% CD=${halfCd}s`);
    } else {
      boss.overloadLaserPowerBonus = bonus + step;
      this.bossPutSkillOnCooldown(boss, SKILL_OVERLOAD_LASER);
      this.logBattleSkill(
        SKILL_OVERLOAD_LASER,
        boss,
        `→ #${target.unitId} dmg=${dmg} hp ${prevHp}→${target.hp} 下次威力=${basePct + boss.overloadLaserPowerBonus}%`,
      );
    }
    if (target.hitFlashOverlay) target.hitFlashT = HIT_FLASH_DUR * 2;
  }

  private tickMechanoPioneerPassive(u: SimUnit): void {
    if (!this.unitHasSkill(u, SKILL_MECHANO_PIONEER) || u.mechanoPioneerUsed || u.dead) return;
    const def = getSkillById(SKILL_MECHANO_PIONEER);
    if (!def) return;
    const threshold = skillParamNumber(def, 0, 15) / 100;
    if (u.hp / Math.max(1, u.maxHp) > threshold) return;
    u.mechanoPioneerUsed = true;
    const shieldPct = skillParamNumber(def, 1, 10) / 100;
    const add = Math.max(1, Math.round(u.maxHp * shieldPct));
    const cur = Math.max(0, Math.floor(u.shield ?? 0));
    u.shield = Math.min(u.maxHp, cur + add);
    const gained = u.shield - cur;
    if (gained > 0) {
      this.floatWords.push(
        spawnFloatNumber(
          this.floatLayer,
          u.x,
          this.floatAnchorY(u) - Math.round(22 * LAYOUT_SCALE),
          `护盾+${gained}`,
          'shield',
        ),
      );
    }
    this.syncUnitHpRing(u);
    this.refreshBossActiveSkillCds(u);
    this.floatBattleSkillName(SKILL_MECHANO_PIONEER, u);
    this.logBattleSkill(SKILL_MECHANO_PIONEER, u, '主动技冷却已刷新');
  }

  private applyBossPunchImpact(boss: SimUnit, st: BossPunchWindupState): void {
    const def = getSkillById('skill_boss_punch');
    const coeff = skillParamNumber(def, 4, 200) / 100;
    let any = false;
    for (const a of this.alive('ally')) {
      if (
        !allyInPunchSector(
          a.x,
          a.y,
          a.hitRadiusPx,
          st.cx,
          st.cy,
          st.aimAngle,
          BattleScreen.BOSS_PUNCH_HALF_RAD,
          st.rOuter,
        )
      ) {
        continue;
      }
      any = true;
      const dmg = Math.max(1, Math.round(boss.atk * coeff));
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
      if (a.hitFlashOverlay) a.hitFlashT = HIT_FLASH_DUR * 2.6;
      for (let k = 0; k < 3; k++) {
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x + (k - 1) * 8 * LAYOUT_SCALE, a.y));
      }
    }
    this.bossPutSkillOnCooldown(boss, 'skill_boss_punch');
    this.logBattleSkill('skill_boss_punch', boss, any ? '轰击结算' : '未命中');
    this.triggerBattleScreenShake(0.22, Math.round(12 * LAYOUT_SCALE));
  }

  private beginBossRushCharge(boss: SimUnit, st: BossRushWindupState): void {
    const def = getSkillById('skill_boss_rush');
    const spd = Math.round(500 * LAYOUT_SCALE);
    const coeff = skillParamNumber(def, 4, 100) / 100;
    boss.bossSkillCast = {
      kind: 'rush_charge',
      skillId: 'skill_boss_rush',
      dirx: st.dirx,
      diry: st.diry,
      remainDist: st.lineLen,
      speed: spd,
      dmgCoeff: coeff,
      bossRadius: this.hitRadius(boss),
      halfW: st.halfW,
      prevX: boss.x,
      prevY: boss.y,
      hitIds: new Set(),
      warnFx: st.warnFx,
    };
    this.pulseKnightHolySanctionCdFromBossCast();
  }

  private knockbackAllyFromRushHit(a: SimUnit, footX: number, footY: number, bossRadius: number): void {
    if (a.side !== 'ally' || a.dead || a.invulnerable) return;
    const dx = a.x - footX;
    const dy = a.y - footY;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const wantDist = bossRadius * (1 + Math.random() * 2);
    const ir = this.unitTokenRootYOffsetPx(a);
    const capped = this.clampAllyKnockbackXY(a.x + nx * wantDist, a.y + ny * wantDist, ir);
    a.knockbackTween = {
      elapsed: 0,
      dur: KNOCKBACK_TWEEN_DUR,
      sx: a.x,
      sy: a.y,
      tx: capped.x,
      ty: capped.y,
    };
    a.moveSlowDecayRem = 3;
    a.moveSlowDecayDur = 3;
    a.moveSlowDecayPeak = 0.95;
    this.syncUnitMoveSpeed(a);
    this.floatWords.push(spawnFloatNumber(this.floatLayer, a.x, this.floatAnchorY(a) - 40, '击飞', 'magic'));
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
  }

  private disposeBossRushWarnFx(st: { warnFx?: BossRushLineWarnFx }): void {
    if (!st.warnFx) return;
    st.warnFx.destroy({ children: true });
    st.warnFx = undefined;
  }

  private tickBossRushChargeFrame(boss: SimUnit, st: BossRushChargeState, dt: number): void {
    if ((boss.stunT ?? 0) > 0) {
      if (st.warnFx) this.disposeBossRushWarnFx(st);
      boss.bossSkillCast = undefined;
      this.bossPutSkillOnCooldown(boss, 'skill_boss_rush');
      this.logBattleSkill('skill_boss_rush', boss, '冲锋打断');
      return;
    }
    const step = Math.min(st.remainDist, st.speed * dt);
    const nx = boss.x + st.dirx * step;
    const ny = boss.y + st.diry * step;
    const c = this.clampBattleSpawnXY(nx, ny);
    if (Math.abs(c.x - nx) > 0.5 || Math.abs(c.y - ny) > 0.5) {
      if (st.warnFx) this.disposeBossRushWarnFx(st);
      boss.bossSkillCast = undefined;
      this.bossPutSkillOnCooldown(boss, 'skill_boss_rush');
      this.logBattleSkill('skill_boss_rush', boss, '撞边结束');
      boss.x = c.x;
      boss.y = c.y;
      this.syncUnitRootFromStance(boss);
      return;
    }
    boss.x = nx;
    boss.y = ny;
    this.syncUnitRootFromStance(boss);
    st.remainDist -= step;
    const x0 = st.prevX;
    const y0 = st.prevY;
    const x1 = boss.x;
    const y1 = boss.y;
    for (const a of this.alive('ally')) {
      const d = distPointToSegment(a.x, a.y, x0, y0, x1, y1);
      if (d > st.halfW + a.hitRadiusPx) continue;
      if (!st.hitIds.has(a.unitId)) {
        st.hitIds.add(a.unitId);
        const dmg = Math.max(1, Math.round(boss.atk * st.dmgCoeff));
        this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic', bypassBlock: true });
        const tAlong = (a.x - x0) * st.dirx + (a.y - y0) * st.diry;
        const cx = x0 + st.dirx * tAlong;
        const cy = y0 + st.diry * tAlong;
        this.knockbackAllyFromRushHit(a, cx, cy, st.bossRadius);
      }
    }
    st.prevX = boss.x;
    st.prevY = boss.y;
    if (st.remainDist <= 0.5) {
      if (st.warnFx) this.disposeBossRushWarnFx(st);
      boss.bossSkillCast = undefined;
      this.bossPutSkillOnCooldown(boss, 'skill_boss_rush');
      this.logBattleSkill('skill_boss_rush', boss, '冲锋完成');
    }
  }

  private tickBossSkillCast(boss: SimUnit, dt: number): void {
    const st = boss.bossSkillCast;
    if (!st) return;
    if (st.kind === 'blade_storm_warn' || st.kind === 'blade_storm_channel') {
      if ((boss.stunT ?? 0) > 0) {
        this.interruptBossBladeStorm(boss, '眩晕打断');
        return;
      }
    }
    if (st.kind === 'blade_storm_warn') {
      st.t += dt;
      boss.bladeStormWarnFlashT = st.t;
      this.syncBladeStormWarnRim(boss, st.t, st.dur);
      if (st.t >= st.dur) {
        this.beginBossBladeStormChannel(boss);
      }
      return;
    }
    if (st.kind === 'blade_storm_channel') {
      this.tickBossBladeStormChannel(boss, st, dt);
      return;
    }
    if (st.kind === 'overload_explosion_channel') {
      this.tickBossOverloadExplosionChannel(boss, st, dt);
      return;
    }
    if (st.kind === 'jetpack_assault') {
      this.tickBossJetpackAssault(boss, st, dt);
      return;
    }
    if (st.kind === 'vanish_ambush') {
      this.tickBossVanishAmbush(boss, st, dt);
      return;
    }
    if (st.kind === 'punch_windup' || st.kind === 'rush_windup' || st.kind === 'rhahk_smash_windup') {
      if ((boss.stunT ?? 0) > 0) {
        const sid = st.skillId;
        st.warnFx.destroy({ children: true });
        boss.bossSkillCast = undefined;
        this.bossPutSkillOnCooldown(boss, sid);
        this.logBattleSkill(sid, boss, '蓄力·眩晕打断');
        return;
      }
    }
    if (st.kind === 'rhahk_smash_windup') {
      const primary = this.byId(st.targetId);
      if (!primary || primary.dead) {
        this.interruptRhahkSmash(boss, st, '主目标死亡·打断');
        return;
      }
      st.t += dt;
      const fx = st.warnFx.tick(dt);
      if (fx.impactNow && !st.impactApplied) {
        st.impactApplied = true;
        this.applyRhahkSmashImpact(boss, st);
      }
      if (fx.done) {
        st.warnFx.destroy({ children: true });
        boss.bossSkillCast = undefined;
      }
      return;
    }
    if (st.kind === 'punch_windup') {
      st.t += dt;
      st.cx = boss.x;
      st.cy = boss.y;
      st.warnFx.setCenter(boss.x, boss.y);
      const fx = st.warnFx.tick(dt);
      if (fx.impactNow && !st.impactApplied) {
        st.impactApplied = true;
        this.applyBossPunchImpact(boss, st);
      }
      if (fx.done) {
        st.warnFx.destroy({ children: true });
        boss.bossSkillCast = undefined;
      }
      return;
    }
    if (st.kind === 'rush_windup') {
      st.t += dt;
      const fx = st.warnFx.tick(dt);
      if (fx.impactNow && !st.chargeStarted) {
        st.chargeStarted = true;
        this.beginBossRushCharge(boss, st);
      }
      return;
    }
    if (st.kind === 'rush_charge') {
      if (st.warnFx) {
        const wfx = st.warnFx.tick(dt);
        if (wfx.done) this.disposeBossRushWarnFx(st);
      }
      this.tickBossRushChargeFrame(boss, st, dt);
    }
  }

  private bossSkills(dt: number): void {
    const boss = this.units.find((u) => u.bossId && !u.dead);
    if (!boss?.bossId) return;
    this.ensureBossConfiguredCdInit(boss);
    if (boss.bossBlinkFanVolley) {
      this.tickBossBlinkFanVolley(boss, dt);
    }
    const cur = boss.bossSkillCast;
    const skip =
      cur?.kind === 'rush_charge'
        ? 'skill_boss_rush'
        : cur?.kind === 'punch_windup'
          ? 'skill_boss_punch'
          : cur?.kind === 'rhahk_smash_windup'
            ? 'skill_rhahk_smash'
            : cur?.kind === 'rush_windup'
              ? 'skill_boss_rush'
              : cur?.kind === 'blade_storm_warn' || cur?.kind === 'blade_storm_channel'
                ? SKILL_BLADE_STORM
                : cur?.kind === 'overload_explosion_channel'
                  ? SKILL_OVERLOAD_EXPLOSION
                  : cur?.kind === 'jetpack_assault'
                    ? SKILL_JETPACK_ASSAULT
                    : cur?.kind === 'vanish_ambush'
                      ? SKILL_VANISH_AMBUSH
                      : null;
    this.tickBossConfiguredSkillCds(boss, dt, skip);
    if (boss.bossSkillCast?.kind === 'jetpack_assault' || boss.bossSkillCast?.kind === 'vanish_ambush') {
      this.tickBossSkillCast(boss, dt);
      return;
    }
    if (boss.bossSkillCast) {
      this.tickBossSkillCast(boss, dt);
      return;
    }
    if (boss.bossBlinkFanVolley) return;
    if ((boss.stunT ?? 0) > 0) return;
    const next = this.pickReadyBossSkill(boss);
    if (!next) return;
    this.startBossSkillFromReady(boss, next);
  }

  private triggerBattleScreenShake(sec: number, mag: number): void {
    this.battleShakeRemain = Math.max(this.battleShakeRemain, sec);
    this.battleShakeMag = Math.max(this.battleShakeMag, mag);
  }

  private tickBattleScreenShake(dt: number): void {
    if (this.battleShakeRemain <= 0) {
      this.position.set(0, 0);
      this.battleShakeMag = 0;
      return;
    }
    this.battleShakeRemain -= dt;
    const mag = this.battleShakeMag * Math.min(1, this.battleShakeRemain / 0.06);
    this.position.set((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
  }

  private allyClassLabelCn(kind: AllyClass): string {
    switch (kind) {
      case 'warrior':
        return '战士';
      case 'mage':
        return '法师';
      case 'priest':
        return '牧师';
      case 'archer':
        return '弓箭手';
      case 'knight':
        return '骑士';
      default:
        return kind;
    }
  }

  private bumpBattleDamageStat(attacker: SimUnit, hpLossOnEnemy: number): void {
    if (hpLossOnEnemy <= 0 || attacker.side !== 'ally') return;
    if (attacker.heroId) {
      const k = attacker.heroId;
      this.battleStatsDmgHero.set(k, (this.battleStatsDmgHero.get(k) ?? 0) + hpLossOnEnemy);
    } else if (attacker.allyKind) {
      const k = attacker.allyKind;
      this.battleStatsDmgClass.set(k, (this.battleStatsDmgClass.get(k) ?? 0) + hpLossOnEnemy);
    }
    this.statsUiDirty = true;
  }

  private bumpBattleHealStat(source: SimUnit, amount: number): void {
    if (amount <= 0 || source.side !== 'ally') return;
    if (source.heroId) {
      const k = source.heroId;
      this.battleStatsHealHero.set(k, (this.battleStatsHealHero.get(k) ?? 0) + amount);
    } else if (source.allyKind) {
      const k = source.allyKind;
      this.battleStatsHealClass.set(k, (this.battleStatsHealClass.get(k) ?? 0) + amount);
    }
    this.statsUiDirty = true;
  }

  private mountBattleBondButton(): void {
    const hudPad = Math.round(14 * LAYOUT_SCALE);
    const bondW = Math.round(200 * LAYOUT_SCALE);
    const bondH = Math.round(46 * LAYOUT_SCALE);
    const bondBtn = createStyledGameButton('classic', {
      text: '羁绊/规则',
      width: bondW,
      height: bondH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    bondBtn.zIndex = 4001;
    bondBtn.position.set(hudPad, Math.round(160 * LAYOUT_SCALE));
    bondBtn.on('pointertap', (e) => {
      e.stopPropagation();
      const ov = new SynergyOverlay(this.run, () => {
        this.removeChild(ov);
        ov.destroy({ children: true });
      });
      ov.zIndex = 6000;
      this.addChild(ov);
    });
    this.addChild(bondBtn);
  }

  private mountBattleStatsPanel(): void {
    const panelW = Math.round(232 * LAYOUT_SCALE);
    const hdrH = Math.round(34 * LAYOUT_SCALE);
    const tabH = Math.round(28 * LAYOUT_SCALE);
    const gap = Math.round(6 * LAYOUT_SCALE);
    const topY = BATTLE_HUD_TOP_PLATE_H_PX + Math.round(8 * LAYOUT_SCALE);
    const rightPad = Math.round(14 * LAYOUT_SCALE);

    this.statsUiRoot = new Container();
    this.statsUiRoot.zIndex = 4000;
    this.statsUiRoot.position.set(GAME_WIDTH - rightPad - panelW, topY);
    this.addChild(this.statsUiRoot);

    const hdrHit = new Container();
    hdrHit.eventMode = 'static';
    hdrHit.cursor = 'pointer';
    const hdrBg = new Graphics();
    hdrBg.roundRect(0, 0, panelW, hdrH, Math.round(8 * LAYOUT_SCALE)).fill({ color: 0x292524, alpha: 0.96 });
    hdrBg.stroke({ width: Math.max(1, Math.round(1 * LAYOUT_SCALE)), color: 0x57534e, alpha: 0.85 });
    hdrHit.addChild(hdrBg);
    this.statsHeaderLabel = new Text({
      text: '伤害统计',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: Math.round(17 * LAYOUT_SCALE),
        fill: 0xfef3c7,
        fontWeight: '700',
      },
    });
    this.statsHeaderLabel.anchor.set(0.5, 0.5);
    this.statsHeaderLabel.position.set(panelW * 0.5, hdrH * 0.5);
    hdrHit.addChild(this.statsHeaderLabel);
    bindGamePointerTap(hdrHit, () => {
      this.statsPanelExpanded = !this.statsPanelExpanded;
      this.syncBattleStatsPanelLayout();
    });
    this.statsUiRoot.addChild(hdrHit);

    this.statsExpandRoot = new Container();
    this.statsExpandRoot.position.set(0, hdrH + gap);
    this.statsExpandRoot.visible = false;
    this.statsUiRoot.addChild(this.statsExpandRoot);

    this.statsListBg = new Graphics();
    this.statsExpandRoot.addChild(this.statsListBg);

    const tabRow = new Container();
    const padTop = Math.round(10 * LAYOUT_SCALE);
    tabRow.position.set(0, padTop);
    this.statsExpandRoot.addChild(tabRow);

    const tabFs = Math.round(15 * LAYOUT_SCALE);
    const mkTab = (label: string, healTab: boolean, x: number): Text => {
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: tabFs,
          fontWeight: '700',
          fill: 0xa8a29e,
        },
      });
      t.eventMode = 'static';
      t.cursor = 'pointer';
      t.position.set(x, 0);
      bindGamePointerTap(t, (e) => {
        e.stopPropagation();
        if (this.statsViewHeal === healTab) return;
        this.statsViewHeal = healTab;
        this.statsUiDirty = true;
        this.syncBattleStatsTabStyle();
        this.refreshBattleStatsLines();
        this.statsUiDirty = false;
      });
      tabRow.addChild(t);
      return t;
    };
    this.statsTabDamageLbl = mkTab('伤害', false, Math.round(14 * LAYOUT_SCALE));
    this.statsTabHealLbl = mkTab('治疗', true, Math.round(78 * LAYOUT_SCALE));

    const linesY = padTop + tabH + Math.round(6 * LAYOUT_SCALE);
    this.statsLinesRoot = new Container();
    this.statsLinesRoot.position.set(Math.round(10 * LAYOUT_SCALE), linesY);
    this.statsExpandRoot.addChild(this.statsLinesRoot);

    this.syncBattleStatsTabStyle();
    this.syncBattleStatsPanelLayout();
  }

  private syncBattleStatsTabStyle(): void {
    const sel = 0xfbbf24;
    const unsel = 0xa8a29e;
    this.statsTabDamageLbl.style.fill = this.statsViewHeal ? unsel : sel;
    this.statsTabHealLbl.style.fill = this.statsViewHeal ? sel : unsel;
  }

  private syncBattleStatsPanelLayout(): void {
    battleStatsPanelExpandedSession = this.statsPanelExpanded;
    this.statsExpandRoot.visible = this.statsPanelExpanded;
    this.statsHeaderLabel.text = this.statsPanelExpanded ? '收起' : '伤害统计';
    if (this.statsPanelExpanded) {
      this.statsUiDirty = true;
      this.refreshBattleStatsLines();
      this.statsUiDirty = false;
    } else {
      this.statsUiDirty = false;
    }
  }

  private refreshBattleStatsLines(): void {
    this.statsLinesRoot.removeChildren();
    const maps = this.statsViewHeal
      ? { heroes: this.battleStatsHealHero, classes: this.battleStatsHealClass }
      : { heroes: this.battleStatsDmgHero, classes: this.battleStatsDmgClass };

    const panelW = Math.round(232 * LAYOUT_SCALE);
    const tabH = Math.round(28 * LAYOUT_SCALE);
    const padTop = Math.round(10 * LAYOUT_SCALE);
    const linesY = padTop + tabH + Math.round(6 * LAYOUT_SCALE);
    const padBot = Math.round(10 * LAYOUT_SCALE);

    const lineFs = Math.round(14 * LAYOUT_SCALE);
    const lineStyle = {
      fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
      fontSize: lineFs,
      fill: 0xf5f5f4,
      fontWeight: '600' as const,
    };
    const heroStyle = { ...lineStyle, fill: 0xfef3c7, fontWeight: '700' as const };
    let y = 0;
    const lineStep = Math.round(22 * LAYOUT_SCALE);

    const heroEntries = [...maps.heroes.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1]! - a[1]!);
    for (const [hid, val] of heroEntries) {
      const def = getHeroDef(hid);
      const label = def ? heroDisplayNameWithSkillTier(def.name, this.bondStacks[def.allyClass]) : String(hid);
      const row = new Text({ text: `${label}  ${val}`, style: heroStyle });
      row.position.set(0, y);
      this.statsLinesRoot.addChild(row);
      y += lineStep;
    }
    if (heroEntries.length > 0) {
      const sep = new Graphics();
      sep
        .rect(Math.round(2 * LAYOUT_SCALE), y + Math.round(3 * LAYOUT_SCALE), panelW - Math.round(28 * LAYOUT_SCALE), 1)
        .fill({ color: 0x44403c, alpha: 0.9 });
      this.statsLinesRoot.addChild(sep);
      y += Math.round(10 * LAYOUT_SCALE);
    }
    for (const cls of ALLY_CLASSES) {
      const val = maps.classes.get(cls) ?? 0;
      if (val <= 0) continue;
      const row = new Text({
        text: `${this.allyClassLabelCn(cls)}  ${val}`,
        style: lineStyle,
      });
      row.position.set(0, y);
      this.statsLinesRoot.addChild(row);
      y += lineStep;
    }
    if (this.statsLinesRoot.children.length === 0) {
      const row = new Text({
        text: this.statsViewHeal ? '暂无治疗' : '暂无伤害',
        style: { ...lineStyle, fill: 0x78716c, fontWeight: '500' as const },
      });
      row.position.set(0, 0);
      this.statsLinesRoot.addChild(row);
      y = lineStep;
    }

    const totalH = linesY + y + padBot;
    this.statsListBg.clear();
    this.statsListBg
      .roundRect(0, 0, panelW, totalH, Math.round(8 * LAYOUT_SCALE))
      .fill({ color: 0x1c1917, alpha: 0.94 });
    this.statsListBg.stroke({ width: Math.max(1, Math.round(1 * LAYOUT_SCALE)), color: 0x44403c, alpha: 0.9 });
  }

  private refreshHudTimerAndHpBars(): void {
    this.hudTimer.text = `剩余时间：${Math.max(0, this.timeLeft).toFixed(1)}s / ${this.timeLimit}s`;

    this.currentEnemyHp = this.alive('enemy').reduce((s, u) => s + u.hp, 0);
    this.currentAllyHp = this.alive('ally').reduce((s, u) => s + u.hp, 0);

    const ratioE = this.initialEnemyHp > 0 ? this.currentEnemyHp / this.initialEnemyHp : 0;
    const ratioA = this.initialAllyHp > 0 ? this.currentAllyHp / this.initialAllyHp : 0;
    const barW = GAME_WIDTH - Math.round(56 * LAYOUT_SCALE);
    const barH = Math.round(20 * LAYOUT_SCALE);
    const barR = Math.round(8 * LAYOUT_SCALE);

    this.hudAllyLabel.text = `我方总血量 ${Math.round(this.currentAllyHp)} / ${this.initialAllyHp}`;
    this.hudAllyBar.clear();
    this.hudAllyBar.roundRect(0, 0, barW, barH, barR).fill(0x0f172a);
    this.hudAllyBar
      .roundRect(0, 0, barW * Math.max(0, Math.min(1, ratioA)), barH, barR)
      .fill(0x22c55e);

    this.hudEnemyLabel.text = `敌方总血量 ${Math.round(this.currentEnemyHp)} / ${this.initialEnemyHp}`;
    this.hudEnemyBar.clear();
    this.hudEnemyBar.roundRect(0, 0, barW, barH, barR).fill(0x0f172a);
    this.hudEnemyBar
      .roundRect(0, 0, barW * Math.max(0, Math.min(1, ratioE)), barH, barR)
      .fill(0xef4444);
  }

  private updateFrame(dt: number): void {
    if (this.ended) return;
    const inFinishDelay = this.pendingFinishOutcome != null;
    if (!inFinishDelay) dt *= this.devBattleTimeScale;
    this.tickBattleScreenShake(dt);
    const remOpen = this.openingCountdownT;
    if (remOpen > 0) {
      const digit = Math.min(3, Math.ceil(remOpen / BATTLE_OPENING_COUNTDOWN_STEP_SEC));
      this.countdownGiant.text = String(digit);
      this.countdownGiant.visible = true;
      this.openingCountdownT = Math.max(0, remOpen - dt);
      this.refreshHudTimerAndHpBars();
      return;
    }
    this.countdownGiant.visible = false;

    if (this.uiTestBattle) {
      this.uiTestSkillAcc += dt;
      if (this.uiTestSkillAcc >= 2.75) {
        this.uiTestSkillAcc = 0;
        this.fireUiTestSkillBurst();
      }
    }
    this.elapsed += dt;
    if (!inFinishDelay) {
      this.timeLeft -= dt;
    }
    this.refreshHudTimerAndHpBars();

    if (this.statsPanelExpanded && this.statsUiDirty) {
      this.refreshBattleStatsLines();
      this.statsUiDirty = false;
    }

    this.tickDeathAnimations(dt);
    tickTinySparks(this.deathTrailSparks, dt);

    this.bossSkills(dt);
    this.tickMeteor(dt);
    this.tickMulanWhirlwindRings(dt);
    tickFloatEntries(this.floatWords, dt);
    tickRingPulses(this.ringFx, dt);
    tickHitSparkBursts(this.hitSparks, dt);
    this.tickRhahkPresentationFx(dt);
    this.tickGenericSkillPresentationFx(dt);
    this.tickShamanBloodlustAll(dt);
    this.tickCatapultBurns(dt);
    tickMeteorAnims(this.meteors, dt);
    tickSlashFx(this.slashes, dt);
    tickRayBurstFx(this.healBursts, dt);
    tickHolySanctionStrikes(this.holySanctionStrikes, dt);
    this.tickProjectiles(dt);
    this.tickArcherSnareTrapBuffs(dt);

    for (const u of this.units) {
      if (u.dead) continue;
      if (u.hp > u.maxHp) u.hp = u.maxHp;

      if (u.side === 'ally') {
        this.tickAllyRfc3CorrosionDot(u, dt);
        this.tickAllyPoisonStrikeDot(u, dt);
        this.tickRejuvenationHoT(u, dt);
        if (u.allyKind === 'druid' && u.druidForm === 'caster') {
          this.tickDruidCasterRejuvenation(u, dt);
        }
        if (u.allyKind === 'warlock') {
          this.tickWarlockSoulFire(u, dt);
        }
        if ((u.assassinDodgeRem ?? 0) > 0) {
          u.assassinDodgeRem = Math.max(0, (u.assassinDodgeRem ?? 0) - dt);
        }
        if (u.shamanBondBloodlustGlow && u.tokenInnerR != null) {
          u.shamanBondBloodlustGlowPhase = (u.shamanBondBloodlustGlowPhase ?? 0) + dt;
          tickAllyBondBloodlustGlow(u.shamanBondBloodlustGlow, dt, u.shamanBondBloodlustGlowPhase);
        }
      }

      if (u.side === 'enemy') {
        this.tickEnemyEvilFrenzy(u, dt);
        this.tickEnemyShadowBoltTry(u, dt);
        this.tickEnemyHeavyStunTry(u, dt);
        this.tickEnemyElasticBombTry(u, dt);
        this.tickRfc4Ch4BossExclusiveSkills(u, dt);
        this.tickRfc3Ch3BossExclusiveSkills(u, dt);
        this.tickMechanoPioneerPassive(u);
      }

      if (u.bossId && this.unitHasSkill(u, 'skill_berserker') && u.bossBerserkBaseAtk != null) {
        this.syncBossBerserkFromHp(u);
      }

      const kbActive = this.tickKnockbackTween(u, dt);
      this.tickRhahkUnitFx(u, dt);
      this.syncHitFlash(u, dt);
      if ((u.rhahkCleaveFlashT ?? 0) > 0) this.syncUnitHpRing(u);

      if ((u.moveSlowT ?? 0) > 0) {
        u.moveSlowT = Math.max(0, (u.moveSlowT ?? 0) - dt);
      }
      if ((u.moveSlowDecayRem ?? 0) > 0) {
        u.moveSlowDecayRem = Math.max(0, (u.moveSlowDecayRem ?? 0) - dt);
      }
      if ((u.mulanWhirlwindProcLockT ?? 0) > 0) {
        u.mulanWhirlwindProcLockT = Math.max(0, (u.mulanWhirlwindProcLockT ?? 0) - dt);
      }
      this.syncUnitMoveSpeed(u);

      if ((u.invincibleT ?? 0) > 0) {
        u.invincibleT = Math.max(0, (u.invincibleT ?? 0) - dt);
        if ((u.invincibleT ?? 0) <= 0) {
          u.invincibleT = 0;
          u.invincible = false;
          if (u.knightInvulnFx) {
            u.knightInvulnFx.destroy({ children: true });
            u.knightInvulnFx = undefined;
          }
        }
      }

      if (u.side === 'enemy' && this.unitHasOverloadExplosionSuperArmor(u)) {
        u.stunT = 0;
        u.moveSlowT = 0;
        u.moveSlowDecayRem = 0;
        u.knockbackTween = undefined;
      }

      if ((u.stunT ?? 0) > 0) {
        if (u.heroArcaneChannel) this.interruptHeroArcaneMissilesChannel(u);
        if (u.rfc4MindLashChannel) this.interruptRfc4MindLashChannel(u, 'stun');
        u.stunT = Math.max(0, (u.stunT ?? 0) - dt);
        if (u.allyKind === 'knight' && u.knightState === 'charge') {
          u.knightState = 'fight';
          u.collisionDisabled = false;
          u.knightChargeTargetId = null;
          u.knightCooldown = KNIGHT_CHARGE_COOLDOWN_SEC;
        }
        if ((u.stunT ?? 0) > 0) {
          u.body.tint = 0xa5b4fc;
          continue;
        }
      }

      if ((u.fearT ?? 0) > 0 && u.side === 'enemy') {
        if (u.warlockFearSpiralFx) {
          u.warlockFearSpiralPhase = (u.warlockFearSpiralPhase ?? 0) + dt;
          tickWarlockFearSpiralFx(u.warlockFearSpiralFx, dt, u.warlockFearSpiralPhase);
        }
        if (this.tickEnemyFearMove(u, dt)) {
          u.body.tint = 0xc4b5fd;
          continue;
        }
      } else if (u.warlockFearSpiralFx) {
        this.destroyWarlockFearSpiralFx(u);
      }

      if (u.side === 'ally' && u.allyKind === 'assassin' && this.tickAssassinVanish(u, dt)) {
        continue;
      }

      if ((u.bloodlustT ?? 0) > 0) {
        u.bloodlustT = Math.max(0, (u.bloodlustT ?? 0) - dt);
        if ((u.bloodlustT ?? 0) <= 0) {
          u.bloodlustT = 0;
          const b = u.attackIntervalBase ?? u.attackInterval;
          u.attackInterval = b;
          if (u.shamanBondBloodlustGlow) {
            u.shamanBondBloodlustGlow.destroy({ children: true });
            u.shamanBondBloodlustGlow = undefined;
            const sc = u.root.scale.x;
            if (sc > 1.05) u.root.scale.set(sc / 1.1);
          }
        }
      }

      if ((u.raiderLeapBuffT ?? 0) > 0) {
        u.raiderLeapBuffT = Math.max(0, (u.raiderLeapBuffT ?? 0) - dt);
      }

      if (u.side === 'enemy' && this.unitHasSkill(u, 'skill_dread_warrior_assault') && !u.dreadAssaultUsed) {
        const dw = getSkillById('skill_dread_warrior_assault');
        const rAss = skillParamDesignPx(dw, 0, 108);
        const near = this.alive('ally').filter((a) => Math.hypot(a.x - u.x, a.y - u.y) <= rAss);
        if (near.length) {
          u.dreadAssaultUsed = true;
          this.logBattleSkill(
            'skill_dread_warrior_assault',
            u,
            `hit=${near.filter((a) => !a.invulnerable).length}/${near.length}`,
          );
          for (const a of near) {
            if (a.invulnerable) continue;
            this.applyDamage(a, Math.max(1, Math.round(u.atk * skillParamNumber(dw, 1, 1.2))), { attacker: u });
            this.knockbackAllyFromPoint(a, u.x, u.y, skillParamDesignPx(dw, 3, 300));
            this.applyAllyStun(a, skillParamNumber(dw, 2, 5));
          }
          this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 110, 0xc084fc, 0.55));
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
          continue;
        }
      }

      if (u.aura) {
        const charging = this.knightIsCharging(u);
        u.aura.visible = charging;
        if (u.aura.visible) u.aura.rotation += dt * 3.8;
      }

      if (u.snareTrapGfx?.visible) {
        const trapActive = (u.snareTrapBuff?.activeRemainSec ?? 0) > 0;
        u.snareTrapGfx.rotation += dt * (trapActive ? 4.4 : 1.6);
      }

      if (u.heroChannelDiskOverlay && u.tokenInnerR != null) {
        const g = u.heroChannelDiskOverlay;
        const ir = u.tokenInnerR;
        const cx = 0;
        const cy = -ir;
        const rFill = battleTokenDiskFillRadiusPx(ir);
        if (u.heroArcaneChannel) {
          g.visible = true;
          const p = Math.min(1, u.heroArcaneChannel.t / ARCANE_MISSILE_CHANNEL_SEC);
          const sweep = (1 - p) * Math.PI * 2;
          g.clear();
          if (sweep > 0.02) {
            const start = -Math.PI / 2;
            const end = start + sweep;
            g.moveTo(cx, cy);
            g.arc(cx, cy, rFill * 0.99, start, end, false);
            g.closePath();
            g.fill({ color: 0x38bdf8, alpha: 0.42 });
          }
        } else if (u.rfc4MindLashChannel) {
          g.visible = true;
          const lashDef = getSkillById(RFC4_CH4_SKILL_MIND_LASH);
          const channelSec = skillParamNumber(lashDef, 1, 10);
          const p = Math.min(1, u.rfc4MindLashChannel.t / channelSec);
          const sweep = (1 - p) * Math.PI * 2;
          g.clear();
          if (sweep > 0.02) {
            const start = -Math.PI / 2;
            const end = start + sweep;
            g.moveTo(cx, cy);
            g.arc(cx, cy, rFill * 0.99, start, end, false);
            g.closePath();
            g.fill({ color: 0x7c3aed, alpha: 0.44 });
          }
        } else {
          g.visible = false;
          g.clear();
        }
      }

      let baseBodyTint = 0xffffff;
      if (this.knightIsCharging(u)) {
        baseBodyTint = 0xffe9a8;
      } else if ((u.raiderLeapBuffT ?? 0) > 0 && this.unitHasSkill(u, 'skill_raider_leap')) {
        baseBodyTint = 0xfde047;
      } else if ((u.evilFrenzyBuffT ?? 0) > 0 && this.unitHasSkill(u, 'skill_evil_strenth')) {
        baseBodyTint = 0xf97369;
      } else if (u.bossId && this.unitHasSkill(u, 'skill_berserker') && (u.bossBerserkStage ?? 0) >= 2) {
        baseBodyTint = 0xff3333;
      } else if (u.bossId && this.unitHasSkill(u, 'skill_berserker') && (u.bossBerserkStage ?? 0) >= 1) {
        baseBodyTint = 0xff8f66;
      } else if ((u.bloodlustT ?? 0) > 0 && u.side === 'enemy') {
        baseBodyTint = 0xf9a8d4;
      } else if (((u.moveSlowT ?? 0) > 0 || (u.moveSlowDecayRem ?? 0) > 0) && u.side === 'ally') {
        baseBodyTint = 0x5eead4;
      } else if ((u.rfc3CorrosionRemainSec ?? 0) > 0 && u.side === 'ally') {
        baseBodyTint = 0x86efac;
      } else if (((u.poisonStrikeStacks ?? 0) > 0 || (u.poisonStrikeRemainSec ?? 0) > 0) && u.side === 'ally') {
        const poisonDeep = Math.min(1, (u.poisonStrikeStacks ?? 0) / 20);
        baseBodyTint = poisonDeep > 0.5 ? 0x4ade80 : 0x86efac;
      } else if (u.defiasBandageChannel) {
        baseBodyTint = 0xc4b5fd;
      }

      if ((u.flashT ?? 0) > 0) {
        u.flashT = Math.max(0, (u.flashT ?? 0) - dt);
        u.body.tint = u.flashT > 0 ? 0xffe066 : baseBodyTint;
      } else {
        u.body.tint = baseBodyTint;
      }
      this.syncEnemyTokenDiskTintForBerserk(u);

      if (
        u.bossId &&
        this.unitHasSkill(u, 'skill_berserker') &&
        (u.bossBerserkStage ?? 0) > 0 &&
        !u.dead
      ) {
        u.bossBerserkSparkAcc = (u.bossBerserkSparkAcc ?? 0) + dt;
        const interval = (u.bossBerserkStage ?? 0) >= 2 ? 0.05 : 0.085;
        while ((u.bossBerserkSparkAcc ?? 0) >= interval) {
          u.bossBerserkSparkAcc = (u.bossBerserkSparkAcc ?? 0) - interval;
          const ox = (Math.random() - 0.5) * u.hitRadiusPx * 1.4;
          const oy = (Math.random() - 0.5) * u.hitRadiusPx * 0.55;
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x + ox, u.y + oy));
        }
      }

      const lun = u.atkLungeT ?? 0;
      if (lun > 0) {
        u.atkLungeT = Math.max(0, lun - dt);
        const p = 1 - (u.atkLungeT ?? 0) / ATTACK_LUNGE_DUR;
        const amp = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 13;
        const ldx = u.atkLungeDx ?? 1;
        const ldy = u.atkLungeDy ?? 0;
        u.body.position.set(ldx * amp, ldy * amp);
      } else {
        u.body.position.set(0, 0);
      }

      if (u.allyKind === 'knight' && u.knightState === 'charge') {
        this.tickKnightCharge(u, dt);
        continue;
      }

      if (u.side === 'ally' && u.allyKind === 'priest') {
        const te = this.nearestEnemy(u);
        this.tickPriest(u, dt, te);
        continue;
      }

      if (u.side === 'ally' && u.allyKind === 'shaman') {
        this.tickShamanAlly(u, dt, kbActive);
        continue;
      }

      if (u.side === 'ally' && u.allyKind === 'assassin' && this.tryAssassinBlinkStrike(u)) {
        continue;
      }

      if (u.side === 'ally' && u.heroId && isMageArcaneMissilesHero(u.heroId) && this.tickHeroMageArcaneMissiles(u, dt, kbActive)) {
        continue;
      }

      if (u.side === 'ally' && u.allyKind === 'knight' && u.knightState === 'fight') {
        if (u.heroId && isKnightHolySanctionHero(u.heroId)) {
          this.tickKnightHeroHolySanction(u, dt);
        }
        u.knightCooldown = Math.max(0, (u.knightCooldown ?? 0) - dt);
        if ((u.knightCooldown ?? 0) <= 0) {
          const far = this.farthestEnemy(u);
          if (far) {
            const farDist = Math.hypot(far.x - u.x, far.y - u.y);
            if (farDist > KNIGHT_CHARGE_MIN_DIST_PX) {
              this.beginKnightCharge(u);
              this.tickKnightCharge(u, dt);
              continue;
            }
          }
        }
      }

      if (u.side === 'enemy' && this.tickDefiasBandage(u, dt)) {
        continue;
      }

      if (u.side === 'enemy' && this.tickEnemyVoidWalk(u, dt)) {
        continue;
      }

      if (u.side === 'enemy' && this.tickEnemyBacklineLeap(u, dt)) {
        continue;
      }

      if (
        u.bossId &&
        u.bossSkillCast &&
        u.bossSkillCast.kind !== 'jetpack_assault' &&
        u.bossSkillCast.kind !== 'vanish_ambush'
      ) {
        continue;
      }

      if (u.bossId && u.rfc4MindLashChannel) {
        continue;
      }

      if (u.side === 'enemy') {
        this.tickGyroMissileDefensePassive(u, dt);
      }

      if (u.bossId && (u.bossSkillCast?.kind === 'jetpack_assault' || u.bossSkillCast?.kind === 'vanish_ambush')) {
        if (u.bossSkillCast?.kind === 'jetpack_assault') {
          u.cd -= dt;
          if (u.cd <= 0) {
            const target = this.nearestAlly(u);
            if (target) {
              const dx = target.x - u.x;
              const dy = target.y - u.y;
              const dist = Math.hypot(dx, dy) || 1;
              this.beginDefaultAttack(u, target, dist, dx, dy);
            }
          }
        }
        continue;
      }

      if (!kbActive) {
        const target = u.side === 'ally' ? this.nearestEnemy(u) : this.nearestAlly(u);
        if (!target) {
          continue;
        }
        const dx = target.x - u.x;
        const dy = target.y - u.y;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = this.effectiveSkillRangeTo(u, target);
        const margin = this.meleeEngagementMarginPx(u, target);
        const aimDist = reach + margin;
        const nx = dx / dist;
        const ny = dy / dist;
        const stepLen = u.speed * dt;
        const travel = Math.min(stepLen, Math.max(0, dist - aimDist));
        const meleeStuck =
          dist > aimDist &&
          travel < Math.min(1.25, stepLen * 0.04) &&
          dist <= aimDist + Math.max(18, Math.round(24 * LAYOUT_SCALE));
        const archerKite =
          u.side === 'ally' &&
          u.allyKind === 'archer' &&
          this.bondStacks.archer >= 10 &&
          dist < ARCHER_KITE_WARN_DIST + this.hitRadius(u) + this.hitRadius(target);
        if (dist <= aimDist || meleeStuck) {
          u.cd -= dt;
          if (u.cd <= 0) {
            this.beginDefaultAttack(u, target, dist, dx, dy);
          }
        } else if (archerKite) {
          u.x -= nx * travel;
          u.y -= ny * travel;
          this.syncUnitRootFromStance(u);
        } else {
          u.x += nx * travel;
          u.y += ny * travel;
          this.syncUnitRootFromStance(u);
        }
      }
    }

    for (const u of this.units) {
      if (!u.dead) this.syncUnitHpRing(u);
    }

    this.applyUnitCollisionSeparation(2);

    const alliesDead = this.alive('ally').length === 0;
    const enemiesDead = this.alive('enemy').length === 0;
    const rem = this.initialEnemyHp > 0 ? this.currentEnemyHp / this.initialEnemyHp : 0;
    const timeout = this.timeLeft <= 0;

    if (this.pendingFinishOutcome == null) {
      if (enemiesDead) {
        this.scheduleBattleFinish({ perfect: true, enemyHpRatioRemaining: 0, elapsed: this.elapsed });
      } else if (alliesDead || timeout) {
        this.scheduleBattleFinish({ perfect: false, enemyHpRatioRemaining: rem, elapsed: this.elapsed });
      }
    }

    if (this.pendingFinishOutcome != null) {
      const p = this.pendingFinishOutcome;
      if (enemiesDead || p.enemyHpRatioRemaining <= 0.0001) {
        this.pendingFinishOutcome = { perfect: true, enemyHpRatioRemaining: 0, elapsed: this.elapsed };
      } else if (alliesDead) {
        this.pendingFinishOutcome = { perfect: false, enemyHpRatioRemaining: rem, elapsed: this.elapsed };
      } else {
        this.pendingFinishOutcome = { ...p, enemyHpRatioRemaining: rem, elapsed: this.elapsed };
      }
      this.finishPostDelayLeft -= dt;
      if (this.finishPostDelayLeft <= 0) {
        const o = this.pendingFinishOutcome;
        this.pendingFinishOutcome = null;
        this.finish(o);
      }
    }
  }

  private scheduleBattleFinish(outcome: BattleOutcome): void {
    if (this.ended || this.pendingFinishOutcome != null) return;
    this.timeLeft = Math.max(0, this.timeLeft);
    this.pendingFinishOutcome = outcome;
    this.finishPostDelayLeft = this.devBattleFinishPostDelaySec;
  }

  private finish(outcome: BattleOutcome): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd(outcome);
  }
}
