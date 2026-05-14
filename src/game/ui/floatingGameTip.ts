import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';

/** 生成后静止时长，再开始上移淡出 */
const TIP_HOLD_MS = 480;
/** 上飘并淡出阶段 */
const TIP_FLOAT_MS = 520;

/**
 * 单行提示：半透明黑底、白字；约在屏幕**上三分之一**（距顶约 1/3 屏高处）出现，
 * 先短暂停留，再上移并淡出，结束后自毁。
 */
export function spawnFloatingGameTip(root: Container, message: string): void {
  root.sortableChildren = true;

  const wrap = new Container();
  wrap.eventMode = 'none';
  wrap.zIndex = 100_000;

  const fs = Math.round(20 * LAYOUT_SCALE);
  const padX = Math.round(22 * LAYOUT_SCALE);
  const padY = Math.round(11 * LAYOUT_SCALE);

  const label = new Text({
    text: message,
    style: {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: fs,
      fill: 0xffffff,
      fontWeight: '600',
    },
  });

  const bw = Math.min(Math.round(GAME_WIDTH * 0.9), Math.ceil(label.width + padX * 2));
  const bh = Math.ceil(label.height + padY * 2);
  const r = Math.round(12 * LAYOUT_SCALE);

  const bg = new Graphics();
  bg.roundRect(-bw / 2, -bh / 2, bw, bh, r).fill({ color: 0x000000, alpha: 0.7 });
  wrap.addChild(bg);

  label.anchor.set(0.5);
  wrap.addChild(label);

  /** 距顶约 1/3 屏高（偏上区域），避免落在屏幕下半 */
  const startY = GAME_HEIGHT / 3;
  const drift = Math.round(120 * LAYOUT_SCALE);
  wrap.position.set(GAME_WIDTH / 2, startY);
  root.addChild(wrap);

  const t0 = performance.now();
  let raf = 0;

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const tick = (now: number): void => {
    if (!wrap.parent || wrap.destroyed) {
      stop();
      return;
    }
    const elapsed = now - t0;
    if (elapsed <= TIP_HOLD_MS) {
      wrap.alpha = 1;
      wrap.y = startY;
    } else {
      const ft = Math.min(1, (elapsed - TIP_HOLD_MS) / TIP_FLOAT_MS);
      wrap.alpha = 1 - ft;
      wrap.y = startY - drift * ft;
      if (ft >= 1) {
        stop();
        root.removeChild(wrap);
        wrap.destroy({ children: true });
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
}
