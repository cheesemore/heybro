import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';

const FF = 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif';

/** 装备槽图标右下角等级角标 */
export function mountGearSlotLevelBadge(
  parent: Container,
  iconHalfSize: number,
  level: number,
  strokeColor: number,
): void {
  const badge = new Container();
  const badgePadX = Math.round(6 * LAYOUT_SCALE);
  const badgePadY = Math.round(3 * LAYOUT_SCALE);
  const badgeFont = Math.round(13 * LAYOUT_SCALE);
  const levelLabel = String(level);
  const badgeBg = new Graphics();
  const badgeW = badgePadX * 2 + levelLabel.length * badgeFont * 0.58;
  const badgeH = badgeFont + badgePadY * 2;
  badgeBg
    .roundRect(-badgeW, -badgeH, badgeW, badgeH, Math.round(5 * LAYOUT_SCALE))
    .fill({ color: 0x0f172a, alpha: 0.88 })
    .stroke({ width: Math.max(1, Math.round(1.5 * LAYOUT_SCALE)), color: strokeColor });
  badge.addChild(badgeBg);
  const levelT = new Text({
    text: levelLabel,
    style: {
      fontFamily: FF,
      fontSize: badgeFont,
      fill: 0xf8fafc,
      fontWeight: '800',
    },
  });
  levelT.anchor.set(1, 1);
  levelT.position.set(-badgePadX, -badgePadY);
  badge.addChild(levelT);
  badge.position.set(iconHalfSize, iconHalfSize);
  parent.addChild(badge);
}
