import { FillGradient, Graphics } from 'pixi.js';

/** 深褐细描边（参考「取消」类按钮） */
export const PARCHMENT_BTN_STROKE = 0x4a321c;
/** 无渐变时的实体填充（羊皮钮常态） */
export const PARCHMENT_BTN_FILL = 0xdcc8a8;
/** 置灰按钮填充 */
export const PARCHMENT_BTN_FILL_DIM = 0xb0a090;
/** 主按钮字色 */
export const PARCHMENT_BTN_TEXT = 0x1a1410;
/** 置灰/不可点字色 */
export const PARCHMENT_BTN_TEXT_DIM = 0x5c5348;

export type ParchmentPaintOpts = {
  /** 仅「挑战」主按钮等保留纵向羊皮渐变 */
  gradient?: boolean;
};

/**
 * 纵向浅奶油 → 蜜黄渐变（置灰时略发冷灰黄）。
 * 用于 `Graphics.roundRect(...).fill(grad)`；随 Graphics 销毁即可，勿长期悬挂引用。
 */
export function createParchmentButtonGradient(dim: boolean): FillGradient {
  if (dim) {
    return new FillGradient({
      type: 'linear',
      textureSpace: 'local',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xd8d0c4 },
        { offset: 0.5, color: 0xbfb4a6 },
        { offset: 1, color: 0x9e948a },
      ],
    });
  }
  return new FillGradient({
    type: 'linear',
    textureSpace: 'local',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0xfbf4e4 },
      { offset: 0.42, color: 0xf2dc9a },
      { offset: 1, color: 0xd4a84a },
    ],
  });
}

/**
 * 圆角矩形：默认**无渐变**实色底 + 深褐描边；传 `{ gradient: true }` 时保留羊皮渐变（如「挑战」按钮）。
 */
export function paintParchmentRoundRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerR: number,
  ls: number,
  dim: boolean,
  opts?: ParchmentPaintOpts,
): void {
  g.clear();
  const sw = Math.max(1, Math.round(1.25 * ls));
  const strokeA = dim ? 0.52 : 0.9;
  if (opts?.gradient) {
    const grad = createParchmentButtonGradient(dim);
    g.roundRect(x, y, w, h, cornerR)
      .fill(grad)
      .stroke({
        width: sw,
        color: PARCHMENT_BTN_STROKE,
        alpha: strokeA,
      });
    return;
  }
  const fc = dim ? PARCHMENT_BTN_FILL_DIM : PARCHMENT_BTN_FILL;
  g.roundRect(x, y, w, h, cornerR)
    .fill(fc)
    .stroke({
      width: sw,
      color: PARCHMENT_BTN_STROKE,
      alpha: strokeA,
    });
}

/**
 * 不透明羊皮纸渐变底板 + 仅上下深褐边线（肉鸽三选一等明信片区）。
 * `plate` 与 `frame` 需叠放同一位置，`frame` 在上。
 */
export function drawParchmentCardTopBottomRules(
  plate: Graphics,
  frame: Graphics,
  w: number,
  h: number,
  cornerR: number,
  ls: number,
  dim = false,
): void {
  plate.clear();
  frame.clear();
  const fc = dim ? PARCHMENT_BTN_FILL_DIM : PARCHMENT_BTN_FILL;
  plate.roundRect(0, 0, w, h, cornerR).fill(fc);

  const ty = Math.max(2, Math.round(4 * ls));
  const by = h - ty;
  const mx = Math.max(Math.round(10 * ls), Math.round(cornerR * 0.55));
  const sw = Math.max(2, Math.round(2 * ls));
  const brown = PARCHMENT_BTN_STROKE;
  const lineA = dim ? 0.55 : 0.92;
  frame.moveTo(mx, ty).lineTo(w - mx, ty).stroke({ width: sw, color: brown, alpha: lineA, cap: 'butt', join: 'miter' });
  frame.moveTo(mx, by).lineTo(w - mx, by).stroke({ width: sw, color: brown, alpha: lineA, cap: 'butt', join: 'miter' });
}
