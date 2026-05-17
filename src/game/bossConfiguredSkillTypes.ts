import type { BossPunchSectorWarnFx } from './bossPunchSectorWarnFx';
import type { BossRushLineWarnFx } from './bossRushLineWarnFx';
import type { BossSmashCircleWarnFx } from './bossSmashCircleWarnFx';
import type { OverloadExplosionChannelBanner } from './battleVisuals';
import type { OverloadExplosionRangeWarnFx } from './gilnidSkillFx';
import type { JetpackAssaultFx } from './greenskinSkillFx';
import type { VanishInvulnRingFx } from './vancleefSkillFx';

export const BOSS_CONFIGURED_SKILL_IDS = [
  'skill_boss_punch',
  'skill_boss_rush',
  'skill_rhahk_smash',
  'skill_rhahk_warcry',
  'skill_blade_storm',
  'skill_blink_fan',
  'skill_overload_explosion',
  'skill_overload_laser',
  'skill_jetpack_assault',
  'skill_vanish_ambush',
  'skill_summon_mob_pool',
  'skill_tauren_stomp',
  'skill_tauren_shockwave',
] as const;
export type BossConfiguredSkillId = (typeof BOSS_CONFIGURED_SKILL_IDS)[number];

export function isBossConfiguredSkill(id: string): id is BossConfiguredSkillId {
  return (
    id === 'skill_boss_punch' ||
    id === 'skill_boss_rush' ||
    id === 'skill_rhahk_smash' ||
    id === 'skill_rhahk_warcry' ||
    id === 'skill_blade_storm' ||
    id === 'skill_blink_fan' ||
    id === 'skill_overload_explosion' ||
    id === 'skill_overload_laser' ||
    id === 'skill_jetpack_assault' ||
    id === 'skill_vanish_ambush' ||
    id === 'skill_summon_mob_pool' ||
    id === 'skill_tauren_stomp' ||
    id === 'skill_tauren_shockwave'
  );
}

export type BossPunchWindupState = {
  kind: 'punch_windup';
  skillId: 'skill_boss_punch';
  t: number;
  dur: number;
  aimAngle: number;
  rOuter: number;
  cx: number;
  cy: number;
  warnFx: BossPunchSectorWarnFx;
  /** 扫光到达终点后是否已结算伤害 */
  impactApplied?: boolean;
};

export type BossRushWindupState = {
  kind: 'rush_windup';
  skillId: 'skill_boss_rush';
  t: number;
  dur: number;
  lineLen: number;
  halfW: number;
  dirx: number;
  diry: number;
  endX: number;
  endY: number;
  startX: number;
  startY: number;
  warnFx: BossRushLineWarnFx;
  chargeStarted?: boolean;
};

export type BossRushChargeState = {
  kind: 'rush_charge';
  skillId: 'skill_boss_rush';
  dirx: number;
  diry: number;
  remainDist: number;
  speed: number;
  dmgCoeff: number;
  bossRadius: number;
  halfW: number;
  prevX: number;
  prevY: number;
  hitIds: Set<number>;
  /** 蓄力预警渐隐中 */
  warnFx?: BossRushLineWarnFx;
};

/** 拉克佐·猛击：主目标圆心圆形蓄力 */
export type BossRhahkSmashWindupState = {
  kind: 'rhahk_smash_windup';
  skillId: 'skill_rhahk_smash';
  t: number;
  dur: number;
  targetId: number;
  cx: number;
  cy: number;
  rMax: number;
  warnFx: BossSmashCircleWarnFx;
  impactApplied?: boolean;
};

/** 剑刃风暴：0.5s 圆缘闪红后进入引导 */
export type BossBladeStormWarnState = {
  kind: 'blade_storm_warn';
  skillId: 'skill_blade_storm';
  t: number;
  dur: number;
};

/** 剑刃风暴：引导旋转 + 周身持续伤害 */
export type BossBladeStormChannelState = {
  kind: 'blade_storm_channel';
  skillId: 'skill_blade_storm';
  t: number;
  dur: number;
  radius: number;
  coeffPerSec: number;
  spin: number;
  bladeGfx: import('pixi.js').Graphics;
  /** 每秒一次范围伤害计时 */
  dmgTickAcc: number;
};

