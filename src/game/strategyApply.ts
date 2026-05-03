import { ALLY_CLASSES, BOARD_CELL_MAX_STACKS, ROGUE_PICK_AFTER_FIRST_COST, ROGUE_REFRESH_TRIO_COST } from './constants';
import { stacksOnBoard } from './battleBonds';
import { applyPick } from './draftLogic';
import type { RunState } from './runState';
import { ALLY_DEFS } from './unitDefs';
import type { AllyClass } from './types';
import type { ArtifactKind, StrategyC1Id, StrategyC2Id, StrategyC3Id } from './strategyTypes';

export const STRATEGY_POOL_C1: StrategyC1Id[] = [
  'c1_warrior_first',
  'c1_mage_first',
  'c1_priest_first',
  'c1_archer_first',
  'c1_knight_first',
  'c1_yuebao',
  'c1_random_deploy',
  'c1_head_start',
  'c1_lie_flat',
];

export const STRATEGY_POOL_C2: StrategyC2Id[] = [
  'c2_super_warrior',
  'c2_super_mage',
  'c2_super_priest',
  'c2_super_archer',
  'c2_super_knight',
  'c2_holy_grail',
  'c2_shelter',
  'c2_cross_star',
  'c2_time_master',
];

export const STRATEGY_POOL_C3: StrategyC3Id[] = [
  'c3_turn_tide',
  'c3_desperate',
  'c3_random_enhance',
  'c3_revenge_spirit',
  'c3_demon_contract',
  'c3_boss_hunter',
  'c3_super_double',
  'c3_glass_cannon',
  'c3_chaotic',
];

export type StrategyPickOption = { id: string; title: string; desc: string };

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

export function pickThreeStrategies(chapter: 1 | 2 | 3): StrategyPickOption[] {
  if (chapter === 1) {
    const pool = [...STRATEGY_POOL_C1];
    shuffleInPlace(pool);
    return pool.slice(0, 3).map((id) => strategyOptionMeta(id));
  }
  if (chapter === 2) {
    const pool = [...STRATEGY_POOL_C2];
    shuffleInPlace(pool);
    return pool.slice(0, 3).map((id) => strategyOptionMeta(id));
  }
  const pool = [...STRATEGY_POOL_C3];
  shuffleInPlace(pool);
  return pool.slice(0, 3).map((id) => strategyOptionMeta(id));
}

function strategyOptionMeta(id: string): StrategyPickOption {
  const m = STRATEGY_DESCRIPTIONS[id];
  if (!m) return { id, title: id, desc: '' };
  return { id, title: m.title, desc: m.desc };
}

