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
    /** 渲染区域随 #app 铺满视口（与 body 100dvh 一致），避免画布只占中间一小块 */
    resizeTo: root,
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
