import { ALLY_CLASSES } from './constants';
import { addClassFragments } from './classProgressStorage';
import { getTotalStarFilledCount, loadChapterProgress } from './chapterProgressStorage';
import type { HeroId } from './heroRegistry';
import { HERO_REGISTRY, getHeroDef, HERO_IDS, HERO_STAR_COST, type HeroQuality } from './heroRegistry';
import type { AllyClass } from './types';

const STORAGE_KEY = 'heybro.heroMeta.v1';

const LOTTERY_LOG_CAP = 200;

/** 每获得 1 颗章节评价星（`getTotalStarFilledCount` 累计），可获得的招募券张数 */
export const RECRUIT_TICKETS_PER_STAR = 5;

export type HeroSaveEntry = {
  /** 1～5 */
  stars: number;
  /** 已攒下的同名额外副本数（用于自动升星消耗） */
  duplicates: number;
};

export type LotteryDrawLogEntry =
  | { kind: 'hero'; heroId: HeroId; ts: number }
  | { kind: 'fragment'; allyClass: AllyClass; ts: number };

/** 招募单抽结果 */
export type LotterySingleOutcome =
  | { kind: 'hero'; id: HeroId; wasDuplicate: boolean }
  | { kind: 'fragment'; allyClass: AllyClass };

/** 十连中单次结果 */
export type LotteryTenResultItem =
  | { kind: 'hero'; id: HeroId; wasDuplicate: boolean }
  | { kind: 'fragment'; allyClass: AllyClass };

/** 单次招募：95% 职业碎片（五职业均等），5% 英雄（蓝/紫/橙三色规则，见 pickHeroIdForLotteryFromMeta） */
const FRAGMENT_CHANCE = 0.95;

function pickRandomFragmentClass(): AllyClass {
  return ALLY_CLASSES[Math.floor(Math.random() * ALLY_CLASSES.length)]!;
}

