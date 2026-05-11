import { Application, Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import type { BattleOutcome } from './types';
import { RunState } from './runState';
import { ROUNDS } from './roundConfig';
import { getResolvedRoundMeta } from './roundResolve';
import { resolveAftermath } from './aftermath';
import { applyRewardChapter } from './strategyApply';
import { BattleScreen } from './screens/BattleScreen';
import { DraftScreen } from './screens/DraftScreen';
import { ChapterSelectScreen } from './screens/ChapterSelectScreen';
import { LevelMapScreen } from './screens/LevelMapScreen';
import { ModalLayer } from './screens/ModalLayer';
import { StrengthenScreen } from './screens/StrengthenScreen';
import { StrategyPickScreen } from './screens/StrategyPickScreen';
import { TitleScreen } from './screens/TitleScreen';
import {
  cheatChapterFullClearWithStar,
  markChapterFullyCleared,
  recordCombatRoundBestStar,
} from './chapterProgressStorage';
import { preloadEnemyTextures } from './enemyBodyFactory';
import { preloadAllyPortraitTextures } from './allyPortraitAssets';
import { preloadHeroPortraitTextures } from './heroPortraitAssets';
import { seedUiTestRunBoard, UI_TEST_ROUND_META } from './uiTestBattle';

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
      ),
    );
  }

  /** 开发：复合 UI 特效测试（不计入正式进度） */
  private openUiTestBattle(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures();
      const testRun = new RunState();
      seedUiTestRunBoard(testRun);
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
            this.showLevelMap();
          },
          () => {
            if (fromMap) this.showLevelMap();
            else this.showTitle();
          },
          () => this.showStrengthenScreen(fromMap),
          (chapterId, star) => {
            cheatChapterFullClearWithStar(chapterId, star);
            this.modal.alert(
              `测试：第 ${chapterId} 章已记为通关（全部战斗关 ${star}★，已写入本地存档）`,
              () => this.showChapterSelect(fromMap),
            );
          },
        ),
      );
    })();
  }

  private showStrengthenScreen(fromChapterFlow: boolean): void {
    void (async () => {
      await preloadHeroPortraitTextures().catch(() => {});
      this.clearLayer();
      this.layer.addChild(
        new StrengthenScreen(this.app, this.modal, () => {
          this.showChapterSelect(fromChapterFlow);
        }),
      );
    })();
  }

  private showLevelMap(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures();
      this.clearLayer();
      const map = new LevelMapScreen(this.run, {
        onEnterRound: () => this.enterCurrentRound(),
        onRequestExitChapter: () => {
          this.modal.alert('确定要退出本章吗？\n\n未通关进度将不会保存（视为放弃挑战）。', () => {
            this.modal.alert('请再次确认：是否退出到章节选择？', () => {
              this.run.resetRun();
              this.showChapterSelect(true);
            });
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
        this.run.playerHp <= 0 ? '游戏结束：生命值已耗尽' : '本章通关失败（规则失败等）。';
      this.modal.alert(msg, () => this.showLevelMap());
      return;
    }
    if (this.run.isGameWon()) {
      this.modal.alert('恭喜通关本章（3-6 首领已击破）！', () => this.showLevelMap());
      return;
    }
    const meta = ROUNDS[this.run.currentRoundIndex];
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
      await preloadEnemyTextures();
      this.clearLayer();
      const draft = new DraftScreen(this.app, this.run, () => this.afterDraft());
      this.layer.addChild(draft);
    })();
  }

  private afterDraft(): void {
    void (async () => {
      await preloadAllyPortraitTextures();
      await preloadEnemyTextures();
      const idx = this.run.currentRoundIndex;
      const base = ROUNDS[idx];
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
    const metaDone = ROUNDS[idx]!;
    const cleared = outcome.enemyHpRatioRemaining <= 0.0001;
    const isCombat = metaDone.kind === 'normal' || metaDone.kind === 'boss';

    this.run.bossHpDerivedFinalAtkMult = 1;
    this.run.bossHpDerivedFinalHpMult = 1;

    if (metaDone.kind === 'boss' && !cleared) {
      const res = resolveAftermath(idx, outcome.perfect, outcome.enemyHpRatioRemaining);
      this.run.playerHp += res.playerHpDelta;
      this.run.clampPlayerHpToMax();
      const tail = [...res.lines, `当前生命：${this.run.playerHp}`].join('\n');
      const econ = this.run.grantRoundEndEconomy(metaDone, outcome).join('\n');
      const full = `${tail}\n\n── 回合收入 ──\n${econ}`;
      if (this.run.playerHp <= 0) {
        this.modal.alert(`首领未击退\n${full}\n\n生命值耗尽，本章失败。`, () => this.showLevelMap());
        return;
      }
      this.modal.alert(`首领未击退\n${full}\n\n生命未耗尽，可从地图再次挑战首领。`, () => this.showLevelMap());
      return;
    }

    const res = resolveAftermath(idx, outcome.perfect, outcome.enemyHpRatioRemaining);
    this.run.playerHp += res.playerHpDelta;
    this.run.clampPlayerHpToMax();
    if (cleared && isCombat) {
      recordCombatRoundBestStar(this.run.bookChapterId, idx, this.run.playerHp);
    }
    this.run.currentRoundIndex += 1;
    const tail = [...res.lines, `当前生命：${this.run.playerHp}`].join('\n');
    if (this.run.playerHp <= 0) {
      this.modal.alert(`战斗结算\n${tail}\n\n失败：生命值小于等于 0`, () => this.showLevelMap());
      return;
    }
    const econ = this.run.grantRoundEndEconomy(metaDone, outcome).join('\n');
    const full = `${tail}\n\n── 回合收入 ──\n${econ}`;
    if (this.run.isGameWon()) {
      markChapterFullyCleared(this.run.bookChapterId);
      this.modal.alert(
        `战斗结算\n${full}\n\n胜利：已通关本章全部关卡！\n进度已保存（本地）。`,
        () => this.showLevelMap(),
      );
      return;
    }
    this.modal.alert(`战斗结算\n${full}`, () => this.showLevelMap());
  }

  /**
   * contain：在**实际画布/视口**（screenW×screenH，CSS 像素）内等比放大逻辑分辨率（GAME_*），
   * 居中且不超框。screenW/H 必须与 Pixi renderer.screen 一致。
   */
  layoutStage(screenW: number, screenH: number): void {
    const sx = screenW / GAME_WIDTH;
    const sy = screenH / GAME_HEIGHT;
    const s = Math.min(sx, sy);
    this.scale.set(s);
    this.position.set((screenW - GAME_WIDTH * s) / 2, (screenH - GAME_HEIGHT * s) / 2);
  }
}
