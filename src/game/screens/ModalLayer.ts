import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { drawGoldenSolidPanel, GOLDEN_PANEL_BODY } from '../ui/goldenSolidPanel';
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

    const ok = new Graphics();
    ok.roundRect(0, 0, okW, okH, Math.round(12 * LAYOUT_SCALE)).fill(0x2563eb);
    ok.eventMode = 'static';
    ok.cursor = 'pointer';
    ok.position.set((GAME_WIDTH - okW) / 2, panelY + ph - padBottom - okH);
    ok.on('pointertap', () => {
      this.visible = false;
      this.eventMode = 'none';
      this.removeChildren();
      onClose();
    });
    this.addChild(ok);

    const okText = new Text({
      text: '确定',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xffffff,
        fontWeight: '600',
      },
    });
    okText.anchor.set(0.5);
    okText.position.set(ok.x + okW / 2, ok.y + okH / 2);
    this.addChild(okText);

    attachScreenDebugLabel(this, 'ModalLayer.alert');
  }
}
