import type { PlayerGearInstance } from './playerGearInstance';
import { equipPlayerGear, getEquippedGear } from './playerGearStorage';
import type { ModalLayer } from './screens/ModalLayer';

export type GearObtainSettleKind = 'keep' | 'equip' | 'replace';

/** 静默处理新装备：空槽穿上；有装备则仅当新 GS 更高时替换 */
export function autoSettlePlayerGear(newGear: PlayerGearInstance): GearObtainSettleKind {
  const current = getEquippedGear(newGear.slotKind);
  if (!current) {
    equipPlayerGear(newGear);
    return 'equip';
  }
  if (newGear.gs > current.gs) {
    equipPlayerGear(newGear);
    return 'replace';
  }
  return 'keep';
}

/** 获得新装备：空槽直接穿上，否则弹出对比 */
export function handleObtainedPlayerGear(
  newGear: PlayerGearInstance,
  modal: ModalLayer,
  onSettled: (kind: GearObtainSettleKind, gear: PlayerGearInstance) => void,
): void {
  const current = getEquippedGear(newGear.slotKind);
  if (!current) {
    equipPlayerGear(newGear);
    onSettled('equip', newGear);
    return;
  }
  modal.showGearCompare(current, newGear, {
    onKeep: () => onSettled('keep', newGear),
    onReplace: () => {
      equipPlayerGear(newGear);
      onSettled('replace', newGear);
    },
  });
}
