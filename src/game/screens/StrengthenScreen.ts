import type { Application } from 'pixi.js';
import { Container, FederatedPointerEvent, FederatedWheelEvent, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  CLASS_PROGRESS_DISPLAY_ORDER,
  classDisplayBaseStats,
  fragmentsRequiredForNextLevel,
  getClassFragments,
  getClassLevel,
  tryUpgradeClassLevel,
} from '../classProgressStorage';
import { HERO_REGISTRY, getHeroDef, heroQualityAccent, sortHeroDefsForStrengthenScroll } from '../heroRegistry';
import type { HeroId } from '../heroRegistry';
import { mountHeroInfoPanelContent } from '../ui/heroInfoPanel';
import {
  findDeployedSlotIndex,
  getDeployedHeroIds,
  getLotteryTicketsRemaining,
  getRecentLotteryHistory,
  HERO_DEPLOY_SLOT_CHAPTER,
  loadHeroMeta,
  maxHeroDeploySlots,
  nextStarCost,
  performHeroLotteryDraw,
  performHeroLotteryTenDraw,
  RECRUIT_TICKETS_PER_STAR,
  tryDeployHero,
  undeployHeroById,
} from '../heroMetaStorage';
import { drawGoldenSolidPanel, GOLDEN_PANEL_ACCENT } from '../ui/goldenSolidPanel';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { paintRedCountBadge } from '../ui/countBadge';
import { createStyledGameButton, redrawGameButtonFromStyle, type GameButton, type GameButtonStyleKey } from '../ui/gameButtons';
import { spawnFloatingGameTip } from '../ui/floatingGameTip';
import type { ModalLayer } from './ModalLayer';
import { allyBasicSkillDesc } from '../bondCopy';
import { createDraftAllyToken, createDraftHeroToken } from '../unitCircleTokens';
import { ALLY_DEFS } from '../unitDefs';
import { ALLY_CLASSES } from '../constants';
import { botAutoDeployPreferredHeroes } from '../bot/heroDeployPolicy';
import { isBotModeActive } from '../bot/context';
import { botRegisterScreen, botUnregisterScreen } from '../bot/registry';
import { wowChapterStageTitle } from '../wowBookData';
const PAD = Math.round(22 * LAYOUT_SCALE);
/** 垂直位移超过此值才视为滚动，避免误吞卡片点击 */
const HERO_SCROLL_SLOP_PX = 10;

function chapterLabelForSlot(slotIndex: number): string {
  const ch = HERO_DEPLOY_SLOT_CHAPTER[slotIndex];
  if (ch == null) return '默认可用';
  return `通关${wowChapterStageTitle(ch)}后解锁`;
}

/** 五角星顶点（朝上） */
function fillFivePointStar(g: Graphics, cx: number, cy: number, outerR: number, fillColor: number): void {
  const innerR = outerR * 0.38;
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
  }
  g.poly(pts).fill(fillColor);
}

function drawPadlock(g: Graphics, cx: number, cy: number, size: number, color: number): void {
  const s = size;
  g.clear();
  g.roundRect(cx - s * 0.38, cy - s * 0.05, s * 0.76, s * 0.62, Math.max(2, s * 0.08)).fill(color);
  g
    .arc(cx, cy - s * 0.12, s * 0.28, Math.PI * 1.05, Math.PI * 1.95, false)
    .stroke({ width: Math.max(3, s * 0.1), color, cap: 'round' });
}

/**
 * 英雄：上阵区 + 可滚动列表；招募：消耗招募券随机英雄/碎片。
 */
export class StrengthenScreen extends Container {
  private readonly modal: ModalLayer;
  private readonly onBack: () => void;
  private readonly classRoot = new Container();
  private readonly classScrollViewport = new Container();
  private readonly classScrollContent = new Container();
  private readonly classScrollMaskG = new Graphics();
  private classScrollViewH = 0;
  private classScrollMinY = 0;
  private readonly heroRoot = new Container();
  private readonly recruitRoot = new Container();
  private readonly slotLayer = new Container();
  private readonly scrollViewport = new Container();
  private readonly scrollContent = new Container();
  private readonly scrollMaskG = new Graphics();
  private readonly sheetLayer = new Container();
  /** 英雄详情面板内滚动区 dispose，须在 removeChildren 前调用 */
  private heroSheetPanelDispose: (() => void) | null = null;
  private readonly tabClassBtn: GameButton;
  private readonly tabHeroBtn: GameButton;
  private readonly tabRecruitBtn: GameButton;
  private readonly tabRecruitBadge = new Container();
  private readonly recruitHint: Text;
  private lotteryBtn!: GameButton;
  private tenLotteryBtn!: GameButton;
  private readonly lotteryDynamicText: Text;

  private tab: 'class' | 'hero' | 'recruit' = 'class';
  private scrollViewW = 0;
  private scrollViewH = 0;
  private scrollMinY = 0;
  private scrollDragActive = false;
  private scrollDragPointerId: number | null = null;
  private scrollDragStartClientY = 0;
  private scrollDragStartContentY = 0;
  /** 本段 pointer 序列中是否发生过明显垂直滚动 */
  private scrollGestureForTap = false;
  /** 滚动结束后吃掉下一次卡片的 tap，避免松手误开详情 */
  private blockNextHeroCardTap = false;
  private readonly boundDocPointerMove: (e: PointerEvent) => void;
  private readonly boundDocPointerUp: (e: PointerEvent) => void;

  constructor(_app: Application, modal: ModalLayer, onBack: () => void) {
    super();
    this.sortableChildren = true;
    this.modal = modal;
    this.onBack = onBack;
    this.boundDocPointerMove = this.onDocPointerMove.bind(this);
    this.boundDocPointerUp = this.onDocPointerUp.bind(this);

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0a0f1a);
    this.addChild(bg);

    const title = new Text({
      text: '职业 / 英雄',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(36 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '800',
      },
    });
    title.position.set(PAD, Math.round(24 * LAYOUT_SCALE));
    this.addChild(title);

