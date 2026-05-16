import { Container, FederatedWheelEvent, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { getGearItemById } from '../gearItems';
import type { GearFarmSlotPreview } from '../gearFarmProgress';
import { mountChapterBossPortraitFx } from '../ui/chapterBossPortraitFx';
import {
  gearFarmPreviewGridMetrics,
  mountHorizontalGearFarmPreviewStrip,
} from '../ui/gearFarmPreviewSlot';
import { getWowBookRegistryChapter, isWowBookGearDrop } from '../wowBookRegistry';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { getChapterIntelBossCardParts, getChapterIntelMobCardParts } from '../nextBattlePreview';
import { BOOK_CHAPTER_COUNT, bookChapterStrengthPercent, mobIdsForBookChapter } from '../bookChapterConfig';
import {
  getChapterStarFilledCount,
  getCompletedChaptersStarSummary,
  getCurrentChallengeChapterId,
  isAllChaptersFullyCleared,
  isRagefireChasmBookCleared,
  loadChapterProgress,
} from '../chapterProgressStorage';
import { getGearFarmStamina } from '../gearFarmStaminaStorage';
import { GAME_TERM_ZH } from '../gameTerminology';
import { bossDisplayName } from '../roundConfig';
import type { RoundMeta } from '../types';
import { fitChapterBottomButtonRow } from '../layoutFit';
import {
  preloadWowCirclePortraitsForBookChapter,
  wowBossCirclePortraitTextureUrlByBossUid,
  wowBossPortraitTextureUrlByBossUid,
} from '../enemyPortraitTextures';
import { dungeonBackgroundImageUrl } from '../dungeonBackground';
import { loadPublicTexture, loadPublicTextureFirst } from '../loadPublicTexture';
import { spawnFloatingGameTip } from '../ui/floatingGameTip';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_ACCENT,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_MUTED,
  GOLDEN_PANEL_TITLE,
} from '../ui/goldenSolidPanel';
import { appendChapterIntelUnitCardRow } from '../ui/chapterIntelUnitCardLayout';
import { createStyledGameButton } from '../ui/gameButtons';
import { paintRedCountBadge } from '../ui/countBadge';
import { getLotteryTicketsRemaining } from '../heroMetaStorage';
import {
  bossUidForBookChapter,
  dungeonIdForBookChapter,
  getWowMob,
  wowChapterStageTitle,
  wowFinalBossNameCn,
  wowMobEnemyPaint,
} from '../wowBookData';

function chapterGearDropPreviews(chapterId: number): GearFarmSlotPreview[] {
  const reg = getWowBookRegistryChapter(chapterId);
  const out: GearFarmSlotPreview[] = [];
  for (const drop of reg?.drops ?? []) {
    if (!isWowBookGearDrop(drop)) continue;
    const gear = getGearItemById(drop.gearId);
    if (!gear) continue;
    out.push({
      slotKind: gear.slotKind,
      slotNo: gear.slotNo,
      slotLabelCn: '',
      farmGear: gear,
    });
  }
  return out;
}

/**
 * 选关入口：线性解锁，中央展示当前可挑战关；底部「副本刷装 | 进入本关 | 职业/英雄」。
 */
export class ChapterSelectScreen extends Container {
  private readonly onPickChapter: (chapterId: number) => void;
  private readonly onBack: () => void;
  private readonly onStrengthen?: () => void;
  private readonly onGearFarm?: () => void;
  /** 隐藏测试：整章按指定星级记入通关（当前界面中央章节） */
  private readonly onDebugChapterClear?: (chapterId: number, star: 1 | 2 | 3) => void;
  /** 当前预览的书本章节（1…BOOK_CHAPTER_COUNT），可与中央「进入本章」一致或经左右箭头切换 */
  private viewChapterId: number;
  private readonly bgLayer = new Container();
  private readonly boardLayer = new Container();
  private dungeonBgGen = 0;
  private boardRebuildGen = 0;
  private detailLayer: Container | null = null;
  private cheatPanel: Container | null = null;
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;
  private bossPortraitFxDispose: (() => void) | null = null;

