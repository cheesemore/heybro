import { Application, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { loadPublicTexture, publicAssetUrl } from '../loadPublicTexture';
import { startScreenMusic, stopScreenMusic } from '../gameAudio';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { createStyledGameButton } from '../ui/gameButtons';

/** 等比缩放铺满逻辑画布（类似 object-fit: cover），避免非等比拉伸。 */
function layoutCoverSprite(sprite: Sprite, boxW: number, boxH: number): void {
  const tw = sprite.texture.width;
  const th = sprite.texture.height;
  if (tw < 1 || th < 1) return;
  const sc = Math.max(boxW / tw, boxH / th);
  sprite.scale.set(sc);
  sprite.anchor.set(0.5);
  sprite.position.set(boxW * 0.5, boxH * 0.5);
}

/**
 * 启动封面：全屏 KV + 底部「点击屏幕进入游戏」、右上角「清档」；点击空白处进入主流程。
 * 子节点 eventMode=none + 顶层透明点击层，避免命中被挡；见 main 须在 init 后再挂 GameRoot。
 */
export class TitleScreen extends Container {
  private readonly app: Application;
  private tickFn: (() => void) | null = null;
  private uiTestKeyCleanup: (() => void) | null = null;

  constructor(
    app: Application,
    onEnter: () => void,
    onUiTestBattle?: () => void,
    titleOpts?: { onRequestClearSave?: () => void },
  ) {
    super();
    this.app = app;

    const coverRoot = new Container();
    coverRoot.eventMode = 'none';
    this.addChild(coverRoot);

    const fallback = new Graphics();
    fallback.eventMode = 'none';
    fallback.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x120a1e);
    coverRoot.addChild(fallback);

    void loadPublicTexture(publicAssetUrl('assets/title-cover.png'))
      .then((texture) => {
        if (coverRoot.destroyed) {
          texture.destroy(true);
          return;
        }
        const sprite = new Sprite(texture);
        sprite.eventMode = 'none';
        layoutCoverSprite(sprite, GAME_WIDTH, GAME_HEIGHT);
        coverRoot.removeChild(fallback);
        fallback.destroy();
        coverRoot.addChildAt(sprite, 0);
      })
      .catch(() => {
        /* 缺文件或加载失败：保留深色底；开发环境见 loadPublicTexture 内 warn */
      });

    const hint = new Text({
      text: '点击屏幕进入游戏',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(32 * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '700',
        stroke: { color: 0x0f172a, width: Math.max(2, Math.round(3 * LAYOUT_SCALE)) },
        wordWrap: true,
        wordWrapWidth: GAME_WIDTH - Math.round(48 * LAYOUT_SCALE),
        align: 'center',
      },
    });
    hint.eventMode = 'none';
    hint.anchor.set(0.5, 0.5);
    hint.position.set(GAME_WIDTH * 0.5, GAME_HEIGHT * 0.78);
    this.addChild(hint);

    if (import.meta.env.DEV && onUiTestBattle) {
      const onKey = (ev: KeyboardEvent): void => {
        if (ev.repeat || ev.code !== 'KeyU') return;
        ev.preventDefault();
        onUiTestBattle();
      };
      window.addEventListener('keydown', onKey);
      this.uiTestKeyCleanup = () => window.removeEventListener('keydown', onKey);
    }

    let entered = false;
    const go = (): void => {
      if (entered) return;
      entered = true;
      onEnter();
    };
    const tap = new Graphics();
    tap.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: 0.001 });
    tap.eventMode = 'static';
    tap.cursor = 'pointer';
    tap.on('pointertap', go);
    this.addChild(tap);

    attachScreenDebugLabel(this, 'TitleScreen');
    startScreenMusic('title');

    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cursor = 'pointer';
    this.on('pointertap', go);

    if (titleOpts?.onRequestClearSave) {
      const requestClear = titleOpts.onRequestClearSave;
      const clearW = Math.round(118 * LAYOUT_SCALE);
      const clearH = Math.round(46 * LAYOUT_SCALE);
      const clearMargin = Math.round(8 * LAYOUT_SCALE);
      const clearBtn = createStyledGameButton('navSlate', {
        text: '清档',
        width: clearW,
        height: clearH,
        fontSize: Math.round(20 * LAYOUT_SCALE),
        onTap: (e) => {
          e.stopPropagation();
          requestClear();
        },
      });
      clearBtn.position.set(GAME_WIDTH - clearMargin - clearW, clearMargin);
      this.addChild(clearBtn);
    }

    this.tickFn = (): void => {
      if (hint.destroyed) return;
      hint.alpha = 0.5 + 0.5 * Math.sin(performance.now() * 0.0028);
    };
    app.ticker.add(this.tickFn);
  }

  override destroy(options?: boolean): void {
    stopScreenMusic();
    if (this.tickFn) {
      this.app.ticker.remove(this.tickFn);
      this.tickFn = null;
    }
    if (this.uiTestKeyCleanup) {
      this.uiTestKeyCleanup();
      this.uiTestKeyCleanup = null;
    }
    super.destroy(options);
  }
}
