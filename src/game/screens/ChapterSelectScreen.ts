import { Assets, Container, FederatedWheelEvent, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { createEnemyBodyDisplay } from '../enemyBodyFactory';
import { battlePreviewPortraitEntries, formatNextBattlePreview } from '../nextBattlePreview';
import { BOOK_CHAPTER_COUNT, bookChapterStrengthPercent, mobIdsForBookChapter } from '../bookChapterConfig';
import {
  getChapterStarFilledCount,
  getCompletedChaptersStarSummary,
  getCurrentChallengeChapterId,
  isAllChaptersFullyCleared,
  loadChapterProgress,
} from '../chapterProgressStorage';
import { bossDisplayName } from '../roundConfig';
import type { RoundMeta } from '../types';
import { clampMapPreviewTokenDiameter, enemyTokenDiameterForVariant } from '../unitCircleTokens';
import { fitChapterBottomButtonRow } from '../layoutFit';
import {
  preloadWowCirclePortraitsForBookChapter,
  wowBossCirclePortraitTextureUrlByBossUid,
  wowBossPortraitTextureUrlByBossUid,
} from '../enemyPortraitTextures';
import { dungeonBackgroundImageUrl } from '../dungeonBackground';
import { spawnFloatingGameTip } from '../ui/floatingGameTip';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_ACCENT,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_INSET,
  GOLDEN_PANEL_INSET_STROKE,
  GOLDEN_PANEL_MUTED,
  GOLDEN_PANEL_TITLE,
} from '../ui/goldenSolidPanel';
import {
  PARCHMENT_BTN_TEXT,
  PARCHMENT_BTN_TEXT_DIM,
  paintParchmentRoundRect,
} from '../ui/parchmentButtonFill';
import {
  bossUidForBookChapter,
  dungeonIdForBookChapter,
  getWowMob,
  wowChapterStageTitle,
  wowFinalBossNameCn,
  wowMobEnemyPaint,
} from '../wowBookData';

/**
 * 章节入口：线性解锁，中央仅展示当前可挑战章节；底部「家园 | 挑战 | 英雄」。
 */
export class ChapterSelectScreen extends Container {
  private readonly onPickChapter: (chapterId: number) => void;
  private readonly onBack: () => void;
  private readonly onStrengthen?: () => void;
  /** 隐藏测试：整章按指定星级记入通关（当前界面中央章节） */
  private readonly onDebugChapterClear?: (chapterId: number, star: 1 | 2 | 3) => void;
  /** 当前预览的书本章节（1…BOOK_CHAPTER_COUNT），可与「挑战」入口一致或经左右箭头切换 */
  private viewChapterId: number;
  private readonly bgLayer = new Container();
  private readonly boardLayer = new Container();
  private dungeonBgGen = 0;
  private boardRebuildGen = 0;
  private detailLayer: Container | null = null;
  private cheatPanel: Container | null = null;
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;

  constructor(
    onPickChapter: (chapterId: number) => void,
    onBack: () => void,
    onStrengthen?: () => void,
    onDebugChapterClear?: (chapterId: number, star: 1 | 2 | 3) => void,
  ) {
    super();
    this.onPickChapter = onPickChapter;
    this.onBack = onBack;
    this.onStrengthen = onStrengthen;
    this.onDebugChapterClear = onDebugChapterClear;
    this.viewChapterId = getCurrentChallengeChapterId();
    this.sortableChildren = true;

    this.addChild(this.bgLayer);
    this.refreshDungeonBackground();

    const pad = Math.round(24 * LAYOUT_SCALE);

    const sum = getCompletedChaptersStarSummary();
    const progressLine = new Text({
      text: `已完成${sum.completedChapterCount}章，总星级${sum.starsEarned}/${sum.starsCapForCompleted}星`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '600',
        dropShadow: { alpha: 0.65, blur: 5, color: 0x020617, distance: 1 },
      },
    });
    progressLine.position.set(pad, Math.round(28 * LAYOUT_SCALE));
    this.addChild(progressLine);

