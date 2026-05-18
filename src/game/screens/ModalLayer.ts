import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import type { LotterySingleOutcome, LotteryTenResultItem } from '../heroMetaStorage';
import { getHeroDef, heroQualityAccent, type HeroId, type HeroQuality } from '../heroRegistry';
import { drawGoldenSolidPanel, GOLDEN_PANEL_BODY, GOLDEN_PANEL_TITLE } from '../ui/goldenSolidPanel';
import { mountHeroInfoPanelContent } from '../ui/heroInfoPanel';
import { createStyledGameButton } from '../ui/gameButtons';
import { createDraftAllyToken, createDraftHeroToken } from '../unitCircleTokens';
import { ALLY_DEFS } from '../unitDefs';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import type { PlayerGearInstance } from '../playerGearInstance';
import { mountGearCard } from '../ui/gearCard';
import { playNodeHeartHpAnim, type NodeHeartHpAnimOpts } from '../ui/nodeHeartHpAnim';

/** 与 `createDraftHeroToken` 一致：根在 `(x, cellTop + dia/2)` 时，圆盘几何中心的屏幕 Y */
function lotteryDraftHeroDiskCenterY(cellTopY: number, diameterPx: number): number {
  const innerR = Math.max(10, diameterPx / 2);
  return cellTopY + diameterPx / 2 - innerR;
}

/** 招募结果：英雄头像外圈品质光晕（蓝 < 紫 < 橙，橙含品质 3～5 同档）；`glowCy` 须为圆心 Y */
function makeLotteryHeroQualityGlow(cx: number, glowCy: number, dia: number, quality: HeroQuality): Graphics {
  const color = heroQualityAccent(quality);
  const tier: 1 | 2 | 3 = quality <= 1 ? 1 : quality === 2 ? 2 : 3;
  const ringCount = tier === 1 ? 2 : tier === 2 ? 4 : 6;
  const alpha0 = tier === 1 ? 0.26 : tier === 2 ? 0.36 : 0.5;
  const rStep = tier === 1 ? 0.048 : tier === 2 ? 0.058 : 0.07;
  const wBase = tier === 1 ? 1.8 : tier === 2 ? 2.4 : 3.2;
  const g = new Graphics();
  for (let i = ringCount - 1; i >= 0; i--) {
    const r = dia * (0.36 + (i + 1) * rStep);
    const alpha = alpha0 * (0.35 + 0.65 * ((ringCount - i) / ringCount));
    const sw = Math.max(1, Math.round((wBase + i * 0.55) * LAYOUT_SCALE));
    g.circle(cx, glowCy, r).stroke({ color, alpha, width: sw });
  }
  return g;
}

export class ModalLayer extends Container {
  /** 本地 bot 测试：模拟点击主按钮（确定/关闭）；装备对比按 GS 取舍 */
  private botPrimaryDismiss: (() => void) | null = null;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'none';
    this.sortableChildren = true;
    this.zIndex = 1000;
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  private clearBotPrimaryDismiss(): void {
    this.botPrimaryDismiss = null;
  }

  private setBotPrimaryDismiss(fn: () => void): void {
    this.botPrimaryDismiss = fn;
  }

  botDismissPrimary(): boolean {
    if (!this.visible || !this.botPrimaryDismiss) return false;
    const fn = this.botPrimaryDismiss;
    this.clearBotPrimaryDismiss();
    fn();
    return true;
  }

  alert(message: string, onClose: () => void): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.round(640 * LAYOUT_SCALE);
    const padTop = Math.round(36 * LAYOUT_SCALE);
    const padBottom = Math.round(32 * LAYOUT_SCALE);
    const gapBeforeBtn = Math.round(28 * LAYOUT_SCALE);
    const wrapW = Math.round(580 * LAYOUT_SCALE);
    const fontSize = Math.round(24 * LAYOUT_SCALE);
    const lineHeight = Math.round(32 * LAYOUT_SCALE);

