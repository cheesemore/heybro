/** GitHub Pages 等环境的 CSP 会禁止 eval；必须在任何其它 pixi 导入之前执行 */
import 'pixi.js/unsafe-eval';
import { Application, Container } from 'pixi.js';
import { GameRoot } from '../game/GameRoot';
import { layoutGameStage } from '../game/layoutStage';
import { AssetLoadingScreen } from '../game/screens/AssetLoadingScreen';
import { setBotLogSink, setBotModeActive, botLog } from '../game/bot/context';
import { BotOrchestrator } from '../game/bot/orchestrator';
import { readBotResources } from '../game/bot/resources';

const gameMount = document.querySelector<HTMLDivElement>('#game-mount');
const appRoot = document.querySelector<HTMLDivElement>('#app');
const logEl = document.querySelector<HTMLPreElement>('#log');
const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const btnStart = document.querySelector<HTMLButtonElement>('#btn-start');
const btnStop = document.querySelector<HTMLButtonElement>('#btn-stop');
const failInput = document.querySelector<HTMLInputElement>('#fail-threshold');

if (!gameMount || !appRoot || !logEl || !statusEl || !btnStart || !btnStop || !failInput) {
  throw new Error('bot-runner layout elements missing');
}

const mount = gameMount;
const root = appRoot;
const logPre = logEl;
const status = statusEl;
const startBtn = btnStart;
const stopBtn = btnStop;
const failThresholdInput = failInput;

const logLines: string[] = [];
const MAX_LOG_LINES = 400;

function appendLog(line: string): void {
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) logLines.splice(0, logLines.length - MAX_LOG_LINES);
  logPre.textContent = logLines.join('\n');
  logPre.scrollTop = logPre.scrollHeight;
}

function setStatus(text: string): void {
  status.textContent = text;
}

setBotLogSink(appendLog);

const app = new Application();
let orchestrator: BotOrchestrator | null = null;

async function bootstrap(): Promise<void> {
  setBotModeActive(true);

  await app.init({
    background: '#070b14',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio ?? 1, 2.5),
    autoDensity: true,
    resizeTo: mount,
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
    setStatus('资源加载失败，请检查网络后刷新。');
    botLog(`资源加载失败：${loadOutcome.error}`);
    return;
  }
  if (loadOutcome.result.failed > 0) {
    botLog(`部分资源加载失败：${loadOutcome.result.failed} 个`);
  }

  const gameRoot = new GameRoot(app, { skipTitle: true });
  stageRoot.addChild(gameRoot);

  app.renderer.on('resize', syncGameLayout);
  syncGameLayout();

  const r0 = readBotResources();
  botLog(
    `存档就绪：挑战第 ${r0.challengeChapterId} 章；招募券 ${r0.tickets}；刷装${r0.farmUnlocked ? `体力 ${r0.stamina}` : '未解锁'}`,
  );
  setStatus('资源已加载。日志会实时写入 localStorage，停止时另存为 .log 文件。');

  orchestrator = new BotOrchestrator(gameRoot, gameRoot.getModalLayer(), {
    failThreshold: Math.max(1, Number(failThresholdInput.value) || 3),
    onStopped: (reason) => {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      failThresholdInput.disabled = false;
      setStatus(reason);
    },
  });

  startBtn.addEventListener('click', () => {
    if (!orchestrator || orchestrator.isRunning()) return;
    const th = Math.max(1, Math.min(20, Number(failThresholdInput.value) || 3));
    failThresholdInput.value = String(th);
    orchestrator.setFailThreshold(th);
    startBtn.disabled = true;
    stopBtn.disabled = false;
    failThresholdInput.disabled = true;
    setStatus('测试运行中…');
    orchestrator.start();
  });

  stopBtn.addEventListener('click', () => {
    if (!orchestrator?.isRunning()) return;
    failThresholdInput.disabled = false;
    orchestrator.stop('用户手动停止。');
  });
}

bootstrap().catch((err) => {
  console.error(err);
  setStatus('启动失败，请查看控制台。');
  botLog(`启动失败：${String(err)}`);
});
