import type { HeroId } from './heroRegistry';
import {
  isArcherStrongStrikeAuraHero,
  isKnightHolySanctionHero,
  isMageArcaneMissilesHero,
  isPriestMassShelterHero,
  isWarriorWhirlwindHero,
  getHeroDef,
  heroDisplayNameWithSkillTier,
  heroStarStatMult,
} from './heroRegistry';
import { loadHeroMeta } from './heroMetaStorage';
import { ALLY_DEFS } from './unitDefs';
import { GOLDEN_PANEL_BODY } from './ui/goldenSolidPanel';

/** 战士羁绊档位行：按备战层数着色或一律视为已激活色 */
export type HeroIntroBondLineTintMode = 'respectStacks' | 'allActive';

export type HeroIntroBodySegment = {
  text: string;
  fill: number;
  /** 该段下方的额外留白（px） */
  marginBottom?: number;
};

const MULAN_BOND_LINE_GRAY = 0x94a3b8;
const MULAN_BOND6_ACTIVE = 0x38bdf8;
const MULAN_BOND10_ACTIVE = 0xfbbf24;
const MULAN_BOND15_ACTIVE = 0xf87171;

const ARCANE_SKILL_BASE = [
  '主动：奥术飞弹',
  '',
  '冷却 12 秒，从一次引导结束后开始计时。',
  '引导约 3 秒：锁定目标连续发射魔法飞弹；基础每发为攻击力×150% 的魔法伤害。引导时不普攻。',
].join('\n');

const ARCANE_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：每发伤害系数提升至 225%。' },
  { tier: 10, text: '羁绊10：飞弹发射间隔缩短为 0.3 秒。' },
  {
    tier: 15,
    text: '羁绊15：对首领单位，该技能额外 +50% 暴击率，且暴击伤害再×1.5（与全局暴击叠加）。',
  },
];

