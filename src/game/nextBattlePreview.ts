import type { EnemyPaintKind } from './battleVisuals';
import type { BossId, EnemyClass, RoundMeta } from './types';
import {
  DEFAULT_NODE_PROGRESS_MAX,
  getNodeProgressMaxForBookChapter,
} from './gearItems';
import { ENEMY_DEFS, enemyCombatBaseAtkFromTable, scaledEnemyAtk, scaledEnemyHp } from './unitDefs';
import { GAME_TERM_ZH } from './gameTerminology';
import { bossDisplayName } from './roundConfig';
import { RANGED_ATTACK_RANGE_THRESHOLD } from './battleBonds';
import { getWowMob, bossUidForBookChapter, resolveWowBookBossCombat } from './wowBookData';
import type { WowMob } from './wowBookData';
import { formatSkillNamesCn, getSkillById, type SkillDef } from './skillsCatalog';

export type BattlePreviewPortraitEntry = {
  paint: EnemyPaintKind;
  count: number;
  title: string;
  /** 与 `public/assets/wow-mobs-circle` / `wow-bosses-circle` 文件名一致；缺图时回退 `paint` 代币底 */
  wowCirclePortraitUid?: string;
};

function bossIdToEnemyPaint(id: BossId): EnemyPaintKind {
  if (id === 'farseer' || id === 'white') return 'boss_farseer';
  if (id === 'tauren') return 'boss_tauren';
  return 'boss_blademaster';
}

/** 关卡预览：每种出战敌（含首领）一条，用于绘制战场同款立绘。传入 `bookChapterId` 时可挂上圆形立绘 uid。 */
export function battlePreviewPortraitEntries(
  meta: RoundMeta,
  bookChapterId?: number,
): BattlePreviewPortraitEntry[] {
  const out: BattlePreviewPortraitEntry[] = [];
  for (const w of meta.enemies) {
    if (w.type === 'boss' && w.bossId) {
      const title =
        w.wowBossDisplayName && w.wowBossDisplayName.trim().length > 0
          ? w.wowBossDisplayName.trim()
          : bossDisplayName(w.bossId);
      const bu =
        bookChapterId != null && bookChapterId > 0 ? bossUidForBookChapter(bookChapterId) : null;
      out.push({
        paint: bossIdToEnemyPaint(w.bossId),
        count: w.count,
        title,
        wowCirclePortraitUid: bu ?? undefined,
      });
    } else if (w.wowMobId) {
      const mob = getWowMob(w.wowMobId);
      const type = w.type as EnemyClass;
      out.push({
        paint: type as EnemyPaintKind,
        count: w.count,
        title: mob?.nameCn ?? w.wowMobId,
        wowCirclePortraitUid: mob?.monsterUid,
      });
    } else {
      const type = w.type as EnemyClass;
      out.push({
        paint: type as EnemyPaintKind,
        count: w.count,
        title: ENEMY_DEFS[type].name,
      });
    }
  }
  return out;
}

const ENEMY_TRAIT: Record<EnemyClass, string> = {
  grunt: '标准近战，无特殊机制。',
  dread_warrior: '可发动一次向前的范围突击。',
  raider: '可跃入我方后排并获得短时强化。',
  beserker: '可跃入我方后排。',
  kodo: '大体型近战，生命较高。',
  ultralisk: '大体型近战；受法师伤害翻倍。',
  abomination: '近战挥砍有概率对身边友军追加溅射伤害。',
  headhunter: '远程投掷。',
  darkspear: '远程输出。',
  shaman: '远程；周期性为附近友军嗜血术。',
  batrider: '远程；跃入后排脚下，落地范围伤。',
  catapult: '远程；攻击附带地面燃烧区域。',
};

function nodeProgressMaxForPreview(bookChapterId?: number): number {
  return bookChapterId != null && bookChapterId > 0
    ? getNodeProgressMaxForBookChapter(bookChapterId)
    : DEFAULT_NODE_PROGRESS_MAX;
}

