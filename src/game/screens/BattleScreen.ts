import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import {
  ALLY_CLASSES,
  BATTLE_MOVE_SPEED_MULT,
  BOARD_CELL_MAX_STACKS,
  BOSS_BATTLE_SECONDS,
  GAME_HEIGHT,
  GAME_WIDTH,
  LAYOUT_SCALE,
  NORMAL_BATTLE_SECONDS,
} from '../constants';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import type { AllyClass, BattleOutcome, BossId, EnemyClass, RoundMeta } from '../types';
import type { RunState } from '../runState';
import { ALLY_DEFS, ENEMY_DEFS, enemyCombatBaseAtkFromTable, scaledEnemyAtk, scaledEnemyHp } from '../unitDefs';
import { BOSS_SKILL_COOLDOWN_SEC, getSkillById, skillFiresInBattle, skillParamDesignPx, skillParamNumber } from '../skillsCatalog';
import { getHeroDef, heroStarStatMult } from '../heroRegistry';
import type { HeroId } from '../heroRegistry';
import { getDeployedHeroIds, loadHeroMeta, maxHeroDeploySlots } from '../heroMetaStorage';
import { bossDisplayName } from '../roundConfig';
import { bossUidForBookChapter, getWowMob, resolveWowBookBossCombat, WOW_BOOK_BOSS_TABLE_DEFAULT } from '../wowBookData';
import {
  allBondStacks,
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
  MeteorAnim,
  RayBurstFx,
  RingPulse,
  ShockwaveBeamFx,
  SlashFx,
  TinySparkFx,
} from '../battleVisuals';
import type { ProjectileVisualStyle } from '../battleVisuals';
import {
  buildProjectileGraphic,
  createKnightAura,
  spawnDeathTrailSpark,
  spawnShadowTrailSpark,
  spawnDualShotSlash,
  spawnFloatNumber,
  spawnHealBurst,
  spawnMeteorAnim,
  spawnRingPulse,
  spawnGroundBurnPatch,
  spawnHitSparkBurst,
  spawnTaurenShockwaveBeam,
  tickFloatEntries,
  tickHitSparkBursts,
  tickMeteorAnims,
  tickRayBurstFx,
  tickRingPulses,
  tickShockwaveBeamFx,
  tickSlashFx,
  tickTinySparks,
} from '../battleVisuals';
import { SynergyOverlay } from './SynergyOverlay';
import { createStyledGameButton } from '../ui/gameButtons';
import {
  BATTLE_ALLY_HP_RING_COLOR,
  BATTLE_ENEMY_HP_RING_COLOR,
  createBattleAllyToken,
  createBattleEnemyToken,
  createBattleHeroToken,
  redrawHpRingPair,
  unitFloatLabelOffsetYForInnerR,
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

const MAGE_SPLASH_RADIUS = Math.round(50 * LAYOUT_SCALE);
const METEOR_INTERVAL = 20;
const METEOR_SPLASH_RADIUS = Math.round(300 * LAYOUT_SCALE);

const KNOCKBACK_PAD_X = Math.round(38 * LAYOUT_SCALE);
const ARENA_Y_MIN = Math.round(192 * LAYOUT_SCALE);
const ARENA_Y_MAX = Math.round(1108 * LAYOUT_SCALE);
const KNIGHT_CHARGE_SPEED_MULT = 2.65;
const KNIGHT_CHARGE_HIT_DIST = Math.round(48 * LAYOUT_SCALE);

/** 与 `skillIds` / `wowBookMonsters` 中小怪跃后排技能一致 */
const MINION_LEAP_SKILL_IDS = ['skill_batrider_leap', 'skill_raider_leap', 'skill_beserker_leap'] as const;

/** 跃后排：锚点纵向偏移（设计像素），属兵种演出非表调数值 */
const LEAP_NYOFF_DESIGN_BATRIDER = 58;
const LEAP_NYOFF_DESIGN_RAIDER = 44;
const LEAP_NYOFF_DESIGN_BESERKER = 36;
/** 投石车燃烧区 tick 受击火花概率（演出） */
const CATAPULT_BURN_SPARK_CHANCE = 0.45;
/** 剑圣镜像普攻间隔相对本体（分身特性） */
const BLADEMASTER_MIRROR_ATTACK_INTERVAL_MULT = 1.1;

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
  /** 暗影箭：拖尾微粒累积 */
  shadowTrailAcc?: number;
};

type DamageCtx = {
  attacker?: SimUnit;
  /** 溅射、流星雨等可再走格挡 */
  bypassBlock?: boolean;
  damageTag?: 'crit' | 'magic';
  /** 为 false 时不飘字（如盾反的连锁） */
  showFloat?: boolean;
  /** 战士生命共享：防止均摊递归 */
  skipWarriorShare?: boolean;
  /** 近战单位普通攻击（非技能弹道/溅射）；用于概率击退 */
  meleeBasic?: boolean;
};

