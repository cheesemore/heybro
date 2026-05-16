import assetManifestDoc from './config/assetManifest.json';
import { publicAssetUrl } from './loadPublicTexture';

/** 与 manifest schemaVersion 同步；改结构时递增以丢弃旧 Cache */
export const GAME_ASSET_CACHE_NAME = 'heybro-game-assets-v1';

const MANIFEST_PATHS: readonly string[] = assetManifestDoc.paths;

const PRELOAD_CONCURRENCY = 6;
const PER_FILE_TIMEOUT_MS = 45_000;

export type GameAssetPreloadProgress = {
  loaded: number;
  total: number;
  failed: number;
  /** 当前正在尝试的路径（public 相对路径） */
  current?: string;
};

export type GameAssetPreloadResult = {
  loaded: number;
  failed: number;
  failedPaths: string[];
  skippedCache: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function openAssetCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(GAME_ASSET_CACHE_NAME);
  } catch {
    return null;
  }
}

/** 单文件：优先 Cache Storage，否则 fetch 并写入缓存；顺带 decode 预热 */
async function preloadOnePath(rel: string, cache: Cache | null): Promise<void> {
  const url = publicAssetUrl(rel);
  let response: Response | undefined;

  if (cache) {
    try {
      response = (await cache.match(url)) ?? undefined;
    } catch {
      /* ignore */
    }
  }

  if (!response) {
    const fetched = await fetch(url, { credentials: 'same-origin', cache: 'default' });
    if (!fetched.ok) {
      throw new Error(`HTTP ${fetched.status}`);
    }
    response = fetched;
    if (cache) {
      try {
        await cache.put(url, response.clone());
      } catch {
        /* quota / private mode */
      }
    }
  }

  const blob = await response.blob();
  if (blob.size < 1) {
    throw new Error('empty blob');
  }
  const bmp = await createImageBitmap(blob);
  bmp.close();
}

/**
 * 预加载 manifest 中的全部图片到 Cache Storage + HTTP 缓存。
 * 单文件失败不阻断；全部结束后返回失败列表。
 */
export async function preloadAllGameAssets(
  onProgress?: (p: GameAssetPreloadProgress) => void,
): Promise<GameAssetPreloadResult> {
  const paths = MANIFEST_PATHS;
  const total = paths.length;
  let loaded = 0;
  let failed = 0;
  const failedPaths: string[] = [];
  const cache = await openAssetCache();

  const report = (current?: string): void => {
    onProgress?.({ loaded, total, failed, current });
  };

  report();

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= total) return;
      const rel = paths[i]!;
      report(rel);
      try {
        await withTimeout(preloadOnePath(rel, cache), PER_FILE_TIMEOUT_MS, rel);
      } catch {
        failed += 1;
        failedPaths.push(rel);
      }
      loaded += 1;
      report();
    }
  };

  const n = Math.min(PRELOAD_CONCURRENCY, Math.max(1, total));
  await Promise.all(Array.from({ length: n }, () => worker()));

  return {
    loaded: loaded - failed,
    failed,
    failedPaths,
    skippedCache: cache == null,
  };
}

export function gameAssetManifestCount(): number {
  return MANIFEST_PATHS.length;
}
