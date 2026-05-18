/** 逻辑分辨率（相对早期 720×1280 各边 +50%） */
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;

/** 与历史 720 宽布局坐标换算（当前高宽同比放大时恒为 1.5） */
export const LAYOUT_SCALE = GAME_WIDTH / 720;

export const PLAYER_START_HP = 100;
/** 玩家生命上限（完美通关 +2、策略回血等不可超过） */
export const PLAYER_MAX_HP = 100;
/** 进入选牌前不再发「回合开始」固定金，收入在回合结束时结算（见 ROUND_END_*） */
export const ROUND_START_GOLD = 0;
export const ROGUE_REFRESH_TRIO_COST = 5;
export const ROGUE_PICK_AFTER_FIRST_COST = 10;

export const INITIAL_GOLD = 20;

/** 备战单格兵种叠层上限 */
export const BOARD_CELL_MAX_STACKS = 30;

/** 每回合结束固定金币 */
export const ROUND_END_FIXED_GOLD = 10;
/** 计息时最多按持有多少金计算（每 10 金 +1 利息） */
export const INTEREST_BANK_CAP = 50;
/** 单回合利息上限（金） */
export const INTEREST_MAX_GOLD = 5;
/** 连胜额外金：每场最多给多少（与连胜场次取 min） */
export const WIN_STREAK_BONUS_CAP = 5;

export const NORMAL_BATTLE_SECONDS = 30;
export const BOSS_BATTLE_SECONDS = 60;

/** 战场单位移动速度倍率（相对配置表数值） */
export const BATTLE_MOVE_SPEED_MULT = 0.7;

/**
 * 软碰撞分离半径系数：有效碰撞半径 = hitRadiusPx × coeff（可相互叠入）。
 * 仅用于 `applyUnitCollisionSeparation`；射程 / 普攻够不着仍用完整 hitRadiusPx。
 */
export const BATTLE_COLLISION_RADIUS_COEFF = 0.85;
/** 关底首领（`SimUnit.bossId`）碰撞系数，暂固定 100% */
export const BATTLE_COLLISION_RADIUS_COEFF_BOSS = 1;
/**
 * 全局单位攻击力倍率：在 unitDefs 加载后对盟友 atk、敌方与首领 baseAtk 各乘一次，
 * 战场内不再二次缩放（避免镜像等由已有单位 atk 推导时再乘一遍）。
 */
export const GLOBAL_UNIT_ATK_MULT = 2;

export const ALLY_CLASSES = [
  'warrior',
  'mage',
  'priest',
  'archer',
  'knight',
  'warlock',
  'shaman',
  'assassin',
  'druid',
] as const;
/**
 * 普通敌方兵种（12 种）。书本关底首领见 `wowBookBosses.json`（缺省字段用 `wowBookData.WOW_BOOK_BOSS_TABLE_DEFAULT`）。
 *
 * 配表锚点：**兽人步兵 `grunt`**。各小怪在机制修正之前，宜先对齐同一「基础篇」乘积：
 * `baseMaxHp × baseAtk ÷ attackInterval`，其中 **attackInterval 即 JSON 里的 `attackSpeed` 字段**（秒/次，传入战场后映射为 `SimUnit.attackInterval`）。
 * 「有效攻击」默认取 **单次普攻 `baseAtk`**；溅射、多段、远程拉扯、控制等另算机制预算，再偏离该乘积时应有意识地加减 HP 或 atk。
 */
export const ENEMY_CLASSES = [
  'grunt',
  'dread_warrior',
  'raider',
  'beserker',
  'kodo',
  'ultralisk',
  'abomination',
  'headhunter',
  'darkspear',
  'shaman',
  'batrider',
  'catapult',
] as const;