function buildMageArcaneSegments(classStacksOnBoard: number, bondLineTint: HeroIntroBondLineTintMode): HeroIntroBodySegment[] {
  const gap = 6;
  return [
    { text: ARCANE_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...ARCANE_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: '被动与特性：见上（法师层数影响技能强度）。', fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

const SHELTER_SKILL_BASE = [
  '主动：群体庇护',
  '',
  '冷却 24 秒：为若干名友方施加护盾，护盾值 = 本英雄攻击力×100%（护盾上限同最大生命）。',
  '优先当前生命最少且无护盾的单位；若均有护盾，则仍优先当前生命最少者。',
  '目标数不超过场上存活牧师人数（含自己）；牧师羁绊达 15 层时为全体友方。',
].join('\n');

const SHELTER_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：冷却缩短为 18 秒。' },
  { tier: 10, text: '羁绊10：生命低于 50% 的单位在获得护盾时，额外受到一次等同于牧师普攻的治疗。' },
  { tier: 15, text: '羁绊15：不再受牧师人数限制，始终为全体存活友方施加护盾。' },
];

function buildPriestShelterSegments(classStacksOnBoard: number, bondLineTint: HeroIntroBondLineTintMode): HeroIntroBodySegment[] {
  const gap = 6;
  return [
    { text: SHELTER_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...SHELTER_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: '被动与特性：见上（牧师层数影响技能与护盾）。', fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

const STRONG_STRIKE_PASSIVE_BASE = [
  '被动：强击光环',
  '',
  '当场上有本英雄（存活）时：全场所有法师与射手友方（含对应英雄；不含骑士等）+6% 暴击率。',
  '英雄脚底显示光环特效。',
].join('\n');

const STRONG_STRIKE_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：上述暴击率加成提升至 12%。' },
  { tier: 10, text: '羁绊10：全场法师与射手友方额外 +24% 暴击伤害（暴击时在原有倍率上再乘 (1+24%)）。' },
  { tier: 15, text: '羁绊15：射手的「专注」叠层在切换攻击目标时不再清零。' },
];

function buildArcherStrongStrikeSegments(classStacksOnBoard: number, bondLineTint: HeroIntroBondLineTintMode): HeroIntroBodySegment[] {
  const gap = 6;
  return [
    { text: STRONG_STRIKE_PASSIVE_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...STRONG_STRIKE_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: '被动与特性：见上（射手层数影响强击光环与专注规则）。', fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

const HOLY_SANCTION_SKILL_BASE = [
  '主动：神圣制裁',
  '',
  '冷却 18 秒：对单体敌方造成攻击力×200% 的伤害，并眩晕 10 秒（首领 1 秒）。',
  '眩晕可打断首领蓄力与引导（如扇形蓄力、直线蓄力、冲锋引导）；骑士处于冲锋或免死冲锋时不会施放本技能。',
  '伤害为顺发；表现为制裁白光落下，目标碰撞越大白光范围越大。',
].join('\n');

const HOLY_SANCTION_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：伤害系数提升至 400%（攻击力×400%）。' },
  { tier: 10, text: '羁绊10：施放神圣制裁时自身回复 10% 最大生命。' },
  {
    tier: 15,
    text: '羁绊15：首领每次进入蓄力或引导阶段时，若神圣制裁仍在冷却，则立刻减少 5 秒剩余冷却。',
  },
];

function buildKnightHolySanctionSegments(classStacksOnBoard: number, bondLineTint: HeroIntroBondLineTintMode): HeroIntroBodySegment[] {
  const gap = 6;
  return [
    { text: HOLY_SANCTION_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...HOLY_SANCTION_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: '被动与特性：见上（骑士层数影响神圣制裁与冷却规则）。', fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

const MULAN_SKILL_BASE = [
  '主动技能：旋风斩',
  '',
  '每次攻击有 15% 概率对自身周围半径 50 内的所有敌方单位额外造成攻击力 40% 的伤害，并飘字「旋风斩」；周身有旋风特效。',
  '',
  '以下随备战棋盘战士总层数在战斗内实时变化：',
].join('\n');

const MULAN_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：旋风斩伤害系数由 40% 提升至 80%。' },
  {
    tier: 10,
    text: '羁绊10：触发概率提升至 25%；旋风斩每命中一名敌方单位，为穆兰回复 3% 最大生命。',
  },
  {
    tier: 15,
    text: '羁绊15：旋风与刀刃特效变为猩红色；对当前生命不高于 50% 最大生命的敌方，旋风斩伤害翻倍（半径恒为 50）。',
  },
];

function bondLineFill(
  stacks: number,
  tier: 6 | 10 | 15,
  mode: HeroIntroBondLineTintMode,
): number {
  const active = mode === 'allActive' || stacks >= tier;
  if (!active) return MULAN_BOND_LINE_GRAY;
  if (tier === 6) return MULAN_BOND6_ACTIVE;
  if (tier === 10) return MULAN_BOND10_ACTIVE;
  return MULAN_BOND15_ACTIVE;
}

function buildMulanSegments(classStacksOnBoard: number, bondLineTint: HeroIntroBondLineTintMode): HeroIntroBodySegment[] {
  const gap = 6;
  return [
    { text: MULAN_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...MULAN_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: '被动与特性：无', fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

function buildGenericTail(def: NonNullable<ReturnType<typeof getHeroDef>>): HeroIntroBodySegment[] {
  return [
    { text: '主动技能：暂无', fill: GOLDEN_PANEL_BODY, marginBottom: 8 },
    { text: `被动与特性：${def.passiveDesc}`, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

/**
 * 英雄详情正文：多段着色（穆兰羁绊 6/10/15 行）。
 * @param classStacksOnBoard 备战棋盘该职业总层数，用于名称后缀「+1」及 respectStacks 下的羁绊行着色。
 * @param bondLineTint `allActive`：预览等无羁绊上下文时各档一律用激活色；`respectStacks`：未达层数用灰色。
 */
export function buildHeroIntroBodySegments(
  id: HeroId,
  classStacksOnBoard: number,
  opts: { bondLineTint: HeroIntroBondLineTintMode },
): HeroIntroBodySegment[] {
  const def = getHeroDef(id);
  if (!def) return [];
  const meta = loadHeroMeta();
  const stars = meta.heroes[id]?.stars ?? 1;
  const sm = heroStarStatMult(stars);
  const dispHp = Math.round(def.maxHp * sm);
  const dispAtk = Math.round(def.atk * sm);
  const displayName = heroDisplayNameWithSkillTier(def.name, classStacksOnBoard);
  const statsBlock = [
    `${displayName}  ·  ${ALLY_DEFS[def.allyClass].name}`,
    `★${stars}（属性×${sm.toFixed(2)}）`,
    `生命 ${dispHp}  攻击 ${dispAtk}`,
    `攻速 ${def.attackSpeed}  射程 ${def.range}  移速 ${def.moveSpeed}`,
  ].join('\n');

  const head: HeroIntroBodySegment = { text: statsBlock, fill: GOLDEN_PANEL_BODY, marginBottom: 10 };

  if (isWarriorWhirlwindHero(id)) {
    return [head, ...buildMulanSegments(classStacksOnBoard, opts.bondLineTint)];
  }
  if (isMageArcaneMissilesHero(id)) {
    return [head, ...buildMageArcaneSegments(classStacksOnBoard, opts.bondLineTint)];
  }
  if (isPriestMassShelterHero(id)) {
    return [head, ...buildPriestShelterSegments(classStacksOnBoard, opts.bondLineTint)];
  }
  if (isArcherStrongStrikeAuraHero(id)) {
    return [head, ...buildArcherStrongStrikeSegments(classStacksOnBoard, opts.bondLineTint)];
  }
  if (isKnightHolySanctionHero(id)) {
    return [head, ...buildKnightHolySanctionSegments(classStacksOnBoard, opts.bondLineTint)];
  }
  return [head, ...buildGenericTail(def)];
}

/** @deprecated 使用 buildHeroIntroBodySegments + 分段 Text；保留作纯文本拼接调试用 */
export function buildHeroIntroBodyText(id: HeroId, classStacksOnBoard: number): string {
  return buildHeroIntroBodySegments(id, classStacksOnBoard, { bondLineTint: 'allActive' })
    .map((s) => s.text)
    .join('\n\n');
}
