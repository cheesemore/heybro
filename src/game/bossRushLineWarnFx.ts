import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';

import { BOSS_WARN_RED } from './bossWarnPalette';

export type BossRushLineWarnOpts = {
  startX: number;
  startY: number;
  dirx: number;
  diry: number;
  /** 直线长度（逻辑像素） */
  lineLen: number;
  /** 半宽（逻辑像素） */
  halfW: number;
  windupSec: number;
};

export type BossRushLineWarnTick = {
  /** 扫光抵达直线终点：应在此帧开始冲锋/伤害段 */
  impactNow: boolean;
  done: boolean;
};

/** 俯视角直线矩形预警：固定底衬 + 呼吸描边 + 沿轴平移扫光带 */
export class BossRushLineWarnFx extends Container {
  private readonly baseG = new Graphics();
  private readonly borderG = new Graphics();
  private readonly sweepG = new Graphics();

  private readonly sx: number;
  private readonly sy: number;
  private readonly dirx: number;
  private readonly diry: number;
  private readonly lineLen: number;
  private readonly halfW: number;
  private readonly windupSec: number;
  private readonly fadeInSec: number;
  private readonly fadeOutSec: number;

  private elapsed = 0;
  private fadeOutT = 0;
  private phase: 'windup' | 'fadeout' = 'windup';
  private impactEmitted = false;

  constructor(opts: BossRushLineWarnOpts) {
    super();
    const d = Math.hypot(opts.dirx, opts.diry) || 1;
    this.sx = opts.startX;
    this.sy = opts.startY;
    this.dirx = opts.dirx / d;
    this.diry = opts.diry / d;
    this.lineLen = opts.lineLen;
    this.halfW = opts.halfW;
    this.windupSec = Math.max(0.25, opts.windupSec);
    this.fadeInSec = Math.min(0.22, this.windupSec * 0.18);
    this.fadeOutSec = Math.max(0.14, 0.16 * (LAYOUT_SCALE / 1));

    this.addChild(this.baseG, this.borderG, this.sweepG);
    this.redraw(0);
  }

  tick(dt: number): BossRushLineWarnTick {
    let impactNow = false;
    if (this.phase === 'windup') {
      this.elapsed += dt;
      if (!this.impactEmitted && this.elapsed >= this.windupSec) {
        this.impactEmitted = true;
        impactNow = true;
        this.phase = 'fadeout';
        this.fadeOutT = 0;
      }
    } else {
      this.fadeOutT += dt;
    }
    this.redraw(this.phase === 'windup' ? this.elapsed : this.windupSec);
    const done = this.phase === 'fadeout' && this.fadeOutT >= this.fadeOutSec;
    return { impactNow, done };
  }

  private masterAlpha(elapsed: number): number {
    const fadeIn = smooth01(elapsed / this.fadeInSec);
    if (this.phase === 'windup') return fadeIn;
    const fadeOut = 1 - smooth01(this.fadeOutT / this.fadeOutSec);
    return fadeIn * fadeOut;
  }

  private sweepProgress(elapsed: number): number {
    const sweepStart = this.fadeInSec;
    const sweepDur = Math.max(1e-3, this.windupSec - sweepStart);
    return clamp01((elapsed - sweepStart) / sweepDur);
  }

  private redraw(elapsed: number): void {
    const master = this.masterAlpha(elapsed);
    if (master <= 0.001) {
      this.baseG.clear();
      this.borderG.clear();
      this.sweepG.clear();
      return;
    }

    const breath = 0.55 + 0.45 * Math.sin(elapsed * 2.4);
    const ex = this.sx + this.dirx * this.lineLen;
    const ey = this.sy + this.diry * this.lineLen;

    this.baseG.clear();
    drawSoftLineRect(this.baseG, this.sx, this.sy, ex, ey, this.halfW, master);

    this.borderG.clear();
    drawLineRectBorder(this.borderG, this.sx, this.sy, ex, ey, this.halfW, master * breath);

    const prog = this.sweepProgress(elapsed);
    this.sweepG.clear();
    if (prog > 0) {
      drawLineSweepBand(this.sweepG, this.sx, this.sy, this.dirx, this.diry, this.lineLen, this.halfW, prog, master);
    }
  }
}

