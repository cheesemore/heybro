import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { allBondStacks } from '../battleBonds';
import {
  allAllyClassesOrdered,
  allyBondDisplayName,
  ARTIFACT_BATTLE_DESC,
  BOND_TIER_THRESHOLDS,
  bondTierActive,
  bondTierChipLabel,
  bondTierFullDesc,
  allyBasicSkillDesc,
} from '../bondCopy';
import type { AllyClass } from '../types';
import type { RunState } from '../runState';
import { RECRUIT_RULES_OVERLAY_BODY } from '../recruitRulesText';
import { drawGoldenSolidPanel, GOLDEN_PANEL_ACCENT, GOLDEN_PANEL_BODY, GOLDEN_PANEL_MUTED, GOLDEN_PANEL_TITLE } from '../ui/goldenSolidPanel';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { createStyledGameButton, redrawGameButtonFromStyle, type GameButton } from '../ui/gameButtons';

const GOLD = GOLDEN_PANEL_ACCENT;
const MUTED = GOLDEN_PANEL_MUTED;
const BODY = GOLDEN_PANEL_BODY;
const BOND_RED = 0xf87171;
/** 「羁绊N」中 N 为该行职业棋盘总层数：未满 3 灰，3–5 绿，6 及以上蓝 */
const BOND_STACK_GREEN = 0x4ade80;
const BOND_STACK_BLUE = 0x60a5fa;

function bondStackCountLabelFill(stackSum: number): number {
  if (stackSum >= 6) return BOND_STACK_BLUE;
  if (stackSum >= 3) return BOND_STACK_GREEN;
  return MUTED;
}
/** 档位数字已达成 */
const BOND_TIER_BRIGHT = 0xf1f5f9;
/** 档位数字未达成 */
const BOND_TIER_DIM = 0x64748b;
const BOND_TIER_SLASH = 0x475569;

const SCROLL_SLOP_PX = 12;

type TabId = 'bond' | 'artifact' | 'strategy' | 'rules';

export class SynergyOverlay extends Container {
  private tab: TabId = 'bond';
  private readonly body: Container;
  private readonly detailLayer: Container;
  private readonly listLayer: Container;
  private readonly scrollViewport: Container;
  private readonly scrollMaskG: Graphics;
  private readonly tabBond: GameButton;
  private readonly tabArtifact: GameButton;
  private readonly tabStrat: GameButton;
  private readonly tabRules: GameButton;
  private detailHead: Text;
  private readonly detailBody: Container;
  private readonly innerW: number;
  private readonly viewportH: number;
  private readonly run: RunState;
  private readonly onDismiss: () => void;
  private readonly tabW: number;
  private readonly tabH: number;
  private readonly tabGap: number;

  private scrollY = 0;
  private scrollMax = 0;
  private scrollDragActive = false;
  private scrollDragPointerId: number | null = null;
  private scrollDragStartClientY = 0;
  private scrollDragStartScroll = 0;
  private scrollGestureForTap = false;
  private blockNextChipTap = false;
  /** 羁绊详情正文区域滚动（与列表共用 `viewportH` 可视高度） */
  private detailScrollRoot: Container;
  private detailScrollMask: Graphics;
  private detailClipH: number;
  private detailScrollOffset = 0;
  private detailBodyScrollMax = 0;
  private readonly boundDocPointerMove: (e: PointerEvent) => void;
  private readonly boundDocPointerUp: (e: PointerEvent) => void;

  constructor(run: RunState, onDismiss: () => void) {
    super();
    this.run = run;
    this.onDismiss = onDismiss;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.boundDocPointerMove = this.onDocPointerMove.bind(this);
    this.boundDocPointerUp = this.onDocPointerUp.bind(this);

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.78 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.dismiss());
    this.addChild(dim);

    const pw = Math.round(680 * LAYOUT_SCALE);
    const ph = Math.round(1180 * LAYOUT_SCALE);
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;
    this.innerW = pw - Math.round(56 * LAYOUT_SCALE);

