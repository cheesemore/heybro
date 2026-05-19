import { clearPersistedAllyClassUnlockCelebration } from './allyClassUnlockCelebration';
import { clearPersistedChapterProgress } from './chapterProgressStorage';
import { clearPersistedClassProgress } from './classProgressStorage';
import { clearPersistedGearFarmStamina } from './gearFarmStaminaStorage';
import { clearPersistedPlayerGear } from './playerGearStorage';
import { clearPersistedArena } from './arenaStorage';
import { clearPersistedHeroMeta } from './heroMetaStorage';

/** 清除与本游戏相关的全部 `localStorage` 存档键；各模块下次读取时按默认新机逻辑生效。 */
export function clearAllLocalGameSaveData(): void {
  clearPersistedHeroMeta();
  clearPersistedAllyClassUnlockCelebration();
  clearPersistedChapterProgress();
  clearPersistedClassProgress();
  clearPersistedGearFarmStamina();
  clearPersistedPlayerGear();
  clearPersistedArena();
}
