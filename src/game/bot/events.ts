import type { ChapterRunSettlementKind } from '../screens/ChapterRunSettlementScreen';

type OutcomeListener = (kind: ChapterRunSettlementKind, chapterId: number) => void;
type AfterDraftHandler = (force?: boolean) => void;

let listener: OutcomeListener | null = null;
let afterDraftHandler: AfterDraftHandler | null = null;

export function setBotChapterOutcomeListener(fn: OutcomeListener | null): void {
  listener = fn;
}

export function notifyBotChapterOutcome(kind: ChapterRunSettlementKind, chapterId: number): void {
  listener?.(kind, chapterId);
}

export function setBotAfterDraftHandler(fn: AfterDraftHandler | null): void {
  afterDraftHandler = fn;
}

/** 选牌结束后进入战斗（force 时清除 inFlight 并强制重试） */
export function botRequestEnterBattleAfterDraft(force?: boolean): void {
  afterDraftHandler?.(force);
}
