import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT_SCALE } from './constants';
import type { AllyClass } from './types';

export type EnemyPaintKind =
  | 'grunt'
  | 'dread_warrior'
  | 'raider'
  | 'beserker'
  | 'kodo'
  | 'ultralisk'
  | 'abomination'
  | 'headhunter'
  | 'darkspear'
  | 'shaman'
  | 'batrider'
  | 'catapult'
  | 'wolf'
  | 'mirror'
  | 'boss_farseer'
  | 'boss_tauren'
  | 'boss_blademaster';

/**
 * 程序化绘制我方兵种：「圆角身 + 圆脸 + 豆眼」小人风格。
 * 原点在脚底略上，面向右。配色参考 WoW / DBM 习惯：战士土色、法师蓝、牧师白、弓手绿、圣骑粉。
 */
export function paintAllyBody(g: Graphics, kind: AllyClass): void {
  g.clear();
  const outline = { width: 1.5, color: 0x0f172a, alpha: 0.55 };

  const paintDudeHead = (skin: number): void => {
    g.circle(0, -44, 11).fill(skin).stroke(outline);
    g.circle(-4, -46, 2.2).fill(0x1e293b);
    g.circle(4, -46, 2.2).fill(0x1e293b);
  };

  switch (kind) {
    case 'warrior': {
      const leather = 0xa16207;
      const leatherDeep = 0x854d0e;
      const strap = 0x713f12;
      g.roundRect(-14, -36, 28, 32, 7).fill(leather).stroke(outline);
      g.roundRect(-12, -32, 24, 8, 3).fill(leatherDeep).stroke(outline);
      g.rect(-12, -28, 24, 3).fill(strap).stroke(outline);
      paintDudeHead(0xfde6c7);
      /* 左盾 */
      g.roundRect(-24, -34, 10, 22, 2).fill(0x57534e).stroke(outline);
      g.roundRect(-22, -30, 6, 12, 1).fill(0xa8a29e).stroke(outline);
      g.moveTo(-19, -26).lineTo(-19, -22).stroke({ width: 1.2, color: 0x44403c, alpha: 0.9 });
      /* 右剑 */
      g.moveTo(15, -18).lineTo(32, -40).stroke({ width: 2.4, color: 0xe7e5e4, alpha: 1 });
      g.roundRect(28, -44, 5, 8, 1).fill(0x94a3b8).stroke(outline);
      break;
    }
    case 'mage': {
      const robe = 0x1e3a8a;
      const robeLight = 0x2563eb;
      g.roundRect(-14, -36, 28, 32, 7).fill(robe).stroke(outline);
      g.roundRect(-11, -33, 22, 10, 3).fill(robeLight).stroke(outline);
      paintDudeHead(0xffedd5);
      /* 法杖 + 顶端水晶 */
      g.moveTo(17, -4).lineTo(17, -56).stroke({ width: 2.2, color: 0x64748b, alpha: 1 });
      g.circle(17, -58, 5).fill(0x38bdf8).stroke(outline);
      g.poly([17, -63, 21, -55, 13, -55]).fill(0x7dd3fc).stroke(outline);
      break;
    }
    case 'priest': {
      g.roundRect(-14, -36, 28, 32, 7).fill(0xf8fafc).stroke(outline);
      g.roundRect(-11, -33, 22, 18, 4).fill({ color: 0xffffff, alpha: 0.98 }).stroke(outline);
      paintDudeHead(0xfffef5);
      /* 十字杖（右手侧） */
      g.moveTo(16, -4).lineTo(16, -54).stroke({ width: 2.2, color: 0xc4a035, alpha: 1 });
      g.moveTo(10, -32).lineTo(22, -32).stroke({ width: 2.6, color: 0xfbbf24, alpha: 1 });
      g.circle(16, -54, 3.2).fill(0xfef9c3).stroke(outline);
      break;
    }
    case 'archer': {
      const tunic = 0x166534;
      const tunicHi = 0x15803d;
      g.roundRect(-14, -36, 28, 32, 7).fill(tunic).stroke(outline);
      g.roundRect(-11, -33, 22, 10, 3).fill(tunicHi).stroke(outline);
      paintDudeHead(0xd9f99d);
      /* 弓身 + 弦 */
      g.arc(5, -28, 22, -1.05, 0.15, false).stroke({ width: 2.2, color: 0x86efac, alpha: 1 });
      g.moveTo(-12, -26).lineTo(24, -30).stroke({ width: 1.2, color: 0xbbf7d0, alpha: 0.85 });
      /* 箭 */
      g.moveTo(20, -28).lineTo(36, -28).stroke({ width: 1.8, color: 0xfde68a, alpha: 1 });
      g.moveTo(34, -28).lineTo(31, -30.5).lineTo(31, -25.5).fill(0xfef08a).stroke(outline);
      break;
    }
    case 'knight': {
      /* 坐骑：略矮、偏右，人在上 — DBM 圣骑粉 + 金边 */
      const horse = 0x57534e;
      const horseDark = 0x44403c;
      g.ellipse(-2, -14, 28, 13).fill(horse).stroke(outline);
      g.circle(-24, -18, 7).fill(horseDark).stroke(outline);
      g.moveTo(-18, -10).lineTo(-18, -1).stroke({ width: 2, color: 0x292524, alpha: 0.9 });
      g.moveTo(10, -10).lineTo(10, -1).stroke({ width: 2, color: 0x292524, alpha: 0.9 });
      g.ellipse(-26, -16, 4, 3).fill(0x292524).stroke(outline);
      /* 骑手粉甲 */
      const palPink = 0xf472b6;
      const palLight = 0xfbcfe8;
      g.roundRect(-11, -40, 22, 24, 6).fill(palPink).stroke(outline);
      g.roundRect(-9, -38, 18, 6, 2).fill(0xfbbf24).stroke(outline);
      g.roundRect(-7, -30, 14, 4, 2).fill(palLight).stroke(outline);
      g.circle(0, -50, 10).fill(0xfff1f2).stroke(outline);
      g.circle(-3.2, -52, 2).fill(0x1e293b);
      g.circle(3.2, -52, 2).fill(0x1e293b);
      /* 骑枪 */
      g.moveTo(12, -34).lineTo(38, -46).stroke({ width: 2, color: 0xfde68a, alpha: 1 });
      g.circle(36, -46, 2.5).fill(0xfef08a).stroke(outline);
      break;
    }
    default:
      g.circle(0, -22, 18).fill(0x38bdf8).stroke(outline);
  }
}

