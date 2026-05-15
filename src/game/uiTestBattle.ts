import { ALLY_CLASSES } from './constants';
import type { HeroId } from './heroRegistry';
import type { RunState } from './runState';
import type { RoundMeta } from './types';

/** 开发：UI 测试战斗上阵 — 蓝法师 / 蓝牧师 / 蓝弓手（签名技能 + 蓝被动） */
export const UI_TEST_BLUE_FPM_HERO_DEPLOY: readonly [HeroId, HeroId, HeroId] = [
  'mage_02',
  'priest_02',
  'archer_02',
];

/** 仅用于开发：进入战斗后自动/按键触发复合特效，验收飘字与 FX */
export const UI_TEST_ROUND_META: RoundMeta = {
  label: '开发：蓝法/蓝牧/蓝弓',
  chapter: 1,
  sub: 0,
  kind: 'normal',
  enemies: [{ type: 'grunt', count: 4 }],
  uiTestBattle: true,
};

export function seedUiTestRunBoard(run: RunState): void {
  run.resetRun();
  for (let i = 0; i < ALLY_CLASSES.length; i++) {
    run.board[i] = { kind: ALLY_CLASSES[i]!, stacks: 1 };
  }
}