    const closeH = Math.round(56 * LAYOUT_SCALE);
    const closeW = Math.round(240 * LAYOUT_SCALE);
    const closeTopY = py + ph - closeH - Math.round(22 * LAYOUT_SCALE);

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const fs = Math.round(24 * LAYOUT_SCALE);
    const fsSmall = Math.round(20 * LAYOUT_SCALE);
    const lh = Math.round(30 * LAYOUT_SCALE);

    const title = new Text({
      text: '羁绊 · 神器 · 策略 · 规则',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(32 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '700',
      },
    });
    title.position.set(px + Math.round(28 * LAYOUT_SCALE), py + Math.round(22 * LAYOUT_SCALE));
    this.addChild(title);

    const tabY = py + Math.round(72 * LAYOUT_SCALE);
    this.tabGap = Math.round(6 * LAYOUT_SCALE);
    this.tabW = Math.max(Math.round(88 * LAYOUT_SCALE), Math.floor((this.innerW - 3 * this.tabGap) / 4));
    this.tabH = Math.round(48 * LAYOUT_SCALE);
    const tabX0 = px + Math.round(28 * LAYOUT_SCALE);
    const tabFs = Math.round(18 * LAYOUT_SCALE);

    this.tabBond = createStyledGameButton('synergyTabOn', {
      text: '羁绊',
      width: this.tabW,
      height: this.tabH,
      fontSize: tabFs,
    });
    this.tabBond.position.set(tabX0, tabY);
    this.tabBond.on('pointertap', (e) => {
      e.stopPropagation();
      this.switchTab('bond');
    });

    this.tabArtifact = createStyledGameButton('synergyTabOff', {
      text: '神器',
      width: this.tabW,
      height: this.tabH,
      fontSize: tabFs,
    });
    this.tabArtifact.position.set(tabX0 + this.tabW + this.tabGap, tabY);
    this.tabArtifact.on('pointertap', (e) => {
      e.stopPropagation();
      this.switchTab('artifact');
    });

    this.tabStrat = createStyledGameButton('synergyTabOff', {
      text: '策略',
      width: this.tabW,
      height: this.tabH,
      fontSize: tabFs,
    });
    this.tabStrat.position.set(tabX0 + (this.tabW + this.tabGap) * 2, tabY);
    this.tabStrat.on('pointertap', (e) => {
      e.stopPropagation();
      this.switchTab('strategy');
    });

    this.tabRules = createStyledGameButton('synergyTabOff', {
      text: '规则',
      width: this.tabW,
      height: this.tabH,
      fontSize: tabFs,
    });
    this.tabRules.position.set(tabX0 + (this.tabW + this.tabGap) * 3, tabY);
    this.tabRules.on('pointertap', (e) => {
      e.stopPropagation();
      this.switchTab('rules');
    });
    this.addChild(this.tabBond, this.tabArtifact, this.tabStrat, this.tabRules);

    const bodyTop = tabY + this.tabH + Math.round(18 * LAYOUT_SCALE);
    this.viewportH = Math.max(
      Math.round(220 * LAYOUT_SCALE),
      closeTopY - bodyTop - Math.round(14 * LAYOUT_SCALE),
    );

