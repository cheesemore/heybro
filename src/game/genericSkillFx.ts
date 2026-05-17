import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';

/** 剑刃风暴：12 枚黄色三角刀锋环（局部原点为代币圆心） */
export function drawBladeStormKnifeRing(g: Graphics, innerR: number, outerR: number, spinRad: number): void {
  g.clear();
  const n = 12;
  const midR = (innerR + outerR) * 0.5;
  const bladeLen = Math.max(4, outerR - innerR);
  const halfW = Math.max(3, bladeLen * 0.38);
  for (let i = 0; i < n; i++) {
    const a = spinRad + (i / n) * Math.PI * 2;
    const cx = Math.cos(a) * midR;
    const cy = Math.sin(a) * midR;
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const tipX = cx + Math.cos(a) * halfW;
    const tipY = cy + Math.sin(a) * halfW;
    const bx = cx - Math.cos(a) * bladeLen;
    const by = cy - Math.sin(a) * bladeLen;
    const lx = cx + tx * halfW * 0.55;
    const ly = cy + ty * halfW * 0.55;
    const rx = cx - tx * halfW * 0.55;
    const ry = cy - ty * halfW * 0.55;
    g.moveTo(tipX, tipY).lineTo(lx, ly).lineTo(bx, by).lineTo(rx, ry).closePath();
    g.fill({ color: 0xeab308, alpha: 0.9 });
    g.stroke({ width: Math.max(1, 1.2 * LAYOUT_SCALE), color: 0xfef08a, alpha: 0.88 });
  }
}

export type BladeStormTrailFx = {
  g: Graphics;
  points: { x: number; y: number }[];
  maxPts: number;
};

export function createBladeStormTrail(layer: Container): BladeStormTrailFx {
  const g = new Graphics();
  layer.addChild(g);
  return { g, points: [], maxPts: 14 };
}

export function pushBladeStormTrailPoint(trail: BladeStormTrailFx, x: number, y: number): void {
  const pts = trail.points;
  const last = pts[pts.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < Math.round(3 * LAYOUT_SCALE)) return;
  pts.push({ x, y });
  if (pts.length > trail.maxPts) pts.shift();
}

export function redrawBladeStormTrail(trail: BladeStormTrailFx): void {
  const g = trail.g;
  g.clear();
  const pts = trail.points;
  if (pts.length < 2) return;
  const w = Math.max(10, 18 * LAYOUT_SCALE);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const alpha = 0.15 + (i / pts.length) * 0.35;
    g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: w, color: 0x854d0e, alpha, cap: 'round' });
  }
}

export type BladeStormShatterBit = {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
};

export function spawnBladeStormShatter(
  layer: Container,
  cx: number,
  cy: number,
  count = 18,
): BladeStormShatterBit[] {
  const bits: BladeStormShatterBit[] = [];
  for (let i = 0; i < count; i++) {
    const g = new Graphics();
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const sp = (80 + Math.random() * 160) * LAYOUT_SCALE;
    g.moveTo(0, -5).lineTo(4, 4).lineTo(-4, 4).closePath();
    g.fill({ color: 0x111827, alpha: 0.9 });
    g.position.set(cx, cy);
    layer.addChild(g);
    bits.push({
      g,
      x: cx,
      y: cy,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 12,
      life: 0,
      max: 0.35 + Math.random() * 0.25,
    });
  }
  return bits;
}

export function tickBladeStormShatter(bits: BladeStormShatterBit[], dt: number): void {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i]!;
    b.life += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= 0.92;
    b.vy *= 0.92;
    b.rot += b.vr * dt;
    b.g.position.set(b.x, b.y);
    b.g.rotation = b.rot;
    b.g.alpha = Math.max(0, 1 - b.life / b.max);
    if (b.life >= b.max) {
      b.g.destroy();
      bits.splice(i, 1);
    }
  }
}

export type BlinkAfterimageFx = {
  g: Graphics;
  t: number;
  max: number;
};

export function spawnBlinkAfterimage(layer: Container, x0: number, y0: number, x1: number, y1: number): BlinkAfterimageFx {
  const g = new Graphics();
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({
    width: Math.max(4, 7 * LAYOUT_SCALE),
    color: 0x020617,
    alpha: 0.72,
    cap: 'round',
  });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({
    width: Math.max(1.5, 2 * LAYOUT_SCALE),
    color: 0x334155,
    alpha: 0.5,
    cap: 'round',
  });
  layer.addChild(g);
  return { g, t: 0, max: 0.28 };
}

