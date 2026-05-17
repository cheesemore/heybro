import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';

/** 消失阶段：金色无敌符文环（挂于单位 body） */
export class VanishInvulnRingFx extends Container {
  private readonly g = new Graphics();

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.g);
  }

  redraw(innerR: number, pulse01: number, spinRad: number): void {
    const r = innerR * (1.22 + pulse01 * 0.08);
    const cy = -innerR;
    this.g.clear();
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const a0 = spinRad + (i / segs) * Math.PI * 2;
      const a1 = a0 + Math.PI / segs - 0.12;
      const x0 = Math.cos(a0) * r;
      const y0 = Math.sin(a0) * r + cy;
      const x1 = Math.cos(a1) * r;
      const y1 = Math.sin(a1) * r + cy;
      this.g.moveTo(x0, y0).lineTo(x1, y1).stroke({
        width: Math.max(2.5, 3.5 * LAYOUT_SCALE),
        color: 0xfbbf24,
        alpha: 0.55 + pulse01 * 0.25,
        cap: 'round',
      });
    }
    this.g.circle(0, cy, r * 0.88).stroke({
      width: Math.max(2, 2.5 * LAYOUT_SCALE),
      color: 0xfde68a,
      alpha: 0.35 + pulse01 * 0.2,
    });
    this.g.circle(0, cy, r * 0.62).stroke({
      width: Math.max(1.5, 2 * LAYOUT_SCALE),
      color: 0xfffbeb,
      alpha: 0.28 + pulse01 * 0.15,
    });
  }
}

export type VanishAmbushStrikeFx = {
  root: Container;
  bladeG: Graphics;
  mistG: Graphics;
  t: number;
  max: number;
  isCrit: boolean;
};

function drawPoisonBlade(g: Graphics, innerR: number, isCrit: boolean, k: number): void {
  const bladeColor = isCrit ? 0xef4444 : 0x22c55e;
  const edgeColor = isCrit ? 0x7f1d1d : 0x14532d;
  const h = innerR * (2.4 + k * 0.35);
  const w = innerR * 0.42;
  g.clear();
  g.moveTo(0, h * 0.15)
    .lineTo(w, -h * 0.55)
    .lineTo(0, -h)
    .lineTo(-w, -h * 0.55)
    .closePath()
    .fill({ color: bladeColor, alpha: 0.92 })
    .stroke({ width: Math.max(2, 2.5 * LAYOUT_SCALE), color: edgeColor, alpha: 0.95 });
  g.moveTo(0, h * 0.1)
    .lineTo(0, -h * 0.72)
    .stroke({ width: Math.max(1.5, 2 * LAYOUT_SCALE), color: 0xffffff, alpha: 0.35 + k * 0.2 });
}

export function spawnVanishAmbushStrike(
  layer: Container,
  x: number,
  y: number,
  innerR: number,
  isCrit: boolean,
): VanishAmbushStrikeFx {
  const root = new Container();
  root.position.set(x, y);
  root.eventMode = 'none';
  const mistG = new Graphics();
  const bladeG = new Graphics();
  const mr = Math.round(innerR * 1.35);
  mistG.circle(0, 0, mr).fill({ color: 0x0f172a, alpha: 0.72 });
  mistG.circle(0, 0, mr * 0.55).fill({ color: 0x1e293b, alpha: 0.5 });
  root.addChild(mistG, bladeG);
  layer.addChild(root);
  drawPoisonBlade(bladeG, innerR, isCrit, 0);
  bladeG.y = -innerR * 2.2;
  bladeG.alpha = 0;
  return { root, bladeG, mistG, t: 0, max: 0.55, isCrit };
}

/** @returns true when finished */
export function tickVanishAmbushStrikeFx(fx: VanishAmbushStrikeFx, dt: number, innerR: number): boolean {
  fx.t += dt;
  const k = Math.min(1, fx.t / fx.max);
  const slam = k < 0.38 ? k / 0.38 : 1;
  const fade = k > 0.65 ? (k - 0.65) / 0.35 : 0;
  drawPoisonBlade(fx.bladeG, innerR, fx.isCrit, slam);
  fx.bladeG.y = -innerR * (2.8 - slam * 1.85);
  fx.bladeG.alpha = slam * (1 - fade);
  fx.bladeG.rotation = (1 - slam) * 0.12;
  fx.mistG.alpha = 0.85 * (1 - fade * 0.9);
  fx.mistG.scale.set(1 + k * 0.25);
  return fx.t >= fx.max;
}
