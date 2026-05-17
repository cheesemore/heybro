import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';

/** 外黑内红球（设计半径 × LAYOUT_SCALE） */
export function buildBlackRedOrbGraphic(designRadius: number): Graphics {
  const r = Math.max(4, Math.round(designRadius * LAYOUT_SCALE));
  const g = new Graphics();
  g.circle(0, 0, r).fill({ color: 0x0a0a0a, alpha: 0.98 });
  g.circle(0, 0, r * 0.52).fill({ color: 0xdc2626, alpha: 0.95 });
  g.circle(0, 0, r * 0.28).fill({ color: 0xef4444, alpha: 0.85 });
  return g;
}

/** 绿皮队长普攻：外黑内红小球 */
export function buildGreenskinBasicOrbGraphic(): Graphics {
  return buildBlackRedOrbGraphic(9);
}

/** 砰砰炸弹：外黑内红大球（整体半径 25 设计像素） */
export function buildBangBangBombGraphic(): Graphics {
  return buildBlackRedOrbGraphic(25);
}

/** 喷气背包：蓝白火焰光晕 + 尾焰（挂于单位 body） */
export class JetpackAssaultFx extends Container {
  private readonly auraG = new Graphics();
  private readonly flameG = new Graphics();
  private tailAngle = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.auraG, this.flameG);
  }

  setMoveDir(dx: number, dy: number): void {
    if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
    this.tailAngle = Math.atan2(dy, dx) + Math.PI;
  }

  redraw(innerR: number, pulse01: number): void {
    const r = innerR * (1.15 + pulse01 * 0.1);
    this.auraG.clear();
    this.auraG.circle(0, -innerR, r * 1.08).fill({ color: 0xbae6fd, alpha: 0.14 + pulse01 * 0.08 });
    this.auraG.circle(0, -innerR, r * 0.92).stroke({
      width: Math.max(3, 4 * LAYOUT_SCALE),
      color: 0x7dd3fc,
      alpha: 0.45 + pulse01 * 0.2,
    });
    this.auraG.circle(0, -innerR, r * 0.78).stroke({
      width: Math.max(2, 2.5 * LAYOUT_SCALE),
      color: 0xe0f2fe,
      alpha: 0.35 + pulse01 * 0.15,
    });

    const ta = this.tailAngle;
    const len = innerR * 1.35;
    const bx = Math.cos(ta) * len;
    const by = Math.sin(ta) * len - innerR;
    const lx = Math.cos(ta + Math.PI / 2) * innerR * 0.35;
    const ly = Math.sin(ta + Math.PI / 2) * innerR * 0.35;
    this.flameG.clear();
    this.flameG.moveTo(lx * 0.4, -innerR + ly * 0.4)
      .lineTo(bx + lx, by + ly)
      .lineTo(bx - lx, by - ly)
      .lineTo(-lx * 0.4, -innerR - ly * 0.4)
      .closePath()
      .fill({ color: 0x38bdf8, alpha: 0.55 + pulse01 * 0.2 });
    this.flameG.moveTo(0, -innerR)
      .lineTo(bx * 0.55, by * 0.55)
      .stroke({ width: Math.max(2, 3 * LAYOUT_SCALE), color: 0x7dd3fc, alpha: 0.85, cap: 'round' });
  }
}

export type JetpackSmokePuffFx = {
  g: Graphics;
  t: number;
  max: number;
};

export function spawnJetpackSmokePuff(layer: Container, x: number, y: number): JetpackSmokePuffFx {
  const g = new Graphics();
  g.position.set(x, y);
  g.circle(0, 0, Math.round(10 * LAYOUT_SCALE)).fill({ color: 0x93c5fd, alpha: 0.22 });
  layer.addChild(g);
  return { g, t: 0, max: 0.55 };
}

export function tickJetpackSmokePuffs(list: JetpackSmokePuffFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.t += dt;
    const k = Math.min(1, p.t / p.max);
    p.g.alpha = 0.22 * (1 - k);
    p.g.scale.set(1 + k * 0.6);
    if (p.t >= p.max) {
      p.g.destroy();
      list.splice(i, 1);
    }
  }
}

export function buildGyroMissileGraphic(): Graphics {
  const g = new Graphics();
  const s = Math.max(5, Math.round(8 * LAYOUT_SCALE));
  g.moveTo(0, -s)
    .lineTo(s * 0.65, 0)
    .lineTo(0, s)
    .lineTo(-s * 0.65, 0)
    .closePath()
    .fill({ color: 0xef4444, alpha: 0.95 })
    .stroke({ width: 1.2, color: 0x450a0a, alpha: 0.9 });
  return g;
}

/** 导弹飞行弧线拖尾（直至命中后淡出） */
export type GyroMissileTrailFx = {
  g: Graphics;
  pts: { x: number; y: number }[];
};

const GYRO_TRAIL_MAX_PTS = 140;

export function createGyroMissileTrail(layer: Container): GyroMissileTrailFx {
  const g = new Graphics();
  g.eventMode = 'none';
  layer.addChild(g);
  return { g, pts: [] };
}

function redrawGyroMissileTrail(trail: GyroMissileTrailFx): void {
  const pts = trail.pts;
  trail.g.clear();
  if (pts.length < 2) return;
  const n = pts.length - 1;
  for (let i = 1; i < pts.length; i++) {
    const t = i / n;
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const w = Math.max(1.5, (1.2 + t * 4.5) * LAYOUT_SCALE);
    trail.g
      .moveTo(p0.x, p0.y)
      .lineTo(p1.x, p1.y)
      .stroke({ width: w, color: 0x0f172a, alpha: 0.12 + t * 0.5, cap: 'round', join: 'round' });
    trail.g
      .moveTo(p0.x, p0.y)
      .lineTo(p1.x, p1.y)
      .stroke({ width: w * 0.45, color: 0xb91c1c, alpha: 0.08 + t * 0.38, cap: 'round', join: 'round' });
  }
}

export function pushGyroMissileTrailPoint(trail: GyroMissileTrailFx, x: number, y: number): void {
  const pts = trail.pts;
  const last = pts[pts.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < Math.max(2, 3 * LAYOUT_SCALE)) return;
  pts.push({ x, y });
  if (pts.length > GYRO_TRAIL_MAX_PTS) pts.shift();
  redrawGyroMissileTrail(trail);
}

export function fadeDestroyGyroMissileTrail(trail: GyroMissileTrailFx, dt: number): boolean {
  trail.g.alpha = Math.max(0, trail.g.alpha - dt * 2.2);
  if (trail.g.alpha <= 0.02) {
    trail.g.destroy();
    return true;
  }
  return false;
}
