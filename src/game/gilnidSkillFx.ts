import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';

/** 过载爆炸：蓝白能量罩（局部原点为圆盘中心） */
export function attachOverloadShieldBubble(parent: Container, innerR: number): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  parent.addChild(g);
  redrawOverloadShieldBubble(g, innerR, 0);
  return g;
}

export function redrawOverloadShieldBubble(g: Graphics, innerR: number, pulse01: number): void {
  g.clear();
  const r = innerR * (1.12 + pulse01 * 0.08);
  g.circle(0, -innerR, r).stroke({
    width: Math.max(4, 5.5 * LAYOUT_SCALE),
    color: 0xe0f2fe,
    alpha: 0.55 + pulse01 * 0.2,
  });
  g.circle(0, -innerR, r * 0.92).stroke({
    width: Math.max(2, 2.8 * LAYOUT_SCALE),
    color: 0x38bdf8,
    alpha: 0.35 + pulse01 * 0.15,
  });
  g.circle(0, -innerR, r * 0.78).fill({ color: 0xbae6fd, alpha: 0.12 + pulse01 * 0.1 });
}

export function destroyOverloadShieldBubble(g: Graphics | undefined): void {
  g?.destroy();
}

const OVERLOAD_EXPLOSION_WARN_RING = 0xdc2626;
const OVERLOAD_EXPLOSION_WARN_FILL = 0xdc2626;
/** 引导期范围圈扩至满半径用时（秒） */
const OVERLOAD_EXPLOSION_WARN_GROW_SEC = 0.4;

/** 过载爆炸引导：红色描边 + 半透明填充的范围警示圈 */
export class OverloadExplosionRangeWarnFx extends Container {
  private readonly ringG = new Graphics();
  private readonly fillG = new Graphics();

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.fillG, this.ringG);
  }

  /** 以战场坐标绘制；r 为已缩放后的结算半径 */
  redraw(cx: number, cy: number, r: number): void {
    this.fillG.clear();
    this.ringG.clear();
    if (r < 2) return;
    this.fillG.circle(cx, cy, r).fill({ color: OVERLOAD_EXPLOSION_WARN_FILL, alpha: 0.32 });
    this.ringG.circle(cx, cy, r).stroke({
      width: Math.max(2, Math.round(3 * LAYOUT_SCALE)),
      color: OVERLOAD_EXPLOSION_WARN_RING,
      alpha: 1,
      cap: 'round',
      join: 'round',
    });
  }

  tick(cx: number, cy: number, rMax: number, channelElapsed: number): void {
    const grow = Math.min(1, channelElapsed / OVERLOAD_EXPLOSION_WARN_GROW_SEC);
    this.redraw(cx, cy, rMax * grow);
  }
}

export type OverloadExplosionWaveFx = {
  g: Graphics;
  x: number;
  y: number;
  t: number;
  max: number;
  rMax: number;
};

export function spawnOverloadExplosionWave(
  layer: Container,
  x: number,
  y: number,
  rMax: number,
): OverloadExplosionWaveFx {
  const g = new Graphics();
  g.position.set(x, y);
  layer.addChild(g);
  return { g, x, y, t: 0, max: 0.42, rMax };
}

export function tickOverloadExplosionWaves(list: OverloadExplosionWaveFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i]!;
    w.t += dt;
    const k = Math.min(1, w.t / w.max);
    const r = w.rMax * (0.2 + k * 0.95);
    w.g.clear();
    w.g.circle(0, 0, r).stroke({
      width: Math.max(6, 10 * LAYOUT_SCALE) * (1 - k * 0.35),
      color: 0xffffff,
      alpha: 0.85 * (1 - k),
    });
    w.g.circle(0, 0, r * 0.55).fill({ color: 0xf8fafc, alpha: 0.35 * (1 - k) });
    if (w.t >= w.max) {
      w.g.destroy();
      list.splice(i, 1);
    }
  }
}

export type OverloadShieldBreakFx = {
  g: Graphics;
  t: number;
  max: number;
};

export function spawnOverloadShieldBreak(layer: Container, x: number, y: number, innerR: number): OverloadShieldBreakFx {
  const g = new Graphics();
  g.position.set(x, y);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r0 = innerR * 0.9;
    const r1 = innerR * (1.35 + Math.random() * 0.25);
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
      .lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
      .stroke({ width: Math.max(2, 3 * LAYOUT_SCALE), color: 0x7dd3fc, alpha: 0.9, cap: 'round' });
  }
  layer.addChild(g);
  return { g, t: 0, max: 0.28 };
}

export function tickOverloadShieldBreaks(list: OverloadShieldBreakFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    s.g.alpha = Math.max(0, 1 - s.t / s.max);
    s.g.scale.set(1 + s.t * 0.8);
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}

/** 超载激光：束宽（720 设计像素系，总粗细不随色数变化） */
const OVERLOAD_LASER_TOTAL_WIDTH_DESIGN = 30;
/** 满不透明停留后再淡出 */
const OVERLOAD_LASER_HOLD_SEC = 0.5;
const OVERLOAD_LASER_FADE_SEC = 0.25;

/** 红→紫七色；加强层数决定使用前 N 色 */
const OVERLOAD_LASER_RAINBOW = [
  0xef4444, // 红
  0xf97316, // 橙
  0xeab308, // 黄
  0x22c55e, // 绿
  0x3b82f6, // 蓝
  0x6366f1, // 靛
  0xa855f7, // 紫
] as const;

/** 未击杀叠加次数 → 并行色线数量（0 次仅红，6 次及以上七色） */
export function overloadLaserColorCountFromStacks(strengthenStacks: number): number {
  return Math.min(7, 1 + Math.max(0, Math.floor(strengthenStacks)));
}

export type OverloadLaserBeamFx = {
  g: Graphics;
  t: number;
  holdSec: number;
  fadeSec: number;
};

export function spawnOverloadLaserBeam(
  layer: Container,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colorCount: number,
): OverloadLaserBeamFx {
  const g = new Graphics();
  const n = Math.min(7, Math.max(1, Math.floor(colorCount)));
  const totalW = OVERLOAD_LASER_TOTAL_WIDTH_DESIGN * LAYOUT_SCALE;
  const strandW = totalW / n;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = 0; i < n; i++) {
    const along = (i - (n - 1) / 2) * strandW;
    const ox = nx * along;
    const oy = ny * along;
    g.moveTo(x0 + ox, y0 + oy)
      .lineTo(x1 + ox, y1 + oy)
      .stroke({
        width: strandW,
        color: OVERLOAD_LASER_RAINBOW[i]!,
        alpha: 0.95,
        cap: 'round',
        join: 'round',
      });
  }

  layer.addChild(g);
  return { g, t: 0, holdSec: OVERLOAD_LASER_HOLD_SEC, fadeSec: OVERLOAD_LASER_FADE_SEC };
}

export function tickOverloadLaserBeams(list: OverloadLaserBeamFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]!;
    b.t += dt;
    if (b.t < b.holdSec) {
      b.g.alpha = 1;
    } else {
      const fadeT = b.t - b.holdSec;
      b.g.alpha = Math.max(0, 1 - fadeT / b.fadeSec);
    }
    if (b.t >= b.holdSec + b.fadeSec) {
      b.g.destroy();
      list.splice(i, 1);
    }
  }
}
