import type { Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';

/**
 * 浏览器 client 坐标 → 逻辑画布坐标（与 `layoutGameStage` 的 contain 居中一致）。
 * 用于 document 级 pointer 落点判定（Pixi 未走命中链时）。
 */
export function clientToGameLogical(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  viewportW = canvasRect.width,
  viewportH = canvasRect.height,
): { x: number; y: number } | null {
  if (viewportW <= 0 || viewportH <= 0) return null;
  const s = Math.min(viewportW / GAME_WIDTH, viewportH / GAME_HEIGHT);
  const ox = canvasRect.left + (viewportW - GAME_WIDTH * s) / 2;
  const oy = canvasRect.top + (viewportH - GAME_HEIGHT * s) / 2;
  return { x: (clientX - ox) / s, y: (clientY - oy) / s };
}

/** 逻辑画布 contain 缩放到实际 renderer 视口并居中 */
export function layoutGameStage(root: Container, screenW: number, screenH: number): void {
  const sx = screenW / GAME_WIDTH;
  const sy = screenH / GAME_HEIGHT;
  const s = Math.min(sx, sy);
  root.scale.set(s);
  root.position.set((screenW - GAME_WIDTH * s) / 2, (screenH - GAME_HEIGHT * s) / 2);
}
