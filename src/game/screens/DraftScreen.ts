import type { Application, Ticker } from 'pixi.js';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { clientToGameLogical } from '../layoutStage';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { allBondStacks } from '../battleBonds';
import { recruitCardBondedStats } from '../recruitCardBondStats';
import { ALLY_CLASSES } from '../constants';
import { applyPick, boardHasAnyUnit, canAcceptPick, randomThreeFromFive } from '../draftLogic';
import { botDraftClassPriority } from '../bot/draftPickPolicy';
import { isBotModeActive } from '../bot/context';
import { botRegisterScreen, botUnregisterScreen } from '../bot/registry';
import { roguePickGoldCost, rogueRefreshGoldCost } from '../strategyApply';
import type { ArtifactKind } from '../strategyTypes';
import { roundsForBookChapter } from '../roundConfig';
import { getResolvedRoundMeta } from '../roundResolve';
import { GAME_TERM_ZH } from '../gameTerminology';
import { ALLY_DEFS } from '../unitDefs';
import type { AllyClass, RoundMeta } from '../types';
import type { RunState } from '../runState';
import { createDraftAllyToken, createDraftHeroToken } from '../unitCircleTokens';
import { mountStretchedDungeonBackground } from '../dungeonBackground';
import { dungeonIdForBookChapter } from '../wowBookData';
import { getDeployedHeroIds, maxHeroDeploySlots } from '../heroMetaStorage';
import { getHeroDef, heroDisplayNameWithSkillTier, heroQualityAccent, type HeroId } from '../heroRegistry';
import { mountHeroInfoPanelContent } from '../ui/heroInfoPanel';
import { SynergyOverlay } from './SynergyOverlay';
import { PARCHMENT_BTN_TEXT, drawParchmentCardTopBottomRules } from '../ui/parchmentButtonFill';
import { spawnFloatingGameTip } from '../ui/floatingGameTip';
import { createStyledGameButton } from '../ui/gameButtons';
import { drawGoldenSolidPanel } from '../ui/goldenSolidPanel';

const PAD_X = Math.round(20 * LAYOUT_SCALE);
/** 选牌页右侧英雄竖条宽度（与九宫格并排） */
const HERO_RAIL_W = Math.round(128 * LAYOUT_SCALE);
const HERO_RAIL_GAP = Math.round(18 * LAYOUT_SCALE);
/** 正文区比全宽略收，避免贴边裁切与换行异常 */
const TEXT_INSET = Math.round(14 * LAYOUT_SCALE);
const HEADER_Y = Math.round(20 * LAYOUT_SCALE);
const TRIO_CARD_H = Math.round(278 * LAYOUT_SCALE);
/** 三选一卡顶「N 金」与底部职业特性同色 */
const DRAFT_CARD_GOLD_ACCENT = 0xa16207;

/** 招募卡第三行：职业特性（不再显示移速） */
function allyRecruitTraitText(kind: AllyClass): string {
  switch (kind) {
    case 'warrior':
      return '格挡远程伤害';
    case 'knight':
      return '冲锋';
    case 'mage':
      return '范围溅射';
    case 'archer':
      return '越射越猛';
    case 'priest':
      return '治疗';
    default:
      return '';
  }
}

function findDeployedHeroIdForClass(cls: AllyClass): HeroId | null {
  for (const hid of getDeployedHeroIds()) {
    if (!hid) continue;
    if (getHeroDef(hid)?.allyClass === cls) return hid;
  }
  return null;
}

/** 三选一卡片区顶端（下移后为规则区留出空间） */
const TRIO_TOP = Math.round(268 * LAYOUT_SCALE);
/** 三选一与备战之间的长说明区 */
const DETAIL_RULE_Y = TRIO_TOP + TRIO_CARD_H + Math.round(16 * LAYOUT_SCALE);
/** 九宫格左上角 Y（定价细则已并入「羁绊/规则」浮层「规则」页，此处仅留与说明区间距） */
const BOARD_GRID_TOP = DETAIL_RULE_Y + Math.round(12 * LAYOUT_SCALE);
const CARD_GAP = Math.round(18 * LAYOUT_SCALE);