export function tickBlinkAfterimages(list: BlinkAfterimageFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    s.g.alpha = Math.max(0, 1 - s.t / s.max);
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}

/** 弹性炸弹：红色小球（设计半径约 15px） */
export function buildElasticBombGraphic(): Graphics {
  const r = Math.max(4, Math.round(15 * LAYOUT_SCALE));
  const g = new Graphics();
  g.circle(0, 0, r).fill({ color: 0x450a0a, alpha: 0.98 });
  g.circle(0, 0, r * 0.58).fill({ color: 0xdc2626, alpha: 0.96 });
  g.circle(0, 0, r * 0.32).fill({ color: 0xfca5a5, alpha: 0.88 });
  return g;
}

export type VoidWalkAfterimageFx = {
  g: Graphics;
  t: number;
  max: number;
};

/** 虚空行走：单位位置的紫色残影 */
export function spawnVoidWalkAfterimage(
  layer: Container,
  x: number,
  y: number,
  radiusPx: number,
): VoidWalkAfterimageFx {
  const g = new Graphics();
  const r = Math.max(8, radiusPx * 0.92);
  g.circle(0, 0, r).fill({ color: 0x581c87, alpha: 0.38 });
  g.circle(0, 0, r * 0.78).stroke({
    width: Math.max(2, 2.2 * LAYOUT_SCALE),
    color: 0xc4b5fd,
    alpha: 0.62,
  });
  g.circle(0, 0, r * 0.42).fill({ color: 0x7e22ce, alpha: 0.22 });
  g.position.set(x, y);
  layer.addChild(g);
  return { g, t: 0, max: 0.5 };
}

/** 虚空行走：两点间拖影线段 */
export function spawnVoidWalkTrailSegment(
  layer: Container,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): VoidWalkAfterimageFx {
  const g = new Graphics();
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({
    width: Math.max(5, 8 * LAYOUT_SCALE),
    color: 0x4c1d95,
    alpha: 0.55,
    cap: 'round',
  });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({
    width: Math.max(2, 3 * LAYOUT_SCALE),
    color: 0xddd6fe,
    alpha: 0.42,
    cap: 'round',
  });
  layer.addChild(g);
  return { g, t: 0, max: 0.32 };
}

export function tickVoidWalkAfterimages(list: VoidWalkAfterimageFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    s.g.alpha = Math.max(0, 1 - s.t / s.max);
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}

export type FanKnifeProjectileFx = {
  g: Graphics;
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  targetId: number;
};

export function spawnFanKnifeProjectile(
  layer: Container,
  x0: number,
  y0: number,
  tx: number,
  ty: number,
  targetId: number,
): FanKnifeProjectileFx {
  const g = new Graphics();
  const ang = Math.atan2(ty - y0, tx - x0);
  const len = Math.max(5, 9 * LAYOUT_SCALE);
  g.moveTo(0, 0).lineTo(len, 0).lineTo(len * 0.65, -3).lineTo(len * 0.65, 3).closePath();
  g.fill({ color: 0x0f172a, alpha: 0.95 });
  g.position.set(x0, y0);
  g.rotation = ang;
  layer.addChild(g);
  return { g, x: x0, y: y0, tx, ty, t: 0, dur: 0.14, targetId };
}

export function tickFanKnifeProjectiles(list: FanKnifeProjectileFx[], dt: number): { arrived: FanKnifeProjectileFx[] } {
  const arrived: FanKnifeProjectileFx[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    const x = p.x + (p.tx - p.x) * k;
    const y = p.y + (p.ty - p.y) * k;
    p.g.position.set(x, y);
    if (k >= 1) {
      arrived.push(p);
      p.g.destroy();
      list.splice(i, 1);
    }
  }
  return { arrived };
}

/** 飞刀命中：目标圆盘白色刀痕闪 */
export function flashFanKnifeHit(targetBody: Container, innerR: number): Graphics {
  const g = new Graphics();
  const r = innerR * 0.85;
  const a = Math.random() * Math.PI;
  g.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2)
    .lineTo(Math.cos(a + 0.5) * r, Math.sin(a + 0.5) * r)
    .stroke({ width: Math.max(2, 2.5 * LAYOUT_SCALE), color: 0xffffff, alpha: 0.95, cap: 'round' });
  g.position.set(0, -innerR);
  targetBody.addChild(g);
  return g;
}
