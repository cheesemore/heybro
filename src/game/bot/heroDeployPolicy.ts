import type { AllyClass } from '../types';
import type { HeroDef, HeroId } from '../heroRegistry';
import { getHeroDef } from '../heroRegistry';
import {
  clearDeployedSlot,
  getDeployedHeroIds,
  loadHeroMeta,
  maxHeroDeploySlots,
  tryDeployHero,
} from '../heroMetaStorage';

/** Bot 上阵：仅战 / 法 / 牧，同职业取已拥有最高品质 */
export const BOT_DEPLOY_CLASSES: readonly AllyClass[] = ['warrior', 'mage', 'priest'];

function isBotDeployClass(cls: AllyClass): boolean {
  return (BOT_DEPLOY_CLASSES as readonly AllyClass[]).includes(cls);
}

function compareHeroQualityDesc(a: HeroDef, b: HeroDef): number {
  if (b.quality !== a.quality) return b.quality - a.quality;
  return a.id.localeCompare(b.id);
}

function bestOwnedHeroForClass(owned: readonly HeroId[], cls: AllyClass): HeroId | null {
  let best: HeroDef | null = null;
  for (const id of owned) {
    const def = getHeroDef(id);
    if (!def || def.allyClass !== cls) continue;
    if (!best || compareHeroQualityDesc(def, best) < 0) best = def;
  }
  return best?.id ?? null;
}

function idealDeployIds(cap: number): (HeroId | null)[] {
  const owned = Object.keys(loadHeroMeta().heroes) as HeroId[];
  const out: (HeroId | null)[] = [];
  for (const cls of BOT_DEPLOY_CLASSES) {
    if (out.length >= cap) break;
    const id = bestOwnedHeroForClass(owned, cls);
    if (id) out.push(id);
  }
  while (out.length < cap) out.push(null);
  return out.slice(0, cap);
}

function deploySnapshot(cap: number): string {
  return getDeployedHeroIds()
    .slice(0, cap)
    .map((id) => id ?? '-')
    .join('|');
}

/** 当前上阵是否与「战法牧最高品质」目标一致 */
export function botHeroDeployNeedsSync(): boolean {
  const cap = maxHeroDeploySlots();
  if (cap === 0) return false;
  const owned = Object.keys(loadHeroMeta().heroes);
  if (owned.length === 0) return false;

  const dep = getDeployedHeroIds();
  for (let i = 0; i < cap; i++) {
    const hid = dep[i];
    if (!hid) continue;
    const def = getHeroDef(hid);
    if (def && !isBotDeployClass(def.allyClass)) return true;
  }

  const ideal = idealDeployIds(cap).filter((x): x is HeroId => x != null);
  const onField = dep.slice(0, cap).filter((x): x is HeroId => x != null);
  if (ideal.length === 0) return false;

  for (const want of ideal) {
    if (!onField.includes(want)) return true;
    const wantDef = getHeroDef(want)!;
    const cur = onField.find((id) => getHeroDef(id)?.allyClass === wantDef.allyClass);
    if (!cur) return true;
    const curDef = getHeroDef(cur)!;
    if (compareHeroQualityDesc(wantDef, curDef) < 0) return true;
  }
  return false;
}

/** 卸下非战法牧并上阵各职业最高品质英雄；有变更返回 true */
export function botAutoDeployPreferredHeroes(): boolean {
  const cap = maxHeroDeploySlots();
  if (cap === 0) return false;

  const before = deploySnapshot(cap);
  const dep = getDeployedHeroIds();
  for (let i = 0; i < 3; i++) {
    const hid = dep[i];
    if (!hid) continue;
    const def = getHeroDef(hid);
    if (def && !isBotDeployClass(def.allyClass)) clearDeployedSlot(i);
  }

  const owned = Object.keys(loadHeroMeta().heroes) as HeroId[];
  for (const cls of BOT_DEPLOY_CLASSES) {
    const id = bestOwnedHeroForClass(owned, cls);
    if (id) tryDeployHero(id);
  }

  return deploySnapshot(cap) !== before;
}
