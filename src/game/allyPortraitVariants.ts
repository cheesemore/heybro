import type { Texture } from 'pixi.js';
import { loadPublicTexture, publicAssetUrl } from './loadPublicTexture';

/**
 * 盟友圆形头像变体（如德鲁伊熊形态）。
 * 资源：`public/portraits/ally/<variantId>.png`
 * DBM 生成见 `gptimage/batch_dbm_portraits.py` 中 `druid_bear` 条目。
 */
export type AllyPortraitVariantId = 'druid_bear';

const VARIANT_REL: Record<AllyPortraitVariantId, string> = {
  druid_bear: 'portraits/ally/druid_bear.png',
};

const textureByVariant = new Map<AllyPortraitVariantId, Texture>();
let preloadPromise: Promise<void> | null = null;

export async function preloadAllyPortraitVariantTextures(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = (async () => {
      for (const id of Object.keys(VARIANT_REL) as AllyPortraitVariantId[]) {
        try {
          const tex = await loadPublicTexture(publicAssetUrl(VARIANT_REL[id]));
          textureByVariant.set(id, tex);
        } catch {
          /* 缺图时熊德回退德鲁伊/色盘 */
        }
      }
    })();
  }
  await preloadPromise;
}

export function getAllyPortraitVariantTexture(id: AllyPortraitVariantId): Texture | undefined {
  return textureByVariant.get(id);
}