/** 备战九宫头像格：深灰实底 + 未选灰边；拖拽源格用金边（饥荒选人配色，无花纹） */
const BOARD_AVATAR_CELL_FILL = 0x141414;
const BOARD_AVATAR_STROKE_MUTED = 0x6b6b6b;
const BOARD_AVATAR_STROKE_GOLD = 0xeab308;

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
  private draftFinishCommitted = false;
  /** tryFinish 已调用 onFinished（Bot 用于判断是否真正提交） */
  private draftExitRequested = false;
  private readonly screenTickers = new Set<(ticker: Ticker) => void>();
  private dragMode: DragMode = null;
  private dragFromSlot: number | null = null;
  private tip: Text;
  private hpText!: Text;
  private goldText!: Text;
  private pickHint: Text;
  private bondBtnRoot: Container | null = null;
  /** 上一帧各职业棋盘层数，用于检测羁绊档位上升 */
  private prevBondStacks: Record<AllyClass, number> | null = null;
  /** 拖拽交换兵种时盖在源格上的金边（避免 drawBoard 整表重绘打断按下） */
  private readonly boardDragOutline = new Graphics();
  /** 招募页英雄介绍浮层内滚动 dispose */
  private heroIntroPanelDispose: (() => void) | null = null;
  /** 招募页英雄头像全介绍浮层 */
  private heroIntroLayer: Container | null = null;

  private readonly onDocPointerEnd = (ev: PointerEvent): void => {
    this.finishSlotDragFromClient(ev.clientX, ev.clientY);
  };

  private finishSlotDragFromClient(clientX: number, clientY: number): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    const screen = this.app.renderer.screen;
    const pt = clientToGameLogical(clientX, clientY, r, screen.width, screen.height);
    if (!pt) {
      this.finishSlotDragFromLocal(Number.NaN, Number.NaN);
      return;
    }
    this.finishSlotDragFromLocal(pt.x, pt.y);
  }

  private finishSlotDragFromLocal(lx: number, ly: number): void {
    if (this.dragMode !== 'slot' || this.dragFromSlot === null) return;
    this.clearBoardDragOutline();
    const j = Number.isFinite(lx) ? this.hitSlotFromLocal(lx, ly) : null;
    if (j !== null && j !== this.dragFromSlot) {
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
    this.removeDocPointerEndListeners();
    this.drawBoard();
  }

  constructor(app: Application, run: RunState, onFinished: () => void) {
    super();
    this.sortableChildren = true;
    this.app = app;
    this.run = run;
    this.onFinished = onFinished;
    const ri = run.currentRoundIndex;
    const base = roundsForBookChapter(run.bookChapterId)[ri];
    if (!base) throw new Error('[DraftScreen] round index out of range');
    this.roundMeta = getResolvedRoundMeta(run, ri, base);

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

    mountStretchedDungeonBackground(this, dungeonIdForBookChapter(this.run.bookChapterId), { dimAlpha: 0.38 });

    const stars = new Graphics();
    for (let i = 0; i < 56; i++) {
      stars
        .circle(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, Math.random() * 1.5 + 0.2)
        .fill({ color: 0xe2e8f0, alpha: 0.035 + Math.random() * 0.08 });
    }
    this.addChild(stars);

    const band = new Graphics();
    band
      .roundRect(PAD_X, Math.round(72 * LAYOUT_SCALE), GAME_WIDTH - PAD_X * 2, Math.round((168 + 80) * LAYOUT_SCALE), Math.round(16 * LAYOUT_SCALE))
      .fill({ color: 0x111827, alpha: 0.85 });
    this.addChild(band);

    const meta = this.roundMeta;
    const bondW = Math.round(248 * LAYOUT_SCALE);
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
    const bondBtn = createStyledGameButton('classic', {
      text: '羁绊/规则',
      width: bondW,
      height: bondH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    bondBtn.zIndex = 40;
    bondBtn.position.set(GAME_WIDTH - PAD_X - bondW, HEADER_Y);
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

    this.hpText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xf87171,
        fontWeight: '600',
      },
    });
    this.addChild(this.hpText);

    this.goldText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xfbbf24,
        fontWeight: '600',
      },
    });
    this.addChild(this.goldText);

    const wrapW = GAME_WIDTH - PAD_X * 2 - TEXT_INSET;
    const shortRule = new Text({
      text: '相同卡牌达到3/6/10/15/21时会激活强力羁绊。',
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
    shortRule.position.set(PAD_X, Math.round((112 + 20) * LAYOUT_SCALE));
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

    const boardBandH = Math.round((400 + 80) * LAYOUT_SCALE);
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

    this.boardDragOutline.eventMode = 'none';
    this.boardDragOutline.visible = false;
    this.addChild(this.boardDragOutline);

    attachScreenDebugLabel(this, 'DraftScreen');

    if (isBotModeActive()) {
      botRegisterScreen({
        kind: 'draft',
        draft: {
          hasBoardUnit: () => boardHasAnyUnit(this.run.board),
          canPickMore: () => this.botCanPickMore(),
          isReadyForBattle: () => this.botIsReadyForBattle(),
          tryPick: () => this.botTryPick(),
          tryStartBattle: () => this.botTryStartBattle(),
          resetSubmit: () => this.botResetSubmit(),
        },
      });
    }
  }

  botResetSubmit(): void {
    this.draftFinishCommitted = false;
    this.draftExitRequested = false;
  }

  private botPickCandidates(): { index: number; kind: AllyClass; cost: number; priority: number }[] {
    const out: { index: number; kind: AllyClass; cost: number; priority: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const kind = this.choices[i]!;
      const cost = roguePickGoldCost(this.run, kind, this.picksThisRound);
      if (cost > 0 && this.run.gold < cost) continue;
      if (!canAcceptPick(this.run.board, this.run.artifactBySlot, kind)) continue;
      out.push({ index: i, kind, cost, priority: botDraftClassPriority(kind) });
    }
    out.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.cost - a.cost;
    });
    return out;
  }

  botCanPickMore(): boolean {
    return this.botPickCandidates().length > 0;
  }

  botIsReadyForBattle(): boolean {
    const needsUnits = this.roundMeta.kind === 'normal' || this.roundMeta.kind === 'boss';
    if (needsUnits && !boardHasAnyUnit(this.run.board)) return false;
    return !this.botCanPickMore();
  }

  /**
   * Bot 选牌：优先战/法/牧；同优先级下优先花更多金（尽量花完钱）。
   * 每 tick 至多选 1 张，由 orchestrator 重复调用直至无法再选。
   */
  botTryPick(): boolean {
    const candidates = this.botPickCandidates();
    if (!candidates.length) return false;
    const best = candidates[0]!;
    const picksBefore = this.picksThisRound;
    this.pickChoice(best.index);
    return this.picksThisRound > picksBefore;
  }

  /** Bot：与「开始战斗」相同；仅当 tryFinish 真正触发 onFinished 时返回 true */
  botTryStartBattle(): boolean {
    if (this.draftExitRequested || this.draftFinishCommitted) return false;
    if (!this.botIsReadyForBattle()) return false;
    this.tryFinish();
    return this.draftExitRequested;
  }

  private addScreenTicker(fn: (ticker: Ticker) => void): void {
    this.screenTickers.add(fn);
    this.app.ticker.add(fn);
  }

  private removeScreenTicker(fn: (ticker: Ticker) => void): void {
    this.app.ticker.remove(fn);
    this.screenTickers.delete(fn);
  }

  private clearScreenTickers(): void {
    for (const fn of this.screenTickers) {
      this.app.ticker.remove(fn);
    }
    this.screenTickers.clear();
  }

  override destroy(): void {
    this.clearScreenTickers();
    this.botResetSubmit();
    botUnregisterScreen('draft');
    this.removeDocPointerEndListeners();
    this.closeHeroIntro();
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
    const cell = Math.round(124 * LAYOUT_SCALE);
    const gap = Math.round(18 * LAYOUT_SCALE);
    const gridW = cell * 3 + gap * 2;
    const totalW = gridW + HERO_RAIL_GAP + HERO_RAIL_W;
    const originX = PAD_X + (GAME_WIDTH - PAD_X * 2 - totalW) / 2 - Math.round(25 * LAYOUT_SCALE);
    const originY = BOARD_GRID_TOP + Math.round(25 * LAYOUT_SCALE);
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

  private hitSlotFromLocal(lx: number, ly: number): number | null {
    const m = this.boardGridMetrics();
    const bleed = Math.round(m.gap * 0.45);
    for (let i = 0; i < 9; i++) {
      const b = this.boardSlotRect(i);
      if (lx >= b.x && lx < b.x + b.w && ly >= b.y && ly < b.y + b.h) return i;
    }
    for (let i = 0; i < 9; i++) {
      const b = this.boardSlotRect(i);
      if (
        lx >= b.x - bleed &&
        lx < b.x + b.w + bleed &&
        ly >= b.y - bleed &&
        ly < b.y + b.h + bleed
      ) {
        return i;
      }
    }
    return null;
  }

  private addDocPointerEndListeners(): void {
    this.removeDocPointerEndListeners();
    document.addEventListener('pointerup', this.onDocPointerEnd);
    document.addEventListener('pointercancel', this.onDocPointerEnd);
  }

  private removeDocPointerEndListeners(): void {
    document.removeEventListener('pointerup', this.onDocPointerEnd);
    document.removeEventListener('pointercancel', this.onDocPointerEnd);
  }

  private refreshHud(): void {
    this.hpText.text = `★生命：${this.run.playerHp}`;
    this.goldText.text = `金币：${this.run.gold}`;
    const hudY = Math.round(82 * LAYOUT_SCALE);
    this.hpText.position.set(PAD_X, hudY);
    this.goldText.position.set(PAD_X + this.hpText.width + Math.round(28 * LAYOUT_SCALE), hudY);
    this.pickHint.text = GAME_TERM_ZH.draftFirstCardFreeHint;
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
      const card = new Container();
      card.position.set(x, y);
      (card as Container & { userData?: string }).userData = 'trio-cell';
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.hitArea = new Rectangle(0, 0, cardW, cardH);

      const cardR = Math.round(18 * LAYOUT_SCALE);
      const plate = new Graphics();
      const rules = new Graphics();
      drawParchmentCardTopBottomRules(plate, rules, cardW, cardH, cardR, LAYOUT_SCALE, false);
      card.addChild(plate);
      card.addChild(rules);

      const goldCost = roguePickGoldCost(this.run, kind, this.picksThisRound);
      const priceLab = new Text({
        text: goldCost === 0 ? '免费' : `${goldCost} 金`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(19 * LAYOUT_SCALE),
          fill: goldCost === 0 ? 0x166534 : DRAFT_CARD_GOLD_ACCENT,
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

      const depHeroId = findDeployedHeroIdForClass(kind);
      if (depHeroId) {
        const smallD = Math.max(20, Math.round(portraitDiameter * 0.34));
        const mini = createDraftHeroToken(depHeroId, kind, smallD);
        mini.eventMode = 'none';
        const cx = cardW / 2;
        const cy = cardH * 0.44;
        const R = portraitDiameter / 2;
        const tuck = smallD * 0.18;
        mini.position.set(cx + R - tuck, cy + R - tuck + smallD / 2);
        card.addChild(mini);
      }

      const padX = Math.round(10 * LAYOUT_SCALE);
      const statFs = Math.round(17 * LAYOUT_SCALE);
      const traitFs = Math.round(15 * LAYOUT_SCALE);
      const wrapCard = Math.max(40, cardW - padX * 2);
      const bonded = recruitCardBondedStats(this.run.board, kind);
      const statLine = new Text({
        text: `生命${bonded.hp} 攻击${bonded.atk}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: statFs,
          fill: PARCHMENT_BTN_TEXT,
          align: 'center',
          lineHeight: Math.round(22 * LAYOUT_SCALE),
          fontWeight: '600',
          wordWrap: true,
          wordWrapWidth: wrapCard,
          breakWords: true,
        },
      });
      statLine.anchor.set(0.5, 0);
      const traitLine = new Text({
        text: allyRecruitTraitText(kind),
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: traitFs,
          fill: DRAFT_CARD_GOLD_ACCENT,
          align: 'center',
          lineHeight: Math.round(20 * LAYOUT_SCALE),
          fontWeight: '700',
          wordWrap: true,
          wordWrapWidth: wrapCard,
          breakWords: true,
        },
      });
      traitLine.anchor.set(0.5, 0);
      traitLine.position.set(0, statLine.height + Math.round(6 * LAYOUT_SCALE));
      const textBlock = new Container();
      textBlock.addChild(statLine);
      textBlock.addChild(traitLine);
      const blockH = traitLine.y + traitLine.height;
      textBlock.pivot.set(0, blockH);
      textBlock.position.set(cardW / 2, cardH - Math.round(12 * LAYOUT_SCALE));
      card.addChild(textBlock);

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
      spawnFloatingGameTip(this, `金币不足，需要 ${cost} 金才能选这张牌。`);
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
    if (isBotModeActive()) return;
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
        if (this.destroyed || g.destroyed) {
          this.removeScreenTicker(onTick);
          return;
        }
        acc += this.app.ticker.deltaMS;
        if (acc < 0) return;
        const p = Math.min(1, acc / durMs);
        const e = 1 - (1 - p) ** 3;
        g.position.set(sx + (toX - sx) * e, sy + (toY - sy) * e);
        g.alpha = 1 - p * 0.35;
        g.scale.set(1 + 0.35 * Math.sin(p * Math.PI));
        if (p >= 1) {
          this.removeScreenTicker(onTick);
          g.destroy();
        }
      };
      this.addScreenTicker(onTick);
    }
  }

  /** 交换两格的「兵种 + 神器」整体（一格仅能有其一） */
  private beginSlotDrag(slotIndex: number): void {
    if (!this.run.board[slotIndex] && !this.run.artifactBySlot[slotIndex]) return;
    this.removeDocPointerEndListeners();
    this.dragMode = 'slot';
    this.dragFromSlot = slotIndex;
    this.paintBoardDragOutline();
    this.addDocPointerEndListeners();
  }

  private clearBoardDragOutline(): void {
    this.boardDragOutline.clear();
    this.boardDragOutline.visible = false;
  }

  /** 源格金边（与未选灰边对照，几何仍为圆角矩形） */
  private paintBoardDragOutline(): void {
    if (this.dragMode !== 'slot' || this.dragFromSlot === null) {
      this.clearBoardDragOutline();
      return;
    }
    const b = this.boardSlotRect(this.dragFromSlot);
    const rr = Math.round(14 * LAYOUT_SCALE);
    const sw = Math.max(3, Math.round(3 * LAYOUT_SCALE));
    this.boardDragOutline.clear();
    this.boardDragOutline
      .roundRect(0, 0, b.w, b.h, rr)
      .stroke({ width: sw, color: BOARD_AVATAR_STROKE_GOLD, alpha: 1, join: 'round', cap: 'round' });
    this.boardDragOutline.position.set(b.x, b.y);
    this.boardDragOutline.visible = true;
    this.addChild(this.boardDragOutline);
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
      if (this.destroyed || glow.destroyed) {
        this.removeScreenTicker(onTick);
        return;
      }
      ms += this.app.ticker.deltaMS;
      const t = Math.min(1, ms / totalMs);
      glow.alpha = 1 - t;
      const s = 1 + t * 0.04;
      glow.scale.set(s);
      glow.position.set(((1 - s) * bw) / 2, ((1 - s) * bh) / 2);
      if (ms >= totalMs) {
        this.removeScreenTicker(onTick);
        glow.destroy();
      }
    };
    this.addScreenTicker(onTick);
  }

  /** 「羁绊/规则」按钮短时闪动 */
  private flashBondButton(): void {
    const btn = this.bondBtnRoot;
    if (!btn) return;
    let ms = 0;
    const totalMs = 720;
    const onTick = (): void => {
      if (this.destroyed || btn.destroyed) {
        this.removeScreenTicker(onTick);
        return;
      }
      ms += this.app.ticker.deltaMS;
      const p = ms / totalMs;
      if (p >= 1) {
        btn.scale.set(1);
        btn.alpha = 1;
        this.removeScreenTicker(onTick);
        return;
      }
      const wave = Math.sin(p * Math.PI * 7);
      btn.scale.set(1 + Math.abs(wave) * 0.07);
      btn.alpha = 0.82 + Math.abs(wave) * 0.18;
    };
    this.addScreenTicker(onTick);
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

    this.closeHeroIntro();
    for (const c of [...this.children]) {
      const u = (c as { userData?: string }).userData;
      if (u === 'board-slot' || u === 'hero-rail' || u === 'board-sep') c.destroy();
    }
    for (let i = 0; i < 9; i++) {
      const b = this.boardSlotRect(i);
      const wrap = new Container();
      wrap.position.set(b.x, b.y);
      (wrap as Container & { userData?: string }).userData = 'board-slot';
      wrap.eventMode = 'static';
      wrap.hitArea = new Rectangle(0, 0, b.w, b.h);
      wrap.cursor = this.run.board[i] || this.run.artifactBySlot[i] ? 'grab' : 'default';
      const g = new Graphics();
      const rr = Math.round(14 * LAYOUT_SCALE);
      g.roundRect(0, 0, b.w, b.h, rr)
        .fill(BOARD_AVATAR_CELL_FILL)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: BOARD_AVATAR_STROKE_MUTED });
      wrap.addChild(g);
      const art = this.run.artifactBySlot[i];
      const slot = this.run.board[i];
      if (art && !slot) {
        const artBg = new Graphics();
        artBg
          .roundRect(b.w * 0.12, b.h * 0.12, b.w * 0.76, b.h * 0.52, Math.round(12 * LAYOUT_SCALE))
          .fill({ color: 0x1c1c1c, alpha: 1 })
          .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: BOARD_AVATAR_STROKE_MUTED });
        wrap.addChild(artBg);
        const am = new Text({
          text: artifactMark(art),
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: Math.round(32 * LAYOUT_SCALE),
            fill: 0xffffff,
            fontWeight: '800',
          },
        });
        am.anchor.set(0.5, 0.5);
        am.position.set(b.w / 2, b.h * 0.36);
        wrap.addChild(am);
      }
      if (slot) {
        const portraitDiameter = Math.min(b.w * 0.62, Math.round(128 * LAYOUT_SCALE));
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
          fontSize: slot || art ? Math.round(17 * LAYOUT_SCALE) : Math.round(21 * LAYOUT_SCALE),
          fill: slot ? bondNameFill(bondTotal) : art ? 0xd4d4d4 : 0x9ca3af,
          align: 'center',
          lineHeight: Math.round(22 * LAYOUT_SCALE),
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
      wrap.on('pointerdown', (e) => {
        if (this.run.board[idx] || this.run.artifactBySlot[idx]) {
          e.stopPropagation();
          this.beginSlotDrag(idx);
        }
      });
      wrap.on('pointerup', (e) => {
        if (this.dragMode === 'slot' && this.dragFromSlot !== null) {
          e.stopPropagation();
          const p = this.toLocal(e.global);
          this.finishSlotDragFromLocal(p.x, p.y);
        }
      });
      wrap.on('pointerupoutside', (e) => {
        if (this.dragMode === 'slot' && this.dragFromSlot !== null) {
          const p = this.toLocal(e.global);
          this.finishSlotDragFromLocal(p.x, p.y);
        }
      });
      this.addChild(wrap);
    }
    const mSep = this.boardGridMetrics();
    const sepX = mSep.originX + mSep.gridW + HERO_RAIL_GAP / 2 + Math.round(15 * LAYOUT_SCALE);
    const sepTop = mSep.originY;
    const sepBot = mSep.originY + mSep.cell * 3 + mSep.gap * 2 + Math.round(25 * LAYOUT_SCALE);
    const sepG = new Graphics();
    sepG
      .moveTo(sepX, sepTop)
      .lineTo(sepX, sepBot)
      .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x475569, alpha: 0.95 });
    (sepG as Container & { userData?: string }).userData = 'board-sep';
    this.addChild(sepG);
    this.drawHeroRail();
    if (this.dragMode === 'slot' && this.dragFromSlot !== null) {
      this.paintBoardDragOutline();
    } else {
      this.clearBoardDragOutline();
    }
    if (bondFlash) this.flashBondButton();
  }

  private closeHeroIntro(): void {
    this.heroIntroPanelDispose?.();
    this.heroIntroPanelDispose = null;
    if (!this.heroIntroLayer) return;
    this.removeChild(this.heroIntroLayer);
    this.heroIntroLayer.destroy({ children: true });
    this.heroIntroLayer = null;
  }

  private openHeroIntro(hid: HeroId): void {
    const def = getHeroDef(hid);
    if (!def) return;
    this.closeHeroIntro();
    const stacks = allBondStacks(this.run.board)[def.allyClass];
    const layer = new Container();
    (layer as Container & { userData?: string }).userData = 'hero-intro-modal';
    layer.zIndex = 8000;
    this.sortableChildren = true;
    this.heroIntroLayer = layer;

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.78 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.closeHeroIntro());
    layer.addChild(dim);

    const pw = Math.min(GAME_WIDTH - Math.round(40 * LAYOUT_SCALE), Math.round(540 * LAYOUT_SCALE));
    const ph = Math.round(620 * LAYOUT_SCALE);
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;
    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    layer.addChild(panelPlate);
    layer.addChild(panelFrame);

    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(48 * LAYOUT_SCALE);
    const footerReserve = btnH + Math.round(18 * LAYOUT_SCALE);

    this.heroIntroPanelDispose = mountHeroInfoPanelContent({
      parent: layer,
      px,
      py,
      pw,
      ph,
      padX: Math.round(20 * LAYOUT_SCALE),
      padTop: Math.round(16 * LAYOUT_SCALE),
      titleText: '英雄介绍',
      titleFontSize: Math.round(22 * LAYOUT_SCALE),
      titleAlign: 'left',
      heroId: hid,
      classStacksOnBoard: stacks,
      heroIntroBondLineTint: 'respectStacks',
      tokenDia: Math.round(88 * LAYOUT_SCALE),
      gapAfterTitle: Math.round(10 * LAYOUT_SCALE),
      gapAfterToken: Math.round(12 * LAYOUT_SCALE),
      bodyFontSize: Math.round(15 * LAYOUT_SCALE),
      bodyLineHeight: Math.round(22 * LAYOUT_SCALE),
      footerReserve,
    });

    const closeBtn = createStyledGameButton('classic', {
      text: '关 闭',
      width: btnW,
      height: btnH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    closeBtn.position.set(px + (pw - btnW) / 2, py + ph - btnH - Math.round(18 * LAYOUT_SCALE));
    closeBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.closeHeroIntro();
    });
    layer.addChild(closeBtn);

    this.addChild(layer);
  }

  /** 右侧竖条：已上阵英雄（仅展示，不可拖拽） */
  private drawHeroRail(): void {
    const m = this.boardGridMetrics();
    const cap = maxHeroDeploySlots();
    const dep = getDeployedHeroIds();
    const railX = m.originX + m.gridW + HERO_RAIL_GAP + Math.round(15 * LAYOUT_SCALE);
    const slotH = Math.round((m.cell * 3 + m.gap * 2) / 3);
    const gapY = Math.round(8 * LAYOUT_SCALE);
    const stacksBy = allBondStacks(this.run.board);
    for (let s = 0; s < cap; s++) {
      const wrap = new Container();
      wrap.position.set(railX, m.originY + s * (slotH + gapY));
      (wrap as Container & { userData?: string }).userData = 'hero-rail';
      const g = new Graphics();
      g.roundRect(0, 0, HERO_RAIL_W, slotH, Math.round(12 * LAYOUT_SCALE))
        .fill(BOARD_AVATAR_CELL_FILL)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: BOARD_AVATAR_STROKE_MUTED });
      wrap.addChild(g);
      const hid = dep[s];
      if (hid) {
        const def = getHeroDef(hid);
        if (def) {
          wrap.eventMode = 'static';
          wrap.cursor = 'pointer';
          const hTap = hid;
          wrap.on('pointertap', (e) => {
            e.stopPropagation();
            this.openHeroIntro(hTap);
          });
          const dia = Math.min(HERO_RAIL_W * 0.72, slotH * 0.62);
          const portrait = createDraftHeroToken(hid, def.allyClass, dia);
          portrait.position.set(HERO_RAIL_W / 2, slotH * 0.42 + dia / 2);
          wrap.addChild(portrait);
          const nm = heroDisplayNameWithSkillTier(def.name, stacksBy[def.allyClass]);
          const railTitle = `${ALLY_DEFS[def.allyClass].name}英雄 ${nm}`;
          const lab = new Text({
            text: railTitle,
            style: {
              fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
              fontSize: Math.round(14 * LAYOUT_SCALE),
              fill: heroQualityAccent(def.quality),
              align: 'center',
              lineHeight: Math.round(18 * LAYOUT_SCALE),
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
            fontSize: Math.round(15 * LAYOUT_SCALE),
            fill: 0x64748b,
            align: 'center',
            lineHeight: Math.round(20 * LAYOUT_SCALE),
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
    type BtnKind = 'refresh' | 'finish';
    const mkBtn = (
      label: string,
      x: number,
      y: number,
      w: number,
      enabled: boolean,
      kind: BtnKind,
      fn: () => void,
      onDisabledTap?: () => void,
    ): void => {
      const styleKey =
        kind === 'refresh' ? (enabled ? 'draftRefresh' : 'draftRefreshDisabled') : 'danger';
      const btn = createStyledGameButton(styleKey, {
        text: label,
        width: w,
        height: btnH,
        fontSize: Math.round(18 * LAYOUT_SCALE),
        wordWrapWidth: Math.max(40, w - Math.round(16 * LAYOUT_SCALE)),
      });
      btn.position.set(x, y);
      (btn as Container & { userData?: string }).userData = 'ctrl';
      btn.on('pointertap', () => {
        if (enabled) fn();
        else onDisabledTap?.();
      });
      this.addChild(btn);
    };

    const btnW = GAME_WIDTH - PAD_X * 2;
    const refreshCost = rogueRefreshGoldCost(this.run, this.choices);

    mkBtn(
      `刷新三选一（${refreshCost} 金）`,
      PAD_X,
      row1Y,
      btnW,
      this.run.gold >= refreshCost,
      'refresh',
      () => {
        if (this.run.gold < refreshCost) return;
        this.run.gold -= refreshCost;
        this.rollChoices();
        this.refreshHud();
        this.drawTrio();
        this.drawControls();
      },
      this.run.gold >= refreshCost
        ? undefined
        : () => {
            spawnFloatingGameTip(this, `金币不足，刷新需要 ${refreshCost} 金。`);
          },
    );

    mkBtn('开始战斗', PAD_X, row2Y, btnW, true, 'finish', () => this.tryFinish());

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
    this.removeDocPointerEndListeners();
    this.draftFinishCommitted = true;
    this.draftExitRequested = true;
    if (isBotModeActive()) {
      queueMicrotask(() => this.onFinished());
    } else {
      this.onFinished();
    }
  }
}
