import type { HeroId } from './heroRegistry';
import {
  getHeroActiveSkillSummary,
  getHeroDef,
  heroDisplayNameWithSkillTier,
  heroStarStatMult,
} from './heroRegistry';
import { loadHeroMeta } from './heroMetaStorage';
import { ALLY_DEFS } from './unitDefs';

/**
 * 英雄详情全文（强化 / 招募弹层共用）。
 * @param classStacksOnBoard 当前备战棋盘该职业总层数，用于「穆兰+1」等名称后缀；无备战上下文时用 0。
 */
export function buildHeroIntroBodyText(id: HeroId, classStacksOnBoard: number): string {
  const def = getHeroDef(id);
  if (!def) return '';
  const meta = loadHeroMeta();
  const stars = meta.heroes[id]?.stars ?? 1;
  const sm = heroStarStatMult(stars);
  const dispHp = Math.round(def.maxHp * sm);
  const dispAtk = Math.round(def.atk * sm);
  const displayName = heroDisplayNameWithSkillTier(def.name, classStacksOnBoard);
  const activeLine = getHeroActiveSkillSummary(id);
  return [
    `${displayName}  ·  ${ALLY_DEFS[def.allyClass].name}`,
    `★${stars}（属性×${sm.toFixed(2)}）`,
    `生命 ${dispHp}  攻击 ${dispAtk}`,
    `攻速 ${def.attackSpeed}  射程 ${def.range}  移速 ${def.moveSpeed}`,
    '',
    `被动与特性：${def.passiveDesc}`,
    '',
    activeLine ? `主动技能：${activeLine}` : '主动技能：暂无',
  ].join('\n');
}
