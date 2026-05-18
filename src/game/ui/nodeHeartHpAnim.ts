import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { spawnRingPulse, tickRingPulses, type RingPulse } from '../battleVisuals';

const FF = 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif';
const ANIM_MS_DAMAGE = 1420;
const ANIM_MS_HEAL = 1280;
/** 血量数字与爱心停稳后再进结算 */
const HOLD_AFTER_ANIM_MS = 1000;

export type NodeHeartHpAnimOpts = {
  hpBefore: number;
  /** 结算后的生命（可低于 0，仅上限 clamp） */
  hpAfter: number;
  maxHp: number;
  /** 结算逻辑生命变化（满血 +2 等；动画用 hpBefore→hpAfter 插值） */
  hpDelta: number;
};

/** 参数方程爱心（局部坐标，y 向下为正，尖端朝下） */
function heartPoint(t: number, s: number): { x: number; y: number } {
  const x = s * 16 * Math.sin(t) ** 3;
  const y = -s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  return { x, y };
}

function fillHeart(g: Graphics, s: number, fill: { color: number; alpha?: number }): void {
  const steps = 88;
  const p0 = heartPoint(0, s);
  g.moveTo(p0.x, p0.y);
  for (let i = 1; i <= steps; i++) {
    const p = heartPoint((i / steps) * Math.PI * 2, s);
    g.lineTo(p.x, p.y);
  }
  g.closePath().fill(fill);
}

function strokeHeart(
  g: Graphics,
  s: number,
  stroke: { width: number; color: number; alpha?: number; cap?: 'round' | 'butt' },
): void {
  const steps = 88;
  const p0 = heartPoint(0, s);
  g.moveTo(p0.x, p0.y);
  for (let i = 1; i <= steps; i++) {
    const p = heartPoint((i / steps) * Math.PI * 2, s);
    g.lineTo(p.x, p.y);
  }
  g.closePath().stroke(stroke);
}

function heartBounds(s: number): { top: number; bottom: number; left: number; right: number } {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= 88; i++) {
    const p = heartPoint((i / 88) * Math.PI * 2, s);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
  }
  return { top, bottom, left, right };
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function fillRatio(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
}

/**
 * 节点结束：屏幕中央爱心生命变化（掉血/加血），播完调用 `onComplete`。
 * 挂载在 `ModalLayer` 等全屏容器上（与战斗结算同层，盖在战斗场景之上）。
 */
