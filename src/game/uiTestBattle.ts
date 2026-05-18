import type { HeroId } from './heroRegistry';
import { roundsForBookChapter } from './roundConfig';
import type { RunState } from './runState';
import type { RoundMeta } from './types';

/** 开发：UI 测试战斗 — 四新兵种各 1 名蓝品质英雄 */
export const UI_TEST_NEW_CLASS_HERO_DEPLOY: readonly [HeroId, HeroId, HeroId, HeroId] = [
  'warlock_01',
  'shaman_01',
  'assassin_01',
  'druid_01',
];

/** @deprecated 旧版法/牧/骑测试阵容；新测试请用 `UI_TEST_NEW_CLASS_HERO_DEPLOY` */
export const UI_TEST_BLUE_FPM_HERO_DEPLOY: readonly [HeroId, HeroId, HeroId] = [
  'mage_02',
  'priest_02',
  'knight_01',
];

/** 与 `UI_TEST_ROUND_META` 一致：怒焰裂谷第 4 关关底（用于 `resolveWowBookBossCombat`） */
export const UI_TEST_BOOK_CHAPTER_ID = 4;

/** 开发：首领巴扎兰 + 术士/萨满/刺客/德鲁伊满羁绊验收 */
export const UI_TEST_ROUND_META: RoundMeta = {
  label:
    '开发：巴扎兰首领战 · 棋盘术/萨/刺/德 · 英雄四新兵种 · 四职业羁绊=21 · 控制台 [HeyBro/ui-test]',
  chapter: 3,
  sub: 6,
  kind: 'boss',
  enemies: [{ type: 'boss', count: 1, bossId: 'white', wowBossDisplayName: '巴扎兰' }],
  uiTestBattle: true,
};

/** 棋盘：四新兵种各一格（德鲁伊 4 层便于观察前熊后远程分裂） */
export function seedUiTestRunBoard(run: RunState): void {
  run.resetRun();
  run.bookChapterId = UI_TEST_BOOK_CHAPTER_ID;
  const rounds = roundsForBookChapter(UI_TEST_BOOK_CHAPTER_ID);
  run.currentRoundIndex = Math.max(0, rounds.length - 1);
  run.board = [
    { kind: 'warlock', stacks: 2 },
    { kind: 'shaman', stacks: 2 },
    { kind: 'assassin', stacks: 2 },
    { kind: 'druid', stacks: 4 },
    null,
    null,
    null,
    null,
    null,
  ];
}
