/**
 * 独立测试：书本关底首领 + 配置技能（与 wowBookBosses 当前章首领 skillIds 一致）。
 * 入口：`book-boss-skill-test.html`
 */
import 'pixi.js/unsafe-eval';
import '../style.css';
import { Application, type Container } from 'pixi.js';
import { BattleScreen } from '../game/screens/BattleScreen';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { RunState } from '../game/runState';
import type { RoundMeta } from '../game/types';
import { UI_TEST_BLUE_FPM_HERO_DEPLOY } from '../game/uiTestBattle';

const ALLY_HP_MULT = 10;
const BOSS_HP_MULT = 10;

function seedBossSkillTestRun(run: RunState): RoundMeta {
  run.resetRun();
  run.bookChapterId = 2;
  run.currentRoundIndex = 0;
  /** 各 1 个小兵 + 蓝法/蓝牧/蓝弓英雄（见 `UI_TEST_BLUE_FPM_HERO_DEPLOY`） */
  run.board = [
    { kind: 'warrior', stacks: 1 },
    { kind: 'mage', stacks: 1 },
    { kind: 'archer', stacks: 1 },
    { kind: 'priest', stacks: 1 },
    null,
    null,
    null,
    null,
    null,
  ];
  run.devBattleHooks = {
    heroDeploy: [...UI_TEST_BLUE_FPM_HERO_DEPLOY],
    heroSlotCap: 3,
    postSpawnHpMult: ALLY_HP_MULT,
    postSpawnHpMultSkipBoss: true,
    postSpawnBossHpMult: BOSS_HP_MULT,
  };
  return {
    label: `开发：第2章首领 · 蓝法/蓝牧/蓝弓 · 我方血×${ALLY_HP_MULT} · 首领血×${BOSS_HP_MULT}`,
    chapter: 2,
    sub: 2,
    kind: 'boss',
    enemies: [{ type: 'boss', count: 1, bossId: 'white', wowBossDisplayName: '饥饿者塔拉加曼' }],
  };
}

const mountEl = document.querySelector<HTMLDivElement>('#app');
const btnEl = document.querySelector<HTMLButtonElement>('#start');
const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const battleLogEl = document.querySelector<HTMLPreElement>('#battle-log');
if (!mountEl || !btnEl || !statusEl || !battleLogEl) {
  throw new Error('bookBossSkillTestPage: missing #app / #start / #status / #battle-log');
}
const mount = mountEl;
const btn = btnEl;
const status = statusEl;
const battleLog = battleLogEl;

const battleLogLines: string[] = [];
function appendBattleLog(line: string): void {
  battleLogLines.push(line);
  battleLog.textContent = battleLogLines.join('\n');
  battleLog.scrollTop = battleLog.scrollHeight;
}

const app = new Application();
let appInited = false;
let activeBattle: BattleScreen | null = null;
let resizeHooked = false;

function layoutBattleRoot(battle: Container, screenW: number, screenH: number): void {
  const sx = screenW / GAME_WIDTH;
  const sy = screenH / GAME_HEIGHT;
  const s = Math.min(sx, sy);
  battle.scale.set(s);
  battle.position.set((screenW - GAME_WIDTH * s) / 2, (screenH - GAME_HEIGHT * s) / 2);
}

async function startTest(): Promise<void> {
  if (activeBattle) return;
  btn.disabled = true;
  status.textContent = '加载资源…';
  try {
    const { preloadAllyPortraitTextures } = await import('../game/allyPortraitAssets');
    const { preloadEnemyTextures } = await import('../game/enemyBodyFactory');
    const { preloadHeroPortraitTextures } = await import('../game/heroPortraitAssets');
    await preloadAllyPortraitTextures();
    await preloadEnemyTextures(2);
    await preloadHeroPortraitTextures().catch(() => {});

    if (!appInited) {
      await app.init({
        background: '#070b14',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio ?? 1, 2.5),
        autoDensity: true,
        resizeTo: window,
        preference: 'webgl',
      });
      appInited = true;
      mount.replaceChildren(app.canvas as HTMLCanvasElement);
      if (!resizeHooked) {
        resizeHooked = true;
        app.renderer.on('resize', () => {
          const b = activeBattle;
          if (!b) return;
          const w = app.renderer.screen.width;
          const h = app.renderer.screen.height;
          if (w >= 1 && h >= 1) layoutBattleRoot(b, w, h);
        });
      }
    }

    const run = new RunState();
    const meta = seedBossSkillTestRun(run);
    battleLogLines.length = 0;
    battleLog.textContent = '';
    run.devBattleTestLog = (line: string) => {
      appendBattleLog(line);
    };

    const battle = new BattleScreen(app, run, meta, (outcome) => {
      status.textContent = `战斗结束 · 清敌=${outcome.enemyHpRatioRemaining <= 0.0001 ? '是' : '否'} · 敌剩余血量比例 ${(outcome.enemyHpRatioRemaining * 100).toFixed(2)}%`;
      app.stage.removeChild(battle);
      battle.destroy();
      activeBattle = null;
      run.devBattleTestLog = undefined;
      btn.disabled = false;
    });
    activeBattle = battle;
    app.stage.addChild(battle);

    const sync = (): void => {
      const w = app.renderer.screen.width;
      const h = app.renderer.screen.height;
      if (w >= 1 && h >= 1) layoutBattleRoot(battle, w, h);
    };
    sync();
    requestAnimationFrame(() => {
      app.resize();
      sync();
    });

    status.textContent = `战斗中：第2章首领；小兵战/法/射/牧各1；英雄 mage_02 / priest_02 / archer_02；我方×${ALLY_HP_MULT}血；首领×${BOSS_HP_MULT}血。`;
  } catch (e) {
    console.error(e);
    status.textContent = '启动失败，请打开控制台查看错误。';
    btn.disabled = false;
  }
}

btn.addEventListener('click', () => {
  void startTest();
});
