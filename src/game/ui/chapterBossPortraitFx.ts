import { Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { spawnRingPulse, tickRingPulses, type RingPulse } from '../battleVisuals';
import { GOLDEN_PANEL_ACCENT } from './goldenSolidPanel';

const GOLD_DARK = { r: 120, g: 72, b: 28 };
const GOLD_MID = { r: 200, g: 140, b: 48 };
const GOLD_WHITE = { r: 255, g: 248, b: 230 };

function lerpRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

/** 分段描边圆环纹理（旋转后形成金色流光外圈） */
function createGoldenFlowRingTexture(outerPx: number, innerPx: number): Texture {
  const outer = Math.max(8, Math.round(outerPx));
  const inner = Math.max(4, Math.min(outer - 3, Math.round(innerPx)));
  const pad = Math.round(10 * LAYOUT_SCALE);
  const size = outer * 2 + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.WHITE;

  const cx = size / 2;
  const cy = size / 2;
  const midR = (outer + inner) / 2;
  const lineW = outer - inner;
  const segments = 72;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;
    const midA = (a0 + a1) / 2;
    const wave =
      0.55 * ((Math.sin(midA * 3) + 1) / 2) + 0.45 * ((Math.sin(midA * 5 + 0.9) + 1) / 2);
    const shine = 0.12 + 0.88 * Math.pow(wave, 1.35);
    const col = lerpRgb(lerpRgb(GOLD_DARK, GOLD_MID, shine * 0.55), GOLD_WHITE, shine);
    const alpha = 0.28 + shine * 0.72;

    ctx.beginPath();
    ctx.arc(cx, cy, midR, a0, a1 + 0.04);
    ctx.strokeStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'butt';
    ctx.stroke();
  }

  return Texture.from(canvas);
}

/** 章节板关底首领头像：金色旋转流光外圈 + 呼吸光晕 + 扩散脉冲环 */
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

  const outerRingOuter = radius * 1.1;
  const outerRingInner = radius * 0.93;
  const outerRingTex = createGoldenFlowRingTexture(outerRingOuter, outerRingInner);
  const flowRing = new Sprite(outerRingTex);
  flowRing.anchor.set(0.5);
  flowRing.eventMode = 'none';
  layer.addChild(flowRing);

  const haloOuter = radius * 1.18;
  const haloInner = radius * 1.02;
  const haloTex = createGoldenFlowRingTexture(haloOuter, haloInner);
  const flowHalo = new Sprite(haloTex);
  flowHalo.anchor.set(0.5);
  flowHalo.alpha = 0.42;
  flowHalo.eventMode = 'none';
  layer.addChildAt(flowHalo, 0);

  const glow = new Graphics();
  layer.addChild(glow);

  const rings: RingPulse[] = [];
  let pulseTimer = 0;
  let phase = 0;
  let flowRot = 0;
  let haloRot = 0;
  const accent = GOLDEN_PANEL_ACCENT;
  const flare = 0xf59e0b;

  const onTick = (): void => {
    if (layer.destroyed) return;
    const dt = Ticker.shared.deltaMS / 1000;
    phase += dt;
    flowRot += dt * 1.35;
    haloRot -= dt * 0.55;
    flowRing.rotation = flowRot;
    flowHalo.rotation = haloRot;

    const breathe = 0.88 + Math.sin(phase * 2.3) * 0.12;
    glow.clear();
    glow
      .circle(0, 0, radius * 0.7 * breathe)
      .fill({ color: accent, alpha: 0.2 + Math.sin(phase * 2.9) * 0.08 });
    glow
      .circle(0, 0, radius * 0.62)
      .stroke({
        width: Math.max(2, Math.round(3 * LAYOUT_SCALE)),
        color: accent,
        alpha: 0.5 + Math.sin(phase * 2.6) * 0.18,
      });
    glow.circle(0, 0, radius * 0.54).stroke({
      width: Math.max(2, Math.round(2 * LAYOUT_SCALE)),
      color: flare,
      alpha: 0.32 + Math.sin(phase * 3.4 + 0.8) * 0.14,
    });

    pulseTimer += dt;
    if (pulseTimer >= 0.72) {
      pulseTimer = 0;
      rings.push(
        spawnRingPulse(layer, 0, 0, radius * 0.5, accent, 1),
        spawnRingPulse(layer, 0, 0, radius * 0.78, flare, 1.15, { delay: 0.1 }),
      );
    }
    tickRingPulses(rings, dt);
  };

  Ticker.shared.add(onTick);
  rings.push(spawnRingPulse(layer, 0, 0, radius * 0.44, accent, 0.85, { flow: 'shrink' }));

  return () => {
    Ticker.shared.remove(onTick);
    for (const r of rings) {
      if (!r.g.destroyed) r.g.destroy();
    }
    rings.length = 0;
    if (!flowRing.destroyed) {
      flowRing.destroy();
      outerRingTex.destroy(true);
    }
    if (!flowHalo.destroyed) {
      flowHalo.destroy();
      haloTex.destroy(true);
    }
    if (!layer.destroyed) layer.destroy({ children: true });
  };
};
