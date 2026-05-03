/** GitHub Pages 等环境的 CSP 会禁止 eval；必须在任何其它 pixi 导入之前执行 */
import 'pixi.js/unsafe-eval';
import './style.css';
import { Application } from 'pixi.js';
import { GameRoot } from './game/GameRoot';

const mount = document.querySelector<HTMLDivElement>('#app');
if (!mount) {
  throw new Error('#app not found');
}
const root: HTMLDivElement = mount;

function showFatal(message: string, err?: unknown): void {
  const detail =
    err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : err != null ? String(err) : '';
  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:16px;padding:12px;color:#fecaca;background:#1c1917;border-radius:8px;white-space:pre-wrap;font:14px/1.45 ui-monospace,Consolas,system-ui;max-height:85vh;overflow:auto';
  pre.textContent = [message, detail].filter(Boolean).join('\n\n');
  root.replaceChildren(pre);
}

window.addEventListener('error', (ev) => {
  showFatal('运行时错误（未捕获）', ev.error ?? ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  showFatal('异步错误（未处理的 Promise）', ev.reason);
});

const app = new Application();

async function bootstrap(): Promise<void> {
  /**
   * 使用 window 而非 #app 作为 resize 目标：部分环境下首帧 #app 的 getBoundingClientRect 为 0，
   * 会导致 renderer 为 0×0、画面全透明/空白且控制台无报错。
   */
  await app.init({
    background: '#070b14',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio ?? 1, 2.5),
    autoDensity: true,
    resizeTo: window,
    preference: 'webgl',
  });

  root.replaceChildren(app.canvas as HTMLCanvasElement);

  let gameRoot: GameRoot;
  try {
    gameRoot = new GameRoot(app);
  } catch (e) {
    showFatal('创建游戏场景失败', e);
    return;
  }
  app.stage.addChild(gameRoot);

  const syncGameLayout = (): void => {
    const w = app.renderer.screen.width;
    const h = app.renderer.screen.height;
    if (w >= 1 && h >= 1) {
      gameRoot.layoutStage(w, h);
    }
  };

  app.renderer.on('resize', syncGameLayout);
  syncGameLayout();
  requestAnimationFrame(() => {
    app.resize();
    syncGameLayout();
    requestAnimationFrame(() => {
      app.resize();
      syncGameLayout();
    });
  });

  window.addEventListener('orientationchange', () => app.resize());
  window.visualViewport?.addEventListener('resize', () => app.resize());
}

bootstrap().catch((err) => {
  console.error(err);
  showFatal('游戏启动失败（bootstrap）', err);
});
