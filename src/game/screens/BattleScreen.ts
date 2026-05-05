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
import type { AllyClass, BattleOutcome, BossId, RoundMeta } from '../types';
import type { RunState } from '../runState';
import { ALLY_DEFS, BOSS_DEFS, ENEMY_DEFS, scaledEnemyAtk, scaledEnemyHp } from '../unitDefs';
import { bossDisplayName } from '../roundConfig';
import {
  allBondStacks,
  classBondHpAtkMultiplier,
  hasBondMega,
  hasBondUltimate,
  priestBondTeamMultiplier,
  RANGED_ATTACK_RANGE_THRESHOLD,
} from '../battleBonds';
import type {
  BloodStainFx,
  EnemyPaintKind,
  FloatEntry,
  GroundBurnPatch,
  HitSparkBurst,
  MeteorAnim,
  RayBurstFx,
  RingPulse,
  ShockwaveBeamFx,
  SlashFx,
} from '../battleVisuals';
import type { ProjectileVisualStyle } from '../battleVisuals';
import {
  buildProjectileGraphic,
  createKnightAura,
  HP_BAR_OFFSET_Y,
  paintAllyBody,
  paintEnemyBody,
  spawnDualShotSlash,
  spawnFloatNumber,
  spawnHealBurst,
  spawnMeteorAnim,
  spawnRingPulse,
  spawnBloodStain,
  spawnGroundBurnPatch,
  spawnHitSparkBurst,
  spawnTaurenShockwaveBeam,
  tickBloodStains,
  tickFloatEntries,
  tickHitSparkBursts,
  tickMeteorAnims,
  tickRayBurstFx,
  tickRingPulses,
  tickShockwaveBeamFx,
  tickSlashFx,
} from '../battleVisuals';
import { SynergyOverlay } from './SynergyOverlay';

const MAGE_SPLASH_RADIUS = Math.round(50 * LAYOUT_SCALE);
const METEOR_INTERVAL = 20;
const METEOR_SPLASH_RADIUS = Math.round(300 * LAYOUT_SCALE);

const FARSEER_CHAIN_INTERVAL = 5;
const FARSEER_SUMMON_INTERVAL = 15;
const FARSEER_SUMMON_COUNT = 6;
const FARSEER_CHAIN_MAX_JUMPS = 8;
const FARSEER_CHAIN_DECAY = 0.78;
const TAUREN_SHOCK_INTERVAL = 5.5;
const TAUREN_STOMP_INTERVAL = 7.5;
/** 牛头冲击波：沿直线延伸，伤害随距离线性衰减；不附带眩晕（仅踩地板晕人）。系数 = 原 0.95/4 ×2（首领加强）×1.5（本次再加强） */
const TAUREN_SHOCK_LENGTH = Math.round(780 * LAYOUT_SCALE);
const TAUREN_SHOCK_HALF_WIDTH = Math.round(70 * LAYOUT_SCALE);
const TAUREN_SHOCK_LINE_COEFF = (0.95 / 4) * 2 * 1.5;
const TAUREN_STOMP_COEFF = 0.42 / 4;
const TAUREN_STOMP_RADIUS = Math.round(680 * LAYOUT_SCALE);
const TAUREN_STOMP_STUN_SEC = 2.6;
const BOSS_SUMMON_ENEMY_CAP = 34;
const ABOMINATION_CLEAVE_RADIUS = Math.round(62 * LAYOUT_SCALE);
const DREAD_ASSAULT_RADIUS = Math.round(108 * LAYOUT_SCALE);
const SHAMAN_BLOODLUST_RADIUS = Math.round(228 * LAYOUT_SCALE);
const CATAPULT_BURN_RADIUS = Math.round(88 * LAYOUT_SCALE);
const KNOCKBACK_PAD_X = Math.round(38 * LAYOUT_SCALE);
const ARENA_Y_MIN = Math.round(192 * LAYOUT_SCALE);
const ARENA_Y_MAX = Math.round(1108 * LAYOUT_SCALE);
const KNIGHT_CHARGE_SPEED_MULT = 2.65;
const KNIGHT_CHARGE_HIT_DIST = Math.round(48 * LAYOUT_SCALE);

/** 会周期性跃向「距自身最远的我方单位」附近的敌方外观 id，与 enemies.json 兵种对应 */
const ENEMY_LEAP_BACKLINE_PAINT = new Set<string>(['batrider', 'raider', 'beserker']);

