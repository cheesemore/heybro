import type { FederatedWheelEvent } from 'pixi.js';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  allyBondDisplayName,
  allyBasicSkillDesc,
  BOND_TIER_THRESHOLDS,
  bondTierActive,
  bondTierChipLabel,
  bondTierFullDesc,
} from '../bondCopy';
import type { AllyClass } from '../types';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_ACCENT,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_MUTED,
} from './goldenSolidPanel';
import { createStyledGameButton } from './gameButtons';

const GOLD = GOLDEN_PANEL_ACCENT;
const MUTED = GOLDEN_PANEL_MUTED;
const BODY = GOLDEN_PANEL_BODY;
const BOND_RED = 0xf87171;
const BOND_STACK_GREEN = 0x4ade80;
const BOND_STACK_BLUE = 0x60a5fa;
const BOND_TIER_BRIGHT = 0xf1f5f9;
const BOND_TIER_DIM = 0x64748b;
const BOND_TIER_SLASH = 0x475569;

const FF = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';

function bondStackCountLabelFill(stackSum: number): number {
  if (stackSum >= 6) return BOND_STACK_BLUE;
  if (stackSum >= 3) return BOND_STACK_GREEN;
  return MUTED;
}

function createBondStackStatusLine(n: number, maxW: number, fontSize: number): { root: Container; height: number } {
  const root = new Container();
  const lineGap = Math.round(4 * LAYOUT_SCALE);
  const gapAfterBond = Math.round(10 * LAYOUT_SCALE);
  let x = 0;
  let y = 0;
  let rowH = 0;
  const newLine = (): void => {
    y += rowH + lineGap;
    x = 0;
    rowH = 0;
  };
  const place = (t: Text): void => {
    if (x > 0 && x + t.width > maxW) newLine();
    t.position.set(x, y);
    root.addChild(t);
    x += t.width;
    rowH = Math.max(rowH, t.height);
  };
  place(
    new Text({
      text: `羁绊${n}`,
      style: { fontFamily: FF, fontSize, fontWeight: '800', fill: bondStackCountLabelFill(n) },
    }),
  );
  x += gapAfterBond;
  for (let i = 0; i < BOND_TIER_THRESHOLDS.length; i++) {
    if (i > 0) {
      place(
        new Text({
          text: '/',
          style: { fontFamily: FF, fontSize, fontWeight: '600', fill: BOND_TIER_SLASH },
        }),
      );
    }
    const tier = BOND_TIER_THRESHOLDS[i]!;
    place(
      new Text({
        text: String(tier),
        style: {
          fontFamily: FF,
          fontSize,
          fontWeight: '800',
          fill: n >= tier ? BOND_TIER_BRIGHT : BOND_TIER_DIM,
        },
      }),
    );
  }
  return { root, height: y + rowH };
}

/**
 * 单职业羁绊详情（与战斗内「羁绊/规则」点进职业后一致；`stackSum` 为棋盘该职业总层数，强化页传 0）。
 */
export class AllyBondDetailOverlay extends Container {
  private scrollOffset = 0;
  private scrollMax = 0;

  constructor(kind: AllyClass, stackSum: number, onDismiss: () => void) {
    super();
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.86 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => onDismiss());
    this.addChild(dim);

