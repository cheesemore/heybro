import type { Application, Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import type { BattleOutcome } from '../game/types';
import type { ClassBalanceDeadminesPreset } from './classBalanceTestPresets';
import { seedClassBalanceTestRun } from './classBalanceTestPresets';
import type { AllyClass } from '../game/types';

export function battleWon(outcome: BattleOutcome): boolean {
  return outcome.enemyHpRatioRemaining <= 0.0001;
}

export type ClassBalanceRunnerDeps = {
  app: Application;
  mount: HTMLElement;
  hudEl: HTMLElement | null;
  ensureApp: () => Promise<void>;
};

export async function runClassBalanceBattle(
  deps: ClassBalanceRunnerDeps,
  args: {
    preset: ClassBalanceDeadminesPreset;
    formation: readonly [AllyClass, AllyClass, AllyClass];
    globalCorrectionPct: number;
    activeBattleRef: { current: Container | null };
  },
): Promise<BattleOutcome> {
  const { app, mount, hudEl, ensureApp } = deps;
  const { preset, formation, globalCorrectionPct, activeBattleRef } = args;

  if (activeBattleRef.current) {
    throw new Error('上一场战斗尚未结束');
  }

  await ensureApp();

  const [{ RunState }, { BattleScreen }] = await Promise.all([
    import('../game/runState'),
    import('../game/screens/BattleScreen'),
  ]);

  const run = new RunState();
  const meta = seedClassBalanceTestRun(run, preset, formation, globalCorrectionPct);
  run.devBattleTestLog = undefined;

  return await new Promise<BattleOutcome>((resolve, reject) => {
    try {
      const battle = new BattleScreen(app, run, meta, (outcome) => {
        if (hudEl) hudEl.style.display = '';
        mount.style.pointerEvents = 'none';
        app.stage.removeChild(battle);
        battle.destroy();
        activeBattleRef.current = null;
        run.devBattleTestLog = undefined;
        resolve(outcome);
      });
      activeBattleRef.current = battle;
      app.stage.addChild(battle);
      if (hudEl) hudEl.style.display = 'none';
      mount.style.pointerEvents = 'auto';

      const sync = (): void => {
        const w = app.renderer.screen.width;
        const h = app.renderer.screen.height;
        if (w < 1 || h < 1) return;
        const sx = w / GAME_WIDTH;
        const sy = h / GAME_HEIGHT;
        const s = Math.min(sx, sy);
        battle.scale.set(s);
        battle.position.set((w - GAME_WIDTH * s) / 2, (h - GAME_HEIGHT * s) / 2);
      };
      sync();
      requestAnimationFrame(() => {
        app.resize();
        sync();
      });
    } catch (e) {
      activeBattleRef.current = null;
      reject(e);
    }
  });
}
