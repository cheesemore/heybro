import type { Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';

/** 逻辑画布 contain 缩放到实际 renderer 视口并居中 */
export function layoutGameStage(root: Container, screenW: number, screenH: number): void {
  const sx = screenW / GAME_WIDTH;
  const sy = screenH / GAME_HEIGHT;
  const s = Math.min(sx, sy);
  root.scale.set(s);
  root.position.set((screenW - GAME_WIDTH * s) / 2, (screenH - GAME_HEIGHT * s) / 2);
}
