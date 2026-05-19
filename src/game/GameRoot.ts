import { Application, Container } from 'pixi.js';
import { PLAYER_MAX_HP, PLAYER_START_HP } from './constants';
import { layoutGameStage } from './layoutStage';
import type { BattleOutcome } from './types';
import { RunState } from './runState';
import { legacyProgressRoundIndex, roundsForBookChapter } from './roundConfig';
import { getResolvedRoundMeta } from './roundResolve';
import { resolveAftermath } from './aftermath';
import { applyRewardChapter } from './strategyApply';
import { BattleScreen } from './screens/BattleScreen';
import { DraftScreen } from './screens/DraftScreen';
import { ChapterSelectScreen } from './screens/ChapterSelectScreen';
import { ChapterRunSettlementScreen } from './screens/ChapterRunSettlementScreen';
import { LevelMapScreen } from './screens/LevelMapScreen';
import { ModalLayer } from './screens/ModalLayer';
import { GearFarmScreen } from './screens/GearFarmScreen';
import { ARENA_MATCH_POLL_MS, postArenaMatch } from './arenaApi';
import { applyArenaPvpBattleToRun } from './arenaBattleSetup';
import {
  arenaBattleDataHasPlayableLineup,
  arenaLineupFromBattleData,
  clearArenaLocalTimestamp,
  prepareArenaPostRecord,
} from './arenaComm';
import { spawnFloatingGameTip } from './ui/floatingGameTip';
import { parseArenaBattleSeed } from './battleRng';
import {
  arenaAwaitingClaim,
  getArenaLockedLineup,
  recordArenaBattleLoss,
  recordArenaBattleWin,
} from './arenaStorage';
import { ensureArenaUsername } from './arenaUsername';
import { ArenaScreen } from './screens/ArenaScreen';
import { ArenaDraftScreen } from './screens/ArenaDraftScreen';
import { StrengthenScreen } from './screens/StrengthenScreen';
import { StrategyPickScreen } from './screens/StrategyPickScreen';
import { TitleScreen } from './screens/TitleScreen';
import {
  markAllyClassUnlockCelebrationShown,
  shiftPendingUnlockCelebration,
  syncPendingUnlockCelebrationsFromSave,
} from './allyClassUnlockCelebration';
import {
  cheatChapterFullClearWithStar,
  getChapterStarFilledCount,
  markChapterFullyCleared,
  recordChapterClearStar,
} from './chapterProgressStorage';
import { AllyClassUnlockCelebrationOverlay } from './ui/AllyClassUnlockCelebrationOverlay';
import { syncLotteryTicketsFromChapterProgress } from './heroMetaStorage';
import { clearAllLocalGameSaveData } from './gameSaveClear';
import { preloadEnemyTextures } from './enemyBodyFactory';
import { preloadAllyPortraitTextures } from './allyPortraitAssets';
import { preloadHeroPortraitTextures } from './heroPortraitAssets';
import {
  seedUiTestRunBoard,
  UI_TEST_BOOK_CHAPTER_ID,
  UI_TEST_NEW_CLASS_HERO_DEPLOY,
  UI_TEST_ROUND_META,
} from './uiTestBattle';
import { notifyBotChapterOutcome, setBotAfterDraftHandler } from './bot/events';
import { botLog, isBotModeActive } from './bot/context';

export type GameRootOptions = {
  /** 跳过封面，直接进入选关（本地 bot 测试页） */
  skipTitle?: boolean;
};

export class GameRoot extends Container {
  readonly run = new RunState();
  private readonly app: Application;
  private readonly layer = new Container();
  private readonly modal: ModalLayer;
  private afterDraftInFlight = false;
  private arenaMatchPollTimer: ReturnType<typeof setInterval> | null = null;
  private arenaMatchDialog: { close: () => void; setMessage: (text: string) => void } | null = null;

  constructor(app: Application, opts?: GameRootOptions) {
    super();
    this.app = app;
    this.modal = new ModalLayer();
    this.sortableChildren = true;
    this.layer.zIndex = 0;
    this.addChild(this.layer);
    this.modal.zIndex = 1000;
    this.addChild(this.modal);
    if (opts?.skipTitle) {
      this.showChapterSelect(false);
    } else {
      this.showTitle();
    }
    if (isBotModeActive()) {
      setBotAfterDraftHandler((force) => this.enterBattleAfterDraft(!!force));
    }
  }

