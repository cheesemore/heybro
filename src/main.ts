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

const app = new Application();
const gameRoot = new GameRoot(app);

async function bootstrap(): Promise<void> {
  await app.init({
    background: '#070b14',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio ?? 1, 2.5),
    autoDensity: true,
    resizeTo: root,
    preference: 'webgl',
  });

  root.innerHTML = '';
  root.appendChild(app.canvas as HTMLCanvasElement);
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

  window.addEventListener('orientationchange', () => app.resize());
  window.visualViewport?.addEventListener('resize', () => app.resize());
}

bootstrap().catch((err) => {
  console.error(err);
  root.textContent = '游戏启动失败，请查看控制台。';
});
