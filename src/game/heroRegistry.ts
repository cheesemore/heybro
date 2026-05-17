import type { AllyClass } from './types';
import { ALLY_DEFS } from './unitDefs';
import { ALLY_CLASSES } from './constants';
import heroBaseStatsJson from './config/heroBaseStats.json';

/** 按备战该职业总层数：技能质变档（6/10/15）对应英雄名后缀 +1 / +2 / +3 */
export function heroSkillTierSuffixFromBondStacks(classStacksOnBoard: number): string {
  if (classStacksOnBoard >= 15) return '+3';
  if (classStacksOnBoard >= 10) return '+2';
  if (classStacksOnBoard >= 6) return '+1';
  return '';
}

export function heroDisplayNameWithSkillTier(baseName: string, classStacksOnBoard: number): string {
  const s = heroSkillTierSuffixFromBondStacks(classStacksOnBoard);
  return s ? `${baseName}${s}` : baseName;
}

export type HeroId = string;

/** 英雄稀有度：与卡面编号 1～5 对应（1=蓝、2=紫、3～5=橙，抽奖分档亦按此三色） */
export type HeroQuality = 1 | 2 | 3 | 4 | 5;

/** 外框与名称强调色：蓝 / 紫 / 橙（3～5 档同色） */
export const HERO_QUALITY_ACCENT: Readonly<Record<HeroQuality, number>> = {
  1: 0x3b82f6,
  2: 0xa855f7,
  3: 0xf97316,
  4: 0xf97316,
  5: 0xf97316,
};

export function heroQualityAccent(q: HeroQuality): number {
  return HERO_QUALITY_ACCENT[q];
}

/** 穆兰（蓝色品质·编号 01 战士）英雄 id，旋风斩等逻辑与此绑定 */
export const MULAN_HERO_ID = 'warrior_01' as const;

/** 艾拉瑞（蓝色品质·编号 01 法师）英雄 id，奥术飞弹等逻辑与此绑定 */
export const MAGE_HERO_ARCANE_ID: HeroId = 'mage_01';

/** 塞拉菲（蓝色品质·编号 01 牧师）英雄 id，群体庇护等逻辑与此绑定 */
export const PRIEST_HERO_SHELTER_ID: HeroId = 'priest_01';

/** 席拉拉（蓝色品质·编号 01 射手）英雄 id，强击光环等逻辑与此绑定 */
export const ARCHER_HERO_STRONG_STRIKE_ID: HeroId = 'archer_01';

/** 格温妮（蓝色品质·编号 01 骑士）英雄 id，神圣制裁等逻辑与此绑定 */
export const KNIGHT_HERO_HOLY_SANCTION_ID: HeroId = 'knight_01';

/** 各职业编号 02（紫色品质）：与同职业 01 蓝卡共用同一套签名技能与强度 */
export const WARRIOR_WHIRL_BLUE_ID: HeroId = 'warrior_02';
export const MAGE_ARCANE_BLUE_ID: HeroId = 'mage_02';
export const PRIEST_SHELTER_BLUE_ID: HeroId = 'priest_02';
export const ARCHER_STRONG_STRIKE_BLUE_ID: HeroId = 'archer_02';
export const KNIGHT_HOLY_SANCTION_BLUE_ID: HeroId = 'knight_02';

export function isWarriorWhirlwindHero(id: HeroId | undefined): boolean {
  return id === MULAN_HERO_ID || id === WARRIOR_WHIRL_BLUE_ID;
}

export function isMageArcaneMissilesHero(id: HeroId | undefined): boolean {
  return id === MAGE_HERO_ARCANE_ID || id === MAGE_ARCANE_BLUE_ID;
}

export function isPriestMassShelterHero(id: HeroId | undefined): boolean {
  return id === PRIEST_HERO_SHELTER_ID || id === PRIEST_SHELTER_BLUE_ID;
}

export function isArcherSnareTrapHero(id: HeroId | undefined): boolean {
  return id === ARCHER_HERO_STRONG_STRIKE_ID || id === ARCHER_STRONG_STRIKE_BLUE_ID;
}

/** @deprecated 诱捕陷阱已替代强击光环 */
export const isArcherStrongStrikeAuraHero = isArcherSnareTrapHero;

export function isKnightHolySanctionHero(id: HeroId | undefined): boolean {
  return id === KNIGHT_HERO_HOLY_SANCTION_ID || id === KNIGHT_HOLY_SANCTION_BLUE_ID;
}

