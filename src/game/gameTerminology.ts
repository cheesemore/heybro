/**
 * 玩家可见中文用语（与代码字段对照）：
 * - **副本**：WoW 地下城整本（怒焰裂谷、死亡矿井…，`dungeonId`）
 * - **关**：线性推进的一册可玩内容（原书本章节，`chapterIndex` / `stageNameCn`）
 * - **节点**：单关内一步战斗，标签形如 `3-5`（`RoundMeta.label`）
 */
export const GAME_TERM_ZH = {
  farmDungeonButton: '副本刷装',
  enterStage: '进入本关',
  stageSelect: '选关',
  stageIntel: '关卡情报',
  stageCleared: '关卡通关',
  returnStageSelect: '返回选关',
  allStagesCleared: '全关已通关 · 可重复挑战',
  currentStageMobPool: '本关敌种池',
  nodeBossLabel: (label: string) => `节点 ${label}`,
  nodePreviewTitle: (label: string, kind: 'boss' | 'normal') =>
    `节点 ${label}（${kind === 'boss' ? '首领战' : '普通战斗'}）`,
  draftFirstCardFreeHint: '每一节点开始前首次卡牌免费',
  mapNodeStrategyHead: (label: string) => `节点 ${label}：策略抉择`,
  mapNodeRewardHead: (label: string) => `节点 ${label}：关末奖励`,
  mapNodeEnemyIntelHead: (label: string, boss: boolean) =>
    `节点 ${label}：${boss ? '首领战' : '普通战斗'} · 敌方情报`,
} as const;
