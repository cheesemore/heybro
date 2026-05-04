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
  type BondTierThreshold,
} from '../bondCopy';
import type { AllyClass } from '../types';
import type { RunState } from '../runState';

const GOLD = 0xfbbf24;
const MUTED = 0x64748b;
const BODY = 0xe2e8f0;
const BOND_RED = 0xf87171;
const BOND_RED_MUTED = 0x9f1239;
const TAB_ON = 0x38bdf8;
const TAB_OFF = 0x94a3b8;

/** 判定为滚动后，忽略同一次手势内的档位 chip 误触 */
const SCROLL_SLOP_PX = 12;

type TabId = 'bond' | 'strategy';

export class SynergyOverlay extends Container {
  private tab: TabId = 'bond';
  private readonly body: Container;
  private readonly detailLayer: Container;
  private readonly listLayer: Container;
  private readonly scrollViewport: Container;
  private readonly scrollMaskG: Graphics;
  private readonly tabBond: Container;
  private readonly tabStrat: Container;
  private readonly tabBondG: Graphics;
  private readonly tabStratG: Graphics;
  private readonly tabBondT: Text;
  private readonly tabStratT: Text;
  private detailHead: Text;
  private detailDesc: Text;
  private readonly innerW: number;
  /** 列表区可视高度 */
  private readonly viewportH: number;
  private readonly run: RunState;
  private readonly onDismiss: () => void;

  private scrollY = 0;
  private scrollMax = 0;
  private scrollDragActive = false;
  private scrollDragPointerId: number | null = null;
  private scrollDragStartClientY = 0;
  private scrollDragStartScroll = 0;
  /** 本段 pointer 序列中是否发生过明显垂直滚动 */
  private scrollGestureForTap = false;
  /** 滚动结束后吃掉下一次 chip 的 tap，避免误开详情 */
  private blockNextChipTap = false;
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

