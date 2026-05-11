import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { getAllyPortraitTexture } from './allyPortraitAssets';
import { getHeroPortraitTexture } from './heroPortraitAssets';
import type { HeroId } from './heroRegistry';
import { getEnemyPortraitTexture } from './enemyPortraitTextures';
import { LAYOUT_SCALE } from './constants';
import type { AllyClass } from './types';
import type { EnemyPaintKind } from './battleVisuals';
import { BOSS_DEFS, ENEMY_DEFS } from './unitDefs';

/** 地图/预览等无具体兵种时：用语义「小兵 / 首领」参考配置里的碰撞半径（设计像素） */
export function battleInnerRadiusPx(isBoss: boolean): number {
  const design = isBoss ? BOSS_DEFS.blademaster.hitRadius : ENEMY_DEFS.grunt.hitRadius;
  return Math.round(design * LAYOUT_SCALE);
}

export function ringThicknessPx(): number {
  return Math.max(2, Math.round(3 * LAYOUT_SCALE));
}

/** 头顶飘字：按实际代币内圆半径，避免数字钻进圆里 */
export function unitFloatLabelOffsetYForInnerR(innerRadiusPx: number): number {
  return innerRadiusPx * 2 + ringThicknessPx() + Math.round(14 * LAYOUT_SCALE);
}

/** @deprecated 优先用 `unitFloatLabelOffsetYForInnerR`，此处仍按小兵/首领参考配置估算 */
export function unitFloatLabelOffsetY(isBoss: boolean): number {
  return unitFloatLabelOffsetYForInnerR(battleInnerRadiusPx(isBoss));
}

export const ALLY_DISK_COLORS: Record<AllyClass, number> = {
  warrior: 0xd4a574,
  mage: 0x60a5fa,
  priest: 0xf1f5f9,
  archer: 0x4ade80,
  knight: 0xf9a8d4,
};

export const ENEMY_MINION_DISK = 0xe5e7eb;
export const ENEMY_BOSS_DISK = 0xfecaca;

export const BATTLE_ALLY_HP_RING_COLOR = 0x22c55e;
export const BATTLE_ENEMY_HP_RING_COLOR = 0xef4444;
const LOST_ALPHA = 0.2;

function allyLetter(kind: AllyClass): string {
  switch (kind) {
    case 'warrior':
      return '战';
    case 'mage':
      return '法';
    case 'priest':
      return '牧';
    case 'archer':
      return '弓';
    case 'knight':
      return '骑';
    default:
      return '?';
  }
}

function enemyLetter(paint: EnemyPaintKind): string {
  if (paint.startsWith('boss_')) return '首';
  return '敌';
}

export type BattleTokenParts = {
  root: Container;
  ringCur: Graphics;
  ringLost: Graphics;
  /** 圆内脸：纯色盘+字，或已加载时的立绘 Sprite + 描边 */
  disk: Container;
  letter: Text;
  ringR: number;
  thick: number;
  cx: number;
  cy: number;
};

function diskOutlineWidth(innerR: number): number {
  return Math.max(1.5, Math.round(Math.min(2.5, innerR * 0.06)));
}

/** 盟友：有预加载立绘则圆内贴图，否则同色盘 + 简称字 */
function buildAllyDiskAndLetter(innerR: number, kind: AllyClass): { disk: Container; letter: Text } {
  const tex = getAllyPortraitTexture(kind);
  const cx = 0;
  const cy = -innerR;
  const disk = new Container();
  const outline = diskOutlineWidth(innerR);
  const rFill = Math.max(2, innerR - outline);

  if (tex) {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(cx, cy);
    const d = rFill * 2;
    sprite.width = d;
    sprite.height = d;
    const rim = new Graphics();
    rim.circle(cx, cy, rFill).stroke({ width: outline, color: 0x0f172a, alpha: 0.5 });
    disk.addChild(sprite);
    disk.addChild(rim);
  } else {
    const g = new Graphics();
    g.circle(cx, cy, rFill).fill(ALLY_DISK_COLORS[kind]).stroke({
      width: outline,
      color: 0x0f172a,
      alpha: 0.5,
    });
    disk.addChild(g);
  }

  const fs = Math.max(11, Math.round(innerR * 0.92));
  const letterNode = new Text({
    text: allyLetter(kind),
    style: {
      fontFamily: 'system-ui, Segoe UI, "Microsoft YaHei", sans-serif',
      fontSize: fs,
      fill: 0x0f172a,
      fontWeight: '900',
    },
  });
  letterNode.anchor.set(0.5, 0.55);
  letterNode.position.set(cx, cy - innerR * 0.06);
  letterNode.visible = !tex;
  return { disk, letter: letterNode };
}

