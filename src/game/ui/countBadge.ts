import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';

/** 红色圆点 + 白色数字（0 时隐藏整层）。圆心为 layer 局部原点，适合放在按钮右上角外偏一点。 */
export function paintRedCountBadge(layer: Container, count: number): void {
  layer.removeChildren();
  if (count <= 0) {
    layer.visible = false;
    return;
  }
  layer.visible = true;
  const r = Math.round(11 * LAYOUT_SCALE);
  const g = new Graphics();
  g.circle(0, 0, r)
    .fill(0xdc2626)
    .stroke({ width: Math.max(1, Math.round(2 * LAYOUT_SCALE)), color: 0xfef2f2 });
  const t = count > 99 ? '99+' : String(count);
  const lab = new Text({
    text: t,
    style: {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: Math.round(13 * LAYOUT_SCALE),
      fill: 0xffffff,
      fontWeight: '800',
    },
  });
  lab.anchor.set(0.5);
  layer.addChild(g);
  layer.addChild(lab);
}
