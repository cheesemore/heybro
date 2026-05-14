import { loadChapterProgress } from './chapterProgressStorage';
import type { HeroId } from './heroRegistry';
import { HERO_REGISTRY, getHeroDef, HERO_IDS, HERO_STAR_COST } from './heroRegistry';

const STORAGE_KEY = 'heybro.heroMeta.v1';

const LOTTERY_LOG_CAP = 200;

export type HeroSaveEntry = {
  /** 1～5 */
  stars: number;
  /** 已攒下的同名额外副本数（用于自动升星消耗） */
  duplicates: number;
};

export type LotteryDrawLogEntry = {
  heroId: HeroId;
  ts: number;
};

export type HeroMetaFile = {
  version: 2;
  /** 已获得英雄 */
  heroes: Record<string, HeroSaveEntry>;
  /** 最多 3 个上阵位，值为英雄 id 或 null */
  deployed: [HeroId | null, HeroId | null, HeroId | null];
  /** 剩余英雄抽奖次数（战斗升星获得，抽卡消耗） */
  lotteryTicketsRemaining: number;
  /** 抽奖结果时间线，新在前 */
  lotteryHistory: LotteryDrawLogEntry[];
};

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function defaultFirstRun(): HeroMetaFile {
  return {
    version: 2,
    heroes: {
      warrior_01: { stars: 1, duplicates: 0 },
    },
    deployed: [null, null, null],
    lotteryTicketsRemaining: 0,
    lotteryHistory: [],
  };
}

function parseHeroesAndDeployed(o: Record<string, unknown>): {
  heroes: Record<string, HeroSaveEntry>;
  deployed: [HeroId | null, HeroId | null, HeroId | null];
} {
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
      deployed[i] = typeof x === 'string' && HERO_IDS.includes(x as HeroId) ? (x as HeroId) : null;
    }
  }
  return { heroes, deployed };
}

function parseLotteryHistory(raw: unknown): LotteryDrawLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LotteryDrawLogEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const heroId = r.heroId;
    const ts = r.ts;
    if (typeof heroId !== 'string' || !HERO_IDS.includes(heroId as HeroId)) continue;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
    out.push({ heroId: heroId as HeroId, ts: Math.floor(ts) });
  }
  return out.slice(0, LOTTERY_LOG_CAP);
}

