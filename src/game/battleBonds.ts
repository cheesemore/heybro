import { ALLY_CLASSES } from './constants';
import type { AllyClass, BoardCell } from './types';

export type BoardSlot = BoardCell | null;

/** 敌方攻击距离 ≥ 此值视为「远程」，战士格挡对其生效 */
export const RANGED_ATTACK_RANGE_THRESHOLD = 100;

export function stacksOnBoard(board: readonly BoardSlot[], kind: AllyClass): number {
  let s = 0;
  for (const c of board) {
    if (c && c.kind === kind) s += c.stacks;
  }
  return s;
}

export function allBondStacks(board: readonly BoardSlot[]): Record<AllyClass, number> {
  const o = {} as Record<AllyClass, number>;
  for (const k of ALLY_CLASSES) o[k] = stacksOnBoard(board, k);
  return o;
}

/** 战士/法师/射手/骑士：3/6/10 层羁绊数值档，加法叠加 */
export function classBondHpAtkMultiplier(count: number): number {
  let m = 1;
  if (count >= 3) m += 0.3;
  if (count >= 6) m += 0.5;
  if (count >= 10) m += 0.7;
  return m;
}

/** 牧师：全队生命与攻击加成，阈值 3/6/10 */
export function priestBondTeamMultiplier(priestCount: number): number {
  let m = 1;
  if (priestCount >= 3) m += 0.1;
  if (priestCount >= 6) m += 0.2;
  if (priestCount >= 10) m += 0.3;
  return m;
}

/** 职业终极羁绊：层数总和 ≥15 时激活 */
export function hasBondUltimate(count: number): boolean {
  return count >= 15;
}

/** 极巨化羁绊（红）：层数总和 ≥21 时激活（入场随机 3 个该职业单位） */
export function hasBondMega(count: number): boolean {
  return count >= 21;
}

/** 极巨化：碰撞/代币半径与视觉缩放（相对原半径 1 → 1.25） */
export const BOND_MEGA_RADIUS_MULT = 1.25 as const;
/** 极巨化：生命与攻击（相对原数值 1 → 3） */
export const BOND_MEGA_STAT_MULT = 3 as const;
/** @deprecated 使用 BOND_MEGA_STAT_MULT */
export const BOND_MEGA_MULT = BOND_MEGA_STAT_MULT;

/** 战士格挡：基础触发概率（十羁绊提升至 0.7） */
export function warriorBondBlockChance(warriorStacks: number, extraChance = 0): number {
  const base = warriorStacks >= 10 ? 0.7 : 0.4;
  return Math.min(0.95, base + extraChance);
}

/** 战士格挡成功时保留的伤害比例（三羁绊起为 50%，否则 65% = 减伤 35%） */
export function warriorBondBlockDamageRetain(warriorStacks: number): number {
  return warriorStacks >= 3 ? 0.5 : 0.65;
}

/** 六羁绊起近战与远程均可参与格挡判定 */
export function warriorBondBlocksRanged(warriorStacks: number): boolean {
  return warriorStacks >= 6;
}

/** 十五羁绊：格挡成功必反击 */
export function warriorBondCounterOnBlock(warriorStacks: number): boolean {
  return warriorStacks >= 15;
}

/** 法师溅射半径（设计像素，未乘 LAYOUT_SCALE） */
export function mageBondSplashRadiusDesign(mageStacks: number): number {
  return mageStacks >= 3 ? 75 : 50;
}

/** 六羁绊：每名法师奥术护盾可抵挡伤害次数 */
export function mageBondArcaneWardHits(mageStacks: number): number {
  return mageStacks >= 6 ? 2 : 0;
}

/** 十羁绊：对「元素」生物伤害加成比例 */
export const MAGE_BOND_ELEMENT_DAMAGE_BONUS = 0.35;

/** 十五羁绊流星雨间隔（秒） */
export const MAGE_BOND_METEOR_INTERVAL_SEC = 10;

