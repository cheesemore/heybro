import type { Application } from 'pixi.js';
import { Container } from 'pixi.js';
import {
  abandonArenaDraft,
  buildArenaLineupSnapshotFromRun,
  getArenaDraftProgress,
  lockArenaLineup,
  persistArenaDraft,
  startNewArenaDraft,
} from '../arenaStorage';
import { RunState } from '../runState';
import type { BoardCell } from '../types';
import type { ArtifactKind } from '../strategyTypes';
import { DraftScreen } from './DraftScreen';
import type { ModalLayer } from './ModalLayer';

function cloneBoard(b: BoardCell[]): BoardCell[] {
  return b.map((c) => (c ? { kind: c.kind, stacks: c.stacks } : null));
}

/**
 * 竞技场选阵：与章节招募 `DraftScreen` 同 UI（九宫格、英雄栏、羁绊等），
 * 底部为「返回 / 保存并锁定」；数值规则在锁定阵容时写入快照。
 */
export class ArenaDraftScreen extends Container {
  constructor(app: Application, onBack: () => void, onLocked: () => void, modal: ModalLayer) {
    super();
    const draft = getArenaDraftProgress() ?? startNewArenaDraft();
    const run = new RunState();
    run.bookChapterId = 1;
    run.gold = draft.gold;
    run.board = cloneBoard(draft.board);
    run.artifactBySlot = [...draft.artifactBySlot] as (ArtifactKind | null)[];

    let picksThisRound = draft.picksThisRound;

    const draftUi = new DraftScreen(
      app,
      run,
      () => {},
      {
        picksThisRound,
        setPicksThisRound: (n) => {
          picksThisRound = n;
        },
        onPersistDraft: (r) => {
          persistArenaDraft({
            board: cloneBoard(r.board),
            artifactBySlot: [...r.artifactBySlot],
            gold: r.gold,
            picksThisRound,
          });
        },
        onBack: () => {
          modal.confirmDestructive('未保存的选阵将丢弃，确定返回？', () => {
            abandonArenaDraft();
            onBack();
          });
        },
        onSaveLock: (r) => {
          modal.confirmDestructive('保存后阵容锁定，本轮回竞技场开始。确定？', () => {
            lockArenaLineup(buildArenaLineupSnapshotFromRun(r));
            onLocked();
          });
        },
        modal,
      },
    );
    this.addChild(draftUi);
  }
}