/** 程序化绘制敌方 */
export function paintEnemyBody(g: Graphics, k: EnemyPaintKind): void {
  g.clear();
  const o = { width: 1.5, color: 0x1c0a0a, alpha: 0.6 };
  switch (k) {
    case 'grunt':
    case 'wolf': {
      const deep = k === 'wolf' ? 0x4c1d95 : 0x7f1d1d;
      const top = k === 'wolf' ? 0xa78bfa : 0xef4444;
      g.ellipse(0, -20, 20, 22).fill(deep).stroke(o);
      g.circle(0, -42, 12).fill(top).stroke(o);
      g.moveTo(12, -24).lineTo(30, -10).lineTo(26, -6).lineTo(10, -16).fill(0x991b1b).stroke(o);
      if (k === 'wolf') {
        g.poly([-18, -48, -10, -58, -6, -50]).fill(0xc4b5fd).stroke(o);
        g.poly([18, -48, 10, -58, 6, -50]).fill(0xc4b5fd).stroke(o);
      }
      break;
    }
    case 'headhunter': {
      g.ellipse(0, -18, 14, 24).fill(0x9a3412).stroke(o);
      g.circle(0, -44, 10).fill(0xfdba74).stroke(o);
      g.moveTo(0, -36).lineTo(6, -70).lineTo(-2, -38).fill(0xf97316).stroke(o);
      g.moveTo(10, -20).lineTo(36, -36).stroke({ width: 2, color: 0xfbbf24, alpha: 0.85 });
      break;
    }
    case 'darkspear': {
      g.ellipse(0, -18, 13, 22).fill(0x115e59).stroke(o);
      g.circle(0, -42, 9).fill(0x5eead4).stroke(o);
      g.moveTo(8, -22).lineTo(34, -34).stroke({ width: 2, color: 0x14b8a6, alpha: 0.9 });
      g.moveTo(0, -34).lineTo(4, -62).lineTo(-4, -36).fill(0x0f766e).stroke(o);
      break;
    }
    case 'dread_warrior': {
      g.roundRect(-18, -30, 36, 34, 5).fill(0x1e293b).stroke(o);
      g.circle(0, -48, 11).fill({ color: 0x94a3b8, alpha: 0.95 }).stroke(o);
      g.moveTo(-22, -18).lineTo(-36, -8).stroke({ width: 2.5, color: 0x64748b, alpha: 0.9 });
      g.moveTo(22, -18).lineTo(36, -8).stroke({ width: 2.5, color: 0x64748b, alpha: 0.9 });
      g.rect(-8, -22, 16, 4).fill(0xef4444).stroke(o);
      g.circle(0, -12, 5).fill({ color: 0xfca5a5, alpha: 0.85 }).stroke(o);
      break;
    }
    case 'raider': {
      g.ellipse(0, -20, 18, 22).fill(0x7c2d12).stroke(o);
      g.circle(0, -44, 10).fill(0xfdba74).stroke(o);
      g.poly([-20, -36, -8, -48, -4, -40]).fill(0x451a03).stroke(o);
      g.moveTo(14, -22).lineTo(32, -14).stroke({ width: 2, color: 0xf97316, alpha: 0.85 });
      break;
    }
    case 'beserker': {
      g.ellipse(0, -20, 17, 24).fill(0x991b1b).stroke(o);
      g.circle(0, -46, 11).fill(0xfca5a5).stroke(o);
      g.moveTo(-16, -28).lineTo(-28, -48).stroke({ width: 3, color: 0xfef08a, alpha: 0.9 });
      g.moveTo(16, -28).lineTo(28, -48).stroke({ width: 3, color: 0xfef08a, alpha: 0.9 });
      break;
    }
    case 'kodo': {
      g.roundRect(-32, -26, 64, 34, 10).fill(0x713f12).stroke(o);
      g.circle(-18, -48, 10).fill(0xfbbf24).stroke(o);
      g.circle(18, -48, 10).fill(0xfbbf24).stroke(o);
      g.rect(-10, -58, 20, 8).fill(0x451a03).stroke(o);
      break;
    }
    case 'ultralisk': {
      g.roundRect(-28, -28, 56, 36, 8).fill(0x4a044e).stroke(o);
      g.poly([-8, -52, 0, -68, 8, -52]).fill(0xa855f7).stroke(o);
      g.rect(-20, -32, 8, 18).fill(0x7e22ce).stroke(o);
      g.rect(12, -32, 8, 18).fill(0x7e22ce).stroke(o);
      break;
    }
    case 'abomination': {
      g.roundRect(-22, -24, 44, 32, 10).fill(0x14532d).stroke(o);
      g.circle(-10, -46, 8).fill(0x86efac).stroke(o);
      g.circle(10, -46, 8).fill(0x86efac).stroke(o);
      g.moveTo(-18, -20).lineTo(-32, -8).stroke({ width: 2, color: 0x4ade80, alpha: 0.8 });
      g.moveTo(18, -20).lineTo(32, -8).stroke({ width: 2, color: 0x4ade80, alpha: 0.8 });
      break;
    }
    case 'shaman': {
      g.roundRect(-14, -26, 28, 36, 6).fill(0x1e3a8a).stroke(o);
      g.circle(0, -48, 11).fill(0x93c5fd).stroke(o);
      g.moveTo(0, -36).lineTo(0, -72).stroke({ width: 2.5, color: 0x38bdf8, alpha: 0.9 });
      g.circle(12, -30, 6).fill({ color: 0xe9d5ff, alpha: 0.9 }).stroke(o);
      break;
    }
    case 'batrider': {
      g.ellipse(0, -14, 12, 16).fill(0x9a3412).stroke(o);
      g.circle(0, -36, 8).fill(0xfde68a).stroke(o);
      g.poly([-18, -30, -6, -52, 0, -44]).fill(0x451a03).stroke(o);
      g.poly([18, -30, 6, -52, 0, -44]).fill(0x451a03).stroke(o);
      g.moveTo(8, -16).lineTo(30, -28).stroke({ width: 1.8, color: 0xf97316, alpha: 0.85 });
      break;
    }
    case 'catapult': {
      g.roundRect(-26, -18, 52, 24, 4).fill(0x44403c).stroke(o);
      g.rect(-8, -36, 16, 14).fill(0x78716c).stroke(o);
      g.moveTo(20, -32).lineTo(40, -48).stroke({ width: 3, color: 0xa8a29e, alpha: 0.9 });
      g.circle(-18, -22, 6).fill(0x292524).stroke(o);
      g.circle(18, -22, 6).fill(0x292524).stroke(o);
      break;
    }
    case 'mirror': {
      g.ellipse(0, -22, 16, 26).fill(0x581c87).stroke(o);
      g.circle(0, -46, 10).fill(0xe9d5ff).stroke(o);
      g.rect(-22, -30, 8, 20).fill(0x6b21a8).stroke(o);
      g.rect(14, -30, 8, 20).fill(0x6b21a8).stroke(o);
      break;
    }
    case 'boss_farseer': {
      g.ellipse(0, -26, 22, 30).fill(0x164e63).stroke(o);
      g.circle(0, -54, 16).fill(0x22d3ee).stroke(o);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 10, -54 + Math.sin(a) * 10).lineTo(Math.cos(a) * 26, -54 + Math.sin(a) * 26).stroke({
          width: 2,
          color: 0x67e8f9,
          alpha: 0.5,
        });
      }
      break;
    }
    case 'boss_tauren': {
      g.ellipse(0, -22, 26, 28).fill(0x78350f).stroke(o);
      g.circle(-14, -50, 10).fill(0xfbbf24).stroke(o);
      g.circle(14, -50, 10).fill(0xfbbf24).stroke(o);
      g.roundRect(-8, -62, 16, 10, 3).fill(0x451a03).stroke(o);
      g.rect(-6, -40, 12, 8).fill(0xd97706).stroke(o);
      break;
    }
    case 'boss_blademaster': {
      g.ellipse(0, -24, 18, 28).fill(0x7f1d1d).stroke(o);
      g.circle(0, -50, 12).fill(0xfca5a5).stroke(o);
      g.moveTo(8, -36).lineTo(38, -52).lineTo(34, -44).lineTo(6, -28).fill(0xf87171).stroke(o);
      g.moveTo(-10, -30).lineTo(-36, -48).stroke({ width: 3, color: 0xfef08a, alpha: 0.9 });
      break;
    }
    default:
      g.circle(0, -22, 18).fill(0xfb7185).stroke(o);
  }
}

