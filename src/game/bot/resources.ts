import { ALLY_CLASSES } from '../constants';
import {
  fragmentsRequiredForNextLevel,
  getClassLevel,
  loadClassProgress,
} from '../classProgressStorage';
import {
  getCurrentChallengeChapterId,
  isRagefireChasmBookCleared,
} from '../chapterProgressStorage';
import { getGearFarmStamina } from '../gearFarmStaminaStorage';
import { getLotteryTicketsRemaining } from '../heroMetaStorage';

export type BotResources = {
  tickets: number;
  canRecruitTen: boolean;
  canRecruitOne: boolean;
  canUpgrade: boolean;
  stamina: number;
  farmUnlocked: boolean;
  challengeChapterId: number;
};

export function readBotResources(): BotResources {
  const tickets = getLotteryTicketsRemaining();
  const cur = loadClassProgress();
  let canUpgrade = false;
  for (const cls of ALLY_CLASSES) {
    const lv = getClassLevel(cls);
    const need = fragmentsRequiredForNextLevel(lv);
    if (need != null && (cur.fragments[cls] ?? 0) >= need) {
      canUpgrade = true;
      break;
    }
  }
  return {
    tickets,
    canRecruitTen: tickets >= 10,
    canRecruitOne: tickets >= 1,
    canUpgrade,
    stamina: getGearFarmStamina(),
    farmUnlocked: isRagefireChasmBookCleared(),
    challengeChapterId: getCurrentChallengeChapterId(),
  };
}

export function isMetaExhausted(r: BotResources): boolean {
  const canFarm = r.farmUnlocked && r.stamina > 0;
  return !r.canRecruitOne && !r.canUpgrade && !canFarm;
}
