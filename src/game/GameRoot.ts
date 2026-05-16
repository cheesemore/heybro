import { Application, Container } from 'pixi.js';
import { PLAYER_START_HP } from './constants';
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
import { StrengthenScreen } from './screens/StrengthenScreen';
import { StrategyPickScreen } from './screens/StrategyPickScreen';
import { TitleScreen } from './screens/TitleScreen';
import {
  cheatChapterFullClearWithStar,
  getChapterStarFilledCount,
  markChapterFullyCleared,
  recordCombatRoundBestStar,
} from './chapterProgressStorage';
import { syncLotteryTicketsFromChapterProgress } from './heroMetaStorage';
import { clearAllLocalGameSaveData } from './gameSaveClear';
import { preloadEnemyTextures } from './enemyBodyFactory';
import { preloadAllyPortraitTextures } from './allyPortraitAssets';
import { preloadHeroPortraitTextures } from './heroPortraitAssets';
import {
  seedUiTestRunBoard,
  UI_TEST_BLUE_FPM_HERO_DEPLOY,
  UI_TEST_BOOK_CHAPTER_ID,
  UI_TEST_ROUND_META,
} from './uiTestBattle';

export class GameRoot extends Container {
  readonly run = new RunState();
  private readonly app: Application;
  private readonly layer = new Container();
  private readonly modal: ModalLayer;

  constructor(app: Application) {
    super();
    this.app = app;
    this.modal = new ModalLayer();
    this.addChild(this.layer);
    this.addChild(this.modal);
    this.showTitle();
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
      '将删除本机全部游戏存档：\n\n· 关卡进度与评价星\n· 已获得英雄与上阵\n· 招募记录\n· 职业碎片与等级\n· 副本刷装体力\n· 已装备与背包装备\n\n此操作不可恢复。\n是否继续？',
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
        heroDeploy: [...UI_TEST_BLUE_FPM_HERO_DEPLOY],
        heroSlotCap: 3,
        postSpawnHpMult: 1,
        /** 法/牧/骑满层（含 ≥21 极巨化档），不增加棋盘出兵数 */
        bondStacksBattleOverride: { mage: 21, priest: 21, knight: 21 },
      };
      testRun.devBattleTestLog = (line: string): void => {
        console.log(`[HeyBro/ui-test] ${line}`);
      };
      testRun.devBattleTestLog(
        '[ui-test] 书本第4章首领巴扎兰（群体暗影箭/精神鞭笞/暗影闪现）；棋盘牧/法/弓；英雄 mage_02 priest_02 knight_01；羁绊法/牧/骑=21。技能见控制台 [HeyBro/ui-test]。',
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

  /**
   * @param fromMap 从关卡地图返回时为 true（返回键回到地图）；从标题进入为 false（返回键回封面）
   */
  private showChapterSelect(fromMap: boolean): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures();
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
            if (fromMap) this.showLevelMap();
            else this.showTitle();
          },
          () => this.showStrengthenScreen(fromMap),
          () => this.showGearFarmScreen(fromMap),
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