export type FloatEntry = {
  root: Container;
  life: number;
  max: number;
};

export function spawnFloatNumber(
  layer: Container,
  x: number,
  y: number,
  text: string,
  kind: 'damage' | 'crit' | 'magic' | 'heal' | 'block' | 'buff',
): FloatEntry {
  const root = new Container();
  const j = Math.round(12 * LAYOUT_SCALE);
  root.position.set(x + (Math.random() * 2 * j - j), y - Math.round(8 * LAYOUT_SCALE));
  let fill = 0xfca5a5;
  let outline = 0x450a0a;
  let size = Math.round(22 * LAYOUT_SCALE);
  if (kind === 'crit') {
    fill = 0xfef08a;
    outline = 0x854d0e;
    size = Math.round(28 * LAYOUT_SCALE);
  } else if (kind === 'magic') {
    fill = 0xc4b5fd;
    outline = 0x3b0764;
  } else if (kind === 'heal') {
    fill = 0x86efac;
    outline = 0x14532d;
  } else if (kind === 'block') {
    fill = 0x93c5fd;
    outline = 0x1e3a8a;
    size = Math.round(18 * LAYOUT_SCALE);
  } else if (kind === 'buff') {
    fill = 0xf87171;
    outline = 0x450a0a;
    size = Math.round(30 * LAYOUT_SCALE);
  }
  const t = new Text({
    text,
    style: {
      fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: size,
      fill,
      fontWeight: '800',
      stroke: { color: outline, width: Math.round(4 * LAYOUT_SCALE) },
      dropShadow: {
        alpha: 0.55,
        angle: Math.PI / 4,
        blur: 3,
        color: 0x000000,
        distance: 2,
      },
    },
  });
  t.anchor.set(0.5, 1);
  root.addChild(t);
  layer.addChild(root);
  return { root, life: 0, max: 0.85 + Math.random() * 0.15 };
}

