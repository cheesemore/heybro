import type { ALLY_CLASSES, ENEMY_CLASSES } from './constants';

export type AllyClass = (typeof ALLY_CLASSES)[number];
export type EnemyClass = (typeof ENEMY_CLASSES)[number];

export type BossId = 'farseer' | 'tauren' | 'blademaster';

export type RoundKind = 'normal' | 'strategy' | 'reward' | 'boss';

export type BoardCell = {
  kind: AllyClass;
  stacks: number;
} | null;

export type RoundMeta = {
  label: string;
  chapter: 1 | 2 | 3;
  sub: number;
  kind: RoundKind;
  /** 战斗关配置；非战斗关为空 */
  enemies: Array<{ type: EnemyClass | 'boss'; count: number; bossId?: BossId }>;
};

export type BattleOutcome = {
  /** 全歼敌方且我方无任何单位阵亡时为 true（仅此结算 +2 玩家生命，且受生命上限） */
  perfect: boolean;
  /** 0..1 敌方剩余总血量比例（相对战斗开始时敌方总血量） */
  enemyHpRatioRemaining: number;
  elapsed: number;
};
