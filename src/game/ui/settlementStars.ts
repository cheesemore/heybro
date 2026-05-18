import { Container, Graphics, Ticker } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';

const STAR_GOLD = 0xfbbf24;
const STAR_EMPTY = 0x334155;
const STAR_SLOT_OUTLINE = 0x475569;

function starPolygonPoints(cx: number, cy: number, outerR: number): number[] {
  const innerR = outerR * 0.38;
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
  }
  return pts;
}

function drawFilledStar(g: Graphics, outerR: number, color: number, alpha = 1): void {
  g.clear();
  g.poly(starPolygonPoints(0, 0, outerR)).fill({ color, alpha });
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

const STAMP_MS = 420;
const STAGGER_MS = 280;
const START_DELAY_MS = 380;

/**
 * 通关结算：三颗空星底 + 按顺序「按上」金色评价星（scale 弹跳）。
 */
export class SettlementStarRow extends Container {
  private readonly filledCount: number;
  private readonly filledLayers: Container[] = [];
  private animMs = 0;
  private readonly tickHandler: () => void;

  constructor(
    filledCount: number,
    opts?: { outerR?: number; gap?: number },
  ) {
    super();
    const outerR = opts?.outerR ?? Math.round(36 * LAYOUT_SCALE);
    const gap = opts?.gap ?? Math.round(28 * LAYOUT_SCALE);
    this.filledCount = Math.max(0, Math.min(3, Math.floor(filledCount)));

    const step = outerR * 2 + gap;
    const totalW = step * 3 - gap;
    let x = -totalW / 2 + outerR;

    for (let i = 0; i < 3; i++) {
      const slot = new Container();
      slot.position.set(x, 0);

      const empty = new Graphics();
      drawFilledStar(empty, outerR, STAR_EMPTY);
      slot.addChild(empty);

      const ring = new Graphics();
      ring.poly(starPolygonPoints(0, 0, outerR * 1.04)).stroke({
        color: STAR_SLOT_OUTLINE,
        width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)),
        alpha: 0.85,
      });
      slot.addChild(ring);

      const filled = new Container();
      filled.visible = false;
      filled.scale.set(0);
      const gold = new Graphics();
      drawFilledStar(gold, outerR, STAR_GOLD);
      filled.addChild(gold);
      const shine = new Graphics();
      shine
        .poly(starPolygonPoints(outerR * 0.12, -outerR * 0.18, outerR * 0.2))
        .fill({ color: 0xfff7cc, alpha: 0.45 });
      filled.addChild(shine);
      slot.addChild(filled);

      this.addChild(slot);
      this.filledLayers.push(filled);
      x += step;
    }

    this.tickHandler = () => {
      this.animMs += Ticker.shared.deltaMS;
      this.tickStamp();
    };
    Ticker.shared.add(this.tickHandler);
  }

  private tickStamp(): void {
    for (let i = 0; i < 3; i++) {
      const filled = this.filledLayers[i]!;
      if (i >= this.filledCount) {
        filled.visible = false;
        filled.scale.set(0);
        continue;
      }
      const local = this.animMs - (START_DELAY_MS + i * STAGGER_MS);
      if (local < 0) {
        filled.visible = false;
        filled.scale.set(0);
        continue;
      }
      filled.visible = true;
      if (local >= STAMP_MS) {
        filled.scale.set(1);
        continue;
      }
      const p = local / STAMP_MS;
      filled.scale.set(easeOutBack(p));
    }
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    Ticker.shared.remove(this.tickHandler);
    super.destroy(options);
  }
}
