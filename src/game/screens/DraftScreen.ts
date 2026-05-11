import type { Application } from 'pixi.js';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import {
  BOARD_CELL_MAX_STACKS,
  GAME_HEIGHT,
  GAME_WIDTH,
  LAYOUT_SCALE,
  ROGUE_PICK_AFTER_FIRST_COST,
  ROGUE_REFRESH_TRIO_COST,
} from '../constants';
import { allBondStacks } from '../battleBonds';
import { ALLY_CLASSES } from '../constants';
import { applyPick, boardHasAnyUnit, randomThreeFromFive } from '../draftLogic';
import { roguePickGoldCost, rogueRefreshGoldCost } from '../strategyApply';
import type { ArtifactKind } from '../strategyTypes';
import { ROUNDS } from '../roundConfig';
import { getResolvedRoundMeta } from '../roundResolve';
import { ALLY_DEFS } from '../unitDefs';
import type { AllyClass, RoundMeta } from '../types';
import type { RunState } from '../runState';
import { createDraftAllyToken, createDraftHeroToken } from '../unitCircleTokens';
import { getDeployedHeroIds, maxHeroDeploySlots } from '../heroMetaStorage';
import { getHeroDef } from '../heroRegistry';
import { SynergyOverlay } from './SynergyOverlay';

const PAD_X = Math.round(20 * LAYOUT_SCALE);
/** 选牌页右侧英雄竖条宽度（与九宫格并排） */
const HERO_RAIL_W = Math.round(118 * LAYOUT_SCALE);
const HERO_RAIL_GAP = Math.round(14 * LAYOUT_SCALE);
/** 正文区比全宽略收，避免贴边裁切与换行异常 */
const TEXT_INSET = Math.round(14 * LAYOUT_SCALE);
const HEADER_Y = Math.round(20 * LAYOUT_SCALE);
const TRIO_CARD_H = Math.round(278 * LAYOUT_SCALE);
/** 三选一卡片区顶端（下移后为规则区留出空间） */
const TRIO_TOP = Math.round(268 * LAYOUT_SCALE);
/** 三选一与备战之间的长说明区 */
const DETAIL_RULE_Y = TRIO_TOP + TRIO_CARD_H + Math.round(16 * LAYOUT_SCALE);
/** 九宫格左上角 Y */
const BOARD_GRID_TOP = DETAIL_RULE_Y + Math.round(124 * LAYOUT_SCALE);
const CARD_GAP = Math.round(18 * LAYOUT_SCALE);

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

function artifactName(k: ArtifactKind): string {
  switch (k) {
    case 'holy_grail':
      return '圣杯';
    case 'shelter':
      return '庇护';
    case 'cross_star':
      return '十字星';
    case 'revenge_spirit':
      return '复仇之魂';
    default:
      return '神器';
  }
}

type DragMode = 'slot' | null;

/** 羁绊档位：0 无，1≥3，2≥6，3≥10，4≥15，5≥21（极巨化·红） */
function bondTierIndex(totalStacks: number): number {
  if (totalStacks >= 21) return 5;
  if (totalStacks >= 15) return 4;
  if (totalStacks >= 10) return 3;
  if (totalStacks >= 6) return 2;
  if (totalStacks >= 3) return 1;
  return 0;
}

/** 备战格内兵种名颜色：按全棋盘该职业层数总和 */
function bondNameFill(totalStacks: number): number {
  if (totalStacks >= 21) return 0xef4444;
  if (totalStacks >= 15) return 0xf97316;
  if (totalStacks >= 10) return 0xc084fc;
  if (totalStacks >= 6) return 0x60a5fa;
  if (totalStacks >= 3) return 0x4ade80;
  return 0xe2e8f0;
}