/** 十五羁绊：每名敌人受到的伤害 = 存活法师攻击力之和 × 该系数 */
export const MAGE_BOND_METEOR_ATK_COEFF = 0.2;

/** 牧师基础治疗量 = 攻击力 × 该系数（三羁绊起为 1） */
export function priestBondHealCoeff(priestStacks: number): number {
  return priestStacks >= 3 ? 1 : 0.75;
}

/** 十五羁绊：目标生命低于该比例时治疗 ×3 */
export const PRIEST_BOND_LOW_HP_HEAL_THRESHOLD = 0.4;
export const PRIEST_BOND_LOW_HP_HEAL_MULT = 3;

/** 射手专注层数上限 */
export function archerBondFocusCap(archerStacks: number): number {
  return archerStacks >= 3 ? 30 : 20;
}

/** 六羁绊射程加成（设计像素） */
export function archerBondRangeBonusDesign(archerStacks: number): number {
  return archerStacks >= 6 ? 100 : 0;
}

/** 十羁绊：距离小于「表射程 − 该值」时持续后退（设计像素） */
export const ARCHER_BOND10_KITE_RETREAT_MARGIN_DESIGN = 50;

/** 十五羁绊追加箭概率 */
export function archerBondDoubleShotChance(archerStacks: number): number {
  return archerStacks >= 15 ? 0.35 : 0;
}

/** 骑士：与最远敌人距离超过该值（设计像素）才发起冲锋 */
export const KNIGHT_CHARGE_MIN_DIST_DESIGN = 120;

export const KNIGHT_CHARGE_COOLDOWN_SEC = 5;

/** 骑士冲锋命中伤害倍率（相对攻击力） */
export const KNIGHT_CHARGE_HIT_DAMAGE_MULT = 2;

/** 三羁绊：冲锋中受到伤害保留比例（减伤 75%） */
export const KNIGHT_BOND3_CHARGE_DAMAGE_RETAIN = 0.25;

/** 冲锋结束后仍保留上述减伤的秒数（不写进羁绊说明） */
export const KNIGHT_BOND3_CHARGE_DR_TAIL_SEC = 0.4;

/** 六羁绊：冲锋命中眩晕非首领（秒） */
export const KNIGHT_BOND_CHARGE_STUN_SEC = 2;

/** 十羁绊：每移动该距离（设计像素）回复最大生命 3% */
export const KNIGHT_BOND_MOVE_HEAL_DIST_DESIGN = 50;
export const KNIGHT_BOND_MOVE_HEAL_MAX_HP_RATIO = 0.03;

/** 十五羁绊：免死无敌时长（秒） */
export const KNIGHT_BOND_DEATH_DENY_INVINC_SEC = 3;
export const KNIGHT_BOND_DEATH_DENY_HEAL_RATIO = 0.3;

/** 术士普攻恐惧触发概率 */
export const WARLOCK_FEAR_PROC_CHANCE = 0.15;

/** 术士恐惧基础时长（秒）；三羁绊起为 3 秒 */
export function warlockBondFearDurationSec(warlockStacks: number): number {
  return warlockStacks >= 3 ? 3 : 2;
}

/** 六羁绊：普攻造成伤害转化为治疗的比例 */
export function warlockBondLifestealRatio(warlockStacks: number): number {
  return warlockStacks >= 6 ? 0.5 : 0;
}

/** 十五羁绊灵魂之火：生命高于该比例才可施放 */
export const WARLOCK_SOUL_FIRE_HP_ABOVE_RATIO = 0.5;

/** 十五羁绊灵魂之火伤害倍率（攻击力 × 2 = 200%）、自损最大生命比例、冷却（秒） */
export const WARLOCK_SOUL_FIRE_DAMAGE_MULT = 2;
export const WARLOCK_SOUL_FIRE_SELF_COST_MAX_HP_RATIO = 0.15;
export const WARLOCK_SOUL_FIRE_CD_SEC = 2;

/** 萨满：全队生命与攻击（3/6 层，与牧师叠加） */
export function shamanBondTeamMultiplier(shamanStacks: number): number {
  let m = 1;
  if (shamanStacks >= 3) m += 0.15;
  if (shamanStacks >= 6) m += 0.25;
  return m;
}