  /** Bot：选牌结束后进入战斗；force 用于超时重试 */
  enterBattleAfterDraft(force = false): void {
    if (force) {
      this.afterDraftInFlight = false;
      botLog('强制重试：加载战斗');
    }
    this.afterDraft();
  }

  getModalLayer(): ModalLayer {
    return this.modal;
  }

  isBotMode(): boolean {
    return isBotModeActive();
  }

  /** 封面：点击后进章节选择 */
  private showTitle(): void {
    this.clearLayer();
    this.layer.addChild(
      new TitleScreen(
        this.app,
        () => {
          this.clearLayer();
          this.showChapterSelect(false);
        },
        import.meta.env.DEV ? () => this.openUiTestBattle() : undefined,
        { onRequestClearSave: () => this.promptClearAllLocalSave() },
      ),
    );
  }

  /** 封面「清档」：两次确认后删除全部本地存档键。 */
  private promptClearAllLocalSave(): void {
    this.modal.confirmDestructive(
      '将删除本机全部游戏存档：\n\n· 关卡进度与评价星\n· 已获得英雄与上阵\n· 招募记录\n· 职业碎片与等级\n· 副本刷装体力\n· 竞技场阵容与招募券\n· 已装备与背包装备\n\n此操作不可恢复。\n是否继续？',
      () => {
        this.modal.confirmDestructive(
          '请再次确认：\n\n真的要清除全部本地存档？',
          () => {
            clearAllLocalGameSaveData();
            this.modal.alert('本地存档已清除。之后进入游戏将按新手状态加载。', () => {});
          },
          () => {},
          { confirmText: '确认清除' },
        );
      },
      undefined,
      { confirmText: '继续' },
    );
  }

