import { roundsForBookChapter } from '../roundConfig';
import type { RunState } from '../runState';
import type { BotPhase } from './policy';
import type { BotScreenKind } from './registry';

export type BotStallContext = {
  screen: BotScreenKind;
  phase: BotPhase;
  modalVisible: boolean;
  mapNodeEntered: boolean;
  draftBattleStarted: boolean;
  run: RunState;
};

export function formatBotStallSnapshot(ctx: BotStallContext): string {
  const { run } = ctx;
  const rounds = roundsForBookChapter(run.bookChapterId);
  const idx = run.currentRoundIndex;
  const meta = rounds[idx];
  const parts = [
    `[非战斗卡住≥5s] 界面=${ctx.screen}`,
    `phase=${ctx.phase}`,
    `弹窗=${ctx.modalVisible ? '是' : '否'}`,
    `章=${run.bookChapterId}`,
    `节点=${idx + 1}/${rounds.length}`,
    meta?.label ?? '无节点',
    meta?.kind ? `类型=${meta.kind}` : '',
    `HP=${run.playerHp}`,
    `金=${run.gold}`,
    `地图已点进入=${ctx.mapNodeEntered}`,
    `选牌已提交=${ctx.draftBattleStarted}`,
    `可进节点=${idx < rounds.length && !run.isGameLost()}`,
  ];
  return parts.filter(Boolean).join(' | ');
}
