import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { roundsForBookChapter } from '../roundConfig';
import type { RunState } from '../runState';
import { applyChosenStrategy, pickThreeStrategies } from '../strategyApply';
import { mountStretchedDungeonBackground } from '../dungeonBackground';
import { dungeonIdForBookChapter } from '../wowBookData';
import { isBotModeActive } from '../bot/context';
import { botRegisterScreen, botUnregisterScreen } from '../bot/registry';
import {
  PARCHMENT_BTN_TEXT,
  PARCHMENT_BTN_TEXT_DIM,
  drawParchmentCardTopBottomRules,
} from '../ui/parchmentButtonFill';

const PAD_X = Math.round(20 * LAYOUT_SCALE);
const STRATEGY_CARD_TITLE_ACCENT = 0xa16207;
const STRATEGY_UI_FONT = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';

export class StrategyPickScreen extends Container {
  private readonly run: RunState;
  private readonly onDone: (summaryLines: string[]) => void;
  private readonly options: ReturnType<typeof pickThreeStrategies>;

  constructor(chapter: 1 | 2 | 3, run: RunState, onDone: (summaryLines: string[]) => void) {
    super();
    this.run = run;
    this.onDone = onDone;
    this.options = pickThreeStrategies(chapter);

    mountStretchedDungeonBackground(this, dungeonIdForBookChapter(this.run.bookChapterId), { dimAlpha: 0.38 });

    const idx = run.currentRoundIndex;
    const label =
      roundsForBookChapter(run.bookChapterId)[idx]?.label ?? `${chapter}-2`;

    const header = new Text({
      text: `${label} · 策略抉择（三选一）`,
      style: {
        fontFamily: STRATEGY_UI_FONT,
        fontSize: Math.round(36 * LAYOUT_SCALE),
        fill: PARCHMENT_BTN_TEXT,
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - PAD_X * 2,
      },
    });
    header.position.set(PAD_X, Math.round(28 * LAYOUT_SCALE));
    this.addChild(header);

    const sub = new Text({
      text: '以下 3 个策略随机抽取，请选择其一',
      style: {
        fontFamily: STRATEGY_UI_FONT,
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: PARCHMENT_BTN_TEXT_DIM,
      },
    });
    sub.position.set(PAD_X, Math.round(92 * LAYOUT_SCALE));
    this.addChild(sub);

    const cardW = GAME_WIDTH - PAD_X * 2;
    const cardH = Math.round(320 * LAYOUT_SCALE);
    const gap = Math.round(16 * LAYOUT_SCALE);
    let y = Math.round(140 * LAYOUT_SCALE);

    for (let i = 0; i < 3; i++) {
      const opt = this.options[i]!;
      const wrap = new Container();
      wrap.position.set(PAD_X, y);
      wrap.eventMode = 'static';
      wrap.cursor = 'pointer';
      wrap.hitArea = new Rectangle(0, 0, cardW, cardH);

      const cardR = Math.round(18 * LAYOUT_SCALE);
      const plate = new Graphics();
      const rules = new Graphics();
      drawParchmentCardTopBottomRules(plate, rules, cardW, cardH, cardR, LAYOUT_SCALE, false);
      wrap.addChild(plate);
      wrap.addChild(rules);

      const t1 = new Text({
        text: opt.title,
        style: {
          fontFamily: STRATEGY_UI_FONT,
          fontSize: Math.round(30 * LAYOUT_SCALE),
          fill: STRATEGY_CARD_TITLE_ACCENT,
          fontWeight: '700',
        },
      });
      t1.position.set(Math.round(20 * LAYOUT_SCALE), Math.round(18 * LAYOUT_SCALE));
      wrap.addChild(t1);

      const t2 = new Text({
        text: opt.desc,
        style: {
          fontFamily: STRATEGY_UI_FONT,
          fontSize: Math.round(22 * LAYOUT_SCALE),
          fill: PARCHMENT_BTN_TEXT,
          lineHeight: Math.round(30 * LAYOUT_SCALE),
          wordWrap: true,
          wordWrapWidth: cardW - Math.round(40 * LAYOUT_SCALE),
        },
      });
      t2.position.set(Math.round(20 * LAYOUT_SCALE), Math.round(64 * LAYOUT_SCALE));
      wrap.addChild(t2);

      const pickId = opt.id;
      wrap.on('pointertap', () => {
        this.run.strategyPicks.push({ id: pickId, title: opt.title, desc: opt.desc });
        const lines = [`已选择：${opt.title}`, ...applyChosenStrategy(pickId, this.run)];
        this.onDone(lines);
      });

      this.addChild(wrap);
      y += cardH + gap;
    }

    attachScreenDebugLabel(this, 'StrategyPickScreen');

    if (isBotModeActive()) {
      botRegisterScreen({
        kind: 'strategyPick',
        strategyPick: { pick: (index) => this.botPick(index) },
      });
    }
  }

  botPick(index: number): void {
    const opt = this.options[index];
    if (!opt) return;
    this.run.strategyPicks.push({ id: opt.id, title: opt.title, desc: opt.desc });
    const lines = [`已选择：${opt.title}`, ...applyChosenStrategy(opt.id, this.run)];
    this.onDone(lines);
  }

  override destroy(options?: boolean | import('pixi.js').DestroyOptions): void {
    botUnregisterScreen('strategyPick');
    super.destroy(options);
  }
}
