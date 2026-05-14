import { Circle, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { createEnemyBodyDisplay } from '../enemyBodyFactory';
import { battlePreviewPortraitEntries, formatNextBattlePreview } from '../nextBattlePreview';
import { bookChapterStrengthPercent } from '../bookChapterConfig';
import { ROUNDS } from '../roundConfig';
import { getResolvedRoundMeta } from '../roundResolve';
import { rewardChapterPreviewSummary, strategyChapterPreviewSummary } from '../strategyApply';
import type { RunState } from '../runState';
import { clampMapPreviewTokenDiameter, enemyTokenDiameterForVariant } from '../unitCircleTokens';
import { fitMapBottomEnterRow } from '../layoutFit';
import { mountStretchedDungeonBackground } from '../dungeonBackground';
import { dungeonIdForBookChapter, wowChapterStageTitle } from '../wowBookData';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_INSET,
  GOLDEN_PANEL_INSET_STROKE,
  GOLDEN_PANEL_MUTED,
  GOLDEN_PANEL_TITLE,
} from '../ui/goldenSolidPanel';
import { PARCHMENT_BTN_TEXT, paintParchmentRoundRect } from '../ui/parchmentButtonFill';

type Handlers = {
  onEnterRound: () => void;
  /** 二次确认后重置本章进度并回到章节选择 */
  onRequestExitChapter: () => void;
};