    const panel = new Graphics();
    panel.roundRect(0, 0, pw, ph, Math.round(20 * LAYOUT_SCALE)).fill(0x111827);
    panel.stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x334155 });
    panel.position.set(px, py);
    panel.eventMode = 'static';
    panel.on('pointertap', (e) => e.stopPropagation());
    this.addChild(panel);

    const fs = Math.round(24 * LAYOUT_SCALE);
    const fsSmall = Math.round(20 * LAYOUT_SCALE);
    const lh = Math.round(30 * LAYOUT_SCALE);

    const title = new Text({
      text: '羁绊 · 神器 · 策略',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(32 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '700',
      },
    });
    title.position.set(px + Math.round(28 * LAYOUT_SCALE), py + Math.round(22 * LAYOUT_SCALE));
    this.addChild(title);

    const tabY = py + Math.round(72 * LAYOUT_SCALE);
    const tabW = Math.round(200 * LAYOUT_SCALE);
    const tabH = Math.round(48 * LAYOUT_SCALE);
    const tabGap = Math.round(14 * LAYOUT_SCALE);
    const tabX0 = px + Math.round(28 * LAYOUT_SCALE);

    const mk = (x: number, label: string): { wrap: Container; bg: Graphics; lab: Text } => {
      const wrap = new Container();
      wrap.position.set(x, tabY);
      wrap.eventMode = 'static';
      wrap.cursor = 'pointer';
      const bg = new Graphics();
      const lab = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(22 * LAYOUT_SCALE),
          fill: TAB_OFF,
          fontWeight: '600',
        },
      });
      lab.anchor.set(0.5);
      lab.position.set(tabW / 2, tabH / 2);
      wrap.addChild(bg, lab);
      return { wrap, bg, lab };
    };

    const b = mk(tabX0, '羁绊 / 神器');
    const s = mk(tabX0 + tabW + tabGap, '本局策略');
    this.tabBond = b.wrap;
    this.tabBondG = b.bg;
    this.tabBondT = b.lab;
    this.tabStrat = s.wrap;
    this.tabStratG = s.bg;
    this.tabStratT = s.lab;

    this.tabBond.on('pointertap', (e) => {
      e.stopPropagation();
      this.switchTab('bond');
    });
    this.tabStrat.on('pointertap', (e) => {
      e.stopPropagation();
      this.switchTab('strategy');
    });
    this.addChild(this.tabBond, this.tabStrat);

    const bodyTop = tabY + tabH + Math.round(18 * LAYOUT_SCALE);
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
      if (this.detailLayer.visible) return;
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

    const back = new Container();
    back.eventMode = 'static';
    back.cursor = 'pointer';
    const bw = Math.round(120 * LAYOUT_SCALE);
    const bh = Math.round(42 * LAYOUT_SCALE);
    const backG = new Graphics();
    backG.roundRect(0, 0, bw, bh, Math.round(10 * LAYOUT_SCALE)).fill(0x334155);
    back.addChild(backG);
    const backT = new Text({
      text: '← 返回',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '600',
      },
    });
    backT.anchor.set(0.5);
    backT.position.set(bw / 2, bh / 2);
    back.addChild(backT);
    back.position.set(0, 0);
    back.on('pointertap', (e) => {
      e.stopPropagation();
      this.detailLayer.visible = false;
      this.scrollViewport.visible = true;
      this.listLayer.visible = true;
    });
    this.detailLayer.addChild(back);

    this.detailHead = new Text({
      text: '',
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
    this.detailHead.position.set(0, Math.round(52 * LAYOUT_SCALE));
    this.detailLayer.addChild(this.detailHead);

    this.detailDesc = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: fsSmall,
        fill: BODY,
        wordWrap: true,
        wordWrapWidth: this.innerW,
        lineHeight: Math.round(28 * LAYOUT_SCALE),
      },
    });
    this.detailDesc.position.set(0, Math.round(108 * LAYOUT_SCALE));
    this.detailLayer.addChild(this.detailDesc);

    const closeG = new Graphics();
    closeG
      .roundRect(0, 0, closeW, closeH, Math.round(14 * LAYOUT_SCALE))
      .fill(0x2563eb);
    closeG.eventMode = 'static';
    closeG.cursor = 'pointer';
    closeG.position.set(px + (pw - closeW) / 2, closeTopY);
    closeG.on('pointertap', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    this.addChild(closeG);
    const closeT = new Text({
      text: '关 闭',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(24 * LAYOUT_SCALE),
        fill: 0xffffff,
        fontWeight: '600',
      },
    });
    closeT.anchor.set(0.5);
    closeT.position.set(closeG.x + closeW / 2, closeG.y + closeH / 2);
    this.addChild(closeT);

    this.paintTabs(tabW, tabH);
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

  private paintTabs(tabW: number, tabH: number): void {
    const draw = (g: Graphics, on: boolean) => {
      g.clear();
      g.roundRect(0, 0, tabW, tabH, Math.round(12 * LAYOUT_SCALE)).fill(on ? 0x1e3a5f : 0x0f172a);
      g.stroke({
        width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)),
        color: on ? 0x38bdf8 : 0x334155,
      });
    };
    draw(this.tabBondG, this.tab === 'bond');
    draw(this.tabStratG, this.tab === 'strategy');
    this.tabBondT.style.fill = this.tab === 'bond' ? TAB_ON : TAB_OFF;
    this.tabStratT.style.fill = this.tab === 'strategy' ? TAB_ON : TAB_OFF;
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
    this.paintTabs(Math.round(200 * LAYOUT_SCALE), Math.round(48 * LAYOUT_SCALE));
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

  private showTierDetail(kind: AllyClass, tier: BondTierThreshold): void {
    this.listLayer.visible = false;
    this.detailLayer.visible = true;
    this.scrollViewport.visible = false;
    this.detailHead.text = `${allyBondDisplayName(kind)} · ${bondTierChipLabel(tier)}`;
    this.detailDesc.text = bondTierFullDesc(kind, tier);
    const red = tier === 21;
    this.detailHead.style.fill = red ? BOND_RED : GOLD;
    this.detailDesc.style.fill = red ? 0xfca5a5 : BODY;
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

    const stacks = allBondStacks(this.run.board);
    const chipW = Math.round(92 * LAYOUT_SCALE);
    const chipH = Math.round(40 * LAYOUT_SCALE);
    const chipGap = Math.round(8 * LAYOUT_SCALE);

    for (const kind of allAllyClassesOrdered()) {
      const n = stacks[kind];
      const name = allyBondDisplayName(kind);
      const line = new Text({
        text: `${name}　当前层数：${n}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: fsSmall,
          fill: BODY,
          fontWeight: '600',
          wordWrap: true,
          wordWrapWidth: this.innerW,
          lineHeight: lh,
        },
      });
      line.position.set(0, y);
      this.listLayer.addChild(line);
      y += line.height + Math.round(10 * LAYOUT_SCALE);

      const row = new Container();
      row.position.set(0, y);
      let cx = 0;
      let rowH = chipH;
      for (const tier of BOND_TIER_THRESHOLDS) {
        if (cx > 0 && cx + chipW > this.innerW) {
          cx = 0;
          rowH += chipH + chipGap;
        }
        const active = bondTierActive(n, tier);
        const redTier = tier === 21;
        const chip = new Container();
        chip.position.set(cx, rowH - chipH);
        chip.eventMode = 'static';
        chip.cursor = 'pointer';
        const g = new Graphics();
        const fillOn = redTier ? 0x450a0a : 0x422006;
        const strokeOn = redTier ? 0xef4444 : 0xf59e0b;
        g.roundRect(0, 0, chipW, chipH, Math.round(10 * LAYOUT_SCALE)).fill(active ? fillOn : 0x1e293b);
        g.stroke({
          width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)),
          color: active ? strokeOn : 0x334155,
        });
        chip.addChild(g);
        const lab = new Text({
          text: bondTierChipLabel(tier),
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(16 * LAYOUT_SCALE),
            fill: active ? (redTier ? BOND_RED : GOLD) : redTier ? BOND_RED_MUTED : MUTED,
            fontWeight: '700',
          },
        });
        lab.anchor.set(0.5);
        lab.position.set(chipW / 2, chipH / 2);
        chip.addChild(lab);
        const k = kind;
        const ti = tier;
        chip.on('pointertap', (e) => {
          e.stopPropagation();
          if (this.blockNextChipTap) {
            this.blockNextChipTap = false;
            return;
          }
          this.showTierDetail(k, ti);
        });
        row.addChild(chip);
        cx += chipW + chipGap;
      }
      this.listLayer.addChild(row);
      y += rowH + Math.round(20 * LAYOUT_SCALE);
    }

    y += Math.round(8 * LAYOUT_SCALE);
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
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    this.endListScrollDrag();
    super.destroy(options);
  }
}
