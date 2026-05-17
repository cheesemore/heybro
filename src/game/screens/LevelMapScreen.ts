import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  getChapterIntelBossCardParts,
  getChapterIntelMobCardParts,
} from '../nextBattlePreview';
import { GAME_TERM_ZH } from '../gameTerminology';
import { bookChapterRoundStrengthPercent } from '../bookChapterConfig';
import { legacyProgressRoundIndex, roundsForBookChapter } from '../roundConfig';
import { getResolvedRoundMeta } from '../roundResolve';
import { rewardChapterPreviewSummary, strategyChapterPreviewSummary } from '../strategyApply';
import type { RunState } from '../runState';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { appendChapterIntelUnitCardRow } from '../ui/chapterIntelUnitCardLayout';
import { fitMapBottomEnterRow } from '../layoutFit';
import { mountStretchedDungeonBackground } from '../dungeonBackground';
import { dungeonIdForBookChapter } from '../wowBookData';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_TITLE,
} from '../ui/goldenSolidPanel';
import { createStyledGameButton } from '../ui/gameButtons';
import { isBotModeActive } from '../bot/context';
import { botRegisterScreen, botUnregisterScreen } from '../bot/registry';

type Handlers = {
  onEnterRound: () => void;
  /** 二次确认后重置本章进度并回到章节选择 */
  onRequestExitChapter: () => void;
  /** 与章节选择 U 键作弊一致：指定星数记本章通关（写入本地进度） */
  onCheatChapterClear?: (star: 1 | 2 | 3) => void;
};

/** 关卡地图节点坐标：16 关沿用 5+5+6；7 关为 4+3；13 关为 6+6+1 */
function roundNodePosition(i: number, total: number): { cx: number; cy: number } {
  const colStep = Math.round(52 * LAYOUT_SCALE);
  const rowBaseY = Math.round(58 * LAYOUT_SCALE) + 50;
  const rowGap = Math.round(86 * LAYOUT_SCALE);

  if (total === 16) {
    let row = 0;
    let col = 0;
    if (i < 5) {
      row = 0;
      col = i;
    } else if (i < 10) {
      row = 1;
      col = i - 5;
    } else {
      row = 2;
      col = i - 10;
    }
    const nInRow = row === 2 ? 6 : 5;
    const rowWidth = (nInRow - 1) * colStep;
    const gridOriginX = (GAME_WIDTH - rowWidth) / 2;
    return {
      cx: gridOriginX + col * colStep,
      cy: rowBaseY + row * rowGap,
    };
  }

  const rowCounts =
    total === 7 ? [4, 3] : total === 13 ? [6, 6, 1] : [Math.min(6, Math.max(1, total))];
  let acc = 0;
  for (let r = 0; r < rowCounts.length; r++) {
    const nInRow = rowCounts[r]!;
    if (i < acc + nInRow) {
      const col = i - acc;
      const rowWidth = (nInRow - 1) * colStep;
      const gridOriginX = (GAME_WIDTH - rowWidth) / 2;
      return {
        cx: gridOriginX + col * colStep,
        cy: rowBaseY + r * rowGap,
      };
    }
    acc += nInRow;
  }
  const fallbackRow = rowCounts.length - 1;
  return { cx: GAME_WIDTH * 0.5, cy: rowBaseY + fallbackRow * rowGap };
}

export class LevelMapScreen extends Container {
  private readonly run: RunState;
  private readonly h: Handlers;