export class DraftScreen extends Container {
  private readonly app: Application;
  private readonly run: RunState;
  private readonly onFinished: () => void;
  private readonly roundMeta: RoundMeta;
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
    if (this.dragMode === 'slot' && this.dragFromSlot !== null && j !== null && j !== this.dragFromSlot) {
      const i = this.dragFromSlot;
      const bu = this.run.board[i];
      const bj = this.run.board[j];
      const au = this.run.artifactBySlot[i];
      const aj = this.run.artifactBySlot[j];
      this.run.board[i] = bj;
      this.run.board[j] = bu;
      this.run.artifactBySlot[i] = aj;
      this.run.artifactBySlot[j] = au;
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
    const ri = run.currentRoundIndex;
    this.roundMeta = getResolvedRoundMeta(run, ri, ROUNDS[ri]!);

    /** 旧版允许同格叠神器+兵；新版互斥，迁入最近的双空格 */
    for (let i = 0; i < 9; i++) {
      if (run.board[i] !== null && run.artifactBySlot[i] !== null) {
        const k = run.artifactBySlot[i];
        run.artifactBySlot[i] = null;
        let placed = false;
        for (let j = 0; j < 9; j++) {
          if (run.board[j] === null && run.artifactBySlot[j] === null) {
            run.artifactBySlot[j] = k;
            placed = true;
            break;
          }
        }
        if (!placed) run.artifactBySlot[i] = k;
      }
    }

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

    const meta = this.roundMeta;
    const bondW = Math.round(188 * LAYOUT_SCALE);
    const headerWrap = GAME_WIDTH - PAD_X * 2 - bondW - Math.round(12 * LAYOUT_SCALE);
    const header = new Text({
      text: `回合 ${meta.label} · 肉鸽选牌`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(34 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '700',
        lineHeight: Math.round(42 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: Math.max(120, headerWrap),
        breakWords: true,
      },
    });
    header.position.set(PAD_X, HEADER_Y);
    this.addChild(header);

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

    const wrapW = GAME_WIDTH - PAD_X * 2 - TEXT_INSET;
    const shortRule = new Text({
      text: `上方三选一：5 兵种随机 3 张，点一张加入备战（单格叠层上限 ${BOARD_CELL_MAX_STACKS}）。卡面数字为选牌价；首次选牌免费。`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(19 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        lineHeight: Math.round(27 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: wrapW,
        breakWords: true,
      },
    });
    shortRule.position.set(PAD_X, Math.round(112 * LAYOUT_SCALE));
    this.addChild(shortRule);

    this.pickHint = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xbae6fd,
        lineHeight: Math.round(27 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: wrapW,
        breakWords: true,
      },
    });
    this.pickHint.position.set(PAD_X, TRIO_TOP - Math.round(48 * LAYOUT_SCALE));
    this.addChild(this.pickHint);

    const detailRule = new Text({
      text: `定价细则：之后每次选牌基础 ${ROGUE_PICK_AFTER_FIRST_COST} 金/张（有折扣的兵种更低）。棋盘上该兵种总层数 >10 时本张价格 ×2，>20 再 ×2；若当前三张里某兵种总层数 >20，刷新三选一（基础 ${ROGUE_REFRESH_TRIO_COST} 金）价格也 ×2。卡面与按钮均为实价。\n备战九宫：兵种与神器各占一格、不可重叠；点按有内容的格并拖到另一格，可与另一格整体交换（含神器，影响战斗内加成位置）。`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(18 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        lineHeight: Math.round(26 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: wrapW,
        breakWords: true,
      },
    });
    detailRule.position.set(PAD_X, DETAIL_RULE_Y);
    this.addChild(detailRule);

    const boardBandH = Math.round(400 * LAYOUT_SCALE);
    const boardBandY = BOARD_GRID_TOP - Math.round(14 * LAYOUT_SCALE);
    const boardBand = new Graphics();
    boardBand
      .roundRect(PAD_X, boardBandY, GAME_WIDTH - PAD_X * 2, boardBandH, Math.round(16 * LAYOUT_SCALE))
      .fill({ color: 0x0b1220, alpha: 0.75 })
      .stroke({ width: Math.max(1, Math.round(1 * LAYOUT_SCALE)), color: 0x1e293b });
    this.addChild(boardBand);

    this.tip = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(19 * LAYOUT_SCALE),
        fill: 0xfca5a5,
        lineHeight: Math.round(26 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: wrapW,
        breakWords: true,
      },
    });
    this.tip.position.x = PAD_X;
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
    const inner = GAME_WIDTH - PAD_X * 2 - CARD_GAP * 2 - TEXT_INSET;
    const cardW = Math.floor(inner / 3);
    const cardH = Math.round(278 * LAYOUT_SCALE);
    const originX = PAD_X + TEXT_INSET / 2 + (GAME_WIDTH - PAD_X * 2 - TEXT_INSET - (cardW * 3 + CARD_GAP * 2)) / 2;
    return { cardW, cardH, originX };
  }

  /** 底部两排按钮的纵向位置（与 drawControls 一致） */
  private controlRowYs(): { row1Y: number; row2Y: number; btnH: number } {
    const btnH = Math.round(58 * LAYOUT_SCALE);
    const bottomPad = Math.round(28 * LAYOUT_SCALE);
    const row2Y = GAME_HEIGHT - bottomPad - btnH;
    const rowGap = Math.round(14 * LAYOUT_SCALE);
    const row1Y = row2Y - btnH - rowGap;
    return { row1Y, row2Y, btnH };
  }

  private positionTipAboveRow1(row1Y: number): void {
    const tipGap = Math.round(10 * LAYOUT_SCALE);
    this.tip.position.x = PAD_X;
    if (!this.tip.text) {
      this.tip.position.y = row1Y - tipGap;
      return;
    }
    this.tip.position.y = row1Y - tipGap - this.tip.height;
  }

  private boardGridMetrics(): { originX: number; originY: number; cell: number; gap: number; gridW: number } {
    const cell = Math.round(108 * LAYOUT_SCALE);
    const gap = Math.round(16 * LAYOUT_SCALE);
    const gridW = cell * 3 + gap * 2;
    const totalW = gridW + HERO_RAIL_GAP + HERO_RAIL_W;
    const originX = PAD_X + (GAME_WIDTH - PAD_X * 2 - totalW) / 2;
    const originY = BOARD_GRID_TOP;
    return { originX, originY, cell, gap, gridW };
  }

  private boardSlotRect(i: number): { x: number; y: number; w: number; h: number } {
    const m = this.boardGridMetrics();
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      x: m.originX + col * (m.cell + m.gap),
      y: m.originY + row * (m.cell + m.gap),
      w: m.cell,
      h: m.cell,
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
      const c0 = roguePickGoldCost(this.run, this.choices[0]!, this.picksThisRound);
      const c1 = roguePickGoldCost(this.run, this.choices[1]!, this.picksThisRound);
      const c2 = roguePickGoldCost(this.run, this.choices[2]!, this.picksThisRound);
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
    const y = TRIO_TOP;
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

      const goldCost = roguePickGoldCost(this.run, kind, this.picksThisRound);
      const priceLab = new Text({
        text: goldCost === 0 ? '免费' : `${goldCost} 金`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(19 * LAYOUT_SCALE),
          fill: goldCost === 0 ? 0x86efac : 0xfbbf24,
          fontWeight: '700',
        },
      });
      priceLab.anchor.set(0.5, 0);
      priceLab.position.set(cardW / 2, Math.round(8 * LAYOUT_SCALE));
      card.addChild(priceLab);

      const portraitDiameter = Math.min(cardW * 0.72, Math.round(168 * LAYOUT_SCALE));
      const portrait = createDraftAllyToken(kind, portraitDiameter);
      portrait.position.set(cardW / 2, cardH * 0.44 + portraitDiameter / 2);
      card.addChild(portrait);

      const padX = Math.round(10 * LAYOUT_SCALE);
      const t = new Text({
        text: `${def.name}\nHP${def.maxHp} 攻${def.atk}\n速${def.moveSpeed}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(17 * LAYOUT_SCALE),
          fill: 0xcbd5e1,
          align: 'center',
          lineHeight: Math.round(22 * LAYOUT_SCALE),
          fontWeight: '600',
          wordWrap: true,
          wordWrapWidth: Math.max(40, cardW - padX * 2),
          breakWords: true,
        },
      });
      t.anchor.set(0.5, 1);
      t.position.set(cardW / 2, cardH - Math.round(12 * LAYOUT_SCALE));
      card.addChild(t);

      const idx = i;
      card.on('pointertap', () => this.pickChoice(idx));
      this.addChild(card);
    }
  }

  private pickChoice(index: number): void {
    this.tip.text = '';
    const kind = this.choices[index]!;
    const cost = roguePickGoldCost(this.run, kind, this.picksThisRound);
    if (cost > 0 && this.run.gold < cost) {
      this.tip.text = `金币不足，需要 ${cost} 金才能选这张牌。`;
      this.positionTipAboveRow1(this.controlRowYs().row1Y);
      return;
    }
    const slot = applyPick(this.run.board, this.run.artifactBySlot, kind);
    if (slot === null) {
      this.tip.text = '备战区已满且没有该兵种空位，无法上场新兵种。';
      this.positionTipAboveRow1(this.controlRowYs().row1Y);
      return;
    }
    const { cardW, cardH, originX } = this.cardMetrics();
    const fromX = originX + index * (cardW + CARD_GAP) + cardW / 2;
    const fromY = TRIO_TOP + cardH / 2;
    const br = this.boardSlotRect(slot);
    const toX = br.x + br.w / 2;
    const toY = br.y + br.h / 2;
    this.playPickToBoardParticles(fromX, fromY, toX, toY);
    if (cost > 0) this.run.gold -= cost;
    this.picksThisRound += 1;
    this.rollChoices();
    this.refreshHud();
    this.drawTrio();
    this.drawBoard();
    this.drawControls();
  }

  /** 选牌落入九宫格时的流光粒子 */
  private playPickToBoardParticles(fromX: number, fromY: number, toX: number, toY: number): void {
    const n = 18;
    const colors = [0x38bdf8, 0x7dd3fc, 0xc4b5fd, 0xfbbf24];
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      const r = (2.2 + Math.random() * 4.2) * LAYOUT_SCALE;
      g.circle(0, 0, r).fill({ color: colors[i % colors.length]!, alpha: 0.92 });
      const sx = fromX + (Math.random() - 0.5) * 28 * LAYOUT_SCALE;
      const sy = fromY + (Math.random() - 0.5) * 22 * LAYOUT_SCALE;
      g.position.set(sx, sy);
      this.addChild(g);
      const delayMs = Math.random() * 80;
      const durMs = 380 + Math.random() * 140;
      let acc = -delayMs;
      const onTick = (): void => {
        acc += this.app.ticker.deltaMS;
        if (acc < 0) return;
        const p = Math.min(1, acc / durMs);
        const e = 1 - (1 - p) ** 3;
        g.position.set(sx + (toX - sx) * e, sy + (toY - sy) * e);
        g.alpha = 1 - p * 0.35;
        g.scale.set(1 + 0.35 * Math.sin(p * Math.PI));
        if (p >= 1) {
          this.app.ticker.remove(onTick);
          g.destroy();
        }
      };
      this.app.ticker.add(onTick);
    }
  }

  /** 交换两格的「兵种 + 神器」整体（一格仅能有其一） */
  private beginSlotDrag(slotIndex: number): void {
    if (!this.run.board[slotIndex] && !this.run.artifactBySlot[slotIndex]) return;
    document.removeEventListener('pointerup', this.onDocPointerUp);
    this.dragMode = 'slot';
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
      const u = (c as { userData?: string }).userData;
      if (u === 'board-slot' || u === 'hero-rail') c.destroy();
    }
    for (let i = 0; i < 9; i++) {
      const b = this.boardSlotRect(i);
      const wrap = new Container();
      wrap.position.set(b.x, b.y);
      (wrap as Container & { userData?: string }).userData = 'board-slot';
      wrap.eventMode = 'static';
      wrap.cursor = this.run.board[i] || this.run.artifactBySlot[i] ? 'grab' : 'default';
      const g = new Graphics();
      g.roundRect(0, 0, b.w, b.h, Math.round(14 * LAYOUT_SCALE))
        .fill(0x0f172a)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x334155 });
      wrap.addChild(g);
      const art = this.run.artifactBySlot[i];
      const slot = this.run.board[i];
      if (art && !slot) {
        const artBg = new Graphics();
        artBg
          .roundRect(b.w * 0.12, b.h * 0.12, b.w * 0.76, b.h * 0.52, Math.round(12 * LAYOUT_SCALE))
          .fill({ color: 0x312e81, alpha: 0.92 })
          .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0xa5b4fc });
        wrap.addChild(artBg);
        const am = new Text({
          text: artifactMark(art),
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: Math.round(28 * LAYOUT_SCALE),
            fill: 0xffffff,
            fontWeight: '800',
          },
        });
        am.anchor.set(0.5, 0.5);
        am.position.set(b.w / 2, b.h * 0.36);
        wrap.addChild(am);
      }
      if (slot) {
        const portraitDiameter = Math.min(b.w * 0.62, Math.round(112 * LAYOUT_SCALE));
        const portrait = createDraftAllyToken(slot.kind, portraitDiameter);
        portrait.position.set(b.w / 2, b.h * 0.38 + portraitDiameter / 2);
        wrap.addChild(portrait);
        if (upgradedKinds.has(slot.kind)) {
          this.playSlotBondGlow(wrap, b.w, b.h);
        }
      }
      const bondTotal = slot ? nextStacks[slot.kind] : 0;
      const label = slot
        ? `${ALLY_DEFS[slot.kind].name}\n×${slot.stacks}`
        : art
          ? `${artifactName(art)}\n神器`
          : '空';
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: slot || art ? Math.round(15 * LAYOUT_SCALE) : Math.round(19 * LAYOUT_SCALE),
          fill: slot ? bondNameFill(bondTotal) : art ? 0xc7d2fe : 0x475569,
          align: 'center',
          lineHeight: Math.round(20 * LAYOUT_SCALE),
          fontWeight: slot || art ? '600' : '400',
          wordWrap: true,
          wordWrapWidth: Math.max(32, b.w - Math.round(8 * LAYOUT_SCALE)),
          breakWords: true,
        },
      });
      t.anchor.set(0.5, 1);
      t.position.set(b.w / 2, b.h - Math.round(8 * LAYOUT_SCALE));
      wrap.addChild(t);
      const idx = i;
      wrap.on('pointerdown', () => {
        if (this.run.board[idx] || this.run.artifactBySlot[idx]) this.beginSlotDrag(idx);
      });
      this.addChild(wrap);
    }
    this.drawHeroRail();
    if (bondFlash) this.flashBondButton();
  }

  /** 右侧竖条：已上阵英雄（仅展示，不可拖拽） */
  private drawHeroRail(): void {
    const m = this.boardGridMetrics();
    const cap = maxHeroDeploySlots();
    const dep = getDeployedHeroIds();
    const railX = m.originX + m.gridW + HERO_RAIL_GAP;
    const slotH = Math.round((m.cell * 3 + m.gap * 2) / 3);
    const gapY = Math.round(8 * LAYOUT_SCALE);
    for (let s = 0; s < cap; s++) {
      const wrap = new Container();
      wrap.position.set(railX, m.originY + s * (slotH + gapY));
      (wrap as Container & { userData?: string }).userData = 'hero-rail';
      const g = new Graphics();
      g.roundRect(0, 0, HERO_RAIL_W, slotH, Math.round(12 * LAYOUT_SCALE))
        .fill(0x0f172a)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x4c1d95 });
      wrap.addChild(g);
      const hid = dep[s];
      if (hid) {
        const def = getHeroDef(hid);
        if (def) {
          const dia = Math.min(HERO_RAIL_W * 0.72, slotH * 0.62);
          const portrait = createDraftHeroToken(hid, def.allyClass, dia);
          portrait.position.set(HERO_RAIL_W / 2, slotH * 0.42 + dia / 2);
          wrap.addChild(portrait);
          const lab = new Text({
            text: `英雄\n${def.name}`,
            style: {
              fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
              fontSize: Math.round(12 * LAYOUT_SCALE),
              fill: 0xe9d5ff,
              align: 'center',
              lineHeight: Math.round(16 * LAYOUT_SCALE),
              wordWrap: true,
              wordWrapWidth: HERO_RAIL_W - 6,
            },
          });
          lab.anchor.set(0.5, 1);
          lab.position.set(HERO_RAIL_W / 2, slotH - Math.round(4 * LAYOUT_SCALE));
          wrap.addChild(lab);
        }
      } else {
        const t = new Text({
          text: cap === 0 ? '栏位\n未解锁' : '空\n栏位',
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(13 * LAYOUT_SCALE),
            fill: 0x64748b,
            align: 'center',
            lineHeight: Math.round(18 * LAYOUT_SCALE),
            wordWrap: true,
            wordWrapWidth: HERO_RAIL_W - 4,
          },
        });
        t.anchor.set(0.5, 0.5);
        t.position.set(HERO_RAIL_W / 2, slotH / 2);
        wrap.addChild(t);
      }
      this.addChild(wrap);
    }
  }

  private drawControls(): void {
    for (const c of [...this.children]) {
      if ((c as { userData?: string }).userData === 'ctrl') c.destroy();
    }
    const { row1Y, row2Y, btnH } = this.controlRowYs();
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
          fontSize: Math.round(18 * LAYOUT_SCALE),
          fill: 0xffffff,
          fontWeight: '600',
          lineHeight: Math.round(24 * LAYOUT_SCALE),
          wordWrap: true,
          wordWrapWidth: Math.max(40, w - Math.round(16 * LAYOUT_SCALE)),
          align: 'center',
          breakWords: true,
        },
      });
      t.anchor.set(0.5);
      t.position.set(x + w / 2, y + btnH / 2);
      (t as Container & { userData?: string }).userData = 'ctrl';
      this.addChild(g, t);
    };

    const btnW = GAME_WIDTH - PAD_X * 2;
    const refreshCost = rogueRefreshGoldCost(this.run, this.choices);

    mkBtn(
      `刷新三选一（${refreshCost} 金）`,
      PAD_X,
      row1Y,
      btnW,
      this.run.gold >= refreshCost,
      () => {
        if (this.run.gold < refreshCost) return;
        this.run.gold -= refreshCost;
        this.rollChoices();
        this.refreshHud();
        this.drawTrio();
        this.drawControls();
      },
    );

    mkBtn('结束选牌并继续', PAD_X, row2Y, btnW, true, () => this.tryFinish());

    this.positionTipAboveRow1(row1Y);
  }

  private tryFinish(): void {
    this.tip.text = '';
    const meta = this.roundMeta;
    const nextIsBattle: boolean = meta.kind === 'normal' || meta.kind === 'boss';
    if (nextIsBattle && !boardHasAnyUnit(this.run.board)) {
      this.tip.text = '请至少布置一个兵种后再进入战斗。';
      this.positionTipAboveRow1(this.controlRowYs().row1Y);
      return;
    }
    document.removeEventListener('pointerup', this.onDocPointerUp);
    this.onFinished();
  }
}
