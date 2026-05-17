import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';
import { diskOutlineWidth } from './unitCircleTokens';

const CLEAVE_X_SLASH_DUR = (): number => Math.max(0.14, 0.22 * (LAYOUT_SCALE / 1));

/** 在局部原点绘制白色 X 刀光（两段粗弧） */
function drawCleaveXSlashArcs(g: Graphics, size: number, alpha: number): void {
  if (alpha < 0.02 || size < 3) {
    g.clear();
    return;
  }
  const w = Math.max(5, Math.round(6.5 * LAYOUT_SCALE));
  const sweep = Math.PI * 0.4;
  const r = size * 1.12;
  g.clear();
  const c1x = size * 0.42;
  const c1y = -size * 0.42;
  const mid1 = Math.PI * 0.75;
  g.arc(c1x, c1y, r, mid1 - sweep / 2, mid1 + sweep / 2);
  g.stroke({ width: w, color: 0xffffff, alpha, cap: 'round', join: 'round' });
  const c2x = -size * 0.42;
  const c2y = -size * 0.42;
  const mid2 = Math.PI * 0.25;
  g.arc(c2x, c2y, r, mid2 - sweep / 2, mid2 + sweep / 2);
  g.stroke({ width: w, color: 0xf8fafc, alpha: alpha * 0.95, cap: 'round', join: 'round' });
}

/**
 * 顺劈斩：白色 X 刀光自圆心向外放大（容器 rotation=面向，覆盖原扇形半径）。
 */
export class RhahkCleaveXSlashFx extends Container {
  private readonly g = new Graphics();
  private t = 0;
  private readonly dur: number;
  private readonly rMax: number;

  constructor(cx: number, cy: number, aimAngle: number, rOuter: number) {
    super();
    this.position.set(cx, cy);
    this.rotation = aimAngle;
    this.rMax = rOuter;
    this.dur = CLEAVE_X_SLASH_DUR();
    this.addChild(this.g);
  }

  tick(dt: number): boolean {
    this.t += dt;
    const prog = Math.min(1, this.t / this.dur);
    const eased = 1 - (1 - prog) ** 2;
    const size = this.rMax * (0.1 + eased * 0.95);
    const alpha = 0.88 * (1 - prog * 0.85);
    drawCleaveXSlashArcs(this.g, size, alpha);
    return this.t >= this.dur;
  }
}

/** @deprecated 保留类型别名，战斗逻辑已改用 RhahkCleaveXSlashFx */
export class RhahkCleaveSectorFx extends RhahkCleaveXSlashFx {
  constructor(cx: number, cy: number, aimAngle: number, _halfRad: number, rOuter: number) {
    super(cx, cy, aimAngle, rOuter);
  }
}

type RhahkWarcryRay = {
  g: Graphics;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
};

export type RhahkHealGlowFx = {
  g: Graphics;
  t: number;
  dur: number;
  innerR: number;
};

export type RhahkWarcryPresentation = {
  rays: RhahkWarcryRay[];
  healGlow: RhahkHealGlowFx;
};

/** 战吼：Boss 圆缘三条红色粗射线 */
export function spawnRhahkWarcryPresentation(
  fxLayer: Container,
  bossX: number,
  bossY: number,
  bossHitR: number,
  tokenDisk: Container,
  tokenInnerR: number,
): RhahkWarcryPresentation {
  const rays: RhahkWarcryRay[] = [];
  const rayLen = bossHitR * 2.8;
  const thick = Math.max(4, Math.round(5 * LAYOUT_SCALE));
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const g = new Graphics();
    g.eventMode = 'none';
    const x0 = bossX + Math.cos(ang) * bossHitR * 0.92;
    const y0 = bossY + Math.sin(ang) * bossHitR * 0.92;
    const x1 = bossX + Math.cos(ang) * (bossHitR * 0.92 + rayLen);
    const y1 = bossY + Math.sin(ang) * (bossHitR * 0.92 + rayLen);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: thick, color: 0xdc2626, alpha: 0.92, cap: 'round' });
    fxLayer.addChild(g);
    rays.push({ g, x0, y0, x1, y1, t: 0, dur: 0.35 });
  }
  const healGlow: RhahkHealGlowFx = { g: new Graphics(), t: 0, dur: 0.9, innerR: tokenInnerR };
  healGlow.g.eventMode = 'none';
  tokenDisk.addChild(healGlow.g);
  return { rays, healGlow };
}

export function tickRhahkWarcryPresentation(pres: RhahkWarcryPresentation, dt: number): void {
  for (const ray of pres.rays) {
    ray.t += dt;
    ray.g.alpha = Math.max(0, 1 - ray.t / ray.dur);
  }
  pres.healGlow.t += dt;
  const p = Math.min(1, pres.healGlow.t / pres.healGlow.dur);
  const g = pres.healGlow.g;
  const ir = pres.healGlow.innerR;
  g.clear();
  if (p > 0.02) {
    const rise = -ir * p * 0.35;
    g.circle(0, rise - ir, ir * 0.55).fill({ color: 0x4ade80, alpha: 0.22 * (1 - p) });
    g.circle(0, rise - ir * 1.1, ir * 0.35).fill({ color: 0xbbf7d0, alpha: 0.35 * (1 - p) });
  }
}

export function isRhahkWarcryPresentationDone(pres: RhahkWarcryPresentation): boolean {
  return pres.rays.every((r) => r.t >= r.dur) && pres.healGlow.t >= pres.healGlow.dur;
}

export function destroyRhahkWarcryPresentation(pres: RhahkWarcryPresentation): void {
  for (const r of pres.rays) r.g.destroy();
  pres.healGlow.g.destroy();
}

export function redrawRhahkWarcryBossRim(rim: Graphics, tokenInnerR: number, stacks: number): void {
  rim.clear();
  if (stacks <= 0) return;
  const thick = diskOutlineWidth(tokenInnerR) + stacks;
  const alpha = Math.min(1, 0.55 + stacks * 0.04);
  const color = stacks >= 4 ? 0x7f1d1d : 0x991b1b;
  rim.circle(0, -tokenInnerR, tokenInnerR + 2).stroke({ width: thick, color, alpha });
}

/** 猛击主目标：黑色裂痕贴图 */
export function attachRhahkSmashCrackOverlay(body: Container, innerR: number): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  const r = innerR * 0.75;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    const len = r * (0.5 + Math.random() * 0.45);
    g.moveTo(0, -innerR)
      .lineTo(Math.cos(a) * len, -innerR + Math.sin(a) * len * 0.6)
      .stroke({ width: Math.max(2, 2.5 * LAYOUT_SCALE), color: 0x0a0a0a, alpha: 0.85, cap: 'round' });
  }
  body.addChild(g);
  return g;
}
