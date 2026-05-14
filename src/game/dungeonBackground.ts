import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';

/** `public/assets/dungeon-bgs/<dungeonId>.png`，强制拉伸铺满逻辑 1080×1920 底板 */
export function dungeonBackgroundImageUrl(dungeonId: string): string {
  const base = import.meta.env.BASE_URL;
  const rel = `assets/dungeon-bgs/${dungeonId}.png`;
  if (!base || base === '/') return `/${rel}`;
  return `${base}${rel}`.replace(/\/{2,}/g, '/');
}

/**
 * 在容器最底层插入全屏拉伸底图（非等比，对齐 GAME_WIDTH×GAME_HEIGHT），其上可选压一层半透明色便于读字。
 * 异步加载；失败时铺深色占位。
 */
export function mountStretchedDungeonBackground(
  parent: Container,
  dungeonId: string,
  options?: { dimAlpha?: number },
): void {
  const dimAlpha = options?.dimAlpha ?? 0.36;
  const url = dungeonBackgroundImageUrl(dungeonId);
  void Assets.load(url)
    .then((tex) => {
      if (parent.destroyed) {
        tex.destroy(true);
        return;
      }
      const sp = new Sprite(tex);
      sp.eventMode = 'none';
      sp.width = GAME_WIDTH;
      sp.height = GAME_HEIGHT;
      sp.position.set(0, 0);
      parent.addChildAt(sp, 0);
      if (dimAlpha > 0.001) {
        const dim = new Graphics();
        dim.eventMode = 'none';
        dim.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x020617, alpha: dimAlpha });
        parent.addChildAt(dim, 1);
      }
    })
    .catch(() => {
      if (parent.destroyed) return;
      const g = new Graphics();
      g.eventMode = 'none';
      g.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0a0f1c);
      parent.addChildAt(g, 0);
    });
}
