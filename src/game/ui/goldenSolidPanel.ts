import { Graphics } from 'pixi.js';

/** 不透明主底板（饥荒式深褐金，约 #4d3d26） */
export const GOLDEN_PANEL_FILL = 0x4d3d26;
/** 上下边线、角饰（约 #302113） */
export const GOLDEN_PANEL_LINE = 0x302113;
/** 主标题 / 正文（浅奶油，约 #f2e6d9） */
export const GOLDEN_PANEL_TITLE = 0xf2e6d9;
export const GOLDEN_PANEL_BODY = 0xf2e6d9;
/** 次要说明（略压暗的奶油） */
export const GOLDEN_PANEL_MUTED = 0xc9b8a4;
/** 高亮 / 选中强调（亮金，约 #eeb04a） */
export const GOLDEN_PANEL_ACCENT = 0xeeb04a;
/** 嵌套小卡、标签底（略浅于主底板） */
export const GOLDEN_PANEL_INSET = 0x5c4a38;
export const GOLDEN_PANEL_INSET_STROKE = 0x302113;

/** 可选：`plateAlpha` &lt; 1 时用于章节主界面大卡等「金色虚底」透景 */
export type GoldenPanelDrawOpts = {
  plateAlpha?: number;
};

/**
 * 金色底板 + 仅上下深金边线 + 四角折钩与中点冠饰（与章节板同源几何）。
 * 默认 `plateAlpha=1` 为实底弹窗；章节选择主卡可传 `{ plateAlpha: 0.55 }` 等半透明金底。
 */
export function drawGoldenSolidPanel(
  plateFill: Graphics,
  frame: Graphics,
  w: number,
  h: number,
  ls: number,
  opts?: GoldenPanelDrawOpts,
): void {
  plateFill.clear();
  frame.clear();
  const rr = Math.round(12 * ls);
  const plateA = opts?.plateAlpha ?? 1;
  plateFill.roundRect(0, 0, w, h, rr).fill({ color: GOLDEN_PANEL_FILL, alpha: plateA });

  const ty = Math.round(5 * ls);
  const by = h - ty;
  const mx = Math.round(22 * ls);
  const lineC = GOLDEN_PANEL_LINE;
  const lineA = Math.min(0.96, 0.36 + plateA * 0.62);
  const sw = Math.max(2, Math.round(2.3 * ls));
  const crownFillA = Math.min(0.22, 0.07 + plateA * 0.22);

  frame.moveTo(mx, ty).lineTo(w - mx, ty).stroke({ width: sw, color: lineC, alpha: lineA, cap: 'butt', join: 'miter' });
  frame.moveTo(mx, by).lineTo(w - mx, by).stroke({ width: sw, color: lineC, alpha: lineA, cap: 'butt', join: 'miter' });

  const s = 11 * ls;
  const mid = w / 2;
  frame
    .moveTo(mid, ty - s * 0.75)
    .lineTo(mid - s * 0.9, ty + s * 0.45)
    .lineTo(mid - s * 0.28, ty + s * 0.1)
    .lineTo(mid + s * 0.28, ty + s * 0.1)
    .lineTo(mid + s * 0.9, ty + s * 0.45)
    .closePath()
    .fill({ color: lineC, alpha: crownFillA })
    .stroke({ width: Math.max(1.2, 1.6 * ls), color: lineC, alpha: lineA });
  frame
    .moveTo(mid, by + s * 0.75)
    .lineTo(mid - s * 0.9, by - s * 0.45)
    .lineTo(mid - s * 0.28, by - s * 0.1)
    .lineTo(mid + s * 0.28, by - s * 0.1)
    .lineTo(mid + s * 0.9, by - s * 0.45)
    .closePath()
    .fill({ color: lineC, alpha: crownFillA })
    .stroke({ width: Math.max(1.2, 1.6 * ls), color: lineC, alpha: lineA });

  const hk = Math.max(1.7, 2 * ls);
  const ga = lineA * 0.94;
  const vLen = Math.round(20 * ls);
  frame.moveTo(0, ty).lineTo(mx * 0.88, ty).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(2, ty + 2).lineTo(2, ty + vLen).lineTo(mx * 0.52, ty + Math.round(11 * ls)).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(w, ty).lineTo(w - mx * 0.88, ty).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(w - 2, ty + 2).lineTo(w - 2, ty + vLen).lineTo(w - mx * 0.52, ty + Math.round(11 * ls)).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(0, by).lineTo(mx * 0.88, by).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(2, by - 2).lineTo(2, by - vLen).lineTo(mx * 0.52, by - Math.round(11 * ls)).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(w, by).lineTo(w - mx * 0.88, by).stroke({ width: hk, color: lineC, alpha: ga });
  frame.moveTo(w - 2, by - 2).lineTo(w - 2, by - vLen).lineTo(w - mx * 0.52, by - Math.round(11 * ls)).stroke({ width: hk, color: lineC, alpha: ga });
}