/** 英雄：有预加载立绘则圆内贴图，否则同色盘 + 职业简称（与盟友一致） */
function buildHeroDiskAndLetter(innerR: number, heroId: HeroId, allyKind: AllyClass): { disk: Container; letter: Text } {
  const tex = getHeroPortraitTexture(heroId);
  const cx = 0;
  const cy = -innerR;
  const disk = new Container();
  const outline = diskOutlineWidth(innerR);
  const rFill = Math.max(2, innerR - outline);

  if (tex) {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(cx, cy);
    const d = rFill * 2;
    sprite.width = d;
    sprite.height = d;
    const rim = new Graphics();
    rim.circle(cx, cy, rFill).stroke({ width: outline, color: 0x0f172a, alpha: 0.5 });
    disk.addChild(sprite);
    disk.addChild(rim);
  } else {
    const g = new Graphics();
    g.circle(cx, cy, rFill).fill(ALLY_DISK_COLORS[allyKind]).stroke({
      width: outline,
      color: 0x0f172a,
      alpha: 0.5,
    });
    disk.addChild(g);
  }

  const fs = Math.max(11, Math.round(innerR * 0.92));
  const letterNode = new Text({
    text: allyLetter(allyKind),
    style: {
      fontFamily: 'system-ui, Segoe UI, "Microsoft YaHei", sans-serif',
      fontSize: fs,
      fill: 0x0f172a,
      fontWeight: '900',
    },
  });
  letterNode.anchor.set(0.5, 0.55);
  letterNode.position.set(cx, cy - innerR * 0.06);
  letterNode.visible = !tex;
  return { disk, letter: letterNode };
}

/** 英雄外圈金边（战斗：画在环形血条半径之外；应叠在血环与圆盘之上才看得见） */
function buildHeroGoldRingOutsideHp(cx: number, cy: number, ringR: number, hpRingThick: number): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  const goldThick = Math.max(2.5, hpRingThick * 0.5);
  /** 血环中心线在 ringR，外缘约 ringR+hpRingThick/2；金环中心线再外移 */
  const goldR = ringR + hpRingThick * 0.55 + goldThick * 0.38;
  g.circle(cx, cy, goldR).stroke({
    width: goldThick,
    color: 0xc8941a,
    alpha: 1,
    cap: 'round',
    join: 'round',
  });
  return g;
}

/** 英雄外圈金边（无血环 UI：贴在肖像圆外缘；叠在圆盘之上） */
function buildHeroDraftGoldRing(cx: number, cy: number, innerR: number): Graphics {
  const outline = diskOutlineWidth(innerR);
  const rFill = Math.max(2, innerR - outline);
  const g = new Graphics();
  g.eventMode = 'none';
  const goldThick = Math.max(2.5, innerR * 0.078);
  const goldR = rFill + goldThick * 0.44;
  g.circle(cx, cy, goldR).stroke({
    width: goldThick,
    color: 0xc8941a,
    alpha: 1,
    cap: 'round',
    join: 'round',
  });
  return g;
}

