import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { ROUNDS } from '../roundConfig';
import type { RunState } from '../runState';
import { applyChosenStrategy, pickThreeStrategies } from '../strategyApply';

const PAD_X = Math.round(20 * LAYOUT_SCALE);

export class StrategyPickScreen extends Container {
  private readonly run: RunState;
  private readonly onDone: (summaryLines: string[]) => void;
  private readonly options: ReturnType<typeof pickThreeStrategies>;

  constructor(chapter: 1 | 2 | 3, run: RunState, onDone: (summaryLines: string[]) => void) {
    super();
    this.run = run;
    this.onDone = onDone;
    this.options = pickThreeStrategies(chapter);

    const deepBg = new Graphics();
    deepBg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x030712);
    this.addChild(deepBg);

    const idx = run.currentRoundIndex;
    const label = ROUNDS[idx]?.label ?? `${chapter}-2`;

    const header = new Text({
      text: `${label} · 策略抉择（三选一）`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(36 * LAYOUT_SCALE),
        fill: 0xf8fafc,
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
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0x94a3b8,
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

      const bg = new Graphics();
      bg.roundRect(0, 0, cardW, cardH, Math.round(18 * LAYOUT_SCALE))
        .fill(0x111827)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x4f46e5, alpha: 0.85 });
      wrap.addChild(bg);

      const t1 = new Text({
        text: opt.title,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(30 * LAYOUT_SCALE),
          fill: 0xe0e7ff,
          fontWeight: '700',
        },
      });
      t1.position.set(Math.round(20 * LAYOUT_SCALE), Math.round(18 * LAYOUT_SCALE));
      wrap.addChild(t1);

      const t2 = new Text({
        text: opt.desc,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(22 * LAYOUT_SCALE),
          fill: 0xcbd5e1,
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
  }
}
