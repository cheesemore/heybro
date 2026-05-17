import type { AllyClass } from '../types';

/** Bot 选牌：战 / 法 / 牧 优先，其余次之 */
export const BOT_DRAFT_CLASS_PRIORITY: readonly AllyClass[] = [
  'warrior',
  'mage',
  'priest',
  'archer',
  'knight',
];

export function botDraftClassPriority(kind: AllyClass): number {
  const i = BOT_DRAFT_CLASS_PRIORITY.indexOf(kind);
  return i >= 0 ? i : 99;
}