  constructor(run: RunState, h: Handlers) {
    super();
    this.run = run;
    this.h = h;

    mountStretchedDungeonBackground(this, dungeonIdForBookChapter(this.run.bookChapterId), { dimAlpha: 0.32 });

    const pad = Math.round(28 * LAYOUT_SCALE);
    const hudY = Math.round(18 * LAYOUT_SCALE);

    const hp = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xf87171,
        fontWeight: '600',
      },
    });
    hp.position.set(pad, hudY);
    this.addChild(hp);

    const gold = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xfbbf24,
        fontWeight: '600',
      },
    });
    gold.position.set(pad, hudY);
    this.addChild(gold);

    const nodeRadius = Math.round(22 * LAYOUT_SCALE);
    const curIdx = this.run.currentRoundIndex;
    const rounds = roundsForBookChapter(this.run.bookChapterId);
    const totalRounds = rounds.length;

    const hudRoundIdx = Math.min(curIdx, Math.max(0, totalRounds - 1));
    const strength = new Text({
      text: `强度 ${bookChapterRoundStrengthPercent(this.run.bookChapterId, hudRoundIdx)}%`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
        fontSize: Math.round(24 * LAYOUT_SCALE),
        fill: 0x93c5fd,
        fontWeight: '700',
      },
    });
    strength.anchor.set(1, 0);
    strength.position.set(GAME_WIDTH - pad, hudY);
    this.addChild(strength);
    for (let i = 0; i < totalRounds; i++) {
      const meta = rounds[i]!;
      const { cx, cy } = roundNodePosition(i, totalRounds);
      const isCurrent = i === curIdx;

      const g = new Graphics();
      let color = 0x334155;
      if (i < this.run.currentRoundIndex) color = 0x22c55e;
      if (i === this.run.currentRoundIndex) color = 0xf59e0b;
      if (i > this.run.currentRoundIndex) color = 0x1f2937;
      g.circle(0, 0, nodeRadius)
        .fill(color)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x0f172a });
      g.position.set(cx, cy);
      this.addChild(g);

      const labelStr = isCurrent
        ? meta.kind === 'normal'
          ? '战斗'
          : meta.kind === 'strategy'
            ? '策略'
            : meta.kind === 'reward'
              ? '奖励'
              : '首领'
        : meta.label;

      const t = new Text({
        text: labelStr,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(isCurrent ? 16 * LAYOUT_SCALE : 17 * LAYOUT_SCALE),
          fill: 0xe2e8f0,
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5, 1.55);
      t.position.set(cx, cy);
      this.addChild(t);

      const nodePct = bookChapterRoundStrengthPercent(this.run.bookChapterId, i);
      const pctT = new Text({
        text: `${nodePct}%`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(13 * LAYOUT_SCALE),
          fill: isCurrent ? 0xbfdbfe : 0x64748b,
          fontWeight: '700',
        },
      });
      pctT.anchor.set(0.5, 0);
      pctT.position.set(cx, cy + nodeRadius + Math.round(6 * LAYOUT_SCALE));
      this.addChild(pctT);

      const mark =
        meta.kind === 'boss' ? 'B' : meta.kind === 'strategy' ? '策' : meta.kind === 'reward' ? '奖' : '';
      if (mark && !isCurrent) {
        const m = new Text({
          text: mark,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(14 * LAYOUT_SCALE),
            fill: 0xfef3c7,
            fontWeight: '700',
          },
        });
        m.anchor.set(0.5, 0.5);
        m.position.set(cx, cy);
        this.addChild(m);
      }
    }

    const lastRowCy = roundNodePosition(totalRounds - 1, totalRounds).cy;
    const nodesBottom = lastRowCy + nodeRadius + Math.round(38 * LAYOUT_SCALE);
    const panelTop = nodesBottom + Math.round(10 * LAYOUT_SCALE);

    const enterH = Math.round(72 * LAYOUT_SCALE);
    const bottomMargin = Math.round(20 * LAYOUT_SCALE);
    const bottomY = GAME_HEIGHT - bottomMargin - enterH;
    /** 最小高度随节点下移同步收紧（较原 300 设计再收 50 逻辑像素） */
    const panelH = Math.max(
      Math.round(280 * LAYOUT_SCALE) - 20,
      bottomY - Math.round(14 * LAYOUT_SCALE) - panelTop,
    );

    this.addChild(this.buildCurrentRoundInfoPanel(pad, panelTop, panelH));
    const { leftW: exitW, rightW: enterW, btnGap, startX } = fitMapBottomEnterRow(
      pad,
      Math.round(200 * LAYOUT_SCALE),
      Math.round(520 * LAYOUT_SCALE),
      Math.round(18 * LAYOUT_SCALE),
    );

    const exitBtn = createStyledGameButton('cta', {
      text: '退出',
      width: exitW,
      height: enterH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
    });
    exitBtn.position.set(startX, bottomY);
    exitBtn.on('pointertap', () => this.h.onRequestExitChapter());
    this.addChild(exitBtn);

    const canEnter = this.run.currentRoundIndex < totalRounds && !this.run.isGameLost();
    const curMeta =
      this.run.currentRoundIndex < totalRounds ? rounds[this.run.currentRoundIndex]! : null;
    const actionWord =
      curMeta?.kind === 'strategy'
        ? '抉择'
        : curMeta?.kind === 'reward'
          ? '领奖'
          : curMeta?.kind === 'boss'
            ? '选牌与首领战'
            : '选牌';
    const enterLabel =
      this.run.currentRoundIndex >= totalRounds
        ? this.run.playerHp > 0 && !this.run.bookChapterRunFailed
          ? '已通关本关'
          : '流程结束'
        : this.run.isGameLost()
          ? '已失败'
          : `进入 ${rounds[this.run.currentRoundIndex]!.label}（${actionWord}）`;
    const enterBtn = createStyledGameButton(canEnter ? 'danger' : 'ctaDisabled', {
      text: enterLabel,
      width: enterW,
      height: enterH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
      wordWrapWidth: Math.max(80, enterW - Math.round(20 * LAYOUT_SCALE)),
    });
    enterBtn.position.set(startX + exitW + btnGap, bottomY);
    if (canEnter) {
      enterBtn.on('pointertap', () => this.h.onEnterRound());
    }
    this.addChild(enterBtn);

    const refreshHud = (): void => {
      hp.text = `❤️生命：${this.run.playerHp}`;
      gold.text = `金币：${this.run.gold}`;
      gold.position.set(pad + hp.width + Math.round(28 * LAYOUT_SCALE), hudY);
    };
    refreshHud();

    if (this.h.onCheatChapterClear) {
      const cw = Math.round(76 * LAYOUT_SCALE);
      const ch = Math.round(40 * LAYOUT_SCALE);
      const cgap = Math.round(6 * LAYOUT_SCALE);
      const rowW = cw * 3 + cgap * 2;
      const cheatRow = new Container();
      cheatRow.position.set(GAME_WIDTH - pad - rowW, hudY);
      const mkStar = (sx: number, label: string, st: 1 | 2 | 3): void => {
        const b = createStyledGameButton('classic', {
          text: label,
          width: cw,
          height: ch,
          fontSize: Math.round(15 * LAYOUT_SCALE),
        });
        b.position.set(sx, 0);
        b.on('pointertap', (e) => {
          e.stopPropagation();
          this.h.onCheatChapterClear?.(st);
        });
        cheatRow.addChild(b);
      };
      mkStar(0, '1★', 1);
      mkStar(cw + cgap, '2★', 2);
      mkStar((cw + cgap) * 2, '3★', 3);
      this.addChild(cheatRow);
    }

    attachScreenDebugLabel(this, 'LevelMapScreen');

    if (isBotModeActive()) {
      botRegisterScreen({
        kind: 'levelMap',
        levelMap: {
          canEnterRound: () => {
            const total = roundsForBookChapter(this.run.bookChapterId).length;
            return this.run.currentRoundIndex < total && !this.run.isGameLost();
          },
          enterRound: () => this.h.onEnterRound(),
          getCurrentRoundIndex: () => this.run.currentRoundIndex,
        },
      });
    }
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    botUnregisterScreen('levelMap');
    super.destroy(options);
  }

  private buildCurrentRoundInfoPanel(pad: number, topY: number, panelH: number): Container {
    const block = new Container();
    block.position.set(pad, topY);
    const bw = GAME_WIDTH - pad * 2;
    const innerPad = Math.round(16 * LAYOUT_SCALE);
    const maskW = bw - innerPad * 2;
    const maskH = panelH - innerPad * 2;

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, bw, panelH, LAYOUT_SCALE, { plateAlpha: 0.56 });
    block.addChild(plate);
    block.addChild(frame);

    const maskShape = new Graphics();
    maskShape
      .roundRect(innerPad, innerPad, maskW, maskH, Math.round(10 * LAYOUT_SCALE))
      .fill(0xffffff);
    block.addChild(maskShape);

    const inner = new Container();
    inner.position.set(innerPad, innerPad);
    inner.mask = maskShape;
    block.addChild(inner);

    const headStyle = {
      fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
      fontSize: Math.round(23 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_TITLE,
      fontWeight: '700' as const,
      wordWrap: true,
      wordWrapWidth: maskW,
      breakWords: true,
    };
    const bodyStyle = {
      fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
      fontSize: Math.round(19 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_BODY,
      lineHeight: Math.round(28 * LAYOUT_SCALE),
      wordWrap: true,
      wordWrapWidth: maskW,
      breakWords: true,
    };
    const leadStyle = {
      ...bodyStyle,
      fontWeight: '700' as const,
      fill: GOLDEN_PANEL_TITLE,
    };

    let y = 0;
    const idx = this.run.currentRoundIndex;
    const rounds = roundsForBookChapter(this.run.bookChapterId);
    const totalRounds = rounds.length;

    const pushText = (text: string, style: object): void => {
      const t = new Text({ text, style });
      t.position.set(0, y);
      inner.addChild(t);
      y += t.height + Math.round(8 * LAYOUT_SCALE);
    };

    if (idx >= totalRounds || this.run.isGameLost()) {
      pushText('本关状态', headStyle);
      pushText(
        idx >= totalRounds
          ? '本关流程已结束。'
          : '本关已失败（生命耗尽）。可使用下方「退出」返回选关。',
        bodyStyle,
      );
      this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
      return block;
    }

    const base = rounds[idx]!;
    const meta = getResolvedRoundMeta(this.run, idx, base);
    const bookM = this.run.bookChapterStrengthMult();
    const nodeStrengthPct = bookChapterRoundStrengthPercent(this.run.bookChapterId, idx);
    pushText(`本节点强度 ${nodeStrengthPct}%`, leadStyle);

    if (meta.kind === 'strategy') {
      pushText(GAME_TERM_ZH.mapNodeStrategyHead(meta.label), headStyle);
      pushText('该节点将从随机策略中进行三选一，选择后仅在本局内生效。', leadStyle);
      pushText(strategyChapterPreviewSummary(meta.chapter), bodyStyle);
      this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
      return block;
    }

    if (meta.kind === 'reward') {
      pushText(GAME_TERM_ZH.mapNodeRewardHead(meta.label), headStyle);
      pushText('该节点预计可获得的奖励如下（实际以进关时为准）：', leadStyle);
      pushText(rewardChapterPreviewSummary(meta.chapter), bodyStyle);
      this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
      return block;
    }

    pushText(GAME_TERM_ZH.mapNodeEnemyIntelHead(meta.label, meta.kind === 'boss'), headStyle);
    const leg = legacyProgressRoundIndex(this.run.bookChapterId, idx);
    for (const w of meta.enemies) {
      const parts =
        w.type === 'boss' && w.bossId
          ? getChapterIntelBossCardParts(w, meta.chapter, leg, bookM, this.run.bookChapterId)
          : getChapterIntelMobCardParts(w, meta.chapter, leg, bookM, this.run.bookChapterId);
      y = appendChapterIntelUnitCardRow(inner, {
        parts,
        singleEnemyMeta: { ...meta, enemies: [w] },
        bookChapterId: this.run.bookChapterId,
        originX: 0,
        topY: y,
        rowW: maskW,
      });
    }

    this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
    return block;
  }

  /** 内容高于可视区时滚轮上下滚动 */
  private attachMapInfoPanelScroll(
    block: Container,
    inner: Container,
    innerPad: number,
    maskH: number,
    contentHeight: number,
  ): void {
    const maxScroll = Math.max(0, contentHeight - maskH);
    if (maxScroll <= 1) return;
    let scroll = 0;
    block.eventMode = 'static';
    block.on('wheel', (e) => {
      e.stopPropagation();
      scroll += e.deltaY;
      scroll = Math.min(maxScroll, Math.max(0, scroll));
      inner.y = innerPad - scroll;
    });
  }
}