function statLine(
  chapter: 1 | 2 | 3,
  ri: number,
  type: EnemyClass,
  bookM: number,
  bookChapterId?: number,
): string {
  const d = ENEMY_DEFS[type];
  const progMax = nodeProgressMaxForPreview(bookChapterId);
  const hp = scaledEnemyHp(chapter, ri, d.baseMaxHp, bookM, progMax);
  const atk = scaledEnemyAtk(chapter, ri, d.baseAtk, bookM, progMax);
  const rng = d.range >= RANGED_ATTACK_RANGE_THRESHOLD ? '远程' : '近战';
  return `HP ${hp} · 攻 ${atk} · 攻速 ${d.attackSpeed.toFixed(2)} · 射程 ${d.range}（${rng}）· 移速 ${d.moveSpeed}`;
}

function wowMobStatLine(
  chapter: 1 | 2 | 3,
  ri: number,
  mob: WowMob,
  bookM: number,
  bookChapterId?: number,
): string {
  const baseAtk = enemyCombatBaseAtkFromTable(mob.baseAtk, mob.range);
  const progMax = nodeProgressMaxForPreview(bookChapterId);
  const hp = scaledEnemyHp(chapter, ri, mob.baseMaxHp, bookM, progMax);
  const atk = scaledEnemyAtk(chapter, ri, baseAtk, bookM, progMax);
  const rng = mob.range >= RANGED_ATTACK_RANGE_THRESHOLD ? '远程' : '近战';
  return `HP ${hp} · 攻 ${atk} · 攻速 ${mob.attackSpeed.toFixed(2)} · 射程 ${mob.range}（${rng}）· 移速 ${mob.moveSpeed}`;
}

/** 玩家向技能说明：优先 `descriptionCn`，空则 `logicEffectCn` */
function skillPlayerDescription(def: SkillDef): string {
  const d = def.descriptionCn?.trim();
  if (d) return d;
  return def.logicEffectCn?.trim() || '（暂无说明）';
}

function appendSkillDetailLines(lines: string[], skillIds: readonly string[]): void {
  if (!skillIds.length) return;
  for (const sid of skillIds) {
    const def = getSkillById(sid);
    if (!def) {
      lines.push(`  · ${sid}（未在 skills.json 登记）`);
      continue;
    }
    lines.push(`  · 【${def.nameCn}】${skillPlayerDescription(def)}`);
  }
}

/** 普攻理论秒伤：表内 `attackSpeed` 为攻击间隔（秒/次），秒伤 = 战场攻击力 ÷ 间隔 */
function formatSustainedDpsParenthetical(combatAtk: number, attackIntervalSec: number): string {
  if (attackIntervalSec <= 1e-6) return '（每秒伤害—）';
  const dps = combatAtk / attackIntervalSec;
  const s = dps >= 100 ? dps.toFixed(1) : dps >= 10 ? dps.toFixed(1) : dps.toFixed(2);
  return `（每秒伤害${s}）`;
}

function rangeIntelLineCn(rangePx: number): string {
  if (rangePx >= RANGED_ATTACK_RANGE_THRESHOLD) {
    return `射程：${Math.round(rangePx)}（远程）`;
  }
  return '射程：近战';
}

function appendChapterIntelSkillLines(lines: string[], skillIds: readonly string[]): void {
  if (!skillIds.length) return;
  for (const sid of skillIds) {
    const def = getSkillById(sid);
    if (!def) {
      lines.push(`${sid}：未在 skills.json 登记`);
      continue;
    }
    lines.push(`${def.nameCn}：${skillPlayerDescription(def)}`);
  }
}

function intelTwoLineStats(
  hp: number,
  combatAtk: number,
  attackIntervalSec: number,
  rangePx: number,
): { line1: string; line2: string } {
  return {
    line1: `生命值：${Math.round(hp)}　攻速：${attackIntervalSec.toFixed(2)}${formatSustainedDpsParenthetical(combatAtk, attackIntervalSec)}`,
    line2: `攻击力：${Math.round(combatAtk)}　${rangeIntelLineCn(rangePx)}`,
  };
}