/** 策略卡标题与说明（抉择界面与备战/战斗内「策略」页共用） */
export const STRATEGY_DESCRIPTIONS: Record<string, { title: string; desc: string }> = {
  c1_warrior_first: {
    title: '战士优先',
    desc: '立刻获得 1 名战士；本局选战士牌费用 -2 金。',
  },
  c1_mage_first: {
    title: '法师优先',
    desc: '立刻获得 1 名法师；本局选法师牌费用 -2 金。',
  },
  c1_priest_first: {
    title: '牧师优先',
    desc: '立刻获得 1 名牧师；本局选牧师牌费用 -2 金。',
  },
  c1_archer_first: {
    title: '射手优先',
    desc: '立刻获得 1 名射手；本局选射手牌费用 -2 金。',
  },
  c1_knight_first: {
    title: '骑士优先',
    desc: '立刻获得 1 名骑士；本局选骑士牌费用 -2 金。',
  },
  c1_yuebao: {
    title: '余额宝',
    desc: '本局计息按 80 金封顶，单回合利息最多 8；立刻 +5 金。',
  },
  c1_random_deploy: {
    title: '随机部署',
    desc: '立刻随机获得 3 个不同兵种各 1 层。',
  },
  c1_head_start: {
    title: '占尽先机',
    desc: '立刻 +10 金；本局每次战斗胜利额外 +1 金（结算时）。',
  },
  c1_lie_flat: {
    title: '躺平',
    desc: '失去 30 生命；本局战斗失败时额外 +3 金（结算时）。',
  },
  c2_super_warrior: {
    title: '超级战士',
    desc: '本局战士受到敌方伤害时由存活战士均摊。',
  },
  c2_super_mage: {
    title: '超级法师',
    desc: '本局法师 30% 暴击（150% 伤害）；流星雨可暴击。',
  },
  c2_super_priest: {
    title: '超级牧师',
    desc: '场上存在非牧师我方时，牧师受敌方伤害 -50%。',
  },
  c2_super_archer: {
    title: '超级射手',
    desc: '本局射手 20% 暴击，暴击伤害 200%。',
  },
  c2_super_knight: {
    title: '超级骑士',
    desc: '本局骑士对首领造成双倍伤害。',
  },
  c2_holy_grail: {
    title: '圣杯',
    desc: '肉鸽界面获得可拖动的圣杯：其上方格子的单位入场 +20% 暴击率。',
  },
  c2_shelter: {
    title: '庇护衣',
    desc: '肉鸽界面获得可拖动的庇护衣：其下方格子的单位入场 +50% 生命。',
  },
  c2_cross_star: {
    title: '十字星',
    desc: '肉鸽界面获得可拖动的十字星：上下左右格子的单位入场 +20% 攻击。',
  },
  c2_time_master: {
    title: '时间管理大师',
    desc: '本局战斗时间上限 +30 秒。',
  },
  c3_turn_tide: {
    title: '扭转乾坤',
    desc: '恢复 50 生命并获得 30 金。',
  },
  c3_desperate: {
    title: '破釜沉舟',
    desc: '生命变为 1，获得等同于本次损失生命数的金币。',
  },
  c3_random_enhance: {
    title: '随机强化',
    desc: '立刻随机获得 5 个不同兵种各 1 层。',
  },
  c3_revenge_spirit: {
    title: '复仇之魂',
    desc: '肉鸽界面获得可拖动的复仇之魂：相邻我方入场损失 20% 生命；每链接一格，敌方全体再损失 10% 当前生命（最多 4 次链接）。',
  },
  c3_demon_contract: {
    title: '恶魔契约',
    desc: '之后每次从地图进入回合：若生命>10 则 -10 生命 +20 金；否则降至 1 且无金。',
  },
  c3_boss_hunter: {
    title: '首领特攻',
    desc: '对 3-8 首领造成伤害 +30%。',
  },
  c3_super_double: {
    title: '超级加倍',
    desc: '随机一个有兵的格子，该格兵种层数 ×2。',
  },
  c3_glass_cannon: {
    title: '玻璃大炮',
    desc: '本局我方造成伤害 +40%，受到伤害 +20%。',
  },
  c3_chaotic: {
    title: '绝命乱斗',
    desc: '本局敌我登场位置随机；我方额外 +20% 暴击率。',
  },
};

/** 神器与兵种各占一格：仅「无兵且无神器」的格子可自动放入新神器 */
function firstSlotFreeForArtifact(run: RunState): number {
  for (let i = 0; i < 9; i++) {
    if (run.board[i] === null && run.artifactBySlot[i] === null) return i;
  }
  return -1;
}

function placeArtifact(run: RunState, kind: ArtifactKind): void {
  const i = firstSlotFreeForArtifact(run);
  if (i < 0) return;
  run.artifactBySlot[i] = kind;
}

