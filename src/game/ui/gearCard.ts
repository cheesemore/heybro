import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { GEAR_QUALITY_COLORS } from '../gearFarmDrops';
import { loadGearIconTexture } from '../gearIconAssets';
import { GEAR_QUALITY_LABELS_CN } from '../gearItems';
import type { PlayerGearInstance } from '../playerGearInstance';
import { mountGearSlotLevelBadge } from './gearSlotLevelBadge';

const FF = 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif';

export type GearCardLayout = {
  width: number;
  iconSize: number;
  /** 对比弹窗等紧凑场景 */
  compact?: boolean;
};

export type GearCardGsArrow = 'up' | 'down' | null;

/** 装备卡片：图标、名称、GS（可选升降箭头）、占位属性 */
export function mountGearCard(
  parent: Container,
  centerX: number,
  topY: number,
  gear: PlayerGearInstance,
  layout: GearCardLayout,
  gsArrow: GearCardGsArrow = null,
): number {
  const card = new Container();
  card.position.set(centerX, topY);

  const w = layout.width;
  const iconS = layout.iconSize;
  const compact = layout.compact === true;
  const qColor = GEAR_QUALITY_COLORS[gear.quality];

  const nameT = new Text({
    text: gear.nameCn,
    style: {
      fontFamily: FF,
      fontSize: Math.round((compact ? 15 : 18) * LAYOUT_SCALE),
      fill: qColor,
      fontWeight: '800',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: w - Math.round(compact ? 10 : 16) * LAYOUT_SCALE,
    },
  });
  nameT.anchor.set(0.5, 0);
  nameT.position.set(0, 0);
  card.addChild(nameT);

  const iconY =
    nameT.height + Math.round((compact ? 8 : 18) * LAYOUT_SCALE) + iconS / 2;
  const iconWrap = new Container();
  iconWrap.position.set(0, iconY);

  const bg = new Graphics();
  bg.roundRect(-iconS / 2, -iconS / 2, iconS, iconS, Math.round(10 * LAYOUT_SCALE))
    .fill(0x1e293b)
    .stroke({ width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)), color: qColor });
  iconWrap.addChild(bg);

  const iconHost = new Container();
  iconWrap.addChild(iconHost);

  const inset = iconS * 0.88;
  const iconPlaceholder = new Graphics();
  iconPlaceholder
    .roundRect(-inset / 2, -inset / 2, inset, inset, Math.round(6 * LAYOUT_SCALE))
    .fill({ color: qColor, alpha: 0.35 });
  iconHost.addChild(iconPlaceholder);

  void loadGearIconTexture(gear.gearId).then((tex) => {
    if (!tex || card.destroyed) return;
    const spr = new Sprite(tex);
    const fit = inset * 0.92;
    const scale = Math.min(fit / spr.texture.width, fit / spr.texture.height);
    spr.scale.set(scale);
    spr.anchor.set(0.5);
    iconHost.addChild(spr);
  });

  mountGearSlotLevelBadge(iconWrap, iconS / 2, gear.level, qColor);

  card.addChild(iconWrap);

  const qLabel = GEAR_QUALITY_LABELS_CN[gear.quality];
  const arrow = gsArrow === 'up' ? ' ▲' : gsArrow === 'down' ? ' ▼' : '';
  const arrowColor = gsArrow === 'up' ? 0x4ade80 : gsArrow === 'down' ? 0xf87171 : 0xe2e8f0;

  const gsRowY = iconY + iconS / 2 + Math.round((compact ? 10 : 22) * LAYOUT_SCALE);
  const gsFont = Math.round((compact ? 17 : 20) * LAYOUT_SCALE);
  const gsMain = new Text({
    text: `GS ${gear.gs}`,
    style: {
      fontFamily: FF,
      fontSize: gsFont,
      fill: 0xf1f5f9,
      fontWeight: '800',
    },
  });
  gsMain.anchor.set(0.5, 0);
  gsMain.position.set(arrow.length > 0 ? -Math.round(8 * LAYOUT_SCALE) : 0, gsRowY);
  card.addChild(gsMain);

  if (arrow.length > 0) {
    const gsArrowT = new Text({
      text: arrow,
      style: {
        fontFamily: FF,
        fontSize: gsFont,
        fill: arrowColor,
        fontWeight: '800',
      },
    });
    gsArrowT.anchor.set(0, 0);
    gsArrowT.position.set(gsMain.x + gsMain.width / 2 + Math.round(4 * LAYOUT_SCALE), gsRowY);
    card.addChild(gsArrowT);
  }

  const metaY = gsRowY + gsMain.height + Math.round((compact ? 6 : 10) * LAYOUT_SCALE);
  const meta = new Text({
    text: `${qLabel} · ${gear.level}级`,
    style: {
      fontFamily: FF,
      fontSize: Math.round((compact ? 13 : 15) * LAYOUT_SCALE),
      fill: 0x94a3b8,
      fontWeight: '600',
      align: 'center',
    },
  });
  meta.anchor.set(0.5, 0);
  meta.position.set(0, metaY);
  card.addChild(meta);

  parent.addChild(card);
  return metaY + meta.height;
}
