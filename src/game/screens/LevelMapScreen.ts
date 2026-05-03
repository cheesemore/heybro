import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { ROUNDS } from '../roundConfig';
import type { RunState } from '../runState';

type Handlers = {
  onEnterRound: () => void;
  onResetDemo: () => void;
};

export class LevelMapScreen extends Container {
  private readonly run: RunState;
  private readonly h: Handlers;

  constructor(run: RunState, h: Handlers) {
    super();
    this.run = run;
    this.h = h;

    const pad = Math.round(28 * LAYOUT_SCALE);

    const title = new Text({
      text: 'HeyBro · 竖版自走棋 Demo',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(40 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '700',
      },
    });
    title.position.set(pad, Math.round(24 * LAYOUT_SCALE));
    this.addChild(title);

    const hp = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(28 * LAYOUT_SCALE),
        fill: 0x93c5fd,
      },
    });
    hp.position.set(pad, Math.round(82 * LAYOUT_SCALE));
    this.addChild(hp);

    const gold = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xfbbf24,
      },
    });
    gold.position.set(Math.round(400 * LAYOUT_SCALE), Math.round(82 * LAYOUT_SCALE));
    this.addChild(gold);

    const nodeRadius = Math.round(30 * LAYOUT_SCALE);
    const colStep = Math.round(86 * LAYOUT_SCALE);
    const rowBaseY = Math.round(200 * LAYOUT_SCALE);
    const rowGap = Math.round(268 * LAYOUT_SCALE);
    const gridOriginX = (GAME_WIDTH - 7 * colStep) / 2;
    for (let i = 0; i < ROUNDS.length; i++) {
      const meta = ROUNDS[i]!;
      const chapter = meta.chapter - 1;
      const sub = meta.sub - 1;
      const cx = gridOriginX + sub * colStep;
      const cy = rowBaseY + chapter * rowGap;

      const g = new Graphics();
      let color = 0x334155;
      if (i < this.run.currentRoundIndex) color = 0x22c55e;
      if (i === this.run.currentRoundIndex) color = 0xf59e0b;
      if (i > this.run.currentRoundIndex) color = 0x1f2937;
      g.circle(0, 0, nodeRadius)
        .fill(color)
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x0f172a });
      g.position.set(cx, cy);
      this.addChild(g);

      const t = new Text({
        text: meta.label,
        style: {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: Math.round(19 * LAYOUT_SCALE),
          fill: 0xe2e8f0,
          fontWeight: '600',
        },
      });
      t.anchor.set(0.5, 1.55);
      t.position.set(cx, cy);
      this.addChild(t);

      const mark =
        meta.kind === 'boss' ? 'B' : meta.kind === 'strategy' ? '策' : meta.kind === 'reward' ? '奖' : '';
      if (mark) {
        const m = new Text({
          text: mark,
          style: {
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: Math.round(17 * LAYOUT_SCALE),
            fill: 0xfef3c7,
            fontWeight: '700',
          },
        });
        m.anchor.set(0.5, 0.5);
        m.position.set(cx, cy);
        this.addChild(m);
      }
    }

    const legend = new Text({
      text: '绿色：已完成  橙色：当前  灰色：未解锁\nB=首领 策=抉择 奖=奖励',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        lineHeight: Math.round(28 * LAYOUT_SCALE),
      },
    });
    legend.position.set(pad, Math.min(GAME_HEIGHT - Math.round(220 * LAYOUT_SCALE), rowBaseY + 3 * rowGap + Math.round(36 * LAYOUT_SCALE)));
    this.addChild(legend);

    const canEnter = this.run.currentRoundIndex < ROUNDS.length && !this.run.isGameLost();
    const enterW = Math.round(520 * LAYOUT_SCALE);
    const enterH = Math.round(72 * LAYOUT_SCALE);
    const enter = new Graphics();
    enter.roundRect(0, 0, enterW, enterH, Math.round(16 * LAYOUT_SCALE)).fill(canEnter ? 0x2563eb : 0x475569);
    enter.eventMode = canEnter ? 'static' : 'passive';
    enter.cursor = canEnter ? 'pointer' : 'default';
    enter.position.set((GAME_WIDTH - enterW) / 2, GAME_HEIGHT - Math.round(148 * LAYOUT_SCALE));
    if (canEnter) {
      enter.on('pointertap', () => this.h.onEnterRound());
    }
    this.addChild(enter);

    const curMeta =
      this.run.currentRoundIndex < ROUNDS.length ? ROUNDS[this.run.currentRoundIndex]! : null;
    const actionWord =
      curMeta?.kind === 'strategy'
        ? '抉择'
        : curMeta?.kind === 'reward'
          ? '领奖'
          : curMeta?.kind === 'boss'
            ? '选牌与首领战'
            : '选牌';
    const enterLabel =
      this.run.currentRoundIndex >= ROUNDS.length
        ? this.run.playerHp > 0
          ? '已通关 3-8'
          : '流程结束'
        : this.run.isGameLost()
          ? '已失败（可重置）'
          : `进入 ${ROUNDS[this.run.currentRoundIndex]!.label}（${actionWord}）`;
    const enterText = new Text({
      text: enterLabel,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xffffff,
        fontWeight: '700',
      },
    });
    enterText.anchor.set(0.5);
    enterText.position.set(GAME_WIDTH / 2, enter.y + enterH / 2);
    this.addChild(enterText);

    const resetW = Math.round(200 * LAYOUT_SCALE);
    const resetH = Math.round(52 * LAYOUT_SCALE);
    const reset = new Graphics();
    reset.roundRect(0, 0, resetW, resetH, Math.round(12 * LAYOUT_SCALE)).fill(0x111827);
    reset.stroke({ width: Math.max(1, Math.round(1 * LAYOUT_SCALE)), color: 0x334155 });
    reset.eventMode = 'static';
    reset.cursor = 'pointer';
    reset.position.set(GAME_WIDTH - resetW - Math.round(20 * LAYOUT_SCALE), Math.round(32 * LAYOUT_SCALE));
    reset.on('pointertap', () => this.h.onResetDemo());
    this.addChild(reset);

    const resetText = new Text({
      text: '重置 Demo',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0xe2e8f0,
      },
    });
    resetText.anchor.set(0.5);
    resetText.position.set(reset.x + resetW / 2, reset.y + resetH / 2);
    this.addChild(resetText);

    const refreshHud = (): void => {
      hp.text = `生命：${this.run.playerHp}`;
      gold.text = `金币：${this.run.gold}`;
    };
    refreshHud();
  }
}