function randomIntInclusive(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function randomDistinctClasses(n: number): AllyClass[] {
  const pool = [...ALLY_CLASSES];
  shuffleInPlace(pool);
  return pool.slice(0, Math.min(n, pool.length));
}

/** 应用抉择并返回展示用摘要行 */
export function applyChosenStrategy(id: string, run: RunState): string[] {
  const lines: string[] = [];
  switch (id as StrategyC1Id | StrategyC2Id | StrategyC3Id) {
    case 'c1_warrior_first':
      applyPick(run.board, run.artifactBySlot, 'warrior');
      run.allyPickDiscountGold.warrior = (run.allyPickDiscountGold.warrior ?? 0) + 2;
      lines.push('已获得战士，战士选牌 -2 金');
      break;
    case 'c1_mage_first':
      applyPick(run.board, run.artifactBySlot, 'mage');
      run.allyPickDiscountGold.mage = (run.allyPickDiscountGold.mage ?? 0) + 2;
      lines.push('已获得法师，法师选牌 -2 金');
      break;
    case 'c1_priest_first':
      applyPick(run.board, run.artifactBySlot, 'priest');
      run.allyPickDiscountGold.priest = (run.allyPickDiscountGold.priest ?? 0) + 2;
      lines.push('已获得牧师，牧师选牌 -2 金');
      break;
    case 'c1_archer_first':
      applyPick(run.board, run.artifactBySlot, 'archer');
      run.allyPickDiscountGold.archer = (run.allyPickDiscountGold.archer ?? 0) + 2;
      lines.push('已获得射手，射手选牌 -2 金');
      break;
    case 'c1_knight_first':
      applyPick(run.board, run.artifactBySlot, 'knight');
      run.allyPickDiscountGold.knight = (run.allyPickDiscountGold.knight ?? 0) + 2;
      lines.push('已获得骑士，骑士选牌 -2 金');
      break;
    case 'c1_yuebao':
      run.interestBankCapOverride = 80;
      run.interestMaxGoldOverride = 8;
      run.gold += 5;
      lines.push('余额宝：计息上限已提升，+5 金');
      break;
    case 'c1_random_deploy':
      for (const k of randomDistinctClasses(3)) {
        applyPick(run.board, run.artifactBySlot, k);
        lines.push(`部署 ${ALLY_DEFS[k].name}`);
      }
      break;
    case 'c1_head_start':
      run.gold += 10;
      run.extraGoldOnBattleWin += 1;
      lines.push('占尽先机：+10 金，战斗胜利额外收入已启用');
      break;
    case 'c1_lie_flat':
      run.playerHp -= 30;
      run.extraGoldOnBattleLoss += 3;
      lines.push(`躺平：-30 生命（当前 ${run.playerHp}），失败额外金币已启用`);
      break;

    case 'c2_super_warrior':
      run.warriorDamageShare = true;
      lines.push('超级战士：生命共享已启用');
      break;
    case 'c2_super_mage':
      run.mageCritChance = 0.3;
      run.mageMeteorCrits = true;
      lines.push('超级法师：暴击与流星雨暴击已启用');
      break;
    case 'c2_super_priest':
      run.priestAllyProtection = true;
      lines.push('超级牧师：护阵已启用');
      break;
    case 'c2_super_archer':
      run.archerCritChance = 0.2;
      run.archerCritDamageMult = 2;
      lines.push('超级射手：暴击已启用');
      break;
    case 'c2_super_knight':
      run.knightVsBossDamageMult = 2;
      lines.push('超级骑士：对首领双倍伤害');
      break;
    case 'c2_holy_grail':
      placeArtifact(run, 'holy_grail');
      lines.push('已获得圣杯（备战区可拖动调整格子）');
      break;
    case 'c2_shelter':
      placeArtifact(run, 'shelter');
      lines.push('已获得庇护衣');
      break;
    case 'c2_cross_star':
      placeArtifact(run, 'cross_star');
      lines.push('已获得十字星');
      break;
    case 'c2_time_master':
      run.battleTimeBonusSec += 30;
      lines.push('时间管理大师：战斗时间 +30 秒');
      break;

    case 'c3_turn_tide':
      run.playerHp += 50;
      run.clampPlayerHpToMax();
      run.gold += 30;
      lines.push(`扭转乾坤：+50 生命（不超过上限，当前 ${run.playerHp}），+30 金`);
      break;
    case 'c3_desperate': {
      const lost = Math.max(0, run.playerHp - 1);
      run.playerHp = 1;
      run.gold += lost;
      lines.push(`破釜沉舟：生命置 1，获得 ${lost} 金`);
      break;
    }
    case 'c3_random_enhance':
      for (const k of randomDistinctClasses(5)) {
        applyPick(run.board, run.artifactBySlot, k);
        lines.push(`获得 ${ALLY_DEFS[k].name}`);
      }
      break;
    case 'c3_revenge_spirit':
      placeArtifact(run, 'revenge_spirit');
      lines.push('已获得复仇之魂');
      break;
    case 'c3_demon_contract':
      run.demonContract = true;
      lines.push('恶魔契约已缔结');
      break;
    case 'c3_boss_hunter':
      run.bossDamageBonusVs38 = 0.3;
      lines.push('首领特攻：对 3-8 首领 +30% 伤害');
      break;
    case 'c3_super_double': {
      const occ = run.board
        .map((c, i) => (c !== null ? i : -1))
        .filter((i): i is number => i >= 0);
      if (occ.length) {
        const pick = occ[Math.floor(Math.random() * occ.length)]!;
        const cell = run.board[pick]!;
        run.board[pick] = { kind: cell.kind, stacks: Math.min(BOARD_CELL_MAX_STACKS, cell.stacks * 2) };
        lines.push(`超级加倍：${ALLY_DEFS[cell.kind].name} 层数 ×2`);
      } else {
        lines.push('超级加倍：场上无兵，未生效');
      }
      break;
    }
    case 'c3_glass_cannon':
      run.damageDealtMultAllies *= 1.4;
      run.damageTakenMultAllies *= 1.2;
      lines.push('玻璃大炮：输出↑ 承伤↑');
      break;
    case 'c3_chaotic':
      run.chaoticBattle = true;
      run.chaoticAllyCritBonus += 0.2;
      lines.push('绝命乱斗：随机阵型与暴击已启用');
      break;
    default:
      lines.push('未知策略');
  }
  return lines;
}

/** 奖励关：按章节发金币与随机兵种 */
export function applyRewardChapter(run: RunState, chapter: 1 | 2 | 3): string[] {
  const lines: string[] = [];
  let gLo: number;
  let gHi: number;
  let uLo: number;
  let uHi: number;
  if (chapter === 1) {
    gLo = 10;
    gHi = 20;
    uLo = 1;
    uHi = 2;
  } else if (chapter === 2) {
    gLo = 20;
    gHi = 30;
    uLo = 1;
    uHi = 3;
  } else {
    gLo = 30;
    gHi = 40;
    uLo = 2;
    uHi = 4;
  }
  const g = randomIntInclusive(gLo, gHi);
  run.gold += g;
  lines.push(`奖励：+${g} 金`);
  const n = randomIntInclusive(uLo, uHi);
  for (let i = 0; i < n; i++) {
    const k = ALLY_CLASSES[Math.floor(Math.random() * ALLY_CLASSES.length)]!;
    applyPick(run.board, run.artifactBySlot, k);
    lines.push(`随机角色：${ALLY_DEFS[k].name}`);
  }
  return lines;
}

export function roguePickCostAfterFirst(run: RunState, kind: AllyClass): number {
  const d = run.allyPickDiscountGold[kind] ?? 0;
  return Math.max(0, ROGUE_PICK_AFTER_FIRST_COST - d);
}

/**
 * 肉鸽三选一：单卡金币价（首次本回合选牌为 0）。
 * 棋盘上该兵种**总层数**（所有格子相加）>10 时本卡价 ×2，>20 时再 ×2（相对折扣后底价共最高 ×4）。
 */
export function roguePickGoldCost(run: RunState, kind: AllyClass, picksThisRound: number): number {
  if (picksThisRound === 0) return 0;
  let c = roguePickCostAfterFirst(run, kind);
  const n = stacksOnBoard(run.board, kind);
  if (n > 20) c *= 4;
  else if (n > 10) c *= 2;
  return c;
}

/**
 * 刷新三选一金币：当**当前三张**里任一兵种在棋盘上总层数 >20 时，刷新价 ×2。
 */
export function rogueRefreshGoldCost(run: RunState, choices: readonly AllyClass[]): number {
  let c = ROGUE_REFRESH_TRIO_COST;
  if (choices.some((k) => stacksOnBoard(run.board, k) > 20)) c *= 2;
  return c;
}
