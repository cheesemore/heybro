import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { getAllyPortraitTexture } from './allyPortraitAssets';
import { getHeroPortraitTexture } from './heroPortraitAssets';
import { getHeroDef, heroQualityAccent, type HeroId } from './heroRegistry';
import { getEnemyPortraitTexture, getWowCirclePortraitTexture } from './enemyPortraitTextures';
import { LAYOUT_SCALE } from './constants';
import type { AllyClass } from './types';
import type { EnemyPaintKind } from './battleVisuals';
import { ENEMY_DEFS } from './unitDefs';
import { WOW_BOOK_BOSS_TABLE_DEFAULT } from './wowBookData';

/** 地图/预览等无具体兵种时：用语义「小兵 / 首领」参考配置里的碰撞半径（设计像素） */
export function battleInnerRadiusPx(isBoss: boolean): number {
  const design = isBoss ? WOW_BOOK_BOSS_TABLE_DEFAULT.hitRadius : ENEMY_DEFS.grunt.hitRadius;
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
/** 护盾弧（紫），叠在血条缺口上；溢出段在外环反向延伸 */
export const BATTLE_SHIELD_RING_PURPLE = 0xa855f7;
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
  /** 护盾环形条（紫），位于 ringLost 之上、ringCur 之下 */
  ringShield: Graphics;
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

/**
 * 环形血条描边外缘到圆盘中心的距离（与 `redrawHpRingPair` 的 `circle(cx,cy,ringR).stroke({width:thick})` 一致：描边以 ringR 为中心线）。
 */
export function battleTokenHpRingOuterRadiusPx(ringR: number, thick: number): number {
  return ringR + thick * 0.5;
}

/**
 * 战斗圆形代币：肖像/色盘填充圆半径（与 `buildAllyDiskAndLetter` 中 `rFill` 一致），
 * 圆心为圆盘几何中心；旋风斩刀刃内缘见 `battleTokenHpRingOuterRadiusPx` + 间隙。
 */
export function battleTokenDiskFillRadiusPx(innerRadiusPx: number): number {
  const outline = diskOutlineWidth(innerRadiusPx);
  return Math.max(2, innerRadiusPx - outline);
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

/** 英雄：有预加载立绘则圆内贴图，否则同色盘 + 职业简称；`portraitLocked` 时隐藏立绘仅显示「?」占位 */
function buildHeroDiskAndLetter(
  innerR: number,
  heroId: HeroId,
  allyKind: AllyClass,
  portraitLocked: boolean,
): { disk: Container; letter: Text } {
  const cx = 0;
  const cy = -innerR;
  const disk = new Container();
  const outline = diskOutlineWidth(innerR);
  const rFill = Math.max(2, innerR - outline);
  const q = getHeroDef(heroId)?.quality ?? 1;
  const qFill = heroQualityAccent(q);

  if (portraitLocked) {
    const g = new Graphics();
    g.circle(cx, cy, rFill).fill(0x334155).stroke({
      width: outline,
      color: 0x0f172a,
      alpha: 0.55,
    });
    disk.addChild(g);
    const fs = Math.max(14, Math.round(innerR * 1.05));
    const letterNode = new Text({
      text: '?',
      style: {
        fontFamily: 'system-ui, Segoe UI, "Microsoft YaHei", sans-serif',
        fontSize: fs,
        fill: qFill,
        fontWeight: '900',
      },
    });
    letterNode.anchor.set(0.5, 0.55);
    letterNode.position.set(cx, cy - innerR * 0.06);
    letterNode.visible = true;
    return { disk, letter: letterNode };
  }

  const tex = getHeroPortraitTexture(heroId);

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

/** 英雄品质外圈（战斗：画在环形血条半径之外；叠在血环与圆盘之上） */
function buildHeroQualityRingOutsideHp(
  cx: number,
  cy: number,
  ringR: number,
  hpRingThick: number,
  ringColor: number,
): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  const ringThick = Math.max(2.5, hpRingThick * 0.5);
  const ringOuterR = ringR + hpRingThick * 0.55 + ringThick * 0.38;
  g.circle(cx, cy, ringOuterR).stroke({
    width: ringThick,
    color: ringColor,
    alpha: 1,
    cap: 'round',
    join: 'round',
  });
  return g;
}

/** 英雄品质外圈（无血环 UI：贴在肖像圆外缘） */
function buildHeroDraftQualityRing(cx: number, cy: number, innerR: number, ringColor: number): Graphics {
  const outline = diskOutlineWidth(innerR);
  const rFill = Math.max(2, innerR - outline);
  const g = new Graphics();
  g.eventMode = 'none';
  const ringThick = Math.max(2.5, innerR * 0.078);
  const ringR = rFill + ringThick * 0.44;
  g.circle(cx, cy, ringR).stroke({
    width: ringThick,
    color: ringColor,
    alpha: 1,
    cap: 'round',
    join: 'round',
  });
  return g;
}

/** 敌方：优先用书圆形立绘（已预加载），否则兵种圆形半身像，再否则灰/浅红盘 + 敌/首字 */
function buildEnemyDiskAndLetter(
  innerR: number,
  paint: EnemyPaintKind,
  wowCirclePortraitUid?: string,
): { disk: Container; letter: Text } {
  const circleTex = wowCirclePortraitUid ? getWowCirclePortraitTexture(wowCirclePortraitUid) : undefined;
  const tex = circleTex ?? getEnemyPortraitTexture(paint);
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

/**
 * 环形血条 + 护盾：先绘 HP（同 `redrawHpRingPair`），再绘紫色护盾。
 * 护盾量以 `shieldRatio = shield/maxHp`（0～1）计：优先填满当前血条缺口（已损失弧段），溢出部分在外环沿反向延伸。
 */
export function redrawHpRingWithShield(
  ringCur: Graphics,
  ringLost: Graphics,
  ringShield: Graphics,
  cx: number,
  cy: number,
  ringR: number,
  thick: number,
  hpRatio: number,
  shieldRatio: number,
  solidColor: number,
): void {
  redrawHpRingPair(ringCur, ringLost, cx, cy, ringR, thick, hpRatio, solidColor);
  ringShield.clear();
  const sh = Math.max(0, Math.min(1, shieldRatio));
  if (sh < 1e-5) return;
  const hp = Math.max(0, Math.min(1, hpRatio));
  const start = -Math.PI / 2;
  const hpSweep = Math.PI * 2 * hp;
  const endHp = start + hpSweep;
  const lostSweep = Math.PI * 2 - hpSweep;
  const shieldRad = Math.PI * 2 * sh;
  const onLost = Math.min(shieldRad, lostSweep);
  const strokeGap = {
    width: Math.max(2, thick * 0.9),
    color: BATTLE_SHIELD_RING_PURPLE,
    alpha: 0.92,
    cap: 'butt' as const,
    join: 'round' as const,
  };
  if (onLost > 1e-5) {
    const e2 = endHp + onLost;
    ringShield.arc(cx, cy, ringR, endHp, e2, false).stroke(strokeGap);
  }
  const over = shieldRad - onLost;
  if (over > 1e-5) {
    const outerR = ringR + thick * 0.62;
    const a0 = start;
    const a1 = start - over;
    ringShield
      .arc(cx, cy, outerR, a0, a1, true)
      .stroke({
        width: Math.max(2, thick * 0.78),
        color: BATTLE_SHIELD_RING_PURPLE,
        alpha: 0.88,
        cap: 'butt',
        join: 'round',
      });
  }
}

export function createBattleAllyToken(kind: AllyClass, innerRadiusPx: number): BattleTokenParts {
  const innerR = innerRadiusPx;
  const cx = 0;
  const cy = -innerR;
  const thick = ringThicknessPx();
  const ringR = innerR + thick * 0.65;

  const root = new Container();
  const ringLost = new Graphics();
  const ringShield = new Graphics();
  const ringCur = new Graphics();
  const { disk, letter } = buildAllyDiskAndLetter(innerR, kind);

  root.addChild(ringLost);
  root.addChild(ringShield);
  root.addChild(ringCur);
  root.addChild(disk);
  root.addChild(letter);

  redrawHpRingWithShield(ringCur, ringLost, ringShield, cx, cy, ringR, thick, 1, 0, BATTLE_ALLY_HP_RING_COLOR);
  return { root, ringCur, ringLost, ringShield, disk, letter, ringR, thick, cx, cy };
}

export function createBattleHeroToken(
  heroId: HeroId,
  allyKind: AllyClass,
  innerRadiusPx: number,
  skillTierSuffix = '',
): BattleTokenParts {
  const innerR = innerRadiusPx;
  const cx = 0;
  const cy = -innerR;
  const thick = ringThicknessPx();
  const ringR = innerR + thick * 0.65;

  const root = new Container();
  const ringLost = new Graphics();
  const ringShield = new Graphics();
  const ringCur = new Graphics();
  const { disk, letter } = buildHeroDiskAndLetter(innerR, heroId, allyKind, false);
  const def = getHeroDef(heroId);
  const ringColor = heroQualityAccent(def?.quality ?? 1);
  const qualityRing = buildHeroQualityRingOutsideHp(cx, cy, ringR, thick, ringColor);

  root.addChild(ringLost);
  root.addChild(ringShield);
  root.addChild(ringCur);
  root.addChild(disk);
  root.addChild(qualityRing);
  root.addChild(letter);
  if (skillTierSuffix) {
    const tag = new Text({
      text: skillTierSuffix,
      style: {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: Math.max(9, Math.round(11 * LAYOUT_SCALE)),
        fill: 0xfbbf24,
        fontWeight: '800',
        stroke: { color: 0x451a03, width: Math.max(1, Math.round(2 * LAYOUT_SCALE)) },
      },
    });
    tag.anchor.set(0.5, 1);
    tag.position.set(cx, cy + innerR * 0.72);
    root.addChild(tag);
  }

  redrawHpRingWithShield(ringCur, ringLost, ringShield, cx, cy, ringR, thick, 1, 0, ringColor);
  return { root, ringCur, ringLost, ringShield, disk, letter, ringR, thick, cx, cy };
}

export type BattleEnemyTokenOptions = {
  wowCirclePortraitUid?: string;
};

export function createBattleEnemyToken(
  paint: EnemyPaintKind,
  innerRadiusPx: number,
  opts?: BattleEnemyTokenOptions,
): BattleTokenParts {
  const innerR = innerRadiusPx;
  const cx = 0;
  const cy = -innerR;
  const thick = ringThicknessPx();
  const ringR = innerR + thick * 0.65;
  const ringColor = BATTLE_ENEMY_HP_RING_COLOR;

  const root = new Container();
  const ringLost = new Graphics();
  const ringShield = new Graphics();
  const ringCur = new Graphics();
  const { disk, letter } = buildEnemyDiskAndLetter(innerR, paint, opts?.wowCirclePortraitUid);

  root.addChild(ringLost);
  root.addChild(ringShield);
  root.addChild(ringCur);
  root.addChild(disk);
  root.addChild(letter);

  redrawHpRingWithShield(ringCur, ringLost, ringShield, cx, cy, ringR, thick, 1, 0, ringColor);
  return { root, ringCur, ringLost, ringShield, disk, letter, ringR, thick, cx, cy };
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

/** 强化 / 选牌右侧：按英雄 id 显示圆形立绘；`portraitLocked` 时头像为问号，品质外框仍显示 */
export function createDraftHeroToken(
  heroId: HeroId,
  allyKind: AllyClass,
  diameterPx: number,
  opts?: { portraitLocked?: boolean },
): Container {
  const innerR = Math.max(10, diameterPx / 2);
  const cx = 0;
  const cy = -innerR;
  const root = new Container();
  const def = getHeroDef(heroId);
  const ringColor = heroQualityAccent(def?.quality ?? 1);
  const { disk, letter } = buildHeroDiskAndLetter(innerR, heroId, allyKind, !!opts?.portraitLocked);
  const qualityRing = buildHeroDraftQualityRing(cx, cy, innerR, ringColor);
  root.addChild(disk);
  root.addChild(qualityRing);
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
  tokenOpts?: BattleEnemyTokenOptions,
): Container {
  const boss = paint.startsWith('boss_');
  let d = enemyTokenDiameterForVariant(variant, boss);
  if (maxDiameterPx != null && maxDiameterPx > 0) {
    d = Math.min(d, maxDiameterPx);
  }
  const innerR = d / 2;
  const root = new Container();
  const { disk, letter } = buildEnemyDiskAndLetter(innerR, paint, tokenOpts?.wowCirclePortraitUid);
  root.addChild(disk);
  root.addChild(letter);
  return root;
}
