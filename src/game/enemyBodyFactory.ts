import { Assets, Graphics, Sprite, type Texture } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';
import type { EnemyPaintKind } from './battleVisuals';
import { paintEnemyBody } from './battleVisuals';
import { ENEMY_BODY_BOUNDS, ENEMY_PAINT_PRELOAD_ORDER } from './enemyBodyBounds';

export type EnemyBodyDisplayVariant = 'battle' | 'mapMini' | 'mapPreviewModal' | 'chapterMini';

let preloadPromise: Promise<void> | null = null;
/** Successfully loaded textures */
const textureByPaint = new Map<EnemyPaintKind, Texture>();
const intrinsicByPaint = new Map<EnemyPaintKind, { iw: number; ih: number }>();
let preloadDone = false;

function enemyTextureUrl(paint: EnemyPaintKind): string {
  const base = import.meta.env.BASE_URL;
  const rel = `assets/enemies/${paint}.png`;
  if (!base || base === '/') return `/${rel}`;
  return `${base}${rel}`.replace(/\/{2,}/g, '/');
}

/** Full roster: all ids that have a PNG in public/assets/enemies/ */
export function useEnemyTexturesAll(): boolean {
  return import.meta.env.VITE_ENEMY_TEXTURES === 'true';
}

/** Legacy: only grunt was toggled */
export function useEnemyTextureGruntOnly(): boolean {
  return import.meta.env.VITE_ENEMY_GRUNT_TEXTURE === 'true' && !useEnemyTexturesAll();
}

export function useAnyEnemyTexture(): boolean {
  return useEnemyTexturesAll() || useEnemyTextureGruntOnly();
}

function paintsToPreload(): readonly EnemyPaintKind[] {
  if (useEnemyTexturesAll()) return ENEMY_PAINT_PRELOAD_ORDER;
  if (useEnemyTextureGruntOnly()) return ['grunt'];
  return [];
}

/** Uniform scale so sprite fits ENEMY_BODY_BOUNDS * layoutMultiplier. */
export function enemySpriteUniformScale(
  paint: EnemyPaintKind,
  intrinsicW: number,
  intrinsicH: number,
  layoutMultiplier: number,
): number {
  const { w, h } = ENEMY_BODY_BOUNDS[paint];
  const tw = w * layoutMultiplier;
  const th = h * layoutMultiplier;
  return Math.min(tw / intrinsicW, th / intrinsicH);
}

function variantToLayoutMultiplier(variant: EnemyBodyDisplayVariant): number {
  switch (variant) {
    case 'battle':
      return LAYOUT_SCALE;
    case 'mapMini':
      return 0.42 * LAYOUT_SCALE;
    case 'mapPreviewModal':
      return 0.74 * LAYOUT_SCALE;
    case 'chapterMini':
      return 0.66 * LAYOUT_SCALE;
    default:
      return LAYOUT_SCALE;
  }
}

/**
 * Preload enemy PNGs when VITE_ENEMY_TEXTURES or VITE_ENEMY_GRUNT_TEXTURE is true.
 */
export async function preloadEnemyTextures(): Promise<void> {
  if (!useAnyEnemyTexture()) return;
  if (preloadDone) return;
  if (!preloadPromise) {
    preloadPromise = (async () => {
      const ids = paintsToPreload();
      await Promise.all(
        ids.map(async (paint) => {
          try {
            const url = enemyTextureUrl(paint);
            const tex = await Assets.load(url);
            textureByPaint.set(paint, tex);
            intrinsicByPaint.set(paint, { iw: tex.width || 1, ih: tex.height || 1 });
          } catch {
            /* missing file → vector fallback for this id */
          }
        }),
      );
      preloadDone = true;
    })();
  }
  await preloadPromise;
}

/**
 * Battle / map / chapter: vector Graphics, or Sprite when texture loaded for this paint.
 */
export function createEnemyBodyDisplay(paint: EnemyPaintKind, variant: EnemyBodyDisplayVariant): Graphics | Sprite {
  const tex = textureByPaint.get(paint);
  const intr = intrinsicByPaint.get(paint);
  if (useAnyEnemyTexture() && tex && intr) {
    const spr = Sprite.from(tex);
    spr.anchor.set(0.5, 1);
    const m = variantToLayoutMultiplier(variant);
    const s = enemySpriteUniformScale(paint, intr.iw, intr.ih, m);
    spr.scale.set(s);
    return spr;
  }
  const g = new Graphics();
  paintEnemyBody(g, paint);
  return g;
}

/** @deprecated use preloadEnemyTextures */
export async function preloadGruntEnemyTexture(): Promise<void> {
  await preloadEnemyTextures();
}