export function tickFloatEntries(entries: FloatEntry[], dt: number): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    e.life += dt;
    e.root.y -= 42 * LAYOUT_SCALE * dt;
    const k = Math.min(1, e.life / e.max);
    e.root.alpha = 1 - k * k;
    e.root.scale.set(1 + k * 0.15);
    if (e.life >= e.max) {
      e.root.destroy();
      entries.splice(i, 1);
    }
  }
}

export type RingPulse = { g: Graphics; t: number; max: number; x: number; y: number; r: number; color: number };

export function spawnRingPulse(layer: Container, x: number, y: number, r: number, color: number, max = 0.4): RingPulse {
  const g = new Graphics();
  g.position.set(x, y);
  layer.addChild(g);
  return { g, t: 0, max, x, y, r, color };
}

export function tickRingPulses(rings: RingPulse[], dt: number): void {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]!;
    r.t += dt;
    const k = r.t / r.max;
    const rad = r.r * (0.35 + k * 1.1);
    const a = Math.max(0, 1 - k);
    r.g.clear();
    r.g.circle(0, 0, rad).stroke({ width: 3 + k * 4, color: r.color, alpha: 0.15 + a * 0.75 });
    if (r.t >= r.max) {
      r.g.destroy();
      rings.splice(i, 1);
    }
  }
}

/** 神圣制裁：竖直白光 + 地面亮斑；`groundY` 为受击者脚底世界 Y */
export type HolySanctionStrikeFx = { g: Graphics; t: number; max: number };

export function spawnHolySanctionStrike(
  layer: Container,
  x: number,
  groundY: number,
  hitRadiusPx: number,
): HolySanctionStrikeFx {
  const g = new Graphics();
  const scale = Math.max(0.85, Math.min(2.5, hitRadiusPx / Math.max(1, 34 * LAYOUT_SCALE)));
  const beamW = Math.round((16 + 22 * scale) * LAYOUT_SCALE);
  const beamH = Math.round((360 + 180 * scale) * LAYOUT_SCALE);
  const rx = hitRadiusPx * (1.05 + 0.4 * scale);
  const ry = hitRadiusPx * 0.4;
  g.position.set(x, groundY);
  g.roundRect(-beamW * 0.5, -beamH, beamW, beamH, Math.round(8 * LAYOUT_SCALE)).fill({ color: 0xfffffc, alpha: 0.38 });
  g.ellipse(0, 0, rx, ry)
    .fill({ color: 0xf8fafc, alpha: 0.7 })
    .stroke({ width: Math.max(2, 2.4 * LAYOUT_SCALE), color: 0xffffff, alpha: 0.5 });
  g.ellipse(0, -hitRadiusPx * 0.28, rx * 0.52, ry * 0.48).fill({ color: 0xffffff, alpha: 0.4 });
  layer.addChild(g);
  return { g, t: 0, max: 0.36 };
}

export function tickHolySanctionStrikes(list: HolySanctionStrikeFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    const k = Math.min(1, s.t / s.max);
    s.g.alpha = Math.max(0, 1 - k * k);
    const sc = 1 + k * 0.08;
    s.g.scale.set(sc, sc);
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}

export type MeteorAnim = {
  streak: Graphics;
  boom: Graphics;
  t: number;
  max: number;
  ty: number;
  br: number;
  /** 竖直下落速度（逻辑像素/秒量级，每帧乘 dt） */
  vy: number;
  /** 流星群小颗：冷色、短尾、快结束 */
  swarm: boolean;
};

export type MeteorSpawnOpts = {
  swarm?: boolean;
};

