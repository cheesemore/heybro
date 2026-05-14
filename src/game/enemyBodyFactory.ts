import type { Container } from 'pixi.js';
import type { EnemyPaintKind } from './battleVisuals';
import { createMapEnemyToken } from './unitCircleTokens';
import {
  getEnemyPortraitTexture,
  preloadEnemyPortraitTextures,
  preloadWowCirclePortraitsForBookChapter,
} from './enemyPortraitTextures';

export type EnemyBodyDisplayVariant = 'battle' | 'mapMini' | 'mapPreviewModal' | 'chapterMini';

/** @deprecated 预加载已不再依赖该开关；保留以免外部引用报错 */
export function useEnemyTexturesAll(): boolean {
  return import.meta.env.VITE_ENEMY_TEXTURES === 'true';
}

/** @deprecated 见 useEnemyTexturesAll */
export function useEnemyTextureGruntOnly(): boolean {
  return import.meta.env.VITE_ENEMY_GRUNT_TEXTURE === 'true' && !useEnemyTexturesAll();
}

/** @deprecated 见 useEnemyTexturesAll */
export function useAnyEnemyTexture(): boolean {
  return useEnemyTexturesAll() || useEnemyTextureGruntOnly();
}

export { getEnemyPortraitTexture };

/** 预加载敌方圆形半身像 PNG（存在则战斗/地图代币内显示贴图）；可选传入书本章节号以预加载该书圆形立绘。 */
export async function preloadEnemyTextures(bookChapterId?: number): Promise<void> {
  await preloadEnemyPortraitTextures();
  if (bookChapterId != null && bookChapterId > 0) {
    await preloadWowCirclePortraitsForBookChapter(bookChapterId);
  }
}

export type EnemyBodyDisplayOptions = {
  /** `monsterUid`（U+六位）或 `bossUid`（B+六位），与 `public/assets/wow-*-circle/` 文件名一致 */
  wowCirclePortraitUid?: string;
};

/**
 * 地图 / 章节预览等：敌方代币（有血环的仅在战斗内由 BattleScreen 创建）。
 */
export function createEnemyBodyDisplay(
  paint: EnemyPaintKind,
  variant: EnemyBodyDisplayVariant,
  maxDiameterPx?: number,
  opts?: EnemyBodyDisplayOptions,
): Container {
  return createMapEnemyToken(paint, variant, maxDiameterPx, opts);
}

/** @deprecated use preloadEnemyTextures */
export async function preloadGruntEnemyTexture(): Promise<void> {
  await preloadEnemyTextures();
}
