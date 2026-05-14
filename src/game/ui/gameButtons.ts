import type { FederatedPointerEvent, TextStyle } from 'pixi.js';
import { Container, Graphics, Polygon, Text } from 'pixi.js';

/** 统一斜切按钮的语义样式 id；可在运行时 `patchGameButtonStyle` 替换配色 */
export type GameButtonStyleKey =
  | 'primary'
  | 'classic'
  | 'classicMuted'
  | 'secondary'
  | 'parchment'
  | 'parchmentMuted'
  | 'challenge'
  | 'headerBar'
  | 'danger'
  | 'cta'
  | 'ctaDisabled'
  | 'accent'
  | 'navSlate'
  | 'synergyTabOn'
  | 'synergyTabOff'
  | 'strengthenTabOn'
  | 'strengthenTabOff'
  | 'sheetDeploy'
  | 'sheetUndeploy'
  | 'sheetClose'
  | 'modalOk'
  | 'draftRefresh'
  | 'draftRefreshDisabled'
  | 'draftPrimary'
  | 'battleBond';

export type GameButtonLook = {
  fill: number;
  stroke: number;
  /** 默认与描边同色 */
  textColor?: number;
  strokeWidth?: number;
  cut?: number;
  fontSize?: number;
  fontWeight?: TextStyle['fontWeight'];
  fontFamily?: string;
};

export const DEFAULT_GAME_BUTTON_FONT =
  'system-ui, Segoe UI, Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 全局样式表：改这里或运行时 patch 即可替换某一类按钮外观 */
export const GAME_BUTTON_STYLES: Record<GameButtonStyleKey, GameButtonLook> = {
  primary: { fill: 0xebe5a7, stroke: 0x3d3d33, textColor: 0x3d3d33, fontWeight: '700' },
  /** 游戏内默认「经典」按钮（与 primary 同色，可单独 patch） */
  classic: { fill: 0xebe5a7, stroke: 0x3d3d33, textColor: 0x3d3d33, fontWeight: '600' },
  classicMuted: { fill: 0xd8d2b0, stroke: 0x52524a, textColor: 0x6b6560, fontWeight: '600' },
  secondary: { fill: 0xfefce8, stroke: 0x3d3d33, textColor: 0x3d3d33, fontWeight: '600' },
  parchment: { fill: 0xdcc8a8, stroke: 0x4a321c, textColor: 0x1a1410, fontWeight: '600' },
  parchmentMuted: { fill: 0xb0a090, stroke: 0x4a321c, textColor: 0x5c5348, fontWeight: '600' },
  challenge: { fill: 0xf2dc9a, stroke: 0x78350f, textColor: 0xb45309, fontWeight: '900' },
  headerBar: { fill: 0x5c4a38, stroke: 0x302113, textColor: 0xf1f5f9, fontWeight: '600' },
  danger: { fill: 0xb91c1c, stroke: 0x7f1d1d, textColor: 0xffffff, fontWeight: '700' },
  cta: { fill: 0x2563eb, stroke: 0x1e3a8a, textColor: 0xffffff, fontWeight: '700' },
  ctaDisabled: { fill: 0x475569, stroke: 0x334155, textColor: 0xe2e8f0, fontWeight: '700' },
  accent: { fill: 0x7c3aed, stroke: 0x5b21b6, textColor: 0xffffff, fontWeight: '700' },
  navSlate: { fill: 0x1e293b, stroke: 0x475569, textColor: 0xe2e8f0, fontWeight: '600' },
  synergyTabOn: { fill: 0x4a3728, stroke: 0xfbbf24, textColor: 0xfef3c7, fontWeight: '600' },
  synergyTabOff: { fill: 0x3d3328, stroke: 0x64748b, textColor: 0x94a3b8, fontWeight: '600' },
  strengthenTabOn: { fill: 0x4f46e5, stroke: 0xa5b4fc, textColor: 0xffffff, fontWeight: '700' },
  strengthenTabOff: { fill: 0x1e293b, stroke: 0x475569, textColor: 0x94a3b8, fontWeight: '700' },
  sheetDeploy: { fill: 0x2563eb, stroke: 0x1e40af, textColor: 0xffffff, fontWeight: '700' },
  sheetUndeploy: { fill: 0xc2410c, stroke: 0x7c2d12, textColor: 0xfff7ed, fontWeight: '700' },
  sheetClose: { fill: 0x475569, stroke: 0x334155, textColor: 0xf1f5f9, fontWeight: '700' },
  modalOk: { fill: 0x2563eb, stroke: 0x1e40af, textColor: 0xffffff, fontWeight: '600' },
  draftRefresh: { fill: 0xfef08a, stroke: 0xb45309, textColor: 0x422006, fontWeight: '600' },
  draftRefreshDisabled: { fill: 0x57534e, stroke: 0x44403c, textColor: 0xe7e5e4, fontWeight: '600' },
  draftPrimary: { fill: 0x5c4a38, stroke: 0x302113, textColor: 0xf2e6d9, fontWeight: '600' },
  battleBond: { fill: 0x1e3a5f, stroke: 0x38bdf8, textColor: 0xe0f2fe, fontWeight: '600' },
};

