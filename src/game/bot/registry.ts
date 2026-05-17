export type BotScreenKind =
  | 'none'
  | 'chapterSelect'
  | 'strengthen'
  | 'gearFarm'
  | 'levelMap'
  | 'draft'
  | 'strategyPick'
  | 'battle'
  | 'settlement';

export type ChapterSelectBotApi = {
  enterChapter(): void;
  openStrengthen(): void;
  openGearFarm(): void;
};

export type StrengthenBotApi = {
  /** 战法牧品质优先自动上阵；有变更返回 true */
  tryAutoDeployHeroes(): boolean;
  tryRecruitTen(): boolean;
  tryRecruitOne(): boolean;
  tryUpgradeOnce(): boolean;
  back(): void;
};

export type GearFarmBotApi = {
  farmOnce(): boolean;
  back(): void;
};

export type LevelMapBotApi = {
  canEnterRound(): boolean;
  enterRound(): void;
  getCurrentRoundIndex(): number;
};

export type DraftBotApi = {
  hasBoardUnit(): boolean;
  /** 当前三张中是否还能选（含免费首抽） */
  canPickMore(): boolean;
  /** 已无法再选且满足开战前置 */
  isReadyForBattle(): boolean;
  /** 按战/法/牧优先、尽量花金选 1 张；成功返回 true */
  tryPick(): boolean;
  /** 满足开战条件时进入战斗/下一流程，仅应调用一次 */
  tryStartBattle(): boolean;
  /** 开战超时后重置提交状态 */
  resetSubmit(): void;
};

export type StrategyPickBotApi = {
  pick(index: number): void;
};

export type SettlementBotApi = {
  continue(): void;
};

type Registered = {
  kind: BotScreenKind;
  chapterSelect?: ChapterSelectBotApi;
  strengthen?: StrengthenBotApi;
  gearFarm?: GearFarmBotApi;
  levelMap?: LevelMapBotApi;
  draft?: DraftBotApi;
  strategyPick?: StrategyPickBotApi;
  settlement?: SettlementBotApi;
};

let current: Registered | null = null;

export function botRegisterScreen(reg: Registered): void {
  current = reg;
}

export function botUnregisterScreen(kind: BotScreenKind): void {
  if (current?.kind === kind) current = null;
}

export function botCurrentScreen(): Registered | null {
  return current;
}
