import type { HeroId } from './heroRegistry';
import {
  isArcherSnareTrapHero,
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

function buildMageArcaneSegments(
  def: NonNullable<ReturnType<typeof getHeroDef>>,
  classStacksOnBoard: number,
  bondLineTint: HeroIntroBondLineTintMode,
): HeroIntroBodySegment[] {
  const gap = 6;
  const tail =
    purpleSignaturePassiveFooter(def) ?? '被动与特性：见上（法师层数影响技能强度）。';
  return [
    { text: ARCANE_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...ARCANE_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: tail, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

const SHELTER_SKILL_BASE = [
  '主动：群体庇护',
  '',
  '冷却 48 秒：为若干名友方施加护盾，护盾值 = 本英雄攻击力×200%（护盾上限同最大生命）。',
  '优先当前生命最少且无护盾的单位；若均有护盾，则仍优先当前生命最少者。',
  '目标数不超过场上存活牧师人数（含自己）；牧师羁绊达 15 层时为全体友方。',
].join('\n');

const SHELTER_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：冷却缩短为 36 秒。' },
  { tier: 10, text: '羁绊10：生命低于 50% 的单位在获得护盾时，额外治疗量 = 本英雄攻击力×200%；牧师羁绊达终档（≥15）时再翻倍（合计×400% 攻击力）。' },
  { tier: 15, text: '羁绊15：不再受牧师人数限制，始终为全体存活友方施加护盾。' },
];

function buildPriestShelterSegments(
  def: NonNullable<ReturnType<typeof getHeroDef>>,
  classStacksOnBoard: number,
  bondLineTint: HeroIntroBondLineTintMode,
): HeroIntroBodySegment[] {
  const gap = 6;
  const tail =
    purpleSignaturePassiveFooter(def) ?? '被动与特性：见上（牧师层数影响技能与护盾）。';
  return [
    { text: SHELTER_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...SHELTER_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: tail, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

const SNARE_TRAP_SKILL_BASE = [
  '主动：诱捕陷阱',
  '',
  '战斗开始：你若在场，所有射手获得【诱捕陷阱】，持续 10 秒。',
  '陷阱持续期间，该单位首次受到物理攻击时触发：接下来 2 秒内受到的所有伤害变为 1 点。',
  '10 秒内未触发则陷阱消失；触发后减伤时间结束，陷阱亦消失。',
].join('\n');

const SNARE_TRAP_BOND_LINES: ReadonlyArray<{ tier: 6 | 10 | 15; text: string }> = [
  { tier: 6, text: '羁绊6：触发后的减伤效果延长至 3 秒。' },
  {
    tier: 10,
    text: '羁绊10：减伤生效期间，攻击你的非首领敌人会被眩晕 3 秒（每名友方陷阱至多眩晕一次）。',
  },
  { tier: 15, text: '羁绊15：开场改为对所有远程友军施加【诱捕陷阱】（不再仅限射手）。' },
];

function buildArcherSnareTrapSegments(
  def: NonNullable<ReturnType<typeof getHeroDef>>,
  classStacksOnBoard: number,
  bondLineTint: HeroIntroBondLineTintMode,
): HeroIntroBodySegment[] {
  const gap = 6;
  const tail =
    purpleSignaturePassiveFooter(def) ?? '被动与特性：见上（射手层数影响羁绊档位与专注规则）。';
  return [
    { text: SNARE_TRAP_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...SNARE_TRAP_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: tail, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
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

function buildKnightHolySanctionSegments(
  def: NonNullable<ReturnType<typeof getHeroDef>>,
  classStacksOnBoard: number,
  bondLineTint: HeroIntroBondLineTintMode,
): HeroIntroBodySegment[] {
  const gap = 6;
  const tail =
    purpleSignaturePassiveFooter(def) ?? '被动与特性：见上（骑士层数影响神圣制裁与冷却规则）。';
  return [
    { text: HOLY_SANCTION_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...HOLY_SANCTION_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: tail, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
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

/**
 * 品质 2（紫）签名英雄：`heroRegistry` 的 `passiveDesc` 含额外被动，模板尾行「无 / 见上」会盖住，此处拼进详情正文。
 */
function purpleSignaturePassiveFooter(def: { quality: number; allyClass: string; passiveDesc: string }): string | null {
  if (def.quality !== 2) return null;
  const d = def.passiveDesc.trim();
  if (!d) return null;
  if (def.allyClass === 'warrior') {
    return d.startsWith('被动：') ? `被动与特性：${d.slice('被动：'.length)}` : `被动与特性：${d}`;
  }
  const idx = d.indexOf('被动：');
  if (idx < 0) return `被动与特性：${d}`;
  return `被动与特性：${d.slice(idx + '被动：'.length).trim()}`;
}

function buildMulanSegments(
  def: NonNullable<ReturnType<typeof getHeroDef>>,
  classStacksOnBoard: number,
  bondLineTint: HeroIntroBondLineTintMode,
): HeroIntroBodySegment[] {
  const gap = 6;
  const tail = purpleSignaturePassiveFooter(def) ?? '被动与特性：无';
  return [
    { text: MULAN_SKILL_BASE, fill: GOLDEN_PANEL_BODY, marginBottom: gap },
    ...MULAN_BOND_LINES.map((row) => ({
      text: row.text,
      fill: bondLineFill(classStacksOnBoard, row.tier, bondLineTint),
      marginBottom: gap,
    })),
    { text: tail, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

function buildGenericTail(def: NonNullable<ReturnType<typeof getHeroDef>>): HeroIntroBodySegment[] {
  return [
    { text: '主动技能：暂无', fill: GOLDEN_PANEL_BODY, marginBottom: 8 },
    { text: `被动与特性：${def.passiveDesc}`, fill: GOLDEN_PANEL_BODY, marginBottom: 0 },
  ];
}

/**
 * 英雄详情正文：多段着色（签名英雄羁绊档位 6/10/15 行，如穆兰）。
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
    return [head, ...buildMulanSegments(def, classStacksOnBoard, opts.bondLineTint)];
  }
  if (isMageArcaneMissilesHero(id)) {
    return [head, ...buildMageArcaneSegments(def, classStacksOnBoard, opts.bondLineTint)];
  }
  if (isPriestMassShelterHero(id)) {
    return [head, ...buildPriestShelterSegments(def, classStacksOnBoard, opts.bondLineTint)];
  }
  if (isArcherSnareTrapHero(id)) {
    return [head, ...buildArcherSnareTrapSegments(def, classStacksOnBoard, opts.bondLineTint)];
  }
  if (isKnightHolySanctionHero(id)) {
    return [head, ...buildKnightHolySanctionSegments(def, classStacksOnBoard, opts.bondLineTint)];
  }
  return [head, ...buildGenericTail(def)];
}

/** @deprecated 使用 buildHeroIntroBodySegments + 分段 Text；保留作纯文本拼接调试用 */
export function buildHeroIntroBodyText(id: HeroId, classStacksOnBoard: number): string {
  return buildHeroIntroBodySegments(id, classStacksOnBoard, { bondLineTint: 'allActive' })
    .map((s) => s.text)
    .join('\n\n');
}