    const pw = Math.min(GAME_WIDTH - Math.round(48 * LAYOUT_SCALE), Math.round(640 * LAYOUT_SCALE));
    const ph = Math.round(720 * LAYOUT_SCALE);
    const px = (GAME_WIDTH - pw) / 2;
    const py = Math.round((GAME_HEIGHT - ph) / 2);
    const innerW = pw - Math.round(56 * LAYOUT_SCALE);
    const closeH = Math.round(52 * LAYOUT_SCALE);
    const closeW = Math.round(220 * LAYOUT_SCALE);
    const closeY = py + ph - closeH - Math.round(22 * LAYOUT_SCALE);
    const scrollY = py + Math.round(58 * LAYOUT_SCALE);
    const scrollH = Math.max(Math.round(200 * LAYOUT_SCALE), closeY - Math.round(16 * LAYOUT_SCALE) - scrollY);

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, pw, ph, LAYOUT_SCALE);
    plate.position.set(px, py);
    frame.position.set(px, py);
    plate.eventMode = 'static';
    plate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(plate);
    this.addChild(frame);

    const head = new Text({
      text: `${allyBondDisplayName(kind)} · 羁绊一览`,
      style: {
        fontFamily: FF,
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: GOLD,
        fontWeight: '800',
      },
    });
    head.anchor.set(0.5, 0);
    head.position.set(px + pw / 2, py + Math.round(18 * LAYOUT_SCALE));
    this.addChild(head);

    const scrollRoot = new Container();
    scrollRoot.position.set(px + Math.round(28 * LAYOUT_SCALE), scrollY);
    this.addChild(scrollRoot);

    const mask = new Graphics();
    mask.rect(0, 0, innerW, scrollH).fill(0xffffff);
    scrollRoot.addChild(mask);
    scrollRoot.mask = mask;

    const body = new Container();
    scrollRoot.addChild(body);

    let yy = 0;
    const descFs = Math.round(18 * LAYOUT_SCALE);
    const descLh = Math.round(26 * LAYOUT_SCALE);
    const labelFs = Math.round(20 * LAYOUT_SCALE);

    const basicBlock = new Text({
      text: `${allyBondDisplayName(kind)}：${allyBasicSkillDesc(kind)}`,
      style: {
        fontFamily: FF,
        fontSize: descFs,
        fill: stackSum >= 3 ? BODY : MUTED,
        fontWeight: '600',
        wordWrap: true,
        wordWrapWidth: innerW,
        lineHeight: descLh,
        breakWords: true,
      },
    });
    basicBlock.position.set(0, yy);
    body.addChild(basicBlock);
    yy += basicBlock.height + Math.round(12 * LAYOUT_SCALE);

    const { root: stripRoot, height: stripH } = createBondStackStatusLine(
      stackSum,
      innerW,
      Math.round(19 * LAYOUT_SCALE),
    );
    stripRoot.position.set(0, yy);
    body.addChild(stripRoot);
    yy += stripH + Math.round(16 * LAYOUT_SCALE);

    for (const tier of BOND_TIER_THRESHOLDS) {
      const active = bondTierActive(stackSum, tier);
      const redTier = tier === 21;
      const lab = new Text({
        text: bondTierChipLabel(tier),
        style: {
          fontFamily: FF,
          fontSize: labelFs,
          fill: !active ? MUTED : redTier ? BOND_RED : GOLD,
          fontWeight: '800',
        },
      });
      lab.position.set(0, yy);
      body.addChild(lab);
      yy += lab.height + Math.round(4 * LAYOUT_SCALE);

      const desc = new Text({
        text: bondTierFullDesc(kind, tier),
        style: {
          fontFamily: FF,
          fontSize: descFs,
          fill: !active ? 0x64748b : redTier ? 0xfca5a5 : BODY,
          wordWrap: true,
          wordWrapWidth: innerW,
          lineHeight: descLh,
          breakWords: true,
        },
      });
      desc.position.set(0, yy);
      body.addChild(desc);
      yy += desc.height + Math.round(14 * LAYOUT_SCALE);
    }

    const bounds = body.getLocalBounds();
    const contentH = bounds.y + bounds.height;
    this.scrollMax = Math.max(0, contentH - scrollH);

    scrollRoot.eventMode = 'static';
    scrollRoot.on('wheel', (e: FederatedWheelEvent) => {
      e.preventDefault();
      let dy = typeof e.deltaY === 'number' ? e.deltaY : 0;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 96;
      this.scrollOffset = Math.max(0, Math.min(this.scrollMax, this.scrollOffset + dy * 0.85));
      body.y = -this.scrollOffset;
    });

    const closeBtn = createStyledGameButton('accent', {
      text: '关闭',
      width: closeW,
      height: closeH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
      onTap: onDismiss,
    });
    closeBtn.position.set(px + (pw - closeW) / 2, closeY);
    this.addChild(closeBtn);
  }
}