    this.body = new Container();
    this.body.position.set(px + Math.round(24 * LAYOUT_SCALE), bodyTop);
    this.body.eventMode = 'static';
    this.body.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.detailLayer.visible) return;
      if (!this.scrollViewport.visible) return;
      const lp = e.getLocalPosition(this.scrollViewport);
      if (lp.x < 0 || lp.x > this.innerW || lp.y < 0 || lp.y > this.viewportH) return;
      this.beginListScrollDrag(e);
    });
    this.body.on('wheel', (e: FederatedWheelEvent) => {
      if (this.detailLayer.visible) {
        const lp = e.getLocalPosition(this.detailScrollRoot);
        if (lp.x < 0 || lp.x > this.innerW || lp.y < 0 || lp.y > this.detailClipH) return;
        e.preventDefault();
        const step = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
        this.setDetailScrollOffset(this.detailScrollOffset + step);
        return;
      }
      if (!this.scrollViewport.visible) return;
      const lp = e.getLocalPosition(this.scrollViewport);
      if (lp.x < 0 || lp.x > this.innerW || lp.y < 0 || lp.y > this.viewportH) return;
      e.preventDefault();
      const step = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      this.setScrollY(this.scrollY + step);
    });
    this.addChild(this.body);

    this.scrollMaskG = new Graphics();
    this.scrollMaskG.rect(0, 0, this.innerW, this.viewportH).fill({ color: 0xffffff });

    this.scrollViewport = new Container();
    this.scrollViewport.eventMode = 'static';
    this.scrollViewport.cursor = 'grab';
    this.scrollViewport.hitArea = new Rectangle(0, 0, this.innerW, this.viewportH);
    this.scrollViewport.addChild(this.scrollMaskG);
    this.scrollViewport.mask = this.scrollMaskG;
    this.listLayer = new Container();
    this.scrollViewport.addChild(this.listLayer);
    this.body.addChild(this.scrollViewport);

    this.detailLayer = new Container();
    this.detailLayer.visible = false;
    this.body.addChild(this.detailLayer);

    const bw = Math.round(120 * LAYOUT_SCALE);
    const bh = Math.round(42 * LAYOUT_SCALE);
    const backBtn = createStyledGameButton('classic', {
      text: '← 返回',
      width: bw,
      height: bh,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    backBtn.position.set(0, 0);
    backBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.detailScrollOffset = 0;
      this.detailBody.y = 0;
      this.detailLayer.visible = false;
      this.scrollViewport.visible = true;
      this.listLayer.visible = true;
    });
    this.detailLayer.addChild(backBtn);

    this.detailHead = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: fs,
        fill: GOLD,
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: this.innerW,
        lineHeight: lh,
        breakWords: true,
      },
    });
    this.detailHead.position.set(0, Math.round(52 * LAYOUT_SCALE));
    this.detailLayer.addChild(this.detailHead);

    this.detailScrollRoot = new Container();
    this.detailScrollRoot.eventMode = 'static';
    this.detailClipH = Math.max(
      Math.round(120 * LAYOUT_SCALE),
      this.viewportH - Math.round(100 * LAYOUT_SCALE) - Math.round(6 * LAYOUT_SCALE),
    );
    this.detailScrollRoot.position.set(0, Math.round(100 * LAYOUT_SCALE));
    this.detailScrollRoot.hitArea = new Rectangle(0, 0, this.innerW, this.detailClipH);
    this.detailScrollMask = new Graphics();
    this.detailScrollMask.rect(0, 0, this.innerW, this.detailClipH).fill({ color: 0xffffff });
    this.detailScrollRoot.mask = this.detailScrollMask;
    this.detailScrollRoot.addChild(this.detailScrollMask);

    this.detailBody = new Container();
    this.detailScrollRoot.addChild(this.detailBody);
    this.detailLayer.addChild(this.detailScrollRoot);

    const closeBtn = createStyledGameButton('classic', {
      text: '关 闭',
      width: closeW,
      height: closeH,
      fontSize: Math.round(24 * LAYOUT_SCALE),
    });
    closeBtn.position.set(px + (pw - closeW) / 2, closeTopY);
    closeBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    this.addChild(closeBtn);

    attachScreenDebugLabel(this, 'SynergyOverlay');

    this.paintTabs();
    this.fillList(fs, fsSmall, lh);
  }

  private beginListScrollDrag(e: FederatedPointerEvent): void {
    if (this.scrollMax <= 0) return;
    this.endListScrollDrag();
    this.scrollDragActive = true;
    this.scrollGestureForTap = false;
    this.scrollDragPointerId = e.pointerId;
    this.scrollDragStartClientY = e.client.y;
    this.scrollDragStartScroll = this.scrollY;
    document.addEventListener('pointermove', this.boundDocPointerMove, { passive: true });
    document.addEventListener('pointerup', this.boundDocPointerUp, { passive: true });
    document.addEventListener('pointercancel', this.boundDocPointerUp, { passive: true });
  }

  private onDocPointerMove(e: PointerEvent): void {
    if (!this.scrollDragActive || e.pointerId !== this.scrollDragPointerId) return;
    const dy = e.clientY - this.scrollDragStartClientY;
    if (Math.abs(dy) > SCROLL_SLOP_PX) this.scrollGestureForTap = true;
    this.setScrollY(this.scrollDragStartScroll - dy);
  }

  private onDocPointerUp(e: PointerEvent): void {
    if (!this.scrollDragActive || e.pointerId !== this.scrollDragPointerId) return;
    if (this.scrollGestureForTap) this.blockNextChipTap = true;
    this.scrollGestureForTap = false;
    this.endListScrollDrag();
  }

  private endListScrollDrag(): void {
    this.scrollDragActive = false;
    this.scrollDragPointerId = null;
    document.removeEventListener('pointermove', this.boundDocPointerMove);
    document.removeEventListener('pointerup', this.boundDocPointerUp);
    document.removeEventListener('pointercancel', this.boundDocPointerUp);
  }

  private setScrollY(y: number): void {
    this.scrollY = Math.max(0, Math.min(this.scrollMax, y));
    this.listLayer.position.y = -this.scrollY;
  }

  private updateScrollBounds(contentHeight: number): void {
    this.scrollMax = Math.max(0, contentHeight - this.viewportH);
    this.scrollViewport.cursor = this.scrollMax > 0 ? 'grab' : 'default';
    if (this.scrollY > this.scrollMax) this.setScrollY(this.scrollMax);
    else this.listLayer.position.y = -this.scrollY;
  }

  private paintTabs(): void {
    const fs = Math.round(18 * LAYOUT_SCALE);
    const paint = (btn: GameButton, id: TabId, label: string): void => {
      redrawGameButtonFromStyle(btn, this.tab === id ? 'synergyTabOn' : 'synergyTabOff', {
        text: label,
        width: this.tabW,
        height: this.tabH,
        fontSize: fs,
      });
    };
    paint(this.tabBond, 'bond', '羁绊');
    paint(this.tabArtifact, 'artifact', '神器');
    paint(this.tabStrat, 'strategy', '策略');
    paint(this.tabRules, 'rules', '规则');
  }

  private switchTab(id: TabId): void {
    if (this.tab === id) return;
    this.tab = id;
    this.detailLayer.visible = false;
    this.scrollViewport.visible = true;
    this.scrollY = 0;
    this.listLayer.position.y = 0;
    this.scrollGestureForTap = false;
    this.blockNextChipTap = false;
    this.paintTabs();
    const fs = Math.round(24 * LAYOUT_SCALE);
    const fsSmall = Math.round(20 * LAYOUT_SCALE);
    const lh = Math.round(30 * LAYOUT_SCALE);
    this.fillList(fs, fsSmall, lh);
  }

  private dismiss(): void {
    this.endListScrollDrag();
    this.onDismiss();
    this.destroy({ children: true });
  }

  /** 「羁绊N」+ 档位行：N 为当前职业总层数；未满 3 全灰；3–5 绿；6+ 蓝；过宽自动换行 */
  private createBondStackStatusLine(n: number, maxW: number, fontSize: number): { root: Container; height: number } {
    const root = new Container();
    const fontFamily = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';
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
      if (x > 0 && x + t.width > maxW) {
        newLine();
      }
      t.position.set(x, y);
      root.addChild(t);
      x += t.width;
      rowH = Math.max(rowH, t.height);
    };

    const bondTx = new Text({
      text: `羁绊${n}`,
      style: {
        fontFamily,
        fontSize,
        fontWeight: '800',
        fill: bondStackCountLabelFill(n),
      },
    });
    place(bondTx);
    x += gapAfterBond;

    for (let i = 0; i < BOND_TIER_THRESHOLDS.length; i++) {
      if (i > 0) {
        const slash = new Text({
          text: '/',
          style: { fontFamily, fontSize, fontWeight: '600', fill: BOND_TIER_SLASH },
        });
        place(slash);
      }
      const tier = BOND_TIER_THRESHOLDS[i]!;
      const bright = n >= tier;
      const num = new Text({
        text: String(tier),
        style: {
          fontFamily,
          fontSize,
          fontWeight: '800',
          fill: bright ? BOND_TIER_BRIGHT : BOND_TIER_DIM,
        },
      });
      place(num);
    }

    return { root, height: y + rowH };
  }

  /** 羁绊列表行：左侧「羁绊N + 档位」，右侧灰色「(点击查看全部信息)」与档位行垂直居中 */
  private createBondListStatusRowWithRightHint(
    n: number,
    contentMaxW: number,
    stripFs: number,
    hintFs: number,
  ): { root: Container; height: number } {
    const fontHint = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';
    const hint = new Text({
      text: '(点击查看全部信息)',
      style: {
        fontFamily: fontHint,
        fontSize: hintFs,
        fill: MUTED,
        fontWeight: '500',
      },
    });
    const gap = Math.round(8 * LAYOUT_SCALE);
    const hintW = hint.width;
    const stripMaxW = Math.max(Math.round(120 * LAYOUT_SCALE), contentMaxW - gap - hintW);
    const { root: stripRoot, height: stripH } = this.createBondStackStatusLine(n, stripMaxW, stripFs);
    const statusRoot = new Container();
    statusRoot.addChild(stripRoot);
    const hintY = Math.max(0, (stripH - hint.height) / 2);
    hint.position.set(contentMaxW - hintW, hintY);
    statusRoot.addChild(hint);
    const height = Math.max(stripH, hint.height);
    return { root: statusRoot, height };
  }

  private syncDetailScrollChrome(): void {
    const gap = Math.round(8 * LAYOUT_SCALE);
    const footPad = Math.round(4 * LAYOUT_SCALE);
    this.detailScrollRoot.position.y = this.detailHead.position.y + this.detailHead.height + gap;
    this.detailClipH = Math.max(
      Math.round(96 * LAYOUT_SCALE),
      this.viewportH - this.detailScrollRoot.position.y - footPad,
    );
    this.detailScrollRoot.hitArea = new Rectangle(0, 0, this.innerW, this.detailClipH);
    this.detailScrollMask.clear();
    this.detailScrollMask.rect(0, 0, this.innerW, this.detailClipH).fill({ color: 0xffffff });
  }

  private setDetailScrollOffset(o: number): void {
    this.detailScrollOffset = Math.max(0, Math.min(this.detailBodyScrollMax, o));
    this.detailBody.y = -this.detailScrollOffset;
  }

  private layoutDetailScrollAfterContent(): void {
    const b = this.detailBody.getLocalBounds();
    const contentH = b.y + b.height;
    this.detailBodyScrollMax = Math.max(0, contentH - this.detailClipH);
    if (this.detailScrollOffset > this.detailBodyScrollMax) {
      this.setDetailScrollOffset(this.detailBodyScrollMax);
    }
  }

  private showBondClassDetail(kind: AllyClass): void {
    this.listLayer.visible = false;
    this.detailLayer.visible = true;
    this.scrollViewport.visible = false;
    const n = allBondStacks(this.run.board)[kind];
    this.detailHead.text = `${allyBondDisplayName(kind)} · 羁绊一览`;
    this.detailHead.style.fill = GOLD;
    this.syncDetailScrollChrome();

    this.detailBody.removeChildren();
    let yy = 0;
    const labelFs = Math.round(21 * LAYOUT_SCALE);
    const descFs = Math.round(19 * LAYOUT_SCALE);
    const descLh = Math.round(28 * LAYOUT_SCALE);

    const basicBlock = new Text({
      text: `${allyBondDisplayName(kind)}：${allyBasicSkillDesc(kind)}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: descFs,
        fill: n >= 3 ? BODY : MUTED,
        fontWeight: '600',
        wordWrap: true,
        wordWrapWidth: this.innerW,
        lineHeight: descLh,
        breakWords: true,
      },
    });
    basicBlock.position.set(0, yy);
    this.detailBody.addChild(basicBlock);
    yy += basicBlock.height + Math.round(12 * LAYOUT_SCALE);

    const stripFs = Math.round(20 * LAYOUT_SCALE);
    const { root: stripRoot, height: stripH } = this.createBondStackStatusLine(n, this.innerW, stripFs);
    stripRoot.position.set(0, yy);
    this.detailBody.addChild(stripRoot);
    yy += stripH + Math.round(16 * LAYOUT_SCALE);

    for (const tier of BOND_TIER_THRESHOLDS) {
      const active = bondTierActive(n, tier);
      const redTier = tier === 21;
      const labelFill = !active ? MUTED : redTier ? BOND_RED : GOLD;
      const descFill = !active ? 0x64748b : redTier ? 0xfca5a5 : BODY;

      const lab = new Text({
        text: bondTierChipLabel(tier),
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
          fontSize: labelFs,
          fill: labelFill,
          fontWeight: '800',
        },
      });
      lab.position.set(0, yy);
      this.detailBody.addChild(lab);
      yy += lab.height + Math.round(4 * LAYOUT_SCALE);

      const desc = new Text({
        text: bondTierFullDesc(kind, tier),
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
          fontSize: descFs,
          fill: descFill,
          wordWrap: true,
          wordWrapWidth: this.innerW,
          lineHeight: descLh,
          breakWords: true,
        },
      });
      desc.position.set(0, yy);
      this.detailBody.addChild(desc);
      yy += desc.height + Math.round(14 * LAYOUT_SCALE);
    }

    this.setDetailScrollOffset(0);
    this.layoutDetailScrollAfterContent();
  }

  private fillList(fs: number, fsSmall: number, lh: number): void {
    this.endListScrollDrag();
    this.listLayer.removeChildren();
    this.listLayer.visible = true;
    this.listLayer.position.set(0, 0);
    this.scrollY = 0;
    this.scrollGestureForTap = false;
    this.blockNextChipTap = false;
    let y = 0;

    if (this.tab === 'strategy') {
      const picks = this.run.strategyPicks;
      if (!picks.length) {
        const t = new Text({
          text: '本局尚未在章节抉择中选择策略。\n（在 1-3、2-3、3-3 的「策略抉择」三选一完成后，可在此查看已选说明。）',
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: fsSmall,
            fill: MUTED,
            wordWrap: true,
            wordWrapWidth: this.innerW,
            lineHeight: lh,
          },
        });
        t.position.set(0, y);
        this.listLayer.addChild(t);
        this.updateScrollBounds(y + t.height);
        return;
      }
      for (const p of picks) {
        const title = new Text({
          text: p.title,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: fs,
            fill: GOLD,
            fontWeight: '700',
            wordWrap: true,
            wordWrapWidth: this.innerW,
            lineHeight: lh,
          },
        });
        title.position.set(0, y);
        this.listLayer.addChild(title);
        y += title.height + Math.round(8 * LAYOUT_SCALE);
        const body = new Text({
          text: p.desc,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: fsSmall,
            fill: BODY,
            wordWrap: true,
            wordWrapWidth: this.innerW,
            lineHeight: Math.round(28 * LAYOUT_SCALE),
          },
        });
        body.position.set(0, y);
        this.listLayer.addChild(body);
        y += body.height + Math.round(22 * LAYOUT_SCALE);
      }
      this.updateScrollBounds(y);
      return;
    }

    if (this.tab === 'rules') {
      const h1 = new Text({
        text: '招募定价与备战',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: fs,
          fill: GOLD,
          fontWeight: '700',
          wordWrap: true,
          wordWrapWidth: this.innerW,
        },
      });
      h1.position.set(0, y);
      this.listLayer.addChild(h1);
      y += h1.height + Math.round(12 * LAYOUT_SCALE);
      const body = new Text({
        text: RECRUIT_RULES_OVERLAY_BODY,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: fsSmall,
          fill: BODY,
          wordWrap: true,
          wordWrapWidth: this.innerW,
          lineHeight: Math.round(28 * LAYOUT_SCALE),
        },
      });
      body.position.set(0, y);
      this.listLayer.addChild(body);
      y += body.height + Math.round(16 * LAYOUT_SCALE);
      const h2 = new Text({
        text: '羁绊与策略',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: fs,
          fill: GOLD,
          fontWeight: '700',
        },
      });
      h2.position.set(0, y);
      this.listLayer.addChild(h2);
      y += h2.height + Math.round(8 * LAYOUT_SCALE);
      const tip = new Text({
        text: '「羁绊」页：职业名与基础技能会自动换行。下一行左侧「羁绊N」为本行职业备战总层数：未满 3 层时整段灰色；至少 3 层且不足 6 层时为绿色；至少 6 层时为蓝色；其后 3/6/10/15/21 为档位阈值，已达成高亮、未达成灰色。该行最右侧灰色小字（点击查看全部信息）为提示；点本行任意处进入详情（可滚轮翻阅）。「策略」页展示本局已选章节策略。',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: fsSmall,
          fill: MUTED,
          wordWrap: true,
          wordWrapWidth: this.innerW,
          lineHeight: Math.round(28 * LAYOUT_SCALE),
        },
      });
      tip.position.set(0, y);
      this.listLayer.addChild(tip);
      y += tip.height;
      this.updateScrollBounds(y);
      return;
    }

    if (this.tab === 'artifact') {
      const artHead = new Text({
        text: '神器（备战九宫一格，与兵种互斥，可拖动换位）',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: fs,
          fill: 0xc7d2fe,
          fontWeight: '700',
          wordWrap: true,
          wordWrapWidth: this.innerW,
        },
      });
      artHead.position.set(0, y);
      this.listLayer.addChild(artHead);
      y += artHead.height + Math.round(10 * LAYOUT_SCALE);

      let anyArt = false;
      for (let i = 0; i < 9; i++) {
        const k = this.run.artifactBySlot[i];
        if (!k) continue;
        anyArt = true;
        const t = new Text({
          text: `格子 ${i + 1}：${ARTIFACT_BATTLE_DESC[k]}`,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: fsSmall,
            fill: BODY,
            wordWrap: true,
            wordWrapWidth: this.innerW,
            lineHeight: Math.round(28 * LAYOUT_SCALE),
          },
        });
        t.position.set(0, y);
        this.listLayer.addChild(t);
        y += t.height + Math.round(8 * LAYOUT_SCALE);
      }
      if (!anyArt) {
        const t = new Text({
          text: '当前未摆放神器。',
          style: { fontFamily: 'system-ui, sans-serif', fontSize: fsSmall, fill: MUTED },
        });
        t.position.set(0, y);
        this.listLayer.addChild(t);
        y += t.height;
      }
      this.updateScrollBounds(y);
      return;
    }

    const stacks = allBondStacks(this.run.board);
    const rowPadX = Math.round(8 * LAYOUT_SCALE);
    const rowPadY = Math.round(10 * LAYOUT_SCALE);
    const stripFs = Math.round(19 * LAYOUT_SCALE);
    const hintFs = Math.round(15 * LAYOUT_SCALE);
    for (const kind of allAllyClassesOrdered()) {
      const n = stacks[kind];
      const name = allyBondDisplayName(kind);
      const row = new Container();
      row.eventMode = 'static';
      row.cursor = 'pointer';

      const skillText = new Text({
        text: `${name}：${allyBasicSkillDesc(kind)}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
          fontSize: fsSmall,
          fill: n >= 3 ? BODY : MUTED,
          fontWeight: '600',
          wordWrap: true,
          wordWrapWidth: this.innerW - rowPadX * 2,
          lineHeight: lh,
          breakWords: true,
        },
      });
      skillText.position.set(rowPadX, rowPadY);

      const stripTop = rowPadY + skillText.height + Math.round(8 * LAYOUT_SCALE);
      const contentMaxW = this.innerW - rowPadX * 2;
      const { root: statusRow, height: statusH } = this.createBondListStatusRowWithRightHint(
        n,
        contentMaxW,
        stripFs,
        hintFs,
      );
      statusRow.position.set(rowPadX, stripTop);

      const rowH = stripTop + statusH + rowPadY;
      const hit = new Graphics();
      hit.rect(0, 0, this.innerW, rowH).fill({ color: 0xffffff, alpha: n > 0 ? 0.06 : 0.04 });
      row.addChild(hit);
      row.addChild(skillText);
      row.addChild(statusRow);
      row.position.set(0, y);
      const kk = kind;
      row.on('pointertap', (e) => {
        e.stopPropagation();
        if (this.blockNextChipTap) {
          this.blockNextChipTap = false;
          return;
        }
        this.showBondClassDetail(kk);
      });
      this.listLayer.addChild(row);
      y += rowH + Math.round(12 * LAYOUT_SCALE);
    }

    this.updateScrollBounds(y);
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    this.endListScrollDrag();
    super.destroy(options);
  }
}
