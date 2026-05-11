import type { AllyClass } from './types';
import { ALLY_DEFS } from './unitDefs';
import { ALLY_CLASSES } from './constants';

export type HeroId = string;

/** 中文奇幻风展示名（与立绘性别对应，与资源 id 一致） */
const HERO_DISPLAY_NAMES: Record<string, string> = {
  warrior_01: '穆岚',
  warrior_02: '瑟伦',
  warrior_03: '布琳娜',
  warrior_04: '凯岚',
  warrior_05: '卓娅',
  mage_01: '艾拉瑞',
  mage_02: '西里昂',
  mage_03: '维斯佩菈',
  mage_04: '莫溟',
  mage_05: '托琳',
  priest_01: '塞拉菲',
  priest_02: '莉奥拉',
  priest_03: '席德立',
  priest_04: '梅莉桑德',
  priest_05: '奥尔德温',
  archer_01: '席拉拉',
  archer_02: '奇兰',
  archer_03: '罗恩',
  archer_04: '杰西卡',
  archer_05: '塔利昂',
  knight_01: '格温妮',
  knight_02: '帕西瓦尔',
  knight_03: '奥莉安娜',
  knight_04: '卢坎',
  knight_05: '卡西昂',
};

export type HeroDef = {
  id: HeroId;
  name: string;
  allyClass: AllyClass;
  hitRadius: number;
  maxHp: number;
  atk: number;
  attackSpeed: number;
  range: number;
  moveSpeed: number;
  /** 被动说明（战斗内数值按场上单位数实时结算） */
  passiveDesc: string;
};

/** 与 gptimage 出图命名一致：warrior_01 … knight_05 */
function buildHeroRegistry(): HeroDef[] {
  const out: HeroDef[] = [];
  for (const c of ALLY_CLASSES) {
    const d = ALLY_DEFS[c];
    for (let n = 1; n <= 5; n++) {
      const t = 1 + (n - 3) * 0.018;
      const maxHp = Math.max(1, Math.round(d.maxHp * 2 * t));
      const atk = Math.max(1, Math.round(d.atk * 1.3 * t));
      const id = `${c}_${String(n).padStart(2, '0')}`;
      out.push({
        id,
        name: HERO_DISPLAY_NAMES[id] ?? id,
        allyClass: c,
        hitRadius: d.hitRadius,
        maxHp,
        atk,
        attackSpeed: d.attackSpeed,
        range: d.range,
        moveSpeed: d.moveSpeed,
        passiveDesc: `场上每有 1 个我方${d.name}单位，本英雄最大生命 +8%、攻击 +8%（按该职业我方在场单位数叠加，不含英雄自身）。`,
      });
    }
  }
  return out;
}

export const HERO_REGISTRY: readonly HeroDef[] = buildHeroRegistry();

export const HERO_IDS: readonly HeroId[] = HERO_REGISTRY.map((h) => h.id);

const byId: ReadonlyMap<HeroId, HeroDef> = new Map(HERO_REGISTRY.map((h) => [h.id, h]));

export function getHeroDef(id: HeroId): HeroDef | undefined {
  return byId.get(id);
}

/** 1★=1.0 … 5★=2.0 线性 */
export function heroStarStatMult(stars: number): number {
  const s = Math.max(1, Math.min(5, Math.floor(stars)));
  return 1 + ((s - 1) / 4) * 1;
}

/** 升下一星所需同名「额外副本」数（当前星为 1 时升到 2 需 3 个，以此类推） */
export const HERO_STAR_COST: readonly number[] = [3, 10, 20, 40];
