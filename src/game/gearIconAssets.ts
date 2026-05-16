import { loadPublicTexture, publicAssetUrl } from './loadPublicTexture';
import type { Texture } from 'pixi.js';

/** `public/assets/gear/<gearId>.png`，文件名与 `gearItems.json` 的 gearId 一致 */
export function gearIconUrl(gearId: string): string {
  return publicAssetUrl(`assets/gear/${gearId}.png`);
}

const cache = new Map<string, Texture>();

export async function loadGearIconTexture(gearId: string): Promise<Texture | null> {
  const hit = cache.get(gearId);
  if (hit) return hit;
  try {
    const tex = await loadPublicTexture(gearIconUrl(gearId));
    cache.set(gearId, tex);
    return tex;
  } catch {
    return null;
  }
}
