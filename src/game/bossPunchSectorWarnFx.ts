import { Container, Graphics } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';
import { BOSS_WARN_RED } from './bossWarnPalette';

export type BossPunchSectorWarnOpts = {
  cx: number;
  cy: number;
  /** 扇形对称轴（弧度） */
  aimAngle: number;
  /** 半张角（弧度），总夹角 = 2×halfSpreadRad */
  halfSpreadRad: number;
  rOuter: number;
  /** 蓄力总时长（秒）；扫光在淡入结束后匀速扫过整扇区，于该时刻到达终点 */
  windupSec: number;
};

export type BossPunchSectorWarnTick = {
  /** 扫光刚到达扇形终点，应在此帧触发伤害 */
  impactNow: boolean;
  /** 渐隐结束，可销毁节点 */
  done: boolean;
};

/** 俯视角扇形预警：底衬 + 呼吸描边 + 径向向外弧带扫光；纯 Graphics，无贴图 */
export class BossPunchSectorWarnFx extends Container {
  private readonly baseG = new Graphics();
  private readonly borderG = new Graphics();
  private readonly sweepG = new Graphics();

  private readonly aimAngle: number;
  private readonly halfSpread: number;
  private readonly rOuter: number;
  private readonly windupSec: number;
  private readonly fadeInSec: number;
  private readonly fadeOutSec: number;

  private elapsed = 0;
  private fadeOutT = 0;
  private phase: 'windup' | 'fadeout' = 'windup';
  private impactEmitted = false;

  private cx: number;
  private cy: number;

  constructor(opts: BossPunchSectorWarnOpts) {
    super();
    this.cx = opts.cx;
    this.cy = opts.cy;
    this.aimAngle = opts.aimAngle;
    this.halfSpread = opts.halfSpreadRad;
    this.rOuter = opts.rOuter;
    this.windupSec = Math.max(0.25, opts.windupSec);
    this.fadeInSec = Math.min(0.22, this.windupSec * 0.18);
    this.fadeOutSec = Math.max(0.14, 0.16 * (LAYOUT_SCALE / 1));

    this.addChild(this.baseG, this.borderG, this.sweepG);
    this.redraw(0);
  }

  setCenter(cx: number, cy: number): void {
    this.cx = cx;
    this.cy = cy;
  }

  tick(dt: number): BossPunchSectorWarnTick {
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

    const cx = this.cx;
    const cy = this.cy;
    const r = this.rOuter;
    const a0 = this.aimAngle - this.halfSpread;
    const a1 = this.aimAngle + this.halfSpread;
    const breath = 0.55 + 0.45 * Math.sin(elapsed * 2.4);

    this.baseG.clear();
    drawSoftSectorFill(this.baseG, cx, cy, r, a0, a1, master);

    this.borderG.clear();
    drawSectorBorder(this.borderG, cx, cy, r, a0, a1, master * breath);

    const prog = this.sweepProgress(elapsed);
    this.sweepG.clear();
    if (prog > 0) {
      drawRadialOutwardSweep(this.sweepG, cx, cy, r, a0, a1, prog, master);
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

/** 多层略缩半径 + 递变透明度，模拟边缘柔化 */
function drawSoftSectorFill(g: Graphics, cx: number, cy: number, r: number, a0: number, a1: number, master: number): void {
  const layers = [
    { scale: 1.0, alpha: 0.2 },
    { scale: 0.94, alpha: 0.16 },
    { scale: 0.86, alpha: 0.11 },
    { scale: 0.76, alpha: 0.07 },
  ] as const;
  for (const L of layers) {
    const rr = r * L.scale;
    g.moveTo(cx, cy);
    g.arc(cx, cy, rr, a0, a1, false);
    g.lineTo(cx, cy);
    g.fill({ color: BOSS_WARN_RED.fillDark, alpha: L.alpha * master });
  }
}

function drawSectorBorder(g: Graphics, cx: number, cy: number, r: number, a0: number, a1: number, alpha: number): void {
  const wOuter = Math.max(2, Math.round(2.5 * LAYOUT_SCALE));
  const wRay = Math.max(1.5, Math.round(2 * LAYOUT_SCALE));
  g.arc(cx, cy, r, a0, a1, false);
  g.stroke({ width: wOuter, color: BOSS_WARN_RED.border, alpha: alpha * 0.85, cap: 'round' });
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy + Math.sin(a1) * r;
  g.moveTo(cx, cy);
  g.lineTo(x0, y0);
  g.stroke({ width: wRay, color: BOSS_WARN_RED.borderHi, alpha: alpha * 0.75 });
  g.moveTo(cx, cy);
  g.lineTo(x1, y1);
  g.stroke({ width: wRay, color: BOSS_WARN_RED.borderHi, alpha: alpha * 0.75 });
}

/** 由圆心沿半径向外扩张的弧带扫光（在扇形角域 [a0,a1] 内） */
function drawRadialOutwardSweep(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  progress: number,
  master: number,
): void {
  const rMin = Math.max(Math.round(10 * LAYOUT_SCALE), r * 0.06);
  const rLead = rMin + progress * (r - rMin);
  const bandThick = Math.max(Math.round(14 * LAYOUT_SCALE), (r - rMin) * 0.11);
  const layers = [
    { thickMul: 1.45, alpha: 0.1, color: BOSS_WARN_RED.sweepOuter },
    { thickMul: 1.05, alpha: 0.26, color: BOSS_WARN_RED.sweepMid },
    { thickMul: 0.72, alpha: 0.48, color: BOSS_WARN_RED.sweepCore },
    { thickMul: 0.42, alpha: 0.68, color: BOSS_WARN_RED.sweepCore },
  ] as const;
  for (const L of layers) {
    const half = bandThick * L.thickMul * 0.5;
    const ri = Math.max(rMin, rLead - half);
    const ro = Math.min(r, rLead + half * 0.15);
    if (ro <= ri + 2) continue;
    drawAnnularSector(g, cx, cy, ri, ro, a0, a1);
    g.fill({ color: L.color, alpha: L.alpha * master });
  }
  g.arc(cx, cy, Math.min(r, rLead), a0, a1, false);
  g.stroke({
    width: Math.max(2.5, Math.round(3.5 * LAYOUT_SCALE)),
    color: BOSS_WARN_RED.sweepCore,
    alpha: 0.62 * master,
    cap: 'round',
  });
}

function drawAnnularSector(
  g: Graphics,
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  a0: number,
  a1: number,
): void {
  g.moveTo(cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner);
  g.arc(cx, cy, rInner, a0, a1, false);
  g.arc(cx, cy, rOuter, a1, a0, true);
  g.closePath();
}