  private showLevelMap(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures(this.run.bookChapterId);
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      const map = new LevelMapScreen(this.run, {
        onEnterRound: () => this.enterCurrentRound(),
        onRequestExitChapter: () => {
          this.modal.alert('确定要退出本关吗？\n\n未通关进度将不会保存（视为放弃挑战）。', () => {
            this.modal.alert('请再次确认：是否退出到选关？', () => {
              this.run.resetRun();
              this.showChapterSelect(true);
            });
          });
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
      const st = getChapterStarFilledCount(this.run.bookChapterId);
      this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
        kind: 'success',
        stars: st,
        successExtra: '首领已击破，进度已保存。',
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
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures(this.run.bookChapterId);
      const idx = this.run.currentRoundIndex;
      const base = roundsForBookChapter(this.run.bookChapterId)[idx];
      if (!base) {
        this.showLevelMap();
        return;
      }
      const meta = getResolvedRoundMeta(this.run, idx, base);
      this.clearLayer();
      const battle = new BattleScreen(this.app, this.run, meta, (outcome) => this.afterBattle(outcome));
      this.layer.addChild(battle);
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
    const cleared = outcome.enemyHpRatioRemaining <= 0.0001;
    const isCombat = metaDone.kind === 'normal' || metaDone.kind === 'boss';

    this.run.bossHpDerivedFinalAtkMult = 1;
    this.run.bossHpDerivedFinalHpMult = 1;

    if (metaDone.kind === 'boss' && !cleared) {
      const res = resolveAftermath(leg, outcome.perfect, outcome.enemyHpRatioRemaining);
      this.run.playerHp += res.playerHpDelta;
      this.run.clampPlayerHpToMax();
      const econ = this.run.grantRoundEndEconomy(metaDone, outcome, 'compact').join('\n');
      const detail = ['首领未击退', ...res.lines, `生命 ${this.run.playerHp}`, econ].join('\n');
      if (this.run.playerHp <= 0) {
        this.modal.alertBattleSettlement(`${detail}\n生命耗尽 · 本关失败`, () =>
          this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
            kind: 'fail',
            failMessage: '生命耗尽，本关失败。',
          }),
        );
        return;
      }
      this.modal.alertBattleSettlement(`${detail}\n返回地图再战首领`, () =>
        this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
          kind: 'fail',
          failMessage: '首领未被击败。\n可返回选关后再次进入本关继续挑战。',
        }),
      );
      return;
    }

    const res = resolveAftermath(leg, outcome.perfect, outcome.enemyHpRatioRemaining);
    this.run.playerHp += res.playerHpDelta;
    this.run.clampPlayerHpToMax();

    const tailBase = [...res.lines, `生命 ${this.run.playerHp}`].join('\n');
    if (this.run.playerHp <= 0) {
      const econ = this.run.grantRoundEndEconomy(metaDone, outcome, 'compact').join('\n');
      this.modal.alertBattleSettlement(`${tailBase}\n${econ}\n生命耗尽 · 本关失败`, () =>
        this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
          kind: 'fail',
          failMessage: '生命耗尽，本关失败。',
        }),
      );
      return;
    }

    if (cleared && isCombat) {
      recordCombatRoundBestStar(this.run.bookChapterId, idx, this.run.playerHp);
      syncLotteryTicketsFromChapterProgress();
    }
    this.run.currentRoundIndex += 1;
    const tail = [...res.lines, `生命 ${this.run.playerHp}`].join('\n');
    const econ = this.run.grantRoundEndEconomy(metaDone, outcome, 'compact').join('\n');
    const detail = `${tail}\n${econ}`;
    if (this.run.isGameWon()) {
      markChapterFullyCleared(this.run.bookChapterId);
      /** 须在本章写入 cleared 之后再同步：`getChapterStarFilledCount` 对未通关章恒为 0 */
      syncLotteryTicketsFromChapterProgress();
      const st = getChapterStarFilledCount(this.run.bookChapterId);
      this.modal.alertBattleSettlement(`${detail}\n本关通关 · 进度已保存`, () =>
        this.finishChapterRunWithSettlement(this.run.chapterSelectBackToMap, this.run.bookChapterId, {
          kind: 'success',
          stars: st,
          successExtra: '评价星已折算为招募券（每星 5 张）。',
        }),
      );
      return;
    }
    this.modal.alertBattleSettlement(detail, () => this.showLevelMap());
  }

  /**
   * contain：在**实际画布/视口**（screenW×screenH，CSS 像素）内等比放大逻辑分辨率（GAME_*），
   * 居中且不超框。screenW/H 必须与 Pixi renderer.screen 一致。
   */
  layoutStage(screenW: number, screenH: number): void {
    layoutGameStage(this, screenW, screenH);
  }
}
