import { botHeroDeployNeedsSync } from './heroDeployPolicy';
import type { BotResources } from './resources';
import { isMetaExhausted } from './resources';
import type { BotScreenKind } from './registry';

export type BotPhase = 'meta' | 'push';

export type BotIntent =
  | { type: 'idle' }
  | { type: 'dismissModal' }
  | { type: 'openStrengthen' }
  | { type: 'openGearFarm' }
  | { type: 'metaAutoDeploy' }
  | { type: 'metaRecruitTen' }
  | { type: 'metaRecruitOne' }
  | { type: 'metaUpgrade' }
  | { type: 'metaFarm' }
  | { type: 'metaBack' }
  | { type: 'pushChapter' }
  | { type: 'enterRound' }
  | { type: 'draftStep' }
  | { type: 'strategyPick0' }
  | { type: 'settlementContinue' };

export function decideBotIntent(
  screen: BotScreenKind,
  r: BotResources,
  phase: BotPhase,
  modalVisible: boolean,
): BotIntent {
  if (modalVisible) return { type: 'dismissModal' };
  if (screen === 'battle') return { type: 'idle' };
  if (screen === 'settlement') return { type: 'settlementContinue' };
  /** 章节内流程与 phase 无关（避免失败后 phase=meta 时卡在选牌/地图） */
  if (screen === 'draft') return { type: 'draftStep' };
  if (screen === 'strategyPick') return { type: 'strategyPick0' };
  if (screen === 'levelMap') return { type: 'enterRound' };

  if (phase === 'meta') {
    if (screen === 'strengthen') {
      if (botHeroDeployNeedsSync()) return { type: 'metaAutoDeploy' };
      if (r.canRecruitTen) return { type: 'metaRecruitTen' };
      if (r.canRecruitOne) return { type: 'metaRecruitOne' };
      if (r.canUpgrade) return { type: 'metaUpgrade' };
      return { type: 'metaBack' };
    }
    if (screen === 'gearFarm') {
      if (r.farmUnlocked && r.stamina > 0) return { type: 'metaFarm' };
      return { type: 'metaBack' };
    }
    if (screen === 'chapterSelect') {
      if (r.canRecruitTen || r.canRecruitOne) return { type: 'openStrengthen' };
      if (r.canUpgrade) return { type: 'openStrengthen' };
      if (r.farmUnlocked && r.stamina > 0) return { type: 'openGearFarm' };
      return { type: 'pushChapter' };
    }
  }

  if (screen === 'chapterSelect') return { type: 'pushChapter' };

  return { type: 'idle' };
}

export function shouldStopAfterFailure(
  consecutiveFailures: number,
  failThreshold: number,
  r: BotResources,
): boolean {
  if (consecutiveFailures < failThreshold) return false;
  return isMetaExhausted(r);
}
