import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { getHeroDef, type HeroId } from '../heroRegistry';
import { drawGoldenSolidPanel, GOLDEN_PANEL_BODY } from '../ui/goldenSolidPanel';
import { mountHeroInfoPanelContent } from '../ui/heroInfoPanel';
import { createStyledGameButton } from '../ui/gameButtons';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
export class ModalLayer extends Container {
  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'none';
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
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

    const okBtn = createStyledGameButton('classic', {
      text: '确定',
      width: okW,
      height: okH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
      onTap: () => {
        this.visible = false;
        this.eventMode = 'none';
        this.removeChildren();
        onClose();
      },
    });
    okBtn.position.set((GAME_WIDTH - okW) / 2, panelY + ph - padBottom - okH);
    this.addChild(okBtn);

    attachScreenDebugLabel(this, 'ModalLayer.alert');
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
}