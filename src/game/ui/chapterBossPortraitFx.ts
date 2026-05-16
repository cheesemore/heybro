import { Container, Graphics, Ticker } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { spawnRingPulse, tickRingPulses, type RingPulse } from '../battleVisuals';
import { GOLDEN_PANEL_ACCENT } from './goldenSolidPanel';

/** 章节板关底首领头像：金色呼吸光晕 + 周期扩散环 */
export function mountChapterBossPortraitFx(
  host: Container,
  x: number,
  y: number,
  radius: number,
): () => void {
  const layer = new Container();
  layer.position.set(x, y);
  layer.eventMode = 'none';
  host.addChildAt(layer, 0);

  const glow = new Graphics();
  layer.addChild(glow);

  const rings: RingPulse[] = [];
  let pulseTimer = 0;
  let phase = 0;
  const accent = GOLDEN_PANEL_ACCENT;
  const flare = 0xf59e0b;

  const onTick = (): void => {
    if (layer.destroyed) return;
    const dt = Ticker.shared.deltaMS / 1000;
    phase += dt;

    const breathe = 0.9 + Math.sin(phase * 2.3) * 0.1;
    glow.clear();
    glow
      .circle(0, 0, radius * 0.64 * breathe)
      .fill({ color: accent, alpha: 0.13 + Math.sin(phase * 2.9) * 0.05 });
    glow
      .circle(0, 0, radius * 0.56)
      .stroke({
        width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)),
        color: accent,
        alpha: 0.38 + Math.sin(phase * 2.6) * 0.14,
      });
    glow.circle(0, 0, radius * 0.5).stroke({
      width: 1.5,
      color: flare,
      alpha: 0.22 + Math.sin(phase * 3.4 + 0.8) * 0.1,
    });

    pulseTimer += dt;
    if (pulseTimer >= 0.9) {
      pulseTimer = 0;
      rings.push(
        spawnRingPulse(layer, 0, 0, radius * 0.48, accent, 1),
        spawnRingPulse(layer, 0, 0, radius * 0.7, flare, 1.2, { delay: 0.14 }),
      );
    }
    tickRingPulses(rings, dt);
  };

  Ticker.shared.add(onTick);
  rings.push(spawnRingPulse(layer, 0, 0, radius * 0.42, accent, 0.8, { flow: 'shrink' }));

  return () => {
    Ticker.shared.remove(onTick);
    for (const r of rings) {
      if (!r.g.destroyed) r.g.destroy();
    }
    rings.length = 0;
    if (!layer.destroyed) layer.destroy({ children: true });
  };
}
