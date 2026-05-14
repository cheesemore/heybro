import type { Texture } from 'pixi.js';
import type { EnemyPaintKind } from './battleVisuals';
import { ENEMY_PAINT_PRELOAD_ORDER } from './enemyBodyBounds';
import { mobIdsForBookChapter } from './bookChapterConfig';
import { bossUidForBookChapter, getWowMob } from './wowBookData';
import { loadPublicTexture, publicAssetUrl } from './loadPublicTexture';

const textureByPaint = new Map<EnemyPaintKind, Texture>();
let preloadPromise: Promise<void> | null = null;
let preloadDone = false;

function enemyTextureUrl(paint: EnemyPaintKind): string {
  return publicAssetUrl(`assets/enemies/${paint}.png`);
}

/**
 * 尝试预加载 `public/assets/enemies/<paint>.png`；缺文件则静默跳过，战斗 UI 用矢量圆盘兜底。
 * 用书怪专属立绘见 `wowMobPortraitTextureUrlByMonsterUid` / `wowMobPortraitTextureUrl`（`public/assets/wow-mobs/`），当前未批量预加载。
 */
export async function preloadEnemyPortraitTextures(): Promise<void> {
  if (preloadDone) return;
  if (!preloadPromise) {
    preloadPromise = (async () => {
      await Promise.all(
        ENEMY_PAINT_PRELOAD_ORDER.map(async (paint) => {
          try {
            const tex = await loadPublicTexture(enemyTextureUrl(paint));
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

const textureByWowCircleUid = new Map<string, Texture>();

function assetBaseRelUrl(rel: string): string {
  return publicAssetUrl(rel);
}

/** 用书小怪圆形代币立绘：`public/assets/wow-mobs-circle/<monsterUid>.png` */
export function wowMobCirclePortraitTextureUrlByMonsterUid(monsterUid: string): string {
  return assetBaseRelUrl(`assets/wow-mobs-circle/${monsterUid}.png`);
}

/** 用书首领圆形代币立绘：`public/assets/wow-bosses-circle/<bossUid>.png` */
export function wowBossCirclePortraitTextureUrlByBossUid(bossUid: string): string {
  return assetBaseRelUrl(`assets/wow-bosses-circle/${bossUid}.png`);
}

export function wowCirclePortraitTextureUrl(uid: string): string {
  if (/^B\d{6}$/.test(uid)) return wowBossCirclePortraitTextureUrlByBossUid(uid);
  return wowMobCirclePortraitTextureUrlByMonsterUid(uid);
}

export function getWowCirclePortraitTexture(uid: string): Texture | undefined {
  return textureByWowCircleUid.get(uid);
}

/** 按需加载圆形立绘（缺文件则静默跳过）。 */
export async function preloadWowCirclePortraitsForUids(uids: readonly string[]): Promise<void> {
  const seen = new Set<string>();
  const unique = uids.filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  await Promise.all(
    unique.map(async (uid) => {
      if (textureByWowCircleUid.has(uid)) return;
      try {
        const tex = await loadPublicTexture(wowCirclePortraitTextureUrl(uid));
        textureByWowCircleUid.set(uid, tex);
      } catch {
        /* 无文件或加载失败 */
      }
    }),
  );
}

/** 预加载本章 mob 池与关底首领的圆形立绘（若有对应 PNG）。 */
export async function preloadWowCirclePortraitsForBookChapter(bookChapterId: number): Promise<void> {
  const id = Math.max(1, Math.floor(bookChapterId));
  const uids: string[] = [];
  for (const mobId of mobIdsForBookChapter(id)) {
    const mob = getWowMob(mobId);
    if (mob?.monsterUid) uids.push(mob.monsterUid);
  }
  const bu = bossUidForBookChapter(id);
  if (bu) uids.push(bu);
  await preloadWowCirclePortraitsForUids(uids);
}

/**
 * 用书怪立绘 URL（推荐出图文件名）：`monsterUid` 与 `wowBookMonsters.json` 中该字段一致（例 `U000042.png`）。
 */
export function wowMobPortraitTextureUrlByMonsterUid(monsterUid: string): string {
  return publicAssetUrl(`assets/wow-mobs/${monsterUid}.png`);
}

/**
 * 用书怪立绘 URL（兼容旧命名）：`mobId` 与表中 `id` 一致（例 `mob_ragefire_trogg.png`）。
 */
export function wowMobPortraitTextureUrl(mobId: string): string {
  return publicAssetUrl(`assets/wow-mobs/${mobId}.png`);
}

/**
 * 用书关卡首领立绘 URL：`bossUid` 与 `wowBookBosses.json` 一致（例 `B000001.png`）。
 */
export function wowBossPortraitTextureUrlByBossUid(bossUid: string): string {
  return publicAssetUrl(`assets/wow-bosses/${bossUid}.png`);
}
