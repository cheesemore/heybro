import { computeGearGs } from './gearScore';
import type { PlayerGearInstance } from './playerGearInstance';
import { GEAR_EQUIPMENT_SLOTS, type GearSlotKind } from './gearSlots';

const STORAGE_KEY = 'heybro.playerGear.v1';

export type PlayerGearSaveFile = {
  version: 1;
  equipped: Partial<Record<GearSlotKind, PlayerGearInstance | null>>;
};

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function emptyEquipped(): Partial<Record<GearSlotKind, PlayerGearInstance | null>> {
  const out: Partial<Record<GearSlotKind, PlayerGearInstance | null>> = {};
  for (const s of GEAR_EQUIPMENT_SLOTS) out[s.kind] = null;
  return out;
}

function defaultSave(): PlayerGearSaveFile {
  return { version: 1, equipped: emptyEquipped() };
}

function parseInstance(raw: unknown): PlayerGearInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const instanceId = typeof o.instanceId === 'string' ? o.instanceId : '';
  const gearId = typeof o.gearId === 'string' ? o.gearId : '';
  const slotKind = o.slotKind as GearSlotKind;
  const slotNo = typeof o.slotNo === 'number' ? Math.floor(o.slotNo) : NaN;
  const nameCn = typeof o.nameCn === 'string' ? o.nameCn : '';
  const quality = o.quality;
  const level = typeof o.level === 'number' ? Math.floor(o.level) : NaN;
  if (!instanceId || !gearId || !nameCn || !Number.isFinite(slotNo) || !Number.isFinite(level)) {
    return null;
  }
  if (
    quality !== 'common' &&
    quality !== 'uncommon' &&
    quality !== 'rare' &&
    quality !== 'epic' &&
    quality !== 'legendary'
  ) {
    return null;
  }
  const randomFactorPercent =
    typeof o.randomFactorPercent === 'number' ? Math.floor(o.randomFactorPercent) : 100;
  const gs = computeGearGs(level, quality, randomFactorPercent, slotKind);
  return {
    instanceId,
    gearId,
    slotKind,
    slotNo,
    nameCn,
    quality,
    level,
    gs,
    randomFactorPercent,
    attr1: typeof o.attr1 === 'number' ? o.attr1 : 1,
    attr2: typeof o.attr2 === 'number' ? o.attr2 : 2,
  };
}

function parse(raw: string | null): PlayerGearSaveFile {
  if (!raw) return defaultSave();
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return defaultSave();
    const o = j as Record<string, unknown>;
    if (o.version !== 1) return defaultSave();
    const equipped = emptyEquipped();
    const eqRaw = o.equipped;
    if (eqRaw && typeof eqRaw === 'object') {
      for (const s of GEAR_EQUIPMENT_SLOTS) {
        const inst = parseInstance((eqRaw as Record<string, unknown>)[s.kind]);
        equipped[s.kind] = inst;
      }
    }
    return { version: 1, equipped };
  } catch {
    return defaultSave();
  }
}

let cache: PlayerGearSaveFile | null = null;

function load(): PlayerGearSaveFile {
  if (cache) return cache;
  cache = parse(safeLs()?.getItem(STORAGE_KEY) ?? null);
  return cache;
}

export function persistPlayerGear(): void {
  const ls = safeLs();
  if (!ls || !cache) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

export function getEquippedGear(slotKind: GearSlotKind): PlayerGearInstance | null {
  return load().equipped[slotKind] ?? null;
}

export function getAllEquippedGear(): Partial<Record<GearSlotKind, PlayerGearInstance | null>> {
  return { ...load().equipped };
}

export function equipPlayerGear(instance: PlayerGearInstance): void {
  const data = load();
  data.equipped[instance.slotKind] = instance;
  persistPlayerGear();
}

/** 当前已穿戴 14 槽 GS 总和 */
export function sumEquippedGearGs(): number {
  let total = 0;
  for (const s of GEAR_EQUIPMENT_SLOTS) {
    const g = getEquippedGear(s.kind);
    if (g) total += g.gs;
  }
  return total;
}

export function clearPersistedPlayerGear(): void {
  cache = null;
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