  constructor(
    onPickChapter: (chapterId: number) => void,
    onBack: () => void,
    onStrengthen?: () => void,
    onGearFarm?: () => void,
    onDebugChapterClear?: (chapterId: number, star: 1 | 2 | 3) => void,
  ) {
    super();
    this.onPickChapter = onPickChapter;
    this.onBack = onBack;
    this.onStrengthen = onStrengthen;
    this.onGearFarm = onGearFarm;
    this.onDebugChapterClear = onDebugChapterClear;
    this.viewChapterId = getCurrentChallengeChapterId();
    this.sortableChildren = true;

    this.addChild(this.bgLayer);
    this.refreshDungeonBackground();

    const pad = Math.round(24 * LAYOUT_SCALE);

    const sum = getCompletedChaptersStarSummary();
    const progressLine = new Text({
      text: `已完成${sum.completedChapterCount}关，总星级${sum.starsEarned}/${sum.starsCapForCompleted}星`,
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
    const backBtn = createStyledGameButton('cta', {
      text: '退出',
      width: backW,
      height: backH,
      fontSize: Math.round(21 * LAYOUT_SCALE),
    });
    backBtn.position.set(GAME_WIDTH - backW - pad, Math.round(26 * LAYOUT_SCALE));
    backBtn.on('pointertap', () => this.onBack());
    this.addChild(backBtn);

    this.addChild(this.boardLayer);
    this.rebuildChapterBoard();

    const padForRow = Math.round(24 * LAYOUT_SCALE);
    const sideH = Math.round(76 * LAYOUT_SCALE);
    const midH = Math.round(88 * LAYOUT_SCALE);
    const { sideW, midW, btnGap, rowX } = fitChapterBottomButtonRow(
      padForRow,
      Math.round(210 * LAYOUT_SCALE),
      Math.round(420 * LAYOUT_SCALE),
      Math.round(16 * LAYOUT_SCALE),
    );
    const rowY = GAME_HEIGHT - Math.round(200 * LAYOUT_SCALE);

    const patrolBtnY = rowY + (midH - sideH) / 2;
    const patrolUnlocked = isRagefireChasmBookCleared();
    if (!patrolUnlocked) {
      const patrolHint = new Text({
        text: '通关怒焰裂谷副本后解锁',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(14 * LAYOUT_SCALE),
          fill: 0x64748b,
          fontWeight: '600',
          align: 'center',
          wordWrap: true,
          wordWrapWidth: sideW - Math.round(8 * LAYOUT_SCALE),
        },
      });
      patrolHint.anchor.set(0.5, 1);
      patrolHint.position.set(rowX + sideW / 2, patrolBtnY - Math.round(6 * LAYOUT_SCALE));
      this.addChild(patrolHint);
    }

    const patrolBtn = createStyledGameButton(patrolUnlocked ? 'classic' : 'classicMuted', {
      text: GAME_TERM_ZH.farmDungeonButton,
      width: sideW,
      height: sideH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
      onTap: patrolUnlocked ? () => this.onGearFarm?.() : undefined,
    });
    patrolBtn.position.set(rowX, patrolBtnY);
    if (!patrolUnlocked) {
      patrolBtn.eventMode = 'passive';
      patrolBtn.cursor = 'default';
    }
    this.addChild(patrolBtn);

    const patrolBadge = new Container();
    patrolBadge.zIndex = 120;
    patrolBadge.position.set(
      rowX + sideW - Math.round(6 * LAYOUT_SCALE),
      patrolBtnY + Math.round(8 * LAYOUT_SCALE),
    );
    paintRedCountBadge(patrolBadge, patrolUnlocked ? getGearFarmStamina() : 0);
    this.addChild(patrolBadge);

    const heroX = rowX + sideW + btnGap + midW + btnGap;
    const heroY = rowY + (midH - sideH) / 2;
    const heroBtn = createStyledGameButton('classic', {
      text: '职业/英雄',
      width: sideW,
      height: sideH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    heroBtn.position.set(heroX, heroY);
    heroBtn.on('pointertap', () => this.onStrengthen?.());
    this.addChild(heroBtn);

    const heroLotteryBadge = new Container();
    heroLotteryBadge.zIndex = 120;
    heroLotteryBadge.position.set(heroX + sideW - Math.round(6 * LAYOUT_SCALE), heroY + Math.round(8 * LAYOUT_SCALE));
    paintRedCountBadge(heroLotteryBadge, getLotteryTicketsRemaining());
    this.addChild(heroLotteryBadge);

    const chBtn = createStyledGameButton('danger', {
      text: GAME_TERM_ZH.enterStage,
      width: midW,
      height: midH,
      fontSize: Math.round(34 * LAYOUT_SCALE),
    });
    chBtn.position.set(rowX + sideW + btnGap, rowY);
    chBtn.on('pointertap', () => this.onPickChapter(this.viewChapterId));
    this.addChild(chBtn);

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
    void loadPublicTexture(url)
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
    this.bossPortraitFxDispose?.();
    this.bossPortraitFxDispose = null;
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
    str.visible = false;
    card.addChild(str);

    const detW = Math.round(200 * LAYOUT_SCALE);
    const detH = Math.round(50 * LAYOUT_SCALE);
    const detX = cardW - detW - Math.round(24 * LAYOUT_SCALE);
    const detY = Math.round(72 * LAYOUT_SCALE);
    const detBtn = createStyledGameButton('classic', {
      text: '查看详情',
      width: detW,
      height: detH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    detBtn.position.set(detX, detY);
    detBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.openChapterDetailOverlay();
    });
    card.addChild(detBtn);

    const chStars = getChapterStarFilledCount(targetId);
    const starGap = Math.round(10 * LAYOUT_SCALE);
    const starY = detY + detH + starGap;
    const starStrip = new Text({
      text: `${'★'.repeat(chStars)}${'☆'.repeat(3 - chStars)}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(56 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_ACCENT,
        fontWeight: '800',
        letterSpacing: Math.round(8 * LAYOUT_SCALE),
      },
    });
    starStrip.anchor.set(1, 0);
    starStrip.position.set(detX + detW, starY);
    card.addChild(starStrip);

    if (allDone) {
      const badge = new Text({
        text: GAME_TERM_ZH.allStagesCleared,
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
    this.bossPortraitFxDispose = mountChapterBossPortraitFx(
      portraitHost,
      portraitCx,
      portraitCy,
      portraitD / 2,
    );

    const bossUid = bossUidForBookChapter(targetId);
    if (bossUid) {
      const circleUrl = wowBossCirclePortraitTextureUrlByBossUid(bossUid);
      const squareUrl = wowBossPortraitTextureUrlByBossUid(bossUid);
      void loadPublicTextureFirst([circleUrl, squareUrl])
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

    const dropStripX = Math.round(28 * LAYOUT_SCALE);
    const dropStripW = cardW - dropStripX * 2;
    const dropPad = Math.round(12 * LAYOUT_SCALE);
    const dropInnerW = dropStripW - dropPad * 2;
    const dropIconsOffsetY = Math.round(10 * LAYOUT_SCALE);
    const dropLabelH = Math.round(22 * LAYOUT_SCALE);
    const { rowStride: dropRowStride } = gearFarmPreviewGridMetrics(dropInnerW);
    const dropInnerH = dropLabelH + dropIconsOffsetY + dropRowStride;
    const dropBoxH = dropPad * 2 + dropInnerH;

    const dropBox = new Container();
    dropBox.position.set(dropStripX, bossLine.y + bossLine.height + Math.round(12 * LAYOUT_SCALE));
    card.addChild(dropBox);

    const dropPlate = new Graphics();
    const dropFrame = new Graphics();
    drawGoldenSolidPanel(dropPlate, dropFrame, dropStripW, dropBoxH, LAYOUT_SCALE, {
      plateAlpha: 0.78,
    });
    dropBox.addChild(dropPlate);
    dropBox.addChild(dropFrame);

    mountHorizontalGearFarmPreviewStrip(
      dropBox,
      dropPad,
      dropPad,
      dropInnerW,
      chapterGearDropPreviews(targetId),
      '掉落装备',
      GOLDEN_PANEL_MUTED,
      dropIconsOffsetY,
    );

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
      const btn = createStyledGameButton(opts.dim ? 'classicMuted' : 'classic', {
        text: label,
        width: arrowW,
        height: arrowH,
        fontSize: Math.round(20 * LAYOUT_SCALE),
      });
      btn.position.set(x, navY);
      btn.on('pointertap', (e) => {
        e.stopPropagation();
        opts.onTap();
      });
      this.boardLayer.addChild(btn);
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
          spawnFloatingGameTip(this, '须先通关本关，方可查看后续关卡');
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
      const bw = panelW - inset * 2;
      const btn = createStyledGameButton('classic', {
        text: label,
        width: bw,
        height: btnH,
        fontSize: Math.round(17 * LAYOUT_SCALE),
      });
      btn.position.set(inset, y);
      btn.on('pointertap', (e) => {
        e.stopPropagation();
        this.onDebugChapterClear?.(this.viewChapterId, star);
      });
      root.addChild(btn);
    };

    let y = inset;
    mkBtn('1星通关本关', 1, y);
    y += btnH + gap;
    mkBtn('2星通关本关', 2, y);
    y += btnH + gap;
    mkBtn('3星通关本关', 3, y);

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
      label: GAME_TERM_ZH.currentStageMobPool,
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
      label: GAME_TERM_ZH.nodeBossLabel('3-6'),
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
    const closeW = Math.round(240 * LAYOUT_SCALE);
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
      text: `${GAME_TERM_ZH.stageIntel}详情`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(30 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    h1.anchor.set(0.5, 0);
    h1.position.set(px + panelW / 2, titleY);
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
    const sectionTitleStyle = {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: Math.round(24 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_TITLE,
      fontWeight: '800' as const,
      wordWrap: true,
      wordWrapWidth: wrapW,
      breakWords: true,
    };
    const bodyTextStyle = {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: Math.round(17 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_BODY,
      lineHeight: Math.round(25 * LAYOUT_SCALE),
      wordWrap: true,
      breakWords: true,
    };

    const pushSectionTitle = (title: string): void => {
      const st = new Text({ text: title, style: sectionTitleStyle });
      st.position.set(innerPad, localY);
      scrollContent.addChild(st);
      localY += Math.round(st.height + 10 * LAYOUT_SCALE);
    };

    const pushMutedLine = (text: string): void => {
      const t = new Text({
        text,
        style: {
          ...bodyTextStyle,
          fontSize: Math.round(14 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_MUTED,
          lineHeight: Math.round(21 * LAYOUT_SCALE),
          wordWrapWidth: wrapW,
        },
      });
      t.position.set(innerPad, localY);
      scrollContent.addChild(t);
      localY += Math.round(t.height + 12 * LAYOUT_SCALE);
    };

    pushSectionTitle('普通小怪：');
    pushMutedLine('各兵种以「首节点 1-1」进度估算数值；实战中随节点推进会变强。');

    for (const w of poolMeta.enemies) {
      const parts = getChapterIntelMobCardParts(w, 1, 0, bookM, cid);
      localY = appendChapterIntelUnitCardRow(scrollContent, {
        parts,
        singleEnemyMeta: { ...poolMeta, enemies: [w] },
        bookChapterId: cid,
        originX: innerPad,
        topY: localY,
        rowW: wrapW,
      });
    }

    pushSectionTitle('首领：');

    {
      const w = bossMeta.enemies[0]!;
      const parts = getChapterIntelBossCardParts(w, 3, 15, bookM, cid);
      localY = appendChapterIntelUnitCardRow(scrollContent, {
        parts,
        singleEnemyMeta: bossMeta,
        bookChapterId: cid,
        originX: innerPad,
        topY: localY,
        rowW: wrapW,
      });
    }

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

    const closeBtn = createStyledGameButton('classic', {
      text: '关 闭',
      width: closeW,
      height: closeH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
    });
    closeBtn.position.set((GAME_WIDTH - closeW) / 2, closeY);
    closeBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.closeChapterDetailOverlay();
    });
    layer.addChild(closeBtn);

    attachScreenDebugLabel(layer, 'ChapterSelectScreen.detail');
    this.addChild(layer);
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    this.bossPortraitFxDispose?.();
    this.bossPortraitFxDispose = null;
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
