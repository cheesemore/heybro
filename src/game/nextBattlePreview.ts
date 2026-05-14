import type { EnemyPaintKind } from './battleVisuals';
import type { BossId, EnemyClass, RoundMeta } from './types';
import { BOSS_DEFS, ENEMY_DEFS, enemyCombatBaseAtkFromTable, scaledEnemyAtk, scaledEnemyHp } from './unitDefs';
import { bossDisplayName } from './roundConfig';
import { RANGED_ATTACK_RANGE_THRESHOLD } from './battleBonds';
import { getWowMob, bossUidForBookChapter } from './wowBookData';
import type { WowMob } from './wowBookData';
import { formatSkillNamesCn } from './skillsCatalog';

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
  darkspear: '远程；普攻概率击退并减速我方。',
  shaman: '远程；周期性为附近友军嗜血术。',
  batrider: '远程；可跃入后排。',
  catapult: '远程；攻击附带地面燃烧区域。',
};

function statLine(chapter: 1 | 2 | 3, ri: number, type: EnemyClass, bookM: number): string {
  const d = ENEMY_DEFS[type];
  const hp = scaledEnemyHp(chapter, ri, d.baseMaxHp, bookM);
  const atk = scaledEnemyAtk(chapter, ri, d.baseAtk, bookM);
  const rng = d.range >= RANGED_ATTACK_RANGE_THRESHOLD ? '远程' : '近战';
  return `HP ${hp} · 攻 ${atk} · 攻速 ${d.attackSpeed.toFixed(2)} · 射程 ${d.range}（${rng}）· 移速 ${d.moveSpeed}`;
}

function wowMobStatLine(chapter: 1 | 2 | 3, ri: number, mob: WowMob, bookM: number): string {
  const baseAtk = enemyCombatBaseAtkFromTable(mob.baseAtk, mob.range);
  const hp = scaledEnemyHp(chapter, ri, mob.baseMaxHp, bookM);
  const atk = scaledEnemyAtk(chapter, ri, baseAtk, bookM);
  const rng = mob.range >= RANGED_ATTACK_RANGE_THRESHOLD ? '远程' : '近战';
  return `HP ${hp} · 攻 ${atk} · 攻速 ${mob.attackSpeed.toFixed(2)} · 射程 ${mob.range}（${rng}）· 移速 ${mob.moveSpeed}`;
}

/**
 * 关卡地图战斗预览用：名称、数量、数值、特性（样貌由界面单独绘制）。
 * @param scaleRoundIndex 与 ROUNDS 下标一致（0 … 15）
 */
export function formatNextBattlePreview(meta: RoundMeta, scaleRoundIndex: number, bookStrengthMult: number): string {
  const { chapter } = meta;
  const ri = scaleRoundIndex;
  const lines: string[] = [];
  lines.push(`关卡 ${meta.label}（${meta.kind === 'boss' ? '首领战' : '普通战斗'}）`);
  lines.push('');

  for (const w of meta.enemies) {
    if (w.type === 'boss' && w.bossId) {
      const b = BOSS_DEFS[w.bossId];
      const hp = scaledEnemyHp(chapter, ri, b.baseMaxHp * 10, bookStrengthMult);
      const atk = scaledEnemyAtk(chapter, ri, b.baseAtk, bookStrengthMult);
      const name =
        w.wowBossDisplayName && w.wowBossDisplayName.trim().length > 0
          ? w.wowBossDisplayName.trim()
          : bossDisplayName(w.bossId);
      lines.push(`【${name}】×${w.count}`);
      lines.push(`数值：HP ${hp} · 攻 ${atk} · 攻速 ${b.attackSpeed.toFixed(2)} · 射程 ${b.range}`);
      if (b.skillIds.length === 0) {
        lines.push('特性：白板首领（暂无配置技能，仅普攻与走位）。');
      } else {
        lines.push(`特性：首领技能组 — ${formatSkillNamesCn(b.skillIds)}。`);
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
        lines.push(`数值（单兵）：${statLine(chapter, ri, type, bookStrengthMult)}`);
        lines.push(`特性：${ENEMY_TRAIT[type]}`);
        lines.push('');
        continue;
      }
      lines.push(`【${mob.nameCn}】×${w.count}`);
      lines.push(`数值（单兵）：${wowMobStatLine(chapter, ri, mob, bookStrengthMult)}`);
      lines.push(`特性：用书怪（立绘模板 ${ENEMY_DEFS[type].name}）— ${ENEMY_TRAIT[type]}。`);
      lines.push('');
      continue;
    }
    const type = w.type as EnemyClass;
    const d = ENEMY_DEFS[type];
    lines.push(`【${d.name}】×${w.count}`);
    lines.push(`数值（单兵）：${statLine(chapter, ri, type, bookStrengthMult)}`);
    lines.push(`特性：${ENEMY_TRAIT[type]}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
