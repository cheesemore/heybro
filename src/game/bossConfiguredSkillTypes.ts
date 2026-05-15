import type { BossPunchSectorWarnFx } from './bossPunchSectorWarnFx';
import type { BossRushLineWarnFx } from './bossRushLineWarnFx';

export const BOSS_CONFIGURED_SKILL_IDS = ['skill_boss_punch', 'skill_boss_rush'] as const;
export type BossConfiguredSkillId = (typeof BOSS_CONFIGURED_SKILL_IDS)[number];

export function isBossConfiguredSkill(id: string): id is BossConfiguredSkillId {
  return id === 'skill_boss_punch' || id === 'skill_boss_rush';
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

export type BossSkillCastState = BossPunchWindupState | BossRushWindupState | BossRushChargeState;

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
