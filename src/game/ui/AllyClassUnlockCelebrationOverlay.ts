import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { allyBasicSkillDesc, allyBondDisplayName } from '../bondCopy';
import type { AllyClass } from '../types';
import { createDraftAllyToken } from '../unitCircleTokens';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_TITLE,
} from './goldenSolidPanel';
import { createStyledGameButton } from './gameButtons';

const FF = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';

/**
 * 扩展职业首次解锁：半透明遮罩 + 金板（标题、头像、名字、职业技能）。
 */
export class AllyClassUnlockCelebrationOverlay extends Container {
  constructor(kind: AllyClass, onDismiss: () => void) {
    super();
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const dim = new Graphics();
    dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: 0.86 });
    dim.eventMode = 'static';
    this.addChild(dim);

    const pw = Math.round((480 + 40) * LAYOUT_SCALE);
    const ph = Math.round((420 + 40) * LAYOUT_SCALE);
    const portraitShiftDown = Math.round(40 * LAYOUT_SCALE);
    const nameShiftUp = Math.round(20 * LAYOUT_SCALE);
    const px = (GAME_WIDTH - pw) / 2;
    const py = (GAME_HEIGHT - ph) / 2;

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, pw, ph, LAYOUT_SCALE);
    plate.position.set(px, py);
    frame.position.set(px, py);
    plate.eventMode = 'static';
    plate.on('pointertap', (e) => e.stopPropagation());
    this.addChild(plate);
    this.addChild(frame);

    const pad = Math.round(28 * LAYOUT_SCALE);
    const title = new Text({
      text: '解锁新职业',
      style: {
        fontFamily: FF,
        fontSize: Math.round(32 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(px + pw / 2, py + pad);
    this.addChild(title);

    const portraitD = Math.round(120 * LAYOUT_SCALE);
    const token = createDraftAllyToken(kind, portraitD);
    token.position.set(px + pw / 2, py + pad + Math.round(52 * LAYOUT_SCALE) + portraitD / 2 + portraitShiftDown);
    this.addChild(token);

    const nameT = new Text({
      text: allyBondDisplayName(kind),
      style: {
        fontFamily: FF,
        fontSize: Math.round(28 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    nameT.anchor.set(0.5, 0);
    nameT.position.set(
      px + pw / 2,
      py + pad + Math.round(52 * LAYOUT_SCALE) + portraitD + Math.round(12 * LAYOUT_SCALE) + portraitShiftDown - nameShiftUp,
    );
    this.addChild(nameT);

    const skillT = new Text({
      text: allyBasicSkillDesc(kind),
      style: {
        fontFamily: FF,
        fontSize: Math.round(19 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_BODY,
        fontWeight: '600',
        lineHeight: Math.round(28 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: pw - pad * 2,
        align: 'center',
        breakWords: true,
      },
    });
    skillT.anchor.set(0.5, 0);
    skillT.position.set(
      px + pw / 2,
      nameT.y + nameT.height + Math.round(16 * LAYOUT_SCALE),
    );
    this.addChild(skillT);

    const closeW = Math.round(200 * LAYOUT_SCALE);
    const closeH = Math.round(48 * LAYOUT_SCALE);
    const closeBtn = createStyledGameButton('accent', {
      text: '太好了',
      width: closeW,
      height: closeH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
      onTap: onDismiss,
    });
    closeBtn.position.set(px + (pw - closeW) / 2, py + ph - closeH - Math.round(24 * LAYOUT_SCALE));
    this.addChild(closeBtn);
  }
}
