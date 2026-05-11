import { Assets, type Texture } from 'pixi.js';
import type { EnemyPaintKind } from './battleVisuals';
import { ENEMY_PAINT_PRELOAD_ORDER } from './enemyBodyBounds';

const textureByPaint = new Map<EnemyPaintKind, Texture>();
let preloadPromise: Promise<void> | null = null;
let preloadDone = false;

function enemyTextureUrl(paint: EnemyPaintKind): string {
  const base = import.meta.env.BASE_URL;
  const rel = `assets/enemies/${paint}.png`;
  if (!base || base === '/') return `/${rel}`;
  return `${base}${rel}`.replace(/\/{2,}/g, '/');
}

/**
 * 尝试预加载 `public/assets/enemies/<paint>.png`；缺文件则静默跳过，战斗 UI 用矢量圆盘兜底。
 */
export async function preloadEnemyPortraitTextures(): Promise<void> {
  if (preloadDone) return;
  if (!preloadPromise) {
    preloadPromise = (async () => {
      await Promise.all(
        ENEMY_PAINT_PRELOAD_ORDER.map(async (paint) => {
          try {
            const tex = await Assets.load<Texture>(enemyTextureUrl(paint));
            textureByPaint.set(paint, tex);
          } catch {
            /* 无文件或加载失败 */
          }
        }),
      );
      preloadDone = true;
    })();
  }
  await preloadPromise;
}

export function getEnemyPortraitTexture(paint: EnemyPaintKind): Texture | undefined {
  return textureByPaint.get(paint);
}
