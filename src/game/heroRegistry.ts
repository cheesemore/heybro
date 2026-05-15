import type { AllyClass } from './types';
import { ALLY_DEFS } from './unitDefs';
import { ALLY_CLASSES } from './constants';

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

/** 英雄稀有度：与卡面编号 1～5 对应（绿/蓝/紫/橙/红） */
export type HeroQuality = 1 | 2 | 3 | 4 | 5;

/** 外框与名称强调色（与品质一致） */
export const HERO_QUALITY_ACCENT: Readonly<Record<HeroQuality, number>> = {
  1: 0x22c55e,
  2: 0x3b82f6,
  3: 0xa855f7,
  4: 0xf97316,
  5: 0xef4444,
};

export function heroQualityAccent(q: HeroQuality): number {
  return HERO_QUALITY_ACCENT[q];
}

/** 穆兰（战士）英雄 id，旋风斩等逻辑与此绑定 */
export const MULAN_HERO_ID = 'warrior_01' as const;

/** 艾拉瑞（绿色法师）英雄 id，奥术飞弹等逻辑与此绑定 */
export const MAGE_HERO_ARCANE_ID: HeroId = 'mage_01';

/** 塞拉菲（绿色牧师）英雄 id，群体庇护等逻辑与此绑定 */
export const PRIEST_HERO_SHELTER_ID: HeroId = 'priest_01';

/** 席拉拉（绿色射手）英雄 id，被动强击光环等逻辑与此绑定 */
export const ARCHER_HERO_STRONG_STRIKE_ID: HeroId = 'archer_01';

/** 格温妮（绿色骑士）英雄 id，神圣制裁等逻辑与此绑定 */
export const KNIGHT_HERO_HOLY_SANCTION_ID: HeroId = 'knight_01';

/** 各职业蓝色英雄（编号 02）：与对应绿色英雄共用同一套签名技能与强度 */
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

export function isArcherStrongStrikeAuraHero(id: HeroId | undefined): boolean {
  return id === ARCHER_HERO_STRONG_STRIKE_ID || id === ARCHER_STRONG_STRIKE_BLUE_ID;
}

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
  /** 1=绿 … 5=红，与职业内编号 01～05 一致 */
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

/** 与 gptimage 出图命名一致：warrior_01 … knight_05 */
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
    return '被动：强击光环（详见英雄说明）。被动：射程+50（720 设计坐标系像素）。';
  }
  if (isArcherStrongStrikeAuraHero(id)) return '被动：强击光环（详见英雄说明）';
  if (id === KNIGHT_HOLY_SANCTION_BLUE_ID) {
    return '主动：神圣制裁（详见英雄说明）。被动：攻击力+10%。';
  }
  if (isKnightHolySanctionHero(id)) return '主动：神圣制裁（详见英雄说明）';
  return basePassive;
}

function buildHeroRegistry(): HeroDef[] {
  const out: HeroDef[] = [];
  for (const c of ALLY_CLASSES) {
    const d = ALLY_DEFS[c];
    for (let n = 1; n <= 5; n++) {
      const t = 1 + (n - 3) * 0.018;
      const maxHp = Math.max(1, Math.round(d.maxHp * 2 * t));
      const atk = Math.max(1, Math.round(d.atk * 1.3 * t));
      const id = `${c}_${String(n).padStart(2, '0')}`;
      const quality = n as HeroQuality;
      out.push({
        id,
        name: HERO_DISPLAY_NAMES[id] ?? id,
        quality,
        allyClass: c,
        hitRadius: d.hitRadius,
        maxHp,
        atk,
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

/** 升下一星所需同名「额外副本」数（1→2…4→5 依次为 2、3、5、8） */
export const HERO_STAR_COST: readonly number[] = [2, 3, 5, 8];