function smooth01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function linePerp(dx: number, dy: number, halfW: number): { px: number; py: number } {
  const len = Math.hypot(dx, dy) || 1;
  return { px: (-dy / len) * halfW, py: (dx / len) * halfW };
}

function drawLineQuad(
  g: Graphics,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  halfW: number,
): void {
  const { px, py } = linePerp(ex - sx, ey - sy, halfW);
  g.moveTo(sx + px, sy + py);
  g.lineTo(ex + px, ey + py);
  g.lineTo(ex - px, ey - py);
  g.lineTo(sx - px, sy - py);
  g.closePath();
}

/** 底衬：略缩窄的多层矩形羽化 */
function drawSoftLineRect(
  g: Graphics,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  halfW: number,
  master: number,
): void {
  const layers = [
    { scale: 1.0, alpha: 0.22 },
    { scale: 0.9, alpha: 0.16 },
    { scale: 0.78, alpha: 0.1 },
  ] as const;
  for (const L of layers) {
    drawLineQuad(g, sx, sy, ex, ey, halfW * L.scale);
    g.fill({ color: BOSS_WARN_RED.fillDark, alpha: L.alpha * master });
  }
}

function drawLineRectBorder(
  g: Graphics,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  halfW: number,
  alpha: number,
): void {
  const w = Math.max(1.5, Math.round(2 * LAYOUT_SCALE));
  drawLineQuad(g, sx, sy, ex, ey, halfW);
  g.stroke({ width: w, color: BOSS_WARN_RED.border, alpha: alpha * 0.9 });
  const { px, py } = linePerp(ex - sx, ey - sy, halfW);
  g.moveTo(sx + px, sy + py);
  g.lineTo(ex + px, ey + py);
  g.stroke({ width: w, color: BOSS_WARN_RED.borderHi, alpha: alpha * 0.75 });
  g.moveTo(sx - px, sy - py);
  g.lineTo(ex - px, ey - py);
  g.stroke({ width: w, color: BOSS_WARN_RED.borderHi, alpha: alpha * 0.75 });
}

/** 沿直线从起点向终点平移的窄高亮条带（同宽、羽化） */
function drawLineSweepBand(
  g: Graphics,
  sx: number,
  sy: number,
  dirx: number,
  diry: number,
  lineLen: number,
  halfW: number,
  progress: number,
  master: number,
): void {
  const bandLen = Math.max(Math.round(28 * LAYOUT_SCALE), lineLen * 0.12);
  const centerAlong = progress * lineLen;
  const c0 = Math.max(0, centerAlong - bandLen * 0.5);
  const c1 = Math.min(lineLen, centerAlong + bandLen * 0.5);
  if (c1 <= c0 + 1) return;

  const bx0 = sx + dirx * c0;
  const by0 = sy + diry * c0;
  const bx1 = sx + dirx * c1;
  const by1 = sy + diry * c1;

  const layers = [
    { scale: 1.12, alpha: 0.14, color: BOSS_WARN_RED.sweepOuter },
    { scale: 1.02, alpha: 0.32, color: BOSS_WARN_RED.sweepMid },
    { scale: 0.88, alpha: 0.55, color: BOSS_WARN_RED.sweepCore },
  ] as const;
  for (const L of layers) {
    drawLineQuad(g, bx0, by0, bx1, by1, halfW * L.scale);
    g.fill({ color: L.color, alpha: L.alpha * master });
  }
  drawLineQuad(g, bx0, by0, bx1, by1, halfW * 0.92);
  g.stroke({
    width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)),
    color: BOSS_WARN_RED.sweepCore,
    alpha: 0.5 * master,
  });
}
