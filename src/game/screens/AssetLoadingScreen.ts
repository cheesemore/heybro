import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  gameAssetManifestCount,
  preloadAllGameAssets,
  type GameAssetPreloadResult,
} from '../gameAssetPreload';

export type AssetLoadingOutcome =
  | { ok: true; result: GameAssetPreloadResult }
  | { ok: false; error: unknown };

/**
 * 首屏资源读条：将 manifest 内图片预载进 Cache / 浏览器缓存后再进入游戏。
 */
export class AssetLoadingScreen extends Container {
  private readonly barW: number;
  private readonly barFill: Graphics;
  private readonly pctLabel: Text;
  private readonly hintLabel: Text;
  private readonly failLabel: Text;

  constructor() {
    super();
    this.sortableChildren = true;

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x070b14);
    this.addChild(bg);

    const title = new Text({
      text: 'HeyBro',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: Math.round(56 * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '800',
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(GAME_WIDTH / 2, Math.round(520 * LAYOUT_SCALE));
    this.addChild(title);

    const sub = new Text({
      text: '正在准备游戏资源…',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: Math.round(28 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        fontWeight: '600',
      },
    });
    sub.anchor.set(0.5, 0);
    sub.position.set(GAME_WIDTH / 2, title.y + Math.round(72 * LAYOUT_SCALE));
    this.addChild(sub);

    this.barW = Math.round(720 * LAYOUT_SCALE);
    const barH = Math.round(22 * LAYOUT_SCALE);
    const barX = (GAME_WIDTH - this.barW) / 2;
    const barY = Math.round(980 * LAYOUT_SCALE);

    const barBg = new Graphics();
    barBg.roundRect(barX, barY, this.barW, barH, Math.round(10 * LAYOUT_SCALE)).fill({
      color: 0x1e293b,
      alpha: 0.95,
    });
    this.addChild(barBg);

    this.barFill = new Graphics();
    this.addChild(this.barFill);

    this.pctLabel = new Text({
      text: '0%',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(32 * LAYOUT_SCALE),
        fill: 0xebe5a7,
        fontWeight: '700',
      },
    });
    this.pctLabel.anchor.set(0.5, 0);
    this.pctLabel.position.set(GAME_WIDTH / 2, barY + barH + Math.round(20 * LAYOUT_SCALE));
    this.addChild(this.pctLabel);

    this.hintLabel = new Text({
      text: `0 / ${gameAssetManifestCount()}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: 0x64748b,
        fontWeight: '500',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: this.barW,
      },
    });
    this.hintLabel.anchor.set(0.5, 0);
    this.hintLabel.position.set(GAME_WIDTH / 2, this.pctLabel.y + Math.round(44 * LAYOUT_SCALE));
    this.addChild(this.hintLabel);

    this.failLabel = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: 0xfbbf24,
        fontWeight: '600',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: this.barW + Math.round(80 * LAYOUT_SCALE),
      },
    });
    this.failLabel.anchor.set(0.5, 0);
    this.failLabel.position.set(GAME_WIDTH / 2, this.hintLabel.y + Math.round(120 * LAYOUT_SCALE));
    this.failLabel.visible = false;
    this.addChild(this.failLabel);

    this.paintBar(0);
  }

  private paintBar(ratio: number): void {
    const barH = Math.round(22 * LAYOUT_SCALE);
    const barX = (GAME_WIDTH - this.barW) / 2;
    const barY = Math.round(980 * LAYOUT_SCALE);
    const w = Math.max(0, Math.min(this.barW, Math.round(this.barW * ratio)));
    this.barFill.clear();
    if (w > 0) {
      this.barFill
        .roundRect(barX, barY, w, barH, Math.round(10 * LAYOUT_SCALE))
        .fill({ color: 0xebe5a7, alpha: 0.95 });
    }
  }

  /** 阻塞直到预载结束（失败项仍会继续进游戏） */
  async run(): Promise<AssetLoadingOutcome> {
    try {
      const result = await preloadAllGameAssets((p) => {
        const ratio = p.total > 0 ? p.loaded / p.total : 1;
        const pct = Math.round(ratio * 100);
        this.paintBar(ratio);
        this.pctLabel.text = `${pct}%`;
        this.hintLabel.text =
          p.current != null
            ? `${p.loaded} / ${p.total}\n${p.current}`
            : `${p.loaded} / ${p.total}`;
        if (p.failed > 0) {
          this.failLabel.visible = true;
          this.failLabel.text = `${p.failed} 个资源未加载（将使用占位，可刷新重试）`;
        }
      });

      this.paintBar(1);
      this.pctLabel.text = '100%';
      if (result.failed > 0) {
        this.failLabel.visible = true;
        this.failLabel.text = `完成：${result.failed} 个资源未加载，仍可进入游戏`;
        await this.delay(0.6);
      } else {
        this.hintLabel.text = '加载完成';
        await this.delay(0.25);
      }

      return { ok: true, result };
    } catch (error) {
      return { ok: false, error };
    }
  }

  private delay(sec: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, sec * 1000);
    });
  }
}
