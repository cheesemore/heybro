import type { Application, FederatedPointerEvent } from 'pixi.js';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  LAYOUT_SCALE,
  ROGUE_PICK_AFTER_FIRST_COST,
  ROGUE_REFRESH_TRIO_COST,
} from '../constants';
import { allBondStacks } from '../battleBonds';
import { ALLY_CLASSES } from '../constants';
import { applyPick, boardHasAnyUnit, randomThreeFromFive } from '../draftLogic';
import { roguePickCostAfterFirst } from '../strategyApply';
import type { ArtifactKind } from '../strategyTypes';
import { ROUNDS } from '../roundConfig';
import { ALLY_DEFS } from '../unitDefs';
import type { AllyClass } from '../types';
import type { RunState } from '../runState';
import { createAllyPortraitGraphic } from '../battleVisuals';
import { SynergyOverlay } from './SynergyOverlay';

const PAD_X = Math.round(20 * LAYOUT_SCALE);
const HEADER_Y = Math.round(20 * LAYOUT_SCALE);
const TRIO_Y = Math.round(248 * LAYOUT_SCALE);
const CARD_GAP = Math.round(14 * LAYOUT_SCALE);

function artifactMark(k: ArtifactKind): string {
  switch (k) {
    case 'holy_grail':
      return '圣';
    case 'shelter':
      return '庇';
    case 'cross_star':
      return '十';
    case 'revenge_spirit':
      return '仇';
    default:
      return '?';
  }
}

type DragMode = 'unit' | 'artifact' | null;

/** 羁绊档位：0 无，1≥3，2≥6，3≥9，4≥12 */
function bondTierIndex(totalStacks: number): number {
  if (totalStacks >= 12) return 4;
  if (totalStacks >= 9) return 3;
  if (totalStacks >= 6) return 2;
  if (totalStacks >= 3) return 1;
  return 0;
}

/** 备战格内兵种名颜色：按全棋盘该职业层数总和 */
function bondNameFill(totalStacks: number): number {
  if (totalStacks >= 12) return 0xf97316;
  if (totalStacks >= 9) return 0xc084fc;
  if (totalStacks >= 6) return 0x60a5fa;
  if (totalStacks >= 3) return 0x4ade80;
  return 0xe2e8f0;
}

export class DraftScreen extends Container {
  private readonly app: Application;
  private readonly run: RunState;
  private readonly onFinished: () => void;
  private choices: AllyClass[] = randomThreeFromFive();
  private picksThisRound = 0;
  private dragMode: DragMode = null;
  private dragFromSlot: number | null = null;
  private tip: Text;
  private goldText: Text;
  private pickHint: Text;
  private bondBtnRoot: Container | null = null;
  /** 上一帧各职业棋盘层数，用于检测羁绊档位上升 */
  private prevBondStacks: Record<AllyClass, number> | null = null;

  private readonly onDocPointerUp = (ev: PointerEvent): void => {
    const j = this.hitSlotFromClient(ev.clientX, ev.clientY);
    if (this.dragMode === 'unit' && this.dragFromSlot !== null) {
      if (j !== null && j !== this.dragFromSlot) {
        const a = this.run.board[this.dragFromSlot];
        const b = this.run.board[j];
        this.run.board[this.dragFromSlot] = b;
        this.run.board[j] = a;
      }
    } else if (this.dragMode === 'artifact' && this.dragFromSlot !== null) {
      if (j !== null && j !== this.dragFromSlot) {
        const a = this.run.artifactBySlot[this.dragFromSlot];
        const b = this.run.artifactBySlot[j];
        this.run.artifactBySlot[this.dragFromSlot] = b;
        this.run.artifactBySlot[j] = a;
      }
    }
    this.dragMode = null;
    this.dragFromSlot = null;
    this.drawBoard();
  };

  constructor(app: Application, run: RunState, onFinished: () => void) {
    super();
    this.app = app;
    this.run = run;
    this.onFinished = onFinished;

    const deepBg = new Graphics();
    deepBg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x030712);
    this.addChild(deepBg);

    const stars = new Graphics();
    for (let i = 0; i < 56; i++) {
      stars
        .circle(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, Math.random() * 1.5 + 0.2)
        .fill({ color: 0xe2e8f0, alpha: 0.035 + Math.random() * 0.08 });
    }
    this.addChild(stars);

