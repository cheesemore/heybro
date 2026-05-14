import { ROGUE_PICK_AFTER_FIRST_COST, ROGUE_REFRESH_TRIO_COST } from './constants';

/** 招募情报「规则」页：定价与备战说明（与旧版「定价细则」弹层一致） */
export const RECRUIT_RULES_OVERLAY_BODY = [
  `之后每次选牌基础 ${ROGUE_PICK_AFTER_FIRST_COST} 金/张（有折扣的兵种更低）。`,
  `棋盘上该兵种总层数 >10 时本张价格 ×2，>20 再 ×2；若当前三张里某兵种总层数 >20，刷新三选一（基础 ${ROGUE_REFRESH_TRIO_COST} 金）价格也 ×2。`,
  `卡面与按钮均为实价。`,
  '',
  '备战九宫：兵种与神器各占一格、不可重叠；点按有内容的格并拖到另一格，可与另一格整体交换（含神器，影响战斗内加成位置）。',
].join('\n');
