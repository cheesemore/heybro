import type { ArenaLineupSnapshot } from './arenaStorage';
import type { AllyClass, BattleOutcome, BoardCell, RoundMeta } from './types';
import type { ArtifactKind } from './strategyTypes';
import type { HeroId } from './heroRegistry';
import { bookChapterStrengthPercent } from './bookChapterConfig';
import {
  INITIAL_GOLD,
  INTEREST_BANK_CAP,
  INTEREST_MAX_GOLD,
  PLAYER_MAX_HP,
  PLAYER_START_HP,
  ROUND_END_FIXED_GOLD,
  WIN_STREAK_BONUS_CAP,
} from './constants';
import { roundsForBookChapter } from './roundConfig';

/** 预留外部永久养成入口：默认 1，不参与首领「生命转最终加成」逻辑 */
export type ExternalGrowthSnapshot = {
  /** 永久伤害乘区（与关卡内加成叠乘） */
  permanentDamageMult: number;
  /** 永久生命乘区 */
  permanentMaxHpMult: number;
};

/**
 * 仅开发/独立测试页注入：正式流程不赋值。删除测试入口时可连同字段与 BattleScreen 内读取处一并移除。
 */
export type RunDevBattleHooks = {
  heroDeploy: readonly (HeroId | null)[];
  /** 本场可读上阵栏位数（用于跳过章节解锁限制） */
  heroSlotCap: number;
  /** 全部单位生成并分离后，将 maxHp/hp 乘此值（如 10 = 1000%） */
  postSpawnHpMult: number;
  /** 为 true 时跳过带 `bossId` 的单位（仅乘我方/小怪等，便于测首领按生命百分比触发的被动） */
  postSpawnHpMultSkipBoss?: boolean;
  /** 仅对带 `bossId` 的单位再乘一次生命（在 `postSpawnHpMult` 之后应用，如 3 = 首领血量×3） */
  postSpawnBossHpMult?: number;
  /**
   * 本场羁绊层数覆盖（与棋盘 `stacks` 无关，不增加按层出兵数）。
   * 仅合并写入的兵种；未写的兵种仍用 `allBondStacks(board)`。
   */
  bondStacksBattleOverride?: Partial<Record<AllyClass, number>>;
  /** 本场战斗装备 GS（缺省读穿戴合计）；平衡性测试可设为 0 */
  gearGsBattleOverride?: number;
  /** 战斗逻辑时间倍率（仅平衡/自动化测试页，加快二分扫描） */
  battleTimeScale?: number;
  /** 胜负已定后的停留秒数；测试页可设为 0.15 */
  battleFinishPostDelaySec?: number;
};

export class RunState {
  playerHp = PLAYER_START_HP;
  gold = INITIAL_GOLD;
  currentRoundIndex = 0;
  board: BoardCell[] = Array.from({ length: 9 }, () => null);
  /** 仅普通战/首领战后战斗胜利（敌方全灭）累加；抉择/奖励不关不断 */
  winStreak = 0;

  /** 外部章节 1..30：在章节选择界面确定，重置单章进度时保留 */
  bookChapterId = 1;
  /**
   * 本次进入本章前，章节选择页的「返回」语义：true=返回关卡地图；false=回封面。
   * 在 `GameRoot.showChapterSelect` 选章进入地图时写入；结算回到选择页时沿用。
   */
  chapterSelectBackToMap = false;
  /** 预留：扩展规则导致的本章失败（与生命耗尽并列）；当前流程以生命耗尽为主 */
  bookChapterRunFailed = false;

  /** 首领战：由进入首领关时的生命换算的额外乘区（仅本场首领战） */
  bossHpDerivedFinalAtkMult = 1;
  bossHpDerivedFinalHpMult = 1;

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
  /** 策略「首领特攻」：对本章首领造成伤害提升（比例，如 0.3 = +30%） */
  bossDamageBonusVsFinalBoss = 0;

  damageDealtMultAllies = 1;
  damageTakenMultAllies = 1;

  chaoticBattle = false;
  /** 绝命乱斗：我方全局额外暴击率 */
  chaoticAllyCritBonus = 0;

  /** 已在策略节点（如 2-2 / 3-2）抉择的策略（用于备战与战斗内查看原文） */
  strategyPicks: { id: string; title: string; desc: string }[] = [];

  /** 永久养成占位：未来从存档注入 */
  externalGrowth: ExternalGrowthSnapshot = {
    permanentDamageMult: 1,
    permanentMaxHpMult: 1,
  };

  /** 见 `RunDevBattleHooks` */
  devBattleHooks?: RunDevBattleHooks;

  /** 竞技场 PvP：进攻方规则 + 防守方阵容 */
  arenaBattleRules?: {
    heroDeploy: readonly (HeroId | null)[];
    defenderLineup: ArenaLineupSnapshot;
    /** 本场战斗 RNG 种子（正式对战为对手 timestamp） */
    battleSeed: number;
    /** 镜像测试：不记胜败，仅本地验证 */
    mirrorTest?: boolean;
  };