/** 压缩后的 16 关节点坐标（三行：5+5+6） */
function roundNodePosition(i: number): { cx: number; cy: number } {
  const colStep = Math.round(70 * LAYOUT_SCALE);
  const rowBaseY = Math.round(118 * LAYOUT_SCALE);
  const rowGap = Math.round(132 * LAYOUT_SCALE);
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
  private previewLayer: Container | null = null;

  constructor(run: RunState, h: Handlers) {
    super();
    this.run = run;
    this.h = h;

    mountStretchedDungeonBackground(this, dungeonIdForBookChapter(this.run.bookChapterId), { dimAlpha: 0.32 });

    const pad = Math.round(28 * LAYOUT_SCALE);
    const rowGap = Math.round(132 * LAYOUT_SCALE);
    const rowBaseY = Math.round(118 * LAYOUT_SCALE);

    const ch = this.run.bookChapterId;
    const strPct = bookChapterStrengthPercent(ch);
    const title = new Text({
      text: `${wowChapterStageTitle(ch)} · 强度 ${strPct}%`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(34 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - pad * 2,
      },
    });
    title.position.set(pad, Math.round(20 * LAYOUT_SCALE));
    this.addChild(title);

    const hp = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0x93c5fd,
      },
    });
    hp.position.set(pad, Math.round(78 * LAYOUT_SCALE));
    this.addChild(hp);

    const gold = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(24 * LAYOUT_SCALE),
        fill: 0xfbbf24,
      },
    });
    gold.position.set(Math.round(380 * LAYOUT_SCALE), Math.round(78 * LAYOUT_SCALE));
    this.addChild(gold);

    const nodeRadius = Math.round(24 * LAYOUT_SCALE);
    const curIdx = this.run.currentRoundIndex;
    for (let i = 0; i < ROUNDS.length; i++) {
      const meta = ROUNDS[i]!;
      const { cx, cy } = roundNodePosition(i);

      const g = new Graphics();
      let color = 0x334155;
      if (i < this.run.currentRoundIndex) color = 0x22c55e;
      if (i === this.run.currentRoundIndex) color = 0xf59e0b;
      if (i > this.run.currentRoundIndex) color = 0x1f2937;
      g.circle(0, 0, nodeRadius)
        .fill(color)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x0f172a });
      g.position.set(cx, cy);
      const canPreviewCurrentBattle =
        i === curIdx &&
        curIdx < ROUNDS.length &&
        (meta.kind === 'normal' || meta.kind === 'boss');
      if (canPreviewCurrentBattle) {
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.hitArea = new Circle(0, 0, nodeRadius + Math.round(8 * LAYOUT_SCALE));
        g.on('pointertap', (e) => {
          e.stopPropagation();
          this.openCurrentBattlePreview(i);
        });
      }
      this.addChild(g);

      const t = new Text({
        text: meta.label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(17 * LAYOUT_SCALE),
          fill: 0xe2e8f0,
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5, 1.55);
      t.position.set(cx, cy);
      this.addChild(t);

      const mark =
        meta.kind === 'boss' ? 'B' : meta.kind === 'strategy' ? '策' : meta.kind === 'reward' ? '奖' : '';
      if (mark) {
        const m = new Text({
          text: mark,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(15 * LAYOUT_SCALE),
            fill: 0xfef3c7,
            fontWeight: '700',
          },
        });
        m.anchor.set(0.5, 0.5);
        m.position.set(cx, cy);
        this.addChild(m);
      }

      if (canPreviewCurrentBattle) {
        const hintPv = new Text({
          text: '点选详情',
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(12 * LAYOUT_SCALE),
            fill: 0x93c5fd,
            fontWeight: '600',
          },
        });
        hintPv.anchor.set(0.5, 0);
        hintPv.position.set(cx, cy + nodeRadius + Math.round(4 * LAYOUT_SCALE));
        this.addChild(hintPv);
      }
    }

    const legend = new Text({
      text: '绿=已完成 · 橙=当前 · 灰=未解锁　B 首领 · 策 抉择 · 奖 奖励',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(17 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        lineHeight: Math.round(24 * LAYOUT_SCALE),
      },
    });
    legend.position.set(pad, rowBaseY + 3 * rowGap + Math.round(22 * LAYOUT_SCALE));
    this.addChild(legend);

    const nextTop = legend.y + legend.height + Math.round(14 * LAYOUT_SCALE);
    this.addChild(this.buildNextRoundPanel(pad, nextTop));

    const enterH = Math.round(72 * LAYOUT_SCALE);
    const { leftW: exitW, rightW: enterW, btnGap, startX } = fitMapBottomEnterRow(
      pad,
      Math.round(200 * LAYOUT_SCALE),
      Math.round(520 * LAYOUT_SCALE),
      Math.round(18 * LAYOUT_SCALE),
    );
    const bottomY = GAME_HEIGHT - Math.round(132 * LAYOUT_SCALE);

    const exitG = new Graphics();
    exitG
      .roundRect(0, 0, exitW, enterH, Math.round(14 * LAYOUT_SCALE))
      .fill(0xb91c1c)
      .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x7f1d1d });
    exitG.eventMode = 'static';
    exitG.cursor = 'pointer';
    exitG.position.set(startX, bottomY);
    exitG.on('pointertap', () => this.h.onRequestExitChapter());
    this.addChild(exitG);

    const exitLab = new Text({
      text: '退出',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xffffff,
        fontWeight: '700',
      },
    });
    exitLab.anchor.set(0.5);
    exitLab.position.set(startX + exitW / 2, bottomY + enterH / 2);
    this.addChild(exitLab);

    const canEnter = this.run.currentRoundIndex < ROUNDS.length && !this.run.isGameLost();
    const enter = new Graphics();
    enter
      .roundRect(0, 0, enterW, enterH, Math.round(16 * LAYOUT_SCALE))
      .fill(canEnter ? 0x2563eb : 0x475569);
    enter.eventMode = canEnter ? 'static' : 'passive';
    enter.cursor = canEnter ? 'pointer' : 'default';
    enter.position.set(startX + exitW + btnGap, bottomY);
    if (canEnter) {
      enter.on('pointertap', () => this.h.onEnterRound());
    }
    this.addChild(enter);

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
    const enterText = new Text({
      text: enterLabel,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xffffff,
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: Math.max(80, enterW - Math.round(20 * LAYOUT_SCALE)),
        breakWords: true,
        align: 'center',
      },
    });
    enterText.anchor.set(0.5);
    enterText.position.set(enter.x + enterW / 2, bottomY + enterH / 2);
    this.addChild(enterText);

    const refreshHud = (): void => {
      hp.text = `生命：${this.run.playerHp}`;
      gold.text = `金币：${this.run.gold}`;
    };
    refreshHud();
  }

  private buildNextRoundPanel(pad: number, topY: number): Container {
    const block = new Container();
    block.position.set(pad, topY);
    const bw = GAME_WIDTH - pad * 2;
    const bottomReserve = Math.round(132 * LAYOUT_SCALE) + Math.round(88 * LAYOUT_SCALE);
    const bh = Math.max(Math.round(200 * LAYOUT_SCALE), GAME_HEIGHT - topY - bottomReserve);

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, bw, bh, LAYOUT_SCALE);
    block.addChild(plate);
    block.addChild(frame);

    const idx = this.run.currentRoundIndex;
    const headStyle = {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: Math.round(22 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_TITLE,
      fontWeight: '700' as const,
    };
    const bodyStyle = {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: Math.round(18 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_BODY,
      lineHeight: Math.round(26 * LAYOUT_SCALE),
      wordWrap: true,
      wordWrapWidth: bw - Math.round(36 * LAYOUT_SCALE),
      breakWords: true,
    };

    if (idx >= ROUNDS.length || this.run.isGameLost()) {
      const t = new Text({
        text: '下一关预览',
        style: headStyle,
      });
      t.position.set(Math.round(18 * LAYOUT_SCALE), Math.round(14 * LAYOUT_SCALE));
      block.addChild(t);
      const msg =
        idx >= ROUNDS.length
          ? '本章流程已结束。'
          : '本章已失败（生命耗尽）。可使用下方「退出」返回章节选择。';
      const b = new Text({ text: msg, style: bodyStyle });
      b.position.set(Math.round(18 * LAYOUT_SCALE), Math.round(48 * LAYOUT_SCALE));
      block.addChild(b);
      return block;
    }

    const base = ROUNDS[idx]!;
    const meta = getResolvedRoundMeta(this.run, idx, base);
    const label = new Text({
      text: `下一关 · ${meta.label}`,
      style: headStyle,
    });
    label.position.set(Math.round(18 * LAYOUT_SCALE), Math.round(14 * LAYOUT_SCALE));
    block.addChild(label);

    if (meta.kind === 'strategy') {
      const b = new Text({
        text: strategyChapterPreviewSummary(meta.chapter),
        style: bodyStyle,
      });
      b.position.set(Math.round(18 * LAYOUT_SCALE), Math.round(48 * LAYOUT_SCALE));
      block.addChild(b);
      return block;
    }

    if (meta.kind === 'reward') {
      const b = new Text({
        text: rewardChapterPreviewSummary(meta.chapter),
        style: bodyStyle,
      });
      b.position.set(Math.round(18 * LAYOUT_SCALE), Math.round(48 * LAYOUT_SCALE));
      block.addChild(b);
      return block;
    }

    /* normal / boss */
    const entries = battlePreviewPortraitEntries(meta, this.run.bookChapterId);
    const miniW = Math.round(100 * LAYOUT_SCALE);
    const miniH = Math.round(112 * LAYOUT_SCALE);
    const miniGap = Math.round(10 * LAYOUT_SCALE);
    const rowY = Math.round(46 * LAYOUT_SCALE);
    let nx = Math.round(18 * LAYOUT_SCALE);
    for (const ent of entries) {
      const card = new Container();
      card.position.set(nx, rowY);
      const cbg = new Graphics();
      cbg
        .roundRect(0, 0, miniW, miniH, Math.round(12 * LAYOUT_SCALE))
        .fill(GOLDEN_PANEL_INSET)
        .stroke({ width: Math.max(1, Math.round(1 * LAYOUT_SCALE)), color: GOLDEN_PANEL_INSET_STROKE });
      card.addChild(cbg);
      const bodyG = createEnemyBodyDisplay(
        ent.paint,
        'mapMini',
        clampMapPreviewTokenDiameter(
          enemyTokenDiameterForVariant('mapMini', ent.paint.startsWith('boss_')),
          miniW,
          miniH,
        ),
        { wowCirclePortraitUid: ent.wowCirclePortraitUid },
      );
      bodyG.position.set(miniW / 2, miniH - Math.round(8 * LAYOUT_SCALE));
      card.addChild(bodyG);
      const cap = new Text({
        text: `${ent.title}×${ent.count}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(13 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_BODY,
          fontWeight: '600',
          align: 'center',
          wordWrap: true,
          wordWrapWidth: miniW - Math.round(6 * LAYOUT_SCALE),
          breakWords: true,
        },
      });
      cap.anchor.set(0.5, 1);
      cap.position.set(miniW / 2, Math.round(18 * LAYOUT_SCALE));
      card.addChild(cap);
      block.addChild(card);
      nx += miniW + miniGap;
    }

    const hint = new Text({
      text: '点击下方区域查看数值与技能详情',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(15 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_MUTED,
        fontWeight: '600',
      },
    });
    hint.position.set(Math.round(18 * LAYOUT_SCALE), rowY + miniH + Math.round(10 * LAYOUT_SCALE));
    block.addChild(hint);

    const tapY = Math.round(40 * LAYOUT_SCALE);
    block.eventMode = 'static';
    block.cursor = 'pointer';
    block.hitArea = new Rectangle(0, tapY, bw, bh - tapY);
    block.on('pointertap', (e) => {
      e.stopPropagation();
      this.openCurrentBattlePreview(idx);
    });

    return block;
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    this.closeBattlePreview();
    super.destroy(options);
  }

  private closeBattlePreview(): void {
    if (!this.previewLayer) return;
    this.removeChild(this.previewLayer);
    this.previewLayer.destroy({ children: true });
    this.previewLayer = null;
  }

  /** 战斗/首领：完整敌方情报弹层 */
  private openCurrentBattlePreview(roundIndex: number): void {
    const base = ROUNDS[roundIndex]!;
    const meta = getResolvedRoundMeta(this.run, roundIndex, base);
    this.closeBattlePreview();
    const layer = new Container();
    layer.eventMode = 'static';
    layer.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.previewLayer = layer;

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.84 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.closeBattlePreview());
    layer.addChild(dim);

    const pad = Math.round(28 * LAYOUT_SCALE);
    const panelW = Math.min(GAME_WIDTH - pad * 2, Math.round(980 * LAYOUT_SCALE));
    const px = (GAME_WIDTH - panelW) / 2;
    const py = Math.round(100 * LAYOUT_SCALE);
    const wrapW = panelW - pad * 2;

    const title = new Text({
      text: '本关敌方情报',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(30 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '700',
      },
    });
    title.position.set(px + pad, py + Math.round(20 * LAYOUT_SCALE));
    layer.addChild(title);

    const portraitTop = py + Math.round(64 * LAYOUT_SCALE);
    const cardW = Math.round(172 * LAYOUT_SCALE);
    const cardH = Math.round(196 * LAYOUT_SCALE);
    const cardGap = Math.round(12 * LAYOUT_SCALE);
    const entries = battlePreviewPortraitEntries(meta, this.run.bookChapterId);
    let nx = 0;
    let rowY = 0;
    for (const ent of entries) {
      if (nx + cardW > wrapW && nx > 0) {
        nx = 0;
        rowY += cardH + cardGap;
      }
      const card = new Container();
      card.position.set(px + pad + nx, portraitTop + rowY);
      const cardBg = new Graphics();
      cardBg
        .roundRect(0, 0, cardW, cardH, Math.round(14 * LAYOUT_SCALE))
        .fill(GOLDEN_PANEL_INSET)
        .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: GOLDEN_PANEL_INSET_STROKE });
      card.addChild(cardBg);
      const bodyG = createEnemyBodyDisplay(
        ent.paint,
        'mapPreviewModal',
        clampMapPreviewTokenDiameter(
          enemyTokenDiameterForVariant('mapPreviewModal', ent.paint.startsWith('boss_')),
          cardW,
          cardH,
        ),
        { wowCirclePortraitUid: ent.wowCirclePortraitUid },
      );
      bodyG.position.set(cardW / 2, cardH - Math.round(12 * LAYOUT_SCALE));
      card.addChild(bodyG);
      const cap = new Text({
        text: `${ent.title} ×${ent.count}`,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(16 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_BODY,
          fontWeight: '600',
          align: 'center',
          wordWrap: true,
          wordWrapWidth: Math.max(40, cardW - Math.round(10 * LAYOUT_SCALE)),
          breakWords: true,
        },
      });
      cap.anchor.set(0.5, 1);
      cap.position.set(cardW / 2, Math.round(22 * LAYOUT_SCALE));
      card.addChild(cap);
      layer.addChild(card);
      nx += cardW + cardGap;
    }
    const portraitBlockH = entries.length ? rowY + cardH : 0;

    const bookM = this.run.bookChapterStrengthMult();
    const body = new Text({
      text: formatNextBattlePreview(meta, roundIndex, bookM),
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_BODY,
        lineHeight: Math.round(30 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: wrapW,
        breakWords: true,
      },
    });
    const textY = portraitTop + portraitBlockH + (entries.length ? Math.round(18 * LAYOUT_SCALE) : Math.round(8 * LAYOUT_SCALE));
    body.position.set(px + pad, textY);
    layer.addChild(body);

    const closeW = Math.round(220 * LAYOUT_SCALE);
    const closeH = Math.round(52 * LAYOUT_SCALE);
    const closeX = px + (panelW - closeW) / 2;
    const bodyH = Math.max(body.height, Math.round(24 * LAYOUT_SCALE));
    const closeY = textY + bodyH + Math.round(22 * LAYOUT_SCALE);
    const panelH = Math.min(
      GAME_HEIGHT - Math.round(48 * LAYOUT_SCALE) - py,
      Math.max(Math.round(320 * LAYOUT_SCALE), closeY + closeH + Math.round(28 * LAYOUT_SCALE) - py),
    );

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, panelW, panelH, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    layer.addChildAt(panelPlate, 1);
    layer.addChildAt(panelFrame, 2);
    const closeG = new Graphics();
    const closeR = Math.round(14 * LAYOUT_SCALE);
    paintParchmentRoundRect(closeG, 0, 0, closeW, closeH, closeR, LAYOUT_SCALE, false);
    closeG.eventMode = 'static';
    closeG.cursor = 'pointer';
    closeG.position.set(closeX, closeY);
    closeG.on('pointertap', (e) => {
      e.stopPropagation();
      this.closeBattlePreview();
    });
    layer.addChild(closeG);
    const closeT = new Text({
      text: '关 闭',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: PARCHMENT_BTN_TEXT,
        fontWeight: '600',
      },
    });
    closeT.anchor.set(0.5);
    closeT.position.set(closeX + closeW / 2, closeY + closeH / 2);
    layer.addChild(closeT);

    this.addChild(layer);
  }
}