export function spawnMeteorAnim(
  layer: Container,
  tx: number,
  ty: number,
  blastRadius: number,
  opts?: MeteorSpawnOpts,
): MeteorAnim {
  const swarm = !!opts?.swarm;
  const streak = new Graphics();
  const startAbove = swarm ? 120 + Math.random() * 90 : 300;
  streak.position.set(tx, ty - startAbove);
  if (swarm) {
    const sc = 0.5 + Math.random() * 0.45;
    streak.scale.set(sc);
    streak.moveTo(-3, 0).lineTo(5, 110).lineTo(-4, 110).closePath().fill({ color: 0x818cf8, alpha: 0.9 });
    streak.circle(0, 2, 5).fill({ color: 0xe0e7ff, alpha: 0.94 });
  } else {
    streak.moveTo(-12, 0).lineTo(14, 300).lineTo(-14, 300).closePath().fill({ color: 0xfb923c, alpha: 0.82 });
    streak.circle(0, 4, 12).fill({ color: 0xfef08a, alpha: 0.95 });
  }
  layer.addChild(streak);
  const boom = new Graphics();
  boom.position.set(tx, ty);
  layer.addChild(boom);
  return {
    streak,
    boom,
    t: 0,
    max: swarm ? 0.32 + Math.random() * 0.1 : 0.78,
    ty,
    br: blastRadius,
    vy: swarm ? 1100 + Math.random() * 280 : 980,
    swarm,
  };
}

export function tickMeteorAnims(anims: MeteorAnim[], dt: number): void {
  for (let i = anims.length - 1; i >= 0; i--) {
    const m = anims[i]!;
    m.t += dt;
    const k = m.t / m.max;
    m.streak.position.y += m.vy * dt;
    const fadeY = m.swarm ? 22 : 40;
    if (m.streak.position.y > m.ty - fadeY) m.streak.alpha *= 0.88;
    m.boom.clear();
    if (m.t > 0.06) {
      const boomDur = m.swarm ? 0.2 : 0.38;
      const prog = Math.min(1, (m.t - 0.06) / boomDur);
      const rad = m.br * prog;
      if (m.swarm) {
        m.boom
          .circle(0, 0, rad)
          .stroke({ width: 2 + prog * 9, color: 0x6366f1, alpha: 0.88 * (1 - k * 0.7) });
        m.boom.circle(0, 0, rad * 0.52).fill({ color: 0xc4b5fd, alpha: 0.24 * (1 - k) });
        m.boom.circle(0, 0, rad * 0.78).stroke({ width: 2, color: 0xe0e7ff, alpha: 0.32 * (1 - k) });
      } else {
        m.boom
          .circle(0, 0, rad)
          .stroke({ width: 8 + prog * 14, color: 0xea580c, alpha: 0.92 * (1 - k * 0.6) });
        m.boom.circle(0, 0, rad * 0.42).fill({ color: 0xfbbf24, alpha: 0.28 * (1 - k) });
        m.boom.circle(0, 0, rad * 0.72).stroke({ width: 3, color: 0xfef08a, alpha: 0.35 * (1 - k) });
      }
    }
    if (m.t >= m.max) {
      m.streak.destroy();
      m.boom.destroy();
      anims.splice(i, 1);
    }
  }
}

export type SlashFx = { g: Graphics; t: number; max: number };

export function spawnDualShotSlash(layer: Container, x: number, y: number): SlashFx {
  const g = new Graphics();
  g.position.set(x, y - 14);
  g.moveTo(-26, 4).lineTo(28, -2).stroke({ width: 3, color: 0xfbbf24, alpha: 0.95 });
  g.moveTo(-24, 10).lineTo(30, 4).stroke({ width: 2.5, color: 0xfde047, alpha: 0.85 });
  layer.addChild(g);
  return { g, t: 0, max: 0.3 };
}

export function tickSlashFx(list: SlashFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    const k = s.t / s.max;
    s.g.alpha = 1 - k;
    s.g.rotation += 0.06;
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}

export type RayBurstFx = { g: Graphics; t: number; max: number };

export function spawnHealBurst(layer: Container, x: number, y: number): RayBurstFx {
  const g = new Graphics();
  g.position.set(x, y - 18);
  for (let j = 0; j < 10; j++) {
    const a = (j / 10) * Math.PI * 2;
    g.moveTo(0, 0).lineTo(Math.cos(a) * 44, Math.sin(a) * 44).stroke({ width: 2.2, color: 0x86efac, alpha: 0.9 });
  }
  g.circle(0, 0, 14).fill({ color: 0xbbf7d0, alpha: 0.55 });
  layer.addChild(g);
  return { g, t: 0, max: 0.5 };
}

export function tickRayBurstFx(list: RayBurstFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]!;
    r.t += dt;
    const k = r.t / r.max;
    r.g.alpha = 1 - k;
    r.g.scale.set(1 + k * 0.6);
    if (r.t >= r.max) {
      r.g.destroy();
      list.splice(i, 1);
    }
  }
}

/** 牛头酋长冲击波：狭长光束，随时间淡出 */
export type ShockwaveBeamFx = { g: Graphics; t: number; max: number };

