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

/** 穆兰（战士）英雄 id，旋风斩等逻辑与此绑定 */
export const MULAN_HERO_ID = 'warrior_01' as const;

const MULAN_PASSIVE_AND_SKILL_DESC = [
  '【阵型】场上每有 1 个我方战士单位，本英雄最大生命 +8%、攻击 +8%（按该职业我方在场单位数叠加，不含英雄自身）。',
  '',
  '【旋风斩·主动】每次攻击有 15% 概率对自身周围半径 50 内的所有敌方单位额外造成攻击力 40% 的伤害，并飘字「旋风斩」；周身有旋风特效。',
  '· 战士羁绊总层数 ≥6：旋风斩伤害系数提升至 80%。',
  '· 战士羁绊总层数 ≥10：触发概率提升至 25%；且每命中一名敌方单位，回复自身 3% 最大生命。',
  '· 战士羁绊总层数 ≥15：旋风半径提升至 100，旋风与特效变为猩红色；对当前生命不高于 50% 最大生命的敌方，旋风斩伤害翻倍。',
  '以上随备战棋盘战士总层数在战斗内实时变化。',
].join('\n');

/** 英雄详情「主动技能」摘要（无则界面显示暂无） */
export function getHeroActiveSkillSummary(id: HeroId): string | null {
  if (id === MULAN_HERO_ID) {
    return '旋风斩：概率触发周身旋风，对附近敌方造成额外伤害；战士 6/10/15 羁绊可强化威力、触发率、吸血与范围（详见上文）。';
  }
  return null;
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
      const basePassive = `场上每有 1 个我方${d.name}单位，本英雄最大生命 +8%、攻击 +8%（按该职业我方在场单位数叠加，不含英雄自身）。`;
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
        passiveDesc: id === MULAN_HERO_ID ? MULAN_PASSIVE_AND_SKILL_DESC : basePassive,
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