/** 过载爆炸：原地引导 + 护盾霸体 */
export type BossOverloadExplosionChannelState = {
  kind: 'overload_explosion_channel';
  skillId: 'skill_overload_explosion';
  t: number;
  dur: number;
  radius: number;
  coeff: number;
  /** 引导开始时是否曾持有护盾（用于检测破裂） */
  channelHadShield: boolean;
  shieldGfx?: import('pixi.js').Graphics;
  pulsePhase: number;
  rangeWarnFx?: OverloadExplosionRangeWarnFx;
  channelBanner?: OverloadExplosionChannelBanner;
};

/** 喷气背包突击：强制弧线飞行（不可被控制打断） */
export type BossJetpackAssaultState = {
  kind: 'jetpack_assault';
  skillId: 'skill_jetpack_assault';
  t: number;
  dur: number;
  speedMult: number;
  kbDist: number;
  segT: number;
  segDur: number;
  p0x: number;
  p0y: number;
  cpx: number;
  cpy: number;
  p2x: number;
  p2y: number;
  jetpackFx?: JetpackAssaultFx;
  pulsePhase: number;
  hitAllyIds: Set<number>;
};

/** 消失·伏击：1.5s 淡出 + 0.5s 透明维持，伏击瞬间再位移 */
export type BossVanishAmbushState = {
  kind: 'vanish_ambush';
  skillId: 'skill_vanish_ambush';
  t: number;
  vanishDur: number;
  targetId: number;
  coeff: number;
  pushR: number;
  backDist: number;
  invulnFx?: VanishInvulnRingFx;
  ambushFx?: import('./vancleefSkillFx').VanishAmbushStrikeFx;
  ringSpin: number;
};

export type BossSkillCastState =
  | BossPunchWindupState
  | BossRushWindupState
  | BossRushChargeState
  | BossRhahkSmashWindupState
  | BossBladeStormWarnState
  | BossBladeStormChannelState
  | BossOverloadExplosionChannelState
  | BossJetpackAssaultState
  | BossVanishAmbushState;

/** 圆盘中心 (cx,cy)，扇形对称轴 aimAngle（弧度），半角 halfSpreadRad，外缘半径 rOuter（已含 Boss 碰撞半径表意） */
export function allyInPunchSector(
  ax: number,
  ay: number,
  allyR: number,
  cx: number,
  cy: number,
  aimAngle: number,
  halfSpreadRad: number,
  rOuter: number,
): boolean {
  const vx = ax - cx;
  const vy = ay - cy;
  const dist = Math.hypot(vx, vy);
  if (dist > rOuter + allyR + 1e-6) return false;
  const ang = Math.atan2(vy, vx);
  let d = ang - aimAngle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const edge = Math.asin(Math.min(1, allyR / Math.max(dist, 1e-6)));
  return Math.abs(d) <= halfSpreadRad + edge;
}

export function countAlliesInPunchSector(
  allies: ReadonlyArray<{ x: number; y: number; hitRadiusPx: number }>,
  cx: number,
  cy: number,
  aimAngle: number,
  halfSpreadRad: number,
  rOuter: number,
): number {
  let n = 0;
  for (const a of allies) {
    if (allyInPunchSector(a.x, a.y, a.hitRadiusPx, cx, cy, aimAngle, halfSpreadRad, rOuter)) n += 1;
  }
  return n;
}

/** 点 (px,py) 到线段 (ax,ay)-(bx,by) 的最短距离 */
export function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1e-12;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return Math.hypot(px - qx, py - qy);
}

export function countAlliesNearOpenSegment(
  allies: ReadonlyArray<{ x: number; y: number; hitRadiusPx: number }>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfW: number,
): number {
  let n = 0;
  for (const u of allies) {
    const d = distPointToSegment(u.x, u.y, ax, ay, bx, by);
    if (d <= halfW + u.hitRadiusPx) n += 1;
  }
  return n;
}
