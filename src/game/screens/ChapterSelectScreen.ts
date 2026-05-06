import { Container, FederatedWheelEvent, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { createEnemyBodyDisplay } from '../enemyBodyFactory';
import { battlePreviewPortraitEntries, formatNextBattlePreview } from '../nextBattlePreview';
import { bossIdForBookChapter, bookChapterStrengthPercent, enemyPoolForBookChapter } from '../bookChapterConfig';
import { getCurrentChallengeChapterId, isAllChaptersFullyCleared } from '../chapterProgressStorage';
import { bossDisplayName } from '../roundConfig';
import type { EnemyClass, RoundMeta } from '../types';
import { ENEMY_DEFS } from '../unitDefs';

/**
 * 章节入口：线性解锁，中央仅展示当前可挑战章节；底部「家园 | 挑战 | 强化」。
 */
export class ChapterSelectScreen extends Container {
  private readonly onPickChapter: (chapterId: number) => void;
  private readonly onBack: () => void;
  private readonly targetChapterId: number;
  private detailLayer: Container | null = null;

  constructor(onPickChapter: (chapterId: number) => void, onBack: () => void) {
    super();
    this.onPickChapter = onPickChapter;
    this.onBack = onBack;
    this.targetChapterId = getCurrentChallengeChapterId();

    const pad = Math.round(24 * LAYOUT_SCALE);
    const targetId = this.targetChapterId;
    const allDone = isAllChaptersFullyCleared();

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x050816);
    bg.rect(0, 0, GAME_WIDTH, Math.round(380 * LAYOUT_SCALE)).fill({ color: 0x1e1b4b, alpha: 0.45 });
    this.addChild(bg);

    const title = new Text({
      text: '章节挑战',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(42 * LAYOUT_SCALE),
        fill: 0xfef9c3,
        fontWeight: '800',
      },
    });
    title.position.set(pad, Math.round(26 * LAYOUT_SCALE));
    this.addChild(title);

    const sub = new Text({
      text: '通关上一章后解锁下一章 · 仅展示当前可挑战目标',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - pad * 2 - Math.round(180 * LAYOUT_SCALE),
      },
    });
    sub.position.set(pad, Math.round(86 * LAYOUT_SCALE));
    this.addChild(sub);

    const backW = Math.round(160 * LAYOUT_SCALE);
    const backH = Math.round(50 * LAYOUT_SCALE);
    const backG = new Graphics();
    backG
      .roundRect(0, 0, backW, backH, Math.round(12 * LAYOUT_SCALE))
      .fill(0x1e293b)
      .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x475569 });
    backG.eventMode = 'static';
    backG.cursor = 'pointer';
    backG.position.set(GAME_WIDTH - backW - pad, Math.round(26 * LAYOUT_SCALE));
    backG.on('pointertap', () => this.onBack());
    this.addChild(backG);
    const backT = new Text({
      text: '返回',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(21 * LAYOUT_SCALE),
        fill: 0xe2e8f0,
        fontWeight: '600',
      },
    });
    backT.anchor.set(0.5);
    backT.position.set(backG.x + backW / 2, backG.y + backH / 2);
    this.addChild(backT);

    const poolLine = (chapterId: number): string => {
      const pool = enemyPoolForBookChapter(chapterId);
      return pool.map((t) => ENEMY_DEFS[t].name).join('、');
    };

    const bossId = bossIdForBookChapter(targetId);
    const bossName = bossDisplayName(bossId);

    const cardW = Math.min(Math.round(920 * LAYOUT_SCALE), GAME_WIDTH - pad * 2);
    const cardH = Math.round(468 * LAYOUT_SCALE);
    const cardX = (GAME_WIDTH - cardW) / 2;
    const cardY = Math.round(168 * LAYOUT_SCALE);

    const card = new Container();
    card.position.set(cardX, cardY);

    const border = new Graphics();
    border
      .roundRect(0, 0, cardW, cardH, Math.round(20 * LAYOUT_SCALE))
      .fill(0x0b1220)
      .stroke({ width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)), color: 0x3b82f6 });
    card.addChild(border);

    const pct = bookChapterStrengthPercent(targetId);
    const head = new Text({
      text: `第 ${targetId} 章`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(40 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '800',
      },
    });
    head.position.set(Math.round(28 * LAYOUT_SCALE), Math.round(28 * LAYOUT_SCALE));
    card.addChild(head);

    const str = new Text({
      text: `强度 ${pct}%`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xfbbf24,
        fontWeight: '700',
      },
    });
    str.position.set(Math.round(28 * LAYOUT_SCALE), Math.round(84 * LAYOUT_SCALE));
    card.addChild(str);

    if (allDone) {
      const badge = new Text({
        text: '全章已通关 · 可重复挑战',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(18 * LAYOUT_SCALE),
          fill: 0x86efac,
          fontWeight: '700',
        },
      });
      badge.anchor.set(1, 0);
      badge.position.set(cardW - Math.round(24 * LAYOUT_SCALE), Math.round(32 * LAYOUT_SCALE));
      card.addChild(badge);
    }

    const pool = new Text({
      text: `敌种池：${poolLine(targetId)}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xcbd5e1,
        lineHeight: Math.round(30 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: cardW - Math.round(56 * LAYOUT_SCALE),
        breakWords: true,
      },
    });
    pool.position.set(Math.round(28 * LAYOUT_SCALE), Math.round(132 * LAYOUT_SCALE));
    card.addChild(pool);

    const bossLine = new Text({
      text: `首领：${bossName}（出现于本章 3-6，按章节轮换）`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xfee2e2,
        lineHeight: Math.round(30 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: cardW - Math.round(56 * LAYOUT_SCALE),
        breakWords: true,
      },
    });
    bossLine.position.set(Math.round(28 * LAYOUT_SCALE), Math.round(228 * LAYOUT_SCALE));
    card.addChild(bossLine);

    const detW = Math.round(200 * LAYOUT_SCALE);
    const detH = Math.round(50 * LAYOUT_SCALE);
    const detX = cardW - detW - Math.round(24 * LAYOUT_SCALE);
    const detY = Math.round(312 * LAYOUT_SCALE);
    const detG = new Graphics();
    detG
      .roundRect(0, 0, detW, detH, Math.round(12 * LAYOUT_SCALE))
      .fill(0x1d4ed8)
      .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x60a5fa });
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
        fill: 0xffffff,
        fontWeight: '700',
      },
    });
    detT.anchor.set(0.5);
    detT.position.set(detX + detW / 2, detY + detH / 2);
    card.addChild(detT);

    const tip = new Text({
      text: '本章共 16 关（含策略、奖励与首领）。挑战中退出不保存进度；通关后自动写入本地。',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(17 * LAYOUT_SCALE),
        fill: 0x64748b,
        lineHeight: Math.round(24 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: cardW - Math.round(56 * LAYOUT_SCALE),
      },
    });
    tip.position.set(Math.round(28 * LAYOUT_SCALE), cardH - Math.round(88 * LAYOUT_SCALE));
    card.addChild(tip);

    this.addChild(card);

    const sideW = Math.round(200 * LAYOUT_SCALE);
    const sideH = Math.round(76 * LAYOUT_SCALE);
    const midW = Math.round(420 * LAYOUT_SCALE);
    const midH = Math.round(88 * LAYOUT_SCALE);
    const btnGap = Math.round(16 * LAYOUT_SCALE);
    const rowW = sideW + btnGap + midW + btnGap + sideW;
    const rowX = (GAME_WIDTH - rowW) / 2;
    const rowY = GAME_HEIGHT - Math.round(200 * LAYOUT_SCALE);

    const mkSide = (x: number, label: string): void => {
      const g = new Graphics();
      g.roundRect(0, 0, sideW, sideH, Math.round(14 * LAYOUT_SCALE)).fill(0x1e293b);
      g.stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x475569 });
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.position.set(x, rowY + (midH - sideH) / 2);
      g.on('pointertap', () => {});
      this.addChild(g);
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(22 * LAYOUT_SCALE),
          fill: 0x94a3b8,
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5);
      t.position.set(g.x + sideW / 2, g.y + sideH / 2);
      this.addChild(t);
    };

    mkSide(rowX, '家园');
    mkSide(rowX + sideW + btnGap + midW + btnGap, '强化');

    const chG = new Graphics();
    chG.roundRect(0, 0, midW, midH, Math.round(18 * LAYOUT_SCALE)).fill(0xfacc15);
    chG.stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0xca8a04 });
    chG.eventMode = 'static';
    chG.cursor = 'pointer';
    chG.position.set(rowX + sideW + btnGap, rowY);
    chG.on('pointertap', () => this.onPickChapter(targetId));
    this.addChild(chG);

    const chT = new Text({
      text: '挑 战',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(34 * LAYOUT_SCALE),
        fill: 0x1c1917,
        fontWeight: '900',
      },
    });
    chT.anchor.set(0.5);
    chT.position.set(chG.x + midW / 2, chG.y + midH / 2);
    this.addChild(chT);

    const foot = new Text({
      text: '「家园」「强化」功能开发中',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(16 * LAYOUT_SCALE),
        fill: 0x475569,
      },
    });
    foot.anchor.set(0.5, 1);
    foot.position.set(GAME_WIDTH / 2, GAME_HEIGHT - Math.round(28 * LAYOUT_SCALE));
    this.addChild(foot);
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    this.closeChapterDetailOverlay();
    super.destroy(options);
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
    const cid = this.targetChapterId;
    const bookM = bookChapterStrengthPercent(cid) / 100;
    const bossId = bossIdForBookChapter(cid);

    const poolTypes = [...enemyPoolForBookChapter(cid)] as EnemyClass[];
    const poolMeta: RoundMeta = {
      label: '本章敌种池',
      chapter: 1,
      sub: 1,
      kind: 'normal',
      enemies: poolTypes.map((t) => ({ type: t, count: 1 })),
    };

    const bossMeta: RoundMeta = {
      label: '3-6',
      chapter: 3,
      sub: 6,
      kind: 'boss',
      enemies: [{ type: 'boss', count: 1, bossId }],
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

    const panelBg = new Graphics();
    panelBg
      .roundRect(px, py, panelW, closeY + closeH + closeMargin - py, Math.round(18 * LAYOUT_SCALE))
      .fill(0x111827)
      .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x334155 });
    panelBg.eventMode = 'static';
    panelBg.on('pointertap', (e) => e.stopPropagation());
    layer.addChild(panelBg);

    const h1 = new Text({
      text: '章节情报详情',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(30 * LAYOUT_SCALE),
        fill: 0xfef9c3,
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
          fill: 0xf8fafc,
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
      const entries = battlePreviewPortraitEntries(meta);
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
          .fill(0x0f172a)
          .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: 0x334155 });
        c.addChild(cardBg);
        const bodyG = createEnemyBodyDisplay(ent.paint, 'chapterMini');
        if (bodyG instanceof Graphics) bodyG.scale.set(0.66 * LAYOUT_SCALE);
        bodyG.position.set(cardW / 2, cardH - Math.round(10 * LAYOUT_SCALE));
        c.addChild(bodyG);
        const cap = new Text({
          text: `${ent.title}×${ent.count}`,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(14 * LAYOUT_SCALE),
            fill: 0xbae6fd,
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
          fill: 0xe2e8f0,
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
    mkSection(`首领战 · ${bossDisplayName(bossId)}（3-6，按本章配置的首领）`, bossMeta, 15);

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
        fill: 0x64748b,
      },
    });
    hintScroll.eventMode = 'none';
    hintScroll.anchor.set(0.5, 1);
    hintScroll.position.set(GAME_WIDTH / 2, closeY - Math.round(8 * LAYOUT_SCALE));
    layer.addChild(hintScroll);

    const closeW = Math.round(240 * LAYOUT_SCALE);
    const closeG = new Graphics();
    closeG.roundRect(0, 0, closeW, closeH, Math.round(14 * LAYOUT_SCALE)).fill(0x2563eb);
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
        fill: 0xffffff,
        fontWeight: '600',
      },
    });
    closeT.anchor.set(0.5);
    closeT.position.set(closeG.x + closeW / 2, closeG.y + closeH / 2);
    layer.addChild(closeT);

    this.addChild(layer);
  }
}
