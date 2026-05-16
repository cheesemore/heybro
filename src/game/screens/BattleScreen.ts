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
  type BossRushChargeState,
  type BossRushWindupState,
  type BossSkillCastState,
} from '../bossConfiguredSkillTypes';
import { BossPunchSectorWarnFx } from '../bossPunchSectorWarnFx';
import { BossRushLineWarnFx } from '../bossRushLineWarnFx';
import type { SkillDef } from '../skillsCatalog';
import { gsCombatStatMult } from '../gearCombatBonus';
import { getNodeProgressMaxForBookChapter } from '../gearItems';
import { sumEquippedGearGs } from '../playerGearStorage';
import { getSkillById, skillFiresInBattle, skillParamDesignPx, skillParamNumber } from '../skillsCatalog';
import {
  getHeroDef,
  heroDisplayNameWithSkillTier,
  heroQualityAccent,
  heroStarStatMult,
  ARCHER_STRONG_STRIKE_BLUE_ID,
  isArcherStrongStrikeAuraHero,
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
  BOND_MEGA_RADIUS_MULT,
  classBondHpAtkMultiplier,
  hasBondMega,
  hasBondUltimate,
  priestBondTeamMultiplier,
  RANGED_ATTACK_RANGE_THRESHOLD,
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
  buildProjectileGraphic,
  createKnightAura,
  createStrongStrikeHeroAura,
  spawnArcaneTrailSpark,
  spawnDeathTrailSpark,
  spawnShadowTrailSpark,
  spawnDualShotSlash,
  drawMulanWhirlwindBladeRing,
  spawnFloatNumber,
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
  redrawHpRingPair,
  redrawHpRingWithShield,
  unitFloatLabelOffsetYForInnerR,
  battleTokenDiskFillRadiusPx,
  battleTokenHpRingOuterRadiusPx,
} from '../unitCircleTokens';

const KNOCKBACK_TWEEN_DUR = 0.3;
const DEATH_FLIGHT_MAX_T = 2.85;
const DEATH_EXIT_MARGIN = Math.round(320 * LAYOUT_SCALE);
const BATTLE_FINISH_POST_DELAY_SEC = 3;
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

const MAGE_SPLASH_RADIUS = Math.round(50 * LAYOUT_SCALE);

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
const METEOR_INTERVAL = 20;
const METEOR_SPLASH_RADIUS = Math.round(300 * LAYOUT_SCALE);

const KNOCKBACK_PAD_X = Math.round(38 * LAYOUT_SCALE);
const ARENA_Y_MIN = Math.round(192 * LAYOUT_SCALE);
const ARENA_Y_MAX = Math.round(1108 * LAYOUT_SCALE);
const KNIGHT_CHARGE_SPEED_MULT = 2.65;
const KNIGHT_CHARGE_HIT_DIST = Math.round(48 * LAYOUT_SCALE);

/** 与 `skillIds` / `wowBookMonsters` 中小怪跃后排技能一致 */
const MINION_LEAP_SKILL_IDS = ['skill_batrider_leap', 'skill_raider_leap', 'skill_beserker_leap'] as const;