    const backW = Math.round(160 * LAYOUT_SCALE);
    const backH = Math.round(50 * LAYOUT_SCALE);
    const backR = Math.round(12 * LAYOUT_SCALE);
    const backG = new Graphics();
    paintParchmentRoundRect(backG, 0, 0, backW, backH, backR, LAYOUT_SCALE, false);
    backG.eventMode = 'static';
    backG.cursor = 'pointer';
    backG.position.set(GAME_WIDTH - backW - pad, Math.round(26 * LAYOUT_SCALE));
    backG.on('pointertap', () => this.onBack());
    this.addChild(backG);
    const backT = new Text({
      text: '退出',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(21 * LAYOUT_SCALE),
        fill: PARCHMENT_BTN_TEXT,
        fontWeight: '600',
      },
    });
    backT.anchor.set(0.5);
    backT.position.set(backG.x + backW / 2, backG.y + backH / 2);
    this.addChild(backT);

    this.addChild(this.boardLayer);
    this.rebuildChapterBoard();

    const padForRow = Math.round(24 * LAYOUT_SCALE);
    const sideH = Math.round(76 * LAYOUT_SCALE);
    const midH = Math.round(88 * LAYOUT_SCALE);
    const { sideW, midW, btnGap, rowX } = fitChapterBottomButtonRow(
      padForRow,
      Math.round(200 * LAYOUT_SCALE),
      Math.round(420 * LAYOUT_SCALE),
      Math.round(16 * LAYOUT_SCALE),
    );
    const rowY = GAME_HEIGHT - Math.round(200 * LAYOUT_SCALE);

    const mkSide = (x: number, label: string, onTap?: () => void): void => {
      const g = new Graphics();
      const sideR = Math.round(14 * LAYOUT_SCALE);
      paintParchmentRoundRect(g, 0, 0, sideW, sideH, sideR, LAYOUT_SCALE, !onTap);
      g.eventMode = onTap ? 'static' : 'passive';
      g.cursor = onTap ? 'pointer' : 'default';
      g.position.set(x, rowY + (midH - sideH) / 2);
      if (onTap) g.on('pointertap', () => onTap());
      this.addChild(g);
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(22 * LAYOUT_SCALE),
          fill: onTap ? PARCHMENT_BTN_TEXT : PARCHMENT_BTN_TEXT_DIM,
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5);
      t.position.set(g.x + sideW / 2, g.y + sideH / 2);
      this.addChild(t);
    };

    mkSide(rowX, '家园');
    mkSide(rowX + sideW + btnGap + midW + btnGap, '英雄', () => this.onStrengthen?.());

    const chR = Math.round(18 * LAYOUT_SCALE);
    const chG = new Graphics();
    paintParchmentRoundRect(chG, 0, 0, midW, midH, chR, LAYOUT_SCALE, false, { gradient: true });
    chG.eventMode = 'static';
    chG.cursor = 'pointer';
    chG.position.set(rowX + sideW + btnGap, rowY);
    chG.on('pointertap', () => this.onPickChapter(this.viewChapterId));
    this.addChild(chG);

    const chT = new Text({
      text: '挑 战',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(34 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_ACCENT,
        fontWeight: '900',
      },
    });
    chT.anchor.set(0.5);
    chT.position.set(chG.x + midW / 2, chG.y + midH / 2);
    this.addChild(chT);

    const foot = new Text({
      text: '「家园」功能开发中',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(16 * LAYOUT_SCALE),
        fill: 0x475569,
      },
    });
    foot.anchor.set(0.5, 1);
    foot.position.set(GAME_WIDTH / 2, GAME_HEIGHT - Math.round(28 * LAYOUT_SCALE));
    this.addChild(foot);

    if (this.onDebugChapterClear) {
      this.keyHandler = (ev: KeyboardEvent): void => {
        if (ev.repeat || ev.code !== 'KeyU') return;
        ev.preventDefault();
        this.toggleChapterCheatPanel();
      };
      window.addEventListener('keydown', this.keyHandler);
    }

    attachScreenDebugLabel(this, 'ChapterSelectScreen');
  }

  private refreshDungeonBackground(): void {
    this.dungeonBgGen += 1;
    const gen = this.dungeonBgGen;
    const url = dungeonBackgroundImageUrl(dungeonIdForBookChapter(this.viewChapterId));
    for (const c of [...this.bgLayer.children]) {
      this.bgLayer.removeChild(c);
      c.destroy({ children: true });
    }
    void Assets.load<Texture>(url)
      .then((tex) => {
        if (gen !== this.dungeonBgGen || this.bgLayer.destroyed) {
          tex.destroy(true);
          return;
        }
        const sp = new Sprite(tex);
        sp.eventMode = 'none';
        sp.width = GAME_WIDTH;
        sp.height = GAME_HEIGHT;
        sp.position.set(0, 0);
        this.bgLayer.addChildAt(sp, 0);
        const dim = new Graphics();
        dim.eventMode = 'none';
        dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.34 });
        this.bgLayer.addChildAt(dim, 1);
      })
      .catch(() => {
        if (gen !== this.dungeonBgGen || this.bgLayer.destroyed) return;
        const g = new Graphics();
        g.eventMode = 'none';
        g.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0a0f1c);
        this.bgLayer.addChild(g);
      });
  }

  private rebuildChapterBoard(): void {
    for (const c of [...this.boardLayer.children]) {
      this.boardLayer.removeChild(c);
      c.destroy({ children: true });
    }
    this.boardRebuildGen += 1;
    const boardGen = this.boardRebuildGen;

    const pad = Math.round(24 * LAYOUT_SCALE);
    const targetId = this.viewChapterId;
    const allDone = isAllChaptersFullyCleared();

    const bossId = 'white' as const;
    const wowBossCn = wowFinalBossNameCn(targetId);
    const bossName = wowBossCn.trim().length > 0 ? wowBossCn.trim() : bossDisplayName(bossId);

    const portraitD = Math.round(268 * LAYOUT_SCALE);
    const cardW = Math.min(Math.round(1048 * LAYOUT_SCALE), GAME_WIDTH - pad * 2);
    const cardH = Math.round(668 * LAYOUT_SCALE);
    const cardX = (GAME_WIDTH - cardW) / 2;
    const cardY = Math.round(118 * LAYOUT_SCALE);

    const card = new Container();
    card.position.set(cardX, cardY);
    this.boardLayer.addChild(card);

    const plate = new Graphics();
    const frameOrn = new Graphics();
    drawGoldenSolidPanel(plate, frameOrn, cardW, cardH, LAYOUT_SCALE, { plateAlpha: 0.56 });
    card.addChild(plate);
    card.addChild(frameOrn);

    const pct = bookChapterStrengthPercent(targetId);
    const head = new Text({
      text: wowChapterStageTitle(targetId),
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(42 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
        dropShadow: { alpha: 0.45, blur: 4, color: 0x000000, distance: 1 },
      },
    });
    head.position.set(Math.round(28 * LAYOUT_SCALE), Math.round(26 * LAYOUT_SCALE));
    card.addChild(head);

    const str = new Text({
      text: `强度 ${pct}%`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_ACCENT,
        fontWeight: '700',
      },
    });
    str.position.set(Math.round(28 * LAYOUT_SCALE), Math.round(86 * LAYOUT_SCALE));
    card.addChild(str);

    const chStars = getChapterStarFilledCount(targetId);
    const starStrip = new Text({
      text: `${'★'.repeat(chStars)}${'☆'.repeat(3 - chStars)}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(28 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_ACCENT,
        fontWeight: '800',
        letterSpacing: Math.round(4 * LAYOUT_SCALE),
      },
    });
    starStrip.anchor.set(1, 0);
    starStrip.position.set(cardW - Math.round(28 * LAYOUT_SCALE), Math.round(80 * LAYOUT_SCALE));
    card.addChild(starStrip);

    if (allDone) {
      const badge = new Text({
        text: '全章已通关 · 可重复挑战',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(17 * LAYOUT_SCALE),
          fill: 0xb8d4b8,
          fontWeight: '700',
        },
      });
      badge.anchor.set(1, 0);
      badge.position.set(cardW - Math.round(24 * LAYOUT_SCALE), Math.round(30 * LAYOUT_SCALE));
      card.addChild(badge);
    }

    const portraitHost = new Container();
    card.addChild(portraitHost);

    const portraitCx = cardW / 2;
    const portraitCy = Math.round(288 * LAYOUT_SCALE);

    const bossUid = bossUidForBookChapter(targetId);
    if (bossUid) {
      const circleUrl = wowBossCirclePortraitTextureUrlByBossUid(bossUid);
      const squareUrl = wowBossPortraitTextureUrlByBossUid(bossUid);
      void Assets.load<Texture>(circleUrl)
        .catch(() => Assets.load<Texture>(squareUrl))
        .then((tex) => {
          if (boardGen !== this.boardRebuildGen || card.destroyed) {
            tex.destroy(true);
            return;
          }
          const sp = new Sprite(tex);
          sp.eventMode = 'none';
          sp.anchor.set(0.5, 0.5);
          sp.width = portraitD;
          sp.height = portraitD;
          sp.position.set(portraitCx, portraitCy);
          portraitHost.addChild(sp);
        })
        .catch(() => {
          /* 无立绘文件时仅留白 */
        });
    }

    const bossGap = Math.round(16 * LAYOUT_SCALE);
    const bossLine = new Text({
      text: `关底首领：${bossName}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_BODY,
        fontWeight: '700',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: cardW - Math.round(48 * LAYOUT_SCALE),
        breakWords: true,
      },
    });
    bossLine.anchor.set(0.5, 0);
    bossLine.position.set(portraitCx, portraitCy + portraitD / 2 + bossGap);
    card.addChild(bossLine);

    const detW = Math.round(200 * LAYOUT_SCALE);
    const detH = Math.round(50 * LAYOUT_SCALE);
    const detX = cardW - detW - Math.round(24 * LAYOUT_SCALE);
    const detY = cardH - detH - Math.round(24 * LAYOUT_SCALE);
    const detR = Math.round(12 * LAYOUT_SCALE);
    const detG = new Graphics();
    paintParchmentRoundRect(detG, 0, 0, detW, detH, detR, LAYOUT_SCALE, false);
    detG.eventMode = 'static';
    detG.cursor = 'pointer';
    detG.position.set(detX, detY);
    detG.on('pointertap', (e) => {
      e.stopPropagation();
      this.openChapterDetailOverlay();
    });
    card.addChild(detG);
    const detT = new Text({
      text: '查看详情',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: PARCHMENT_BTN_TEXT,
        fontWeight: '700',
      },
    });
    detT.anchor.set(0.5);
    detT.position.set(detX + detW / 2, detY + detH / 2);
    card.addChild(detT);

    const navGap = Math.round(18 * LAYOUT_SCALE);
    const arrowW = Math.round(148 * LAYOUT_SCALE);
    const arrowH = Math.round(56 * LAYOUT_SCALE);
    const clearedHere = loadChapterProgress().clearedChapterIds.includes(targetId);
    const hasNextChapter = targetId < BOOK_CHAPTER_COUNT;

    const navY = cardY + cardH + navGap;
    const gapMid = Math.round(44 * LAYOUT_SCALE);
    const navX0 = (GAME_WIDTH - (arrowW * 2 + gapMid)) / 2;

    const mkNav = (
      x: number,
      label: string,
      opts: { dim: boolean; onTap: () => void },
    ): void => {
      const wrap = new Container();
      wrap.position.set(x, navY);
      wrap.eventMode = 'static';
      wrap.cursor = 'pointer';
      const g = new Graphics();
      const navR = Math.round(12 * LAYOUT_SCALE);
      paintParchmentRoundRect(g, 0, 0, arrowW, arrowH, navR, LAYOUT_SCALE, opts.dim);
      wrap.addChild(g);
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(20 * LAYOUT_SCALE),
          fill: opts.dim ? PARCHMENT_BTN_TEXT_DIM : PARCHMENT_BTN_TEXT,
          fontWeight: '700',
        },
      });
      t.anchor.set(0.5);
      t.position.set(arrowW / 2, arrowH / 2);
      wrap.addChild(t);
      wrap.on('pointertap', (e) => {
        e.stopPropagation();
        opts.onTap();
      });
      this.boardLayer.addChild(wrap);
    };

    const canPrev = targetId > 1;
    mkNav(navX0, '← 上一关', {
      dim: !canPrev,
      onTap: () => {
        if (!canPrev) return;
        this.viewChapterId -= 1;
        this.refreshDungeonBackground();
        this.rebuildChapterBoard();
      },
    });

    mkNav(navX0 + arrowW + gapMid, '下一关 →', {
      dim: !hasNextChapter,
      onTap: () => {
        if (!hasNextChapter) {
          spawnFloatingGameTip(this, '已是最后一关');
          return;
        }
        if (!clearedHere) {
          spawnFloatingGameTip(this, '须先通关本章，方可查看后续关卡');
          return;
        }
        this.viewChapterId += 1;
        this.refreshDungeonBackground();
        this.rebuildChapterBoard();
      },
    });
  }

  /** 按 U 切换；不展示快捷键说明 */
  private toggleChapterCheatPanel(): void {
    if (!this.onDebugChapterClear) return;
    if (this.cheatPanel) {
      this.cheatPanel.destroy({ children: true });
      this.cheatPanel = null;
      return;
    }
    const root = new Container();
    root.zIndex = 9000;
    root.eventMode = 'static';

    const panelW = Math.round(200 * LAYOUT_SCALE);
    const inset = Math.round(14 * LAYOUT_SCALE);
    const btnH = Math.round(46 * LAYOUT_SCALE);
    const gap = Math.round(10 * LAYOUT_SCALE);
    const totalH = inset * 2 + btnH * 3 + gap * 2;

    root.position.set(GAME_WIDTH - panelW - Math.round(18 * LAYOUT_SCALE), Math.round(88 * LAYOUT_SCALE));

    const plate = new Graphics();
    const frameOrn = new Graphics();
    drawGoldenSolidPanel(plate, frameOrn, panelW, totalH, LAYOUT_SCALE);
    root.addChild(plate);
    root.addChild(frameOrn);

    const mkBtn = (label: string, star: 1 | 2 | 3, y: number): void => {
      const g = new Graphics();
      const bw = panelW - inset * 2;
      const btnR = Math.round(10 * LAYOUT_SCALE);
      paintParchmentRoundRect(g, inset, y, bw, btnH, btnR, LAYOUT_SCALE, false);
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', (e) => {
        e.stopPropagation();
        this.onDebugChapterClear?.(this.viewChapterId, star);
      });
      root.addChild(g);
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(17 * LAYOUT_SCALE),
          fill: PARCHMENT_BTN_TEXT,
          fontWeight: '700',
        },
      });
      t.anchor.set(0.5);
      t.position.set(panelW / 2, y + btnH / 2);
      root.addChild(t);
    };

    let y = inset;
    mkBtn('1星通关本章', 1, y);
    y += btnH + gap;
    mkBtn('2星通关本章', 2, y);
    y += btnH + gap;
    mkBtn('3星通关本章', 3, y);

    this.cheatPanel = root;
    this.addChild(root);
  }

  private closeChapterDetailOverlay(): void {
    if (!this.detailLayer) return;
    this.removeChild(this.detailLayer);
    this.detailLayer.destroy({ children: true });
    this.detailLayer = null;
  }

  /**
   * 展示本章敌种池（以首关数值为参考）与 3-6 首领的立绘与完整数值说明。
   * 中间区域可滚轮 / 拖拽滚动，避免内容超高时超框。
   */
  private openChapterDetailOverlay(): void {
    this.closeChapterDetailOverlay();
    void this.openChapterDetailOverlayAsync(this.viewChapterId);
  }

  private async openChapterDetailOverlayAsync(cid: number): Promise<void> {
    await preloadWowCirclePortraitsForBookChapter(cid);
    const bookM = bookChapterStrengthPercent(cid) / 100;
    const bossId = 'white' as const;

    const poolTypes = mobIdsForBookChapter(cid);
    const poolMeta: RoundMeta = {
      label: '本章敌种池',
      chapter: 1,
      sub: 1,
      kind: 'normal',
      enemies: poolTypes.map((id) => {
        const mob = getWowMob(id);
        const paint = mob ? wowMobEnemyPaint(mob) : 'grunt';
        return { type: paint, count: 1, wowMobId: id };
      }),
    };

    const bossMeta: RoundMeta = {
      label: '3-6',
      chapter: 3,
      sub: 6,
      kind: 'boss',
      enemies: [
        {
          type: 'boss',
          count: 1,
          bossId,
          wowBossDisplayName: wowFinalBossNameCn(cid) || undefined,
        },
      ],
    };

    const layer = new Container();
    layer.eventMode = 'static';
    layer.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.detailLayer = layer;

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.86 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.closeChapterDetailOverlay());
    layer.addChild(dim);

    const pad = Math.round(24 * LAYOUT_SCALE);
    const panelW = Math.min(GAME_WIDTH - pad * 2, Math.round(980 * LAYOUT_SCALE));
    const px = (GAME_WIDTH - panelW) / 2;
    const py = Math.round(44 * LAYOUT_SCALE);
    const innerPad = Math.round(20 * LAYOUT_SCALE);
    const wrapW = panelW - innerPad * 2;

    const closeH = Math.round(54 * LAYOUT_SCALE);
    const closeMargin = Math.round(20 * LAYOUT_SCALE);
    const closeY = GAME_HEIGHT - closeH - Math.round(100 * LAYOUT_SCALE);
    const headerH = Math.round(50 * LAYOUT_SCALE);
    const titleY = py + Math.round(8 * LAYOUT_SCALE);
    const scrollY = titleY + headerH;
    const scrollH = Math.max(Math.round(220 * LAYOUT_SCALE), closeY - closeMargin - scrollY);

    const panelH = closeY + closeH + closeMargin - py;
    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, panelW, panelH, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    layer.addChild(panelPlate);
    layer.addChild(panelFrame);

    const h1 = new Text({
      text: '章节情报详情',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(30 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    h1.position.set(px + innerPad, titleY);
    layer.addChild(h1);

    const scrollRoot = new Container();
    scrollRoot.position.set(px, scrollY);
    layer.addChild(scrollRoot);

    const maskShape = new Graphics();
    maskShape.rect(0, 0, panelW, scrollH).fill(0xffffff);
    scrollRoot.addChild(maskShape);
    scrollRoot.mask = maskShape;

    const scrollContent = new Container();
    scrollRoot.addChild(scrollContent);

    let localY = 0;
    const mkSection = (sectionTitle: string, meta: RoundMeta, scaleRoundIndex: number): void => {
      const st = new Text({
        text: sectionTitle,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(24 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_TITLE,
          fontWeight: '800',
          wordWrap: true,
          wordWrapWidth: wrapW,
          breakWords: true,
        },
      });
      st.position.set(innerPad, localY);
      scrollContent.addChild(st);
      localY += Math.round(Math.max(st.height, Math.round(28 * LAYOUT_SCALE)) + 8 * LAYOUT_SCALE);

      const portraitTop = localY;
      const cardW = Math.round(152 * LAYOUT_SCALE);
      const cardH = Math.round(172 * LAYOUT_SCALE);
      const cardGap = Math.round(10 * LAYOUT_SCALE);
      const entries = battlePreviewPortraitEntries(meta, cid);
      let nx = 0;
      let rowY = 0;
      for (const ent of entries) {
        if (nx + cardW > wrapW && nx > 0) {
          nx = 0;
          rowY += cardH + cardGap;
        }
        const c = new Container();
        c.position.set(innerPad + nx, portraitTop + rowY);
        const cardBg = new Graphics();
        cardBg
          .roundRect(0, 0, cardW, cardH, Math.round(12 * LAYOUT_SCALE))
          .fill(GOLDEN_PANEL_INSET)
          .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: GOLDEN_PANEL_INSET_STROKE });
        c.addChild(cardBg);
        const bodyG = createEnemyBodyDisplay(
          ent.paint,
          'chapterMini',
          clampMapPreviewTokenDiameter(
            enemyTokenDiameterForVariant('chapterMini', ent.paint.startsWith('boss_')),
            cardW,
            cardH,
          ),
          { wowCirclePortraitUid: ent.wowCirclePortraitUid },
        );
        bodyG.position.set(cardW / 2, cardH - Math.round(10 * LAYOUT_SCALE));
        c.addChild(bodyG);
        const cap = new Text({
          text: `${ent.title}×${ent.count}`,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(14 * LAYOUT_SCALE),
            fill: GOLDEN_PANEL_BODY,
            fontWeight: '600',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: Math.max(40, cardW - Math.round(8 * LAYOUT_SCALE)),
            breakWords: true,
          },
        });
        cap.anchor.set(0.5, 1);
        cap.position.set(cardW / 2, Math.round(18 * LAYOUT_SCALE));
        c.addChild(cap);
        scrollContent.addChild(c);
        nx += cardW + cardGap;
      }
      const portraitBlockH = entries.length ? rowY + cardH : 0;
      localY = portraitTop + portraitBlockH + (entries.length ? Math.round(12 * LAYOUT_SCALE) : Math.round(4 * LAYOUT_SCALE));

      const body = new Text({
        text: formatNextBattlePreview(meta, scaleRoundIndex, bookM),
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(17 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_BODY,
          lineHeight: Math.round(25 * LAYOUT_SCALE),
          wordWrap: true,
          wordWrapWidth: wrapW,
          breakWords: true,
        },
      });
      body.position.set(innerPad, localY);
      scrollContent.addChild(body);
      localY += body.height + Math.round(28 * LAYOUT_SCALE);
    };

    mkSection(
      '普通战斗 · 本章敌种池（各兵种以「首关 1-1」进度估算数值；实战中随关卡推进会变强）',
      poolMeta,
      0,
    );
    mkSection(
      `首领战 · ${wowFinalBossNameCn(cid).trim() || bossDisplayName(bossId)}（3-6；白板首领 · 数值同先知）`,
      bossMeta,
      15,
    );

    const contentH = localY + Math.round(12 * LAYOUT_SCALE);
    const maxScroll = Math.max(0, contentH - scrollH);
    let scrollOff = 0;
    const applyScroll = (): void => {
      scrollOff = Math.min(maxScroll, Math.max(0, scrollOff));
      scrollContent.y = -scrollOff;
    };
    applyScroll();

    scrollRoot.eventMode = 'static';
    scrollRoot.cursor = 'grab';
    scrollRoot.hitArea = new Rectangle(0, 0, panelW, scrollH);
    scrollRoot.on('wheel', (e: FederatedWheelEvent) => {
      e.stopPropagation();
      scrollOff += e.deltaY;
      applyScroll();
    });

    let drag = false;
    let lastPointerY = 0;
    scrollRoot.on('pointerdown', (e) => {
      drag = true;
      lastPointerY = e.global.y;
      scrollRoot.cursor = 'grabbing';
    });
    scrollRoot.on('pointermove', (e) => {
      if (!drag) return;
      const ny = e.global.y;
      scrollOff -= ny - lastPointerY;
      lastPointerY = ny;
      applyScroll();
    });
    const endDrag = (): void => {
      drag = false;
      scrollRoot.cursor = 'grab';
    };
    scrollRoot.on('pointerup', endDrag);
    scrollRoot.on('pointerupoutside', endDrag);
    scrollRoot.on('pointercancel', endDrag);

    const hintScroll = new Text({
      text: maxScroll > 0.5 ? '在区域内滚轮或按住拖动以滚动' : '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(14 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_MUTED,
      },
    });
    hintScroll.eventMode = 'none';
    hintScroll.anchor.set(0.5, 1);
    hintScroll.position.set(GAME_WIDTH / 2, closeY - Math.round(8 * LAYOUT_SCALE));
    layer.addChild(hintScroll);

    const closeW = Math.round(240 * LAYOUT_SCALE);
    const closeG = new Graphics();
    const closeR = Math.round(14 * LAYOUT_SCALE);
    paintParchmentRoundRect(closeG, 0, 0, closeW, closeH, closeR, LAYOUT_SCALE, false);
    closeG.eventMode = 'static';
    closeG.cursor = 'pointer';
    closeG.position.set((GAME_WIDTH - closeW) / 2, closeY);
    closeG.on('pointertap', (e) => {
      e.stopPropagation();
      this.closeChapterDetailOverlay();
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
    closeT.position.set(closeG.x + closeW / 2, closeG.y + closeH / 2);
    layer.addChild(closeT);

    attachScreenDebugLabel(layer, 'ChapterSelectScreen.detail');
    this.addChild(layer);
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.cheatPanel) {
      this.cheatPanel.destroy({ children: true });
      this.cheatPanel = null;
    }
    this.closeChapterDetailOverlay();
    super.destroy(options);
  }
}