    const band = new Graphics();
    band
      .roundRect(PAD_X, Math.round(72 * LAYOUT_SCALE), GAME_WIDTH - PAD_X * 2, Math.round(168 * LAYOUT_SCALE), Math.round(16 * LAYOUT_SCALE))
      .fill({ color: 0x111827, alpha: 0.85 });
    this.addChild(band);

    const meta = ROUNDS[this.run.currentRoundIndex]!;
    const header = new Text({
      text: `回合 ${meta.label} · 肉鸽选牌`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(38 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '700',
      },
    });
    header.position.set(PAD_X, HEADER_Y);
    this.addChild(header);

    const bondW = Math.round(188 * LAYOUT_SCALE);
    const bondH = Math.round(46 * LAYOUT_SCALE);
    const bondBtn = new Container();
    bondBtn.eventMode = 'static';
    bondBtn.cursor = 'pointer';
    bondBtn.position.set(GAME_WIDTH - PAD_X - bondW, HEADER_Y);
    const bondBg = new Graphics();
    bondBg
      .roundRect(0, 0, bondW, bondH, Math.round(12 * LAYOUT_SCALE))
      .fill(0x1e3a5f)
      .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x38bdf8 });
    bondBtn.addChild(bondBg);
    const bondLab = new Text({
      text: '羁绊 / 策略',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xe0f2fe,
        fontWeight: '600',
      },
    });
    bondLab.anchor.set(0.5);
    bondLab.position.set(bondW / 2, bondH / 2);
    bondBtn.addChild(bondLab);
    bondBtn.on('pointertap', (e) => {
      e.stopPropagation();
      const ov = new SynergyOverlay(this.run, () => {
        this.removeChild(ov);
        ov.destroy({ children: true });
      });
      this.addChild(ov);
    });
    this.addChild(bondBtn);
    this.bondBtnRoot = bondBtn;

    this.goldText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(30 * LAYOUT_SCALE),
        fill: 0xfbbf24,
      },
    });
    this.goldText.position.set(PAD_X, Math.round(82 * LAYOUT_SCALE));
    this.addChild(this.goldText);

    const rule = new Text({
      text: `上方三选一：5 兵种随机 3 张，点 1 张加入备战。\n首次选牌免费；之后每次 ${ROGUE_PICK_AFTER_FIRST_COST} 金。刷新三选一 ${ROGUE_REFRESH_TRIO_COST} 金。`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        lineHeight: Math.round(30 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - PAD_X * 2,
      },
    });
    rule.position.set(PAD_X, Math.round(118 * LAYOUT_SCALE));
    this.addChild(rule);

    this.pickHint = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(24 * LAYOUT_SCALE),
        fill: 0xbae6fd,
      },
    });
    this.pickHint.position.set(PAD_X, Math.round(200 * LAYOUT_SCALE));
    this.addChild(this.pickHint);

    const boardBand = new Graphics();
    boardBand
      .roundRect(
        PAD_X,
        Math.round(556 * LAYOUT_SCALE),
        GAME_WIDTH - PAD_X * 2,
        Math.round(418 * LAYOUT_SCALE),
        Math.round(16 * LAYOUT_SCALE),
      )
      .fill({ color: 0x0b1220, alpha: 0.75 })
      .stroke({ width: Math.max(1, Math.round(1 * LAYOUT_SCALE)), color: 0x1e293b });
    this.addChild(boardBand);

    const boardTitle = new Text({
      text: '备战九宫 · 拖动有兵格子与其它格换位；左上角紫圈为神器，点按紫圈可拖动神器换位（影响战斗加成）',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0xcbd5e1,
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - PAD_X * 2,
      },
    });
    boardTitle.position.set(PAD_X, Math.round(568 * LAYOUT_SCALE));
    this.addChild(boardTitle);

    this.tip = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xfca5a5,
      },
    });
    this.tip.position.set(PAD_X, Math.round(982 * LAYOUT_SCALE));
    this.addChild(this.tip);

    this.refreshHud();
    this.drawTrio();
    this.drawBoard();
    this.drawControls();
  }

  override destroy(): void {
    document.removeEventListener('pointerup', this.onDocPointerUp);
    super.destroy({ children: true });
  }

  private cardMetrics(): { cardW: number; cardH: number; originX: number } {
    const inner = GAME_WIDTH - PAD_X * 2 - CARD_GAP * 2;
    const cardW = Math.floor(inner / 3);
    const cardH = Math.round(292 * LAYOUT_SCALE);
    const originX = PAD_X + (GAME_WIDTH - PAD_X * 2 - (cardW * 3 + CARD_GAP * 2)) / 2;
    return { cardW, cardH, originX };
  }

  private boardSlotRect(i: number): { x: number; y: number; w: number; h: number } {
    const cell = Math.round(116 * LAYOUT_SCALE);
    const gap = Math.round(14 * LAYOUT_SCALE);
    const gridW = cell * 3 + gap * 2;
    const originX = PAD_X + (GAME_WIDTH - PAD_X * 2 - gridW) / 2;
    const originY = Math.round(612 * LAYOUT_SCALE);
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      x: originX + col * (cell + gap),
      y: originY + row * (cell + gap),
      w: cell,
      h: cell,
    };
  }

  private hitSlotFromClient(clientX: number, clientY: number): number | null {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const lx = ((clientX - r.left) / r.width) * GAME_WIDTH;
    const ly = ((clientY - r.top) / r.height) * GAME_HEIGHT;
    for (let i = 0; i < 9; i++) {
      const b = this.boardSlotRect(i);
      if (lx >= b.x && lx < b.x + b.w && ly >= b.y && ly < b.y + b.h) return i;
    }
    return null;
  }

  private refreshHud(): void {
    this.goldText.text = `金币：${this.run.gold}`;
    if (this.picksThisRound === 0) {
      this.pickHint.text = `本轮已选 0 次 · 首次选牌免费（折扣兵种后续更便宜）`;
    } else {
      const c0 = roguePickCostAfterFirst(this.run, this.choices[0]!);
      const c1 = roguePickCostAfterFirst(this.run, this.choices[1]!);
      const c2 = roguePickCostAfterFirst(this.run, this.choices[2]!);
      this.pickHint.text = `本轮已选 ${this.picksThisRound} 次 · 当前三张费用：${c0} / ${c1} / ${c2} 金`;
    }
  }

  private rollChoices(): void {
    this.choices = randomThreeFromFive();
  }

  private drawTrio(): void {
    for (const c of [...this.children]) {
      if ((c as { userData?: string }).userData === 'trio-cell') c.destroy();
    }
    const { cardW, cardH, originX } = this.cardMetrics();
    const y = TRIO_Y;
    for (let i = 0; i < 3; i++) {
      const kind = this.choices[i]!;
      const x = originX + i * (cardW + CARD_GAP);
      const def = ALLY_DEFS[kind];
      const card = new Container();
      card.position.set(x, y);
      (card as Container & { userData?: string }).userData = 'trio-cell';
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.hitArea = new Rectangle(0, 0, cardW, cardH);

      const bg = new Graphics();
      bg.roundRect(0, 0, cardW, cardH, Math.round(18 * LAYOUT_SCALE))
        .fill(0x111827)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x475569, alpha: 0.9 });
      card.addChild(bg);

      const portrait = createAllyPortraitGraphic(kind, Math.min(cardW, Math.round(220 * LAYOUT_SCALE)) / 108);
      portrait.position.set(cardW / 2, cardH * 0.34);
      card.addChild(portrait);

      const t = new Text({
        text: `${def.name}\nHP ${def.maxHp} · 攻 ${def.atk} · 速 ${def.moveSpeed}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(21 * LAYOUT_SCALE),
          fill: 0xcbd5e1,
          align: 'center',
          lineHeight: Math.round(28 * LAYOUT_SCALE),
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5, 1);
      t.position.set(cardW / 2, cardH - Math.round(16 * LAYOUT_SCALE));
      card.addChild(t);

      const idx = i;
      card.on('pointertap', () => this.pickChoice(idx));
      this.addChild(card);
    }
  }

  private pickChoice(index: number): void {
    this.tip.text = '';
    const kind = this.choices[index]!;
    const cost = this.picksThisRound === 0 ? 0 : roguePickCostAfterFirst(this.run, kind);
    if (cost > 0 && this.run.gold < cost) {
      this.tip.text = `金币不足，需要 ${cost} 金才能选这张牌。`;
      return;
    }
    if (!applyPick(this.run.board, kind)) {
      this.tip.text = '备战区已满且没有该兵种空位，无法上场新兵种。';
      return;
    }
    if (cost > 0) this.run.gold -= cost;
    this.picksThisRound += 1;
    this.rollChoices();
    this.refreshHud();
    this.drawTrio();
    this.drawBoard();
    this.drawControls();
  }

  private beginUnitDrag(slotIndex: number): void {
    document.removeEventListener('pointerup', this.onDocPointerUp);
    this.dragMode = 'unit';
    this.dragFromSlot = slotIndex;
    document.addEventListener('pointerup', this.onDocPointerUp, { once: true });
  }

  private beginArtifactDrag(slotIndex: number): void {
    document.removeEventListener('pointerup', this.onDocPointerUp);
    this.dragMode = 'artifact';
    this.dragFromSlot = slotIndex;
    document.addEventListener('pointerup', this.onDocPointerUp, { once: true });
  }

  /** 羁绊档位提升时：格缘一次性高亮 */
  private playSlotBondGlow(wrap: Container, bw: number, bh: number): void {
    const r = Math.round(14 * LAYOUT_SCALE);
    const glow = new Graphics();
    glow.roundRect(0, 0, bw, bh, r).stroke({ width: Math.max(3, Math.round(3 * LAYOUT_SCALE)), color: 0xfef9c3, alpha: 1 });
    glow.roundRect(0, 0, bw, bh, r).fill({ color: 0xfacc15, alpha: 0.22 });
    wrap.addChild(glow);
    let ms = 0;
    const totalMs = 480;
    const onTick = (): void => {
      ms += this.app.ticker.deltaMS;
      const t = Math.min(1, ms / totalMs);
      glow.alpha = 1 - t;
      const s = 1 + t * 0.04;
      glow.scale.set(s);
      glow.position.set(((1 - s) * bw) / 2, ((1 - s) * bh) / 2);
      if (ms >= totalMs) {
        this.app.ticker.remove(onTick);
        glow.destroy();
      }
    };
    this.app.ticker.add(onTick);
  }

  /** 羁绊/策略 按钮短时闪动 */
  private flashBondButton(): void {
    const btn = this.bondBtnRoot;
    if (!btn) return;
    let ms = 0;
    const totalMs = 720;
    const onTick = (): void => {
      ms += this.app.ticker.deltaMS;
      const p = ms / totalMs;
      if (p >= 1) {
        btn.scale.set(1);
        btn.alpha = 1;
        this.app.ticker.remove(onTick);
        return;
      }
      const wave = Math.sin(p * Math.PI * 7);
      btn.scale.set(1 + Math.abs(wave) * 0.07);
      btn.alpha = 0.82 + Math.abs(wave) * 0.18;
    };
    this.app.ticker.add(onTick);
  }

  private drawBoard(): void {
    const nextStacks = allBondStacks(this.run.board);
    const upgradedKinds = new Set<AllyClass>();
    if (this.prevBondStacks) {
      for (const k of ALLY_CLASSES) {
        if (bondTierIndex(nextStacks[k]) > bondTierIndex(this.prevBondStacks[k] ?? 0)) {
          upgradedKinds.add(k);
        }
      }
    }
    this.prevBondStacks = { ...nextStacks };
    const bondFlash = upgradedKinds.size > 0;

    for (const c of [...this.children]) {
      if ((c as { userData?: string }).userData === 'board-slot') c.destroy();
    }
    for (let i = 0; i < 9; i++) {
      const b = this.boardSlotRect(i);
      const wrap = new Container();
      wrap.position.set(b.x, b.y);
      (wrap as Container & { userData?: string }).userData = 'board-slot';
      wrap.eventMode = 'static';
      wrap.cursor = this.run.board[i] ? 'grab' : 'default';
      const g = new Graphics();
      g.roundRect(0, 0, b.w, b.h, Math.round(14 * LAYOUT_SCALE))
        .fill(0x0f172a)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x334155 });
      wrap.addChild(g);
      const art = this.run.artifactBySlot[i];
      if (art) {
        const badge = new Graphics();
        const br = Math.round(22 * LAYOUT_SCALE);
        badge.circle(br, br, br).fill(0x4f46e5).stroke({ width: 2, color: 0xc7d2fe });
        wrap.addChild(badge);
        const am = new Text({
          text: artifactMark(art),
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: Math.round(20 * LAYOUT_SCALE),
            fill: 0xffffff,
            fontWeight: '800',
          },
        });
        am.anchor.set(0.5);
        am.position.set(br, br);
        wrap.addChild(am);
      }
      const slot = this.run.board[i];
      if (slot) {
        const portrait = createAllyPortraitGraphic(slot.kind, 0.34 * LAYOUT_SCALE);
        portrait.position.set(b.w / 2, b.h * 0.4);
        wrap.addChild(portrait);
        if (upgradedKinds.has(slot.kind)) {
          this.playSlotBondGlow(wrap, b.w, b.h);
        }
      }
      const bondTotal = slot ? nextStacks[slot.kind] : 0;
      const t = new Text({
        text: slot ? `${ALLY_DEFS[slot.kind].name}\n×${slot.stacks}` : '空',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: slot ? Math.round(19 * LAYOUT_SCALE) : Math.round(22 * LAYOUT_SCALE),
          fill: slot ? bondNameFill(bondTotal) : 0x475569,
          align: 'center',
          lineHeight: Math.round(24 * LAYOUT_SCALE),
          fontWeight: slot ? '600' : '400',
        },
      });
      t.anchor.set(0.5, 1);
      t.position.set(b.w / 2, b.h - Math.round(10 * LAYOUT_SCALE));
      wrap.addChild(t);
      const idx = i;
      wrap.on('pointerdown', (e: FederatedPointerEvent) => {
        const lp = e.getLocalPosition(wrap);
        const az = Math.round(48 * LAYOUT_SCALE);
        if (this.run.artifactBySlot[idx] && lp.x < az && lp.y < az) {
          this.beginArtifactDrag(idx);
          return;
        }
        if (this.run.board[idx]) {
          this.beginUnitDrag(idx);
        }
      });
      this.addChild(wrap);
    }
    if (bondFlash) this.flashBondButton();
  }

  private drawControls(): void {
    for (const c of [...this.children]) {
      if ((c as { userData?: string }).userData === 'ctrl') c.destroy();
    }
    const btnH = Math.round(64 * LAYOUT_SCALE);
    const mkBtn = (label: string, x: number, y: number, w: number, enabled: boolean, fn: () => void): void => {
      const g = new Graphics();
      g.roundRect(0, 0, w, btnH, Math.round(14 * LAYOUT_SCALE)).fill(enabled ? 0x1d4ed8 : 0x334155);
      g.eventMode = enabled ? 'static' : 'passive';
      g.cursor = enabled ? 'pointer' : 'default';
      g.position.set(x, y);
      (g as Container & { userData?: string }).userData = 'ctrl';
      if (enabled) g.on('pointertap', fn);
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(20 * LAYOUT_SCALE),
          fill: 0xffffff,
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5);
      t.position.set(x + w / 2, y + btnH / 2);
      (t as Container & { userData?: string }).userData = 'ctrl';
      this.addChild(g, t);
    };

    const row1Y = Math.round(1008 * LAYOUT_SCALE);
    const row2Y = Math.round(1090 * LAYOUT_SCALE);
    const gap = 12;
    const half = (GAME_WIDTH - PAD_X * 2 - gap) / 2;

    mkBtn(
      `刷新三选一（${ROGUE_REFRESH_TRIO_COST} 金）`,
      PAD_X,
      row1Y,
      half,
      this.run.gold >= ROGUE_REFRESH_TRIO_COST,
      () => {
        if (this.run.gold < ROGUE_REFRESH_TRIO_COST) return;
        this.run.gold -= ROGUE_REFRESH_TRIO_COST;
        this.rollChoices();
        this.refreshHud();
        this.drawTrio();
        this.drawControls();
      },
    );

    mkBtn('跳过选牌（保留金币）', PAD_X + half + gap, row1Y, half, true, () => this.tryFinish(true));

    mkBtn('结束选牌并继续', PAD_X, row2Y, GAME_WIDTH - PAD_X * 2, true, () => this.tryFinish(false));
  }

  private tryFinish(allowEmpty: boolean): void {
    this.tip.text = '';
    const meta = ROUNDS[this.run.currentRoundIndex]!;
    const nextIsBattle: boolean = meta.kind === 'normal' || meta.kind === 'boss';
    if (!allowEmpty && !boardHasAnyUnit(this.run.board)) {
      this.tip.text = '请至少布置一个兵种后再进入战斗。';
      return;
    }
    if (allowEmpty && nextIsBattle && !boardHasAnyUnit(this.run.board)) {
      this.tip.text = '战斗关无法在无兵力时跳过选牌，请至少选择一种兵种。';
      return;
    }
    document.removeEventListener('pointerup', this.onDocPointerUp);
    this.onFinished();
  }
}