function skillLinesFromIds(skillIds: readonly string[]): string[] {
  const lines: string[] = [];
  appendChapterIntelSkillLines(lines, skillIds);
  return lines;
}

export type ChapterIntelCardParts = {
  name: string;
  statLine1: string;
  statLine2: string;
  skillLines: string[];
};

/**
 * 章节情报弹窗：单个小怪（名称 + 两行数值 + 技能行），供界面分栏排版。
 */
export function getChapterIntelMobCardParts(
  w: RoundMeta['enemies'][number],
  chapter: 1 | 2 | 3,
  scaleRoundIndex: number,
  bookStrengthMult: number,
  _bookChapterId?: number,
): ChapterIntelCardParts {
  if (w.type === 'boss') {
    return { name: '', statLine1: '', statLine2: '', skillLines: [] };
  }
  const ri = scaleRoundIndex;
  const progMax = nodeProgressMaxForPreview(_bookChapterId);

  if (w.wowMobId) {
    const mob = getWowMob(w.wowMobId);
    if (!mob) {
      const type = w.type as EnemyClass;
      const d = ENEMY_DEFS[type];
      const st = intelTwoLineStats(
        scaledEnemyHp(chapter, ri, d.baseMaxHp, bookStrengthMult, progMax),
        scaledEnemyAtk(chapter, ri, d.baseAtk, bookStrengthMult, progMax),
        d.attackSpeed,
        d.range,
      );
      return {
        name: d.name,
        statLine1: st.line1,
        statLine2: st.line2,
        skillLines: skillLinesFromIds(d.skillIds),
      };
    }
    const baseAtk = enemyCombatBaseAtkFromTable(mob.baseAtk, mob.range);
    const combatAtk = scaledEnemyAtk(chapter, ri, baseAtk, bookStrengthMult, progMax);
    const st = intelTwoLineStats(
      scaledEnemyHp(chapter, ri, mob.baseMaxHp, bookStrengthMult, progMax),
      combatAtk,
      mob.attackSpeed,
      mob.range,
    );
    return {
      name: mob.nameCn,
      statLine1: st.line1,
      statLine2: st.line2,
      skillLines: skillLinesFromIds(mob.skillIds ?? []),
    };
  }

  const type = w.type as EnemyClass;
  const d = ENEMY_DEFS[type];
  const st = intelTwoLineStats(
    scaledEnemyHp(chapter, ri, d.baseMaxHp, bookStrengthMult, progMax),
    scaledEnemyAtk(chapter, ri, d.baseAtk, bookStrengthMult, progMax),
    d.attackSpeed,
    d.range,
  );
  return {
    name: d.name,
    statLine1: st.line1,
    statLine2: st.line2,
    skillLines: skillLinesFromIds(d.skillIds),
  };
}

/**
 * 章节情报弹窗：关底首领（名称 + 两行数值 + 技能行）。
 */
export function getChapterIntelBossCardParts(
  w: RoundMeta['enemies'][number],
  chapter: 1 | 2 | 3,
  scaleRoundIndex: number,
  bookStrengthMult: number,
  bookChapterId?: number,
): ChapterIntelCardParts {
  if (w.type !== 'boss' || !w.bossId) {
    return { name: '', statLine1: '', statLine2: '', skillLines: [] };
  }
  const ri = scaleRoundIndex;
  const progMax = nodeProgressMaxForPreview(bookChapterId);
  const bc = resolveWowBookBossCombat(bookChapterId ?? 0);
  const hp = scaledEnemyHp(chapter, ri, bc.baseMaxHpTable, bookStrengthMult, progMax);
  const combatAtk = scaledEnemyAtk(chapter, ri, bc.combatBaseAtk, bookStrengthMult, progMax);
  const st = intelTwoLineStats(hp, combatAtk, bc.attackSpeed, bc.range);
  const name =
    w.wowBossDisplayName && w.wowBossDisplayName.trim().length > 0
      ? w.wowBossDisplayName.trim()
      : bossDisplayName(w.bossId);
  const sk = bc.skillIds;
  const skillLines =
    sk.length === 0 ? ['无额外技能，仅普攻与走位。'] : skillLinesFromIds(sk);
  return { name, statLine1: st.line1, statLine2: st.line2, skillLines };
}

