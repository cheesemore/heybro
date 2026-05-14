import type { Texture } from 'pixi.js';
import { loadPublicTexture, publicAssetUrl } from './loadPublicTexture';
import type { AllyClass } from './types';

/**
 * 盟友圆形头像：`public/portraits/ally/<AllyClass>.png`
 *
 * 资源来自 `gptimage/out_dbm/circle/*_circle_256.png`（饥荒式线稿风），拷贝时已做文件名映射：
 * - warrior / mage / priest：同名
 * - hunter → archer（射手）
 * - paladin → knight（圣骑板甲 → 骑士）
 */
const ALLY_PORTRAIT_REL = (kind: AllyClass): string => `portraits/ally/${kind}.png`;

function portraitUrl(kind: AllyClass): string {
  return publicAssetUrl(ALLY_PORTRAIT_REL(kind));
}

const textureByKind = new Map<AllyClass, Texture>();
let preloadPromise: Promise<void> | null = null;

export async function preloadAllyPortraitTextures(): Promise<void> {
  if (!preloadPromise) {
    const kinds: AllyClass[] = ['warrior', 'mage', 'priest', 'archer', 'knight'];
    preloadPromise = (async () => {
      await Promise.all(
        kinds.map(async (kind) => {
          try {
            const tex = await loadPublicTexture(portraitUrl(kind));
            textureByKind.set(kind, tex);
          } catch {
            /* 缺文件或网络失败：战斗 UI 回退为色盘 + 字 */
          }
        }),
      );
    })();
  }
  await preloadPromise;
}

export function getAllyPortraitTexture(kind: AllyClass): Texture | undefined {
  return textureByKind.get(kind);
}