/** 中文奇幻风展示名（与立绘性别对应，与资源 id 一致） */
const HERO_DISPLAY_NAMES: Record<string, string> = {
  warrior_01: '穆兰',
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
  /** 1=蓝、2=紫、3～5=橙；与职业内编号 01～05 一致 */
  quality: HeroQuality;
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

/** 与 gptimage 出图命名一致：warrior_01 … knight_05；编号 n 对应卡面品质（1 蓝 / 2 紫 / 3～5 橙） */
function passiveDescForHeroId(id: HeroId): string {
  const basePassive = '无通用阵型被动。';
  if (id === WARRIOR_WHIRL_BLUE_ID) {
    return '被动：格挡概率+10%（与旋风斩并存；近战受敌普攻时额外 10% 概率触发格挡减半，可与战士羁绊格挡规则叠用）。';
  }
  if (isWarriorWhirlwindHero(id)) return '无';
  if (id === MAGE_ARCANE_BLUE_ID) {
    return '主动：奥术飞弹（详见英雄说明）。被动：暴击率+10%。';
  }
  if (id === MAGE_HERO_ARCANE_ID) return '主动：奥术飞弹（详见英雄说明）';
  if (isPriestMassShelterHero(id)) {
    return id === PRIEST_SHELTER_BLUE_ID
      ? '主动：群体庇护（详见英雄说明）。被动：最大生命+10%。'
      : '主动：群体庇护（详见英雄说明）';
  }
  if (id === ARCHER_STRONG_STRIKE_BLUE_ID) {
    return '主动：诱捕陷阱（详见英雄说明）。被动：射程+50（720 设计坐标系像素）。';
  }
  if (isArcherSnareTrapHero(id)) return '主动：诱捕陷阱（详见英雄说明）';
  if (id === KNIGHT_HOLY_SANCTION_BLUE_ID) {
    return '主动：神圣制裁（详见英雄说明）。被动：攻击力+10%。';
  }
  if (isKnightHolySanctionHero(id)) return '主动：神圣制裁（详见英雄说明）';
  return basePassive;
}

type HeroBaseStatsRow = { maxHp: number; atk: number };

const HERO_BASE_STATS: ReadonlyMap<string, HeroBaseStatsRow> = (() => {
  const raw = heroBaseStatsJson as Record<string, unknown>;
  const m = new Map<string, HeroBaseStatsRow>();
  for (const [id, row] of Object.entries(raw)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const maxHp = o.maxHp;
    const atk = o.atk;
    if (typeof maxHp !== 'number' || typeof atk !== 'number') continue;
    m.set(id, { maxHp: Math.max(1, Math.floor(maxHp)), atk: Math.max(1, Math.floor(atk)) });
  }
  return m;
})();

function buildHeroRegistry(): HeroDef[] {
  const out: HeroDef[] = [];
  for (const c of ALLY_CLASSES) {
    const d = ALLY_DEFS[c];
    for (let n = 1; n <= 5; n++) {
      const id = `${c}_${String(n).padStart(2, '0')}`;
      const stats = HERO_BASE_STATS.get(id);
      if (!stats) {
        throw new Error(`[heroBaseStats.json] 缺少英雄条目: ${id}`);
      }
      const quality = n as HeroQuality;
      out.push({
        id,
        name: HERO_DISPLAY_NAMES[id] ?? id,
        quality,
        allyClass: c,
        hitRadius: d.hitRadius,
        maxHp: stats.maxHp,
        atk: stats.atk,
        attackSpeed: d.attackSpeed,
        range: d.range,
        moveSpeed: d.moveSpeed,
        passiveDesc: passiveDescForHeroId(id),
      });
    }
  }
  return out;
}

export const HERO_REGISTRY: readonly HeroDef[] = buildHeroRegistry();

/** 同档内：品质高→低（5→1），同品质按职业枚举序、再按 id */
function compareHeroByQualityDescClassId(a: HeroDef, b: HeroDef): number {
  if (b.quality !== a.quality) return b.quality - a.quality;
  const ia = ALLY_CLASSES.indexOf(a.allyClass);
  const ib = ALLY_CLASSES.indexOf(b.allyClass);
  if (ia !== ib) return ia - ib;
  return a.id.localeCompare(b.id);
}

/**
 * 强化页英雄列表：已获得在前（其中品质高→低），未获得在后（仍按品质/职业/id 便于浏览）。
 * `heroesOwned` 为存档中的 `heroes` 表（有键即视为已获得）。
 */
export function sortHeroDefsForStrengthenScroll(
  defs: readonly HeroDef[],
  heroesOwned: Readonly<Record<string, unknown>>,
): HeroDef[] {
  return [...defs].sort((a, b) => {
    const ua = !!heroesOwned[a.id];
    const ub = !!heroesOwned[b.id];
    if (ua !== ub) return ua ? -1 : 1;
    return compareHeroByQualityDescClassId(a, b);
  });
}

export const HERO_IDS: readonly HeroId[] = HERO_REGISTRY.map((h) => h.id);

const byId: ReadonlyMap<HeroId, HeroDef> = new Map(HERO_REGISTRY.map((h) => [h.id, h]));

export function getHeroDef(id: HeroId): HeroDef | undefined {
  return byId.get(id);
}

/** 相对卡面基础 maxHp/atk：与 `heroBaseStats.json` 相乘用于战斗与详情展示 */
const HERO_STAR_STAT_MULT: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 1.0,
  2: 1.15,
  3: 1.4,
  4: 1.75,
  5: 2.25,
};

export function heroStarStatMult(stars: number): number {
  const s = Math.max(1, Math.min(5, Math.floor(stars))) as 1 | 2 | 3 | 4 | 5;
  return HERO_STAR_STAT_MULT[s];
}

/** 升下一星所需同名「额外副本」数（1→2…4→5 依次为 2、3、5、8） */
export const HERO_STAR_COST: readonly number[] = [2, 3, 5, 8];