    const backW = Math.round(140 * LAYOUT_SCALE);
    const backH = Math.round(48 * LAYOUT_SCALE);
    const backBtn = createStyledGameButton('classic', {
      text: '返回',
      width: backW,
      height: backH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    backBtn.position.set(GAME_WIDTH - backW - PAD, Math.round(22 * LAYOUT_SCALE));
    backBtn.on('pointertap', () => this.onBack());
    this.addChild(backBtn);

    const tabY = Math.round(78 * LAYOUT_SCALE);
    const tabW = Math.round(168 * LAYOUT_SCALE);
    const tabH = Math.round(44 * LAYOUT_SCALE);
    const tabGap = Math.round(10 * LAYOUT_SCALE);
    const tabFs = Math.round(20 * LAYOUT_SCALE);
    let tabX = PAD;

    this.tabClassBtn = createStyledGameButton('strengthenTabOn', {
      text: '职业强化',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    this.tabClassBtn.position.set(tabX, tabY);
    this.tabClassBtn.on('pointertap', () => this.setTab('class'));
    this.addChild(this.tabClassBtn);
    tabX += tabW + tabGap;

    this.tabHeroBtn = createStyledGameButton('strengthenTabOff', {
      text: '英雄',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    this.tabHeroBtn.position.set(tabX, tabY);
    this.tabHeroBtn.on('pointertap', () => this.setTab('hero'));
    this.addChild(this.tabHeroBtn);
    tabX += tabW + tabGap;

    this.tabRecruitBtn = createStyledGameButton('strengthenTabOff', {
      text: '招募',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    this.tabRecruitBtn.position.set(tabX, tabY);
    this.tabRecruitBtn.on('pointertap', () => this.setTab('recruit'));
    this.addChild(this.tabRecruitBtn);
    this.tabRecruitBadge.zIndex = 40;
    this.tabRecruitBadge.position.set(
      tabX + tabW - Math.round(6 * LAYOUT_SCALE),
      tabY + Math.round(8 * LAYOUT_SCALE),
    );
    paintRedCountBadge(this.tabRecruitBadge, getLotteryTicketsRemaining());
    this.addChild(this.tabRecruitBadge);

    const heroAreaTop = tabY + tabH + Math.round(14 * LAYOUT_SCALE);

    this.classRoot.position.set(0, heroAreaTop);
    this.classRoot.visible = true;
    this.addChild(this.classRoot);

    const classScrollTop = 0;
    this.classScrollViewH = GAME_HEIGHT - heroAreaTop - Math.round(24 * LAYOUT_SCALE);
    this.classScrollViewport.position.set(PAD, classScrollTop);
    this.classScrollViewport.eventMode = 'static';
    this.classScrollViewport.cursor = 'grab';
    this.classScrollMaskG.rect(0, 0, GAME_WIDTH - PAD * 2, this.classScrollViewH).fill(0xffffff);
    this.classScrollViewport.addChild(this.classScrollMaskG);
    this.classScrollViewport.mask = this.classScrollMaskG;
    this.classScrollContent.eventMode = 'static';
    this.classScrollViewport.addChild(this.classScrollContent);
    this.classScrollViewport.hitArea = new Rectangle(0, 0, GAME_WIDTH - PAD * 2, this.classScrollViewH);
    this.classScrollViewport.on('wheel', (e: FederatedWheelEvent) => {
      if (this.tab !== 'class') return;
      e.preventDefault();
      let dy = typeof e.deltaY === 'number' ? e.deltaY : 0;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 96;
      this.classScrollContent.y -= dy * 0.85;
      this.clampClassScroll();
    });
    this.classRoot.addChild(this.classScrollViewport);

    this.heroRoot.position.set(0, heroAreaTop);
    this.heroRoot.visible = false;
    this.addChild(this.heroRoot);

    this.slotLayer.position.set(0, 0);
    this.heroRoot.addChild(this.slotLayer);

    const divider = new Graphics();
    const divY = Math.round(168 * LAYOUT_SCALE);
    divider
      .moveTo(PAD, divY)
      .lineTo(GAME_WIDTH - PAD, divY)
      .stroke({ width: Math.max(1, Math.round(2 * LAYOUT_SCALE)), color: 0x334155, alpha: 0.9 });
    this.heroRoot.addChild(divider);

    const helpW = Math.round(100 * LAYOUT_SCALE);
    const helpH = Math.round(40 * LAYOUT_SCALE);
    const helpBtn = createStyledGameButton('classic', {
      text: '帮助',
      width: helpW,
      height: helpH,
      fontSize: Math.round(18 * LAYOUT_SCALE),
    });
    helpBtn.position.set(GAME_WIDTH - PAD - helpW, divY + Math.round(8 * LAYOUT_SCALE));
    helpBtn.on('pointertap', () => this.showHelp());
    this.heroRoot.addChild(helpBtn);

    const scrollTop = divY + Math.round(56 * LAYOUT_SCALE);
    this.scrollViewW = GAME_WIDTH - PAD * 2;
    this.scrollViewH = GAME_HEIGHT - heroAreaTop - scrollTop - Math.round(20 * LAYOUT_SCALE);
    this.scrollViewport.position.set(PAD, scrollTop);
    this.scrollViewport.eventMode = 'static';
    this.scrollViewport.cursor = 'grab';
    this.scrollMaskG.rect(0, 0, this.scrollViewW, this.scrollViewH).fill(0xffffff);
    this.scrollViewport.addChild(this.scrollMaskG);
    this.scrollViewport.mask = this.scrollMaskG;
    /** passive：子节点照常可点；容器自身不抢事件（勿用 none，会禁掉整棵子树交互） */
    this.scrollContent.eventMode = 'passive';
    this.scrollViewport.addChild(this.scrollContent);
    this.scrollViewport.hitArea = new Rectangle(0, 0, this.scrollViewW, this.scrollViewH);

    this.scrollViewport.on('wheel', (e: FederatedWheelEvent) => {
      if (this.tab !== 'hero') return;
      e.preventDefault();
      let dy = typeof e.deltaY === 'number' ? e.deltaY : 0;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 96;
      this.scrollContent.y -= dy * 0.85;
      this.clampScroll();
    });

    this.scrollViewport.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.tab !== 'hero') return;
      if (this.scrollMinY >= -0.5) return;
      this.beginHeroScrollDrag(e);
    });

    this.heroRoot.addChild(this.scrollViewport);

    this.recruitRoot.visible = false;
    this.recruitRoot.position.set(0, heroAreaTop);
    this.addChild(this.recruitRoot);

    this.recruitHint = new Text({
      text:
        '【招募规则】\n' +
        `· 剩余招募券 = 已通关章「评价星」总和 × ${RECRUIT_TICKETS_PER_STAR} − 已用（单抽扣 1、十连扣 10）。数据仅存本机。\n` +
        '· 约 95% 职业碎片（五职业均分），约 5% 英雄（先仅能出蓝色品质；蓝色集齐后出紫；紫集齐后按 60% 蓝 / 30% 紫 / 10% 橙）。碎片在「职业强化」消耗。\n' +
        '· 十连：前 9 次若全无英雄，第 10 次必出英雄。\n' +
        '· 同名卡 2 / 3 / 5 / 8 张分别自动升至 2～5 星。',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(17 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - PAD * 2,
        lineHeight: Math.round(24 * LAYOUT_SCALE),
      },
    });
    this.recruitHint.position.set(PAD, Math.round(24 * LAYOUT_SCALE));
    this.recruitRoot.addChild(this.recruitHint);

    const lotW = Math.round(280 * LAYOUT_SCALE);
    const lotH = Math.round(56 * LAYOUT_SCALE);
    const lotBtnGap = Math.round(12 * LAYOUT_SCALE);
    this.lotteryBtn = createStyledGameButton('accent', {
      text: '单抽（1次）',
      width: lotW,
      height: lotH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    this.lotteryBtn.position.set(PAD, this.recruitHint.y + this.recruitHint.height + Math.round(18 * LAYOUT_SCALE));
    this.lotteryBtn.on('pointertap', () => this.doHeroLottery());
    this.recruitRoot.addChild(this.lotteryBtn);

    this.tenLotteryBtn = createStyledGameButton('accent', {
      text: '十连（10次）',
      width: lotW,
      height: lotH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    this.tenLotteryBtn.position.set(PAD, this.lotteryBtn.y + lotH + lotBtnGap);
    this.tenLotteryBtn.on('pointertap', () => this.doHeroLotteryTen());
    this.recruitRoot.addChild(this.tenLotteryBtn);

    this.lotteryDynamicText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(15 * LAYOUT_SCALE),
        fill: 0x7dd3fc,
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - PAD * 2,
        lineHeight: Math.round(22 * LAYOUT_SCALE),
      },
    });
    this.lotteryDynamicText.position.set(PAD, this.tenLotteryBtn.y + lotH + Math.round(16 * LAYOUT_SCALE));
    this.recruitRoot.addChild(this.lotteryDynamicText);

    this.sheetLayer.visible = false;
    this.sheetLayer.eventMode = 'static';
    this.sheetLayer.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.addChild(this.sheetLayer);

    this.refreshTabsVisual();
    this.drawClassStrengthenPanels();
    this.refreshAll();
    this.refreshRecruitChrome();

    attachScreenDebugLabel(this, 'StrengthenScreen');

    if (isBotModeActive()) {
      botRegisterScreen({
        kind: 'strengthen',
        strengthen: {
          tryAutoDeployHeroes: () => this.botTryAutoDeployHeroes(),
          tryRecruitTen: () => this.botTryRecruitTen(),
          tryRecruitOne: () => this.botTryRecruitOne(),
          tryUpgradeOnce: () => this.botTryUpgradeOnce(),
          back: () => this.onBack(),
        },
      });
    }
  }

  botTryAutoDeployHeroes(): boolean {
    const changed = botAutoDeployPreferredHeroes();
    if (changed) this.refreshAll();
    return changed;
  }

  botTryRecruitTen(): boolean {
    this.setTab('recruit');
    const r = performHeroLotteryTenDraw();
    if (!r.ok) return false;
    this.modal.alertTenPullLotteryResults(r.results, () => {
      this.botTryAutoDeployHeroes();
      this.refreshAll();
      this.refreshRecruitChrome();
      this.drawClassStrengthenPanels();
    });
    return true;
  }

  botTryRecruitOne(): boolean {
    this.setTab('recruit');
    const r = performHeroLotteryDraw();
    if (!r.ok) return false;
    this.modal.alertSinglePullLotteryResult(r, () => {
      this.botTryAutoDeployHeroes();
      this.refreshAll();
      this.refreshRecruitChrome();
      this.drawClassStrengthenPanels();
    });
    return true;
  }

  botTryUpgradeOnce(): boolean {
    this.setTab('class');
    for (const cls of ALLY_CLASSES) {
      if (tryUpgradeClassLevel(cls)) {
        this.drawClassStrengthenPanels();
        this.refreshTabsVisual();
        return true;
      }
    }
    return false;
  }

  private clampClassScroll(): void {
    this.classScrollContent.y = Math.min(0, Math.max(this.classScrollMinY, this.classScrollContent.y));
  }

  /** 职业强化：五职业纵列，每行左头像/名、中等级与养成、右升级与进度条，底栏职业技能说明 */
  private drawClassStrengthenPanels(): void {
    this.classScrollContent.removeChildren();
    const rowW = GAME_WIDTH - PAD * 2;
    const panelRowHExtraBase = Math.round(10 * LAYOUT_SCALE);
    const panelRowHTrimOther = Math.round(5 * LAYOUT_SCALE);
    const panelRowHExtraArcher = Math.round(5 * LAYOUT_SCALE);
    const rowH = Math.round(196 * LAYOUT_SCALE);
    const rowGap = Math.round(12 * LAYOUT_SCALE);
    const leftW = Math.round(108 * LAYOUT_SCALE);
    const avatarD = Math.round(72 * LAYOUT_SCALE);
    const rightW = Math.round(200 * LAYOUT_SCALE);
    const midX = leftW + Math.round(16 * LAYOUT_SCALE);

    let y = 0;
    for (const cls of CLASS_PROGRESS_DISPLAY_ORDER) {
      const row = new Container();
      row.position.set(0, y);

      const AVATAR_SHIFT_Y = Math.round(30 * LAYOUT_SCALE);
      const avWrap = new Container();
      avWrap.position.set(leftW / 2, Math.round(18 * LAYOUT_SCALE) + avatarD / 2 + AVATAR_SHIFT_Y);
      const tok = createDraftAllyToken(cls, avatarD);
      tok.eventMode = 'none';
      avWrap.addChild(tok);
      row.addChild(avWrap);

      const nameT = new Text({
        text: ALLY_DEFS[cls].name,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(15 * LAYOUT_SCALE),
          fill: 0xe2e8f0,
          fontWeight: '700',
          align: 'center',
        },
      });
      nameT.anchor.set(0.5, 0);
      nameT.position.set(
        leftW / 2,
        Math.round(18 * LAYOUT_SCALE) +
          avatarD +
          Math.round(6 * LAYOUT_SCALE) +
          AVATAR_SHIFT_Y -
          Math.round(30 * LAYOUT_SCALE),
      );
      row.addChild(nameT);

      const st = classDisplayBaseStats(cls);
      const need = fragmentsRequiredForNextLevel(st.level);
      const frag = getClassFragments(cls);

      const mFs = Math.round(17 * LAYOUT_SCALE);
      const mLh = Math.round(26 * LAYOUT_SCALE);
      const mFf = 'system-ui, "Microsoft YaHei", sans-serif';
      const btnW = Math.round(168 * LAYOUT_SCALE);
      const btnH = Math.round(44 * LAYOUT_SCALE);
      const talentBtnH = Math.round(40 * LAYOUT_SCALE);
      const barH = Math.round(20 * LAYOUT_SCALE);
      const colGap = Math.round(10 * LAYOUT_SCALE);
      const rightTopY = Math.round(22 * LAYOUT_SCALE);
      const rightColH = barH + colGap + btnH + colGap + talentBtnH;
      const rx = rowW - rightW + Math.round(8 * LAYOUT_SCALE);
      const dividerX = rx - Math.round(12 * LAYOUT_SCALE);
      const skillPadX = midX;
      const skillW = Math.max(Math.round(72 * LAYOUT_SCALE), dividerX - skillPadX - Math.round(8 * LAYOUT_SCALE));
      const skillGap = Math.round(4 * LAYOUT_SCALE);
      const skillBottomPad = Math.round(12 * LAYOUT_SCALE);
      const skillMidGap = Math.round(14 * LAYOUT_SCALE);

      const skillLabel = new Text({
        text: '职业技能：',
        style: {
          fontFamily: mFf,
          fontSize: mFs,
          fill: 0xcbd5e1,
          fontWeight: '600',
        },
      });
      const skillBody = new Text({
        text: allyBasicSkillDesc(cls),
        style: {
          fontFamily: mFf,
          fontSize: mFs,
          fill: 0xcbd5e1,
          wordWrap: true,
          wordWrapWidth: skillW,
          lineHeight: mLh,
        },
      });
      const skillBlockH = skillLabel.height + skillGap + skillBody.height;
      const midStatLines = 3;
      const midTopY = Math.round(22 * LAYOUT_SCALE);
      const midContentH = midTopY + midStatLines * mLh;
      const panelRowHExtra =
        cls === 'archer'
          ? panelRowHExtraBase + panelRowHExtraArcher
          : panelRowHExtraBase - panelRowHTrimOther;
      const panelRowH =
        Math.max(
          rowH,
          rightTopY + rightColH + Math.round(14 * LAYOUT_SCALE),
          midContentH + skillMidGap + skillBlockH + skillBottomPad,
        ) + panelRowHExtra;
      const skillY = panelRowH - skillBottomPad - skillBlockH;

      const bg = new Graphics();
      bg.roundRect(0, 0, rowW, panelRowH, Math.round(16 * LAYOUT_SCALE)).fill(0x111827).stroke({
        width: Math.max(2, Math.round(2 * LAYOUT_SCALE)),
        color: 0x334155,
      });
      row.addChildAt(bg, 0);

      const midBlock = new Container();
      midBlock.position.set(midX, midTopY);
      let mLy = 0;
      const pushParts = (parts: { t: string; c: number; w?: '400' | '600' | '700' }[]): void => {
        let lx = 0;
        for (const p of parts) {
          const tx = new Text({
            text: p.t,
            style: {
              fontFamily: mFf,
              fontSize: mFs,
              fill: p.c,
              fontWeight: p.w ?? '400',
            },
          });
          tx.position.set(lx, mLy);
          midBlock.addChild(tx);
          lx += tx.width;
        }
        mLy += mLh;
      };
      pushParts([{ t: `等级 ${st.level}`, c: 0xcbd5e1, w: '600' }]);
      if (st.atCap) {
        pushParts([
          { t: '生命', c: 0xcbd5e1 },
          { t: String(st.maxHp), c: 0xf1f5f9, w: '700' },
          { t: '（已满）', c: 0x64748b },
          { t: '  攻击 ', c: 0xcbd5e1 },
          { t: String(st.atk), c: 0xf1f5f9, w: '700' },
          { t: '（已满）', c: 0x64748b },
        ]);
      } else {
        pushParts([
          { t: '生命', c: 0xcbd5e1 },
          { t: String(st.maxHp), c: 0xf1f5f9, w: '700' },
          { t: `（+${st.deltaHp}）`, c: 0x22c55e, w: '700' },
          { t: '  攻击 ', c: 0xcbd5e1 },
          { t: String(st.atk), c: 0xf1f5f9, w: '700' },
          { t: `（+${st.deltaAtk}）`, c: 0x22c55e, w: '700' },
        ]);
      }
      const secPerHit = ALLY_DEFS[cls].attackSpeed;
      const dps = st.atk / secPerHit;
      const secStr = Number(secPerHit.toFixed(2)).toString();
      const dpsStr = (Math.round(dps * 10) / 10).toFixed(1);
      pushParts([{ t: `攻速${secStr}秒/每下（${dpsStr}秒伤）`, c: 0x93c5fd }]);
      row.addChild(midBlock);

      const dividerLine = new Graphics();
      const lineTop = Math.round(14 * LAYOUT_SCALE);
      const lineBot = panelRowH - Math.round(14 * LAYOUT_SCALE);
      dividerLine
        .moveTo(dividerX, lineTop)
        .lineTo(dividerX, lineBot)
        .stroke({ width: Math.max(1, Math.round(2 * LAYOUT_SCALE)), color: 0x475569, alpha: 0.85 });
      row.addChild(dividerLine);

      const barW = btnW;
      const barY = rightTopY;
      const barBg = new Graphics();
      barBg.roundRect(rx, barY, barW, barH, Math.round(8 * LAYOUT_SCALE)).fill(0x0f172a);
      row.addChild(barBg);
      const ratio = need != null && need > 0 ? Math.max(0, Math.min(1, frag / need)) : st.level >= 999 ? 1 : 0;
      const barFill = new Graphics();
      barFill
        .roundRect(rx, barY, Math.max(2, barW * ratio), barH, Math.round(8 * LAYOUT_SCALE))
        .fill(0x22c55e);
      row.addChild(barFill);
      const progLab = new Text({
        text: need != null ? `${frag}/${need}` : 'MAX',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, monospace',
          fontSize: Math.round(12 * LAYOUT_SCALE),
          fill: 0xffffff,
          fontWeight: '700',
        },
      });
      progLab.anchor.set(0.5, 0.5);
      progLab.position.set(rx + barW / 2, barY + barH / 2);
      row.addChild(progLab);

      const upBtnY = barY + barH + colGap;
      const canUp = need != null && frag >= need;
      const upBtn = createStyledGameButton(canUp ? 'accent' : 'classicMuted', {
        text: st.level >= 999 ? '已满级' : '升级',
        width: btnW,
        height: btnH,
        fontSize: Math.round(18 * LAYOUT_SCALE),
      });
      upBtn.position.set(rx, upBtnY);
      if (st.level < 999 && need != null) {
        upBtn.eventMode = 'static';
        upBtn.cursor = canUp ? 'pointer' : 'default';
        upBtn.on('pointertap', () => {
          if (!tryUpgradeClassLevel(cls)) {
            if (!canUp) {
              spawnFloatingGameTip(this, `碎片不足（需要 ${need}）`);
            }
            return;
          }
          spawnFloatingGameTip(this, `${ALLY_DEFS[cls].name} 已升至 Lv.${getClassLevel(cls)}`);
          this.drawClassStrengthenPanels();
          this.refreshTabsVisual();
        });
      } else {
        upBtn.eventMode = 'passive';
      }
      row.addChild(upBtn);

      const talentBtnY = upBtnY + btnH + colGap;
      const talentBtn = createStyledGameButton('accent', {
        text: '天赋树',
        width: btnW,
        height: talentBtnH,
        fontSize: Math.round(16 * LAYOUT_SCALE),
      });
      talentBtn.position.set(rx, talentBtnY);
      talentBtn.eventMode = 'static';
      talentBtn.cursor = 'pointer';
      talentBtn.on('pointertap', () => spawnFloatingGameTip(this, '暂未开放'));
      row.addChild(talentBtn);

      skillLabel.position.set(skillPadX, skillY);
      row.addChild(skillLabel);
      skillBody.position.set(skillPadX, skillY + skillLabel.height + skillGap);
      row.addChild(skillBody);

      this.classScrollContent.addChild(row);
      y += panelRowH + rowGap;
    }

    const footFs = Math.round(15 * LAYOUT_SCALE);
    const footLh = Math.round(22 * LAYOUT_SCALE);
    const heroBondFootnote = new Text({
      text: '英雄单位同样享有职业技能和职业羁绊，但是不提供职业羁绊人口',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: footFs,
        fill: GOLDEN_PANEL_ACCENT,
        wordWrap: true,
        wordWrapWidth: rowW,
        lineHeight: footLh,
        align: 'center',
      },
    });
    heroBondFootnote.anchor.set(0.5, 0);
    heroBondFootnote.position.set(rowW / 2, y + Math.round(4 * LAYOUT_SCALE));
    this.classScrollContent.addChild(heroBondFootnote);
    y += heroBondFootnote.height + Math.round(10 * LAYOUT_SCALE);

    const contentH = y - rowGap;
    this.classScrollMinY = Math.min(0, this.classScrollViewH - contentH);
    this.classScrollContent.y = 0;
    this.clampClassScroll();
  }

  private beginHeroScrollDrag(e: FederatedPointerEvent): void {
    if (this.scrollMinY >= -0.5) return;
    this.endHeroScrollDrag();
    this.scrollDragActive = true;
    this.scrollGestureForTap = false;
    this.scrollDragPointerId = e.pointerId;
    this.scrollDragStartClientY = e.client.y;
    this.scrollDragStartContentY = this.scrollContent.y;
    document.addEventListener('pointermove', this.boundDocPointerMove, { passive: true });
    document.addEventListener('pointerup', this.boundDocPointerUp, { passive: true });
    document.addEventListener('pointercancel', this.boundDocPointerUp, { passive: true });
    this.scrollViewport.cursor = 'grabbing';
  }

  private onDocPointerMove(e: PointerEvent): void {
    if (!this.scrollDragActive || e.pointerId !== this.scrollDragPointerId) return;
    const dy = e.clientY - this.scrollDragStartClientY;
    if (Math.abs(dy) > HERO_SCROLL_SLOP_PX) this.scrollGestureForTap = true;
    this.scrollContent.y = this.scrollDragStartContentY + dy;
    this.clampScroll();
  }

  private onDocPointerUp(e: PointerEvent): void {
    if (!this.scrollDragActive || e.pointerId !== this.scrollDragPointerId) return;
    if (this.scrollGestureForTap) this.blockNextHeroCardTap = true;
    this.scrollGestureForTap = false;
    this.endHeroScrollDrag();
  }

  private endHeroScrollDrag(): void {
    if (!this.scrollDragActive && this.scrollDragPointerId === null) return;
    this.scrollDragActive = false;
    this.scrollDragPointerId = null;
    document.removeEventListener('pointermove', this.boundDocPointerMove);
    document.removeEventListener('pointerup', this.boundDocPointerUp);
    document.removeEventListener('pointercancel', this.boundDocPointerUp);
    this.updateScrollViewportCursor();
  }

  private updateScrollViewportCursor(): void {
    const canScroll = this.tab === 'hero' && this.scrollMinY < -0.5;
    this.scrollViewport.cursor = canScroll ? 'grab' : 'default';
  }

  private clampScroll(): void {
    this.scrollContent.y = Math.min(0, Math.max(this.scrollMinY, this.scrollContent.y));
  }

  private setTab(t: 'class' | 'hero' | 'recruit'): void {
    this.tab = t;
    this.classRoot.visible = t === 'class';
    this.heroRoot.visible = t === 'hero';
    this.recruitRoot.visible = t === 'recruit';
    this.refreshTabsVisual();
    if (t === 'hero') {
      this.clampScroll();
      this.updateScrollViewportCursor();
    } else {
      this.endHeroScrollDrag();
    }
    if (t === 'class') {
      this.drawClassStrengthenPanels();
      this.clampClassScroll();
    }
    if (t === 'recruit') {
      this.refreshRecruitChrome();
    }
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    botUnregisterScreen('strengthen');
    this.endHeroScrollDrag();
    this.closeHeroSheet();
    super.destroy(options);
  }

  private refreshTabsVisual(): void {
    const tabW = Math.round(168 * LAYOUT_SCALE);
    const tabH = Math.round(44 * LAYOUT_SCALE);
    const tabFs = Math.round(20 * LAYOUT_SCALE);
    redrawGameButtonFromStyle(this.tabClassBtn, this.tab === 'class' ? 'strengthenTabOn' : 'strengthenTabOff', {
      text: '职业强化',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    redrawGameButtonFromStyle(this.tabHeroBtn, this.tab === 'hero' ? 'strengthenTabOn' : 'strengthenTabOff', {
      text: '英雄',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    redrawGameButtonFromStyle(this.tabRecruitBtn, this.tab === 'recruit' ? 'strengthenTabOn' : 'strengthenTabOff', {
      text: '招募',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    paintRedCountBadge(this.tabRecruitBadge, getLotteryTicketsRemaining());
  }

  private refreshRecruitChrome(): void {
    const n = getLotteryTicketsRemaining();
    paintRedCountBadge(this.tabRecruitBadge, n);
    const recent = getRecentLotteryHistory(6);
    const lines: string[] = [`当前剩余招募券：${n}`];
    if (recent.length) {
      lines.push('', '最近结果（新→旧）：');
      for (const e of recent) {
        const d = new Date(e.ts);
        const ts = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (e.kind === 'fragment') {
          lines.push(`· ${ALLY_DEFS[e.allyClass].name}职业碎片（${ts}）`);
        } else {
          const def = getHeroDef(e.heroId);
          const nm = def?.name ?? e.heroId;
          lines.push(`· ${nm}（${ts}）`);
        }
      }
    }
    this.lotteryDynamicText.text = lines.join('\n');
  }

  private showHelp(): void {
    const msg = [
      '【操作说明】',
      '· 在下方列表点击英雄卡片，打开详情面板，可上阵或下阵。',
      '· 已上阵的英雄也可点击上方栏位中的头像进行下阵。',
      '· 列表中带品质色外框的英雄表示当前已上阵。',
      '· 英雄技能的强化与备战「职业羁绊」层数相关（如穆兰旋风斩随战士羁绊变化）。',
      '',
      '【招募】',
      `· 每获得 1 颗关卡评价星，获得 ${RECRUIT_TICKETS_PER_STAR} 张招募券；总星数见选关界面。`,
      '· 单抽约 95% 职业碎片（五职业均等）、约 5% 英雄卡；英雄：未集齐蓝卡仅出蓝，蓝齐后至紫齐仅蓝/紫（60%:30%），紫齐后 60% 蓝 / 30% 紫 / 10% 橙（橙含品质 3～5）。十连若前 9 次无英雄，第 10 次必出英雄。',
      '',
      '【职业强化】',
      `· 消耗碎片升级各职业：每级固定消耗 ${fragmentsRequiredForNextLevel(1) ?? 5} 枚该职业碎片；相对 1 级初始每升一级乘区 +3%（线性：Lv 对应 1+(Lv−1)×3%），局内再取整；升级预览里的「（+N）」为升到下一级后的取整差分。`,
      '',
      '【栏位解锁】',
      '· 第 1 个上阵栏：默认可用',
      `· 第 2 个上阵栏：通关${wowChapterStageTitle(HERO_DEPLOY_SLOT_CHAPTER[1]!)}后解锁`,
      `· 第 3 个上阵栏：通关${wowChapterStageTitle(HERO_DEPLOY_SLOT_CHAPTER[2]!)}后解锁`,
      '· 最多可同时上阵 3 名英雄；同职业仅能保留一名在阵上，新上阵同职业会自动换下阵上该职业英雄（有飘字提示）。',
    ].join('\n');
    this.modal.alert(msg, () => {});
  }

  private doHeroLottery(): void {
    const r = performHeroLotteryDraw();
    if (!r.ok) {
      this.modal.alert(
        `招募券不足。\n\n总券数 = 各关评价星之和 × ${RECRUIT_TICKETS_PER_STAR}；提高尚未满星的已通关关卡可增加总星数，详见招募页说明。`,
        () => {},
      );
      return;
    }
    this.modal.alertSinglePullLotteryResult(r, () => {
      this.refreshAll();
      this.refreshRecruitChrome();
      this.drawClassStrengthenPanels();
    });
  }

  private doHeroLotteryTen(): void {
    const r = performHeroLotteryTenDraw();
    if (!r.ok) {
      this.modal.alert(
        `招募券不足。\n\n十连需要至少 10 张券；总券数 = 各章评价星之和 × ${RECRUIT_TICKETS_PER_STAR}（每章最多 3 星），减去已用单抽/十连次数得到剩余。`,
        () => {},
      );
      return;
    }
    this.modal.alertTenPullLotteryResults(r.results, () => {
      this.refreshAll();
      this.refreshRecruitChrome();
      this.drawClassStrengthenPanels();
    });
  }

  private refreshAll(): void {
    this.drawSlots();
    this.drawHeroScroll();
    this.refreshRecruitChrome();
    this.drawClassStrengthenPanels();
  }

  private drawSlots(): void {
    this.slotLayer.removeChildren();
    const cap = maxHeroDeploySlots();
    const dep = [...getDeployedHeroIds()] as (HeroId | null)[];
    const slotW = Math.round(132 * LAYOUT_SCALE);
    const slotH = Math.round(152 * LAYOUT_SCALE);
    const gap = Math.round(18 * LAYOUT_SCALE);
    const startX = PAD;

    for (let s = 0; s < 3; s++) {
      const locked = s >= cap;
      const x = startX + s * (slotW + gap);
      const hid = dep[s];

      const g = new Graphics();
      g.roundRect(0, 0, slotW, slotH, Math.round(14 * LAYOUT_SCALE)).fill(locked ? 0x0f172a : 0x111827);
      g.stroke({
        width: Math.max(2, Math.round(2 * LAYOUT_SCALE)),
        color: locked ? 0x1e293b : 0x475569,
      });
      g.position.set(x, 0);
      this.slotLayer.addChild(g);

      if (locked) {
        const lock = new Graphics();
        drawPadlock(lock, slotW / 2, slotH * 0.38, Math.round(52 * LAYOUT_SCALE), 0x64748b);
        lock.position.set(x, 0);
        this.slotLayer.addChild(lock);
        const lockLab = new Text({
          text: chapterLabelForSlot(s),
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(14 * LAYOUT_SCALE),
            fill: 0x64748b,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: slotW - Math.round(12 * LAYOUT_SCALE),
            lineHeight: Math.round(20 * LAYOUT_SCALE),
          },
        });
        lockLab.anchor.set(0.5, 0);
        lockLab.position.set(x + slotW / 2, Math.round(92 * LAYOUT_SCALE));
        this.slotLayer.addChild(lockLab);
        continue;
      }

      if (hid) {
        const def = getHeroDef(hid);
        if (def) {
          const dia = Math.round(88 * LAYOUT_SCALE);
          const tok = createDraftHeroToken(hid, def.allyClass, dia);
          tok.eventMode = 'static';
          tok.cursor = 'pointer';
          tok.position.set(x + slotW / 2, Math.round(56 * LAYOUT_SCALE) + dia / 2);
          tok.on('pointertap', () => this.openHeroSheet(hid));
          this.slotLayer.addChild(tok);
          const nm = new Text({
            text: `${def.name}`,
            style: {
              fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
              fontSize: Math.round(13 * LAYOUT_SCALE),
              fill: heroQualityAccent(def.quality),
              align: 'center',
              fontWeight: '600',
            },
          });
          nm.anchor.set(0.5, 0);
          nm.position.set(x + slotW / 2, Math.round(118 * LAYOUT_SCALE));
          this.slotLayer.addChild(nm);
        }
      } else {
        const t = new Text({
          text: '空栏位',
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(16 * LAYOUT_SCALE),
            fill: 0x475569,
            fontWeight: '600',
          },
        });
        t.anchor.set(0.5, 0.5);
        t.position.set(x + slotW / 2, slotH / 2);
        this.slotLayer.addChild(t);
      }
    }
  }

  private drawHeroScroll(): void {
    this.scrollContent.removeChildren();
    this.blockNextHeroCardTap = false;
    const meta = loadHeroMeta();
    const heroListOrder = sortHeroDefsForStrengthenScroll(HERO_REGISTRY, meta.heroes);
    const cols = 3;
    const gap = Math.round(14 * LAYOUT_SCALE);
    const cellW = Math.floor((this.scrollViewW - gap * (cols - 1)) / cols);
    /** 代币圆盘在本地 y∈[-avatarD,0]，须把 avatarWrap 的 y 设为顶距+avatarD，避免圆顶伸出卡片上缘 */
    const topPad = Math.round(14 * LAYOUT_SCALE);
    const avatarD = Math.round(72 * LAYOUT_SCALE);
    const gapUnderAvatar = Math.round(10 * LAYOUT_SCALE);
    const nameLine = Math.round(22 * LAYOUT_SCALE);
    const classGap = Math.round(20 * LAYOUT_SCALE);
    const starBand = Math.round(26 * LAYOUT_SCALE);
    const barH = Math.round(22 * LAYOUT_SCALE);
    const bottomPad = Math.round(12 * LAYOUT_SCALE);
    const avatarBottomY = topPad + avatarD;
    const nameY = avatarBottomY + gapUnderAvatar;
    const classY = nameY + nameLine;
    const starsY = classY + classGap;
    const barY = starsY + starBand;
    const cellH = barY + barH + bottomPad;

    let col = 0;
    let row = 0;
    for (const h of heroListOrder) {
      const x = col * (cellW + gap);
      const y = row * (cellH + gap);
      const unlocked = !!meta.heroes[h.id];
      const deployed = findDeployedSlotIndex(h.id) != null;
      const entry = meta.heroes[h.id];
      const stars = unlocked ? (entry?.stars ?? 1) : 0;
      const dup = entry?.duplicates ?? 0;
      const need = nextStarCost(stars);

      const wrap = new Container();
      wrap.position.set(x, y);
      wrap.eventMode = 'static';
      wrap.cursor = unlocked ? 'pointer' : 'default';
      wrap.hitArea = new Rectangle(0, 0, cellW, cellH);
      wrap.on('pointertap', (e) => {
        e.stopPropagation();
        if (this.blockNextHeroCardTap) {
          this.blockNextHeroCardTap = false;
          return;
        }
        if (!unlocked) return;
        this.openHeroSheet(h.id);
      });

      const bg = new Graphics();
      bg.eventMode = 'none';
      const strokeColor = deployed ? heroQualityAccent(h.quality) : unlocked ? 0x334155 : 0x1e293b;
      const strokeW = deployed ? Math.max(3, Math.round(3 * LAYOUT_SCALE)) : Math.max(1, Math.round(1.5 * LAYOUT_SCALE));
      bg
        .roundRect(0, 0, cellW, cellH, Math.round(14 * LAYOUT_SCALE))
        .fill(unlocked ? 0x111827 : 0x0c1222)
        .stroke({
          width: strokeW,
          color: strokeColor,
        });
      wrap.addChild(bg);

      const avatarWrap = new Container();
      avatarWrap.position.set(cellW / 2, avatarBottomY);
      const tok = createDraftHeroToken(h.id, h.allyClass, avatarD, { portraitLocked: !unlocked });
      tok.eventMode = 'none';
      tok.alpha = 1;
      avatarWrap.addChild(tok);
      avatarWrap.eventMode = 'none';
      wrap.addChild(avatarWrap);

      const nameT = new Text({
        text: unlocked ? h.name : '???',
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(16 * LAYOUT_SCALE),
          fill: heroQualityAccent(h.quality),
          fontWeight: '700',
          align: 'center',
        },
      });
      nameT.anchor.set(0.5, 0);
      nameT.position.set(cellW / 2, nameY);
      nameT.eventMode = 'none';
      wrap.addChild(nameT);

      const classT = new Text({
        text: ALLY_DEFS[h.allyClass].name,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(14 * LAYOUT_SCALE),
          fill: unlocked ? 0x94a3b8 : 0x475569,
          align: 'center',
        },
      });
      classT.anchor.set(0.5, 0);
      classT.position.set(cellW / 2, classY);
      classT.eventMode = 'none';
      wrap.addChild(classT);

      const starRow = new Container();
      starRow.eventMode = 'none';
      starRow.position.set(cellW / 2, starsY);
      const starStep = Math.round(22 * LAYOUT_SCALE);
      const starR = Math.round(9 * LAYOUT_SCALE);
      for (let si = 0; si < 5; si++) {
        const sg = new Graphics();
        fillFivePointStar(sg, (si - 2) * starStep, 0, starR, si < stars ? 0xfbbf24 : 0x334155);
        starRow.addChild(sg);
      }
      wrap.addChild(starRow);

      const barW = cellW - Math.round(20 * LAYOUT_SCALE);
      const barX = (cellW - barW) / 2;
      const barBg = new Graphics();
      barBg.eventMode = 'none';
      barBg.roundRect(barX, barY, barW, barH, Math.round(8 * LAYOUT_SCALE)).fill(0x0f172a);
      wrap.addChild(barBg);
      const ratio =
        need != null && need > 0 ? Math.max(0, Math.min(1, dup / need)) : stars >= 5 ? 1 : 0;
      const barFill = new Graphics();
      barFill.eventMode = 'none';
      barFill
        .roundRect(barX, barY, Math.max(2, barW * ratio), barH, Math.round(8 * LAYOUT_SCALE))
        .fill(0x22c55e);
      wrap.addChild(barFill);
      const progLab = new Text({
        text: need != null ? `${dup}/${need}` : 'MAX',
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, monospace',
          fontSize: Math.round(13 * LAYOUT_SCALE),
          fill: 0xffffff,
          fontWeight: '700',
        },
      });
      progLab.anchor.set(0.5, 0.5);
      progLab.position.set(cellW / 2, barY + barH / 2);
      progLab.eventMode = 'none';
      wrap.addChild(progLab);

      this.scrollContent.addChild(wrap);
      col += 1;
      if (col >= cols) {
        col = 0;
        row += 1;
      }
    }

    const rows = Math.ceil(heroListOrder.length / cols);
    const contentH = rows * cellH + Math.max(0, rows - 1) * gap;
    this.scrollMinY = Math.min(0, this.scrollViewH - contentH);
    this.clampScroll();
    this.updateScrollViewportCursor();
  }

  private closeHeroSheet(): void {
    this.heroSheetPanelDispose?.();
    this.heroSheetPanelDispose = null;
    this.sheetLayer.removeChildren();
    this.sheetLayer.visible = false;
    this.sheetLayer.eventMode = 'none';
  }

  private openHeroSheet(id: HeroId): void {
    const def = getHeroDef(id);
    if (!def) return;
    const deployed = findDeployedSlotIndex(id) != null;

    this.heroSheetPanelDispose?.();
    this.heroSheetPanelDispose = null;
    this.sheetLayer.removeChildren();
    this.sheetLayer.visible = true;
    this.sheetLayer.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.78 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.closeHeroSheet());
    this.sheetLayer.addChild(dim);

    const pw = Math.round(520 * LAYOUT_SCALE);
    const ph = Math.round(520 * LAYOUT_SCALE);
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;
    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    this.sheetLayer.addChild(panelPlate);
    this.sheetLayer.addChild(panelFrame);

    const dia = Math.round(96 * LAYOUT_SCALE);
    const btnW = Math.round(200 * LAYOUT_SCALE);
    const btnH = Math.round(48 * LAYOUT_SCALE);
    const btnGap = Math.round(12 * LAYOUT_SCALE);
    const footerReserve = btnH * 2 + btnGap + Math.round(20 * LAYOUT_SCALE);

    this.heroSheetPanelDispose = mountHeroInfoPanelContent({
      parent: this.sheetLayer,
      px,
      py,
      pw,
      ph,
      padX: Math.round(20 * LAYOUT_SCALE),
      padTop: Math.round(52 * LAYOUT_SCALE),
      titleText: null,
      titleFontSize: Math.round(22 * LAYOUT_SCALE),
      titleAlign: 'left',
      heroId: id,
      classStacksOnBoard: 0,
      heroIntroBondLineTint: 'allActive',
      tokenDia: dia,
      gapAfterTitle: 0,
      gapAfterToken: Math.round(14 * LAYOUT_SCALE),
      bodyFontSize: Math.round(16 * LAYOUT_SCALE),
      bodyLineHeight: Math.round(22 * LAYOUT_SCALE),
      footerReserve,
    });

    const primaryY = py + ph - btnH * 2 - btnGap - Math.round(20 * LAYOUT_SCALE);
    const closeY = primaryY + btnH + btnGap;

    const mkBtn = (label: string, bx: number, by: number, style: GameButtonStyleKey, onTap: () => void): void => {
      const b = createStyledGameButton(style, {
        text: label,
        width: btnW,
        height: btnH,
        fontSize: Math.round(20 * LAYOUT_SCALE),
      });
      b.position.set(bx, by);
      b.on('pointertap', (e) => {
        e.stopPropagation();
        onTap();
      });
      this.sheetLayer.addChild(b);
    };

    const centerX = px + pw / 2;
    const bx = centerX - btnW / 2;
    if (deployed) {
      mkBtn('下阵', bx, primaryY, 'sheetUndeploy', () => {
        undeployHeroById(id);
        this.closeHeroSheet();
        this.refreshAll();
      });
    } else {
      mkBtn('上阵', bx, primaryY, 'sheetDeploy', () => {
        const r = tryDeployHero(id);
        if (!r.ok) {
          if (r.reason === 'full') {
            this.modal.alert('上阵栏位已满，且阵上已有三种不同职业，请先下阵一名英雄。', () => {});
            return;
          }
          if (r.reason === 'no_slots_unlocked') {
            const ch = HERO_DEPLOY_SLOT_CHAPTER.find((x) => x != null) ?? 6;
            this.modal.alert(`尚未解锁上阵栏位，请先通关${wowChapterStageTitle(ch)}。`, () => {});
            return;
          }
          return;
        }
        if (r.replaced) {
          const oldN = getHeroDef(r.replaced.oldId)?.name ?? r.replaced.oldId;
          const newN = getHeroDef(id)!.name;
          spawnFloatingGameTip(this, `${newN}与${oldN}职业相同，${oldN}已被换下`);
        }
        this.closeHeroSheet();
        this.refreshAll();
      });
    }

    mkBtn('关闭', bx, closeY, 'sheetClose', () => this.closeHeroSheet());
  }
}