/**
 * 关卡地图战斗预览用：名称、数量、数值、特性（样貌由界面单独绘制）。
 * @param scaleRoundIndex 与 ROUNDS 下标一致（0 … 15）
 */
export function formatNextBattlePreview(
  meta: RoundMeta,
  scaleRoundIndex: number,
  bookStrengthMult: number,
  bookChapterId?: number,
): string {
  const { chapter } = meta;
  const ri = scaleRoundIndex;
  const progMax = nodeProgressMaxForPreview(bookChapterId);
  const lines: string[] = [];
  lines.push(GAME_TERM_ZH.nodePreviewTitle(meta.label, meta.kind === 'boss' ? 'boss' : 'normal'));
  lines.push('');

  for (const w of meta.enemies) {
    if (w.type === 'boss' && w.bossId) {
      const bc = resolveWowBookBossCombat(bookChapterId ?? 0);
      const hp = scaledEnemyHp(chapter, ri, bc.baseMaxHpTable, bookStrengthMult, progMax);
      const atk = scaledEnemyAtk(chapter, ri, bc.combatBaseAtk, bookStrengthMult, progMax);
      const atkSp = bc.attackSpeed;
      const rng = bc.range;
      const sk = bc.skillIds;
      const name =
        w.wowBossDisplayName && w.wowBossDisplayName.trim().length > 0
          ? w.wowBossDisplayName.trim()
          : bossDisplayName(w.bossId);
      lines.push(`【${name}】×${w.count}`);
      lines.push(`数值：HP ${hp} · 攻 ${atk} · 攻速 ${atkSp.toFixed(2)} · 射程 ${rng}`);
      if (sk.length === 0) {
        lines.push('特性：白板首领（暂无配置技能，仅普攻与走位）。');
      } else {
        lines.push(`特性：首领技能组 — ${formatSkillNamesCn(sk)}。`);
        lines.push('技能说明：');
        appendSkillDetailLines(lines, sk);
      }
      lines.push('');
      continue;
    }
    if (w.wowMobId) {
      const mob = getWowMob(w.wowMobId);
      const type = w.type as EnemyClass;
      if (!mob) {
        const d = ENEMY_DEFS[type];
        lines.push(`【${d.name}】×${w.count}`);
        lines.push(`数值（单兵）：${statLine(chapter, ri, type, bookStrengthMult, bookChapterId)}`);
        lines.push(`特性：${ENEMY_TRAIT[type]}`);
        if (d.skillIds.length > 0) {
          lines.push(`技能：${formatSkillNamesCn(d.skillIds)}`);
          lines.push('技能说明：');
          appendSkillDetailLines(lines, d.skillIds);
        }
        lines.push('');
        continue;
      }
      lines.push(`【${mob.nameCn}】×${w.count}`);
      lines.push(`数值（单兵）：${wowMobStatLine(chapter, ri, mob, bookStrengthMult, bookChapterId)}`);
      if (mob.skillIds != null && mob.skillIds.length > 0) {
        lines.push(`技能：${formatSkillNamesCn(mob.skillIds)}`);
        lines.push('技能说明：');
        appendSkillDetailLines(lines, mob.skillIds);
      }
      lines.push(`立绘模板：${ENEMY_DEFS[type].name}（${ENEMY_TRAIT[type]}）`);
      lines.push('');
      continue;
    }
    const type = w.type as EnemyClass;
    const d = ENEMY_DEFS[type];
    lines.push(`【${d.name}】×${w.count}`);
    lines.push(`数值（单兵）：${statLine(chapter, ri, type, bookStrengthMult, bookChapterId)}`);
    lines.push(`特性：${ENEMY_TRAIT[type]}`);
    if (d.skillIds.length > 0) {
      lines.push(`技能：${formatSkillNamesCn(d.skillIds)}`);
      lines.push('技能说明：');
      appendSkillDetailLines(lines, d.skillIds);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
