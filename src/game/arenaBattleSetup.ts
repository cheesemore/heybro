import type { ArenaLineupSnapshot } from './arenaStorage';
import type { RunState } from './runState';
import type { ArtifactKind } from './strategyTypes';
import type { BoardCell } from './types';
function cloneBoard(b: BoardCell[]): BoardCell[] {
  return b.map((c) => (c ? { kind: c.kind, stacks: c.stacks } : null));
}

function cloneArtifacts(a: (ArtifactKind | null)[]): (ArtifactKind | null)[] {
  return [...a];
}

export function cloneArenaLineup(lineup: ArenaLineupSnapshot): ArenaLineupSnapshot {
  return {
    board: cloneBoard(lineup.board),
    artifactBySlot: cloneArtifacts(lineup.artifactBySlot),
    heroDeploy: [...lineup.heroDeploy],
  };
}

export type ArenaPvpBattleOpts = {
  defenderLineup?: ArenaLineupSnapshot;
  battleSeed: number;
  mirrorTest?: boolean;
};

/** 将进攻方锁定阵容写入 RunState，并挂上竞技场 PvP 规则 */
export function applyArenaPvpBattleToRun(
  run: RunState,
  attackerLineup: ArenaLineupSnapshot,
  opts: ArenaPvpBattleOpts,
): void {
  run.board = cloneBoard(attackerLineup.board);
  run.artifactBySlot = cloneArtifacts(attackerLineup.artifactBySlot);
  const defender = cloneArenaLineup(opts.defenderLineup ?? attackerLineup);
  run.arenaBattleRules = {
    heroDeploy: [...attackerLineup.heroDeploy],
    defenderLineup: defender,
    battleSeed: opts.battleSeed,
    mirrorTest: opts.mirrorTest === true,
  };
  run.devBattleHooks = undefined;
}
