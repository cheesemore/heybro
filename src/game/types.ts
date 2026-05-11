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
  /** 开发：复合特效测试战（封面 DEV 入口），不影响正式关卡表 */
  uiTestBattle?: boolean;
};

export type BattleOutcome = {
  /** 全歼敌方（敌方总血量视为 0）时为 true，与己方是否阵亡无关；用于连胜与战后 +2 生命 */
  perfect: boolean;
  /** 0..1 敌方剩余总血量比例（相对战斗开始时敌方总血量） */
  enemyHpRatioRemaining: number;
  elapsed: number;
};
