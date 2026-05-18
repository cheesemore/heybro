import { ALLY_CLASSES } from './constants';
import type { AllyClass } from './types';
import classUpgradeFragmentsJson from './config/classUpgradeFragments.json';
import { ALLY_DEFS } from './unitDefs';

const CLASS_FRAGMENTS_PER_UPGRADE: number =
  typeof (classUpgradeFragmentsJson as { fragmentsPerUpgrade?: unknown }).fragmentsPerUpgrade ===
  'number'
    ? Math.max(
        1,
        Math.floor((classUpgradeFragmentsJson as { fragmentsPerUpgrade: number }).fragmentsPerUpgrade),
      )
    : 5;

const STORAGE_KEY = 'heybro.classProgress.v1';

/** 章节界面与养成页展示顺序 */
export const CLASS_PROGRESS_DISPLAY_ORDER: readonly AllyClass[] = [
  'warrior',
  'mage',
  'priest',
  'knight',
  'archer',
  'warlock',
  'shaman',
  'assassin',
  'druid',
] as const;

export type ClassProgressFile = {
  version: 1;
  /** 各职业当前等级，1～999；缺省视为 1 */
  levels: Partial<Record<AllyClass, number>>;
  /** 各职业当前持有碎片 */
  fragments: Partial<Record<AllyClass, number>>;
};

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function defaultLevels(): Record<AllyClass, number> {
  const o = {} as Record<AllyClass, number>;
  for (const c of ALLY_CLASSES) o[c] = 1;
  return o;
}

function defaultFragments(): Record<AllyClass, number> {
  const o = {} as Record<AllyClass, number>;
  for (const c of ALLY_CLASSES) o[c] = 0;
  return o;
}

function parse(raw: string | null): ClassProgressFile {
  if (!raw) {
    return { version: 1, levels: defaultLevels(), fragments: defaultFragments() };
  }
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') {
      return { version: 1, levels: defaultLevels(), fragments: defaultFragments() };
    }
    const o = j as Record<string, unknown>;
    if (o.version !== 1) {
      return { version: 1, levels: defaultLevels(), fragments: defaultFragments() };
    }
    const levels: Record<AllyClass, number> = defaultLevels();
    const lr = o.levels;
    if (lr && typeof lr === 'object') {
      for (const c of ALLY_CLASSES) {
        const v = (lr as Record<string, unknown>)[c];
        if (typeof v === 'number' && Number.isFinite(v)) {
          levels[c] = Math.max(1, Math.min(999, Math.floor(v)));
        }
      }
    }
    const fragments: Record<AllyClass, number> = defaultFragments();
    const fr = o.fragments;
    if (fr && typeof fr === 'object') {
      for (const c of ALLY_CLASSES) {
        const v = (fr as Record<string, unknown>)[c];
        if (typeof v === 'number' && Number.isFinite(v)) {
          fragments[c] = Math.max(0, Math.min(1e15, Math.floor(v)));
        }
      }
    }
    return { version: 1, levels, fragments };
  } catch {
    return { version: 1, levels: defaultLevels(), fragments: defaultFragments() };
  }
}

export function loadClassProgress(): ClassProgressFile {
  const ls = safeLs();
  if (!ls) return { version: 1, levels: defaultLevels(), fragments: defaultFragments() };
  return parse(ls.getItem(STORAGE_KEY));
}

export function saveClassProgress(data: ClassProgressFile): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** 删除本地职业养成存档；下次 `loadClassProgress` 将回到默认等级与碎片。 */
export function clearPersistedClassProgress(): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getClassLevel(cls: AllyClass): number {
  const v = loadClassProgress().levels[cls];
  return typeof v === 'number' ? Math.max(1, Math.min(999, v)) : 1;
}

export function getClassFragments(cls: AllyClass): number {
  const v = loadClassProgress().fragments[cls];
  return typeof v === 'number' ? Math.max(0, v) : 0;
}

/** 从当前等级升到下一级所需碎片数（固定值，见 `classUpgradeFragments.json`）。 */
export function fragmentsRequiredForNextLevel(currentLevel: number): number | null {
  if (currentLevel < 1 || currentLevel >= 999) return null;
  return CLASS_FRAGMENTS_PER_UPGRADE;
}

/**
 * 线性养成乘区：Lv 为 **1 + (Lv−1)×3%**（相对 1 级初始属性）。
 * 局内最终数值为 `round(初始 × 本乘区)`，升级前后取整差分即「每级实际 +量」，可能略不同于理论 3% 单级增量。
 */
export function classLevelStatMult(level: number): number {
  const lv = Math.max(1, Math.min(999, Math.floor(level)));
  return 1 + (lv - 1) * 0.03;
}

export function addClassFragments(cls: AllyClass, n: number): void {
  if (n <= 0 || !ALLY_CLASSES.includes(cls)) return;
  const cur = loadClassProgress();
  const prev = cur.fragments[cls] ?? 0;
  cur.fragments[cls] = Math.min(1e15, prev + Math.floor(n));
  saveClassProgress(cur);
}

/** 若有足够碎片且未满级，升一级并扣碎片；否则 false */
export function tryUpgradeClassLevel(cls: AllyClass): boolean {
  const cur = loadClassProgress();
  const lv = Math.max(1, Math.min(999, Math.floor(cur.levels[cls] ?? 1)));
  const need = fragmentsRequiredForNextLevel(lv);
  if (need == null) return false;
  const frag = cur.fragments[cls] ?? 0;
  if (frag < need) return false;
  cur.fragments[cls] = frag - need;
  cur.levels[cls] = lv + 1;
  saveClassProgress(cur);
  return true;
}

/**
 * 展示用：当前等级取整后的生命/攻击，以及升到下一级后的取整差分（预览括号内 +量）。
 */
export function classDisplayBaseStats(cls: AllyClass): {
  level: number;
  maxHp: number;
  atk: number;
  deltaHp: number;
  deltaAtk: number;
  atCap: boolean;
} {
  const level = getClassLevel(cls);
  const def = ALLY_DEFS[cls];
  const curM = classLevelStatMult(level);
  const maxHp = Math.max(1, Math.round(def.maxHp * curM));
  const atk = Math.max(1, Math.round(def.atk * curM));
  if (level >= 999) {
    return { level, maxHp, atk, deltaHp: 0, deltaAtk: 0, atCap: true };
  }
  const nextM = classLevelStatMult(level + 1);
  const nextHp = Math.max(1, Math.round(def.maxHp * nextM));
  const nextAtk = Math.max(1, Math.round(def.atk * nextM));
  return {
    level,
    maxHp,
    atk,
    deltaHp: nextHp - maxHp,
    deltaAtk: nextAtk - atk,
    atCap: false,
  };
}
