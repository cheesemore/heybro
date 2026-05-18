import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_TITLE,
} from '../ui/goldenSolidPanel';
import { createStyledGameButton } from '../ui/gameButtons';
import { SettlementStarRow } from '../ui/settlementStars';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { isBotModeActive } from '../bot/context';
import { botRegisterScreen, botUnregisterScreen } from '../bot/registry';

export type ChapterRunSettlementKind = 'success' | 'fail';

export type ChapterRunSettlementOpts = {
  kind: ChapterRunSettlementKind;
  chapterId: number;
  /** 成功时 0～3；作弊通关可传入已知星级 */
  stars?: number;
  /** 失败时主说明（可多行） */
  failMessage?: string;
  /** 成功时灰色补充说明 */
  successExtra?: string;
  onContinue: () => void;
};

/**
 * 本章流程结束：通关展示评价星；失败展示原因。关闭后由 `onContinue` 回到章节选择等。
 */
export class ChapterRunSettlementScreen extends Container {
  constructor(o: ChapterRunSettlementOpts) {
    super();
    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0a0f1a);
    this.addChild(bg);

    const pad = Math.round(24 * LAYOUT_SCALE);
    const panelW = Math.min(Math.round(640 * LAYOUT_SCALE), GAME_WIDTH - pad * 2);
    const panelH =
      o.kind === 'success' ? Math.round(480 * LAYOUT_SCALE) : Math.round(440 * LAYOUT_SCALE);
    const px = (GAME_WIDTH - panelW) / 2;
    const py = Math.round(180 * LAYOUT_SCALE);

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, panelW, panelH, LAYOUT_SCALE);
    plate.position.set(px, py);
    frame.position.set(px, py);
    this.addChild(plate);
    this.addChild(frame);

    const titleText = o.kind === 'success' ? '通关成功' : '通关失败';
    const titleT = new Text({
      text: titleText,
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: Math.round(38 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    titleT.anchor.set(0.5, 0);
    titleT.position.set(GAME_WIDTH / 2, py + Math.round(28 * LAYOUT_SCALE));
    this.addChild(titleT);

    const subY = py + Math.round(96 * LAYOUT_SCALE);
    const wrapW = panelW - pad * 2;

    if (o.kind === 'success') {
      const ch = new Text({
        text: `第 ${o.chapterId} 章`,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(22 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_BODY,
          fontWeight: '600',
        },
      });
      ch.anchor.set(0.5, 0);
      ch.position.set(GAME_WIDTH / 2, subY);
      this.addChild(ch);

      const st = Math.max(0, Math.min(3, Math.floor(o.stars ?? 0)));
      const starLabel = new Text({
        text: '本关评价',
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(20 * LAYOUT_SCALE),
          fill: 0xcbd5e1,
          fontWeight: '600',
        },
      });
      starLabel.anchor.set(0.5, 0);
      starLabel.position.set(GAME_WIDTH / 2, subY + Math.round(40 * LAYOUT_SCALE));
      this.addChild(starLabel);

      const starRow = new SettlementStarRow(st);
      starRow.position.set(GAME_WIDTH / 2, subY + Math.round(108 * LAYOUT_SCALE));
      this.addChild(starRow);

      if (o.successExtra?.trim()) {
        const ex = new Text({
          text: o.successExtra.trim(),
          style: {
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
            fontSize: Math.round(18 * LAYOUT_SCALE),
            fill: 0x94a3b8,
            wordWrap: true,
            wordWrapWidth: wrapW,
            align: 'center',
            lineHeight: Math.round(26 * LAYOUT_SCALE),
          },
        });
        ex.anchor.set(0.5, 0);
        ex.position.set(GAME_WIDTH / 2, subY + Math.round(168 * LAYOUT_SCALE));
        this.addChild(ex);
      }
    } else {
      const msg = (o.failMessage ?? '本关挑战未能达成。').trim();
      const failT = new Text({
        text: msg,
        style: {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: Math.round(20 * LAYOUT_SCALE),
          fill: GOLDEN_PANEL_BODY,
          wordWrap: true,
          wordWrapWidth: wrapW,
          align: 'center',
          lineHeight: Math.round(30 * LAYOUT_SCALE),
        },
      });
      failT.anchor.set(0.5, 0);
      failT.position.set(GAME_WIDTH / 2, subY);
      this.addChild(failT);
    }

    const btnW = Math.round(300 * LAYOUT_SCALE);
    const btnH = Math.round(58 * LAYOUT_SCALE);
    const btn = createStyledGameButton('cta', {
      text: '返回选关',
      width: btnW,
      height: btnH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
    });
    btn.position.set((GAME_WIDTH - btnW) / 2, py + panelH - btnH - Math.round(32 * LAYOUT_SCALE));
    btn.on('pointertap', () => o.onContinue());
    this.addChild(btn);

    attachScreenDebugLabel(this, 'ChapterRunSettlementScreen');

    if (isBotModeActive()) {
      botRegisterScreen({
        kind: 'settlement',
        settlement: { continue: () => o.onContinue() },
      });
    }
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    botUnregisterScreen('settlement');
    super.destroy(options);
  }
}
