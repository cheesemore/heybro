/**
 * 独立测试：书本关底首领 + 配置技能（与 wowBookBosses 当前章首领 skillIds 一致）。
 * 默认：第 5 章「拉克佐」（猛击 / 顺劈斩 / 战吼）；`?chapter=4` 或 `?boss=bazzalan` 切巴扎兰。
 * 入口：`book-boss-skill-test.html`（须通过 `npm run dev` 访问，勿用 file:// 打开）
 */
import 'pixi.js/unsafe-eval';
import '../style.css';
import { Application, type Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import {
  BOSS_SKILL_TEST_ALLY_HP_MULT,
  BOSS_SKILL_TEST_BOSS_HP_MULT,
  bossSkillTestPresetFromSearch,
  DEFAULT_BOSS_SKILL_TEST_PRESET_ID,
  seedBossSkillTestRun,
  type BossSkillTestPreset,
  type BossSkillTestPresetId,
} from './bossSkillTestPresets';

const PRESET_UI: { id: BossSkillTestPresetId; buttonId: string }[] = [
  { id: 'rhahk', buttonId: 'preset-rhahk' },
  { id: 'bazzalan', buttonId: 'preset-bazzalan' },
  { id: 'sneed', buttonId: 'preset-sneed' },
  { id: 'gilnid', buttonId: 'preset-gilnid' },
  { id: 'smite', buttonId: 'preset-smite' },
  { id: 'greenskin', buttonId: 'preset-greenskin' },
  { id: 'vancleef', buttonId: 'preset-vancleef' },
  { id: 'archer_trap', buttonId: 'preset-archer-trap' },
  { id: 'new_classes', buttonId: 'preset-new-classes' },
];

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
  const blurbEl = document.querySelector<HTMLParagraphElement>('#preset-blurb');
  const statusEl = document.querySelector<HTMLParagraphElement>('#status');
  const battleLogEl = document.querySelector<HTMLPreElement>('#battle-log');
  const presetButtons = PRESET_UI.map(({ id, buttonId }) => ({
    id,
    el: document.querySelector<HTMLButtonElement>(`#${buttonId}`),
  }));

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

  let activePreset =
    location.search.length > 0
      ? bossSkillTestPresetFromSearch(location.search)
      : bossSkillTestPresetFromSearch(`?boss=${DEFAULT_BOSS_SKILL_TEST_PRESET_ID}`);

  function applyPresetToUrl(id: BossSkillTestPresetId): void {
    const url = new URL(location.href);
    url.searchParams.set('boss', id);
    url.searchParams.delete('chapter');
    history.replaceState(null, '', url);
  }

  function setPresetButtonsDisabled(disabled: boolean): void {
    for (const { el } of presetButtons) {
      if (!el) continue;
      if (disabled) el.setAttribute('disabled', '');
      else el.removeAttribute('disabled');
    }
  }

  function setActivePreset(preset: BossSkillTestPreset): void {
    activePreset = preset;
    applyPresetToUrl(preset.id);
    if (blurbEl) {
      blurbEl.innerHTML = `${preset.hudBlurb} 开战生成后我方血量 ×${BOSS_SKILL_TEST_ALLY_HP_MULT}，首领血量 <strong>×${BOSS_SKILL_TEST_BOSS_HP_MULT}</strong>。右下为开发战斗日志。`;
    }
    for (const { id, el } of presetButtons) {
      const on = preset.id === id;
      el?.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (el) el.style.outline = on ? '2px solid #38bdf8' : 'none';
    }
    status.textContent = `已选：第 ${preset.bookChapterId} 章「${preset.bossNameCn}」（${preset.skillSummaryCn}）。点击「开始测试」。`;
  }

  for (const { id, el } of presetButtons) {
    el?.addEventListener('click', () => {
      setActivePreset(bossSkillTestPresetFromSearch(`?boss=${id}`));
    });
  }
  setActivePreset(activePreset);

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
    const preset = activePreset;
    btn.disabled = true;
    setPresetButtonsDisabled(true);
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
      await preloadEnemyTextures(preset.bookChapterId);
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
      const meta = seedBossSkillTestRun(run, preset);
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
        setPresetButtonsDisabled(false);
        setActivePreset(preset);
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

      status.textContent = preset.statusLine;
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      status.textContent = `启动失败：${msg}（详见控制台）`;
      btn.disabled = false;
      setPresetButtonsDisabled(false);
      mount.style.pointerEvents = 'none';
    }
  }

  btn.addEventListener('click', () => {
    void startTest();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
