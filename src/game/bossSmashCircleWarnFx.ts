import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';

export type BossSmashCircleWarnOpts = {
  cx: number;
  cy: number;
  /** 结算半径（已乘 LAYOUT_SCALE） */
  rMax: number;
  windupSec: number;
};

export type BossSmashCircleWarnTick = {
  impactNow: boolean;
  done: boolean;
};

const WINDUP_FILL_COLOR = 0xdc2626;
const IMPACT_FILL_COLOR = 0xff3333;

/**
 * 猛击预警：红色实体圆由小到大扩至 rMax；
 * 结算瞬间亮红填充后淡出。
 */
export class BossSmashCircleWarnFx extends Container {
  private readonly ringG = new Graphics();
  private readonly fillG = new Graphics();

  private readonly rMax: number;
  private readonly windupSec: number;
  private readonly fadeOutSec: number;

  private cx: number;
  private cy: number;
  private elapsed = 0;
  private fadeOutT = 0;
  private phase: 'windup' | 'impact' = 'windup';
  private impactEmitted = false;

  constructor(opts: BossSmashCircleWarnOpts) {
    super();
    this.cx = opts.cx;
    this.cy = opts.cy;
    this.rMax = Math.max(Math.round(8 * LAYOUT_SCALE), opts.rMax);
    this.windupSec = Math.max(0.25, opts.windupSec);
    this.fadeOutSec = Math.max(0.12, 0.14 * (LAYOUT_SCALE / 1));
    this.addChild(this.fillG, this.ringG);
    this.redrawWindup(0);
  }

  setCenter(cx: number, cy: number): void {
    this.cx = cx;
    this.cy = cy;
  }

  tick(dt: number): BossSmashCircleWarnTick {
    let impactNow = false;
    if (this.phase === 'windup') {
      this.elapsed += dt;
      if (!this.impactEmitted && this.elapsed >= this.windupSec) {
        this.impactEmitted = true;
        impactNow = true;
        this.phase = 'impact';
        this.fadeOutT = 0;
        this.ringG.clear();
      } else {
        this.redrawWindup(this.elapsed);
      }
    } else {
      this.fadeOutT += dt;
      this.redrawImpact();
    }
    const done = this.phase === 'impact' && this.fadeOutT >= this.fadeOutSec;
    return { impactNow, done };
  }

  private redrawWindup(elapsed: number): void {
    const prog = Math.min(1, elapsed / this.windupSec);
    const r = this.rMax * prog;
    this.fillG.clear();
    this.ringG.clear();
    if (r < 2) return;
    const cx = this.cx;
    const cy = this.cy;
    this.fillG.circle(cx, cy, r);
    this.fillG.fill({ color: WINDUP_FILL_COLOR, alpha: 0.38 + prog * 0.32 });
    this.ringG.circle(cx, cy, r);
    this.ringG.stroke({
      width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)),
      color: 0xff6b6b,
      alpha: 0.55 + prog * 0.2,
      cap: 'round',
      join: 'round',
    });
  }

  private redrawImpact(): void {
    const cx = this.cx;
    const cy = this.cy;
    const k = 1 - smooth01(this.fadeOutT / this.fadeOutSec);
    this.fillG.clear();
    if (k > 0.01) {
      this.fillG.circle(cx, cy, this.rMax);
      this.fillG.fill({ color: IMPACT_FILL_COLOR, alpha: 0.8 * k });
    }
  }
}

function smooth01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
