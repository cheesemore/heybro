import { loadChapterProgress } from './chapterProgressStorage';
import type { HeroId } from './heroRegistry';
import { HERO_IDS, HERO_STAR_COST } from './heroRegistry';

const STORAGE_KEY = 'heybro.heroMeta.v1';

export type HeroSaveEntry = {
  /** 1～5 */
  stars: number;
  /** 已攒下的同名额外副本数（用于自动升星消耗） */
  duplicates: number;
};

export type HeroMetaFile = {
  version: 1;
  /** 已获得英雄 */
  heroes: Record<string, HeroSaveEntry>;
  /** 最多 3 个上阵位，值为英雄 id 或 null */
  deployed: [HeroId | null, HeroId | null, HeroId | null];
};

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function defaultFirstRun(): HeroMetaFile {
  const m: HeroMetaFile = {
    version: 1,
    heroes: {
      warrior_01: { stars: 1, duplicates: 0 },
    },
    deployed: [null, null, null],
  };
  return m;
}

function parse(raw: string | null): HeroMetaFile {
  if (!raw) return defaultFirstRun();
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return defaultFirstRun();
    const o = j as Record<string, unknown>;
    if (o.version !== 1) return defaultFirstRun();
    const heroesRaw = o.heroes;
    const heroes: Record<string, HeroSaveEntry> = {};
    if (heroesRaw && typeof heroesRaw === 'object') {
      for (const [k, v] of Object.entries(heroesRaw as Record<string, unknown>)) {
        if (!v || typeof v !== 'object') continue;
        const e = v as Record<string, unknown>;
        const stars = typeof e.stars === 'number' ? Math.max(1, Math.min(5, Math.floor(e.stars))) : 1;
        const duplicates = typeof e.duplicates === 'number' ? Math.max(0, Math.floor(e.duplicates)) : 0;
        heroes[k] = { stars, duplicates };
      }
    }
    const dep = o.deployed;
    const deployed: [HeroId | null, HeroId | null, HeroId | null] = [null, null, null];
    if (Array.isArray(dep) && dep.length >= 3) {
      for (let i = 0; i < 3; i++) {
        const x = dep[i];
        deployed[i] = typeof x === 'string' && HERO_IDS.includes(x) ? x : null;
      }
    }
    const base: HeroMetaFile = { version: 1, heroes, deployed };
    if (Object.keys(base.heroes).length === 0) return defaultFirstRun();
    return base;
  } catch {
    return defaultFirstRun();
  }
}

export function loadHeroMeta(): HeroMetaFile {
  const ls = safeLs();
  if (!ls) return defaultFirstRun();
  return parse(ls.getItem(STORAGE_KEY));
}

export function saveHeroMeta(data: HeroMetaFile): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** 通关第 1 / 5 / 10 章各解锁 1 个栏位，最多 3 */
export function maxHeroDeploySlots(): number {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  let n = 0;
  if (cleared.has(1)) n += 1;
  if (cleared.has(5)) n += 1;
  if (cleared.has(10)) n += 1;
  return n;
}

function tryConsumePromote(entry: HeroSaveEntry): void {
  while (entry.stars < 5) {
    const need = HERO_STAR_COST[entry.stars - 1];
    if (need == null || entry.duplicates < need) break;
    entry.duplicates -= need;
    entry.stars += 1;
  }
}

/** 随机抽到或首次解锁：增加副本并尝试升星 */
export function addHeroDuplicate(id: HeroId): void {
  if (!HERO_IDS.includes(id)) return;
  const cur = loadHeroMeta();
  const prev = cur.heroes[id];
  if (!prev) {
    cur.heroes[id] = { stars: 1, duplicates: 0 };
    saveHeroMeta(cur);
    return;
  }
  prev.duplicates += 1;
  tryConsumePromote(prev);
  saveHeroMeta(cur);
}

export function setDeployedSlot(slotIndex: number, heroId: HeroId | null): void {
  if (slotIndex < 0 || slotIndex > 2) return;
  const cur = loadHeroMeta();
  if (heroId !== null) {
    const cap = maxHeroDeploySlots();
    if (slotIndex >= cap || !cur.heroes[heroId]) return;
    for (let i = 0; i < 3; i++) {
      if (cur.deployed[i] === heroId) cur.deployed[i] = null;
    }
  }
  cur.deployed[slotIndex] = heroId;
  saveHeroMeta(cur);
}

export function clearDeployedSlot(slotIndex: number): void {
  setDeployedSlot(slotIndex, null);
}

export function getDeployedHeroIds(): readonly (HeroId | null)[] {
  return loadHeroMeta().deployed;
}

export function isHeroUnlocked(id: HeroId): boolean {
  return !!loadHeroMeta().heroes[id];
}

export function nextStarCost(stars: number): number | null {
  if (stars >= 5) return null;
  return HERO_STAR_COST[stars - 1] ?? null;
}

/** 第 1 / 2 / 3 个栏位分别需通关的章节 id */
export const HERO_DEPLOY_SLOT_CHAPTER: readonly [1, 5, 10] = [1, 5, 10];

export function findDeployedSlotIndex(heroId: HeroId): number | null {
  const dep = loadHeroMeta().deployed;
  for (let i = 0; i < 3; i++) {
    if (dep[i] === heroId) return i;
  }
  return null;
}

export function undeployHeroById(heroId: HeroId): void {
  const i = findDeployedSlotIndex(heroId);
  if (i != null) clearDeployedSlot(i);
}

/**
 * 将英雄放入第一个空栏位；若已在阵上则视为成功。
 * @returns `no_slots_unlocked` 表示尚未通关解锁任何栏位
 */
export function tryDeployHero(heroId: HeroId): 'ok' | 'no_hero' | 'full' | 'no_slots_unlocked' {
  const cap = maxHeroDeploySlots();
  if (cap === 0) return 'no_slots_unlocked';
  const cur = loadHeroMeta();
  if (!cur.heroes[heroId]) return 'no_hero';
  if (cur.deployed.some((x) => x === heroId)) return 'ok';
  for (let i = 0; i < cap; i++) {
    if (cur.deployed[i] == null) {
      setDeployedSlot(i, heroId);
      return 'ok';
    }
  }
  return 'full';
}
