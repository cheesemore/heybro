import type { Texture } from 'pixi.js';
import type { HeroId } from './heroRegistry';
import { HERO_IDS } from './heroRegistry';
import { loadPublicTexture, publicAssetUrl } from './loadPublicTexture';

/** 圆形半身：`public/assets/heroes/<HeroId>.png`（与 `heroRegistry` 的 id 一致，如 warrior_01） */
function urlFor(id: HeroId): string {
  return publicAssetUrl(`assets/heroes/${id}.png`);
}

/** 德鲁伊熊形态：`public/assets/heroes/<HeroId>_bear.png`（见 `gptimage/generate_hero_unit_portraits.py`） */
export function heroBearPortraitAssetId(id: HeroId): string {
  return `${id}_bear`;
}

function bearUrlFor(id: HeroId): string {
  return publicAssetUrl(`assets/heroes/${heroBearPortraitAssetId(id)}.png`);
}

export function isDruidHeroId(id: HeroId): boolean {
  return id.startsWith('druid_');
}

const textureById = new Map<HeroId, Texture>();
const bearTextureById = new Map<HeroId, Texture>();
let preloadPromise: Promise<void> | null = null;

export async function preloadHeroPortraitTextures(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = (async () => {
      await Promise.all(
        HERO_IDS.map(async (id) => {
          try {
            const tex = await loadPublicTexture(urlFor(id));
            textureById.set(id, tex);
          } catch {
            /* 缺图：战斗/界面回退为职业色盘 */
          }
          if (isDruidHeroId(id)) {
            try {
              const bearTex = await loadPublicTexture(bearUrlFor(id));
              bearTextureById.set(id, bearTex);
            } catch {
              /* 缺熊图时战斗熊形态回退人形态或盟友 druid_bear */
            }
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

export function getHeroBearPortraitTexture(id: HeroId): Texture | undefined {
  return bearTextureById.get(id);
}
