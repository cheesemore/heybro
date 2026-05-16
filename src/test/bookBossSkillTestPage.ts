/**
 * 独立测试：书本关底首领 + 配置技能（与 wowBookBosses 当前章首领 skillIds 一致）。
 * 当前默认：第 4 章「巴扎兰」（群体暗影箭 / 群体精神鞭笞 / 暗影闪现）。
 * 入口：`book-boss-skill-test.html`（须通过 `npm run dev` 访问，勿用 file:// 打开）
 */
import 'pixi.js/unsafe-eval';
import '../style.css';
import { Application, type Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { roundsForBookChapter } from '../game/roundConfig';
import type { RoundMeta } from '../game/types';
import { UI_TEST_BLUE_FPM_HERO_DEPLOY } from '../game/uiTestBattle';

const BOOK_CHAPTER_ID = 4;
const ALLY_HP_MULT = 10;
const BOSS_HP_MULT = 3;

function seedBossSkillTestRun(run: import('../game/runState').RunState): RoundMeta {
  run.resetRun();
  run.bookChapterId = BOOK_CHAPTER_ID;
  const rounds = roundsForBookChapter(BOOK_CHAPTER_ID);
  run.currentRoundIndex = Math.max(0, rounds.length - 1);
  run.board = [
    { kind: 'warrior', stacks: 1 },
    { kind: 'priest', stacks: 1 },
    { kind: 'archer', stacks: 6 },
    { kind: 'mage', stacks: 6 },
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
    bondStacksBattleOverride: { mage: 21, priest: 21, knight: 21 },
  };
  return {
    label: `开发：第4章首领巴扎兰 · 战1牧1弓6法6 · 群体暗影箭/精神鞭笞/暗影闪现 · 我方血×${ALLY_HP_MULT} · 首领血×${BOSS_HP_MULT}`,
    chapter: 3,
    sub: 6,
    kind: 'boss',
    enemies: [{ type: 'boss', count: 1, bossId: 'white', wowBossDisplayName: '巴扎兰' }],
    skipBattleOpeningCountdown: true,
  };
}

function boot(): void {
  if (location.protocol === 'file:') {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p style="position:fixed;left:12px;bottom:12px;z-index:99;color:#fca5a5;max-width:90vw">请在本项目目录执行 <code>npm run dev</code>，用终端里显示的地址打开 <code>/book-boss-skill-test.html</code>（不要用 file:// 直接打开本文件）。</p>',
    );
    return;
  }

  const mountEl = document.querySelector<HTMLDivElement>('#app');
  const hudEl = document.querySelector<HTMLDivElement>('#hud');
  const btnEl = document.querySelector<HTMLButtonElement>('#start');
  const statusEl = document.querySelector<HTMLParagraphElement>('#status');
  const battleLogEl = document.querySelector<HTMLPreElement>('#battle-log');
  if (!mountEl || !btnEl || !statusEl || !battleLogEl) {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p style="color:#fca5a5;padding:12px">页面 DOM 不完整，缺少 #app / #start / #status / #battle-log。</p>',
    );
    return;
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
  let activeBattle: Container | null = null;
  let resizeHooked = false;

  function layoutBattleRoot(battle: Container, screenW: number, screenH: number): void {
    const sx = screenW / GAME_WIDTH;
    const sy = screenH / GAME_HEIGHT;
    const s = Math.min(sx, sy);
    battle.scale.set(s);
    battle.position.set((screenW - GAME_WIDTH * s) / 2, (screenH - GAME_HEIGHT * s) / 2);
  }

  async function startTest(): Promise<void> {
    if (activeBattle) {
      status.textContent = '战斗已在进行中。';
      return;
    }
    btn.disabled = true;
    status.textContent = '加载资源…';
    try {
      const [{ preloadAllyPortraitTextures }, { preloadEnemyTextures }, { preloadHeroPortraitTextures }] =
        await Promise.all([
          import('../game/allyPortraitAssets'),
          import('../game/enemyBodyFactory'),
          import('../game/heroPortraitAssets'),
        ]);
      const [{ RunState }, { BattleScreen }] = await Promise.all([
        import('../game/runState'),
        import('../game/screens/BattleScreen'),
      ]);

      await preloadAllyPortraitTextures();
      await preloadEnemyTextures(BOOK_CHAPTER_ID);
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
        mount.style.pointerEvents = 'auto';
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
        if (hudEl) hudEl.style.display = '';
        mount.style.pointerEvents = 'none';
        status.textContent = `战斗结束 · 清敌=${outcome.enemyHpRatioRemaining <= 0.0001 ? '是' : '否'} · 敌剩余 ${(outcome.enemyHpRatioRemaining * 100).toFixed(2)}%`;
        app.stage.removeChild(battle);
        battle.destroy();
        activeBattle = null;
        run.devBattleTestLog = undefined;
        btn.disabled = false;
      });
      activeBattle = battle;
      app.stage.addChild(battle);
      if (hudEl) hudEl.style.display = 'none';

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

      status.textContent = `战斗中：第4章巴扎兰；战1牧1弓6法6；英雄 mage_02/priest_02/knight_01；我方×${ALLY_HP_MULT}血；首领×${BOSS_HP_MULT}血。`;
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      status.textContent = `启动失败：${msg}（详见控制台）`;
      btn.disabled = false;
      mount.style.pointerEvents = 'none';
    }
  }

  btn.addEventListener('click', () => {
    void startTest();
  });

  status.textContent = '页面已就绪，点击「开始测试」。';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
