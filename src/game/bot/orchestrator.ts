import { botLog, clearBotSessionLog, exportBotSessionLog, isBotModeActive } from './context';
import { botRequestEnterBattleAfterDraft, setBotChapterOutcomeListener } from './events';
import type { BotIntent } from './policy';
import { decideBotIntent, shouldStopAfterFailure, type BotPhase } from './policy';
import { botCurrentScreen } from './registry';
import { isMetaExhausted, readBotResources } from './resources';
import { formatBotStallSnapshot } from './stallDiagnostics';
import type { ModalLayer } from '../screens/ModalLayer';
import type { GameRoot } from '../GameRoot';

const TICK_MS = 450;
const STALL_MS = 5000;

export type BotOrchestratorOpts = {
  failThreshold: number;
  onStopped: (reason: string) => void;
};

export class BotOrchestrator {
  private readonly game: GameRoot;
  private readonly modal: ModalLayer;
  private readonly opts: BotOrchestratorOpts;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private phase: BotPhase = 'meta';
  private consecutiveFailures = 0;
  private draftBattleStarted = false;
  /** 当前地图界面是否已点过「进入」；领奖/策略弹窗关闭后须重置 */
  private mapNodeEntered = false;
  private draftSubmitMs = 0;
  private lastScreen: string = 'none';
  private lastStepMs = 0;
  private failThreshold: number;

  constructor(game: GameRoot, modal: ModalLayer, opts: BotOrchestratorOpts) {
    this.game = game;
    this.modal = modal;
    this.opts = opts;
    this.failThreshold = Math.max(1, opts.failThreshold);
  }

