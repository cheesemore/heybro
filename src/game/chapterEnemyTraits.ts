import { mobIdsForBookChapter } from './bookChapterConfig';
import { getSkillById } from './skillsCatalog';
import { getWowMob } from './wowBookData';

/** 同技能出现在本章怪物池中的最少怪种数，达到则视为「关卡敌人特性」 */
export const CHAPTER_ENEMY_TRAIT_MIN_MOB_COUNT = 3;

export type ChapterEnemyTrait = {
  skillId: string;
  nameCn: string;
  descriptionCn: string;
  mobCount: number;
};

/** 本章怪物池中，被 3+ 种小怪共同拥有的技能（按拥有怪种数降序） */
export function chapterEnemyTraits(chapterId: number): ChapterEnemyTrait[] {
  const counts = new Map<string, number>();
  for (const mobId of mobIdsForBookChapter(chapterId)) {
    const mob = getWowMob(mobId);
    if (!mob?.skillIds?.length) continue;
    for (const skillId of mob.skillIds) {
      counts.set(skillId, (counts.get(skillId) ?? 0) + 1);
    }
  }

  const out: ChapterEnemyTrait[] = [];
  for (const [skillId, mobCount] of counts) {
    if (mobCount < CHAPTER_ENEMY_TRAIT_MIN_MOB_COUNT) continue;
    const def = getSkillById(skillId);
    if (!def) continue;
    out.push({
      skillId,
      nameCn: def.nameCn,
      descriptionCn: def.descriptionCn,
      mobCount,
    });
  }
  out.sort((a, b) => b.mobCount - a.mobCount || a.nameCn.localeCompare(b.nameCn, 'zh'));
  return out;
}

/** 选关子板文案：最多 `maxLines` 行，每行「关卡敌人特性 {技能名}：{玩家说明}」 */
export function chapterEnemyTraitDisplayLines(chapterId: number, maxLines = 2): string[] {
  return chapterEnemyTraits(chapterId)
    .slice(0, maxLines)
    .map((t) => `关卡敌人特性 ${t.nameCn}：${t.descriptionCn}`);
}

export function chapterHasEnemyTraitPanel(chapterId: number): boolean {
  return chapterEnemyTraits(chapterId).length > 0;
}
