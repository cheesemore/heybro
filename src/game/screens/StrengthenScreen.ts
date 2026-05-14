import type { Application } from 'pixi.js';
import { Container, FederatedPointerEvent, FederatedWheelEvent, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { HERO_REGISTRY, getHeroDef, heroStarStatMult } from '../heroRegistry';
import type { HeroId } from '../heroRegistry';
import {
  addHeroDuplicate,
  findDeployedSlotIndex,
  getDeployedHeroIds,
  HERO_DEPLOY_SLOT_CHAPTER,
  isHeroUnlocked,
  loadHeroMeta,
  maxHeroDeploySlots,
  nextStarCost,
  tryDeployHero,
  undeployHeroById,
} from '../heroMetaStorage';
import { drawGoldenSolidPanel, GOLDEN_PANEL_BODY } from '../ui/goldenSolidPanel';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { createStyledGameButton, redrawGameButtonFromStyle, type GameButton, type GameButtonStyleKey } from '../ui/gameButtons';
import type { ModalLayer } from './ModalLayer';
import { createDraftHeroToken } from '../unitCircleTokens';
import { ALLY_DEFS } from '../unitDefs';

const PAD = Math.round(22 * LAYOUT_SCALE);
/** 垂直位移超过此值才视为滚动，避免误吞卡片点击 */
const HERO_SCROLL_SLOP_PX = 10;

function chapterLabelForSlot(slotIndex: number): string {
  const ch = HERO_DEPLOY_SLOT_CHAPTER[slotIndex] ?? 1;
  return `通关第${ch}章后解锁`;
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
 * 英雄：上阵区 + 可滚动列表；抽卡：模拟抽奖。
 */
export class StrengthenScreen extends Container {
  private readonly modal: ModalLayer;
  private readonly onBack: () => void;
  private readonly heroRoot = new Container();
  private readonly gachaRoot = new Container();
  private readonly slotLayer = new Container();
  private readonly scrollViewport = new Container();
  private readonly scrollContent = new Container();
  private readonly scrollMaskG = new Graphics();
  private readonly sheetLayer = new Container();
  private readonly tabHeroBtn: GameButton;
  private readonly tabGachaBtn: GameButton;
  private readonly gachaHint: Text;

  private tab: 'hero' | 'gacha' = 'hero';
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
    this.modal = modal;
    this.onBack = onBack;
    this.boundDocPointerMove = this.onDocPointerMove.bind(this);
    this.boundDocPointerUp = this.onDocPointerUp.bind(this);

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0a0f1a);
    this.addChild(bg);

    const title = new Text({
      text: '英雄',
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
    const tabW = Math.round(160 * LAYOUT_SCALE);
    const tabH = Math.round(44 * LAYOUT_SCALE);
    const tabGap = Math.round(12 * LAYOUT_SCALE);
    const tabFs = Math.round(22 * LAYOUT_SCALE);
    this.tabHeroBtn = createStyledGameButton('strengthenTabOn', {
      text: '英雄',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    this.tabHeroBtn.position.set(PAD, tabY);
    this.tabHeroBtn.on('pointertap', () => this.setTab('hero'));
    this.addChild(this.tabHeroBtn);

    this.tabGachaBtn = createStyledGameButton('strengthenTabOff', {
      text: '抽卡',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    this.tabGachaBtn.position.set(PAD + tabW + tabGap, tabY);
    this.tabGachaBtn.on('pointertap', () => this.setTab('gacha'));
    this.addChild(this.tabGachaBtn);

    const heroAreaTop = tabY + tabH + Math.round(14 * LAYOUT_SCALE);
    this.heroRoot.position.set(0, heroAreaTop);
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

    this.gachaRoot.visible = false;
    this.gachaRoot.position.set(0, heroAreaTop);
    this.addChild(this.gachaRoot);

    const lotW = Math.round(280 * LAYOUT_SCALE);
    const lotH = Math.round(56 * LAYOUT_SCALE);
    const lotBtn = createStyledGameButton('accent', {
      text: '模拟抽奖（随机英雄）',
      width: lotW,
      height: lotH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
    });
    lotBtn.position.set(PAD, Math.round(24 * LAYOUT_SCALE));
    lotBtn.on('pointertap', () => this.doFakeLottery());
    this.gachaRoot.addChild(lotBtn);

    this.gachaHint = new Text({
      text:
        '每次随机获得一名英雄或同名素材；同名素材达到数量会自动升星。\n' +
        '新英雄会加入下方「英雄」页签的列表。',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(17 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - PAD * 2,
        lineHeight: Math.round(24 * LAYOUT_SCALE),
      },
    });
    this.gachaHint.position.set(PAD, lotBtn.y + lotH + Math.round(20 * LAYOUT_SCALE));
    this.gachaRoot.addChild(this.gachaHint);

    this.sheetLayer.visible = false;
    this.sheetLayer.eventMode = 'static';
    this.sheetLayer.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.addChild(this.sheetLayer);

    this.refreshTabsVisual();
    this.refreshAll();

    attachScreenDebugLabel(this, 'StrengthenScreen');
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

  private setTab(t: 'hero' | 'gacha'): void {
    this.tab = t;
    this.heroRoot.visible = t === 'hero';
    this.gachaRoot.visible = t === 'gacha';
    this.refreshTabsVisual();
    if (t === 'hero') {
      this.clampScroll();
      this.updateScrollViewportCursor();
    } else {
      this.endHeroScrollDrag();
    }
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    this.endHeroScrollDrag();
    super.destroy(options);
  }

  private refreshTabsVisual(): void {
    const tabW = Math.round(160 * LAYOUT_SCALE);
    const tabH = Math.round(44 * LAYOUT_SCALE);
    const tabFs = Math.round(22 * LAYOUT_SCALE);
    redrawGameButtonFromStyle(this.tabHeroBtn, this.tab === 'hero' ? 'strengthenTabOn' : 'strengthenTabOff', {
      text: '英雄',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
    redrawGameButtonFromStyle(this.tabGachaBtn, this.tab === 'gacha' ? 'strengthenTabOn' : 'strengthenTabOff', {
      text: '抽卡',
      width: tabW,
      height: tabH,
      fontSize: tabFs,
    });
  }

  private showHelp(): void {
    const msg = [
      '【操作说明】',
      '· 在下方列表点击英雄卡片，打开详情面板，可上阵或下阵。',
      '· 已上阵的英雄也可点击上方栏位中的头像进行下阵。',
      '· 列表中带金色边框的英雄表示当前已上阵。',
      '',
      '【栏位解锁】',
      '· 第 1 个上阵栏：通关第 1 章后解锁',
      '· 第 2 个上阵栏：通关第 5 章后解锁',
      '· 第 3 个上阵栏：通关第 10 章后解锁',
      '· 最多可同时上阵 3 名英雄。',
    ].join('\n');
    this.modal.alert(msg, () => {});
  }

  private doFakeLottery(): void {
    const idx = Math.floor(Math.random() * HERO_REGISTRY.length);
    const id = HERO_REGISTRY[idx]!.id;
    const was = isHeroUnlocked(id);
    addHeroDuplicate(id);
    const def = getHeroDef(id)!;
    const msg = was
      ? `获得同名素材：${def.name}（${id}）\n已计入升星进度，满足数量会自动升星。`
      : `新英雄加入：${def.name}（${id}）`;
    this.modal.alert(msg, () => this.refreshAll());
  }

  private refreshAll(): void {
    this.drawSlots();
    this.drawHeroScroll();
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
              fill: 0xe2e8f0,
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
    for (const h of HERO_REGISTRY) {
      const x = col * (cellW + gap);
      const y = row * (cellH + gap);
      const unlocked = !!meta.heroes[h.id];
      const deployed = findDeployedSlotIndex(h.id) != null;
      const entry = meta.heroes[h.id];
      const stars = entry?.stars ?? 1;
      const dup = entry?.duplicates ?? 0;
      const need = nextStarCost(stars);

      const wrap = new Container();
      wrap.position.set(x, y);
      wrap.eventMode = 'static';
      wrap.cursor = 'pointer';
      wrap.hitArea = new Rectangle(0, 0, cellW, cellH);
      wrap.on('pointertap', (e) => {
        e.stopPropagation();
        if (this.blockNextHeroCardTap) {
          this.blockNextHeroCardTap = false;
          return;
        }
        if (!unlocked) {
          this.modal.alert('尚未获得该英雄。', () => {});
          return;
        }
        this.openHeroSheet(h.id);
      });

      const bg = new Graphics();
      bg.eventMode = 'none';
      bg
        .roundRect(0, 0, cellW, cellH, Math.round(14 * LAYOUT_SCALE))
        .fill(unlocked ? 0x111827 : 0x0c1222)
        .stroke({
          width: deployed ? Math.max(3, Math.round(3 * LAYOUT_SCALE)) : Math.max(1, Math.round(1.5 * LAYOUT_SCALE)),
          color: deployed ? 0xf59e0b : unlocked ? 0x334155 : 0x1e293b,
        });
      wrap.addChild(bg);

      const avatarWrap = new Container();
      avatarWrap.position.set(cellW / 2, avatarBottomY);
      const tok = createDraftHeroToken(h.id, h.allyClass, avatarD);
      tok.eventMode = 'none';
      tok.alpha = unlocked ? 1 : 0.32;
      avatarWrap.addChild(tok);
      avatarWrap.eventMode = 'none';
      wrap.addChild(avatarWrap);

      const nameT = new Text({
        text: h.name,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(16 * LAYOUT_SCALE),
          fill: unlocked ? 0xf1f5f9 : 0x475569,
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

    const rows = Math.ceil(HERO_REGISTRY.length / cols);
    const contentH = rows * cellH + Math.max(0, rows - 1) * gap;
    this.scrollMinY = Math.min(0, this.scrollViewH - contentH);
    this.clampScroll();
    this.updateScrollViewportCursor();
  }

  private closeHeroSheet(): void {
    this.sheetLayer.removeChildren();
    this.sheetLayer.visible = false;
    this.sheetLayer.eventMode = 'none';
  }

  private openHeroSheet(id: HeroId): void {
    const def = getHeroDef(id);
    if (!def) return;
    const m = loadHeroMeta();
    const stars = m.heroes[id]?.stars ?? 1;
    const sm = heroStarStatMult(stars);
    const dispHp = Math.round(def.maxHp * sm);
    const dispAtk = Math.round(def.atk * sm);
    const deployed = findDeployedSlotIndex(id) != null;

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
    const sheetAvatarTop = py + Math.round(52 * LAYOUT_SCALE);
    const tok = createDraftHeroToken(id, def.allyClass, dia);
    tok.position.set(px + pw / 2, sheetAvatarTop + dia);
    this.sheetLayer.addChild(tok);

    const body = new Text({
      text: [
        `${def.name}  ·  ${ALLY_DEFS[def.allyClass].name}`,
        `★${stars}（属性×${sm.toFixed(2)}）`,
        `生命 ${dispHp}  攻击 ${dispAtk}`,
        `攻速 ${def.attackSpeed}  射程 ${def.range}  移速 ${def.moveSpeed}`,
        '',
        `被动：${def.passiveDesc}`,
        '',
        '主动技能：暂无',
      ].join('\n'),
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(16 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_BODY,
        wordWrap: true,
        wordWrapWidth: pw - Math.round(40 * LAYOUT_SCALE),
        lineHeight: Math.round(22 * LAYOUT_SCALE),
      },
    });
    body.position.set(px + Math.round(20 * LAYOUT_SCALE), sheetAvatarTop + dia + Math.round(14 * LAYOUT_SCALE));
    this.sheetLayer.addChild(body);

    const btnW = Math.round(200 * LAYOUT_SCALE);
    const btnH = Math.round(48 * LAYOUT_SCALE);
    const btnGap = Math.round(12 * LAYOUT_SCALE);
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
        if (r === 'full') {
          this.modal.alert('上阵栏位已满，请先下阵一名英雄。', () => {});
          return;
        }
        if (r === 'no_slots_unlocked') {
          this.modal.alert('尚未解锁上阵栏位，请先通关第 1 章。', () => {});
          return;
        }
        this.closeHeroSheet();
        this.refreshAll();
      });
    }

    mkBtn('关闭', bx, closeY, 'sheetClose', () => this.closeHeroSheet());
  }
}