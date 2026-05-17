import { Container, FederatedWheelEvent, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { GEAR_QUALITY_COLORS } from '../gearFarmDrops';
import type { GearFarmSlotPreview } from '../gearFarmProgress';
import { highestGearQuality } from '../gearItems';
import { loadGearIconTexture } from '../gearIconAssets';
import { mountGearSlotLevelBadge } from './gearSlotLevelBadge';

const FF = 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif';

/** 可掉落最高部位预览：与刷副本「可掉落最强装备」一致，默认 5 列网格 */
export const GEAR_FARM_PREVIEW_COLS = 5;

export function gearFarmPreviewGridMetrics(rowW: number, cols = GEAR_FARM_PREVIEW_COLS) {
  const gap = Math.round(10 * LAYOUT_SCALE);
  const colW = (rowW - (cols - 1) * gap) / cols;
  const iconSize = Math.min(
    Math.round(76 * LAYOUT_SCALE),
    Math.floor(colW - Math.round(12 * LAYOUT_SCALE)),
  );
  const nameBelow = Math.round(36 * LAYOUT_SCALE);
  const rowStride = iconSize + nameBelow + Math.round(8 * LAYOUT_SCALE);
  return { gap, colW, iconSize, rowStride, nameBelow };
}

/** 选关等窄版面：单行掉落预览压缩约 40 设计像素高度 */
export function gearFarmPreviewCompactMetrics(rowW: number, cols = GEAR_FARM_PREVIEW_COLS) {
  const gap = Math.round(8 * LAYOUT_SCALE);
  const colW = (rowW - (cols - 1) * gap) / cols;
  const iconSize = Math.min(
    Math.round(58 * LAYOUT_SCALE),
    Math.floor(colW - Math.round(8 * LAYOUT_SCALE)),
  );
  const nameBelow = Math.round(24 * LAYOUT_SCALE);
  const rowStride = iconSize + nameBelow + Math.round(4 * LAYOUT_SCALE);
  return { gap, colW, iconSize, rowStride, nameBelow };
}

/** 金板内：最高品质外观 + 图标右下角最高等级 + 装备名称 */
export function drawGearFarmPreviewSlot(
  parent: Container,
  centerX: number,
  centerY: number,
  cellW: number,
  iconSize: number,
  preview: GearFarmSlotPreview,
): void {
  const slot = new Container();
  slot.position.set(centerX, centerY);
  const gear = preview.farmGear;
  const hasGear = gear != null;
  const maxQuality = hasGear ? highestGearQuality(gear.qualities) : null;
  const qColor = maxQuality ? GEAR_QUALITY_COLORS[maxQuality] : 0x4a3d2e;
  const maxLevel = hasGear ? gear.levelMax : null;

  const bg = new Graphics();
  const r = Math.round(10 * LAYOUT_SCALE);
  bg.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, r).fill(0x2a2218).stroke({
    width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)),
    color: hasGear ? qColor : 0x4a3d2e,
  });
  slot.addChild(bg);

  const iconHost = new Container();
  slot.addChild(iconHost);

  const inner = iconSize * 0.88;
  const iconPlaceholder = new Graphics();
  iconPlaceholder
    .roundRect(-inner / 2, -inner / 2, inner, inner, Math.round(8 * LAYOUT_SCALE))
    .fill(hasGear ? { color: qColor, alpha: 0.28 } : 0x3d3024);
  iconHost.addChild(iconPlaceholder);

  if (hasGear) {
    void loadGearIconTexture(gear.gearId).then((tex) => {
      if (!tex || slot.destroyed) return;
      const spr = new Sprite(tex);
      const fit = inner * 0.92;
      const scale = Math.min(fit / spr.texture.width, fit / spr.texture.height);
      spr.scale.set(scale);
      spr.anchor.set(0.5);
      iconHost.addChild(spr);
    });
  }

  if (maxLevel != null) {
    mountGearSlotLevelBadge(slot, iconSize / 2, maxLevel, qColor);
  }

  const nameT = new Text({
    text: gear?.nameCn ?? '—',
    style: {
      fontFamily: FF,
      fontSize: Math.round(13 * LAYOUT_SCALE),
      fill: hasGear ? qColor : 0x64748b,
      fontWeight: '700',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: cellW - Math.round(8 * LAYOUT_SCALE),
    },
  });
  nameT.anchor.set(0.5, 0);
  nameT.position.set(0, iconSize / 2 + Math.round(8 * LAYOUT_SCALE));
  slot.addChild(nameT);

  parent.addChild(slot);
}

export function mountGearFarmPreviewGrid(
  parent: Container,
  x: number,
  y: number,
  w: number,
  previews: readonly GearFarmSlotPreview[],
): void {
  const { gap, colW, iconSize, rowStride } = gearFarmPreviewGridMetrics(w);

  let col = 0;
  let row = 0;

  for (const preview of previews) {
    const cx = x + col * (colW + gap) + colW / 2;
    const cy = y + row * rowStride + iconSize / 2;
    drawGearFarmPreviewSlot(parent, cx, cy, colW, iconSize, preview);

    col += 1;
    if (col >= GEAR_FARM_PREVIEW_COLS) {
      col = 0;
      row += 1;
    }
  }
}

/** 单行横向装备预览（不换行，超出可滚轮横滑） */
export function mountHorizontalGearFarmPreviewStrip(
  parent: Container,
  x: number,
  y: number,
  viewportW: number,
  previews: readonly GearFarmSlotPreview[],
  labelText = '掉落装备',
  labelFill = 0x94a3b8,
  iconsOffsetY = 0,
  compact = false,
): number {
  if (previews.length === 0) return 0;

  const label = new Text({
    text: labelText,
    style: {
      fontFamily: FF,
      fontSize: Math.round((compact ? 16 : 18) * LAYOUT_SCALE),
      fill: labelFill,
      fontWeight: '700',
    },
  });
  label.position.set(x, y);
  parent.addChild(label);

  const labelH = Math.round((compact ? 18 : 22) * LAYOUT_SCALE);
  const { gap, colW, iconSize, rowStride } = compact
    ? gearFarmPreviewCompactMetrics(viewportW)
    : gearFarmPreviewGridMetrics(viewportW);
  const stripY = y + labelH + iconsOffsetY;

  const viewport = new Container();
  viewport.position.set(x, stripY);
  viewport.eventMode = 'static';
  viewport.hitArea = new Rectangle(0, 0, viewportW, rowStride);
  parent.addChild(viewport);

  const maskG = new Graphics();
  maskG.rect(0, 0, viewportW, rowStride).fill(0xffffff);
  viewport.addChild(maskG);
  viewport.mask = maskG;

  const inner = new Container();
  viewport.addChild(inner);

  let cx = 0;
  for (const preview of previews) {
    const centerX = cx + colW / 2;
    const centerY = iconSize / 2;
    drawGearFarmPreviewSlot(inner, centerX, centerY, colW, iconSize, preview);
    cx += colW + gap;
  }

  const contentW = Math.max(0, cx - gap);
  let scrollX = 0;
  const scrollMin = (): number => Math.min(0, viewportW - contentW);
  const clampScroll = (): void => {
    scrollX = Math.max(scrollMin(), Math.min(0, scrollX));
    inner.x = scrollX;
  };

  viewport.on('wheel', (e: FederatedWheelEvent) => {
    e.stopPropagation();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    scrollX -= delta;
    clampScroll();
  });

  return labelH + rowStride;
}