  /** 开发：复合 UI 特效测试（不计入正式进度） */
  private openUiTestBattle(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures(UI_TEST_BOOK_CHAPTER_ID);
      await preloadHeroPortraitTextures().catch(() => {});
      const testRun = new RunState();
      seedUiTestRunBoard(testRun);
      testRun.devBattleHooks = {
        heroDeploy: [...UI_TEST_NEW_CLASS_HERO_DEPLOY],
        heroSlotCap: 4,
        postSpawnHpMult: 1,
        /** 四新兵种满层（含 21 极巨化 / 入场技等） */
        bondStacksBattleOverride: { warlock: 21, shaman: 21, assassin: 21, druid: 21 },
      };
      testRun.devBattleTestLog = (line: string): void => {
        console.log(`[HeyBro/ui-test] ${line}`);
      };
      testRun.devBattleTestLog(
        '[ui-test] 巴扎兰首领；棋盘术士/萨满/刺客/德鲁伊(4层)；英雄 warlock_01 shaman_01 assassin_01 druid_01；四职业羁绊=21。见控制台 [HeyBro/ui-test]。',
      );
      this.clearLayer();
      const battle = new BattleScreen(this.app, testRun, UI_TEST_ROUND_META, () => {
        this.modal.alert('UI 技能测试结束', () => this.showTitle());
      });
      this.layer.addChild(battle);
    })();
  }

  private clearLayer(): void {
    for (const c of [...this.layer.children]) {
      c.destroy({ children: true });
    }
  }

  /**
   * 本章流程已结束：全屏结算 → 关闭后重置单章 RunState 并回到章节选择。
   * @param fromMapFlow 与 `showChapterSelect(fromMap)` 一致，用于返回后「返回」键行为
   */
  private finishChapterRunWithSettlement(
    fromMapFlow: boolean,
    chapterId: number,
    opts: {
      kind: 'success' | 'fail';
      stars?: number;
      failMessage?: string;
      successExtra?: string;
    },
  ): void {
    if (isBotModeActive()) {
      notifyBotChapterOutcome(opts.kind, chapterId);
    }
    this.clearLayer();
    this.layer.addChild(
      new ChapterRunSettlementScreen({
        kind: opts.kind,
        chapterId,
        stars: opts.stars,
        failMessage: opts.failMessage,
        successExtra: opts.successExtra,
        onContinue: () => {
          this.run.resetRun();
          this.showChapterSelect(fromMapFlow);
        },
      }),
    );
  }

  /** 选关界面上依次展示待播放的「解锁新职业」弹窗（仅未展示过的扩展职业） */
  private playPendingAllyClassUnlockCelebrations(onDone: () => void): void {
    syncPendingUnlockCelebrationsFromSave();
    const step = (): void => {
      const cls = shiftPendingUnlockCelebration();
      if (!cls) {
        onDone();
        return;
      }
      const ov = new AllyClassUnlockCelebrationOverlay(cls, () => {
        markAllyClassUnlockCelebrationShown(cls);
        ov.destroy({ children: true });
        step();
      });
      ov.zIndex = 9000;
      this.layer.addChild(ov);
    };
    step();
  }

  /**
   * @param fromMap 从关卡地图返回时为 true（返回键回到地图）；从标题进入为 false（返回键回封面）
   */
  private showChapterSelect(fromMap: boolean): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures();
      this.run.chapterSelectBackToMap = fromMap;
      this.clearLayer();
      this.layer.addChild(
        new ChapterSelectScreen(
          (chapterId) => {
            this.run.bookChapterId = chapterId;
            this.run.resetRun();
            this.run.chapterSelectBackToMap = fromMap;
            this.showLevelMap();
          },
          () => {
            // 选关右上角「退出」= 回封面；勿回到关卡地图（易与「副本内」混淆，且放弃本章后 run 常已清空）
            if (this.run.chapterSelectBackToMap) {
              this.run.resetRun();
            }
            this.run.chapterSelectBackToMap = false;
            this.showTitle();
          },
          () => this.showStrengthenScreen(fromMap),
          () => this.showGearFarmScreen(fromMap),
          () => this.showArenaFlow(fromMap),
          (chapterId, star) => {
            cheatChapterFullClearWithStar(chapterId, star);
            syncLotteryTicketsFromChapterProgress();
            this.finishChapterRunWithSettlement(fromMap, chapterId, {
              kind: 'success',
              stars: star,
              successExtra: '测试通关已写入本地存档；招募券已按评价星同步。',
            });
          },
        ),
      );
      this.playPendingAllyClassUnlockCelebrations(() => {});
    })();
  }

  private showStrengthenScreen(fromChapterFlow: boolean): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      this.layer.addChild(
        new StrengthenScreen(this.app, this.modal, () => {
          this.showChapterSelect(fromChapterFlow);
        }),
      );
    })();
  }

  private showGearFarmScreen(fromChapterFlow: boolean): void {
    this.clearLayer();
    this.layer.addChild(
      new GearFarmScreen(
        () => {
          this.showChapterSelect(fromChapterFlow);
        },
        this.modal,
      ),
    );
  }

  private showArenaFlow(fromChapterFlow: boolean): void {
    void (async () => {
      ensureArenaUsername();
      await preloadAllyPortraitTextures();
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      const hub = new ArenaScreen(
        () => this.showChapterSelect(fromChapterFlow),
        () => this.showArenaDraftScreen(fromChapterFlow),
        () => void this.startArenaRealBattle(fromChapterFlow),
        this.modal,
      );
      this.layer.addChild(hub);
    })();
  }

  private mountArenaHub(fromChapterFlow: boolean): ArenaScreen {
    const hub = new ArenaScreen(
      () => this.showChapterSelect(fromChapterFlow),
      () => this.showArenaDraftScreen(fromChapterFlow),
      () => void this.startArenaRealBattle(fromChapterFlow),
      this.modal,
    );
    this.layer.addChild(hub);
    return hub;
  }

  private stopArenaMatchPolling(): void {
    if (this.arenaMatchPollTimer != null) {
      clearInterval(this.arenaMatchPollTimer);
      this.arenaMatchPollTimer = null;
    }
    this.arenaMatchDialog?.close();
    this.arenaMatchDialog = null;
  }

  private showArenaServerError(): void {
    spawnFloatingGameTip(this, '服务器错误');
  }

  private async startArenaRealBattle(fromChapterFlow: boolean): Promise<void> {
    const lineup = getArenaLockedLineup();
    if (!lineup) return;

    this.stopArenaMatchPolling();
    this.arenaMatchDialog = this.modal.arenaMatching(
      '匹配中…\n正在向服务器登记阵容并寻找对手',
      () => this.stopArenaMatchPolling(),
    );

    const tryOnce = async (): Promise<boolean> => {
      const record = prepareArenaPostRecord(lineup);
      const result = await postArenaMatch(record);
      switch (result.kind) {
        case 'no_opposite':
          this.arenaMatchDialog?.setMessage(
            '匹配中…\n暂无其他玩家，已登记你的阵容\n每 10 秒自动重试',
          );
          return false;
        case 'old_data':
          this.stopArenaMatchPolling();
          clearArenaLocalTimestamp();
          this.modal.alert('本场战斗已打完', () => {});
          return true;
        case 'network_error':
          this.stopArenaMatchPolling();
          this.showArenaServerError();
          return true;
        case 'ok': {
          this.stopArenaMatchPolling();
          const { opponent } = result;
          if (!arenaBattleDataHasPlayableLineup(opponent.battle_data)) {
            this.modal.alert('对手阵容数据不完整，无法开战', () => {});
            return true;
          }
          const defenderLineup = arenaLineupFromBattleData(opponent.battle_data);
          const battleSeed = parseArenaBattleSeed(opponent.timestamp);
          void this.runArenaPvpBattle(fromChapterFlow, {
            attackerLineup: lineup,
            defenderLineup,
            battleSeed,
            mirrorTest: false,
            resultTitle: '竞技场',
            opponentLabel: opponent.username,
            clearTimestampOnStart: true,
          });
          return true;
        }
      }
    };

    if (await tryOnce()) return;

    this.arenaMatchPollTimer = setInterval(() => {
      void tryOnce().then((done) => {
        if (done) this.stopArenaMatchPolling();
      });
    }, ARENA_MATCH_POLL_MS);
  }

  private runArenaPvpBattle(
    fromChapterFlow: boolean,
    opts: {
      attackerLineup: NonNullable<ReturnType<typeof getArenaLockedLineup>>;
      defenderLineup: NonNullable<ReturnType<typeof getArenaLockedLineup>>;
      battleSeed: number;
      mirrorTest: boolean;
      resultTitle: string;
      opponentLabel?: string;
      clearTimestampOnStart?: boolean;
    },
  ): void {
    void (async () => {
      if (opts.clearTimestampOnStart) {
        clearArenaLocalTimestamp();
      }
      await preloadAllyPortraitTextures();
      await preloadHeroPortraitTextures().catch(() => {});
      const run = new RunState();
      applyArenaPvpBattleToRun(run, opts.attackerLineup, {
        defenderLineup: opts.defenderLineup,
        battleSeed: opts.battleSeed,
        mirrorTest: opts.mirrorTest,
      });
      const meta = {
        label: opts.mirrorTest ? opts.resultTitle : '竞技场',
        chapter: 1 as const,
        sub: 0,
        kind: 'normal' as const,
        enemies: [],
      };
      this.clearLayer();
      const battle = new BattleScreen(this.app, run, meta, (outcome) => {
        const won = outcome.perfect || (outcome.enemyHpRatioRemaining ?? 1) <= 0.0001;
        if (!opts.mirrorTest) {
          if (won) recordArenaBattleWin();
          else recordArenaBattleLoss();
        }
        this.clearLayer();
        const hub = this.mountArenaHub(fromChapterFlow);
        hub.refresh();
        if (opts.mirrorTest) {
          const who = won ? '进攻方（下方）胜' : '防守方（上方）胜或超时';
          this.modal.alert(`${opts.resultTitle}结束\n${who}\n（不计入胜败场次）`, () => {});
          return;
        }
        const vs = opts.opponentLabel ? ` vs ${opts.opponentLabel}` : '';
        if (won) {
          this.modal.alert(`胜利！胜场 +1${vs}`, () => {});
        } else {
          const retired = arenaAwaitingClaim();
          if (retired) {
            this.modal.alert('第三次失败，本套阵容已作废。请领取奖励后重新开始。', () => {});
          } else {
            this.modal.alert(`失败。败场 +1${vs}`, () => {});
          }
        }
      });
      this.layer.addChild(battle);
    })();
  }

  private showArenaDraftScreen(fromChapterFlow: boolean): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      this.layer.addChild(
        new ArenaDraftScreen(
          this.app,
          () => {
            this.showArenaFlow(fromChapterFlow);
          },
          () => {
            this.clearLayer();
            const hub = new ArenaScreen(
              () => this.showChapterSelect(fromChapterFlow),
              () => this.showArenaDraftScreen(fromChapterFlow),
              () => void this.startArenaRealBattle(fromChapterFlow),
              this.modal,
            );
            hub.refresh();
            this.layer.addChild(hub);
          },
          this.modal,
        ),
      );
    })();
  }

  private showLevelMap(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures(this.run.bookChapterId);
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      const map = new LevelMapScreen(this.run, {
        onEnterRound: () => this.enterCurrentRound(),
        onRequestExitChapter: () => {
          this.modal.confirmDestructive(
            '确定要退出本关吗？\n\n未通关进度将不会保存（视为放弃挑战）。',
            () => {
              this.run.resetRun();
              this.run.chapterSelectBackToMap = false;
              this.showChapterSelect(false);
            },
            undefined,
            { confirmText: '退出' },
          );
        },
        onCheatChapterClear: (star) => {
          cheatChapterFullClearWithStar(this.run.bookChapterId, star);
          syncLotteryTicketsFromChapterProgress();
          this.run.bookChapterRunFailed = false;
          if (this.run.playerHp <= 0) this.run.playerHp = PLAYER_START_HP;
          this.run.clampPlayerHpToMax();
          this.run.currentRoundIndex = roundsForBookChapter(this.run.bookChapterId).length;
          this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
            kind: 'success',
            stars: star,
            successExtra: '作弊通关已写入存档；招募券已按评价星同步。',
          });
        },
      });
      this.layer.addChild(map);
    })();
  }

  /** 从地图进入当前回合：抉择 / 奖励 / 或选牌战斗 */
  private enterCurrentRound(): void {
    if (this.run.isGameLost()) {
      const msg =
        this.run.playerHp <= 0 ? '生命耗尽，本关失败。' : '本关因规则判定失败（如特殊失败条件）。';
      this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
        kind: 'fail',
        failMessage: msg,
      });
      return;
    }
    if (this.run.isGameWon()) {
      markChapterFullyCleared(this.run.bookChapterId);
      recordChapterClearStar(this.run.bookChapterId, this.run.playerHp);
      syncLotteryTicketsFromChapterProgress();
      const st = getChapterStarFilledCount(this.run.bookChapterId);
      this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
        kind: 'success',
        stars: st,
        successExtra:
          '评价星按通关剩余生命结算（≤0 未通关，1–49 一星，50–99 二星，100 三星）。',
      });
      return;
    }
    const rounds = roundsForBookChapter(this.run.bookChapterId);
    const meta = rounds[this.run.currentRoundIndex];
    if (!meta) {
      this.showLevelMap();
      return;
    }
    this.run.beginRoundEconomy();

    const demonLines = this.run.applyDemonContractRoundStart();
    const proceed = (): void => {
      if (meta.kind === 'strategy') {
        this.clearLayer();
        this.layer.addChild(
          new StrategyPickScreen(meta.chapter, this.run, (choiceLines) => {
            const econ = this.run.grantRoundEndEconomy(meta, null).join('\n');
            this.run.currentRoundIndex += 1;
            this.modal.alert([...choiceLines, '', '── 回合收入 ──', econ].join('\n'), () => this.showLevelMap());
          }),
        );
        return;
      }
      if (meta.kind === 'reward') {
        const rewardLines = applyRewardChapter(this.run, meta.chapter);
        const econ = this.run.grantRoundEndEconomy(meta, null).join('\n');
        this.run.currentRoundIndex += 1;
        this.modal.alert([...rewardLines, '', '── 回合收入 ──', econ].join('\n'), () => this.showLevelMap());
        return;
      }
      this.run.bossHpDerivedFinalAtkMult = 1;
      this.run.bossHpDerivedFinalHpMult = 1;
      this.openDraftCombat();
    };

    if (demonLines.length) {
      this.modal.alert(demonLines.join('\n'), proceed);
    } else {
      proceed();
    }
  }

  private openDraftCombat(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures(this.run.bookChapterId);
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      const draft = new DraftScreen(this.app, this.run, () => this.afterDraft());
      this.layer.addChild(draft);
    })();
  }

  private afterDraft(): void {
    if (this.afterDraftInFlight) {
      if (isBotModeActive()) botLog('afterDraft 跳过：上一次加载尚未结束');
      return;
    }
    this.afterDraftInFlight = true;
    const idx0 = this.run.currentRoundIndex;
    const ch = this.run.bookChapterId;
    if (isBotModeActive()) botLog(`afterDraft 开始：第 ${ch} 章 回合索引 ${idx0}`);
    void (async () => {
      try {
        await preloadAllyPortraitTextures();
        await preloadEnemyTextures(this.run.bookChapterId);
        const idx = this.run.currentRoundIndex;
        const rounds = roundsForBookChapter(this.run.bookChapterId);
        const base = rounds[idx];
        if (!base) {
          if (isBotModeActive()) {
            botLog(`afterDraft 中止：回合索引 ${idx} 无效（共 ${rounds.length} 节点）`);
          }
          this.showLevelMap();
          return;
        }
        const meta = getResolvedRoundMeta(this.run, idx, base);
        if (isBotModeActive()) botLog(`加载战斗：${meta.label}（${meta.kind}）`);
        this.clearLayer();
        const battle = new BattleScreen(this.app, this.run, meta, (outcome) => this.afterBattle(outcome));
        this.layer.addChild(battle);
        if (isBotModeActive()) botLog('BattleScreen 已挂载');
      } catch (e) {
        if (isBotModeActive()) botLog(`afterDraft 失败：${String(e)}`);
        console.error(e);
        this.showLevelMap();
      } finally {
        this.afterDraftInFlight = false;
      }
    })();
  }

  private afterBattle(outcome: BattleOutcome): void {
    const idx = this.run.currentRoundIndex;
    const rounds = roundsForBookChapter(this.run.bookChapterId);
    const metaDone = rounds[idx];
    if (!metaDone) {
      this.showLevelMap();
      return;
    }
    const leg = legacyProgressRoundIndex(this.run.bookChapterId, idx);

    this.run.bossHpDerivedFinalAtkMult = 1;
    this.run.bossHpDerivedFinalHpMult = 1;

    const res = resolveAftermath(
      leg,
      outcome.perfect,
      outcome.enemyHpRatioRemaining,
      metaDone.kind === 'boss',
    );
    const hpBefore = this.run.playerHp;
    this.run.playerHp += res.playerHpDelta;
    this.run.clampPlayerHpToMax();
    const hpAfter = this.run.playerHp;
    const hpAnim = {
      hpBefore,
      hpAfter,
      maxHp: PLAYER_MAX_HP,
      hpDelta: res.playerHpDelta,
    };

    const showBattleSettlement = (detail: string, onClose: () => void): void => {
      const openSettlement = (): void => {
        this.clearLayer();
        this.modal.alertBattleSettlement(detail, onClose);
      };
      if (res.playerHpDelta !== 0) {
        this.modal.playNodeHpChangeThenBattleSettlement(hpAnim, openSettlement);
      } else {
        openSettlement();
      }
    };

    const tailBase = [...res.lines, `生命 ${this.run.playerHp}`].join('\n');
    if (this.run.playerHp <= 0) {
      const econ = this.run.grantRoundEndEconomy(metaDone, outcome, 'compact').join('\n');
      showBattleSettlement(`${tailBase}\n${econ}\n生命耗尽 · 本关失败`, () =>
        this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
          kind: 'fail',
          failMessage: '生命耗尽，本关失败。',
        }),
      );
      return;
    }

    // 所有战斗（普通/首领）无论胜负都推进；战败仅扣血，走完节点且 hp>0 才通关。
    if (metaDone.kind === 'normal' || metaDone.kind === 'boss') {
      this.run.currentRoundIndex += 1;
    }
    const tail = [...res.lines, `生命 ${this.run.playerHp}`].join('\n');
    const econ = this.run.grantRoundEndEconomy(metaDone, outcome, 'compact').join('\n');
    const detail = `${tail}\n${econ}`;
    if (this.run.isGameWon()) {
      markChapterFullyCleared(this.run.bookChapterId);
      recordChapterClearStar(this.run.bookChapterId, this.run.playerHp);
      syncLotteryTicketsFromChapterProgress();
      const st = getChapterStarFilledCount(this.run.bookChapterId);
      const starLine =
        st === 3 ? '评价 3 星' : st === 2 ? '评价 2 星' : st === 1 ? '评价 1 星' : '评价星已记录';
      showBattleSettlement(`${detail}\n本关通关 · ${starLine} · 进度已保存`, () =>
        this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
          kind: 'success',
          stars: st,
          successExtra: '评价星按通关剩余生命结算（≤0 未通关，1–49 一星，50–99 二星，100 三星）。',
        }),
      );
      return;
    }
    showBattleSettlement(detail, () => this.showLevelMap());
  }

  /**
   * contain：在**实际画布/视口**（screenW×screenH，CSS 像素）内等比放大逻辑分辨率（GAME_*），
   * 居中且不超框。screenW/H 必须与 Pixi renderer.screen 一致。
   */
  layoutStage(screenW: number, screenH: number): void {
    layoutGameStage(this, screenW, screenH);
  }
}