/** 普通单位碰撞半径（圆），略大于立绘避免完全重叠 */
const UNIT_HIT_RADIUS = Math.round(22 * LAYOUT_SCALE);
const UNIT_HIT_RADIUS_BOSS = Math.round(42 * LAYOUT_SCALE);
/** 弹道中心与目标圆心距离 ≤ 目标半径 + 弹体等效半径 + 部分发射者半径 时判定命中 */
const PROJECTILE_HIT_BASE = Math.round(14 * LAYOUT_SCALE);
/** 生成时在格点上的随机偏移幅度 */
const SPAWN_SCATTER = Math.round(36 * LAYOUT_SCALE);
/** 我方近战对敌：在射程公式上略放宽，减轻友军互挤后「差几像素永远摸不到」 */
const MELEE_REACH_EPSILON = Math.round(22 * LAYOUT_SCALE);

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
  range: number;
  speed: number;
  /** 未减速前的移动速度（用于暗矛减速等） */
  speedBase: number;
  cd: number;
  dead: boolean;
  root: Container;
  body: Graphics;
  hpText: Text;
  aura?: Graphics;
  bossId?: BossId;
  allyKind?: AllyClass;
  enemyPaint?: EnemyPaintKind;
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
  /** 来自备战第几格（神器 / 复仇等用） */
  allySourceSlot?: number;
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
  /** 暗矛击退：移动速度 -50%，剩余秒数 */
  moveSlowT?: number;
  /** 牛头人酋长：首次致命伤触发「重生」（先锁 1 血再满血）后已消耗 */
  taurenRebirthConsumed?: boolean;
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
  /** 剑圣周期技：>2.4 触发，初值保证开场即可转好 */
  private bladeSkillT = 2.5;
  /** 开场即视为冷却完毕，首帧可释放 */
  private farseerChainCd = FARSEER_CHAIN_INTERVAL;
  private farseerSummonCd = FARSEER_SUMMON_INTERVAL;
  private taurenShockCd = TAUREN_SHOCK_INTERVAL;
  private taurenStompCd = TAUREN_STOMP_INTERVAL;
  private ended = false;
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
  }> = [];
  private bloodStains: BloodStainFx[] = [];

  constructor(app: Application, run: RunState, meta: RoundMeta, onEnd: (outcome: BattleOutcome) => void) {
    super();
    this.app = app;
    this.run = run;
    this.meta = meta;
    this.onEnd = onEnd;

    this.bondStacks = allBondStacks(run.board);
    this.bondWarrior12 = hasBondUltimate(this.bondStacks.warrior);
    this.bondMage12 = hasBondUltimate(this.bondStacks.mage);
    this.bondPriest12 = hasBondUltimate(this.bondStacks.priest);
    this.bondArcher12 = hasBondUltimate(this.bondStacks.archer);
    this.bondKnight12 = hasBondUltimate(this.bondStacks.knight);
    this.meteorCd = this.bondMage12 ? METEOR_INTERVAL : 999;

    this.timeLimit =
      (meta.kind === 'boss' ? BOSS_BATTLE_SECONDS : NORMAL_BATTLE_SECONDS) + run.battleTimeBonusSec;
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
      text: `开打阶段：${meta.label} · 自动战斗`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0x64748b,
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
    this.units = [...alliesSpawned, ...this.spawnEnemies(meta)];
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
    const bondBtn = new Container();
    bondBtn.eventMode = 'static';
    bondBtn.cursor = 'pointer';
    bondBtn.position.set(GAME_WIDTH - hudPad - bondW, Math.round(44 * LAYOUT_SCALE));
    const bondBg = new Graphics();
    bondBg
      .roundRect(0, 0, bondW, bondH, Math.round(12 * LAYOUT_SCALE))
      .fill(0x1e3a5f)
      .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x38bdf8 });
    bondBtn.addChild(bondBg);
    const bondLab = new Text({
      text: '羁绊 / 策略',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xe0f2fe,
        fontWeight: '600',
      },
    });
    bondLab.anchor.set(0.5);
    bondLab.position.set(bondW / 2, bondH / 2);
    bondBtn.addChild(bondLab);
    bondBtn.on('pointertap', (e) => {
      e.stopPropagation();
      const ov = new SynergyOverlay(this.run, () => {
        this.removeChild(ov);
        ov.destroy({ children: true });
      });
      this.addChild(ov);
    });
    this.addChild(bondBtn);

    this._tick = (ticker) => this.updateFrame(ticker.deltaMS / 1000);
    this.app.ticker.add(this._tick);
  }

  override destroy(): void {
    this.app.ticker.remove(this._tick);
    super.destroy({ children: true });
  }

  private allocUnitId(): number {
    return this.nextUnitId++;
  }

  private bossEnemyPaint(id: BossId): EnemyPaintKind {
    if (id === 'farseer') return 'boss_farseer';
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
    return u.bossId ? UNIT_HIT_RADIUS_BOSS : UNIT_HIT_RADIUS;
  }

  private effectiveAttackInterval(u: SimUnit): number {
    const base = u.attackIntervalBase ?? u.attackInterval;
    let mult = (u.bloodlustT ?? 0) > 0 ? 1.5 : 1;
    if ((u.raiderLeapBuffT ?? 0) > 0 && u.enemyPaint === 'raider') {
      mult *= 2;
    }
    return Math.max(0.12, base / mult);
  }

  private syncUnitMoveSpeed(u: SimUnit): void {
    if (u.dead) return;
    if (u.speedBase == null) u.speedBase = u.speed;
    const slow = (u.moveSlowT ?? 0) > 0 ? 0.5 : 1;
    u.speed = u.speedBase * slow;
  }

  private clampAllyWorldPos(u: SimUnit): void {
    u.x = Math.max(KNOCKBACK_PAD_X, Math.min(GAME_WIDTH - KNOCKBACK_PAD_X, u.x));
    u.y = Math.max(ARENA_Y_MIN, Math.min(ARENA_Y_MAX, u.y));
    u.root.position.set(u.x, u.y);
  }

  private clampEnemyWorldPos(u: SimUnit): void {
    const padX = Math.round(38 * LAYOUT_SCALE);
    u.x = Math.max(padX, Math.min(GAME_WIDTH - padX, u.x));
    u.y = Math.max(Math.round(195 * LAYOUT_SCALE), Math.min(Math.round(1100 * LAYOUT_SCALE), u.y));
    u.root.position.set(u.x, u.y);
  }

  /** 受击者沿远离攻击者方向被推开（首领受击者不触发；由调用方判断） */
  private knockbackTargetFromAttacker(target: SimUnit, attacker: SimUnit, dist: number): void {
    if (target.dead || (target.invulnerable && target.side === 'ally')) return;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.hypot(dx, dy) || 1;
    target.x += (dx / d) * dist;
    target.y += (dy / d) * dist;
    if (target.side === 'ally') this.clampAllyWorldPos(target);
    else this.clampEnemyWorldPos(target);
    if (Math.random() < 0.55) {
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    }
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, target.y - HP_BAR_OFFSET_Y - 36, '击退', 'magic'),
    );
  }

  /** 将友方沿远离 (ox,oy) 方向推开 dist 像素（已夹场边） */
  private knockbackAllyFromPoint(a: SimUnit, ox: number, oy: number, dist: number): void {
    if (a.side !== 'ally' || a.dead || a.invulnerable) return;
    const dx = a.x - ox;
    const dy = a.y - oy;
    const d = Math.hypot(dx, dy) || 1;
    a.x += (dx / d) * dist;
    a.y += (dy / d) * dist;
    this.clampAllyWorldPos(a);
  }

  private maybeDarkspearKnockback(attacker: SimUnit, target: SimUnit): void {
    if (attacker.side !== 'enemy' || attacker.enemyPaint !== 'darkspear' || target.side !== 'ally' || target.dead) return;
    if (Math.random() >= 0.1) return;
    this.knockbackAllyFromPoint(target, attacker.x, attacker.y, Math.round(100 * LAYOUT_SCALE));
    target.stunT = Math.max(target.stunT ?? 0, 1);
    target.moveSlowT = 5;
    this.syncUnitMoveSpeed(target);
    this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, target.x, target.y));
    this.slashes.push(spawnDualShotSlash(this.fxLayer, target.x, target.y));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 18, 52, 0x2dd4bf, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 20, 76, 0x0d9488, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, target.x, target.y - 14, 34, 0xf0fdfa, 0.32));
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, target.y - HP_BAR_OFFSET_Y - 48, '击退', 'magic'),
    );
  }

  /** 牛头人酋长专属：「重生」满血特效 */
  private procTaurenRebirthVfx(u: SimUnit): void {
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, u.x, u.y - HP_BAR_OFFSET_Y - 78, '重生', 'heal'),
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
    if (attacker.enemyPaint !== 'abomination' || attacker.dead || primary.dead) return;
    const extras = this.alive('ally')
      .filter((a) => a.unitId !== primary.unitId)
      .map((a) => ({ a, d: Math.hypot(a.x - primary.x, a.y - primary.y) }))
      .filter((o) => o.d <= ABOMINATION_CLEAVE_RADIUS)
      .sort((A, B) => A.d - B.d)
      .slice(0, 2)
      .map((o) => o.a);
    const cleave = Math.max(1, Math.round(attacker.atk * 0.55));
    for (const a of extras) {
      this.applyDamage(a, cleave, { attacker, damageTag: 'magic' });
      this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
    }
    if (extras.length) {
      this.ringFx.push(spawnRingPulse(this.fxLayer, primary.x, primary.y - 18, 56, 0x4ade80, 0.35));
    }
  }

  private applyBloodlustBuff(_caster: SimUnit, recipient: SimUnit): void {
    recipient.bloodlustT = 12;
    const base = recipient.attackIntervalBase ?? recipient.attackInterval;
    recipient.attackIntervalBase = base;
    recipient.attackInterval = base / 1.5;
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, recipient.x, recipient.y - HP_BAR_OFFSET_Y - 40, '嗜血术', 'buff'),
    );
    for (let k = 0; k < 3; k++) {
      this.ringFx.push(
        spawnRingPulse(this.fxLayer, recipient.x, recipient.y - 16 + k * 3, 52 + k * 12, 0xdc2626, 0.36 + k * 0.05),
      );
    }
  }

  private tickShamanBloodlustAll(dt: number): void {
    for (const u of this.units) {
      if (u.dead || u.enemyPaint !== 'shaman') continue;
      u.shamanBloodlustCd = (u.shamanBloodlustCd ?? 0) + dt;
      if ((u.shamanBloodlustCd ?? 0) < 6) continue;
      u.shamanBloodlustCd = 0;
      const pool = this.alive('enemy').filter((e) => {
        if ((e.bloodlustT ?? 0) > 0) return false;
        return Math.hypot(e.x - u.x, e.y - u.y) <= SHAMAN_BLOODLUST_RADIUS;
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
      if (b.acc >= 0.32) {
        b.acc = 0;
        for (const a of this.alive('ally')) {
          if (Math.hypot(a.x - b.patch.x, a.y - b.patch.y) <= b.r) {
            this.applyDamage(a, b.dmg, {});
            if (Math.random() < 0.45) this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, a.x, a.y));
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
    const r = CATAPULT_BURN_RADIUS;
    const patch = spawnGroundBurnPatch(this.fxLayer, x, y, r);
    const dmg = Math.max(1, Math.round(atk * 0.2));
    this.catapultBurns.push({ patch, dmg, acc: 0, r });
  }

  /** 配置射程 + 自身与目标碰撞半径，避免圆心距略大于 range 时永远打不到 */
  private effectiveSkillRangeTo(caster: SimUnit, target: SimUnit): number {
    let r = caster.range + this.hitRadius(caster) + this.hitRadius(target);
    if (
      caster.side === 'ally' &&
      target.side === 'enemy' &&
      !this.isRangedAttacker(caster)
    ) {
      r += MELEE_REACH_EPSILON;
    }
    return r;
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
            }),
          );
        } else {
          out.push(
            this.makeUnit('ally', x, y, eachHp, eachAtk, def.attackSpeed, range, def.moveSpeed, def.name, {
              allyKind: cell.kind,
              allySourceSlot: slot,
              bonusCrit: ab.crit,
            }),
          );
        }
      }
    }
    return out;
  }

  /** 二十一极巨化羁绊：每种职业层数≥21 时，该职业随机 3 个入场单位极巨化（体型、攻击、生命翻倍） */
  private applyBond25Mega(allies: SimUnit[]): void {
    for (const kind of ALLY_CLASSES) {
      if (!hasBondMega(this.bondStacks[kind])) continue;
      const pool = allies.filter((u) => u.allyKind === kind);
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
          if (u.allySourceSlot !== n) continue;
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

  private spawnEnemies(meta: RoundMeta): SimUnit[] {
    const out: SimUnit[] = [];
    let slot = 0;
    const { chapter } = meta;
    const ri = this.run.currentRoundIndex;
    const bookM = this.run.bookChapterStrengthMult();
    for (const wave of meta.enemies) {
      if (wave.type === 'boss' && wave.bossId) {
        const b = BOSS_DEFS[wave.bossId];
        const hp = scaledEnemyHp(chapter, ri, b.baseMaxHp * 10, bookM);
        const atk = scaledEnemyAtk(chapter, ri, b.baseAtk, bookM);
        const bj = this.scatterOffset(ri * 3 + 101);
        const u = this.makeUnit(
          'enemy',
          GAME_WIDTH / 2 + bj.jx * 0.25,
          Math.round(340 * LAYOUT_SCALE) + bj.jy * 0.25,
          hp,
          atk,
          b.attackSpeed * 0.5,
          b.range,
          b.moveSpeed,
          `${bossDisplayName(wave.bossId)}`,
          { bossId: wave.bossId },
        );
        out.push(u);
        continue;
      }
      const type = wave.type as keyof typeof ENEMY_DEFS;
      const def = ENEMY_DEFS[type];
      for (let k = 0; k < wave.count; k++) {
        const hp = scaledEnemyHp(chapter, ri, def.baseMaxHp, bookM);
        const atk = scaledEnemyAtk(chapter, ri, def.baseAtk, bookM);
        const cols = 8;
        const col = slot % cols;
        const row = Math.floor(slot / cols);
        const colStep = Math.round(96 * LAYOUT_SCALE);
        const rowStep = Math.round(84 * LAYOUT_SCALE);
        const baseX = Math.round(48 * LAYOUT_SCALE) + col * colStep;
        const baseY = Math.round(238 * LAYOUT_SCALE) + row * rowStep;
        const ej = this.scatterOffset(slot * 17 + k * 23 + type.length * 5);
        out.push(
          this.makeUnit('enemy', baseX + ej.jx, baseY + ej.jy, hp, atk, def.attackSpeed, def.range, def.moveSpeed, def.name, {
            enemyPaint: type as EnemyPaintKind,
          }),
        );
        slot++;
      }
    }
    return out;
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
    } = {},
  ): SimUnit {
    const root = new Container();
    root.position.set(x, y);

    let aura: Graphics | undefined;
    if (side === 'ally' && opts.allyKind === 'knight') {
      aura = createKnightAura();
      aura.scale.set(LAYOUT_SCALE);
      aura.visible = !!opts.invulnerable;
      root.addChild(aura);
    }

    const body = new Graphics();
    if (side === 'ally' && opts.allyKind) {
      paintAllyBody(body, opts.allyKind);
    } else if (side === 'enemy') {
      const ep = opts.bossId ? this.bossEnemyPaint(opts.bossId) : opts.enemyPaint ?? 'grunt';
      paintEnemyBody(body, ep);
    } else {
      body.circle(0, -22, 20).fill(0x94a3b8).stroke({ width: 2, color: 0x0f172a, alpha: 0.5 });
    }
    body.scale.set(LAYOUT_SCALE);
    root.addChild(body);

    const hpText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(19 * LAYOUT_SCALE),
        fill: side === 'ally' ? 0x4ade80 : 0xf87171,
        fontWeight: '700',
        stroke: { color: 0x020617, width: Math.round(4 * LAYOUT_SCALE) },
      },
    });
    hpText.anchor.set(0.5, 1);
    hpText.position.set(0, -HP_BAR_OFFSET_Y);
    root.addChild(hpText);

    const enemyPaint: EnemyPaintKind | undefined =
      side === 'enemy' ? (opts.bossId ? this.bossEnemyPaint(opts.bossId) : opts.enemyPaint ?? 'grunt') : undefined;

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
      root,
      body,
      hpText,
      aura,
      bossId: opts.bossId,
      allyKind: opts.allyKind,
      enemyPaint,
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
        side === 'enemy' && enemyPaint && ENEMY_LEAP_BACKLINE_PAINT.has(enemyPaint)
          ? 1.2 + Math.random() * 1.8
          : undefined,
      shamanBloodlustCd:
        side === 'enemy' && enemyPaint === 'shaman' ? Math.random() * 2.2 : undefined,
      dreadAssaultUsed: side === 'enemy' && enemyPaint === 'dread_warrior' ? false : undefined,
    };
    return u;
  }

  /**
   * 狼骑兵 / 狂战士 / 蝙蝠骑士：冷却结束跃迁至「距该刺客当前位置最远」的存活我方单位附近（视为后排）。
   */
  private tickEnemyBacklineLeap(u: SimUnit, dt: number): boolean {
    const paint = u.enemyPaint;
    if (!paint || !ENEMY_LEAP_BACKLINE_PAINT.has(paint)) return false;

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
    const nyOff = paint === 'batrider' ? 58 : paint === 'raider' ? 44 : 36;
    const ny = Math.max(arenaT, Math.min(arenaB, anchor.y + nyOff * LAYOUT_SCALE));

    const ox = u.x;
    const oy = u.y;
    u.x = nx;
    u.y = ny;
    u.root.position.set(u.x, u.y);

    this.ringFx.push(spawnRingPulse(this.fxLayer, ox, oy - 18, 46, 0xf97316, 0.42));
    this.ringFx.push(spawnRingPulse(this.fxLayer, nx, ny - 18, 58, 0xfbbf24, 0.52));

    if (paint === 'raider') {
      u.raiderLeapBuffT = 5;
      this.ringFx.push(spawnRingPulse(this.fxLayer, nx, ny - 22, 72, 0xfde047, 0.48));
    }

    const baseCd = paint === 'batrider' ? 7.2 : paint === 'raider' ? 9 : 10.5;
    u.enemyLeapCd = baseCd + Math.random() * 2.2;
    return true;
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
    if (u.bossId === 'farseer') return 'enemy_boss_magic';
    if (u.range >= RANGED_ATTACK_RANGE_THRESHOLD) {
      if (u.enemyPaint === 'shaman' || u.enemyPaint === 'catapult') return 'enemy_boss_magic';
      if (
        u.enemyPaint === 'headhunter' ||
        u.enemyPaint === 'darkspear' ||
        u.enemyPaint === 'batrider'
      ) {
        return 'enemy_headhunter';
      }
    }
    return 'enemy_generic';
  }

  private queueProjectile(attacker: SimUnit, targetId: number, onHit: () => void): void {
    const gfx = buildProjectileGraphic(this.projectileStyleFor(attacker));
    gfx.position.set(attacker.x, attacker.y - 18);
    this.fxLayer.addChild(gfx);
    this.projectiles.push({
      gfx,
      x: attacker.x,
      y: attacker.y - 18,
      speed: Math.round(800 * LAYOUT_SCALE),
      targetId,
      attackerId: attacker.unitId,
      life: 0,
      onHit,
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
      const rSrc = src && !src.dead ? this.hitRadius(src) * 0.35 : 0;
      const hitDist = this.hitRadius(tgt) + PROJECTILE_HIT_BASE + rSrc;
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
      const pulse = 1 + 0.14 * Math.sin(p.life * 28);
      p.gfx.scale.set(LAYOUT_SCALE * pulse);
    }
  }

  private beginDefaultAttack(u: SimUnit, target: SimUnit, dist: number, dx: number, dy: number): void {
    let dmg = u.atk;
    let enemyTag: DamageCtx['damageTag'] | undefined;
    if (u.side === 'enemy' && u.bossId === 'blademaster' && Math.random() < 0.35) {
      dmg *= 1.5;
      enemyTag = 'crit';
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
          if (a.enemyPaint === 'catapult') {
            this.spawnCatapultBurnField(t.x, t.y, a.atk);
          }
        }
      });
    } else {
      if (u.side === 'ally') {
        this.dealAllyHit(u, target, dmgF);
        this.maybeDoubleShotArcher(u, target, u.atk);
      } else {
        this.applyDamage(target, dmgF, { attacker: u, damageTag: enemyTag, meleeBasic: true });
        if (u.enemyPaint === 'abomination') {
          this.abominationCleaveFollowup(u, target);
        }
      }
      u.atkLungeT = 0.15;
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
        if (d <= this.effectiveSkillRangeTo(u, a) && score(a) < bestS) {
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
    this.floatWords.push(
      spawnFloatNumber(this.floatLayer, target.x, target.y - HP_BAR_OFFSET_Y, `+${gained}`, 'heal'),
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
      if (target.enemyPaint === 'ultralisk' && ctx.attacker.allyKind === 'mage') {
        amt *= 2;
      }
      if ((target.raiderLeapBuffT ?? 0) > 0 && target.enemyPaint === 'raider') {
        amt *= 0.5;
      }
      if (target.bossId && this.run.bossDamageBonusVsFinalBoss > 0 && this.meta.kind === 'boss') {
        amt *= 1 + this.run.bossDamageBonusVsFinalBoss;
      }
    }
    if (target.side === 'ally' && ctx?.attacker?.side === 'enemy') {
      amt *= this.run.damageTakenMultAllies;
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
        target.root.visible = false;
        this.bloodStains.push(spawnBloodStain(this.fxLayer, target.x, target.y, target.side));
      }
    }
    this.recomputeEnemyHp();

    const lost = Math.max(0, Math.round(prevHp - target.hp));
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
        spawnFloatNumber(this.floatLayer, target.x, target.y - HP_BAR_OFFSET_Y, `-${lost}`, kind),
      );
      if (Math.random() < 0.45) {
        this.hitSparks.push(spawnHitSparkBurst(this.floatLayer, target.x, target.y));
      }
    }
    if (blockedLabel && showFloat && target.allyKind === 'warrior') {
      this.floatWords.push(
        spawnFloatNumber(this.floatLayer, target.x, target.y - HP_BAR_OFFSET_Y - 28, '格挡', 'block'),
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
      if (dist > healReach) {
        const nx = dx / dist;
        const ny = dy / dist;
        const stepLen = u.speed * dt;
        const travel = Math.min(stepLen, Math.max(0, dist - healReach));
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
    if (dist <= atkReach) {
      u.cd -= dt;
      if (u.cd <= 0) {
        const dmg = u.atk;
        const uid = u.unitId;
        const tid = targetEnemy.unitId;
        u.cd = Math.max(0.25, this.effectiveAttackInterval(u));
        if (this.isRangedAttacker(u)) {
          this.queueProjectile(u, tid, () => {
            const a = this.units.find((x) => x.unitId === uid && !x.dead);
            const t = this.byId(tid);
            if (!a || !t) return;
            this.applyDamage(t, dmg, { attacker: a });
          });
        } else {
          this.applyDamage(targetEnemy, dmg, { attacker: u, meleeBasic: !this.isRangedAttacker(u) });
          u.atkLungeT = 0.15;
          u.atkLungeDx = dx / dist;
          u.atkLungeDy = dy / dist;
        }
      }
    } else {
      const nx = dx / dist;
      const ny = dy / dist;
      const stepLen = u.speed * dt;
      const travel = Math.min(stepLen, Math.max(0, dist - atkReach));
      u.x += nx * travel;
      u.y += ny * travel;
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
      { enemyPaint: 'grunt' },
    );
  }

  /** 先知：无射程限制，首段 300% 攻击，至多再弹 8 个目标，伤害逐级衰减 */
  private castFarseerChainLightning(boss: SimUnit): void {
    const hit = new Set<number>();
    let lastX = boss.x;
    let lastY = boss.y;
    let hop = 0;
    while (hop <= FARSEER_CHAIN_MAX_JUMPS) {
      const next =
        hop === 0
          ? this.pickLowestHpAllyForChain(hit)
          : this.pickNearestAllyToPoint(lastX, lastY, hit);
      if (!next) break;
      hit.add(next.unitId);
      const mul = 3 * Math.pow(FARSEER_CHAIN_DECAY, hop);
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
    const alive = this.alive('enemy').length;
    const room = Math.max(0, BOSS_SUMMON_ENEMY_CAP - alive);
    const n = Math.min(FARSEER_SUMMON_COUNT, room);
    const baseY = boss.y + Math.round(88 * LAYOUT_SCALE);
    for (let k = 0; k < n; k++) {
      const angle = (k / FARSEER_SUMMON_COUNT) * Math.PI * 2 + boss.unitId * 0.37;
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
    const L = TAUREN_SHOCK_LENGTH;
    const halfW = TAUREN_SHOCK_HALF_WIDTH;
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
      const dmg = Math.max(1, Math.round(boss.atk * TAUREN_SHOCK_LINE_COEFF * falloff));
      /** 冲击波：仅伤害，不施加眩晕（与踩地板区分） */
      this.applyDamage(a, dmg, { attacker: boss, damageTag: 'magic' });
    }
    this.shockBeams.push(spawnTaurenShockwaveBeam(this.fxLayer, bx, by, dx, dy, L, halfW));
    this.hitSparks.push(
      spawnHitSparkBurst(this.fxLayer, bx + dx * (L * 0.38), by + dy * (L * 0.38)),
    );
  }

  private castTaurenStomp(boss: SimUnit): void {
    const r = TAUREN_STOMP_RADIUS;
    for (const a of this.alive('ally')) {
      if (Math.hypot(a.x - boss.x, a.y - boss.y) > r) continue;
      this.applyDamage(a, Math.max(1, Math.round(boss.atk * TAUREN_STOMP_COEFF)), { attacker: boss });
      a.stunT = Math.max(a.stunT ?? 0, TAUREN_STOMP_STUN_SEC);
    }
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y - 14, Math.round(r * 0.38), 0xc4b5fd, 0.5));
    this.ringFx.push(spawnRingPulse(this.fxLayer, boss.x, boss.y - 12, Math.round(r * 0.48), 0xe9d5ff, 0.48));
  }

  private bossSkills(dt: number): void {
    const boss = this.units.find((u) => u.bossId && !u.dead);
    if (!boss) return;
    const id = boss.bossId!;
    if (id === 'farseer') {
      this.farseerChainCd += dt;
      this.farseerSummonCd += dt;
      if (this.farseerChainCd >= FARSEER_CHAIN_INTERVAL) {
        this.farseerChainCd = 0;
        this.castFarseerChainLightning(boss);
      }
      if (this.farseerSummonCd >= FARSEER_SUMMON_INTERVAL) {
        this.farseerSummonCd = 0;
        this.castFarseerSummonGrunts(boss);
      }
    } else if (id === 'tauren') {
      this.taurenShockCd += dt;
      this.taurenStompCd += dt;
      if (this.taurenShockCd >= TAUREN_SHOCK_INTERVAL) {
        this.taurenShockCd = 0;
        this.castTaurenShockwave(boss);
      }
      if (this.taurenStompCd >= TAUREN_STOMP_INTERVAL) {
        this.taurenStompCd = 0;
        this.castTaurenStomp(boss);
      }
    } else if (id === 'blademaster') {
      this.bladeSkillT += dt;
      if (this.bladeSkillT > 2.4) {
        this.bladeSkillT = 0;
        for (const a of this.alive('ally')) this.applyDamage(a, boss.atk * 0.275, { attacker: boss });
        if (this.alive('enemy').length < 14) {
          const c = this.makeUnit(
            'enemy',
            boss.x + 70 * LAYOUT_SCALE,
            boss.y + 40 * LAYOUT_SCALE,
            Math.round(boss.maxHp * 0.09),
            Math.round(boss.atk * 0.175),
            boss.attackInterval * 1.1,
            boss.range,
            boss.speed * 1.05,
            '镜像',
            { enemyPaint: 'mirror' },
          );
          this.units.push(c);
          this.unitLayer.addChild(c.root);
          this.initialEnemyHp += c.maxHp;
          this.recomputeEnemyHp();
        }
      }
    }
  }

  private updateFrame(dt: number): void {
    if (this.ended) return;
    this.elapsed += dt;
    this.timeLeft -= dt;
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

    this.bossSkills(dt);
    this.tickMeteor(dt);
    tickFloatEntries(this.floatWords, dt);
    tickRingPulses(this.ringFx, dt);
    tickShockwaveBeamFx(this.shockBeams, dt);
    tickBloodStains(this.bloodStains, dt);
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
          u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
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

      if (u.side === 'enemy' && u.enemyPaint === 'dread_warrior' && !u.dreadAssaultUsed) {
        const near = this.alive('ally').filter((a) => Math.hypot(a.x - u.x, a.y - u.y) <= DREAD_ASSAULT_RADIUS);
        if (near.length) {
          u.dreadAssaultUsed = true;
          for (const a of near) {
            if (a.invulnerable) continue;
            this.applyDamage(a, Math.max(1, Math.round(u.atk * 1.2)), { attacker: u });
            this.knockbackAllyFromPoint(a, u.x, u.y, Math.round(300 * LAYOUT_SCALE));
            a.stunT = Math.max(a.stunT ?? 0, 5);
          }
          this.ringFx.push(spawnRingPulse(this.fxLayer, u.x, u.y - 20, 110, 0xc084fc, 0.55));
          this.hitSparks.push(spawnHitSparkBurst(this.fxLayer, u.x, u.y));
          u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
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
      } else if ((u.raiderLeapBuffT ?? 0) > 0 && u.enemyPaint === 'raider') {
        u.body.tint = 0xfde047;
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
        const p = 1 - (u.atkLungeT ?? 0) / 0.15;
        const amp = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 13;
        const ldx = u.atkLungeDx ?? 1;
        const ldy = u.atkLungeDy ?? 0;
        u.body.position.set(ldx * amp, ldy * amp);
      } else {
        u.body.position.set(0, 0);
      }

      if (u.allyKind === 'knight' && (u.knightState === 'charge' || u.knightState === 'death_charge')) {
        this.tickKnightCharge(u, dt);
        u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
        continue;
      }

      if (u.side === 'ally' && u.allyKind === 'priest') {
        const te = this.nearestEnemy(u);
        this.tickPriest(u, dt, te);
        u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
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
          u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
          continue;
        }
      }

      if (u.side === 'enemy' && this.tickEnemyBacklineLeap(u, dt)) {
        u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
        continue;
      }

      const target = u.side === 'ally' ? this.nearestEnemy(u) : this.nearestAlly(u);
      if (!target) {
        u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
        continue;
      }
      const dx = target.x - u.x;
      const dy = target.y - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = this.effectiveSkillRangeTo(u, target);
      if (dist <= reach) {
        u.cd -= dt;
        if (u.cd <= 0) {
          this.beginDefaultAttack(u, target, dist, dx, dy);
        }
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        const stepLen = u.speed * dt;
        const travel = Math.min(stepLen, Math.max(0, dist - reach));
        u.x += nx * travel;
        u.y += ny * travel;
        u.root.position.set(u.x, u.y);
      }
      u.hpText.text = `${Math.ceil(u.hp)}/${u.maxHp}`;
    }

    this.applyUnitCollisionSeparation(2);

    const alliesDead = this.alive('ally').length === 0;
    const enemiesDead = this.alive('enemy').length === 0;
    const timeout = this.timeLeft <= 0;

    if (enemiesDead) {
      this.finish({ perfect: true, enemyHpRatioRemaining: 0, elapsed: this.elapsed });
      return;
    }
    if (alliesDead || timeout) {
      const rem = this.initialEnemyHp > 0 ? this.currentEnemyHp / this.initialEnemyHp : 0;
      this.finish({ perfect: false, enemyHpRatioRemaining: rem, elapsed: this.elapsed });
    }
  }

  private finish(outcome: BattleOutcome): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd(outcome);
  }
}
