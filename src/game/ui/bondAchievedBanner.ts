import { Container, Graphics, Text } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import type { BondTierThreshold } from '../bondCopy';
import {
  allyBondDisplayName,
  bondAchievedBannerLine,
} from '../bondCopy';
import {
  drawGoldenSolidPanel,
  GOLDEN_PANEL_ACCENT,
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_TITLE,
} from './goldenSolidPanel';
import { createDraftAllyToken } from '../unitCircleTokens';
import type { AllyClass } from '../types';

const FF = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';

const FLASH_SEC = 0.55;
const HOLD_SEC = 2;
const FLY_SEC = 0.45;

/** 与招募页羁绊浮层、英雄介绍同档，盖在棋盘与三选一之上 */
export const BOND_ACHIEVED_BANNER_Z = 8100;

type Queued = { kind: AllyClass; tier: BondTierThreshold };

type ActiveBanner = {
  wrap: Container;
  glow: Graphics;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  phase: 'flash' | 'hold' | 'fly';
  phaseT: number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * 羁绊达成：屏幕下方长条 → 金边迸发消退 → 停留 2s → 缩小飞向「羁绊/规则」按钮后消失。
 * 停留/闪现阶段再有新达成时，新条叠在上方避免重叠。
 */
export class BondAchievedBannerHost {
  private readonly root = new Container();
  private readonly flyTargetX: number;
  private readonly flyTargetY: number;
  private readonly barW: number;
  private readonly barH: number;
  private readonly barX: number;
  private readonly barY: number;
  private readonly stackStep: number;
  private readonly queue: Queued[] = [];
  private readonly actives: ActiveBanner[] = [];

  constructor(
    parent: Container,
    opts: {
      flyTargetX: number;
      flyTargetY: number;
      bottomInset?: number;
      zIndex?: number;
    },
  ) {
    this.flyTargetX = opts.flyTargetX;
    this.flyTargetY = opts.flyTargetY;
    const sidePad = Math.round(20 * LAYOUT_SCALE);
    this.barW = GAME_WIDTH - sidePad * 2;
    this.barH = Math.round(92 * LAYOUT_SCALE);
    this.barX = sidePad;
    this.barY = GAME_HEIGHT - this.barH - Math.round(opts.bottomInset ?? 108 * LAYOUT_SCALE);
    this.stackStep = this.barH + Math.round(10 * LAYOUT_SCALE);
    this.root.eventMode = 'none';
    this.root.zIndex = opts.zIndex ?? BOND_ACHIEVED_BANNER_Z;
    parent.addChild(this.root);
  }

  enqueue(kind: AllyClass, tier: BondTierThreshold): void {
    this.queue.push({ kind, tier });
    this.flushQueue();
  }

  update(dt: number): void {
    this.flushQueue();

    for (let i = this.actives.length - 1; i >= 0; i--) {
      const a = this.actives[i]!;
      a.phaseT += dt;

      if (a.phase === 'flash') {
        const p = Math.min(1, a.phaseT / FLASH_SEC);
        const burst = Math.sin(p * Math.PI);
        const sw = Math.max(3, Math.round((4 + burst * 5) * LAYOUT_SCALE));
        a.glow.clear();
        a.glow
          .roundRect(-4, -4, a.startW + 8, a.startH + 8, Math.round(14 * LAYOUT_SCALE))
          .stroke({ width: sw, color: GOLDEN_PANEL_ACCENT, alpha: burst * 0.95 });
        a.glow
          .roundRect(-2, -2, a.startW + 4, a.startH + 4, Math.round(12 * LAYOUT_SCALE))
          .stroke({
            width: Math.max(2, Math.round(2 * LAYOUT_SCALE)),
            color: 0xfff7ed,
            alpha: burst * 0.55,
          });
        if (p >= 1) {
          a.phase = 'hold';
          a.phaseT = 0;
          a.glow.clear();
        }
      } else if (a.phase === 'hold') {
        if (a.phaseT >= HOLD_SEC) {
          a.phase = 'fly';
          a.phaseT = 0;
        }
      } else {
        const p = Math.min(1, a.phaseT / FLY_SEC);
        const e = easeOutCubic(p);
        const scale = 1 - e * 0.82;
        a.wrap.position.set(
          a.startX + (this.flyTargetX - a.startX) * e,
          a.startY + (this.flyTargetY - a.startY) * e,
        );
        a.wrap.scale.set(scale);
        a.wrap.alpha = 1 - e * 0.35;
        if (p >= 1) {
          a.wrap.destroy({ children: true });
          this.actives.splice(i, 1);
        }
      }
    }
  }

  destroy(): void {
    for (const a of this.actives) {
      a.wrap.destroy({ children: true });
    }
    this.actives.length = 0;
    this.queue.length = 0;
    this.root.destroy({ children: true });
  }

  /** 仍在底部停留区（闪现/停留）的条数，用于把新条叠在上方 */
  private countStackedAtBottom(): number {
    return this.actives.filter((a) => a.phase === 'flash' || a.phase === 'hold').length;
  }

  private spawnYForNextBanner(): number {
    return this.barY - this.countStackedAtBottom() * this.stackStep;
  }

  private flushQueue(): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      const y = this.spawnYForNextBanner();
      this.actives.push(this.buildBanner(next.kind, next.tier, y));
    }
  }

  private buildBanner(kind: AllyClass, tier: BondTierThreshold, spawnY: number): ActiveBanner {
    const wrap = new Container();
    wrap.position.set(this.barX, spawnY);

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, this.barW, this.barH, LAYOUT_SCALE);
    wrap.addChild(plate);
    wrap.addChild(frame);

    const glow = new Graphics();
    wrap.addChild(glow);

    const pad = Math.round(14 * LAYOUT_SCALE);
    const portraitD = Math.round(56 * LAYOUT_SCALE);
    const leftW = portraitD + Math.round(20 * LAYOUT_SCALE);

    const token = createDraftAllyToken(kind, portraitD);
    token.position.set(pad + portraitD / 2, this.barH / 2);
    wrap.addChild(token);

    const nameT = new Text({
      text: allyBondDisplayName(kind),
      style: {
        fontFamily: FF,
        fontSize: Math.round(17 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    nameT.anchor.set(0.5, 0);
    nameT.position.set(pad + portraitD / 2, pad + portraitD + Math.round(4 * LAYOUT_SCALE));
    wrap.addChild(nameT);

    const descW = this.barW - leftW - pad;
    const descT = new Text({
      text: bondAchievedBannerLine(kind, tier),
      style: {
        fontFamily: FF,
        fontSize: Math.round(16 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_BODY,
        fontWeight: '600',
        lineHeight: Math.round(22 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: descW,
        breakWords: true,
      },
    });
    descT.anchor.set(0, 0.5);
    descT.position.set(pad + leftW, this.barH / 2);
    wrap.addChild(descT);

    this.root.addChild(wrap);

    return {
      wrap,
      glow,
      startX: this.barX,
      startY: spawnY,
      startW: this.barW,
      startH: this.barH,
      phase: 'flash',
      phaseT: 0,
    };
  }
}
