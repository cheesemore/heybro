import { LAYOUT_SCALE } from './constants';
import { GEAR_EQUIPMENT_SLOTS, type GearSlotKind } from './gearSlots';

/** 装备栏槽位在 slotsRoot 内的局部坐标（中心点） */
export function gearSlotLocalCenter(
  slotKind: GearSlotKind,
  slotNormal: number,
  slotLarge: number,
): { x: number; y: number } {
  const def = GEAR_EQUIPMENT_SLOTS.find((s) => s.kind === slotKind);
  if (!def) return { x: 0, y: 0 };

  if (def.large) {
    const rowGap = Math.round(28 * LAYOUT_SCALE);
    const rowStep = slotNormal + rowGap;
    const largeRowY = 3 * rowStep + Math.round(14 * LAYOUT_SCALE);
    const largeGap = Math.round(36 * LAYOUT_SCALE);
    const pairW = slotLarge * 2 + largeGap;
    const x =
      slotKind === 'mainHand'
        ? -pairW / 2 + slotLarge / 2
        : pairW / 2 - slotLarge / 2;
    return { x, y: largeRowY };
  }

  const gridSlots = GEAR_EQUIPMENT_SLOTS.filter((s) => !s.large);
  const idx = gridSlots.findIndex((s) => s.kind === slotKind);
  const colGap = Math.round(18 * LAYOUT_SCALE);
  const rowGap = Math.round(28 * LAYOUT_SCALE);
  const colStep = slotNormal + colGap;
  const rowStep = slotNormal + rowGap;
  const gridW = 4 * colStep - colGap;
  const startX = -gridW / 2 + slotNormal / 2;
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  return { x: startX + col * colStep, y: row * rowStep };
}