export type HeroMetaFile = {
  version: 2;
  /** 已获得英雄 */
  heroes: Record<string, HeroSaveEntry>;
  /** 最多 3 个上阵位，值为英雄 id 或 null */
  deployed: [HeroId | null, HeroId | null, HeroId | null];
  /** 剩余招募券（= 各章评价星总和 ×「每星招募券」− 已抽次数；见 syncLotteryTicketsFromChapterProgress） */
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
    const ts = r.ts;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
    const fts = Math.floor(ts);
    const kind = r.kind;
    if (kind === 'fragment') {
      const allyClass = r.allyClass;
      if (typeof allyClass === 'string' && ALLY_CLASSES.includes(allyClass as AllyClass)) {
        out.push({ kind: 'fragment', allyClass: allyClass as AllyClass, ts: fts });
      }
      continue;
    }
    const heroId = r.heroId;
    if (typeof heroId === 'string' && HERO_IDS.includes(heroId as HeroId)) {
      out.push({ kind: 'hero', heroId: heroId as HeroId, ts: fts });
      continue;
    }
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

    let lotteryHistory: LotteryDrawLogEntry[] = [];
    if (Number(ver) === 2) {
      lotteryHistory = parseLotteryHistory(o.lotteryHistory);
    }

    const starsEarned = getTotalStarFilledCount();
    const ticketBudget = starsEarned * RECRUIT_TICKETS_PER_STAR;
    const lotteryTicketsRemaining = Math.max(0, Math.min(99999, ticketBudget - lotteryHistory.length));

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

/** 删除本地持久化的英雄/招募存档；下次 `loadHeroMeta` 将回到默认新机数据。 */
export function clearPersistedHeroMeta(): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 按章节存档里「各章评价星」与本地招募历史条数，重算剩余招募券。
 * 规则：剩余 = **各章评价星之和** × `RECRUIT_TICKETS_PER_STAR` − 已抽次数（`lotteryHistory` 每条计 1 次，含十连的 10 条）。
 */
export function syncLotteryTicketsFromChapterProgress(): void {
  const cur = loadHeroMeta();
  const starsEarned = getTotalStarFilledCount();
  const ticketBudget = starsEarned * RECRUIT_TICKETS_PER_STAR;
  const spent = cur.lotteryHistory.length;
  cur.lotteryTicketsRemaining = Math.max(0, Math.min(99999, ticketBudget - spent));
  saveHeroMeta(cur);
}

/** @deprecated 招募券改由 syncLotteryTicketsFromChapterProgress 按累计星×「每星券数」统一重算；保留供旧脚本或一次性补偿调用 */
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

function allHeroesOfQualityOwned(meta: HeroMetaFile, q: HeroQuality): boolean {
  const list = HERO_REGISTRY.filter((h) => h.quality === q);
  if (!list.length) return true;
  return list.every((h) => !!meta.heroes[h.id]);
}

function allBlueTierHeroesOwned(meta: HeroMetaFile): boolean {
  return allHeroesOfQualityOwned(meta, 1);
}

function allPurpleTierHeroesOwned(meta: HeroMetaFile): boolean {
  return allHeroesOfQualityOwned(meta, 2);
}

type LotteryColorBand = 'blue' | 'purple' | 'orange';

/**
 * 英雄招募三色：未集齐蓝色（品质1）前仅出蓝；集齐蓝后至集齐紫（品质2）前仅蓝/紫，概率 60%:30%；
 * 紫齐后蓝:紫:橙 = 60%:30%:10%，橙为品质 3～5 合并池。
 */
function pickLotteryColorBand(meta: HeroMetaFile): LotteryColorBand {
  if (!allBlueTierHeroesOwned(meta)) return 'blue';
  if (!allPurpleTierHeroesOwned(meta)) {
    const r = Math.random() * 0.9;
    return r < 0.6 ? 'blue' : 'purple';
  }
  const r = Math.random();
  if (r < 0.6) return 'blue';
  if (r < 0.9) return 'purple';
  return 'orange';
}

function pickHeroIdForLotteryFromMeta(meta: HeroMetaFile): HeroId {
  const band = pickLotteryColorBand(meta);
  let pool: typeof HERO_REGISTRY;
  if (band === 'blue') pool = HERO_REGISTRY.filter((h) => h.quality === 1);
  else if (band === 'purple') pool = HERO_REGISTRY.filter((h) => h.quality === 2);
  else pool = HERO_REGISTRY.filter((h) => h.quality >= 3);
  if (!pool.length) {
    pool = HERO_REGISTRY.filter((h) => h.quality === 1);
  }
  if (!pool.length) return HERO_REGISTRY[0]!.id;
  return pool[Math.floor(Math.random() * pool.length)]!.id;
}

/**
 * 消耗 1 张招募券：95% 职业碎片（五职业均等），5% 英雄（蓝/紫/橙规则见 pickHeroIdForLotteryFromMeta）。
 */
export function performHeroLotteryDraw():
  | { ok: true } & LotterySingleOutcome
  | { ok: false; reason: 'no_tickets' } {
  const cur = loadHeroMeta();
  if (cur.lotteryTicketsRemaining < 1) return { ok: false, reason: 'no_tickets' };
  cur.lotteryTicketsRemaining -= 1;

  let hist: LotteryDrawLogEntry;
  let outcome: LotterySingleOutcome;

  if (Math.random() < FRAGMENT_CHANCE) {
    const allyClass = pickRandomFragmentClass();
    addClassFragments(allyClass, 1);
    hist = { kind: 'fragment', allyClass, ts: Date.now() };
    outcome = { kind: 'fragment', allyClass };
  } else {
    const id = pickHeroIdForLotteryFromMeta(cur);
    const wasDuplicate = !!cur.heroes[id];
    applyAddHeroDuplicateToMeta(cur, id);
    hist = { kind: 'hero', heroId: id, ts: Date.now() };
    outcome = { kind: 'hero', id, wasDuplicate };
  }

  const nextHist: LotteryDrawLogEntry[] = [hist, ...cur.lotteryHistory];
  while (nextHist.length > LOTTERY_LOG_CAP) nextHist.pop();
  cur.lotteryHistory = nextHist;
  saveHeroMeta(cur);
  return { ok: true, ...outcome };
}

/**
 * 十连：消耗 10 次；前 9 次各为 95% 碎片 / 5% 英雄（英雄三色规则同单抽）；若前 9 次全无英雄，则第 10 次必为英雄。
 * 写入一条存档、历史 10 条（新在前顺序与单抽一致）。
 */
export function performHeroLotteryTenDraw():
  | { ok: true; results: LotteryTenResultItem[] }
  | { ok: false; reason: 'no_tickets' } {
  const cur = loadHeroMeta();
  if (cur.lotteryTicketsRemaining < 10) return { ok: false, reason: 'no_tickets' };
  cur.lotteryTicketsRemaining -= 10;

  const results: LotteryTenResultItem[] = [];
  const hists: LotteryDrawLogEntry[] = [];
  const tsBase = Date.now();

  for (let i = 0; i < 10; i++) {
    const mustHero = i === 9 && !results.some((r) => r.kind === 'hero');
    const rollFragment = !mustHero && Math.random() < FRAGMENT_CHANCE;

    if (rollFragment) {
      const allyClass = pickRandomFragmentClass();
      addClassFragments(allyClass, 1);
      hists.push({ kind: 'fragment', allyClass, ts: tsBase + i });
      results.push({ kind: 'fragment', allyClass });
    } else {
      const id = pickHeroIdForLotteryFromMeta(cur);
      const wasDuplicate = !!cur.heroes[id];
      applyAddHeroDuplicateToMeta(cur, id);
      hists.push({ kind: 'hero', heroId: id, ts: tsBase + i });
      results.push({ kind: 'hero', id, wasDuplicate });
    }
  }

  const newestFirst = [...hists].reverse();
  const nextHist: LotteryDrawLogEntry[] = [...newestFirst, ...cur.lotteryHistory];
  while (nextHist.length > LOTTERY_LOG_CAP) nextHist.pop();
  cur.lotteryHistory = nextHist;
  saveHeroMeta(cur);
  return { ok: true, results };
}

/** 各栏位解锁条件：`null` 表示默认可用；否则需通关对应书本章节 */
export function maxHeroDeploySlots(): number {
  const cleared = new Set(loadChapterProgress().clearedChapterIds);
  let n = 0;
  for (const ch of HERO_DEPLOY_SLOT_CHAPTER) {
    if (ch == null) {
      n += 1;
      continue;
    }
    if (cleared.has(ch)) n += 1;
  }
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

/**
 * 第 1 / 2 / 3 个栏位解锁条件（书本章节 id）：
 * - 第 1 栏：默认可用
 * - 第 2 栏：通关死亡矿井第二关（chapterIndex 6）
 * - 第 3 栏：通关死亡矿井第六关（chapterIndex 10）
 */
export const HERO_DEPLOY_SLOT_CHAPTER: readonly [number | null, number, number] = [null, 6, 10];

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