export function playNodeHeartHpAnim(host: Container, opts: NodeHeartHpAnimOpts, onComplete: () => void): void {
  const delta = opts.hpDelta;
  if (delta === 0) {
    onComplete();
    return;
  }

  const heal = delta > 0;
  const maxHp = Math.max(1, opts.maxHp);
  const hpStart = opts.hpBefore;
  const hpEnd = opts.hpAfter;
  const ratioBefore = fillRatio(hpStart, maxHp);
  const ratioAfter = fillRatio(hpEnd, maxHp);

  host.sortableChildren = true;
  host.visible = true;
  host.eventMode = 'static';

  const root = new Container();
  root.zIndex = 50_000;
  root.eventMode = 'static';
  root.hitArea = host.hitArea;
  host.addChild(root);

  const dim = new Graphics();
  dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0 });
  dim.eventMode = 'static';
  root.addChild(dim);

  const cx = GAME_WIDTH / 2;
  const cy = Math.round(GAME_HEIGHT * 0.44);
  const heartS = Math.round(5.4 * LAYOUT_SCALE);
  const bounds = heartBounds(heartS);
  const pad = Math.round(8 * LAYOUT_SCALE);

  const spot = new Graphics();
  spot.eventMode = 'none';
  root.addChild(spot);

  const heartRoot = new Container();
  heartRoot.position.set(cx, cy);
  root.addChild(heartRoot);

  const shakeWrap = new Container();
  heartRoot.addChild(shakeWrap);

  const fillMask = new Graphics();
  const fillGfx = new Graphics();
  fillGfx.mask = fillMask;
  shakeWrap.addChild(fillGfx);
  shakeWrap.addChild(fillMask);

  const emptyGfx = new Graphics();
  fillHeart(emptyGfx, heartS, { color: 0x1e293b, alpha: 0.92 });
  shakeWrap.addChildAt(emptyGfx, 0);

  const borderGfx = new Graphics();
  strokeHeart(borderGfx, heartS, {
    width: Math.max(3, Math.round(4 * LAYOUT_SCALE)),
    color: heal ? 0xfda4af : 0xfca5a5,
    alpha: 0.95,
  });
  shakeWrap.addChild(borderGfx);

  const fxGfx = new Graphics();
  fxGfx.eventMode = 'none';
  shakeWrap.addChild(fxGfx);

  const ringLayer = new Container();
  ringLayer.eventMode = 'none';
  root.addChild(ringLayer);
  const rings: RingPulse[] = [];

  const labelBaseY = cy + bounds.bottom + Math.round(28 * LAYOUT_SCALE);
  const numLabel = new Text({
    text: String(Math.round(hpStart)),
    style: {
      fontFamily: FF,
      fontSize: Math.round(52 * LAYOUT_SCALE),
      fill: heal ? 0x4ade80 : 0xf87171,
      fontWeight: '900',
      stroke: { color: 0x0f172a, width: Math.round(5 * LAYOUT_SCALE) },
    },
  });
  numLabel.anchor.set(0.5, 0);
  numLabel.position.set(cx, labelBaseY);
  numLabel.alpha = 0;
  root.addChild(numLabel);

  const redrawFill = (ratio: number): void => {
    const r = Math.max(0, Math.min(1, ratio));
    const h = bounds.bottom - bounds.top;
    const fillTop = bounds.bottom - h * r;
    fillMask.clear();
    fillMask.rect(bounds.left - pad, fillTop, bounds.right - bounds.left + pad * 2, bounds.bottom - fillTop + pad).fill({ color: 0xffffff });

    fillGfx.clear();
    fillHeart(fillGfx, heartS, {
      color: heal ? 0xef4444 : 0xdc2626,
      alpha: 0.88 + (heal ? 0.06 : 0),
    });
    if (heal) {
      fillHeart(fillGfx, heartS, { color: 0xfca5a5, alpha: 0.35 });
    }
  };

  redrawFill(ratioBefore);

  const spotW = bounds.right - bounds.left + Math.round(120 * LAYOUT_SCALE);
  const spotH = bounds.bottom - bounds.top + Math.round(140 * LAYOUT_SCALE);

  const animMs = heal ? ANIM_MS_HEAL : ANIM_MS_DAMAGE;
  const totalMs = animMs + HOLD_AFTER_ANIM_MS;
  const t0 = performance.now();
  let last = t0;
  let finished = false;

  const paintHoldFrame = (): void => {
    dim.clear();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.58 });
    spot.clear();
    spot.roundRect(cx - spotW / 2, cy + bounds.top - Math.round(36 * LAYOUT_SCALE), spotW, spotH, Math.round(48 * LAYOUT_SCALE)).fill({
      color: 0x0f172a,
      alpha: 0.72,
    });
    redrawFill(ratioAfter);
    shakeWrap.position.set(0, 0);
    shakeWrap.scale.set(1, 1);
    shakeWrap.rotation = 0;
    fxGfx.clear();
    numLabel.text = String(Math.round(hpEnd));
    numLabel.alpha = 1;
    numLabel.scale.set(1, 1);
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    Ticker.shared.remove(tick);
    root.destroy({ children: true });
    root.removeFromParent();
    onComplete();
  };

  const tick = (): void => {
    if (!root.parent || root.destroyed) {
      finish();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now - t0;

    if (elapsed >= totalMs) {
      finish();
      return;
    }

    if (elapsed >= animMs) {
      tickRingPulses(rings, dt);
      paintHoldFrame();
      return;
    }

    const p = elapsed / animMs;
    tickRingPulses(rings, dt);

    const dimA = p < 0.12 ? p / 0.12 : 1;
    dim.clear();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.58 * dimA });

    const spotA = p < 0.15 ? p / 0.15 : 1;
    spot.clear();
    spot.roundRect(cx - spotW / 2, cy + bounds.top - Math.round(36 * LAYOUT_SCALE), spotW, spotH, Math.round(48 * LAYOUT_SCALE)).fill({
      color: 0x0f172a,
      alpha: 0.72 * spotA,
    });

    const fillP = easeOutCubic(Math.min(1, Math.max(0, (p - 0.1) / 0.55)));
    const displayRatio = ratioBefore + (ratioAfter - ratioBefore) * fillP;
    redrawFill(displayRatio);

    if (heal) {
      const pulse = 1 + 0.06 * Math.sin(p * Math.PI * 4);
      shakeWrap.scale.set(pulse, pulse);
      shakeWrap.rotation = 0;
    } else {
      const hitP = Math.min(1, (p - 0.08) / 0.25);
      const shake = hitP < 1 ? Math.sin(hitP * Math.PI * 6) * (1 - hitP) * Math.round(11 * LAYOUT_SCALE) : 0;
      shakeWrap.position.set(shake, 0);
      shakeWrap.scale.set(1 - hitP * 0.06, 1 - hitP * 0.04);
    }

    fxGfx.clear();
    if (!heal && p > 0.08 && p < 0.45) {
      const k = (p - 0.08) / 0.37;
      const a = (1 - k) * 0.85;
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI * 0.15 - (i / 4) * Math.PI * 0.7;
        const len = heartS * (8 + k * 10);
        const x0 = Math.cos(ang) * heartS * 6;
        const y0 = Math.sin(ang) * heartS * 4;
        fxGfx.moveTo(x0, y0)
          .lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len)
          .stroke({ width: Math.max(2, 3 * LAYOUT_SCALE), color: 0xfef08a, alpha: a, cap: 'round' });
      }
      strokeHeart(fxGfx, heartS, { width: Math.max(4, 5 * LAYOUT_SCALE), color: 0xffffff, alpha: a * 0.45 });
    }
    if (heal && p > 0.12 && p < 0.7) {
      const k = (p - 0.12) / 0.58;
      const a = (1 - Math.abs(k - 0.5) * 2) * 0.5;
      strokeHeart(fxGfx, heartS, { width: Math.max(3, 4 * LAYOUT_SCALE), color: 0xfef9c3, alpha: a });
    }

    if (heal && p > 0.12 && rings.length === 0) {
      rings.push(
        spawnRingPulse(ringLayer, cx, cy, heartS * 14, 0x4ade80, 0.42, { delay: 0 }),
        spawnRingPulse(ringLayer, cx, cy, heartS * 20, 0x86efac, 0.36, { delay: 0.06 }),
      );
    }

    const numIn = Math.min(1, Math.max(0, (p - 0.12) / 0.2));
    numLabel.alpha = numIn;

    const countP = easeInOutQuad(Math.min(1, Math.max(0, (p - 0.15) / 0.55)));
    const shownHp = hpStart + (hpEnd - hpStart) * countP;
    numLabel.text = String(Math.round(shownHp));

    if (heal) {
      numLabel.scale.set(1 + 0.08 * Math.sin(p * Math.PI * 3) * (1 - p));
    } else {
      numLabel.scale.set(1, 1);
    }
  };

  Ticker.shared.add(tick);
}