function parse(raw: string | null): HeroMetaFile {
  if (!raw) return defaultFirstRun();
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return defaultFirstRun();
    const o = j as Record<string, unknown>;
    const ver = o.version;
    const { heroes, deployed } = parseHeroesAndDeployed(o);
    if (Object.keys(heroes).length === 0) return defaultFirstRun();

    let lotteryTicketsRemaining = 0;
    let lotteryHistory: LotteryDrawLogEntry[] = [];
    if (ver === 2) {
      if (typeof o.lotteryTicketsRemaining === 'number') {
        lotteryTicketsRemaining = Math.max(0, Math.min(99999, Math.floor(o.lotteryTicketsRemaining)));
      }
      lotteryHistory = parseLotteryHistory(o.lotteryHistory);
    }

    return {
      version: 2,
      heroes,
      deployed,
      lotteryTicketsRemaining,
      lotteryHistory,
    };
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

/** 战斗关历史最高星每提升 1 星调用一次，增加可抽奖次数 */
export function grantLotteryTickets(n: number): void {
  if (n <= 0) return;
  const cur = loadHeroMeta();
  cur.lotteryTicketsRemaining = Math.min(99999, cur.lotteryTicketsRemaining + Math.floor(n));
  saveHeroMeta(cur);
}

export function getLotteryTicketsRemaining(): number {
  return loadHeroMeta().lotteryTicketsRemaining;
}

export function getRecentLotteryHistory(limit: number): LotteryDrawLogEntry[] {
  const h = loadHeroMeta().lotteryHistory;
  const n = Math.max(0, Math.min(LOTTERY_LOG_CAP, Math.floor(limit)));
  return h.slice(0, n);
}

function tryConsumePromote(entry: HeroSaveEntry): void {
  while (entry.stars < 5) {
    const need = HERO_STAR_COST[entry.stars - 1];
    if (need == null || entry.duplicates < need) break;
    entry.duplicates -= need;
    entry.stars += 1;
  }
}

/** 在已加载的存档上应用「抽到一张同名卡」逻辑（含自动升星） */
function applyAddHeroDuplicateToMeta(meta: HeroMetaFile, id: HeroId): void {
  if (!HERO_IDS.includes(id)) return;
  const prev = meta.heroes[id];
  if (!prev) {
    meta.heroes[id] = { stars: 1, duplicates: 0 };
    return;
  }
  prev.duplicates += 1;
  tryConsumePromote(prev);
}

/**
 * 消耗 1 次抽奖次数，随机获得英雄或同名素材；结果写入存档。
 * @returns wasDuplicate 表示抽到前是否已拥有该英雄（用于文案）
 */
export function performHeroLotteryDraw():
  | { ok: true; id: HeroId; wasDuplicate: boolean }
  | { ok: false; reason: 'no_tickets' } {
  const cur = loadHeroMeta();
  if (cur.lotteryTicketsRemaining < 1) return { ok: false, reason: 'no_tickets' };
  const pick = HERO_REGISTRY[Math.floor(Math.random() * HERO_REGISTRY.length)];
  if (!pick) return { ok: false, reason: 'no_tickets' };
  const id = pick.id;
  const wasDuplicate = !!cur.heroes[id];
  cur.lotteryTicketsRemaining -= 1;
  applyAddHeroDuplicateToMeta(cur, id);
  const nextHist: LotteryDrawLogEntry[] = [{ heroId: id, ts: Date.now() }, ...cur.lotteryHistory];
  while (nextHist.length > LOTTERY_LOG_CAP) nextHist.pop();
  cur.lotteryHistory = nextHist;
  saveHeroMeta(cur);
  return { ok: true, id, wasDuplicate };
}

/** 通关第 1 / 3 / 5 章各解锁 1 个栏位，最多 3 */
export function maxHeroDeploySlots(): number {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  let n = 0;
  if (cleared.has(1)) n += 1;
  if (cleared.has(3)) n += 1;
  if (cleared.has(5)) n += 1;
  return n;
}

/** 随机抽到或首次解锁：增加副本并尝试升星 */
export function addHeroDuplicate(id: HeroId): void {
  if (!HERO_IDS.includes(id)) return;
  const cur = loadHeroMeta();
  applyAddHeroDuplicateToMeta(cur, id);
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
export const HERO_DEPLOY_SLOT_CHAPTER: readonly [1, 3, 5] = [1, 3, 5];

export type TryDeployHeroOutcome =
  | { ok: true; replaced?: { slot: number; oldId: HeroId } }
  | { ok: false; reason: 'no_hero' | 'full' | 'no_slots_unlocked' };

/**
 * 将英雄放入阵上：优先找空栏；若已有同职业英雄则顶替该栏位。
 * @returns 成功时 `ok: true`，若发生顶替则带 `replaced`（用于飘字）
 */
export function tryDeployHero(heroId: HeroId): TryDeployHeroOutcome {
  const cap = maxHeroDeploySlots();
  if (cap === 0) return { ok: false, reason: 'no_slots_unlocked' };
  const cur = loadHeroMeta();
  if (!cur.heroes[heroId]) return { ok: false, reason: 'no_hero' };
  if (cur.deployed.some((x) => x === heroId)) return { ok: true };

  const def = getHeroDef(heroId);
  if (!def) return { ok: false, reason: 'no_hero' };

  for (let i = 0; i < cap; i++) {
    const hid = cur.deployed[i];
    if (!hid) continue;
    const od = getHeroDef(hid);
    if (od && od.allyClass === def.allyClass) {
      setDeployedSlot(i, heroId);
      return { ok: true, replaced: { slot: i, oldId: hid } };
    }
  }

  for (let i = 0; i < cap; i++) {
    if (cur.deployed[i] == null) {
      setDeployedSlot(i, heroId);
      return { ok: true };
    }
  }
  return { ok: false, reason: 'full' };
}

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