export function patchGameButtonStyle(key: GameButtonStyleKey, patch: Partial<GameButtonLook>): void {
  GAME_BUTTON_STYLES[key] = { ...GAME_BUTTON_STYLES[key], ...patch };
}

export function toPixiColor(value: number | string): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value >>> 0;
  }
  if (typeof value !== 'string') return 0xffffff;
  let s = value.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) {
    s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!;
  }
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? (n >>> 0) : 0xffffff;
}

function chamferPolyPoints(w: number, h: number, cut: number): number[] {
  const c = Math.max(0, Math.min(cut, Math.min(w, h) * 0.45));
  return [c, 0, w, 0, w, h - c, w - c, h, 0, h, 0, c];
}

/** RGB 乘算，用于悬停提亮 / 按下压暗（参考按钮 demo 的 brightness / active） */
function scaleRgb(c: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >>> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((c >>> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((c & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export type GameButtonPaintOptions = {
  text: string;
  width: number;
  height: number;
  fill?: number | string;
  stroke?: number | string;
  textColor?: number | string;
  strokeWidth?: number;
  cut?: number;
  fontSize?: number;
  fontWeight?: TextStyle['fontWeight'];
  fontFamily?: string;
  /** 文案换行宽（不设则单行） */
  wordWrapWidth?: number;
};

export type GameButton = Container & {
  readonly body: Graphics;
  readonly label: Text;
  redraw: (patch: Partial<GameButtonPaintOptions>) => void;
  setEnabled: (enabled: boolean, dimVisual?: boolean) => void;
};

export type CreateGameButtonArgs = GameButtonPaintOptions & {
  onTap?: (e: FederatedPointerEvent) => void;
};

export function createStyledGameButton(
  styleKey: GameButtonStyleKey,
  mandatory: { text: string; width: number; height: number } &
    Partial<Omit<CreateGameButtonArgs, 'text' | 'width' | 'height'>>,
): GameButton {
  const s = GAME_BUTTON_STYLES[styleKey];
  return createGameButton({
    fill: s.fill,
    stroke: s.stroke,
    textColor: mandatory.textColor ?? s.textColor ?? s.stroke,
    strokeWidth: mandatory.strokeWidth ?? s.strokeWidth,
    cut: mandatory.cut ?? s.cut,
    fontSize: mandatory.fontSize ?? s.fontSize,
    fontWeight: mandatory.fontWeight ?? s.fontWeight,
    fontFamily: mandatory.fontFamily ?? s.fontFamily ?? DEFAULT_GAME_BUTTON_FONT,
    ...mandatory,
  });
}

export function redrawGameButtonFromStyle(
  btn: GameButton,
  styleKey: GameButtonStyleKey,
  mandatory: { text: string; width: number; height: number } &
    Partial<Omit<CreateGameButtonArgs, 'text' | 'width' | 'height'>>,
): void {
  const s = GAME_BUTTON_STYLES[styleKey];
  btn.redraw({
    fill: s.fill,
    stroke: s.stroke,
    textColor: mandatory.textColor ?? s.textColor ?? s.stroke,
    strokeWidth: mandatory.strokeWidth ?? s.strokeWidth,
    cut: mandatory.cut ?? s.cut,
    fontSize: mandatory.fontSize ?? s.fontSize,
    fontWeight: mandatory.fontWeight ?? s.fontWeight,
    fontFamily: mandatory.fontFamily ?? s.fontFamily ?? DEFAULT_GAME_BUTTON_FONT,
    ...mandatory,
  });
}

export function createGameButton(opts: CreateGameButtonArgs): GameButton {
  let w = opts.width;
  let h = opts.height;
  let fill = toPixiColor(opts.fill ?? 0xebe5a7);
  let stroke = toPixiColor(opts.stroke ?? 0x3d3d33);
  let textColor = toPixiColor(opts.textColor ?? stroke);
  let strokeW =
    opts.strokeWidth != null ? opts.strokeWidth : Math.max(2, Math.min(4, Math.round(h * 0.045)));
  let cut =
    opts.cut != null
      ? opts.cut
      : Math.round(Math.min(h * 0.24, w * 0.09, Math.min(w, h) * 0.35));
  let fontSize = opts.fontSize != null ? opts.fontSize : Math.max(14, Math.round(h * 0.4));
  let displayText = opts.text;
  let fontWeight = opts.fontWeight ?? 'bold';
  let fontFamily = opts.fontFamily ?? DEFAULT_GAME_BUTTON_FONT;
  let wordWrapWidth = opts.wordWrapWidth;

  const body = new Graphics();
  const label = new Text({
    text: displayText,
    style: {
      fontFamily,
      fontSize,
      fill: textColor,
      fontWeight,
      align: 'center',
      wordWrap: wordWrapWidth != null && wordWrapWidth > 0,
      wordWrapWidth: wordWrapWidth != null && wordWrapWidth > 0 ? wordWrapWidth : undefined,
      breakWords: true,
    },
  });
  label.anchor.set(0.5, 0.5);

  /** 从几何中心缩放，接近参考 HTML 的 scale(1.06) */
  const face = new Container();
  face.addChild(body);
  face.addChild(label);

  const btn = new Container() as GameButton;
  Object.assign(btn, { body, label });

  let hovering = false;
  let pressing = false;

  const syncFacePivot = (): void => {
    face.pivot.set(w / 2, h / 2);
    face.position.set(w / 2, h / 2);
  };

  const paint = (): void => {
    const interactive = btn.eventMode === 'static';
    let drawFill = fill;
    let drawStroke = stroke;
    let drawText = textColor;
    let drawStrokeW = strokeW;
    let faceScale = 1;

    if (interactive) {
      if (pressing) {
        drawFill = scaleRgb(fill, 0.9);
        drawStroke = scaleRgb(stroke, 0.93);
        drawText = scaleRgb(textColor, 0.96);
        faceScale = 0.97;
      } else if (hovering) {
        drawFill = scaleRgb(fill, 1.07);
        drawStroke = scaleRgb(stroke, 1.04);
        drawText = scaleRgb(textColor, 1.05);
        drawStrokeW = Math.min(5, strokeW + 0.5);
        faceScale = 1.05;
      }
    }

    const pts = chamferPolyPoints(w, h, cut);
    body.clear();
    body.poly(pts).fill(drawFill).stroke({ width: drawStrokeW, color: drawStroke, alpha: 1 });
    label.text = displayText;
    label.style.fontFamily = fontFamily;
    label.style.fontSize = fontSize;
    label.style.fill = drawText;
    label.style.fontWeight = fontWeight;
    if (wordWrapWidth != null && wordWrapWidth > 0) {
      label.style.wordWrap = true;
      label.style.wordWrapWidth = wordWrapWidth;
    } else {
      label.style.wordWrap = false;
    }
    label.position.set(w / 2, h / 2);
    btn.hitArea = new Polygon(pts);
    syncFacePivot();
    face.scale.set(faceScale, faceScale);
  };

  paint();

  btn.addChild(face);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';

  const onDown = (): void => {
    if (btn.eventMode !== 'static') return;
    pressing = true;
    paint();
  };
  const onUp = (): void => {
    pressing = false;
    paint();
  };
  btn.on('pointerdown', onDown);
  btn.on('pointerup', onUp);
  btn.on('pointerupoutside', onUp);
  btn.on('pointercancel', onUp);

  btn.on('pointerover', () => {
    if (btn.eventMode !== 'static') return;
    hovering = true;
    paint();
  });
  btn.on('pointerout', () => {
    hovering = false;
    paint();
  });

  if (opts.onTap) {
    btn.on('pointertap', opts.onTap);
  }

  btn.redraw = (patch: Partial<GameButtonPaintOptions>): void => {
    let sizeChanged = false;
    if (patch.width != null) {
      w = patch.width;
      sizeChanged = true;
    }
    if (patch.height != null) {
      h = patch.height;
      sizeChanged = true;
    }
    if (patch.fill != null) fill = toPixiColor(patch.fill);
    if (patch.stroke != null) stroke = toPixiColor(patch.stroke);
    if (patch.textColor != null) textColor = toPixiColor(patch.textColor);
    if (patch.strokeWidth != null) strokeW = patch.strokeWidth;
    else if (patch.height != null) strokeW = Math.max(2, Math.min(4, Math.round(h * 0.045)));
    if (patch.cut != null) cut = patch.cut;
    else if (sizeChanged) cut = Math.round(Math.min(h * 0.24, w * 0.09, Math.min(w, h) * 0.35));
    if (patch.fontSize != null) fontSize = patch.fontSize;
    else if (patch.height != null) fontSize = Math.max(14, Math.round(h * 0.4));
    if (patch.fontWeight != null) fontWeight = patch.fontWeight;
    if (patch.fontFamily != null) fontFamily = patch.fontFamily;
    if (patch.wordWrapWidth !== undefined) wordWrapWidth = patch.wordWrapWidth;
    if (patch.text != null) {
      displayText = patch.text;
    }
    paint();
  };

  btn.setEnabled = (enabled: boolean, dimVisual = true): void => {
    btn.eventMode = enabled ? 'static' : 'passive';
    btn.cursor = enabled ? 'pointer' : 'default';
    btn.alpha = enabled || !dimVisual ? 1 : 0.55;
    if (!enabled) {
      hovering = false;
      pressing = false;
    }
    paint();
  };

  return btn;
}
