/** GitHub Pages 等环境的 CSP 会禁止 eval；必须在任何其它 pixi 导入之前执行 */
import 'pixi.js/unsafe-eval';
import './style.css';
import { Application, Container } from 'pixi.js';
import { GameRoot } from './game/GameRoot';
import { layoutGameStage } from './game/layoutStage';
import { AssetLoadingScreen } from './game/screens/AssetLoadingScreen';

const mount = document.querySelector<HTMLDivElement>('#app');
if (!mount) {
  throw new Error('#app not found');
}
const root: HTMLDivElement = mount;

const app = new Application();

async function bootstrap(): Promise<void> {
  /**
   * 须先 init 再创建 GameRoot（内含封面点击），否则事件/画布顺序异常。
   * resizeTo 用 window，避免首帧 #app 为 0 高导致渲染分辨率为 0。
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

  const stageRoot = new Container();
  app.stage.addChild(stageRoot);

  const syncGameLayout = (): void => {
    const w = app.renderer.screen.width;
    const h = app.renderer.screen.height;
    if (w >= 1 && h >= 1) {
      layoutGameStage(stageRoot, w, h);
    }
  };

  const loading = new AssetLoadingScreen();
  stageRoot.addChild(loading);
  syncGameLayout();

  const loadOutcome = await loading.run();
  loading.destroy({ children: true });

  if (!loadOutcome.ok) {
    console.error(loadOutcome.error);
    root.textContent = '资源加载失败，请检查网络后刷新页面。';
    return;
  }
  if (loadOutcome.result.failed > 0) {
    console.warn('[preload] failed assets', loadOutcome.result.failedPaths.slice(0, 20));
  }

  const gameRoot = new GameRoot(app);
  stageRoot.addChild(gameRoot);

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
  root.textContent = '游戏启动失败，请查看控制台。';
});