/** 德鲁伊十羁绊：全队生命与攻击 +35% */
export function druidBondTeamMultiplier(druidStacks: number): number {
  return druidStacks >= 10 ? 1.35 : 1;
}

/** 萨满治疗波目标数（三羁绊 +1） */
export function shamanBondHealWaveTargets(shamanStacks: number): number {
  return shamanStacks >= 3 ? 3 : 2;
}

/** 六羁绊入场嗜血：开战倒计时结束后延迟（秒）再施放 */
export const SHAMAN_BOND_OPENING_BLOODLUST_DELAY_SEC = 2;

/** 萨满羁绊嗜血：攻速倍率、持续秒（十五羁绊 18 秒） */
export function shamanBondBloodlustAtkSpeedMult(_shamanStacks: number): number {
  return 1.5;
}
export function shamanBondBloodlustDurationSec(shamanStacks: number): number {
  return shamanStacks >= 15 ? 18 : 6;
}

/** 萨满治疗波：每名目标恢复 = 萨满攻击力 × 此系数 */
export const SHAMAN_HEAL_WAVE_ATK_MULT = 0.25;
/** 萨满闪电箭伤害倍率 */
export const SHAMAN_LIGHTNING_BOLT_ATK_MULT = 1.5;

/** 风怒：额外连击概率（十 10% / 十五 20%） */
export function shamanBondWindfuryChance(shamanStacks: number): number {
  if (shamanStacks >= 15) return 0.2;
  if (shamanStacks >= 10) return 0.1;
  return 0;
}
/** 风怒：首击后额外连击次数（共 3 次命中） */
export const SHAMAN_WINDFURY_EXTRA_HITS = 2;
/** 风怒连击间隔：2 帧（60fps 逻辑步） */
export const SHAMAN_WINDFURY_HIT_GAP_SEC = 2 / 60;

/** 德鲁伊远程形态射程（设计像素） */
export const DRUID_CASTER_RANGE_DESIGN = 200;
/** 熊形态伤害减免（三羁绊 15%） */
export const DRUID_BEAR_DAMAGE_RETAIN = 0.85;
/** 熊德横扫：每 N 次普攻触发 */
export const DRUID_BEAR_SWIPE_EVERY_N_ATTACKS = 4;
export const DRUID_BEAR_SWIPE_HALF_ANGLE_DEG = 135 / 2;
/** 回春术：每秒最大生命 2%，持续与冷却（秒） */
export const DRUID_REJUV_HEAL_MAX_HP_RATIO_PER_SEC = 0.02;
export const DRUID_REJUV_DURATION_SEC = 10;
export const DRUID_REJUV_COOLDOWN_SEC = 2;

/** 十五羁绊：战斗复活恢复生命比例 */
export const DRUID_BOND15_BATTLE_REVIVE_HP_RATIO = 0.65;

/** 刺客三羁绊额外暴击率 */
export const ASSASSIN_BOND3_CRIT_BONUS = 0.1;
/** 六羁绊开场闪避 */
export const ASSASSIN_BOND6_DODGE_CHANCE = 0.7;
export const ASSASSIN_BOND6_DODGE_DURATION_SEC = 3;
/** 十羁绊：闪现后下一击眩晕（秒，非首领） */
export const ASSASSIN_BOND10_BLINK_STUN_SEC = 3;
/** 刺客闪现突袭内置冷却（秒） */
export const ASSASSIN_BLINK_CD_SEC = 3;
/** 十五羁绊消失 */
export const ASSASSIN_VANISH_HP_THRESHOLD = 0.2;
export const ASSASSIN_VANISH_HEAL_MAX_HP_PER_SEC = 0.1;
export const ASSASSIN_VANISH_FADE_SEC = 1.5;
export const ASSASSIN_VANISH_HOLD_SEC = 5;
export const ASSASSIN_VANISH_BODY_ALPHA = 0.15;