export function spawnTaurenShockwaveBeam(
  layer: Container,
  x0: number,
  y0: number,
  dirX: number,
  dirY: number,
  length: number,
  halfWidth: number,
): ShockwaveBeamFx {
  const g = new Graphics();
  const ang = Math.atan2(dirY, dirX);
  g.roundRect(0, -halfWidth, length, halfWidth * 2, halfWidth * 0.32)
    .fill({ color: 0xea580c, alpha: 0.58 })
    .stroke({ width: Math.max(2, halfWidth * 0.12), color: 0xfbbf24, alpha: 0.88 });
  g.roundRect(length * 0.04, -halfWidth * 0.55, length * 0.88, halfWidth * 1.1, halfWidth * 0.18)
    .fill({ color: 0xfef08a, alpha: 0.38 });
  g.position.set(x0, y0);
  g.rotation = ang;
  layer.addChild(g);
  return { g, t: 0, max: 0.52 };
}

export function tickShockwaveBeamFx(list: ShockwaveBeamFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]!;
    b.t += dt;
    const k = b.t / b.max;
    b.g.alpha = Math.max(0, 1 - k * 1.08);
    if (b.t >= b.max) {
      b.g.destroy();
      list.splice(i, 1);
    }
  }
}

/** 受击火星：短促放射线 + 亮心 */
export type HitSparkBurst = { g: Graphics; t: number; max: number };

export function spawnHitSparkBurst(layer: Container, x: number, y: number): HitSparkBurst {
  const g = new Graphics();
  g.position.set(x, y - 16);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = 22 + (i % 4) * 10;
    g.moveTo(0, 0).lineTo(Math.cos(a) * len, Math.sin(a) * len).stroke({
      width: 2.2,
      color: i % 2 === 0 ? 0xfef08a : 0xf97316,
      alpha: 0.92,
    });
  }
  g.circle(0, 0, 7).fill({ color: 0xffffff, alpha: 0.75 }).stroke({ width: 1.2, color: 0xfbbf24, alpha: 0.9 });
  layer.addChild(g);
  return { g, t: 0, max: 0.34 };
}

export function tickHitSparkBursts(list: HitSparkBurst[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    const k = s.t / s.max;
    s.g.alpha = 1 - k * k;
    s.g.scale.set(1 + k * 0.45);
    s.g.rotation += dt * 2.2;
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}

/**
 * 穆兰旋风斩：周身高速旋转刀片。局部原点为**圆盘中心**；`innerR` 为血条外缘 + 2 设计 px；`outerR` 与战场红圈一致（strike+自碰+敌方最大碰）。
 */
export function drawMulanWhirlwindBladeRing(
  g: Graphics,
  innerR: number,
  outerR: number,
  angleRad: number,
  scarlet: boolean,
): void {
  g.clear();
  const bladeCount = 8;
  const strokeW = Math.max(4.5, 5.8 * LAYOUT_SCALE);
  const core = scarlet ? 0xc21414 : 0x64748b;
  const edge = scarlet ? 0xff6b6b : 0xf8fafc;
  for (let i = 0; i < bladeCount; i++) {
    const a = angleRad + (i / bladeCount) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x0 = c * innerR;
    const y0 = sn * innerR;
    const x1 = c * outerR;
    const y1 = sn * outerR;
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: strokeW, color: core, alpha: 0.94, cap: 'round', join: 'round' });
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: Math.max(1.4, strokeW * 0.34), color: edge, alpha: 0.82, cap: 'round' });
  }
}

/** 投石车地面燃烧：椭圆火场，由战斗逻辑驱动伤害，此处仅表现 */
export type GroundBurnPatch = { g: Graphics; t: number; max: number; x: number; y: number; r: number };

export function spawnGroundBurnPatch(layer: Container, x: number, y: number, radius: number): GroundBurnPatch {
  const g = new Graphics();
  g.position.set(x, y);
  const rx = radius;
  const ry = radius * 0.38;
  g.ellipse(0, 8, rx, ry).fill({ color: 0x9a3412, alpha: 0.5 });
  g.ellipse(0, 8, rx * 0.88, ry * 0.82).stroke({ width: 3, color: 0xf97316, alpha: 0.72 });
  g.ellipse(0, 6, rx * 0.45, ry * 0.55).fill({ color: 0xfbbf24, alpha: 0.35 });
  g.ellipse(0, 4, rx * 0.22, ry * 0.35).fill({ color: 0xfef9c3, alpha: 0.28 });
  layer.addChild(g);
  return { g, t: 0, max: 5, x, y, r: radius };
}

export function tickGroundBurnPatches(list: GroundBurnPatch[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.t += dt;
    const k = p.t / p.max;
    const pulse = 0.85 + Math.sin(p.t * 11) * 0.12;
    p.g.alpha = (0.55 + (1 - k) * 0.45) * pulse;
    p.g.scale.set(1 + Math.sin(p.t * 7) * 0.04);
    if (p.t >= p.max) {
      p.g.destroy();
      list.splice(i, 1);
    }
  }
}

/** 单位死亡时留在地面的血迹，持续渐隐后移除 */
export type BloodStainFx = { g: Graphics; t: number; max: number };