/** 敌方：有预加载圆形半身像则圆内贴图，否则灰/浅红盘 + 敌/首字 */
function buildEnemyDiskAndLetter(
  innerR: number,
  paint: EnemyPaintKind,
): { disk: Container; letter: Text } {
  const tex = getEnemyPortraitTexture(paint);
  const cx = 0;
  const cy = -innerR;
  const disk = new Container();
  const outline = diskOutlineWidth(innerR);
  const rFill = Math.max(2, innerR - outline);
  const diskColor = paint.startsWith('boss_') ? ENEMY_BOSS_DISK : ENEMY_MINION_DISK;

  if (tex) {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(cx, cy);
    const d = rFill * 2;
    sprite.width = d;
    sprite.height = d;
    const rim = new Graphics();
    rim.circle(cx, cy, rFill).stroke({ width: outline, color: 0x0f172a, alpha: 0.5 });
    disk.addChild(sprite);
    disk.addChild(rim);
  } else {
    const g = new Graphics();
    g.circle(cx, cy, rFill).fill(diskColor).stroke({
      width: outline,
      color: 0x0f172a,
      alpha: 0.5,
    });
    disk.addChild(g);
  }

  const fs = Math.max(11, Math.round(innerR * 0.92));
  const letterNode = new Text({
    text: enemyLetter(paint),
    style: {
      fontFamily: 'system-ui, Segoe UI, "Microsoft YaHei", sans-serif',
      fontSize: fs,
      fill: 0x0f172a,
      fontWeight: '900',
    },
  });
  letterNode.anchor.set(0.5, 0.55);
  letterNode.position.set(cx, cy - innerR * 0.06);
  letterNode.visible = !tex;
  return { disk, letter: letterNode };
}

/** 双层环形血条：实心弧 = 当前血量；其余弧同色 20% 透明 = 已损失 */
export function redrawHpRingPair(
  ringCur: Graphics,
  ringLost: Graphics,
  cx: number,
  cy: number,
  ringR: number,
  thick: number,
  ratio: number,
  solidColor: number,
): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  ringCur.clear();
  ringLost.clear();

  const start = -Math.PI / 2;

  if (clamped <= 0.001) {
    ringLost
      .circle(cx, cy, ringR)
      .stroke({ width: thick, color: solidColor, alpha: LOST_ALPHA, cap: 'round', join: 'round' });
    return;
  }

  if (clamped >= 0.999) {
    ringCur.circle(cx, cy, ringR).stroke({ width: thick, color: solidColor, alpha: 1, cap: 'round', join: 'round' });
    return;
  }

  const sweep = Math.PI * 2 * clamped;
  const endCur = start + sweep;
  ringCur
    .arc(cx, cy, ringR, start, endCur, false)
    .stroke({ width: thick, color: solidColor, alpha: 1, cap: 'butt', join: 'round' });

  ringLost
    .arc(cx, cy, ringR, endCur, start + Math.PI * 2, false)
    .stroke({ width: thick, color: solidColor, alpha: LOST_ALPHA, cap: 'butt', join: 'round' });
}

export function createBattleAllyToken(kind: AllyClass, innerRadiusPx: number): BattleTokenParts {
  const innerR = innerRadiusPx;
  const cx = 0;
  const cy = -innerR;
  const thick = ringThicknessPx();
  const ringR = innerR + thick * 0.65;

  const root = new Container();
  const ringLost = new Graphics();
  const ringCur = new Graphics();
  const { disk, letter } = buildAllyDiskAndLetter(innerR, kind);

  root.addChild(ringLost);
  root.addChild(ringCur);
  root.addChild(disk);
  root.addChild(letter);

  redrawHpRingPair(ringCur, ringLost, cx, cy, ringR, thick, 1, BATTLE_ALLY_HP_RING_COLOR);
  return { root, ringCur, ringLost, disk, letter, ringR, thick, cx, cy };
}

export function createBattleHeroToken(heroId: HeroId, allyKind: AllyClass, innerRadiusPx: number): BattleTokenParts {
  const innerR = innerRadiusPx;
  const cx = 0;
  const cy = -innerR;
  const thick = ringThicknessPx();
  const ringR = innerR + thick * 0.65;

  const root = new Container();
  const ringLost = new Graphics();
  const ringCur = new Graphics();
  const { disk, letter } = buildHeroDiskAndLetter(innerR, heroId, allyKind);
  const goldRing = buildHeroGoldRingOutsideHp(cx, cy, ringR, thick);

  root.addChild(ringLost);
  root.addChild(ringCur);
  root.addChild(disk);
  root.addChild(goldRing);
  root.addChild(letter);

  redrawHpRingPair(ringCur, ringLost, cx, cy, ringR, thick, 1, BATTLE_ALLY_HP_RING_COLOR);
  return { root, ringCur, ringLost, disk, letter, ringR, thick, cx, cy };
}

