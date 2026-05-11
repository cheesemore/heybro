import { Assets, type Texture } from 'pixi.js';
import type { HeroId } from './heroRegistry';
import { HERO_IDS } from './heroRegistry';

/** 圆形半身：`public/assets/heroes/<HeroId>.png`（与 `heroRegistry` 的 id 一致，如 warrior_01） */
function urlFor(id: HeroId): string {
  const rel = `assets/heroes/${id}.png`;
  const base = import.meta.env.BASE_URL;
  if (!base || base === '/') return `/${rel}`;
  return `${base}${rel}`.replace(/\/{2,}/g, '/');
}

const textureById = new Map<HeroId, Texture>();
let preloadPromise: Promise<void> | null = null;

export async function preloadHeroPortraitTextures(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = (async () => {
      await Promise.all(
        HERO_IDS.map(async (id) => {
          try {
            const tex = await Assets.load<Texture>(urlFor(id));
            textureById.set(id, tex);
          } catch {
            /* 缺图：战斗/界面回退为职业色盘 */
          }
        }),
      );
    })();
  }
  await preloadPromise;
}

export function getHeroPortraitTexture(id: HeroId): Texture | undefined {
  return textureById.get(id);
}