  /**
   * 仅独立测试页：右下「开发战斗日志」面板（与 `[battle-skill]` 等共用）。
   * 正式流程勿赋值。
   */
  devBattleTestLog?: (line: string) => void;

  bookChapterStrengthMult(): number {
    return bookChapterStrengthPercent(this.bookChapterId) / 100;
  }

  resetRun(): void {
    this.playerHp = PLAYER_START_HP;
    this.gold = INITIAL_GOLD;
    this.currentRoundIndex = 0;
    this.board = Array.from({ length: 9 }, () => null);
    this.winStreak = 0;
    this.bookChapterRunFailed = false;
    this.bossHpDerivedFinalAtkMult = 1;
    this.bossHpDerivedFinalHpMult = 1;
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
    this.bossDamageBonusVsFinalBoss = 0;
    this.damageDealtMultAllies = 1;
    this.damageTakenMultAllies = 1;
    this.chaoticBattle = false;
    this.chaoticAllyCritBonus = 0;
    this.strategyPicks = [];
    this.devBattleHooks = undefined;
    this.devBattleTestLog = undefined;
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
   * 若本关为普通战或首领且战斗胜利（敌方全灭），连胜+1 并按连胜场次给钱（单场最多 5）。
   * 抉择/奖励：只发利息与固定金，不改连胜。
   */
  grantRoundEndEconomy(
    meta: RoundMeta,
    battleOutcome: BattleOutcome | null,
    linesStyle: 'verbose' | 'compact' = 'verbose',
  ): string[] {
    const lines: string[] = [];
    const compact = linesStyle === 'compact';
    const g0 = this.gold;
    const bankCap = this.interestBankCapOverride ?? INTEREST_BANK_CAP;
    const intCap = this.interestMaxGoldOverride ?? INTEREST_MAX_GOLD;
    const interestBase = Math.min(g0, bankCap);
    const interest = Math.min(intCap, Math.floor(interestBase / 10));
    this.gold += interest;
    if (compact) {
      lines.push(`利息 +${interest}`);
    } else {
      lines.push(`利息 +${interest} 金（持有 ${g0} 金，计息封顶 ${bankCap}，利息上限 ${intCap}）`);
    }

    this.gold += ROUND_END_FIXED_GOLD;
    if (compact) {
      lines.push(`回合 +${ROUND_END_FIXED_GOLD}`);
    } else {
      lines.push(`回合结束 +${ROUND_END_FIXED_GOLD} 金`);
    }

    const isCombat = meta.kind === 'normal' || meta.kind === 'boss';
    if (isCombat && battleOutcome) {
      const cleared = battleOutcome.enemyHpRatioRemaining <= 0.0001;
      if (cleared && this.extraGoldOnBattleWin > 0) {
        this.gold += this.extraGoldOnBattleWin;
        lines.push(
          compact
            ? `加成 +${this.extraGoldOnBattleWin}`
            : `策略加成：战斗胜利额外 +${this.extraGoldOnBattleWin} 金`,
        );
      }
      if (!cleared && this.extraGoldOnBattleLoss > 0) {
        this.gold += this.extraGoldOnBattleLoss;
        lines.push(
          compact
            ? `战败加成 +${this.extraGoldOnBattleLoss}`
            : `策略加成：战斗失败额外 +${this.extraGoldOnBattleLoss} 金`,
        );
      }
      if (battleOutcome.perfect) {
        this.winStreak += 1;
        const bonus = Math.min(this.winStreak, WIN_STREAK_BONUS_CAP);
        this.gold += bonus;
        if (compact) {
          lines.push(`连胜 +${bonus}`);
        } else {
          lines.push(`战斗胜利（敌方全灭）· 连胜 ${this.winStreak}，额外 +${bonus} 金（本场封顶 ${WIN_STREAK_BONUS_CAP}）`);
        }
      } else if (!compact) {
        lines.push(`战斗未胜利（敌方未全灭）：无连胜奖励，连胜保持为 ${this.winStreak}`);
      }
    }

    lines.push(compact ? `金 ${this.gold}` : `当前金币：${this.gold}`);
    return lines;
  }

  clearBoard(): void {
    this.board = Array.from({ length: 9 }, () => null);
  }

  /** 本章节点已全部走完（含关底首领战无论胜负） */
  isChapterRunAtEnd(): boolean {
    const n = roundsForBookChapter(this.bookChapterId).length;
    return this.currentRoundIndex >= n;
  }

  /**
   * 通关：走完本章所有节点且结算后生命 &gt; 0。
   * 与是否击破敌人无关；任意战斗战败仅扣血，打完最后一格再按剩余生命记星。
   */
  isGameWon(): boolean {
    return this.isChapterRunAtEnd() && this.playerHp > 0 && !this.bookChapterRunFailed;
  }

  isGameLost(): boolean {
    return this.playerHp <= 0 || this.bookChapterRunFailed;
  }

  /** 回血后不超过上限；生命可低于 0（结算展示用，≤0 即失败） */
  clampPlayerHpToMax(): void {
    if (this.playerHp > PLAYER_MAX_HP) this.playerHp = PLAYER_MAX_HP;
  }
}
