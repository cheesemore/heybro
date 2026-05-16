import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { spawnRingPulse, tickRingPulses, type RingPulse } from '../battleVisuals';

const FF = 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif';

/** 装备替换成功：槽位脉冲环 + 内闪光 + 「已替换」飘字 */
export function playGearReplaceFx(
  host: Container,
  worldX: number,
  worldY: number,
  qualityColor: number,
): void {
  host.sortableChildren = true;
  const layer = new Container();
  layer.zIndex = 100_002;
  layer.eventMode = 'none';
  host.addChild(layer);

  const rings: RingPulse[] = [
    spawnRingPulse(layer, worldX, worldY, Math.round(72 * LAYOUT_SCALE), qualityColor, 0.5),
    spawnRingPulse(layer, worldX, worldY, Math.round(48 * LAYOUT_SCALE), 0xffffff, 0.38, {
      delay: 0.07,
    }),
    spawnRingPulse(layer, worldX, worldY, Math.round(90 * LAYOUT_SCALE), qualityColor, 0.55, {
      delay: 0.12,
      flow: 'shrink',
    }),
  ];

  const flash = new Graphics();
  flash.position.set(worldX, worldY);
  layer.addChild(flash);

  const label = new Text({
    text: '已替换',
    style: {
      fontFamily: FF,
      fontSize: Math.round(22 * LAYOUT_SCALE),
      fill: qualityColor,
      fontWeight: '800',
      stroke: { color: 0x1a120c, width: Math.round(4 * LAYOUT_SCALE) },
    },
  });
  label.anchor.set(0.5, 0.5);
  label.position.set(worldX, worldY - Math.round(56 * LAYOUT_SCALE));
  label.alpha = 0;
  layer.addChild(label);

  const sparks: { g: Graphics; t: number; vx: number; vy: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const g = new Graphics();
    const r = (2 + Math.random() * 3) * LAYOUT_SCALE;
    g.circle(0, 0, r).fill({ color: i % 2 === 0 ? qualityColor : 0xfff7ed, alpha: 0.9 });
    g.position.set(worldX, worldY);
    layer.addChild(g);
    const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const spd = (80 + Math.random() * 120) * LAYOUT_SCALE;
    sparks.push({ g, t: 0, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd });
  }

  const durationMs = 720;
  const t0 = performance.now();
  let last = t0;

  const tick = (): void => {
    if (!layer.parent || layer.destroyed) {
      Ticker.shared.remove(tick);
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now - t0;
    const p = Math.min(1, elapsed / durationMs);

    tickRingPulses(rings, dt);

    const flashR = Math.round(52 * LAYOUT_SCALE) * (0.4 + 0.85 * Math.sin(Math.min(1, p * 2) * Math.PI * 0.5));
    const flashA = Math.max(0, 0.55 * (1 - p * 1.15));
    flash.clear();
    flash
      .roundRect(-flashR, -flashR, flashR * 2, flashR * 2, Math.round(12 * LAYOUT_SCALE))
      .fill({ color: qualityColor, alpha: flashA * 0.45 });
    flash
      .roundRect(-flashR * 0.55, -flashR * 0.55, flashR * 1.1, flashR * 1.1, Math.round(8 * LAYOUT_SCALE))
      .fill({ color: 0xffffff, alpha: flashA * 0.35 });

    if (p < 0.15) {
      label.alpha = p / 0.15;
      label.scale.set(0.85 + (p / 0.15) * 0.2);
    } else if (p > 0.55) {
      label.alpha = Math.max(0, 1 - (p - 0.55) / 0.45);
    } else {
      label.alpha = 1;
      label.scale.set(1.05);
    }

    for (const s of sparks) {
      s.t += dt;
      s.g.position.set(worldX + s.vx * s.t, worldY + s.vy * s.t - 40 * LAYOUT_SCALE * s.t * s.t);
      s.g.alpha = Math.max(0, 1 - s.t / 0.45);
      s.g.scale.set(1 - s.t * 0.6);
    }

    if (elapsed >= durationMs && rings.length === 0) {
      Ticker.shared.remove(tick);
      layer.destroy({ children: true });
    }
  };

  Ticker.shared.add(tick);
}
