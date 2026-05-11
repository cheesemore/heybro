import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { COVER_VERSION_LABEL } from '../version';

/**
 * 启动封面（登录/欢迎页）：How Many Dudes 式人群 + HeyBro，点击后进入主流程。
 * 子节点 eventMode=none + 顶层透明点击层，避免命中被挡；见 main 须在 init 后再挂 GameRoot。
 */
export class TitleScreen extends Container {
  private readonly app: Application;
  private tickFn: (() => void) | null = null;
  private uiTestKeyCleanup: (() => void) | null = null;

  constructor(app: Application, onEnter: () => void, onUiTestBattle?: () => void) {
    super();
    this.app = app;

    const bg = new Graphics();
    bg.eventMode = 'none';
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x120a1e);
    for (let y = 0; y < GAME_HEIGHT; y += 6) {
      const t = y / GAME_HEIGHT;
      const c = Math.round(18 + t * 40);
      const r = Math.round(30 + t * 50);
      const b = Math.round(80 + t * 70);
      bg.rect(0, y, GAME_WIDTH, 6).fill({ color: (c << 16) | (r << 8) | b, alpha: 1 });
    }
    this.addChild(bg);

    const crowd = new Graphics();
    crowd.eventMode = 'none';
    const palette = [
      0xf97316, 0x22d3ee, 0xf472b6, 0xa3e635, 0xfbbf24, 0xc084fc, 0x38bdf8, 0xfb7185,
    ];
    let rng = 0x5f3759df >>> 0;
    const rnd = (): number => {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 0xffffffff;
    };
    const n = 140;
    for (let i = 0; i < n; i++) {
      const x = rnd() * (GAME_WIDTH + 40) - 20;
      const y = rnd() * (GAME_HEIGHT * 0.68) + GAME_HEIGHT * 0.18;
      const sc = (0.38 + rnd() * 0.5) * LAYOUT_SCALE;
      const bodyW = 24 * sc;
      const bodyH = 30 * sc;
      const headR = 15 * sc;
      const col = palette[(i * 7) % palette.length]!;
      crowd.roundRect(x - bodyW * 0.5, y, bodyW, bodyH, 9 * sc).fill({ color: col, alpha: 0.9 });
      crowd.circle(x, y - headR * 0.15, headR).fill({ color: 0xfffbeb, alpha: 0.96 });
      crowd.circle(x - headR * 0.32, y - headR * 0.42, 3.2 * sc).fill(0x1e293b);
      crowd.circle(x + headR * 0.32, y - headR * 0.42, 3.2 * sc).fill(0x1e293b);
    }
    this.addChild(crowd);

    const vignette = new Graphics();
    vignette.eventMode = 'none';
    vignette
      .rect(0, 0, GAME_WIDTH, Math.round(220 * LAYOUT_SCALE))
      .fill({ color: 0x020617, alpha: 0.55 });
    vignette
      .rect(0, GAME_HEIGHT - Math.round(280 * LAYOUT_SCALE), GAME_WIDTH, Math.round(280 * LAYOUT_SCALE))
      .fill({ color: 0x020617, alpha: 0.65 });
    this.addChild(vignette);

    const logo = new Text({
      text: 'HeyBro',
      style: {
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        fontSize: Math.round(112 * LAYOUT_SCALE),
        fill: 0xfef08a,
        fontWeight: '900',
        dropShadow: {
          alpha: 0.85,
          angle: Math.PI / 4,
          blur: 18,
          color: 0x7c3aed,
          distance: 6,
        },
        stroke: { color: 0x4c1d95, width: Math.max(3, Math.round(4 * LAYOUT_SCALE)) },
      },
    });
    logo.eventMode = 'none';
    logo.anchor.set(0.5, 0.5);
    logo.position.set(GAME_WIDTH * 0.5, GAME_HEIGHT * 0.38);
    this.addChild(logo);

    const tag = new Text({
      text: '竖版自走棋 · 点阵开战',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(26 * LAYOUT_SCALE),
        fill: 0xc4b5fd,
        fontWeight: '600',
      },
    });
    tag.eventMode = 'none';
    tag.anchor.set(0.5, 0);
    tag.position.set(GAME_WIDTH * 0.5, logo.y + Math.round(72 * LAYOUT_SCALE));
    this.addChild(tag);

    const hint = new Text({
      text: '点击屏幕进入游戏',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(32 * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '700',
      },
    });
    hint.eventMode = 'none';
    hint.anchor.set(0.5, 0.5);
    hint.position.set(GAME_WIDTH * 0.5, GAME_HEIGHT * 0.78);
    this.addChild(hint);

    const ver = new Text({
      text: COVER_VERSION_LABEL,
      style: {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        fontWeight: '600',
      },
    });
    ver.eventMode = 'none';
    ver.position.set(Math.round(20 * LAYOUT_SCALE), Math.round(16 * LAYOUT_SCALE));
    this.addChild(ver);

    if (import.meta.env.DEV && onUiTestBattle) {
      const devHint = new Text({
        text: 'DEV：按 U 进入「UI技能测试」战场',
        style: {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: Math.round(18 * LAYOUT_SCALE),
          fill: 0xfbbf24,
          fontWeight: '600',
        },
      });
      devHint.eventMode = 'none';
      devHint.alpha = 0.92;
      devHint.position.set(Math.round(20 * LAYOUT_SCALE), Math.round(52 * LAYOUT_SCALE));
      this.addChild(devHint);
      const onKey = (ev: KeyboardEvent): void => {
        if (ev.repeat || ev.code !== 'KeyU') return;
        ev.preventDefault();
        onUiTestBattle();
      };
      window.addEventListener('keydown', onKey);
      this.uiTestKeyCleanup = () => window.removeEventListener('keydown', onKey);
    }

    let entered = false;
    const go = (): void => {
      if (entered) return;
      entered = true;
      onEnter();
    };
    const tap = new Graphics();
    tap.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: 0.001 });
    tap.eventMode = 'static';
    tap.cursor = 'pointer';
    tap.on('pointertap', go);
    this.addChild(tap);

    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cursor = 'pointer';
    this.on('pointertap', go);

    this.tickFn = (): void => {
      if (hint.destroyed) return;
      hint.alpha = 0.5 + 0.5 * Math.sin(performance.now() * 0.0028);
    };
    app.ticker.add(this.tickFn);
  }

  override destroy(options?: boolean): void {
    if (this.tickFn) {
      this.app.ticker.remove(this.tickFn);
      this.tickFn = null;
    }
    if (this.uiTestKeyCleanup) {
      this.uiTestKeyCleanup();
      this.uiTestKeyCleanup = null;
    }
    super.destroy(options);
  }
}