/** 怒焰裂谷第三关首领（祈求者耶戈什）专属 */
const RFC3_CH3_SKILL_GROUP_SHADOW = 'skill_rfc3_ch3_group_shadow_sword';
const RFC3_CH3_SKILL_SUMMON = 'skill_rfc3_ch3_summon_rite';
const RFC3_CH3_SKILL_CORROSION = 'skill_rfc3_ch3_corrosion';

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
};

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
  /** 席拉拉强击光环脚底特效（与骑士 `aura` 分立） */
  strongStrikeAuraGfx?: Graphics;
  bossId?: BossId;
  allyKind?: AllyClass;
  enemyPaint?: EnemyPaintKind;
  /** 挂载技能 id（`config/skills.json`）；书本首领来自 `wowBookBosses`，小怪来自 `wowBookMonsters` */
  skillIds: string[];
  /** 射手：最近一次普攻「出手」锁定的敌人 id（用于专注叠层；与弹道命中顺序解耦） */
  archerLockedAttackTargetId?: number | null;
  archerFocusStacks?: number;
  /** 骑士 */
  knightState?: 'charge' | 'fight' | 'death_charge';
  knightCooldown?: number;
  knightChargeTargetId?: number | null;
  knightBond12?: boolean;
  /** 十五层骑羁绊：尚可用一次免死冲锋 */
  knightDeathDenyLeft?: number;
  invulnerable?: boolean;
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
  /** 0 常态；1 一阶段狂暴；2 极度狂暴 */
  bossBerserkStage?: 0 | 1 | 2;
  /** 怒火粒子：喷发间隔累积 */
  bossBerserkSparkAcc?: number;
  /** 击退：ease-out 缓动位移 */
  knockbackTween?: { elapsed: number; dur: number; sx: number; sy: number; tx: number; ty: number };
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
  private bondWarrior12 = false;
  private bondMage12 = false;
  private bondPriest12 = false;
  private bondArcher12 = false;
  private bondKnight12 = false;
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
    this.uiTestBattle = !!meta.uiTestBattle;
    this.uiTestSkillAcc = this.uiTestBattle ? -0.45 : 0;
    this.statsPanelExpanded = battleStatsPanelExpandedSession;

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
    this.bondWarrior12 = hasBondUltimate(this.bondStacks.warrior);
    this.bondMage12 = hasBondUltimate(this.bondStacks.mage);
    this.bondPriest12 = hasBondUltimate(this.bondStacks.priest);
    this.bondArcher12 = hasBondUltimate(this.bondStacks.archer);
    this.bondKnight12 = hasBondUltimate(this.bondStacks.knight);
    this.meteorCd = this.bondMage12 ? METEOR_INTERVAL : 999;

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
          'UI技能测试：首领巴扎兰（第4章专属技）· 群体暗影箭/精神鞭笞/暗影闪现 · 歼敌或倒计时结束 · 控制台 [HeyBro/ui-test]',
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

    this._tick = (ticker) => this.updateFrame(ticker.deltaMS / 1000);
    this.app.ticker.add(this._tick);
  }

  override destroy(): void {
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
    this.meteors.push(spawnMeteorAnim(this.fxLayer, ex, ey + Math.round(24 * LAYOUT_SCALE), METEOR_SPLASH_RADIUS));
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
  private knockbackAllyFromPoint(a: SimUnit, ox: number, oy: number, dist: number): void {
    if (a.side !== 'ally' || a.dead || a.invulnerable) return;
    const dx = a.x - ox;
    const dy = a.y - oy;
    const d = Math.hypot(dx, dy) || 1;
    let tx = a.x + (dx / d) * dist;
    let ty = a.y + (dy / d) * dist;
    const c = this.clampAllyKnockbackXY(tx, ty, this.unitTokenRootYOffsetPx(a));
    tx = c.x;
    ty = c.y;
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
    const yLo = Math.round(195 * LAYOUT_SCALE);
    const yHi = Math.round(1100 * LAYOUT_SCALE);
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
    target.stunT = Math.max(target.stunT ?? 0, skillParamNumber(ds, 2, 1));
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

  /**
   * 备战 slot 0–8 对应我方九宫格中心（与 Draft 一致：col 左→右，row 0 上→2 下；
   * row 越大 y 越大，越靠近战场中部/敌侧，即下排为「前排」）。
   */
  private allyGridAnchor(slot: number): { x: number; y: number } {
    const colGap = Math.round(178 * LAYOUT_SCALE);
    const baseX = GAME_WIDTH / 2 - colGap;
    const col = slot % 3;
    const row = Math.floor(slot / 3);
    const rowGap = Math.round(100 * LAYOUT_SCALE);
    const baseBackY = Math.round(620 * LAYOUT_SCALE);
    const y = baseBackY + row * rowGap;
    return { x: baseX + col * colGap, y };
  }

  /** 同一格多单位：在格心周围微偏移排开 */
  private allySubSpawnXY(slot: number, index: number, n: number): { x: number; y: number } {
    const { x: cx, y: cy } = this.allyGridAnchor(slot);
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

  /**
   * 敌方人群锚点：我方九宫格中心 (slot 4) 的 X，与 arena 内水平「中线」作 Y 镜像（敌在上、我在下）。
   */
  private enemyHordeAnchorXY(): { ax: number; ay: number } {
    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const mirrorY = arenaTop + arenaH * 0.4;
    const ac = this.allyGridAnchor(4);
    return { ax: ac.x, ay: 2 * mirrorY - ac.y };
  }

  /** 敌方前排锚点（靠战场中线、贴近我方一侧；与近战小怪扎堆 y 一致） */
  private enemyFrontLineSpawnXY(): { x: number; y: number } {
    const { ax, ay } = this.enemyHordeAnchorXY();
    const yStretch = Math.round(165 * LAYOUT_SCALE);
    const yFront = ay + yStretch * 0.48;
    return this.clampBattleSpawnXY(ax, yFront);
  }

  /** 开局站位：约束在 arena 内（与背景战场框一致） */
  private clampBattleSpawnXY(x: number, y: number): { x: number; y: number } {
    const arenaPad = Math.round(12 * LAYOUT_SCALE);
    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const margin = Math.round(52 * LAYOUT_SCALE);
    const minX = arenaPad + margin;
    const maxX = GAME_WIDTH - arenaPad - margin;
    const minY = arenaTop + margin;
    const maxY = arenaTop + arenaH - margin;
    return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
  }

  /** 九宫格索引 0–8；每种兵按层数拆成多个模型，出生点落在对应格中心附近 */
  private spawnAllies(): SimUnit[] {
    const out: SimUnit[] = [];
    const priestM = priestBondTeamMultiplier(this.bondStacks.priest);

    for (let slot = 0; slot < 9; slot++) {
      const cell = this.run.board[slot];
      if (!cell) continue;
      const def = ALLY_DEFS[cell.kind];
      const stacks = Math.min(cell.stacks, BOARD_CELL_MAX_STACKS);
      const classM = classBondHpAtkMultiplier(this.bondStacks[cell.kind]);
      const mult = classM * priestM;
      const ab = artifactBuffsForAllySlot(this.run, slot);

      const n = Math.max(1, stacks);
      /** 每层数对应场上一个独立模型；每个模型满血满攻，不平分格内总池 */
      const bossHpM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalHpMult : 1;
      const bossAtkM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalAtkMult : 1;
      const growHp = this.run.externalGrowth.permanentMaxHpMult;
      const growAtk = this.run.externalGrowth.permanentDamageMult;
      const gearM = gsCombatStatMult(sumEquippedGearGs());
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
      if (cell.kind === 'archer' && this.bondArcher12) range += 150;

      for (let i = 0; i < n; i++) {
        const { x, y } = this.allySubSpawnXY(slot, i, n);
        if (cell.kind === 'knight') {
          out.push(
            this.makeUnit('ally', x, y, eachHp, eachAtk, def.attackSpeed, def.range, def.moveSpeed, def.name, {
              allyKind: 'knight',
              knightState: 'charge',
              knightCooldown: 0,
              knightChargeTargetId: null,
              knightBond12: this.bondKnight12,
              knightDeathDenyLeft: this.bondKnight12 ? 1 : 0,
              invulnerable: true,
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
            }),
          );
        }
      }
    }
    return out;
  }

  /**
   * 已部署英雄登场点：场上已有同职业非英雄单位时，落在其位置质心附近；
   * 否则落在九宫「最前排」（slot 6–8，row 最大、靠敌侧）中心一带。
   * 多名英雄时水平略错开，避免完全重叠。
   */
  private heroDeployedSpawnXY(
    boardAllies: SimUnit[],
    cls: AllyClass,
    spreadIndex: number,
    spreadTotal: number,
  ): { x: number; y: number } {
    const mates = boardAllies.filter((u) => u.side === 'ally' && !u.heroId && u.allyKind === cls);
    let cx: number;
    let cy: number;
    if (mates.length > 0) {
      cx = mates.reduce((s, u) => s + u.x, 0) / mates.length;
      cy = mates.reduce((s, u) => s + u.y, 0) / mates.length;
    } else {
      const a6 = this.allyGridAnchor(6);
      const a7 = this.allyGridAnchor(7);
      const a8 = this.allyGridAnchor(8);
      cx = (a6.x + a7.x + a8.x) / 3;
      cy = (a6.y + a7.y + a8.y) / 3;
    }
    const sc = this.scatterOffset(900 + spreadIndex * 17 + spreadTotal * 3);
    const spreadX = Math.round(52 * LAYOUT_SCALE);
    const ox = spreadTotal > 1 ? (spreadIndex - (spreadTotal - 1) / 2) * spreadX : 0;
    return { x: cx + ox + sc.jx * 0.18, y: cy + sc.jy * 0.22 };
  }

  /** 强化界面部署的英雄；含星级与职业羁绊乘区；登场点见 heroDeployedSpawnXY */
  private spawnDeployedHeroes(boardAllies: SimUnit[]): SimUnit[] {
    const hooks = this.run.devBattleHooks;
    const cap = hooks ? Math.min(3, Math.max(1, Math.floor(hooks.heroSlotCap))) : maxHeroDeploySlots();
    const deployed = hooks?.heroDeploy ?? getDeployedHeroIds();
    const meta = loadHeroMeta();
    const priestM = priestBondTeamMultiplier(this.bondStacks.priest);
    const bossHpM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalHpMult : 1;
    const bossAtkM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalAtkMult : 1;
    const growHp = this.run.externalGrowth.permanentMaxHpMult;
    const growAtk = this.run.externalGrowth.permanentDamageMult;
    const gearM = gsCombatStatMult(sumEquippedGearGs());
    const classProgFor = (cls: AllyClass): number => classLevelStatMult(getClassLevel(cls));
    const jobs: { hid: HeroId; hd: NonNullable<ReturnType<typeof getHeroDef>> }[] = [];
    for (let s = 0; s < cap; s++) {
      const hid = deployed[s];
      if (!hid) continue;
      const hd = getHeroDef(hid);
      if (!hd) continue;
      jobs.push({ hid, hd });
    }
    const nHero = jobs.length;
    const out: SimUnit[] = [];
    let hi = 0;
    for (const { hid, hd } of jobs) {
      const entry = meta.heroes[hid];
      const stars = entry?.stars ?? 1;
      const starM = heroStarStatMult(stars);
      const cls = hd.allyClass;
      const classM = classBondHpAtkMultiplier(this.bondStacks[cls]);
      const mult = classM * priestM;
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
      if (cls === 'archer' && this.bondArcher12) range += 150;
      if (hid === ARCHER_STRONG_STRIKE_BLUE_ID) range += 50;
      const heroBonusCrit = hid === MAGE_ARCANE_BLUE_ID ? 0.1 : 0;
      const { x: sx, y: sy } = this.heroDeployedSpawnXY(boardAllies, cls, hi, nHero);
      hi += 1;
      if (cls === 'knight') {
        out.push(
          this.makeUnit('ally', sx, sy, eachHp, eachAtk, hd.attackSpeed, hd.range, hd.moveSpeed, hd.name, {
            allyKind: 'knight',
            knightState: 'charge',
            knightCooldown: 0,
            knightChargeTargetId: null,
            knightBond12: this.bondKnight12,
            knightDeathDenyLeft: this.bondKnight12 ? 1 : 0,
            invulnerable: true,
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

  /** 二十一极巨化羁绊：每种职业层数≥21 时，该职业随机 3 个入场小兵极巨化（代币与碰撞半径×1.5；atk/hp 不变） */
  private applyBond25Mega(allies: SimUnit[]): void {
    const m = BOND_MEGA_RADIUS_MULT;
    for (const kind of ALLY_CLASSES) {
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
        const u = pool[k]!;
        const hr = u.hitRadiusPx;
        u.hitRadiusPx = Math.max(1, Math.round(hr * m));
        if (u.tokenInnerR != null) {
          u.tokenInnerR = Math.max(1, Math.round(u.tokenInnerR * m));
        }
        u.root.scale.set(m);
        this.syncUnitRootFromStance(u);
      }
    }
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
      const pct = 0.1 * L;
      for (const e of this.units) {
        if (e.side !== 'enemy' || e.dead) continue;
        const loss = Math.max(1, Math.round(e.hp * pct));
        e.hp = Math.max(1, e.hp - loss);
      }
    }
    this.recomputeEnemyHp();
  }

  /**
   * 敌方：首领锚在镜像点略上方；小怪全场合并后按射程升序，扎堆在锚点附近，
   * 近战 y 更靠「两军中线」、远程更靠屏上缘（黄金角打散避免完全重叠）。
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
        const hp = scaledEnemyHp(chapter, ri, bc.baseMaxHpTable * 10, bookM, progMax);
        const atk = scaledEnemyAtk(chapter, ri, bc.combatBaseAtk, bookM, progMax);
        const bossLabel =
          wave.wowBossDisplayName && wave.wowBossDisplayName.trim().length > 0
            ? wave.wowBossDisplayName.trim()
            : bossDisplayName(wave.bossId);
        const bossCircleUid = bossUidForBookChapter(this.run.bookChapterId) ?? undefined;
        const bp = this.enemyFrontLineSpawnXY();
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

    const { ax, ay } = this.enemyHordeAnchorXY();
    const minions: SimUnit[] = [];
    const n = pending.length;
    const yStretch = Math.round(165 * LAYOUT_SCALE);
    const yRanged = ay - yStretch * 0.5;
    const yMelee = ay + yStretch * 0.48;
    const clusterW = Math.round(212 * LAYOUT_SCALE);

    for (let i = 0; i < n; i++) {
      const pe = pending[i]!;
      const rank = n > 1 ? i / (n - 1) : 0.5;
      const rawY = yRanged + (1 - rank) * (yMelee - yRanged);
      const gold = (i * 0.6180339887498949) % 1;
      const rawX = ax + (gold - 0.5) * clusterW;
      const ej = this.scatterOffset(ri * 97 + i * 41 + pe.waveOrder * 13);
      const p = this.clampBattleSpawnXY(rawX + ej.jx * 0.32, rawY + ej.jy * 0.32);
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
      knightBond12?: boolean;
      knightDeathDenyLeft?: number;
      invulnerable?: boolean;
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
    let strongStrikeAuraGfx: Graphics | undefined;
    if (side === 'ally' && opts.allyKind === 'knight') {
      aura = createKnightAura(hitRadiusPx);
      aura.position.set(0, -hitRadiusPx);
      aura.visible = !!opts.invulnerable;
      root.addChild(aura);
    }
    if (side === 'ally' && opts.heroId && isArcherStrongStrikeAuraHero(opts.heroId)) {
      strongStrikeAuraGfx = createStrongStrikeHeroAura(hitRadiusPx);
      strongStrikeAuraGfx.position.set(0, -hitRadiusPx);
      root.addChildAt(strongStrikeAuraGfx, 0);
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
    } else if (side === 'ally' && opts.heroId && isArcherStrongStrikeAuraHero(opts.heroId)) {
      skillIds = ['skill_hero_archer_strong_strike_aura'];
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
      strongStrikeAuraGfx,
      bossId: opts.bossId,
      allyKind: opts.allyKind,
      enemyPaint,
      skillIds,
      archerLockedAttackTargetId: null,
      archerFocusStacks: 0,
      knightState: opts.knightState,
      knightCooldown: opts.knightCooldown,
      knightChargeTargetId: opts.knightChargeTargetId ?? null,
      knightBond12: opts.knightBond12,
      knightDeathDenyLeft: opts.knightDeathDenyLeft,
      invulnerable: opts.invulnerable,
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
      heroId: opts.heroId,
    };
    if (side === 'enemy' && skillIds.includes('skill_berserker')) {
      u.bossBerserkBaseAtk = atk;
      u.bossBerserkStage = 0;
      u.bossBerserkSparkAcc = 0;
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
    if (rs) {
      redrawHpRingWithShield(rc, rl, rs, tr.cx, tr.cy, tr.ringR, tr.thick, ratio, shRatio, tr.solidColor);
    } else {
      redrawHpRingPair(rc, rl, tr.cx, tr.cy, tr.ringR, tr.thick, ratio, tr.solidColor);
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
    const arenaT = Math.round(195 * LAYOUT_SCALE);
    const arenaB = Math.round(1100 * LAYOUT_SCALE);

    const jx = (Math.random() - 0.5) * Math.round(150 * LAYOUT_SCALE);
    const nx = Math.max(arenaL, Math.min(arenaR, anchor.x + jx));
    const nyOff = this.leapBacklineNyOffDesign(u);
    const ny = Math.max(
      arenaT,
      Math.min(arenaB, anchor.y + this.unitTokenRootYOffsetPx(anchor) + nyOff * LAYOUT_SCALE),
    );

    const ox = u.x;
    const oy = u.y;
    const irU = this.unitTokenRootYOffsetPx(u);
    const oldRootY = oy + irU;
    u.x = nx;
    u.y = ny;
    this.syncUnitRootFromStance(u);

    this.ringFx.push(spawnRingPulse(this.fxLayer, ox, oldRootY - 18, 46, 0xf97316, 0.42));
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
    if ((u.stunT ?? 0) > 0) return;
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

  private spawnRfc3SummonWave(cx: number, cy: number, count: number, groupTag: number): void {
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

  private castRfc3SummonRite(u: SimUnit, def: SkillDef): void {
    this.floatBattleSkillName(RFC3_CH3_SKILL_SUMMON, u);
    const groups = Math.max(1, Math.floor(skillParamNumber(def, 3, 2)));
    const per = Math.max(1, Math.floor(skillParamNumber(def, 2, 3)));
    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const centerX = GAME_WIDTH * 0.5;
    const centerY = arenaTop + arenaH * 0.46;
    this.logBattleSkill(RFC3_CH3_SKILL_SUMMON, u, `groups=${groups} each=${per}`);
    for (let g = 0; g < groups; g++) {
      const gx = centerX + (g === 0 ? -Math.round(72 * LAYOUT_SCALE) : Math.round(72 * LAYOUT_SCALE));
      this.spawnRfc3SummonWave(gx, centerY, per, g);
    }
    this.applyUnitCollisionSeparation(3);
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
      a.stunT = Math.max(a.stunT ?? 0, stunSec);
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
    const gfx = buildProjectileGraphic(style);
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

  private beginDefaultAttack(u: SimUnit, target: SimUnit, dist: number, dx: number, dy: number): void {
    if (u.side === 'ally' && u.allyKind === 'archer') {
      const prev = u.archerLockedAttackTargetId;
      const next = target.unitId;
      if (prev != null && prev !== next) {
        if (!this.archerFocusPersistOnTargetSwitch()) {
          u.archerFocusStacks = 0;
        }
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
      } else if (this.unitHasSkill(u, 'skill_hot_strike')) {
        this.applyBossHotStrikeMelee(u, target, dmgF, enemyTag);
        if (this.unitHasSkill(u, 'skill_abomination_cleave')) {
          this.abominationCleaveFollowup(u, target);
        }
      } else {
        this.applyDamage(target, dmgF, { attacker: u, damageTag: enemyTag, meleeBasic: true });
        if (this.unitHasSkill(u, 'skill_abomination_cleave')) {
          this.abominationCleaveFollowup(u, target);
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
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, boss.x, boss.y - ir * 0.12));
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
        this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, u.x, u.y - u.hitRadiusPx * 0.2));
      }
    }
  }

  private nearestEnemy(from: SimUnit): SimUnit | null {
    let best: SimUnit | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of this.alive('enemy')) {
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
      if (this.bondPriest12) {
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

  private applyHeal(target: SimUnit, amount: number, src?: SimUnit): void {
    if (target.dead) return;
    const prev = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const gained = Math.round(target.hp - prev);
    if (gained <= 0) return;
    if (src?.side === 'ally') this.bumpBattleHealStat(src, gained);
    if (src?.allyKind === 'priest') {
      const ir = target.hitRadiusPx;
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, ir * 1.14, 0xbef264, 0.34));
    } else {
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 40, 0x4ade80, 0.45));
      if (src) this.ringFx.push(spawnRingPulse(this.fxLayer, src.x, src.y, 24, 0xa7f3d0, 0.35));
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, this.floatAnchorY(target), `+${gained}`, 'heal'),
    );
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
        const healAmt = hero.atk * (this.bondPriest12 ? 4 : 2);
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
      target.stunT = Math.max(target.stunT ?? 0, stunT);
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

    /** 无敌仅用于我方骑士冲锋等；敌方不应吃该标记（避免误伤导致打不动） */
    if (target.invulnerable && target.side === 'ally') return;

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
      if (
        target.allyKind === 'priest' &&
        this.run.priestAllyProtection &&
        this.alive('ally').some((a) => a.allyKind !== 'priest')
      ) {
        amt *= 0.5;
      }
    }

    const showFloat = ctx?.showFloat !== false;
    let blockedLabel = false;
    if (!ctx?.bypassBlock && target.side === 'ally' && target.allyKind === 'warrior' && ctx?.attacker && ctx.attacker.side === 'enemy') {
      const srcRanged = ctx.attacker.range >= RANGED_ATTACK_RANGE_THRESHOLD;
      let block = srcRanged || this.bondWarrior12;
      if (
        !block &&
        !srcRanged &&
        target.heroId === WARRIOR_WHIRL_BLUE_ID &&
        Math.random() < 0.1
      ) {
        block = true;
      }
      if (block) {
        const before = amt;
        amt *= 0.5;
        if (before > amt + 0.01) blockedLabel = true;
        if (this.bondWarrior12 && ctx.attacker && Math.random() < 0.3) {
          this.applyDamage(ctx.attacker, target.atk * 1.0, { attacker: target, bypassBlock: true });
          target.flashT = 0.14;
          this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, 52, 0xfde047, 0.42));
        }
      }
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
      target.knightBond12 &&
      (target.knightDeathDenyLeft ?? 0) > 0 &&
      dmgToHp >= target.hp
    ) {
      target.knightDeathDenyLeft = 0;
      target.hp = Math.max(1, Math.round(target.maxHp * 0.12));
      target.invulnerable = true;
      target.knightState = 'death_charge';
      const t = this.nearestEnemy(target);
      target.knightChargeTargetId = t?.unitId ?? null;
      return;
    }

    const prevHp = target.hp;
    const rawAfter = target.hp - dmgToHp;
    target.hp = Math.min(target.maxHp, Math.max(0, rawAfter));
    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
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
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y - target.hitRadiusPx * 0.2));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x + target.hitRadiusPx * 0.35, target.y + target.hitRadiusPx * 0.12));
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

  private allyOutgoingDamageMult(u: SimUnit): number {
    if (u.allyKind === 'knight' && u.knightBond12) {
      const r = u.hp / Math.max(1, u.maxHp);
      return 1 + (1 - r);
    }
    return 1;
  }

  /** 存活强击光环英雄（archer_01 / archer_02，蓝/紫品质弓手签名）在场时强击光环生效 */
  private allyStrongStrikeAuraHeroAlive(): boolean {
    return this.alive('ally').some((u) => isArcherStrongStrikeAuraHero(u.heroId));
  }

  /** 远程单位额外暴击率（按射手备战羁绊档 6→12%） */
  private strongStrikeAuraRangedCritBonus(): number {
    if (!this.allyStrongStrikeAuraHeroAlive()) return 0;
    return this.bondStacks.archer >= 6 ? 0.12 : 0.06;
  }

  /** 远程单位暴击伤害额外比例（羁绊≥10 时 +24%，与暴伤倍率叠乘为 ×(1+本值)） */
  private strongStrikeAuraRangedCritDmgAdd(): number {
    if (!this.allyStrongStrikeAuraHeroAlive()) return 0;
    return this.bondStacks.archer >= 10 ? 0.24 : 0;
  }

  /** 羁绊15：射手专注换目标不清层 */
  private archerFocusPersistOnTargetSwitch(): boolean {
    return this.allyStrongStrikeAuraHeroAlive() && this.bondStacks.archer >= 15;
  }

  /** 强击光环受益方：法师 / 射手（含对应英雄），不含骑士等其它高射程单位 */
  private isStrongStrikeAuraRangedClass(u: SimUnit): boolean {
    return u.allyKind === 'mage' || u.allyKind === 'archer';
  }

  private dealAllyHit(u: SimUnit, target: SimUnit, baseDmg: number, ctx?: DamageCtx): void {
    let dmg = baseDmg * this.allyOutgoingDamageMult(u);
    const rangedAura = this.isStrongStrikeAuraRangedClass(u);
    const auraCrit = rangedAura ? this.strongStrikeAuraRangedCritBonus() : 0;
    const auraCritDmg = rangedAura ? this.strongStrikeAuraRangedCritDmgAdd() : 0;
    if (u.allyKind === 'archer') {
      if (target.unitId === u.archerLockedAttackTargetId) {
        const st = Math.min(30, u.archerFocusStacks ?? 0);
        dmg *= 1 + 0.03 * st;
        u.archerFocusStacks = Math.min(30, st + 1);
      }
    }
    let damageTag: DamageCtx['damageTag'] = u.allyKind === 'mage' ? 'magic' : ctx?.damageTag;
    let critP = (u.bonusCrit ?? 0) + this.run.chaoticAllyCritBonus + auraCrit;
    if (u.allyKind === 'mage') critP += this.run.mageCritChance;
    if (u.allyKind === 'archer') critP += this.run.archerCritChance;
    if (Math.random() < critP) {
      const k = 1 + auraCritDmg;
      if (u.allyKind === 'archer') dmg *= this.run.archerCritDamageMult * k;
      else dmg *= 1.5 * k;
      damageTag = 'crit';
    }
    this.applyDamage(target, dmg, {
      ...ctx,
      attacker: u,
      damageTag,
      meleeBasic: !this.isRangedAttacker(u),
    });
    this.maybeMulanWhirlwindAfterAllyHit(u, target);
    if (Math.random() < 0.55) {
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    }
    if (u.allyKind === 'mage') {
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y, MAGE_SPLASH_RADIUS, 0x38bdf8, 0.38));
      for (const e of this.alive('enemy')) {
        if (e.unitId === target.unitId) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= MAGE_SPLASH_RADIUS) {
          this.applyDamage(e, u.atk * 0.5, { attacker: u, damageTag: 'magic' });
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
    const rangedAura = this.isStrongStrikeAuraRangedClass(attacker);
    const auraCrit = rangedAura ? this.strongStrikeAuraRangedCritBonus() : 0;
    let critP = (attacker.bonusCrit ?? 0) + this.run.chaoticAllyCritBonus + this.run.mageCritChance + auraCrit;
    let critMul = 1.5;
    if (mageBond >= 15 && target.bossId) {
      critP += 0.5;
      critMul *= 1.5;
    }
    let damageTag: DamageCtx['damageTag'] = 'magic';
    if (Math.random() < critP) {
      const k = 1 + (rangedAura ? this.strongStrikeAuraRangedCritDmgAdd() : 0);
      dmg = Math.max(1, Math.round(dmg * critMul * k));
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
    if (u.allyKind !== 'archer' || !this.bondArcher12) return;
    if (Math.random() >= 0.3) return;
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
    if (!this.bondMage12) return;
    const mages = this.alive('ally').filter((u) => u.allyKind === 'mage');
    if (!mages.length) return;
    this.meteorCd -= dt;
    if (this.meteorCd > 0) return;
    this.meteorCd = METEOR_INTERVAL;
    const enemies = this.alive('enemy');
    if (!enemies.length) return;
    const epicenter = enemies[Math.floor(Math.random() * enemies.length)]!;
    const sumAtk = mages.reduce((s, m) => s + m.atk, 0);
    let dmg = Math.max(1, Math.round(sumAtk));
    let meteorTag: 'crit' | 'magic' = 'magic';
    const meteorCritP = this.run.mageCritChance + this.strongStrikeAuraRangedCritBonus();
    if (this.run.mageMeteorCrits && Math.random() < meteorCritP) {
      const k = 1 + this.strongStrikeAuraRangedCritDmgAdd();
      dmg = Math.round(dmg * 1.5 * k);
      meteorTag = 'crit';
    }
    this.meteors.push(spawnMeteorAnim(this.fxLayer, epicenter.x, epicenter.y, METEOR_SPLASH_RADIUS));
    for (const e of this.alive('enemy')) {
      const d = Math.hypot(e.x - epicenter.x, e.y - epicenter.y);
      if (d <= METEOR_SPLASH_RADIUS) {
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
    if (!tgt) tgt = this.farthestEnemy(u);
    if (!tgt) {
      u.knightState = 'fight';
      u.invulnerable = false;
      u.knightCooldown = 15;
      return;
    }
    u.knightChargeTargetId = tgt.unitId;
    const dx = tgt.x - u.x;
    const dy = tgt.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rSum = this.hitRadius(u) + this.hitRadius(tgt);
    const chargeHitDist = KNIGHT_CHARGE_HIT_DIST + rSum;
    if (dist <= chargeHitDist) {
      const mul = u.knightState === 'death_charge' ? 3 : 3;
      this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y, 70, 0xfbbf24, 0.42));
      let dmgHit = u.atk * mul;
      if (tgt.bossId) dmgHit *= this.run.knightVsBossDamageMult;
      this.applyDamage(tgt, dmgHit, { attacker: u });
      u.knightState = 'fight';
      u.invulnerable = false;
      u.knightCooldown = 15;
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
    const healAmt = u.atk * (this.bondPriest12 ? 2 : 1);

    if (healPick) {
      if (healPick.inRange || this.bondPriest12) {
        const ht = healPick.target;
        u.cd -= dt;
        if (u.cd <= 0) {
          this.applyHeal(ht, healAmt, u);
          u.cd = Math.max(0.25, this.effectiveAttackInterval(u));
        }
        return;
      }
      const ht = healPick.target;
      const dx = ht.x - u.x;
      const dy = ht.y - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const healReach = this.effectiveSkillRangeTo(u, ht);
      const healMargin = this.meleeEngagementMarginPx(u, ht);
      const healAim = healReach + healMargin;
      if (dist > healAim) {
        const nx = dx / dist;
        const ny = dy / dist;
        const stepLen = u.speed * dt;
        const travel = Math.min(stepLen, Math.max(0, dist - healAim));
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

  private ensureBossConfiguredCdInit(boss: SimUnit): void {
    for (const sid of boss.skillIds) {
      if (!isBossConfiguredSkill(sid)) continue;
      const def = getSkillById(sid);
      if (!skillFiresInBattle(def)) continue;
      const k = this.bossSkillStateKey(boss, sid);
      if (this.bossSkillCdRemain.has(k)) continue;
      this.bossSkillCdRemain.set(k, skillParamNumber(def, 1, 0));
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
    const cd = skillParamNumber(def, 0, 12);
    const k = this.bossSkillStateKey(boss, skillId);
    this.bossSkillCdRemain.set(k, cd);
    this.bossSkillLastFinish.set(k, this.elapsed);
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
    if (st.kind === 'punch_windup' || st.kind === 'rush_windup') {
      if ((boss.stunT ?? 0) > 0) {
        const sid = st.skillId;
        st.warnFx.destroy({ children: true });
        boss.bossSkillCast = undefined;
        this.bossPutSkillOnCooldown(boss, sid);
        this.logBattleSkill(sid, boss, '蓄力·眩晕打断');
        return;
      }
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
    const cur = boss.bossSkillCast;
    const skip =
      cur?.kind === 'rush_charge'
        ? 'skill_boss_rush'
        : cur?.kind === 'punch_windup'
          ? 'skill_boss_punch'
          : cur?.kind === 'rush_windup'
            ? 'skill_boss_rush'
            : null;
    this.tickBossConfiguredSkillCds(boss, dt, skip);
    if (boss.bossSkillCast) {
      this.tickBossSkillCast(boss, dt);
      return;
    }
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
    this.tickBattleScreenShake(dt);
    const inFinishDelay = this.pendingFinishOutcome != null;

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
    this.tickShamanBloodlustAll(dt);
    this.tickCatapultBurns(dt);
    tickMeteorAnims(this.meteors, dt);
    tickSlashFx(this.slashes, dt);
    tickRayBurstFx(this.healBursts, dt);
    tickHolySanctionStrikes(this.holySanctionStrikes, dt);
    this.tickProjectiles(dt);

    for (const u of this.units) {
      if (u.dead) continue;
      if (u.hp > u.maxHp) u.hp = u.maxHp;

      if (u.side === 'ally') {
        this.tickAllyRfc3CorrosionDot(u, dt);
      }

      if (u.side === 'enemy') {
        this.tickEnemyEvilFrenzy(u, dt);
        this.tickEnemyShadowBoltTry(u, dt);
        this.tickRfc4Ch4BossExclusiveSkills(u, dt);
        this.tickRfc3Ch3BossExclusiveSkills(u, dt);
      }

      if (u.bossId && this.unitHasSkill(u, 'skill_berserker') && u.bossBerserkBaseAtk != null) {
        this.syncBossBerserkFromHp(u);
      }

      const kbActive = this.tickKnockbackTween(u, dt);
      this.syncHitFlash(u, dt);

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

      if ((u.stunT ?? 0) > 0) {
        if (u.heroArcaneChannel) this.interruptHeroArcaneMissilesChannel(u);
        if (u.rfc4MindLashChannel) this.interruptRfc4MindLashChannel(u, 'stun');
        u.stunT = Math.max(0, (u.stunT ?? 0) - dt);
        if (u.allyKind === 'knight' && (u.knightState === 'charge' || u.knightState === 'death_charge')) {
          u.knightState = 'fight';
          u.invulnerable = false;
          u.knightChargeTargetId = null;
          u.knightCooldown = Math.max(u.knightCooldown ?? 0, 7);
        }
        if ((u.stunT ?? 0) > 0) {
          u.body.tint = 0xa5b4fc;
          continue;
        }
      }

      if ((u.bloodlustT ?? 0) > 0) {
        u.bloodlustT = Math.max(0, (u.bloodlustT ?? 0) - dt);
        if ((u.bloodlustT ?? 0) <= 0) {
          u.bloodlustT = 0;
          const b = u.attackIntervalBase ?? u.attackInterval;
          u.attackInterval = b;
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
            a.stunT = Math.max(a.stunT ?? 0, skillParamNumber(dw, 2, 5));
          }
          this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y, 110, 0xc084fc, 0.55));
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
          continue;
        }
      }

      if (u.aura) {
        const charging = u.allyKind === 'knight' && (u.knightState === 'charge' || u.knightState === 'death_charge');
        u.aura.visible = !!(u.invulnerable && charging);
        if (u.aura.visible) u.aura.rotation += dt * 3.8;
      }

      if (u.strongStrikeAuraGfx && u.heroId && isArcherStrongStrikeAuraHero(u.heroId)) {
        u.strongStrikeAuraGfx.visible = !u.dead;
        if (u.strongStrikeAuraGfx.visible) u.strongStrikeAuraGfx.rotation += dt * 2.1;
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
      if (u.invulnerable && u.allyKind === 'knight') {
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

      if (u.allyKind === 'knight' && (u.knightState === 'charge' || u.knightState === 'death_charge')) {
        this.tickKnightCharge(u, dt);
        continue;
      }

      if (u.side === 'ally' && u.allyKind === 'priest') {
        const te = this.nearestEnemy(u);
        this.tickPriest(u, dt, te);
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
          u.knightState = 'charge';
          u.invulnerable = true;
          const t = this.farthestEnemy(u);
          u.knightChargeTargetId = t?.unitId ?? null;
          this.tickKnightCharge(u, dt);
          continue;
        }
      }

      if (u.side === 'enemy' && this.tickEnemyBacklineLeap(u, dt)) {
        continue;
      }

      if (u.bossId && u.bossSkillCast) {
        continue;
      }

      if (u.bossId && u.rfc4MindLashChannel) {
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
        if (dist <= aimDist || meleeStuck) {
          u.cd -= dt;
          if (u.cd <= 0) {
            this.beginDefaultAttack(u, target, dist, dx, dy);
          }
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
    this.finishPostDelayLeft = BATTLE_FINISH_POST_DELAY_SEC;
  }

  private finish(outcome: BattleOutcome): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd(outcome);
  }
}
