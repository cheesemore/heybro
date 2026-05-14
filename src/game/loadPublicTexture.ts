import { Assets, Texture } from 'pixi.js';

/**
 * 将 `public/` 下资源的相对路径解析为绝对 URL。
 * 生产 `vite` 使用 `base: './'` 时，仅靠 `./assets/...` 在 Pixi `Assets.load` 内可能解析失败，故用 `URL(relative, location)` 固定到当前页面。
 *
 * @param rel 无首斜杠，如 `assets/title-cover.png`、`portraits/ally/warrior.png`
 */
export function publicAssetUrl(rel: string): string {
  const normalized = rel.replace(/^\/+/, '');
  const base = import.meta.env.BASE_URL ?? '/';
  const joined =
    !base || base === '/' ? `/${normalized}` : `${base}${normalized}`.replace(/\/{2,}/g, '/');
  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      return new URL(joined, window.location.href).href;
    } catch {
      /* ignore */
    }
  }
  return joined;
}

/** 依次尝试多个绝对 URL，返回首个成功加载的纹理 */
export async function loadPublicTextureFirst(urls: readonly string[]): Promise<Texture> {
  let last: unknown;
  for (const url of urls) {
    try {
      return await loadPublicTexture(url);
    } catch (e) {
      last = e;
    }
  }
  if (import.meta.env.DEV && urls.length) {
    console.warn('[loadPublicTextureFirst] all failed', urls, last);
  }
  throw last;
}

function loadTextureViaHtmlImage(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      try {
        resolve(Texture.from(img));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (): void => reject(new Error('Image.onerror'));
    img.src = url;
  });
}

/**
 * 加载 `public/` 纹理（`url` 须为 `publicAssetUrl` 等得到的绝对地址）。
 * 顺序与封面验证一致：`HTMLImageElement`（同普通网页）→ `fetch`+ImageBitmap → Pixi `Assets`（最后兜底）。
 */
export async function loadPublicTexture(url: string): Promise<Texture> {
  try {
    return await loadTextureViaHtmlImage(url);
  } catch {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      return Texture.from(await createImageBitmap(blob));
    } catch {
      try {
        return await Assets.load<Texture>(url);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn('[loadPublicTexture] Image / fetch / Assets 均失败', url, e);
        }
        throw e;
      }
    }
  }
}