export function createBattleEnemyToken(paint: EnemyPaintKind, innerRadiusPx: number): BattleTokenParts {
  const innerR = innerRadiusPx;
  const cx = 0;
  const cy = -innerR;
  const thick = ringThicknessPx();
  const ringR = innerR + thick * 0.65;
  const ringColor = BATTLE_ENEMY_HP_RING_COLOR;

  const root = new Container();
  const ringLost = new Graphics();
  const ringCur = new Graphics();
  const { disk, letter } = buildEnemyDiskAndLetter(innerR, paint);

  root.addChild(ringLost);
  root.addChild(ringCur);
  root.addChild(disk);
  root.addChild(letter);

  redrawHpRingPair(ringCur, ringLost, cx, cy, ringR, thick, 1, ringColor);
  return { root, ringCur, ringLost, disk, letter, ringR, thick, cx, cy };
}

/** 肉鸽 / 预览：仅圆 + 占位字，无血环 */
export function createDraftAllyToken(kind: AllyClass, diameterPx: number): Container {
  const innerR = Math.max(10, diameterPx / 2);
  const root = new Container();
  const { disk, letter } = buildAllyDiskAndLetter(innerR, kind);
  root.addChild(disk);
  root.addChild(letter);
  return root;
}

/** 强化 / 选牌右侧：按英雄 id 显示圆形立绘，缺图时回退职业色盘 */
export function createDraftHeroToken(heroId: HeroId, allyKind: AllyClass, diameterPx: number): Container {
  const innerR = Math.max(10, diameterPx / 2);
  const cx = 0;
  const cy = -innerR;
  const root = new Container();
  const { disk, letter } = buildHeroDiskAndLetter(innerR, heroId, allyKind);
  const goldRing = buildHeroDraftGoldRing(cx, cy, innerR);
  root.addChild(disk);
  root.addChild(goldRing);
  root.addChild(letter);
  return root;
}

export function enemyTokenDiameterForVariant(
  variant: 'battle' | 'mapMini' | 'mapPreviewModal' | 'chapterMini',
  isBoss: boolean,
): number {
  const battleD = battleInnerRadiusPx(isBoss) * 2 + ringThicknessPx() * 2;
  switch (variant) {
    case 'battle':
      return battleD;
    case 'mapMini':
      return Math.max(22, Math.round(battleD * 0.44));
    case 'mapPreviewModal':
      return Math.max(52, Math.round(battleD * 0.95));
    case 'chapterMini':
      return Math.max(44, Math.round(battleD * 0.84));
    default:
      return battleD;
  }
}

/** 敌方预览卡内放大代币但不挤出卡片 */
export function clampMapPreviewTokenDiameter(d: number, cardW: number, cardH: number): number {
  const cap = Math.min(cardW * 0.84, cardH * 0.62);
  return Math.min(d, cap);
}

/** 地图 / 章节界面用小圆令牌（无血环）；`maxDiameterPx` 可限制在卡片内 */
export function createMapEnemyToken(
  paint: EnemyPaintKind,
  variant: 'battle' | 'mapMini' | 'mapPreviewModal' | 'chapterMini',
  maxDiameterPx?: number,
): Container {
  const boss = paint.startsWith('boss_');
  let d = enemyTokenDiameterForVariant(variant, boss);
  if (maxDiameterPx != null && maxDiameterPx > 0) {
    d = Math.min(d, maxDiameterPx);
  }
  const innerR = d / 2;
  const root = new Container();
  const { disk, letter } = buildEnemyDiskAndLetter(innerR, paint);
  root.addChild(disk);
  root.addChild(letter);
  return root;
}
