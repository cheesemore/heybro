import type { HeroId } from './heroRegistry';
import { roundsForBookChapter } from './roundConfig';
import type { RunState } from './runState';
import type { RoundMeta } from './types';

/** 开发：UI 测试战斗上阵 — mage_02 / priest_02 / knight_01（紫法/紫牧 + 蓝骑；签名技能 + 对应被动） */
export const UI_TEST_BLUE_FPM_HERO_DEPLOY: readonly [HeroId, HeroId, HeroId] = [
  'mage_02',
  'priest_02',
  'knight_01',
];

/** 与 `UI_TEST_ROUND_META` 一致：怒焰裂谷第 4 关关底（用于 `resolveWowBookBossCombat`） */
export const UI_TEST_BOOK_CHAPTER_ID = 4;

/** 仅用于开发：首领为书本第 4 章「巴扎兰」（群体暗影箭 / 群体精神鞭笞 / 暗影闪现）；羁绊层数由 `devBattleHooks` 注入 */
export const UI_TEST_ROUND_META: RoundMeta = {
  label:
    '开发：怒焰裂谷第4关首领「巴扎兰」· 群体暗影箭/精神鞭笞/暗影闪现 + 紫法/紫牧/蓝骑 · 法/牧/骑羁绊=21 · 控制台 [HeyBro/ui-test]',
  chapter: 3,
  sub: 6,
  kind: 'boss',
  enemies: [{ type: 'boss', count: 1, bossId: 'white', wowBossDisplayName: '巴扎兰' }],
  uiTestBattle: true,
};

/** 棋盘仅 3 个非英雄（牧/法/弓 格位与原先法/牧对调，便于测庇护落点） */
export function seedUiTestRunBoard(run: RunState): void {
  run.resetRun();
  run.bookChapterId = UI_TEST_BOOK_CHAPTER_ID;
  const rounds = roundsForBookChapter(UI_TEST_BOOK_CHAPTER_ID);
  run.currentRoundIndex = Math.max(0, rounds.length - 1);
  run.board = [
    { kind: 'priest', stacks: 1 },
    { kind: 'mage', stacks: 1 },
    { kind: 'archer', stacks: 1 },
    null,
    null,
    null,
    null,
    null,
    null,
  ];
}