  start(): void {
    if (this.running) return;
    if (!isBotModeActive()) return;
    this.running = true;
    this.phase = 'meta';
    this.consecutiveFailures = 0;
    this.draftBattleStarted = false;
    this.mapNodeEntered = false;
    this.lastStepMs = Date.now();
    clearBotSessionLog();
    setBotChapterOutcomeListener((kind, chapterId) => {
      if (kind === 'success') {
        this.consecutiveFailures = 0;
        this.phase = 'push';
        botLog(`第 ${chapterId} 章通关，继续推进。`);
      } else {
        this.consecutiveFailures += 1;
        this.phase = 'meta';
        const r = readBotResources();
        botLog(
          `第 ${chapterId} 章失败（连续 ${this.consecutiveFailures}/${this.failThreshold}）。养成：券 ${r.tickets}，可升级 ${r.canUpgrade ? '是' : '否'}，体力 ${r.stamina}。`,
        );
        if (shouldStopAfterFailure(this.consecutiveFailures, this.failThreshold, r)) {
          this.stop(
            `连续失败 ${this.consecutiveFailures} 次且招募/升级/刷装均已用尽，测试终止。`,
          );
        }
      }
      this.lastStepMs = Date.now();
    });
    botLog('自动测试已开始（使用本机存档，无作弊）。');
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(reason?: string): void {
    const wasRunning = this.running;
    if (!wasRunning && !reason) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    setBotChapterOutcomeListener(null);
    const msg = reason ?? '已手动停止。';
    if (wasRunning) botLog(msg);
    let logFile = '';
    if (wasRunning || reason) {
      try {
        logFile = exportBotSessionLog(msg);
      } catch (e) {
        botLog(`日志保存失败：${String(e)}`);
      }
    }
    this.opts.onStopped(logFile ? `${msg}（已下载 ${logFile}）` : msg);
  }

  isRunning(): boolean {
    return this.running;
  }

  setFailThreshold(n: number): void {
    this.failThreshold = Math.max(1, Math.floor(n));
  }

  private tick(): void {
    if (!this.running) return;

    const reg = botCurrentScreen();
    const screen = reg?.kind ?? 'none';
    const r = readBotResources();

    if (screen !== this.lastScreen) {
      if (screen === 'levelMap' && this.lastScreen !== 'levelMap') {
        this.mapNodeEntered = false;
      } else if (screen !== 'levelMap') {
        this.mapNodeEntered = false;
      }
      if (screen === 'draft') this.draftBattleStarted = false;
      else if (this.lastScreen === 'draft') {
        if (screen === 'battle') botLog('已进入战斗');
        else botLog(`离开选牌 → ${screen}`);
        this.draftBattleStarted = false;
      }
      this.lastScreen = screen;
      this.lastStepMs = Date.now();
    }

    this.watchDraftBattleStuck(screen, reg);

    const intent = decideBotIntent(screen, r, this.phase, this.modal.visible);
    const didStep = this.execute(intent, reg, r);

    if (screen === 'battle') {
      this.lastStepMs = Date.now();
    } else if (didStep) {
      this.lastStepMs = Date.now();
    } else if (Date.now() - this.lastStepMs >= STALL_MS) {
      botLog(
        formatBotStallSnapshot({
          screen,
          phase: this.phase,
          modalVisible: this.modal.visible,
          mapNodeEntered: this.mapNodeEntered,
          draftBattleStarted: this.draftBattleStarted,
          run: this.game.run,
        }),
      );
      this.lastStepMs = Date.now();
    }
  }

  /** 选牌已提交但长时间仍停在选牌界面 → 强制重试 afterDraft */
  private watchDraftBattleStuck(
    screen: string,
    reg: ReturnType<typeof botCurrentScreen>,
  ): void {
    if (!this.draftBattleStarted || screen !== 'draft' || this.draftSubmitMs <= 0) return;
    if (Date.now() - this.draftSubmitMs < 5000) return;
    botLog('开战超时（仍停在选牌），强制重试加载战斗');
    this.draftBattleStarted = false;
    this.draftSubmitMs = 0;
    reg?.draft?.resetSubmit();
    botRequestEnterBattleAfterDraft(true);
    this.lastStepMs = Date.now();
  }

  private execute(
    intent: BotIntent,
    reg: ReturnType<typeof botCurrentScreen>,
    r: ReturnType<typeof readBotResources>,
  ): boolean {
    switch (intent.type) {
      case 'idle':
        return false;
      case 'dismissModal': {
        if (!this.modal.botDismissPrimary()) return false;
        botLog('关闭弹窗');
        if (reg?.kind === 'levelMap') {
          this.mapNodeEntered = false;
          botLog('领奖/收入弹窗已关，可进入下一地图节点');
        }
        return true;
      }
      case 'openStrengthen':
        reg?.chapterSelect?.openStrengthen();
        botLog('进入养成：招募/职业');
        return true;
      case 'openGearFarm':
        reg?.chapterSelect?.openGearFarm();
        botLog('进入副本刷装');
        return true;
      case 'metaAutoDeploy':
        if (reg?.strengthen?.tryAutoDeployHeroes()) botLog('自动上阵（战/法/牧，品质优先）');
        return true;
      case 'metaRecruitTen':
        if (reg?.strengthen?.tryRecruitTen()) botLog('十连招募');
        return true;
      case 'metaRecruitOne':
        if (reg?.strengthen?.tryRecruitOne()) botLog('单抽招募');
        return true;
      case 'metaUpgrade':
        if (reg?.strengthen?.tryUpgradeOnce()) botLog('职业升级 +1');
        return true;
      case 'metaFarm':
        if (reg?.gearFarm?.farmOnce()) botLog(`刷装（体力余 ${readBotResources().stamina}）`);
        return true;
      case 'metaBack':
        reg?.strengthen?.back();
        reg?.gearFarm?.back();
        if (isMetaExhausted(r)) {
          this.phase = 'push';
          botLog('养成已用尽，开始挑战当前章节。');
        }
        return true;
      case 'pushChapter': {
        if (this.phase === 'meta' && isMetaExhausted(r)) {
          this.phase = 'push';
        }
        reg?.chapterSelect?.enterChapter();
        botLog(`进入第 ${r.challengeChapterId} 章`);
        return true;
      }
      case 'enterRound':
        if (this.mapNodeEntered) return false;
        if (reg?.levelMap?.canEnterRound()) {
          this.mapNodeEntered = true;
          const idx = reg.levelMap.getCurrentRoundIndex();
          reg.levelMap.enterRound();
          botLog(`进入地图节点（回合索引 ${idx}）`);
          return true;
        }
        return false;
      case 'draftStep': {
        const draft = reg?.draft;
        if (!draft || this.draftBattleStarted) return false;
        if (draft.canPickMore()) {
          if (draft.tryPick()) {
            botLog(
              draft.hasBoardUnit()
                ? '继续选牌（优先战/法/牧，尽量花金）'
                : '选牌成功（优先战/法/牧）',
            );
          } else {
            botLog('选牌未成功，下一拍重试');
          }
          return true;
        }
        if (!draft.isReadyForBattle()) {
          botLog('等待上阵：棋盘尚无兵种且无法继续选牌');
          return false;
        }
        if (draft.tryStartBattle()) {
          this.draftBattleStarted = true;
          this.draftSubmitMs = Date.now();
          botLog('金币已尽量花完，提交开战');
          return true;
        }
        botLog('开战提交失败（条件不满足或已提交过）');
        return false;
      }
      case 'strategyPick0':
        reg?.strategyPick?.pick(0);
        botLog('策略抉择：选第 1 项');
        return true;
      case 'settlementContinue':
        reg?.settlement?.continue();
        return true;
      default:
        return false;
    }
  }
}
