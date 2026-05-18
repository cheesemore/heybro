/**
 * 兵种平衡：全局修正二分 + 站位/全组合扫描（不记录战斗技能日志）。
 * 入口：class-balance-test.html（npm run dev）
 */
import 'pixi.js/unsafe-eval';
import '../style.css';
import { Application, type Container } from 'pixi.js';
import {
  allMiddleColumnFormations,
  classTripleLabel,
  enumerateClassTriples,
  findMinWinningCorrectionPct,
  formationLabel,
  type FormationScanRow,
  type TripleBestRow,
} from './classBalanceTestCore';
import {
  CLASS_BALANCE_DEADMINES_PRESETS,
  classBalancePresetFromSearch,
  DEFAULT_CLASS_BALANCE_PRESET_ID,
  type ClassBalanceDeadminesPreset,
  type ClassBalanceDeadminesPresetId,
} from './classBalanceTestPresets';
import { battleWon, runClassBalanceBattle, type ClassBalanceRunnerDeps } from './classBalanceTestRunner';
import type { AllyClass } from '../game/types';

const PRESET_UI: { id: ClassBalanceDeadminesPresetId; buttonId: string }[] = [
  { id: 'dm_s3', buttonId: 'preset-dm-s3' },
  { id: 'dm_s4', buttonId: 'preset-dm-s4' },
  { id: 'dm_s5', buttonId: 'preset-dm-s5' },
  { id: 'dm_s6', buttonId: 'preset-dm-s6' },
];

const DEFAULT_TRIPLE: [AllyClass, AllyClass, AllyClass] = ['warrior', 'mage', 'priest'];

