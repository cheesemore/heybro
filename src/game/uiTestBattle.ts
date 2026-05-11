import { ALLY_CLASSES } from './constants';
import type { RunState } from './runState';
import type { RoundMeta } from './types';

/** 仅用于开发：进入战斗后自动/按键触发复合特效，验收飘字与 FX */
export const UI_TEST_ROUND_META: RoundMeta = {
  label: 'UI技能测试',
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
