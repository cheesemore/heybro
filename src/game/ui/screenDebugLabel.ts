import { Container, Text } from 'pixi.js';
import { GAME_HEIGHT, LAYOUT_SCALE } from '../constants';

/**
 * 左下角极小字：与人对齐界面时用（类名 / 约定 id）。
 * 使用较高 zIndex，需在 root 上 `sortableChildren = true` 才生效。
 */
export function attachScreenDebugLabel(root: Container, screenId: string): void {
  root.sortableChildren = true;
  const label = new Text({
    text: screenId,
    style: {
      fontFamily: 'ui-monospace, Consolas, "Cascadia Mono", monospace',
      fontSize: Math.round(10 * LAYOUT_SCALE),
      fill: 0x64748b,
      fontWeight: '600',
    },
  });
  label.eventMode = 'none';
  label.alpha = 0.9;
  label.anchor.set(0, 1);
  label.position.set(Math.round(6 * LAYOUT_SCALE), GAME_HEIGHT - Math.round(6 * LAYOUT_SCALE));
  label.zIndex = 100_000;
  root.addChild(label);
}
