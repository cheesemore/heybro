/** 加属性装备槽种类（重复槽位各算一种，共 14 种） */
export type GearSlotKind =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'chest'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'wrist'
  | 'hands'
  | 'finger'
  | 'trinket'
  | 'back'
  | 'mainHand'
  | 'offHand';

export type GearSlotDef = {
  kind: GearSlotKind;
  labelCn: string;
  /** 部位编号（1～14，与 `GEAR_EQUIPMENT_SLOTS` 顺序一致） */
  slotNo: number;
  /** 刷副本界面：主手、饰品槽加大展示 */
  large?: boolean;
};

/** 展示顺序与常见角色面板一致 */
export const GEAR_EQUIPMENT_SLOTS: readonly GearSlotDef[] = [
  { kind: 'head', labelCn: '头部', slotNo: 1 },
  { kind: 'neck', labelCn: '颈部', slotNo: 2 },
  { kind: 'shoulder', labelCn: '肩部', slotNo: 3 },
  { kind: 'chest', labelCn: '胸部', slotNo: 4 },
  { kind: 'waist', labelCn: '腰部', slotNo: 5 },
  { kind: 'legs', labelCn: '腿部', slotNo: 6 },
  { kind: 'feet', labelCn: '脚部', slotNo: 7 },
  { kind: 'wrist', labelCn: '手腕', slotNo: 8 },
  { kind: 'hands', labelCn: '手部', slotNo: 9 },
  { kind: 'finger', labelCn: '手指', slotNo: 10 },
  { kind: 'trinket', labelCn: '饰品', slotNo: 11, large: true },
  { kind: 'back', labelCn: '背部', slotNo: 12 },
  { kind: 'mainHand', labelCn: '主手', slotNo: 13, large: true },
  { kind: 'offHand', labelCn: '副手', slotNo: 14 },
] as const;

export const GEAR_SLOT_NO_BY_KIND: Record<GearSlotKind, number> = Object.fromEntries(
  GEAR_EQUIPMENT_SLOTS.map((s) => [s.kind, s.slotNo]),
) as Record<GearSlotKind, number>;

export function gearSlotNoForKind(kind: GearSlotKind): number {
  return GEAR_SLOT_NO_BY_KIND[kind];
}