export function spawnBloodStain(layer: Container, x: number, y: number, side: 'ally' | 'enemy'): BloodStainFx {
  const s = LAYOUT_SCALE;
  const g = new Graphics();
  g.position.set(x, y + Math.round(10 * s));
  const deep = side === 'ally' ? 0x991b1b : 0x3f0f12;
  const pool = side === 'ally' ? 0xb91c1c : 0x5c0a0a;
  const splats: [number, number, number, number, number][] = [
    [0, 0, 24, 11, 0.58],
    [-16, -4, 14, 8, 0.48],
    [14, 3, 12, 7, 0.44],
    [-8, 7, 11, 6, 0.4],
    [5, -8, 9, 5, 0.36],
  ];
  for (const [ox, oy, rw, rh, a] of splats) {
    g.ellipse(ox * s, oy * s, rw * s, rh * s).fill({ color: deep, alpha: a });
  }
  g.ellipse(0, 1 * s, 18 * s, 8 * s).fill({ color: pool, alpha: 0.42 });
  g.ellipse(0, 0, 20 * s, 9 * s).stroke({ width: Math.max(1, 1.5 * s), color: 0x450a0a, alpha: 0.38 });
  layer.addChildAt(g, 0);
  return { g, t: 0, max: 4.8 };
}

export function tickBloodStains(list: BloodStainFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]!;
    b.t += dt;
    const k = Math.min(1, b.t / b.max);
    b.g.alpha = Math.max(0, 1 - k * k * 1.05);
    b.g.scale.set(1 + k * 0.07);
    if (b.t >= b.max || b.g.alpha <= 0.008) {
      b.g.destroy();
      list.splice(i, 1);
    }
  }
}

/**
 * 骑士无敌脚底金环。几何以 (0,0) 为圆心；由 BattleScreen 将节点置于 root 的 (0,-hitRadiusPx)，
 * 与代币圆心重合，便于 `rotation` 绕硬币中心转。
 */
export function createKnightAura(_hitRadiusPx: number): Graphics {
  const g = new Graphics();
  const ro = Math.round(36 * LAYOUT_SCALE);
  const ri = Math.round(30 * LAYOUT_SCALE);
  g.circle(0, 0, ro).stroke({
    width: Math.max(2, Math.round(3 * LAYOUT_SCALE)),
    color: 0xfacc15,
    alpha: 0.78,
  });
  g.circle(0, 0, ri).stroke({
    width: Math.max(1, Math.round(2 * LAYOUT_SCALE)),
    color: 0xfef9c3,
    alpha: 0.5,
  });
  return g;
}

/**
 * 席拉拉强击光环：外环半径 = 2×英雄碰撞半径；几何以 (0,0) 为圆心，
 * BattleScreen 将节点置于 (0,-hitRadiusPx) 与代币圆心对齐，`rotation` 绕圆心转。
 */
export function createStrongStrikeHeroAura(hitRadiusPx: number): Graphics {
  const g = new Graphics();
  const R = Math.max(4, hitRadiusPx);
  const ro = Math.round(2 * R);
  const ri = Math.round(Math.max(3, R * 1.32));
  const arcR = Math.round(Math.max(4, R * 1.7));
  g.circle(0, 0, ro).stroke({
    width: Math.max(2, Math.round(2.5 * LAYOUT_SCALE)),
    color: 0x15803d,
    alpha: 0.72,
  });
  g.circle(0, 0, ri).stroke({
    width: Math.max(1.5, Math.round(2 * LAYOUT_SCALE)),
    color: 0x4ade80,
    alpha: 0.55,
  });
  g.arc(0, 0, arcR, -0.55, 0.55, false).stroke({
    width: Math.max(2, Math.round(2.2 * LAYOUT_SCALE)),
    color: 0xfbbf24,
    alpha: 0.5,
    cap: 'round',
  });
  g.arc(0, 0, arcR, Math.PI - 0.55, Math.PI + 0.55, false).stroke({
    width: Math.max(2, Math.round(2.2 * LAYOUT_SCALE)),
    color: 0xfbbf24,
    alpha: 0.5,
    cap: 'round',
  });
  return g;
}

export type ProjectileVisualStyle =
  | 'ally_mage'
  | 'ally_arcane_missile'
  | 'ally_archer'
  | 'ally_priest'
  | 'ally_generic'
  | 'enemy_headhunter'
  | 'enemy_boss_magic'
  | 'enemy_shadow_bolt'
  | 'enemy_generic';