    const okW = Math.round(220 * LAYOUT_SCALE);
    const okH = Math.round(58 * LAYOUT_SCALE);
    const minPh = Math.round(460 * LAYOUT_SCALE);
    const maxPh = Math.round(GAME_HEIGHT * 0.88);

    const body = new Text({
      text: message,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize,
        fill: GOLDEN_PANEL_BODY,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: wrapW,
        lineHeight,
      },
    });
    body.anchor.set(0.5, 0);

    const reserve = padTop + gapBeforeBtn + okH + padBottom;
    const minFs = Math.round(17 * LAYOUT_SCALE);
    while (body.height > maxPh - reserve && body.style.fontSize > minFs) {
      const fs = Math.max(minFs, body.style.fontSize - Math.max(1, Math.round(1 * LAYOUT_SCALE)));
      body.style.fontSize = fs;
      body.style.lineHeight = Math.round(fs * 1.35);
    }

    const contentH = Math.ceil(body.height);
    const ph = Math.min(maxPh, Math.max(minPh, padTop + contentH + gapBeforeBtn + okH + padBottom));
    const panelY = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set((GAME_WIDTH - pw) / 2, panelY);
    panelFrame.position.set((GAME_WIDTH - pw) / 2, panelY);
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    body.position.set(GAME_WIDTH / 2, panelY + padTop);
    this.addChild(body);

    const dismiss = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
      onClose();
    };
    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
      onTap: dismiss,
    });
    okBtn.position.set((GAME_WIDTH - okW) / 2, panelY + ph - padBottom - okH);
    this.addChild(okBtn);
    this.setBotPrimaryDismiss(dismiss);

    attachScreenDebugLabel(this, 'ModalLayer.alert');
  }

  /**
   * 危险操作：双按钮「取消 / 确定」；点击遮罩不关闭（须点按钮）。
   */
  confirmDestructive(
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    opts?: { confirmText?: string },
  ): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.round(640 * LAYOUT_SCALE);
    const padTop = Math.round(36 * LAYOUT_SCALE);
    const padBottom = Math.round(32 * LAYOUT_SCALE);
    const gapBeforeBtn = Math.round(28 * LAYOUT_SCALE);
    const wrapW = Math.round(580 * LAYOUT_SCALE);
    const fontSize = Math.round(24 * LAYOUT_SCALE);
    const lineHeight = Math.round(32 * LAYOUT_SCALE);

    const btnW = Math.round(200 * LAYOUT_SCALE);
    const btnH = Math.round(58 * LAYOUT_SCALE);
    const btnGap = Math.round(18 * LAYOUT_SCALE);
    const minPh = Math.round(400 * LAYOUT_SCALE);
    const maxPh = Math.round(GAME_HEIGHT * 0.88);

    const body = new Text({
      text: message,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize,
        fill: GOLDEN_PANEL_BODY,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: wrapW,
        lineHeight,
      },
    });
    body.anchor.set(0.5, 0);

    const reserve = padTop + gapBeforeBtn + btnH + padBottom;
    const minFs = Math.round(17 * LAYOUT_SCALE);
    while (body.height > maxPh - reserve && body.style.fontSize > minFs) {
      const fs = Math.max(minFs, body.style.fontSize - Math.max(1, Math.round(1 * LAYOUT_SCALE)));
      body.style.fontSize = fs;
      body.style.lineHeight = Math.round(fs * 1.35);
    }

    const contentH = Math.ceil(body.height);
    const ph = Math.min(maxPh, Math.max(minPh, padTop + contentH + gapBeforeBtn + btnH + padBottom));
    const panelY = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set((GAME_WIDTH - pw) / 2, panelY);
    panelFrame.position.set((GAME_WIDTH - pw) / 2, panelY);
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    body.position.set(GAME_WIDTH / 2, panelY + padTop);
    this.addChild(body);

    const rowW = btnW * 2 + btnGap;
    const rowLeft = (GAME_WIDTH - rowW) / 2;
    const btnY = panelY + ph - padBottom - btnH;

    const close = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
    };

    const cancelDismiss = (): void => {
      close();
      onCancel?.();
    };

    const cancelBtn = createStyledGameButton('classicMuted', {
      text: '取消',
      width: btnW,
      height: btnH,
      fontSize: Math.round(24 * LAYOUT_SCALE),
      onTap: cancelDismiss,
    });
    cancelBtn.position.set(rowLeft, btnY);
    this.addChild(cancelBtn);

    const okBtn = createStyledGameButton('danger', {
      text: opts?.confirmText ?? '确定',
      width: btnW,
      height: btnH,
      fontSize: Math.round(24 * LAYOUT_SCALE),
      onTap: () => {
        close();
        onConfirm();
      },
    });
    okBtn.position.set(rowLeft + btnW + btnGap, btnY);
    this.addChild(okBtn);
    this.setBotPrimaryDismiss(cancelDismiss);

    attachScreenDebugLabel(this, 'ModalLayer.confirmDestructive');
  }

  /**
   * 节点战斗结束：先播中央爱心掉血/加血（战斗场景可仍在下层），播完再调用 `onSettlement`（通常清层并弹结算）。
   */
  playNodeHpChangeThenBattleSettlement(hp: NodeHeartHpAnimOpts, onSettlement: () => void): void {
    if (hp.hpDelta === 0) {
      onSettlement();
      return;
    }
    this.removeChildren();
    this.clearBotPrimaryDismiss();
    this.visible = true;
    this.eventMode = 'static';
    playNodeHeartHpAnim(this, hp, onSettlement);
  }

  /**
   * 战斗结束：中性灰底板（宽度随正文收缩）、大号「战斗结算」标题 + 简短多行正文。
   */
  alertBattleSettlement(detail: string, onClose: () => void): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const padX = Math.round(24 * LAYOUT_SCALE);
    const padTop = Math.round(28 * LAYOUT_SCALE);
    const padBottom = Math.round(26 * LAYOUT_SCALE);
    const gapTitleBody = Math.round(14 * LAYOUT_SCALE);
    const gapBeforeBtn = Math.round(22 * LAYOUT_SCALE);
    const minPw = Math.round(380 * LAYOUT_SCALE);
    const maxPw = GAME_WIDTH - Math.round(40 * LAYOUT_SCALE);
    const titleFs = Math.round(38 * LAYOUT_SCALE);
    const bodyFs = Math.round(21 * LAYOUT_SCALE);
    const bodyLh = Math.round(29 * LAYOUT_SCALE);
    const minBodyFs = Math.round(16 * LAYOUT_SCALE);

    const okW = Math.round(220 * LAYOUT_SCALE);
    const okH = Math.round(58 * LAYOUT_SCALE);
    const maxPh = Math.round(GAME_HEIGHT * 0.88);

    const title = new Text({
      text: '战斗结算',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: titleFs,
        fill: 0xf9fafb,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);

    const body = new Text({
      text: detail,
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: bodyFs,
        fill: 0xe5e7eb,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: maxPw - padX * 2,
        lineHeight: bodyLh,
      },
    });
    body.anchor.set(0.5, 0);

    const measurePw = (): number => {
      const inner = Math.max(title.width, body.width);
      return Math.min(maxPw, Math.max(minPw, Math.ceil(inner + padX * 2)));
    };

    let pw = measurePw();
    body.style.wordWrapWidth = pw - padX * 2;
    pw = measurePw();
    body.style.wordWrapWidth = pw - padX * 2;

    while (body.height > maxPh - padTop - gapTitleBody - title.height - gapBeforeBtn - okH - padBottom && body.style.fontSize > minBodyFs) {
      const fs = Math.max(minBodyFs, body.style.fontSize - Math.max(1, Math.round(1 * LAYOUT_SCALE)));
      body.style.fontSize = fs;
      body.style.lineHeight = Math.round(fs * 1.38);
      pw = measurePw();
      body.style.wordWrapWidth = pw - padX * 2;
      pw = measurePw();
      body.style.wordWrapWidth = pw - padX * 2;
    }

    const contentH = title.height + gapTitleBody + body.height;
    const ph = Math.min(maxPh, Math.ceil(padTop + contentH + gapBeforeBtn + okH + padBottom));
    const panelY = (GAME_HEIGHT - ph) / 2;
    const panelX = (GAME_WIDTH - pw) / 2;

    const rr = Math.round(14 * LAYOUT_SCALE);
    const panelPlate = new Graphics();
    panelPlate.roundRect(0, 0, pw, ph, rr).fill({ color: 0x525a63, alpha: 1 });
    panelPlate.roundRect(0, 0, pw, ph, rr).stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x3d444d, alpha: 1 });
    panelPlate.position.set(panelX, panelY);
    this.addChild(panelPlate);

    title.position.set(GAME_WIDTH / 2, panelY + padTop);
    this.addChild(title);

    body.position.set(GAME_WIDTH / 2, panelY + padTop + title.height + gapTitleBody);
    this.addChild(body);

    const dismiss = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
      onClose();
    };
    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
      onTap: dismiss,
    });
    okBtn.position.set((GAME_WIDTH - okW) / 2, panelY + ph - padBottom - okH);
    this.addChild(okBtn);
    this.setBotPrimaryDismiss(dismiss);

    attachScreenDebugLabel(this, 'ModalLayer.alertBattleSettlement');
  }

  /**
   * 抽卡等「首次获得英雄」：金面板 + 头像 + 可滚动的属性与技能全文（羁绊档按 0 层）。
   */
  alertNewHeroUnlock(heroId: HeroId, onClose: () => void): void {
    const def = getHeroDef(heroId);
    if (!def) {
      this.alert('获得新英雄（配置缺失）', onClose);
      return;
    }

    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.min(GAME_WIDTH - Math.round(40 * LAYOUT_SCALE), Math.round(560 * LAYOUT_SCALE));
    const ph = Math.round(Math.min(GAME_HEIGHT * 0.88, 600 * LAYOUT_SCALE));
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const okW = Math.round(220 * LAYOUT_SCALE);
    const okH = Math.round(52 * LAYOUT_SCALE);
    const padBottom = Math.round(22 * LAYOUT_SCALE);
    const footerReserve = okH + padBottom + Math.round(10 * LAYOUT_SCALE);

    const disposePanel = mountHeroInfoPanelContent({
      parent: this,
      px,
      py,
      pw,
      ph,
      padX: Math.round(20 * LAYOUT_SCALE),
      padTop: Math.round(20 * LAYOUT_SCALE),
      titleText: `新英雄：${def.name}`,
      titleFontSize: Math.round(24 * LAYOUT_SCALE),
      titleAlign: 'center',
      heroId,
      classStacksOnBoard: 0,
      heroIntroBondLineTint: 'allActive',
      tokenDia: Math.round(88 * LAYOUT_SCALE),
      gapAfterTitle: Math.round(10 * LAYOUT_SCALE),
      gapAfterToken: Math.round(12 * LAYOUT_SCALE),
      bodyFontSize: Math.round(15 * LAYOUT_SCALE),
      bodyLineHeight: Math.round(22 * LAYOUT_SCALE),
      footerReserve,
    });

    const close = (): void => {
      disposePanel();
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      onClose();
    };

    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
      onTap: close,
    });
    okBtn.position.set(px + (pw - okW) / 2, py + ph - padBottom - okH);
    this.addChild(okBtn);

    attachScreenDebugLabel(this, 'ModalLayer.alertNewHeroUnlock');
  }

  /** 十连抽汇总：仅头像与英雄名（品质色） */
  alertTenPullHeroResults(heroIds: readonly HeroId[], onClose: () => void): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.min(GAME_WIDTH - Math.round(32 * LAYOUT_SCALE), Math.round(900 * LAYOUT_SCALE));
    const ph = Math.round(Math.min(GAME_HEIGHT * 0.82, 420 * LAYOUT_SCALE));
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const title = new Text({
      text: '十连抽结果',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(px + pw / 2, py + Math.round(18 * LAYOUT_SCALE));
    this.addChild(title);

    const cols = 5;
    const rows = 2;
    const padX = Math.round(28 * LAYOUT_SCALE);
    const gridTop = py + Math.round(56 * LAYOUT_SCALE);
    const gridW = pw - padX * 2;
    const gap = Math.round(10 * LAYOUT_SCALE);
    const cellW = (gridW - gap * (cols - 1)) / cols;
    const dia = Math.min(Math.round(56 * LAYOUT_SCALE), cellW * 0.92);
    const nameFs = Math.round(13 * LAYOUT_SCALE);
    const cellH = dia + Math.round(6 * LAYOUT_SCALE) + nameFs + Math.round(4 * LAYOUT_SCALE);

    for (let i = 0; i < heroIds.length && i < cols * rows; i++) {
      const hid = heroIds[i]!;
      const def = getHeroDef(hid);
      if (!def) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = px + padX + col * (cellW + gap) + cellW / 2;
      const cy = gridTop + row * (cellH + gap);

      const tok = createDraftHeroToken(hid, def.allyClass, dia);
      tok.position.set(cx, cy + dia / 2);
      this.addChild(tok);

      const nm = new Text({
        text: def.name,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: nameFs,
          fill: heroQualityAccent(def.quality),
          fontWeight: '700',
          align: 'center',
        },
      });
      nm.anchor.set(0.5, 0);
      nm.position.set(cx, cy + dia + Math.round(6 * LAYOUT_SCALE));
      this.addChild(nm);
    }

    const okW = Math.round(240 * LAYOUT_SCALE);
    const okH = Math.round(52 * LAYOUT_SCALE);
    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
      onTap: () => {
        this.visible = false;
        this.eventMode = 'none';
        this.removeChildren();
        onClose();
      },
    });
    okBtn.position.set(px + (pw - okW) / 2, py + ph - okH - Math.round(20 * LAYOUT_SCALE));
    this.addChild(okBtn);

    attachScreenDebugLabel(this, 'ModalLayer.alertTenPullHeroResults');
  }

  /** 十连：英雄或职业碎片混排展示 */
  alertTenPullLotteryResults(items: readonly LotteryTenResultItem[], onClose: () => void): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.min(GAME_WIDTH - Math.round(32 * LAYOUT_SCALE), Math.round(900 * LAYOUT_SCALE));
    const ph = Math.round(Math.min(GAME_HEIGHT * 0.82, 420 * LAYOUT_SCALE));
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const title = new Text({
      text: '十连招募结果',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(px + pw / 2, py + Math.round(18 * LAYOUT_SCALE));
    this.addChild(title);

    const cols = 5;
    const rows = 2;
    const padX = Math.round(28 * LAYOUT_SCALE);
    const gridTop = py + Math.round(56 * LAYOUT_SCALE);
    const gridW = pw - padX * 2;
    const gap = Math.round(10 * LAYOUT_SCALE);
    const cellW = (gridW - gap * (cols - 1)) / cols;
    const dia = Math.min(Math.round(56 * LAYOUT_SCALE), cellW * 0.92);
    const nameFs = Math.round(13 * LAYOUT_SCALE);
    const cellH = dia + Math.round(6 * LAYOUT_SCALE) + nameFs + Math.round(4 * LAYOUT_SCALE);

    for (let i = 0; i < items.length && i < cols * rows; i++) {
      const it = items[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowExtraY = row === 0 ? Math.round(40 * LAYOUT_SCALE) : Math.round(80 * LAYOUT_SCALE);
      const cx = px + padX + col * (cellW + gap) + cellW / 2;
      const cy = gridTop + row * (cellH + gap) + rowExtraY;

      if (it.kind === 'hero') {
        const def = getHeroDef(it.id);
        if (!def) continue;
        const tokenAnchorY = cy + dia / 2;
        const glowCy = lotteryDraftHeroDiskCenterY(cy, dia);
        this.addChild(makeLotteryHeroQualityGlow(cx, glowCy, dia, def.quality));
        const tok = createDraftHeroToken(it.id, def.allyClass, dia);
        tok.position.set(cx, tokenAnchorY);
        this.addChild(tok);
        const nm = new Text({
          text: def.name,
          style: {
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
            fontSize: nameFs,
            fill: heroQualityAccent(def.quality),
            fontWeight: '700',
            align: 'center',
          },
        });
        nm.anchor.set(0.5, 0);
        nm.position.set(cx, cy + dia + Math.round(6 * LAYOUT_SCALE));
        this.addChild(nm);
      } else {
        const tok = createDraftAllyToken(it.allyClass, dia);
        tok.position.set(cx, cy + dia / 2);
        this.addChild(tok);
        const nm = new Text({
          text: `${ALLY_DEFS[it.allyClass].name}碎片`,
          style: {
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
            fontSize: nameFs,
            fill: 0xffffff,
            fontWeight: '700',
            align: 'center',
          },
        });
        nm.anchor.set(0.5, 0);
        nm.position.set(cx, cy + dia + Math.round(6 * LAYOUT_SCALE));
        this.addChild(nm);
      }
    }

    const okW = Math.round(240 * LAYOUT_SCALE);
    const okH = Math.round(52 * LAYOUT_SCALE);
    const dismiss = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
      onClose();
    };
    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
      onTap: dismiss,
    });
    okBtn.position.set(px + (pw - okW) / 2, py + ph - okH - Math.round(20 * LAYOUT_SCALE));
    this.addChild(okBtn);
    this.setBotPrimaryDismiss(dismiss);

    attachScreenDebugLabel(this, 'ModalLayer.alertTenPullLotteryResults');
  }

  /** 单抽：与十连同一套金面板 + 头像/名称；头像与名字相对十连放大约 1.5 倍 */
  alertSinglePullLotteryResult(outcome: LotterySingleOutcome, onClose: () => void): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.72 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.min(GAME_WIDTH - Math.round(32 * LAYOUT_SCALE), Math.round(900 * LAYOUT_SCALE));
    const ph = Math.round(Math.min(GAME_HEIGHT * 0.82, 420 * LAYOUT_SCALE));
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(px, py);
    panelFrame.position.set(px, py);
    panelPlate.eventMode = 'static';
    panelPlate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const title = new Text({
      text: '单次招募结果',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(px + pw / 2, py + Math.round(18 * LAYOUT_SCALE));
    this.addChild(title);

    const padX = Math.round(28 * LAYOUT_SCALE);
    const gridTop = py + Math.round(56 * LAYOUT_SCALE);
    const gridW = pw - padX * 2;
    const gap = Math.round(10 * LAYOUT_SCALE);
    const cols = 5;
    const cellW = (gridW - gap * (cols - 1)) / cols;
    const diaTen = Math.min(Math.round(56 * LAYOUT_SCALE), cellW * 0.92);
    const nameFsTen = Math.round(13 * LAYOUT_SCALE);
    const dia = Math.min(diaTen * 1.5, gridW * 0.55);
    const nameFs = Math.round(nameFsTen * 1.5);

    const cx = px + pw / 2;
    const cy = gridTop + Math.round(40 * LAYOUT_SCALE);

    if (outcome.kind === 'hero') {
      const def = getHeroDef(outcome.id);
      if (def) {
        const tokenAnchorY = cy + dia / 2;
        const glowCy = lotteryDraftHeroDiskCenterY(cy, dia);
        this.addChild(makeLotteryHeroQualityGlow(cx, glowCy, dia, def.quality));
        const tok = createDraftHeroToken(outcome.id, def.allyClass, dia);
        tok.position.set(cx, tokenAnchorY);
        this.addChild(tok);
        const nm = new Text({
          text: def.name,
          style: {
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
            fontSize: nameFs,
            fill: heroQualityAccent(def.quality),
            fontWeight: '700',
            align: 'center',
          },
        });
        nm.anchor.set(0.5, 0);
        nm.position.set(cx, cy + dia + Math.round(6 * LAYOUT_SCALE));
        this.addChild(nm);
      } else {
        const nm = new Text({
          text: `英雄配置缺失：${outcome.id}`,
          style: {
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
            fontSize: nameFs,
            fill: GOLDEN_PANEL_BODY,
            fontWeight: '700',
            align: 'center',
          },
        });
        nm.anchor.set(0.5, 0);
        nm.position.set(cx, cy + Math.round(8 * LAYOUT_SCALE));
        this.addChild(nm);
      }
    } else {
      const tok = createDraftAllyToken(outcome.allyClass, dia);
      tok.position.set(cx, cy + dia / 2);
      this.addChild(tok);
      const nm = new Text({
        text: `${ALLY_DEFS[outcome.allyClass].name}碎片`,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: nameFs,
          fill: 0xffffff,
          fontWeight: '700',
          align: 'center',
        },
      });
      nm.anchor.set(0.5, 0);
      nm.position.set(cx, cy + dia + Math.round(6 * LAYOUT_SCALE));
      this.addChild(nm);
    }

    const okW = Math.round(240 * LAYOUT_SCALE);
    const okH = Math.round(52 * LAYOUT_SCALE);
    const dismiss = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
      onClose();
    };
    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
      onTap: dismiss,
    });
    okBtn.position.set(px + (pw - okW) / 2, py + ph - okH - Math.round(20 * LAYOUT_SCALE));
    this.addChild(okBtn);
    this.setBotPrimaryDismiss(dismiss);

    attachScreenDebugLabel(this, 'ModalLayer.alertSinglePullLotteryResult');
  }

  /**
   * 新装备对比：左=身上，右=新获得；保留=丢弃新装，替换=穿上新装（均会存档）。
   */
  showGearCompare(
    equipped: PlayerGearInstance,
    incoming: PlayerGearInstance,
    handlers: { onKeep: () => void; onReplace: () => void },
  ): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.78 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.round(480 * LAYOUT_SCALE);
    const ph = Math.round(318 * LAYOUT_SCALE);
    const panelX = (GAME_WIDTH - pw) / 2;
    const panelY = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(panelX, panelY);
    panelFrame.position.set(panelX, panelY);
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const topPad = Math.round(12 * LAYOUT_SCALE);
    const colW = Math.round(188 * LAYOUT_SCALE);
    const colGap = Math.round(14 * LAYOUT_SCALE);
    const cardLayout = {
      width: colW,
      iconSize: Math.round(52 * LAYOUT_SCALE),
      compact: true,
    };
    const btnW = Math.round(168 * LAYOUT_SCALE);
    const btnH = Math.round(48 * LAYOUT_SCALE);
    const bottomPad = Math.round(14 * LAYOUT_SCALE);

    const leftCx = GAME_WIDTH / 2 - colGap / 2 - colW / 2;
    const rightCx = GAME_WIDTH / 2 + colGap / 2 + colW / 2;
    const colTitleY = panelY + topPad + Math.round(24 * LAYOUT_SCALE);
    const cardTop = panelY + topPad + Math.round(42 * LAYOUT_SCALE);
    const btnY = panelY + ph - bottomPad - btnH;

    const title = new Text({
      text: '装备对比',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(GAME_WIDTH / 2, panelY + topPad);
    this.addChild(title);

    const colTitleStyle = {
      fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
      fontSize: Math.round(15 * LAYOUT_SCALE),
      fill: GOLDEN_PANEL_BODY,
      fontWeight: '700' as const,
    };

    const leftTitle = new Text({ text: '身上装备', style: colTitleStyle });
    leftTitle.anchor.set(0.5, 0);
    leftTitle.position.set(leftCx, colTitleY);
    this.addChild(leftTitle);

    const rightTitle = new Text({ text: '新装备', style: colTitleStyle });
    rightTitle.anchor.set(0.5, 0);
    rightTitle.position.set(rightCx, colTitleY);
    this.addChild(rightTitle);

    mountGearCard(this, leftCx, cardTop, equipped, cardLayout, null);

    const arrow: 'up' | 'down' = incoming.gs > equipped.gs ? 'up' : 'down';
    mountGearCard(this, rightCx, cardTop, incoming, cardLayout, arrow);

    const close = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
    };

    const keepBtn = createStyledGameButton('classic', {
      text: '保留',
      width: btnW,
      height: btnH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
      onTap: () => {
        close();
        handlers.onKeep();
      },
    });
    keepBtn.position.set(leftCx - btnW / 2, btnY);
    this.addChild(keepBtn);

    const replaceBtn = createStyledGameButton('accent', {
      text: '替换',
      width: btnW,
      height: btnH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
      onTap: () => {
        close();
        handlers.onReplace();
      },
    });
    replaceBtn.position.set(rightCx - btnW / 2, btnY);
    this.addChild(replaceBtn);

    this.setBotPrimaryDismiss(() => {
      if (incoming.gs > equipped.gs) {
        close();
        handlers.onReplace();
      } else {
        close();
        handlers.onKeep();
      }
    });

    attachScreenDebugLabel(this, 'ModalLayer.gearCompare');
  }

  /** 点击已穿戴装备：查看 GS 与属性 */
  showGearDetail(gear: PlayerGearInstance, onClose?: () => void): void {
    this.removeChildren();
    this.visible = true;
    this.eventMode = 'static';

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x0b1020, alpha: 0.78 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.round(440 * LAYOUT_SCALE);
    const ph = Math.round(480 * LAYOUT_SCALE);
    const panelX = (GAME_WIDTH - pw) / 2;
    const panelY = (GAME_HEIGHT - ph) / 2;

    const panelPlate = new Graphics();
    const panelFrame = new Graphics();
    drawGoldenSolidPanel(panelPlate, panelFrame, pw, ph, LAYOUT_SCALE);
    panelPlate.position.set(panelX, panelY);
    panelFrame.position.set(panelX, panelY);
    this.addChild(panelPlate);
    this.addChild(panelFrame);

    const title = new Text({
      text: '装备详情',
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(28 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(GAME_WIDTH / 2, panelY + Math.round(18 * LAYOUT_SCALE));
    this.addChild(title);

    const colW = Math.round(260 * LAYOUT_SCALE);
    const cardTop = panelY + Math.round(56 * LAYOUT_SCALE);
    mountGearCard(this, GAME_WIDTH / 2, cardTop, gear, {
      width: colW,
      iconSize: Math.round(72 * LAYOUT_SCALE),
      compact: true,
    });

    const close = (): void => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      this.clearBotPrimaryDismiss();
      onClose?.();
    };

    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(64 * LAYOUT_SCALE);
    const okBtn = createStyledGameButton('modalOk', {
      text: '关闭',
      width: btnW,
      height: btnH,
      fontSize: Math.round(24 * LAYOUT_SCALE),
      onTap: close,
    });
    okBtn.position.set((GAME_WIDTH - btnW) / 2, panelY + ph - btnH - Math.round(28 * LAYOUT_SCALE));
    this.addChild(okBtn);
    this.setBotPrimaryDismiss(close);

    attachScreenDebugLabel(this, 'ModalLayer.gearDetail');
  }
}