function boot(): void {
  if (location.protocol === 'file:') {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p style="position:fixed;left:12px;bottom:12px;z-index:99;color:#fca5a5">请 npm run dev 后打开 /class-balance-test.html</p>',
    );
    return;
  }

  const mountEl = document.querySelector<HTMLDivElement>('#app');
  const hudEl = document.querySelector<HTMLDivElement>('#hud');
  const globalPctEl = document.querySelector<HTMLInputElement>('#global-pct');
  const tripleEl = document.querySelector<HTMLSelectElement>('#class-triple');
  const formationEl = document.querySelector<HTMLSelectElement>('#formation');
  const btnEl = document.querySelector<HTMLButtonElement>('#start');
  const autoBinaryEl = document.querySelector<HTMLButtonElement>('#auto-binary');
  const scanFormEl = document.querySelector<HTMLButtonElement>('#scan-formations');
  const scanAllEl = document.querySelector<HTMLButtonElement>('#scan-all');
  const abortEl = document.querySelector<HTMLButtonElement>('#abort');
  const blurbEl = document.querySelector<HTMLParagraphElement>('#preset-blurb');
  const statusEl = document.querySelector<HTMLParagraphElement>('#status');
  const resultLogEl = document.querySelector<HTMLPreElement>('#result-log');
  const presetButtons = PRESET_UI.map(({ id, buttonId }) => ({
    id,
    el: document.querySelector<HTMLButtonElement>(`#${buttonId}`),
  }));

  if (
    !mountEl ||
    !btnEl ||
    !statusEl ||
    !resultLogEl ||
    !globalPctEl ||
    !tripleEl ||
    !formationEl ||
    !autoBinaryEl ||
    !scanFormEl ||
    !scanAllEl
  ) {
    document.body.insertAdjacentHTML('beforeend', '<p style="color:#fca5a5;padding:12px">页面 DOM 不完整。</p>');
    return;
  }

  const mount = mountEl;
  const btn = btnEl;
  const status = statusEl;
  const resultLog = resultLogEl;
  const globalPctInput = globalPctEl;
  const tripleSelect = tripleEl;
  const formationSelect = formationEl;
  const autoBinaryBtn = autoBinaryEl;
  const scanFormBtn = scanFormEl;
  const scanAllBtn = scanAllEl;

  let activePreset =
    location.search.length > 0
      ? classBalancePresetFromSearch(location.search)
      : CLASS_BALANCE_DEADMINES_PRESETS[DEFAULT_CLASS_BALANCE_PRESET_ID];

  let abortFlag = false;
  let automationRunning = false;
  const activeBattleRef = { current: null as Container | null };
  const app = new Application();
  let appInited = false;
  let assetsReady = false;

  function appendResult(line: string): void {
    resultLog.textContent = resultLog.textContent ? `${resultLog.textContent}\n${line}` : line;
    resultLog.scrollTop = resultLog.scrollHeight;
  }

  function clearResult(): void {
    resultLog.textContent = '';
  }

  function readGlobalPct(): number {
    const n = Math.round(Number(globalPctInput.value));
    return Math.max(1, Math.min(200, Number.isFinite(n) ? n : 100));
  }

  function setGlobalPct(n: number): void {
    globalPctInput.value = String(Math.max(1, Math.min(200, Math.round(n))));
  }

  function getSelectedTriple(): [AllyClass, AllyClass, AllyClass] {
    const v = tripleSelect.value;
    const found = enumerateClassTriples().find((t) => classTripleLabel(t) === v);
    return found ?? DEFAULT_TRIPLE;
  }

  function getSelectedFormation(): [AllyClass, AllyClass, AllyClass] {
    const triple = getSelectedTriple();
    const forms = allMiddleColumnFormations(triple);
    const v = formationSelect.value;
    return forms.find((f) => formationLabel(f) === v) ?? forms[0]!;
  }

  function refillTripleSelect(): void {
    const cur = tripleSelect.value;
    tripleSelect.replaceChildren();
    for (const t of enumerateClassTriples()) {
      const opt = document.createElement('option');
      opt.value = classTripleLabel(t);
      opt.textContent = classTripleLabel(t);
      tripleSelect.appendChild(opt);
    }
    if ([...tripleSelect.options].some((o) => o.value === cur)) tripleSelect.value = cur;
    else tripleSelect.value = classTripleLabel(DEFAULT_TRIPLE);
    refillFormationSelect();
  }

  function refillFormationSelect(): void {
    const triple = getSelectedTriple();
    const cur = formationSelect.value;
    const forms = allMiddleColumnFormations(triple);
    formationSelect.replaceChildren();
    for (const f of forms) {
      const opt = document.createElement('option');
      opt.value = formationLabel(f);
      opt.textContent = `${formationLabel(f)}（上→下）`;
      formationSelect.appendChild(opt);
    }
    if ([...formationSelect.options].some((o) => o.value === cur)) formationSelect.value = cur;
    else formationSelect.value = formationLabel(forms[0]!);
  }

  tripleSelect.addEventListener('change', () => refillFormationSelect());

  function setUiLocked(locked: boolean): void {
    automationRunning = locked;
    btn.disabled = locked;
    autoBinaryBtn.disabled = locked;
    scanFormBtn.disabled = locked;
    scanAllBtn.disabled = locked;
    if (abortEl) abortEl.disabled = !locked;
    globalPctInput.disabled = locked;
    tripleSelect.disabled = locked;
    formationSelect.disabled = locked;
    setPresetButtonsDisabled(locked);
  }

  function setPresetButtonsDisabled(disabled: boolean): void {
    for (const { el } of presetButtons) {
      if (!el) continue;
      if (disabled) el.setAttribute('disabled', '');
      else el.removeAttribute('disabled');
    }
  }

  function applyPresetToUrl(id: ClassBalanceDeadminesPresetId): void {
    const url = new URL(location.href);
    url.searchParams.set('stage', id.replace('dm_s', ''));
    history.replaceState(null, '', url);
  }

  function setActivePreset(preset: ClassBalanceDeadminesPreset): void {
    activePreset = preset;
    applyPresetToUrl(preset.id);
    if (blurbEl) {
      blurbEl.textContent = `敌方：${preset.stageLabelCn} · ${preset.hudLine}（无修正）`;
    }
    for (const { id, el } of presetButtons) {
      const on = preset.id === id;
      el?.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (el) el.style.outline = on ? '2px solid #4ade80' : 'none';
    }
    if (!automationRunning) {
      status.textContent = `已选 ${preset.stageLabelCn}。`;
    }
  }

  for (const { id, el } of presetButtons) {
    el?.addEventListener('click', () => {
      assetsReady = false;
      setActivePreset(CLASS_BALANCE_DEADMINES_PRESETS[id]);
    });
  }
  setActivePreset(activePreset);
  refillTripleSelect();

  async function ensureAssets(): Promise<void> {
    if (assetsReady) return;
    const [{ preloadAllyPortraitTextures }, { preloadEnemyTextures }, { preloadHeroPortraitTextures }] =
      await Promise.all([
        import('../game/allyPortraitAssets'),
        import('../game/enemyBodyFactory'),
        import('../game/heroPortraitAssets'),
      ]);
    await preloadAllyPortraitTextures();
    await preloadEnemyTextures(activePreset.bookChapterId);
    await preloadHeroPortraitTextures().catch(() => {});
    assetsReady = true;
  }

  async function ensureApp(): Promise<void> {
    await ensureAssets();
    if (appInited) return;
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
    mount.style.pointerEvents = 'none';
  }

  const runnerDeps: ClassBalanceRunnerDeps = {
    app,
    mount,
    hudEl,
    ensureApp,
  };

  async function fightOnce(
    pct: number,
    formation: readonly [AllyClass, AllyClass, AllyClass],
  ): Promise<boolean> {
    if (abortFlag) return false;
    const outcome = await runClassBalanceBattle(runnerDeps, {
      preset: activePreset,
      formation,
      globalCorrectionPct: pct,
      activeBattleRef,
    });
    return battleWon(outcome);
  }

  async function runBinaryForFormation(
    triple: [AllyClass, AllyClass, AllyClass],
    formation: readonly [AllyClass, AllyClass, AllyClass],
    logPrefix: string,
  ): Promise<FormationScanRow> {
    status.textContent = `${logPrefix} · 二分求最低全局修正…`;
    const res = await findMinWinningCorrectionPct(
      (pct) => fightOnce(pct, formation),
      (pct, won) => {
        status.textContent = `${logPrefix} · 试 ${pct}% ${won ? '胜' : '负'}`;
      },
    );
    const row: FormationScanRow = {
      triple,
      formation: [...formation],
      formationLabel: formationLabel(formation),
      minWinPct: res.minWinPct,
      canWinAt100: res.canWinAt100,
      loseAtPct: res.loseAtPct,
      winAtPct: res.winAtPct,
    };
    if (!res.canWinAt100) {
      appendResult(`${logPrefix} · ${formationLabel(formation)}：100% 仍无法获胜`);
    } else {
      appendResult(
        `${logPrefix} · 站位 ${formationLabel(formation)}：真实系数 ${res.minWinPct}%（${res.loseAtPct}% 败 / ${res.winAtPct}% 胜）`,
      );
    }
    return row;
  }

  async function scanBestFormationForTriple(
    triple: [AllyClass, AllyClass, AllyClass],
    logPrefix: string,
  ): Promise<TripleBestRow> {
    let best: FormationScanRow | null = null;
    for (const form of allMiddleColumnFormations(triple)) {
      if (abortFlag) break;
      const row = await runBinaryForFormation(triple, form, `${logPrefix} · ${formationLabel(form)}`);
      if (!row.canWinAt100) continue;
      if (!best || row.minWinPct < best.minWinPct) best = row;
    }
    if (!best) {
      return {
        triple,
        tripleLabel: classTripleLabel(triple),
        bestFormation: allMiddleColumnFormations(triple)[0]!,
        bestFormationLabel: formationLabel(allMiddleColumnFormations(triple)[0]!),
        minWinPct: 101,
        canWinAt100: false,
      };
    }
    return {
      triple,
      tripleLabel: classTripleLabel(triple),
      bestFormation: best.formation,
      bestFormationLabel: best.formationLabel,
      minWinPct: best.minWinPct,
      canWinAt100: true,
    };
  }

  btn.addEventListener('click', () => {
    void (async () => {
      if (automationRunning) return;
      setUiLocked(true);
      abortFlag = false;
      try {
        const pct = readGlobalPct();
        const form = getSelectedFormation();
        status.textContent = `战斗中 · 修正 ${pct}% · ${formationLabel(form)}`;
        const won = await fightOnce(pct, form);
        status.textContent = `结束 · ${won ? '胜' : '负'} · 修正 ${pct}%`;
      } catch (e) {
        status.textContent = `失败：${e instanceof Error ? e.message : String(e)}`;
      } finally {
        setUiLocked(false);
      }
    })();
  });

  autoBinaryBtn.addEventListener('click', () => {
    void (async () => {
      if (automationRunning) return;
      setUiLocked(true);
      abortFlag = false;
      clearResult();
      try {
        const form = getSelectedFormation();
        const row = await runBinaryForFormation(getSelectedTriple(), form, '二分');
        if (row.canWinAt100) setGlobalPct(row.minWinPct);
        status.textContent = row.canWinAt100
          ? `锁定：${row.minWinPct}%（${row.loseAtPct}% 败 / ${row.winAtPct}% 胜）`
          : '100% 仍败，无法锁定系数';
      } catch (e) {
        status.textContent = `失败：${e instanceof Error ? e.message : String(e)}`;
      } finally {
        setUiLocked(false);
      }
    })();
  });

  scanFormBtn.addEventListener('click', () => {
    void (async () => {
      if (automationRunning) return;
      setUiLocked(true);
      abortFlag = false;
      clearResult();
      try {
        const triple = getSelectedTriple();
        appendResult(`=== 扫描组合 ${classTripleLabel(triple)} @ ${activePreset.stageLabelCn} ===`);
        const rows: FormationScanRow[] = [];
        for (const form of allMiddleColumnFormations(triple)) {
          if (abortFlag) break;
          rows.push(await runBinaryForFormation(triple, form, classTripleLabel(triple)));
        }
        const viable = rows.filter((r) => r.canWinAt100);
        if (!viable.length) {
          appendResult('无站位在 100% 下能胜。');
          status.textContent = '扫描完成（无胜场）';
          return;
        }
        viable.sort((a, b) => a.minWinPct - b.minWinPct);
        const best = viable[0]!;
        formationSelect.value = best.formationLabel;
        setGlobalPct(best.minWinPct);
        appendResult(
          `\n【最强】站位 ${best.formationLabel} · 真实系数 ${best.minWinPct}%（${best.loseAtPct}% 败 / ${best.winAtPct}% 胜）`,
        );
        status.textContent = `最强：${best.formationLabel} @ ${best.minWinPct}%`;
      } catch (e) {
        status.textContent = `失败：${e instanceof Error ? e.message : String(e)}`;
      } finally {
        setUiLocked(false);
      }
    })();
  });

  scanAllBtn.addEventListener('click', () => {
    void (async () => {
      if (automationRunning) return;
      setUiLocked(true);
      abortFlag = false;
      clearResult();
      try {
        appendResult(`=== 全组合扫描 @ ${activePreset.stageLabelCn}（每组合 6 站位 × 二分）===`);
        const summary: TripleBestRow[] = [];
        for (const triple of enumerateClassTriples()) {
          if (abortFlag) break;
          appendResult(`\n--- ${classTripleLabel(triple)} ---`);
          const best = await scanBestFormationForTriple(triple, classTripleLabel(triple));
          summary.push(best);
          if (best.canWinAt100) {
            appendResult(`⇒ ${best.tripleLabel}：${best.bestFormationLabel} @ ${best.minWinPct}%`);
          } else {
            appendResult(`⇒ ${best.tripleLabel}：100% 无法获胜`);
          }
        }
        const ok = summary.filter((s) => s.canWinAt100).sort((a, b) => a.minWinPct - b.minWinPct);
        appendResult('\n=== 汇总（系数越低越强）===');
        for (const s of ok) {
          appendResult(`${s.tripleLabel}\t${s.bestFormationLabel}\t${s.minWinPct}%`);
        }
        status.textContent = `全扫描完成 · ${ok.length}/${summary.length} 组可胜`;
      } catch (e) {
        status.textContent = `失败：${e instanceof Error ? e.message : String(e)}`;
      } finally {
        setUiLocked(false);
      }
    })();
  });

  abortEl?.addEventListener('click', () => {
    abortFlag = true;
    status.textContent = '已请求中止（当前战斗结束后停止排队）';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