export function buildProjectileGraphic(style: ProjectileVisualStyle): Graphics {
  const g = new Graphics();
  const o = { width: 1.2, color: 0x020617, alpha: 0.45 };
  switch (style) {
    case 'ally_mage':
      g.circle(0, 0, 7).fill(0x60a5fa).stroke(o);
      g.poly([0, -9, 6, 0, 0, 9, -6, 0]).fill(0x38bdf8).stroke(o);
      break;
    case 'ally_arcane_missile': {
      const o2 = { width: 1.4, color: 0x0c4a6e, alpha: 0.55 };
      g.ellipse(-18, 0, 16, 6).fill({ color: 0x0369a1, alpha: 0.45 }).stroke(o2);
      g.ellipse(-10, 0, 10, 4).fill({ color: 0x0ea5e9, alpha: 0.55 }).stroke(o2);
      g.circle(0, 0, 8).fill({ color: 0x38bdf8, alpha: 0.98 }).stroke({ width: 1.6, color: 0xe0f2fe, alpha: 0.9 });
      g.circle(3, -2, 3).fill({ color: 0xf0f9ff, alpha: 0.95 });
      break;
    }
    case 'ally_archer':
      g.moveTo(10, 0).lineTo(-8, -4).lineTo(-8, 4).closePath().fill(0x4ade80).stroke(o);
      break;
    case 'ally_priest':
      g.circle(0, 0, 8).fill({ color: 0xf8fafc, alpha: 0.98 }).stroke(o);
      g.moveTo(0, -6).lineTo(0, 6).stroke({ width: 1.5, color: 0xfbbf24, alpha: 0.9 });
      g.moveTo(-5, 0).lineTo(5, 0).stroke({ width: 1.5, color: 0xfbbf24, alpha: 0.9 });
      break;
    case 'enemy_headhunter':
      g.moveTo(9, 0).lineTo(-7, -3).lineTo(-7, 3).closePath().fill(0xf97316).stroke(o);
      break;
    case 'enemy_boss_magic':
      g.circle(0, 0, 11).fill({ color: 0x22d3ee, alpha: 0.92 }).stroke(o);
      g.circle(0, 0, 5).fill({ color: 0xfef9c3, alpha: 0.55 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5).lineTo(Math.cos(a) * 14, Math.sin(a) * 14).stroke({
          width: 2,
          color: 0xa5f3fc,
          alpha: 0.88,
        });
      }
      break;
    case 'enemy_shadow_bolt': {
      const tail = { width: 1.4, color: 0x581c87, alpha: 0.55 };
      g.ellipse(-22, 0, 20, 7).fill({ color: 0x6b21a8, alpha: 0.42 }).stroke(tail);
      g.ellipse(-14, 0, 12, 5).fill({ color: 0x7e22ce, alpha: 0.5 }).stroke(tail);
      g.circle(0, 0, 10).fill({ color: 0x9333ea, alpha: 0.98 }).stroke({ width: 1.6, color: 0xe9d5ff, alpha: 0.95 });
      g.circle(4, -3, 3.5).fill({ color: 0xfae8ff, alpha: 0.95 });
      break;
    }
    case 'enemy_generic':
      g.circle(0, 0, 9).fill(0xfb7185).stroke(o);
      g.circle(0, 0, 14).stroke({ width: 1.5, color: 0xfca5a5, alpha: 0.45 });
      break;
    case 'ally_generic':
    default:
      g.circle(0, 0, 7).fill(0x38bdf8).stroke(o);
      break;
  }
  g.scale.set(LAYOUT_SCALE);
  return g;
}

/** 死亡飞出时的微粒拖尾 */
export type TinySparkFx = { g: Graphics; t: number; max: number };

export function spawnDeathTrailSpark(layer: Container, x: number, y: number): TinySparkFx {
  const g = new Graphics();
  const pal = [0xfef08a, 0xfbbf24, 0xa7f3d0, 0xc4b5fd, 0xfbcfe8] as const;
  const c = pal[Math.floor(Math.random() * pal.length)]!;
  const rr = (1.8 + Math.random() * 3.8) * LAYOUT_SCALE;
  g.circle(0, 0, rr).fill({ color: c, alpha: 0.92 });
  g.position.set(x + (Math.random() - 0.5) * 14 * LAYOUT_SCALE, y + (Math.random() - 0.5) * 14 * LAYOUT_SCALE);
  layer.addChild(g);
  return { g, t: 0, max: 0.1 + Math.random() * 0.07 };
}

/** 暗影箭弹道拖尾（紫系） */
export function spawnShadowTrailSpark(layer: Container, x: number, y: number): TinySparkFx {
  const g = new Graphics();
  const pal = [0xe9d5ff, 0xc084fc, 0xa855f7, 0x7e22ce] as const;
  const c = pal[Math.floor(Math.random() * pal.length)]!;
  const rr = (1.4 + Math.random() * 2.8) * LAYOUT_SCALE;
  g.circle(0, 0, rr).fill({ color: c, alpha: 0.88 });
  g.position.set(x + (Math.random() - 0.5) * 10 * LAYOUT_SCALE, y + (Math.random() - 0.5) * 10 * LAYOUT_SCALE);
  layer.addChild(g);
  return { g, t: 0, max: 0.09 + Math.random() * 0.05 };
}

/** 奥术飞弹拖尾（青蓝） */
export function spawnArcaneTrailSpark(layer: Container, x: number, y: number): TinySparkFx {
  const g = new Graphics();
  const pal = [0xe0f2fe, 0x7dd3fc, 0x38bdf8, 0x0284c7] as const;
  const c = pal[Math.floor(Math.random() * pal.length)]!;
  const rr = (1.2 + Math.random() * 2.6) * LAYOUT_SCALE;
  g.circle(0, 0, rr).fill({ color: c, alpha: 0.9 });
  g.position.set(x + (Math.random() - 0.5) * 9 * LAYOUT_SCALE, y + (Math.random() - 0.5) * 9 * LAYOUT_SCALE);
  layer.addChild(g);
  return { g, t: 0, max: 0.08 + Math.random() * 0.045 };
}

export function tickTinySparks(list: TinySparkFx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.t += dt;
    const k = s.t / s.max;
    s.g.alpha = Math.max(0, 1 - k * 1.05);
    s.g.scale.set(1 + k * 0.55);
    if (s.t >= s.max) {
      s.g.destroy();
      list.splice(i, 1);
    }
  }
}
