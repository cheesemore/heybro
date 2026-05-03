import type { AllyClass, BattleOutcome, BoardCell, RoundMeta } from './types';
import type { ArtifactKind } from './strategyTypes';
import {
  INITIAL_GOLD,
  INTEREST_BANK_CAP,
  INTEREST_MAX_GOLD,
  PLAYER_MAX_HP,
  PLAYER_START_HP,
  ROUND_END_FIXED_GOLD,
  WIN_STREAK_BONUS_CAP,
} from './constants';
import { ROUNDS } from './roundConfig';

export class RunState {
  playerHp = PLAYER_START_HP;
  gold = INITIAL_GOLD;
  currentRoundIndex = 0;
  board: BoardCell[] = Array.from({ length: 9 }, () => null);
  /** 仅普通战/首领战后完美通关累加；抉择/奖励不关不断 */
  winStreak = 0;

  /** 肉鸽选牌：指定兵种每次选牌费用减少（金） */
  allyPickDiscountGold: Partial<Record<AllyClass, number>> = {};
  /** 余额宝：计息持有金上限与单回合利息上限 */
  interestBankCapOverride: number | null = null;
  interestMaxGoldOverride: number | null = null;
  /** 占尽先机：战斗胜利（清敌）额外金币 */
  extraGoldOnBattleWin = 0;
  /** 躺平：战斗失败（我方全灭或超时）额外金币 */
  extraGoldOnBattleLoss = 0;

  warriorDamageShare = false;
  mageCritChance = 0;
  mageMeteorCrits = false;
  priestAllyProtection = false;
  archerCritChance = 0;
  /** 暴击时相对原伤害倍率（如 1.5 / 2） */
  archerCritDamageMult = 1.5;
  knightVsBossDamageMult = 1;

  /** 肉鸽九宫神器槽（与 board 同索引一格仅能有其一：无兵且无神器才为空） */
  artifactBySlot: (ArtifactKind | null)[] = Array.from({ length: 9 }, () => null);

  battleTimeBonusSec = 0;

  demonContract = false;
  /** 3-3 首领特攻：对 3-8 首领造成伤害提升 */
  bossDamageBonusVs38 = 0;

  damageDealtMultAllies = 1;
  damageTakenMultAllies = 1;

  chaoticBattle = false;
  /** 绝命乱斗：我方全局额外暴击率 */
  chaoticAllyCritBonus = 0;

  /** 已在 1-3 / 2-3 / 3-3 抉择的策略（用于备战与战斗内查看原文） */
  strategyPicks: { id: string; title: string; desc: string }[] = [];

  resetRun(): void {
    this.playerHp = PLAYER_START_HP;
    this.gold = INITIAL_GOLD;
    this.currentRoundIndex = 0;
    this.board = Array.from({ length: 9 }, () => null);
    this.winStreak = 0;
    this.allyPickDiscountGold = {};
    this.interestBankCapOverride = null;
    this.interestMaxGoldOverride = null;
    this.extraGoldOnBattleWin = 0;
    this.extraGoldOnBattleLoss = 0;
    this.warriorDamageShare = false;
    this.mageCritChance = 0;
    this.mageMeteorCrits = false;
    this.priestAllyProtection = false;
    this.archerCritChance = 0;
    this.archerCritDamageMult = 1.5;
    this.knightVsBossDamageMult = 1;
    this.artifactBySlot = Array.from({ length: 9 }, () => null);
    this.battleTimeBonusSec = 0;
    this.demonContract = false;
    this.bossDamageBonusVs38 = 0;
    this.damageDealtMultAllies = 1;
    this.damageTakenMultAllies = 1;
    this.chaoticBattle = false;
    this.chaoticAllyCritBonus = 0;
    this.strategyPicks = [];
  }

  /** 恶魔契约：进入任意回合（从地图点「进入」）时触发 */
  applyDemonContractRoundStart(): string[] {
    if (!this.demonContract) return [];
    const lines: string[] = [];
    if (this.playerHp > 10) {
      this.playerHp -= 10;
      this.gold += 20;
      lines.push('恶魔契约：失去 10 生命，获得 20 金');
    } else if (this.playerHp > 1) {
      this.playerHp = 1;
      lines.push('恶魔契约：生命不足 10，降至 1，本次无金币');
    }
    return lines;
  }

  beginRoundEconomy(): void {
    /* 回合收入在回合结束时统一结算 */
  }

  /**
   * 回合结束发钱：利息（持有金每 10 块 +1，仅统计前 50 块，利息最多 5）+ 固定回合结束金；
   * 若本关为普通战或首领且战斗完美通关，连胜+1 并按连胜场次给钱（单场最多 5）。
   * 抉择/奖励：只发利息与固定金，不改连胜。
   */
  grantRoundEndEconomy(meta: RoundMeta, battleOutcome: BattleOutcome | null): string[] {
    const lines: string[] = [];
    const g0 = this.gold;
    const bankCap = this.interestBankCapOverride ?? INTEREST_BANK_CAP;
    const intCap = this.interestMaxGoldOverride ?? INTEREST_MAX_GOLD;
    const interestBase = Math.min(g0, bankCap);
    const interest = Math.min(intCap, Math.floor(interestBase / 10));
    this.gold += interest;
    lines.push(`利息 +${interest} 金（持有 ${g0} 金，计息封顶 ${bankCap}，利息上限 ${intCap}）`);

    this.gold += ROUND_END_FIXED_GOLD;
    lines.push(`回合结束 +${ROUND_END_FIXED_GOLD} 金`);

    const isCombat = meta.kind === 'normal' || meta.kind === 'boss';
    if (isCombat && battleOutcome) {
      const cleared = battleOutcome.enemyHpRatioRemaining <= 0.0001;
      if (cleared && this.extraGoldOnBattleWin > 0) {
        this.gold += this.extraGoldOnBattleWin;
        lines.push(`策略加成：战斗胜利额外 +${this.extraGoldOnBattleWin} 金`);
      }
      if (!cleared && this.extraGoldOnBattleLoss > 0) {
        this.gold += this.extraGoldOnBattleLoss;
        lines.push(`策略加成：战斗失败额外 +${this.extraGoldOnBattleLoss} 金`);
      }
      if (battleOutcome.perfect) {
        this.winStreak += 1;
        const bonus = Math.min(this.winStreak, WIN_STREAK_BONUS_CAP);
        this.gold += bonus;
        lines.push(`战斗完美通关 · 连胜 ${this.winStreak}，额外 +${bonus} 金（本场封顶 ${WIN_STREAK_BONUS_CAP}）`);
      } else {
        lines.push(`未完美通关：无连胜奖励，连胜保持为 ${this.winStreak}（仅在普通战/首领完美通关时累加与发钱）`);
      }
    }

    lines.push(`当前金币：${this.gold}`);
    return lines;
  }

  clearBoard(): void {
    this.board = Array.from({ length: 9 }, () => null);
  }

  isGameWon(): boolean {
    return this.currentRoundIndex >= ROUNDS.length && this.playerHp > 0;
  }

  isGameLost(): boolean {
    return this.playerHp <= 0;
  }

  /** 将玩家生命限制在 [0, PLAYER_MAX_HP]（回血类效果后调用） */
  clampPlayerHpToMax(): void {
    if (this.playerHp > PLAYER_MAX_HP) this.playerHp = PLAYER_MAX_HP;
  }
}
