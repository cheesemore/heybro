import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  getChapterIntelBossCardParts,
  getChapterIntelMobCardParts,
} from '../nextBattlePreview';
import { ROUNDS } from '../roundConfig';
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

type Handlers = {
  onEnterRound: () => void;
  /** 二次确认后重置本章进度并回到章节选择 */
  onRequestExitChapter: () => void;
};

/** 16 关节点坐标（三行：5+5+6），间距压缩以腾出下方情报板 */
function roundNodePosition(i: number): { cx: number; cy: number } {
  const colStep = Math.round(52 * LAYOUT_SCALE);
  const rowBaseY = Math.round(58 * LAYOUT_SCALE);
  const rowGap = Math.round(86 * LAYOUT_SCALE);
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
    for (let i = 0; i < ROUNDS.length; i++) {
      const meta = ROUNDS[i]!;
      const { cx, cy } = roundNodePosition(i);
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

    const lastRowCy = roundNodePosition(ROUNDS.length - 1).cy;
    const nodesBottom = lastRowCy + nodeRadius + Math.round(38 * LAYOUT_SCALE);
    const panelTop = nodesBottom + Math.round(10 * LAYOUT_SCALE);

    const enterH = Math.round(72 * LAYOUT_SCALE);
    const bottomMargin = Math.round(20 * LAYOUT_SCALE);
    const bottomY = GAME_HEIGHT - bottomMargin - enterH;
    const panelH = Math.max(
      Math.round(300 * LAYOUT_SCALE),
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

    const canEnter = this.run.currentRoundIndex < ROUNDS.length && !this.run.isGameLost();
    const curMeta =
      this.run.currentRoundIndex < ROUNDS.length ? ROUNDS[this.run.currentRoundIndex]! : null;
    const actionWord =
      curMeta?.kind === 'strategy'
        ? '抉择'
        : curMeta?.kind === 'reward'
          ? '领奖'
          : curMeta?.kind === 'boss'
            ? '选牌与首领战'
            : '选牌';
    const enterLabel =
      this.run.currentRoundIndex >= ROUNDS.length
        ? this.run.playerHp > 0 && !this.run.bookChapterRunFailed
          ? '已通关本章'
          : '流程结束'
        : this.run.isGameLost()
          ? '已失败'
          : `进入 ${ROUNDS[this.run.currentRoundIndex]!.label}（${actionWord}）`;
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

    attachScreenDebugLabel(this, 'LevelMapScreen');
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
    drawGoldenSolidPanel(plate, frame, bw, panelH, LAYOUT_SCALE);
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

    const pushText = (text: string, style: object): void => {
      const t = new Text({ text, style });
      t.position.set(0, y);
      inner.addChild(t);
      y += t.height + Math.round(8 * LAYOUT_SCALE);
    };

    if (idx >= ROUNDS.length || this.run.isGameLost()) {
      pushText('本关状态', headStyle);
      pushText(
        idx >= ROUNDS.length
          ? '本章流程已结束。'
          : '本章已失败（生命耗尽）。可使用下方「退出」返回章节选择。',
        bodyStyle,
      );
      this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
      return block;
    }

    const base = ROUNDS[idx]!;
    const meta = getResolvedRoundMeta(this.run, idx, base);
    const bookM = this.run.bookChapterStrengthMult();

    if (meta.kind === 'strategy') {
      pushText('本关：策略抉择', headStyle);
      pushText('本关将从随机策略中进行三选一，选择后仅在本局内生效。', leadStyle);
      pushText(strategyChapterPreviewSummary(meta.chapter), bodyStyle);
      this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
      return block;
    }

    if (meta.kind === 'reward') {
      pushText('本关：关末奖励', headStyle);
      pushText('本关预计可获得的奖励如下（实际以进关时为准）：', leadStyle);
      pushText(rewardChapterPreviewSummary(meta.chapter), bodyStyle);
      this.attachMapInfoPanelScroll(block, inner, innerPad, maskH, y);
      return block;
    }

    const head = meta.kind === 'boss' ? '本关：首领战 · 敌方情报' : '本关：普通战斗 · 敌方情报';
    pushText(head, headStyle);
    for (const w of meta.enemies) {
      const parts =
        w.type === 'boss' && w.bossId
          ? getChapterIntelBossCardParts(w, meta.chapter, idx, bookM, this.run.bookChapterId)
          : getChapterIntelMobCardParts(w, meta.chapter, idx, bookM, this.run.bookChapterId);
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