type SimUnit = {
  unitId: number;
  side: 'ally' | 'enemy';
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
  /** 环形血条几何与配色（战斗代币） */
  tokenRing?: { cx: number; cy: number; ringR: number; thick: number; solidColor: number };
  aura?: Graphics;
  bossId?: BossId;
  allyKind?: AllyClass;
  enemyPaint?: EnemyPaintKind;
  /** 挂载技能 id（`config/skills.json`）；书本首领来自 `wowBookBosses`，小怪来自 `wowBookMonsters` */
  skillIds: string[];
  /** 射手：同一目标叠层 */
  archerLastTargetId?: number | null;
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
  /** 牛头人酋长：首次致命伤触发「重生」（先锁 1 血再满血）后已消耗 */
  taurenRebirthConsumed?: boolean;
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
  tokenDisk?: Container;
  tokenLetter?: Text;
  tokenInnerR?: number;
};

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
  /** 剑圣周期技等首领技能累计 CD（key: `${unitId}|${skillId}`） */
  private bossSkillAcc = new Map<string, number>();
  private ended = false;
  /** 战斗已分出胜负，延后展示结算（等死亡飞出等播完） */
  private pendingFinishOutcome: BattleOutcome | null = null;
  private finishPostDelayLeft = 0;
  private hudTimer: Text;
  private hudAllyBar: Graphics;
  private hudAllyLabel: Text;
  private hudEnemyBar: Graphics;
  private hudEnemyLabel: Text;

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
  private meteors: MeteorAnim[] = [];
  private slashes: SlashFx[] = [];
  private healBursts: RayBurstFx[] = [];
  private shockBeams: ShockwaveBeamFx[] = [];
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

  constructor(app: Application, run: RunState, meta: RoundMeta, onEnd: (outcome: BattleOutcome) => void) {
    super();
    this.app = app;
    this.run = run;
    this.meta = meta;
    this.onEnd = onEnd;
    this.uiTestBattle = !!meta.uiTestBattle;
    this.uiTestSkillAcc = this.uiTestBattle ? -0.45 : 0;

    this.bondStacks = allBondStacks(run.board);
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

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x030712);
    bg.rect(0, 0, GAME_WIDTH, Math.round(420 * LAYOUT_SCALE)).fill({ color: 0x0f172a, alpha: 0.55 });
    bg.rect(0, Math.round(1380 * LAYOUT_SCALE), GAME_WIDTH, GAME_HEIGHT - Math.round(1380 * LAYOUT_SCALE)).fill({
      color: 0x020617,
      alpha: 0.65,
    });
    this.addChild(bg);

    const arenaPad = Math.round(12 * LAYOUT_SCALE);
    const arenaTop = Math.round(188 * LAYOUT_SCALE);
    const arenaH = Math.round(1012 * LAYOUT_SCALE);
    const arena = new Graphics();
    arena
      .roundRect(arenaPad, arenaTop, GAME_WIDTH - arenaPad * 2, arenaH, Math.round(22 * LAYOUT_SCALE))
      .fill({ color: 0x0c1222, alpha: 0.98 })
      .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x3b5998, alpha: 0.55 });
    this.addChild(arena);
    const arenaRim = new Graphics();
    arenaRim
      .roundRect(arenaPad - 3, arenaTop - 3, GAME_WIDTH - (arenaPad - 3) * 2, arenaH + 6, Math.round(24 * LAYOUT_SCALE))
      .stroke({ width: Math.max(3, Math.round(3 * LAYOUT_SCALE)), color: 0x38bdf8, alpha: 0.28 });
    this.addChild(arenaRim);

    const stars = new Graphics();
    for (let i = 0; i < 130; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.round(170 * LAYOUT_SCALE) + Math.random() * (GAME_HEIGHT - Math.round(340 * LAYOUT_SCALE));
      const rr = (Math.random() * 1.6 + 0.25) * LAYOUT_SCALE;
      stars.circle(sx, sy, rr).fill({ color: 0xe2e8f0, alpha: 0.035 + Math.random() * 0.08 });
    }
    this.addChild(stars);

    const hudPad = Math.round(28 * LAYOUT_SCALE);
    const hint = new Text({
      text: meta.uiTestBattle
        ? `UI技能测试：约每 2.75s 自动触发复合特效 · 按 T 手动触发 · 歼敌或倒计时结束`
        : `开打阶段：${meta.label} · 自动战斗`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: meta.uiTestBattle ? 0xfbbf24 : 0x64748b,
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - Math.round(56 * LAYOUT_SCALE),
        lineHeight: Math.round(28 * LAYOUT_SCALE),
      },
    });
    hint.position.set(hudPad, Math.round(176 * LAYOUT_SCALE));
    this.addChild(hint);

    this.addChild(this.unitLayer);
    const alliesSpawned = this.spawnAllies();
    this.applyBond25Mega(alliesSpawned);
    const heroUnits = this.spawnDeployedHeroes(alliesSpawned);
    this.units = [...alliesSpawned, ...heroUnits, ...this.spawnEnemies(meta)];
    this.jitterChaosSpawnPositions();
    this.applyRevengeSpiritOpening();
    this.applyUnitCollisionSeparation(5);
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

    const bondW = Math.round(176 * LAYOUT_SCALE);
    const bondH = Math.round(44 * LAYOUT_SCALE);
    const bondBtn = createStyledGameButton('battleBond', {
      text: '羁绊 / 策略',
      width: bondW,
      height: bondH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    bondBtn.position.set(GAME_WIDTH - hudPad - bondW, Math.round(44 * LAYOUT_SCALE));
    bondBtn.on('pointertap', (e) => {
      e.stopPropagation();
      const ov = new SynergyOverlay(this.run, () => {
        this.removeChild(ov);
        ov.destroy({ children: true });
      });
      this.addChild(ov);
    });
    this.addChild(bondBtn);

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

    this._tick = (ticker) => this.updateFrame(ticker.deltaMS / 1000);
    this.app.ticker.add(this._tick);
  }

  override destroy(): void {
    if (this.uiTestKeyHandler) {
      window.removeEventListener('keydown', this.uiTestKeyHandler);
      this.uiTestKeyHandler = null;
    }
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

  private hitRadius(u: SimUnit): number {
    return u.hitRadiusPx;
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

  private floatLabelY(u: SimUnit): number {
    return unitFloatLabelOffsetYForInnerR(u.hitRadiusPx);
  }

  /** 开发 · uiTestBattle：一次性打出多种飘字与 FX，便于验收层级与可读性 */
  private fireUiTestSkillBurst(): void {
    const refR = Math.round(ALLY_DEFS.warrior.hitRadius * LAYOUT_SCALE);
    const fallbackOff = unitFloatLabelOffsetYForInnerR(refR);
    const ally = this.alive('ally')[0];
    const enemy = this.alive('enemy')[0];
    const cx = GAME_WIDTH * 0.5;
    const cy = Math.round(540 * LAYOUT_SCALE);
    const ax = ally?.x ?? cx - Math.round(140 * LAYOUT_SCALE);
    const ay = ally?.y ?? cy;
    const ex = enemy?.x ?? cx + Math.round(140 * LAYOUT_SCALE);
    const ey = enemy?.y ?? cy;
    const aOff = ally ? this.floatLabelY(ally) : fallbackOff;
    const eOff = enemy ? this.floatLabelY(enemy) : fallbackOff;

    this.floatWords.push(spawnFloatNumber(this.floatLayer, ex, ey - eOff, '-99', 'damage'));
    this.floatWords.push(spawnFloatNumber(this.floatLayer, ex, ey - eOff - 36, '-222', 'crit'));
    this.floatWords.push(spawnFloatNumber(this.floatLayer, ex, ey - eOff - 72, '-88', 'magic'));
    this.floatWords.push(spawnFloatNumber(this.floatLayer, ax, ay - aOff, '+55', 'heal'));
    this.floatWords.push(spawnFloatNumber(this.floatLayer, ax, ay - aOff - 34, '格挡', 'block'));
    this.floatWords.push(spawnFloatNumber(this.floatLayer, cx, cy - fallbackOff, '测试技能', 'buff'));

    this.ringFx.push(spawnRingPulse(this.fxLayer, ex, ey - 18, 52, 0x38bdf8, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, ax, ay - 22, 64, 0x4ade80, 0.38));
    this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, ex, ey));
    this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, ax, ay - 10));
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
    const slow = (u.moveSlowT ?? 0) > 0 ? 0.5 : 1;
    u.speed = u.speedBase * slow;
  }

  /** 受击者沿远离攻击者方向被推开（ease-out，首领受击者不触发 probability knockback 由调用方保证） */
  private knockbackTargetFromAttacker(target: SimUnit, attacker: SimUnit, dist: number): void {
    if (target.dead || (target.invulnerable && target.side === 'ally')) return;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.hypot(dx, dy) || 1;
    let tx = target.x + (dx / d) * dist;
    let ty = target.y + (dy / d) * dist;
    if (target.side === 'ally') {
      const c = this.clampAllyKnockbackXY(tx, ty);
      tx = c.x;
      ty = c.y;
    } else {
      const c = this.clampEnemyKnockbackXY(tx, ty);
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
      spawnFloatNumber(this.floatLayer, target.x, target.y - this.floatLabelY(target) - 36, '击退', 'magic'),
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
    const c = this.clampAllyKnockbackXY(tx, ty);
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

  private clampAllyKnockbackXY(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(KNOCKBACK_PAD_X, Math.min(GAME_WIDTH - KNOCKBACK_PAD_X, x)),
      y: Math.max(ARENA_Y_MIN, Math.min(ARENA_Y_MAX, y)),
    };
  }

  private clampEnemyKnockbackXY(x: number, y: number): { x: number; y: number } {
    const padX = Math.round(38 * LAYOUT_SCALE);
    return {
      x: Math.max(padX, Math.min(GAME_WIDTH - padX, x)),
      y: Math.max(Math.round(195 * LAYOUT_SCALE), Math.min(Math.round(1100 * LAYOUT_SCALE), y)),
    };
  }

  private maybeDarkspearKnockback(attacker: SimUnit, target: SimUnit): void {
    if (attacker.side !== 'enemy' || !this.unitHasSkill(attacker, 'skill_darkspear_slow_knockback') || target.side !== 'ally' || target.dead) return;
    const ds = getSkillById('skill_darkspear_slow_knockback');
    if (Math.random() >= skillParamNumber(ds, 0, 0.1)) return;
    this.knockbackAllyFromPoint(target, attacker.x, attacker.y, skillParamDesignPx(ds, 1, 100));
    target.stunT = Math.max(target.stunT ?? 0, skillParamNumber(ds, 2, 1));
    target.moveSlowT = skillParamNumber(ds, 3, 5);
    this.syncUnitMoveSpeed(target);
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    this.slashes.push(spawnDualShotSlash(this.fxLayer, target.x, target.y));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 18, 52, 0x2dd4bf, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 20, 76, 0x0d9488, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 14, 34, 0xf0fdfa, 0.32));
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, target.y - this.floatLabelY(target) - 48, '击退', 'magic'),
    );
  }

  /** 牛头人酋长专属：「重生」满血特效 */
  private procTaurenRebirthVfx(u: SimUnit): void {
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, u.x, u.y - this.floatLabelY(u) - 78, '重生', 'heal'),
    );
    const cols = [0xfef08a, 0xfbbf24, 0x22c55e, 0x38bdf8, 0xe9d5ff] as const;
    for (let k = 0; k < 6; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, u.x, u.y - 18 - k * 4, 64 + k * 38, cols[k % cols.length]!, 0.42 + k * 0.05),
      );
    }
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y - 26, 220, 0xfacc15, 0.28));
    for (let i = 0; i < 4; i++) {
      this.hitSparks.push(
        spawnHitSparkBurst(this.fxLayer, u.x + (Math.random() - 0.5) * 40 * LAYOUT_SCALE, u.y + (Math.random() - 0.5) * 30 * LAYOUT_SCALE),
      );
    }
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
      this.ringFx.push(spawnRingPulse(this.fxLayer, primary.x, primary.y - 18, 56, 0x4ade80, 0.35));
    }
  }

  private applyBloodlustBuff(_caster: SimUnit, recipient: SimUnit): void {
    const sh = getSkillById('skill_shaman_bloodlust');
    const buffSec = skillParamNumber(sh, 2, 12);
    const atkMul = skillParamNumber(sh, 3, 1.5);
    recipient.bloodlustT = buffSec;
    const base = recipient.attackIntervalBase ?? recipient.attackInterval;
    recipient.attackIntervalBase = base;
    recipient.attackInterval = base / atkMul;
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, recipient.x, recipient.y - this.floatLabelY(recipient) - 40, '嗜血术', 'buff'),
    );
    for (let k = 0; k < 3; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, recipient.x, recipient.y - 16 + k * 3, 52 + k * 12, 0xdc2626, 0.36 + k * 0.05),
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

  /** 全单位软碰撞：推开重叠，并夹在场内 */
  private applyUnitCollisionSeparation(iterations: number): void {
    const padX = Math.round(38 * LAYOUT_SCALE);
    const yMin = Math.round(192 * LAYOUT_SCALE);
    const yMax = Math.round(1108 * LAYOUT_SCALE);

    const clampOne = (u: SimUnit): void => {
      u.x = Math.max(padX, Math.min(GAME_WIDTH - padX, u.x));
      u.y = Math.max(yMin, Math.min(yMax, u.y));
      u.root.position.set(u.x, u.y);
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
          const minD = this.hitRadius(a) + this.hitRadius(b);
          if (dist >= minD) continue;
          const bothAlly = a.side === 'ally' && b.side === 'ally';
          const push = (minD - dist) * (bothAlly ? 0.34 : 0.52);
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
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
      const eachHp = Math.max(1, Math.round(def.maxHp * mult * ab.hpMult * bossHpM * growHp));
      const eachAtk = Math.max(1, Math.round(def.atk * mult * ab.atkMult * bossAtkM * growAtk));

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

  private countAllyBodies(list: SimUnit[], cls: AllyClass): number {
    return list.filter((u) => u.side === 'ally' && !u.heroId && u.allyKind === cls).length;
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

  /** 强化界面部署的英雄；含星级与「同职业兵」被动叠乘；登场点见 heroDeployedSpawnXY */
  private spawnDeployedHeroes(boardAllies: SimUnit[]): SimUnit[] {
    const cap = maxHeroDeploySlots();
    const deployed = getDeployedHeroIds();
    const meta = loadHeroMeta();
    const priestM = priestBondTeamMultiplier(this.bondStacks.priest);
    const bossHpM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalHpMult : 1;
    const bossAtkM = this.meta.kind === 'boss' ? this.run.bossHpDerivedFinalAtkMult : 1;
    const growHp = this.run.externalGrowth.permanentMaxHpMult;
    const growAtk = this.run.externalGrowth.permanentDamageMult;
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
      const matchN = this.countAllyBodies(boardAllies, cls);
      const bondAllyMult = 1 + 0.08 * matchN;
      const eachHp = Math.max(
        1,
        Math.round(hd.maxHp * starM * mult * bossHpM * growHp * bondAllyMult),
      );
      const eachAtk = Math.max(
        1,
        Math.round(hd.atk * starM * mult * bossAtkM * growAtk * bondAllyMult),
      );
      let range = hd.range;
      if (cls === 'archer' && this.bondArcher12) range += 150;
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
            bonusCrit: 0,
            hitRadiusDesign: hd.hitRadius,
            heroId: hid,
          }),
        );
      } else {
        out.push(
          this.makeUnit('ally', sx, sy, eachHp, eachAtk, hd.attackSpeed, range, hd.moveSpeed, hd.name, {
            allyKind: cls,
            bonusCrit: 0,
            hitRadiusDesign: hd.hitRadius,
            heroId: hid,
          }),
        );
      }
    }
    return out;
  }

  /** 二十一极巨化羁绊：每种职业层数≥21 时，该职业随机 3 个入场单位极巨化（体型、攻击、生命翻倍） */
  private applyBond25Mega(allies: SimUnit[]): void {
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
        u.atk = Math.max(1, Math.round(u.atk * 2));
        u.maxHp = Math.max(1, Math.round(u.maxHp * 2));
        u.hp = Math.min(u.maxHp, Math.round(u.hp * 2));
        u.root.scale.set(2);
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
      u.x = xmin + Math.random() * (xmax - xmin);
      u.y = ymin + Math.random() * (ymax - ymin);
      u.root.position.set(u.x, u.y);
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
    const ri = this.run.currentRoundIndex;
    const bookM = this.run.bookChapterStrengthMult();

    for (const wave of meta.enemies) {
      if (wave.type === 'boss' && wave.bossId) {
        const bc = resolveWowBookBossCombat(this.run.bookChapterId);
        const hp = scaledEnemyHp(chapter, ri, bc.baseMaxHpTable * 10, bookM);
        const atk = scaledEnemyAtk(chapter, ri, bc.combatBaseAtk, bookM);
        const bj = this.scatterOffset(ri * 3 + 101 + bosses.length * 31);
        const bossLabel =
          wave.wowBossDisplayName && wave.wowBossDisplayName.trim().length > 0
            ? wave.wowBossDisplayName.trim()
            : bossDisplayName(wave.bossId);
        const bossCircleUid = bossUidForBookChapter(this.run.bookChapterId) ?? undefined;
        const anchor = this.enemyHordeAnchorXY();
        const bossX = anchor.ax + bj.jx * 0.28;
        const bossY = anchor.ay - Math.round(118 * LAYOUT_SCALE) + bj.jy * 0.28;
        const bp = this.clampBattleSpawnXY(bossX, bossY);
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
            const hp = scaledEnemyHp(chapter, ri, def.baseMaxHp, bookM);
            const atk = scaledEnemyAtk(chapter, ri, def.baseAtk, bookM);
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
          const hp = scaledEnemyHp(chapter, ri, mob.baseMaxHp, bookM);
          const atk = scaledEnemyAtk(chapter, ri, baseAtk, bookM);
          pending.push({
            range: mob.range,
            waveOrder: wo,
            mk: (x, y) =>
                this.makeUnit('enemy', x, y, hp, atk, mob.attackSpeed, mob.range, mob.moveSpeed, mob.nameCn, {
                  enemyPaint: paint,
                  hitRadiusDesign: mob.hitRadius,
                  wowCirclePortraitUid: mob.monsterUid,
                  ...(mob.skillIds !== undefined ? { enemySkillIds: [...mob.skillIds] } : {}),
                }),
          });
        }
        continue;
      }

      const type = wave.type as keyof typeof ENEMY_DEFS;
      const def = ENEMY_DEFS[type];
      for (let k = 0; k < wave.count; k++) {
        const wo = waveOrder++;
        const hp = scaledEnemyHp(chapter, ri, def.baseMaxHp, bookM);
        const atk = scaledEnemyAtk(chapter, ri, def.baseAtk, bookM);
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
       * 非首领小怪：`wowBookMonsters` 条目的 `skillIds`。
       * 未传时仍用 `ENEMY_DEFS[enemyPaint].skillIds`（旧模板怪）；传空数组表示无技能。
       */
      enemySkillIds?: string[];
      /**
       * 书本首领：`resolveWowBookBossCombat` 解析出的 `skillIds`（可空）；未传 `bossSkillIds` 时视为无额外技能。
       */
      bossSkillIds?: string[];
    } = {},
  ): SimUnit {
    const root = new Container();
    root.position.set(x, y);

    const hitRadiusPx = Math.round((opts.hitRadiusDesign ?? ENEMY_DEFS.grunt.hitRadius) * LAYOUT_SCALE);

    let aura: Graphics | undefined;
    if (side === 'ally' && opts.allyKind === 'knight') {
      aura = createKnightAura(-hitRadiusPx);
      aura.visible = !!opts.invulnerable;
      root.addChild(aura);
    }

    let body: Container;
    let hpRingCur: Graphics | undefined;
    let hpRingLost: Graphics | undefined;
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

    let hitFlashOverlay: Graphics | undefined;
    if (tokenInnerR != null) {
      hitFlashOverlay = new Graphics();
      hitFlashOverlay.circle(0, -tokenInnerR, tokenInnerR * 0.94).fill({ color: 0xffffff, alpha: 0 });
      body.addChild(hitFlashOverlay);
    }

    const enemyPaint: EnemyPaintKind | undefined =
      side === 'enemy' ? (opts.bossId ? this.bossEnemyPaint(opts.bossId) : opts.enemyPaint ?? 'grunt') : undefined;

    let skillIds: string[] = [];
    if (side === 'enemy') {
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

    const u: SimUnit = {
      unitId: this.allocUnitId(),
      side,
      x,
      y,
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
      tokenRing,
      tokenDisk,
      tokenLetter,
      tokenInnerR,
      hitFlashOverlay,
      aura,
      bossId: opts.bossId,
      allyKind: opts.allyKind,
      enemyPaint,
      skillIds,
      archerLastTargetId: null,
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
    if (!tr || !rc || !rl) return;
    const ratio = u.hp / Math.max(1, u.maxHp);
    redrawHpRingPair(rc, rl, tr.cx, tr.cy, tr.ringR, tr.thick, ratio, tr.solidColor);
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

  /** @returns 击退缓动是否仍在进行 */
  private tickKnockbackTween(u: SimUnit, dt: number): boolean {
    const kb = u.knockbackTween;
    if (!kb) return false;
    kb.elapsed += dt;
    const p = Math.min(1, kb.elapsed / kb.dur);
    const e = 1 - (1 - p) ** 3;
    u.x = kb.sx + (kb.tx - kb.sx) * e;
    u.y = kb.sy + (kb.ty - kb.sy) * e;
    u.root.position.set(u.x, u.y);
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
    const ny = Math.max(arenaT, Math.min(arenaB, anchor.y + nyOff * LAYOUT_SCALE));

    const ox = u.x;
    const oy = u.y;
    u.x = nx;
    u.y = ny;
    u.root.position.set(u.x, u.y);

    this.ringFx.push(spawnRingPulse(this.fxLayer, ox, oy - 18, 46, 0xf97316, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, nx, ny - 18, 58, 0xfbbf24, 0.52));

    if (this.unitHasSkill(u, 'skill_raider_leap')) {
      const rd = getSkillById('skill_raider_leap');
      u.raiderLeapBuffT = skillParamNumber(rd, 0, 5);
      this.ringFx.push(spawnRingPulse(this.fxLayer, nx, ny - 22, 72, 0xfde047, 0.48));
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
      this.ringFx.push(spawnRingPulse(this.fxLayer, nx, ny - 14, Math.max(40, Math.round(rAo * 0.9)), 0xa855f7, 0.55));
    }

    const baseCd = this.leapBacklineCdBase(u);
    u.enemyLeapCd = baseCd + Math.random() * 2.2;
    return true;
  }

  private unitHasSkill(u: SimUnit, skillId: string): boolean {
    return u.skillIds.length > 0 && u.skillIds.includes(skillId);
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
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y - 18, 52, 0xdc2626, 0.48));
    this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y - 16, 78, 0xf87171, 0.4));
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
        this.ringFx.push(spawnRingPulse(this.fxLayer, tx, ty - 12, 22, 0x581c87, 0.36));
        this.ringFx.push(spawnRingPulse(this.fxLayer, tx, ty - 10, 48, 0x7e22ce, 0.42));
        this.ringFx.push(spawnRingPulse(this.fxLayer, tx, ty - 8, 72, 0xc4b5fd, 0.38));
        this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, tx, ty));
      },
      { style: 'enemy_shadow_bolt', speedMul: 0.88 },
    );
  }

  private procSkillBoomExplosion(dead: SimUnit): void {
    const bo = getSkillById('skill_boom');
    if (!bo) return;
    const r = skillParamDesignPx(bo, 0, 50);
    const pct = skillParamNumber(bo, 1, 100) / 100;
    const base = Math.max(1, Math.round(dead.atk * pct));
    const cx = dead.x;
    const cy = dead.y;
    const deadR = this.hitRadius(dead);
    const cols = [0xf97316, 0xfbbf24, 0xfca5a5, 0xfef08a] as const;
    for (let k = 0; k < 4; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, cx, cy - 14, Math.round(28 * LAYOUT_SCALE) + k * Math.round(42 * LAYOUT_SCALE), cols[k]!, 0.42 + k * 0.06),
      );
    }
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, cx, cy - 14));
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
        this.unitHasSkill(u, 'skill_darkspear_slow_knockback') ||
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
    opts?: { style?: ProjectileVisualStyle; speedMul?: number },
  ): void {
    const style = opts?.style ?? this.projectileStyleFor(attacker);
    const speedMul = opts?.speedMul ?? 1;
    const gfx = buildProjectileGraphic(style);
    gfx.position.set(attacker.x, attacker.y - 18);
    this.fxLayer.addChild(gfx);
    this.projectiles.push({
      gfx,
      x: attacker.x,
      y: attacker.y - 18,
      speed: Math.round(800 * LAYOUT_SCALE * speedMul),
      targetId,
      attackerId: attacker.unitId,
      life: 0,
      onHit,
      style,
      shadowTrailAcc: style === 'enemy_shadow_bolt' ? 0 : undefined,
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
      const ty = tgt.y - 18;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const src = p.attackerId != null ? this.byId(p.attackerId) : null;
      const rSrc = src && !src.dead ? this.hitRadius(src) : PROJECTILE_HIT_BASE;
      const hitDist = this.hitRadius(tgt) + rSrc;
      if (dist <= hitDist) {
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
      }
      const pulse = 1 + 0.14 * Math.sin(p.life * 28);
      p.gfx.scale.set(LAYOUT_SCALE * pulse);
    }
  }

  private beginDefaultAttack(u: SimUnit, target: SimUnit, dist: number, dx: number, dy: number): void {
    let dmg = u.atk;
    let enemyTag: DamageCtx['damageTag'] | undefined;
    const bm = getSkillById('skill_blademaster_crit');
    if (u.side === 'enemy' && this.unitHasSkill(u, 'skill_blademaster_crit') && Math.random() < skillParamNumber(bm, 0, 0.35)) {
      dmg *= skillParamNumber(bm, 1, 2);
      enemyTag = 'crit';
    } else if (u.side === 'enemy' && this.unitHasSkill(u, 'skill_normal_crit')) {
      const nc = getSkillById('skill_normal_crit');
      const pCrit = skillParamNumber(nc, 0, 20) / 100;
      if (Math.random() < pCrit) {
        dmg *= skillParamNumber(nc, 1, 2);
        enemyTag = 'crit';
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
          this.applyDamage(t, dmgF, { attacker: a, damageTag: tagF });
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
    if (src?.allyKind === 'priest') {
      const ir = target.hitRadiusPx;
      const cx = target.x;
      const cy = target.y - ir;
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, ir * 1.06, 0xbef264, 0.24));
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, ir * 1.38, 0xd9f99d, 0.28));
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, ir * 1.78, 0xf7fee7, 0.32));
      this.ringFx.push(spawnRingPulse(this.fxLayer, cx, cy, ir * 2.05, 0xffffff, 0.26));
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, target.y - this.floatLabelY(target), `+${gained}`, 'heal'),
    );
    this.healBursts.push(spawnHealBurst(this.fxLayer, target.x, target.y - 10));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 20, 40, 0x4ade80, 0.45));
    if (src) this.ringFx.push(spawnRingPulse(this.fxLayer, src.x, src.y - 18, 24, 0xa7f3d0, 0.35));
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

    if (
      target.side === 'ally' &&
      target.allyKind === 'knight' &&
      target.knightBond12 &&
      (target.knightDeathDenyLeft ?? 0) > 0 &&
      amt >= target.hp
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
    const showFloat = ctx?.showFloat !== false;
    let blockedLabel = false;
    if (!ctx?.bypassBlock && target.side === 'ally' && target.allyKind === 'warrior' && ctx?.attacker && ctx.attacker.side === 'enemy') {
      const srcRanged = ctx.attacker.range >= RANGED_ATTACK_RANGE_THRESHOLD;
      const block = srcRanged || this.bondWarrior12;
      if (block) {
        const before = amt;
        amt *= 0.5;
        if (before > amt + 0.01) blockedLabel = true;
        if (this.bondWarrior12 && ctx.attacker && Math.random() < 0.3) {
          this.applyDamage(ctx.attacker, target.atk * 1.0, { attacker: target, bypassBlock: true });
          target.flashT = 0.14;
          this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 22, 52, 0xfde047, 0.42));
        }
      }
    }

    const rawAfter = target.hp - amt;
    if (target.bossId === 'tauren' && !target.taurenRebirthConsumed && rawAfter <= 0) {
      /** 重生：先锁 1 血再满血，避免 hp 经过 0 与「敌全灭」等判定产生竞态 */
      target.taurenRebirthConsumed = true;
      target.hp = 1;
      this.procTaurenRebirthVfx(target);
      target.hp = target.maxHp;
      target.dead = false;
      target.root.visible = true;
    } else {
      target.hp = Math.min(target.maxHp, Math.max(0, rawAfter));
      if (target.hp <= 0) {
        target.hp = 0;
        target.dead = true;
        if (!target.bossId) {
          if (target.hpRingCur) target.hpRingCur.visible = false;
          if (target.hpRingLost) target.hpRingLost.visible = false;
          if (this.unitHasSkill(target, 'skill_boom')) {
            this.procSkillBoomExplosion(target);
            target.boomSkipDeathAnim = true;
            target.root.visible = false;
          } else {
            const launch = this.buildDeathLaunch(target.x);
            target.deathAnim = {
              elapsed: 0,
              maxT: launch.maxT,
              wx: target.x,
              wy: target.y,
              vx: launch.vx,
              vy: launch.vy,
              g: launch.g,
              spin: (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 32),
              trailTimer: 0,
            };
            target.root.visible = true;
            target.root.alpha = 1;
            target.body.rotation = 0;
            const ir = target.tokenInnerR ?? target.hitRadiusPx;
            target.body.origin.set(0, -ir);
          }
        } else {
          target.root.visible = false;
        }
      }
    }
    this.recomputeEnemyHp();

    const lost = Math.max(0, Math.round(prevHp - target.hp));
    if (lost > 0 && target.hitFlashOverlay) {
      target.hitFlashT = HIT_FLASH_DUR;
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
      !target.bossId &&
      ctx.attacker.range < RANGED_ATTACK_RANGE_THRESHOLD &&
      Math.random() < 0.2
    ) {
      const kb = Math.round((20 + Math.random() * 30) * LAYOUT_SCALE);
      this.knockbackTargetFromAttacker(target, ctx.attacker, kb);
    }
    if (lost > 0 && showFloat) {
      const kind =
        ctx?.damageTag === 'crit' ? 'crit' : ctx?.damageTag === 'magic' ? 'magic' : 'damage';
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, target.y - this.floatLabelY(target), `-${lost}`, kind),
      );
      if (Math.random() < 0.45) {
        this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, target.x, target.y));
      }
    }
    if (blockedLabel && showFloat && target.allyKind === 'warrior') {
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, target.y - this.floatLabelY(target) - 28, '格挡', 'block'),
      );
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

  private dealAllyHit(u: SimUnit, target: SimUnit, baseDmg: number, ctx?: DamageCtx): void {
    let dmg = baseDmg * this.allyOutgoingDamageMult(u);
    if (u.allyKind === 'archer') {
      if (u.archerLastTargetId !== target.unitId) {
        u.archerLastTargetId = target.unitId;
        u.archerFocusStacks = 0;
      }
      const st = Math.min(30, u.archerFocusStacks ?? 0);
      dmg *= 1 + 0.03 * st;
      u.archerFocusStacks = Math.min(30, st + 1);
    }
    let damageTag: DamageCtx['damageTag'] = u.allyKind === 'mage' ? 'magic' : ctx?.damageTag;
    let critP = (u.bonusCrit ?? 0) + this.run.chaoticAllyCritBonus;
    if (u.allyKind === 'mage') critP += this.run.mageCritChance;
    if (u.allyKind === 'archer') critP += this.run.archerCritChance;
    if (Math.random() < critP) {
      if (u.allyKind === 'archer') dmg *= this.run.archerCritDamageMult;
      else dmg *= 1.5;
      damageTag = 'crit';
    }
    this.applyDamage(target, dmg, {
      ...ctx,
      attacker: u,
      damageTag,
      meleeBasic: !this.isRangedAttacker(u),
    });
    if (Math.random() < 0.55) {
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    }
    if (u.allyKind === 'mage') {
      this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 20, MAGE_SPLASH_RADIUS, 0x38bdf8, 0.38));
      for (const e of this.alive('enemy')) {
        if (e.unitId === target.unitId) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= MAGE_SPLASH_RADIUS) {
          this.applyDamage(e, u.atk * 0.5, { attacker: u, damageTag: 'magic' });
        }
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
    if (this.run.mageMeteorCrits && this.run.mageCritChance > 0 && Math.random() < this.run.mageCritChance) {
      dmg = Math.round(dmg * 1.5);
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
      this.ringFx.push(spawnRingPulse(this.fxLayer, tgt.x, tgt.y - 18, 70, 0xfbbf24, 0.42));
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
    u.root.position.set(u.x, u.y);
  }

  private tickPriest(u: SimUnit, dt: number, targetEnemy: SimUnit | null): void {
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
        u.root.position.set(u.x, u.y);
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
      u.root.position.set(u.x, u.y);
    }
  }

  /** 闪电链首个目标：当前生命最低；并列时百分比更低者优先 */
  private pickLowestHpAllyForChain(exclude: ReadonlySet<number>): SimUnit | null {
    let best: SimUnit | null = null;
    for (const a of this.alive('ally')) {
      if (exclude.has(a.unitId)) continue;
      if (!best) {
        best = a;
        continue;
      }
      if (a.hp < best.hp) {
        best = a;
        continue;
      }
      if (a.hp === best.hp) {
        const ra = a.hp / Math.max(1, a.maxHp);
        const rb = best.hp / Math.max(1, best.maxHp);
        if (ra < rb) best = a;
      }
    }
    return best;
  }

  private pickNearestAllyToPoint(px: number, py: number, exclude: ReadonlySet<number>): SimUnit | null {
    let best: SimUnit | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const a of this.alive('ally')) {
      if (exclude.has(a.unitId)) continue;
      const d = Math.hypot(a.x - px, a.y - py);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  private spawnScaledGruntEnemy(worldX: number, worldY: number, seed: number): SimUnit {
    const { chapter } = this.meta;
    const ri = this.run.currentRoundIndex;
    const bookM = this.run.bookChapterStrengthMult();
    const def = ENEMY_DEFS.grunt;
    const hp = scaledEnemyHp(chapter, ri, def.baseMaxHp, bookM);
    const atk = scaledEnemyAtk(chapter, ri, def.baseAtk, bookM);
    const ej = this.scatterOffset(seed);
    return this.makeUnit(
      'enemy',
      worldX + ej.jx,
      worldY + ej.jy,
      hp,
      atk,
      def.attackSpeed,
      def.range,
      def.moveSpeed,
      def.name,
      { enemyPaint: 'grunt', hitRadiusDesign: def.hitRadius },
    );
  }

  /** 先知：闪电链（段数、衰减、首段倍率见 skills.json skill_farseer_chain_lightning.params） */
  private castFarseerChainLightning(boss: SimUnit): void {
    const def = getSkillById('skill_farseer_chain_lightning');
    const maxHops = Math.floor(skillParamNumber(def, 0, 8));
    const decay = skillParamNumber(def, 1, 0.78);
    const firstMul = skillParamNumber(def, 2, 3);
    const hit = new Set<number>();
    let lastX = boss.x;
    let lastY = boss.y;
    let hop = 0;
    while (hop <= maxHops) {
      const next =
        hop === 0
          ? this.pickLowestHpAllyForChain(hit)
          : this.pickNearestAllyToPoint(lastX, lastY, hit);
      if (!next) break;
      hit.add(next.unitId);
      const mul = firstMul * Math.pow(decay, hop);
      const dmg = Math.max(1, Math.round(boss.atk * mul));
      this.applyDamage(next, dmg, { attacker: boss, bypassBlock: true, damageTag: 'magic' });
      this.ringFx.push(spawnRingPulse(this.fxLayer, next.x, next.y - 18, 52 + hop * 6, 0x7dd3fc, 0.38));
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, next.x, next.y));
      lastX = next.x;
      lastY = next.y;
      hop += 1;
    }
  }

  private castFarseerSummonGrunts(boss: SimUnit): void {
    const sg = getSkillById('skill_farseer_summon_grunts');
    const summonCap = Math.floor(skillParamNumber(sg, 0, 6));
    const enemyCap = Math.floor(skillParamNumber(sg, 1, 34));
    const alive = this.alive('enemy').length;
    const room = Math.max(0, enemyCap - alive);
    const n = Math.min(summonCap, room);
    const baseY = boss.y + Math.round(88 * LAYOUT_SCALE);
    for (let k = 0; k < n; k++) {
      const angle = (k / summonCap) * Math.PI * 2 + boss.unitId * 0.37;
      const rad = Math.round(96 * LAYOUT_SCALE) + (k % 4) * Math.round(24 * LAYOUT_SCALE);
      const wx = boss.x + Math.cos(angle) * rad * 0.5;
      const wy = baseY + Math.sin(angle) * rad * 0.35;
      const grunt = this.spawnScaledGruntEnemy(wx, wy, boss.unitId * 900 + k * 19);
      this.units.push(grunt);
      this.unitLayer.addChild(grunt.root);
      this.initialEnemyHp += grunt.maxHp;
    }
    this.recomputeEnemyHp();
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y - 22, 130, 0x34d399, 0.48));
  }

  private castTaurenShockwave(boss: SimUnit): void {
    const tw = getSkillById('skill_tauren_shockwave');
    const L = skillParamDesignPx(tw, 0, 780);
    const halfW = skillParamDesignPx(tw, 1, 70);
    const coeff = skillParamNumber(tw, 2, (0.95 / 4) * 2 * 1.5);
    const bx = boss.x;
    const by = boss.y;
    const tgt = this.nearestAlly(boss);
    let dx = tgt ? tgt.x - bx : GAME_WIDTH * 0.5 - bx;
    let dy = tgt ? tgt.y - by : (ARENA_Y_MIN + ARENA_Y_MAX) * 0.5 - by;
    const d0 = Math.hypot(dx, dy);
    if (d0 < 1e-3) {
      dx = 1;
      dy = 0;
    } else {
      dx /= d0;
      dy /= d0;
    }
    for (const a of this.alive('ally')) {
      const vx = a.x - bx;
      const vy = a.y - by;
      const along = vx * dx + vy * dy;
      if (along < 0 || along > L) continue;
      const perp = Math.abs(vx * dy - vy * dx);
      if (perp > halfW + this.hitRadius(a) * 0.85) continue;
      const falloff = 1 - along / L;
      const dmg = Math.max(1, Math.round(boss.atk * coeff * falloff));
      /** 冲击波：仅伤害，不施加眩晕（与踩地板区分） */
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic' });
    }
    this.shockBeams.push(spawnTaurenShockwaveBeam(this.fxLayer, bx, by, dx, dy, L, halfW));
    this.hitSparks.push(
      spawnHitSparkBurst(this.fxLayer, bx + dx * (L * 0.38), by + dy * (L * 0.38)),
    );
  }

  private castTaurenStomp(boss: SimUnit): void {
    const st = getSkillById('skill_tauren_stomp');
    const stompCoeff = skillParamNumber(st, 0, 0.105);
    const stunSec = skillParamNumber(st, 1, 2.6);
    const r = skillParamDesignPx(st, 2, 680);
    for (const a of this.alive('ally')) {
      if (Math.hypot(a.x - boss.x, a.y - boss.y) > r + this.hitRadius(boss) + this.hitRadius(a)) continue;
      this.applyDamage(a, Math.max(1, Math.round(boss.atk * stompCoeff)), { attacker: boss });
      a.stunT = Math.max(a.stunT ?? 0, stunSec);
    }
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y - 14, Math.round(r * 0.38), 0xc4b5fd, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y - 12, Math.round(r * 0.48), 0xe9d5ff, 0.48));
  }

  private bossSkillAccKey(boss: SimUnit, skillId: string): string {
    return `${boss.unitId}|${skillId}`;
  }

  private castBossSkillById(boss: SimUnit, skillId: string): void {
    switch (skillId) {
      case 'skill_farseer_chain_lightning':
        this.castFarseerChainLightning(boss);
        break;
      case 'skill_farseer_summon_grunts':
        this.castFarseerSummonGrunts(boss);
        break;
      case 'skill_tauren_shockwave':
        this.castTaurenShockwave(boss);
        break;
      case 'skill_tauren_stomp':
        this.castTaurenStomp(boss);
        break;
      case 'skill_blademaster_bladestorm': {
        const bs = getSkillById('skill_blademaster_bladestorm');
        const aoeCoeff = skillParamNumber(bs, 0, 0.275);
        const maxEnemyWithMirror = Math.floor(skillParamNumber(bs, 1, 14));
        const mirrorHpRatio = skillParamNumber(bs, 2, 0.09);
        const mirrorAtkRatio = skillParamNumber(bs, 3, 0.175);
        for (const a of this.alive('ally')) this.applyDamage(a, boss.atk * aoeCoeff, { attacker: boss });
        if (this.alive('enemy').length < maxEnemyWithMirror) {
          const c = this.makeUnit(
            'enemy',
            boss.x + 70 * LAYOUT_SCALE,
            boss.y + 40 * LAYOUT_SCALE,
            Math.round(boss.maxHp * mirrorHpRatio),
            Math.round(boss.atk * mirrorAtkRatio),
            boss.attackInterval * BLADEMASTER_MIRROR_ATTACK_INTERVAL_MULT,
            boss.range,
            boss.speed * 1.05,
            '镜像',
            { enemyPaint: 'mirror', hitRadiusDesign: WOW_BOOK_BOSS_TABLE_DEFAULT.hitRadius },
          );
          this.units.push(c);
          this.unitLayer.addChild(c.root);
          this.initialEnemyHp += c.maxHp;
          this.recomputeEnemyHp();
        }
        break;
      }
      default:
        break;
    }
  }

  private bossSkills(dt: number): void {
    const boss = this.units.find((u) => u.bossId && !u.dead);
    if (!boss?.bossId) return;
    for (const skillId of boss.skillIds) {
      const def = getSkillById(skillId);
      if (!skillFiresInBattle(def)) continue;
      const period = BOSS_SKILL_COOLDOWN_SEC[skillId];
      if (period == null) continue;
      const k = this.bossSkillAccKey(boss, skillId);
      const acc = (this.bossSkillAcc.get(k) ?? 0) + dt;
      if (acc >= period) {
        this.bossSkillAcc.set(k, acc - period);
        this.castBossSkillById(boss, skillId);
      } else {
        this.bossSkillAcc.set(k, acc);
      }
    }
  }

  private updateFrame(dt: number): void {
    if (this.ended) return;
    const inFinishDelay = this.pendingFinishOutcome != null;
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

    this.tickDeathAnimations(dt);
    tickTinySparks(this.deathTrailSparks, dt);

    this.bossSkills(dt);
    this.tickMeteor(dt);
    tickFloatEntries(this.floatWords, dt);
    tickRingPulses(this.ringFx, dt);
    tickShockwaveBeamFx(this.shockBeams, dt);
    tickHitSparkBursts(this.hitSparks, dt);
    this.tickShamanBloodlustAll(dt);
    this.tickCatapultBurns(dt);
    tickMeteorAnims(this.meteors, dt);
    tickSlashFx(this.slashes, dt);
    tickRayBurstFx(this.healBursts, dt);
    this.tickProjectiles(dt);

    for (const u of this.units) {
      if (u.dead) continue;
      if (u.hp > u.maxHp) u.hp = u.maxHp;

      if (u.side === 'enemy') {
        this.tickEnemyEvilFrenzy(u, dt);
        this.tickEnemyShadowBoltTry(u, dt);
      }

      const kbActive = this.tickKnockbackTween(u, dt);
      this.syncHitFlash(u, dt);

      if ((u.moveSlowT ?? 0) > 0) {
        u.moveSlowT = Math.max(0, (u.moveSlowT ?? 0) - dt);
      }
      this.syncUnitMoveSpeed(u);

      if ((u.stunT ?? 0) > 0) {
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
          for (const a of near) {
            if (a.invulnerable) continue;
            this.applyDamage(a, Math.max(1, Math.round(u.atk * skillParamNumber(dw, 1, 1.2))), { attacker: u });
            this.knockbackAllyFromPoint(a, u.x, u.y, skillParamDesignPx(dw, 3, 300));
            a.stunT = Math.max(a.stunT ?? 0, skillParamNumber(dw, 2, 5));
          }
          this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y - 20, 110, 0xc084fc, 0.55));
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
          continue;
        }
      }

      if (u.aura) {
        const charging = u.allyKind === 'knight' && (u.knightState === 'charge' || u.knightState === 'death_charge');
        u.aura.visible = !!(u.invulnerable && charging);
        if (u.aura.visible) u.aura.rotation += dt * 3.8;
      }

      if ((u.flashT ?? 0) > 0) {
        u.flashT = Math.max(0, (u.flashT ?? 0) - dt);
        u.body.tint = u.flashT > 0 ? 0xffe066 : 0xffffff;
      } else if (u.invulnerable && u.allyKind === 'knight') {
        u.body.tint = 0xffe9a8;
      } else if ((u.raiderLeapBuffT ?? 0) > 0 && this.unitHasSkill(u, 'skill_raider_leap')) {
        u.body.tint = 0xfde047;
      } else if ((u.evilFrenzyBuffT ?? 0) > 0 && this.unitHasSkill(u, 'skill_evil_strenth')) {
        u.body.tint = 0xf97369;
      } else if ((u.bloodlustT ?? 0) > 0 && u.side === 'enemy') {
        u.body.tint = 0xf9a8d4;
      } else if ((u.moveSlowT ?? 0) > 0 && u.side === 'ally') {
        u.body.tint = 0x5eead4;
      } else {
        u.body.tint = 0xffffff;
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

      if (u.side === 'ally' && u.allyKind === 'knight' && u.knightState === 'fight') {
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
          u.root.position.set(u.x, u.y);
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
