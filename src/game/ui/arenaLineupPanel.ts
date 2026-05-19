import { Container, Graphics, Text } from 'pixi.js';
import { allBondStacks } from '../battleBonds';
import { GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { ALLY_DEFS } from '../unitDefs';
import { createDraftAllyToken, createDraftHeroToken } from '../unitCircleTokens';
import type { ArenaLineupSnapshot } from '../arenaStorage';
import { getHeroDef, heroDisplayNameWithSkillTier, heroQualityAccent, type HeroId } from '../heroRegistry';
import type { ArtifactKind } from '../strategyTypes';
const PAD_X = Math.round(20 * LAYOUT_SCALE);
const HERO_RAIL_W = Math.round(128 * LAYOUT_SCALE);
const HERO_RAIL_GAP = Math.round(18 * LAYOUT_SCALE);
const BOARD_CELL_FILL = 0x141414;
const BOARD_STROKE_MUTED = 0x6b6b6b;
const FF = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';

function artifactMark(k: ArtifactKind): string {
  switch (k) {
    case 'holy_grail':
      return '圣';
    case 'shelter':
      return '庇';
    case 'cross_star':
      return '十';
    case 'revenge_spirit':
      return '仇';
    default:
      return '?';
  }
}

function artifactName(k: ArtifactKind): string {
  switch (k) {
    case 'holy_grail':
      return '圣杯';
    case 'shelter':
      return '庇护';
    case 'cross_star':
      return '十字星';
    case 'revenge_spirit':
      return '复仇之魂';
    default:
      return '神器';
  }
}

function bondNameFill(totalStacks: number): number {
  if (totalStacks >= 21) return 0xef4444;
  if (totalStacks >= 15) return 0xf97316;
  if (totalStacks >= 10) return 0xc084fc;
  if (totalStacks >= 6) return 0x60a5fa;
  if (totalStacks >= 3) return 0x4ade80;
  return 0xe2e8f0;
}

/** 与招募页 `DraftScreen.boardGridMetrics` 一致 */
export function arenaLineupGridMetrics(topY: number): {
  originX: number;
  originY: number;
  cell: number;
  gap: number;
  gridW: number;
  gridH: number;
} {
  const cell = Math.round(124 * LAYOUT_SCALE);
  const gap = Math.round(18 * LAYOUT_SCALE);
  const gridW = cell * 3 + gap * 2;
  const gridH = cell * 3 + gap * 2;
  const totalW = gridW + HERO_RAIL_GAP + HERO_RAIL_W;
  const originX = PAD_X + (GAME_WIDTH - PAD_X * 2 - totalW) / 2 - Math.round(25 * LAYOUT_SCALE);
  return { originX, originY: topY, cell, gap, gridW, gridH };
}

export type ArenaLineupPanelResult = {
  bottomY: number;
};

/**
 * 竞技场 hub：九宫格 + 右侧英雄栏（只读，布局对齐招募配队页）。
 * 英雄来自锁定快照 `lineup.heroDeploy`。
 */
export function mountArenaLineupPanel(
  parent: Container,
  lineup: ArenaLineupSnapshot,
  topY: number,
): ArenaLineupPanelResult {
  const m = arenaLineupGridMetrics(topY);
  const stacksBy = allBondStacks(lineup.board);
  const rr = Math.round(14 * LAYOUT_SCALE);

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = m.originX + col * (m.cell + m.gap);
    const y = m.originY + row * (m.cell + m.gap);
    const wrap = new Container();
    wrap.position.set(x, y);

    const g = new Graphics();
    g.roundRect(0, 0, m.cell, m.cell, rr)
      .fill(BOARD_CELL_FILL)
      .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: BOARD_STROKE_MUTED });
    wrap.addChild(g);

    const art = lineup.artifactBySlot[i];
    const slot = lineup.board[i];

    if (art && !slot) {
      const artBg = new Graphics();
      artBg
        .roundRect(m.cell * 0.12, m.cell * 0.12, m.cell * 0.76, m.cell * 0.52, Math.round(12 * LAYOUT_SCALE))
        .fill({ color: 0x1c1c1c, alpha: 1 })
        .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: BOARD_STROKE_MUTED });
      wrap.addChild(artBg);
      const am = new Text({
        text: artifactMark(art),
        style: {
          fontFamily: FF,
          fontSize: Math.round(32 * LAYOUT_SCALE),
          fill: 0xffffff,
          fontWeight: '800',
        },
      });
      am.anchor.set(0.5, 0.5);
      am.position.set(m.cell / 2, m.cell * 0.36);
      wrap.addChild(am);
    }

    if (slot) {
      const portraitDiameter = Math.min(m.cell * 0.62, Math.round(128 * LAYOUT_SCALE));
      const portrait = createDraftAllyToken(slot.kind, portraitDiameter);
      portrait.position.set(m.cell / 2, m.cell * 0.38 + portraitDiameter / 2);
      wrap.addChild(portrait);
    }

    const bondTotal = slot ? stacksBy[slot.kind] : 0;
    const label = slot
      ? `${ALLY_DEFS[slot.kind].name}\n×${slot.stacks}`
      : art
        ? `${artifactName(art)}\n神器`
        : '空';
    const t = new Text({
      text: label,
      style: {
        fontFamily: FF,
        fontSize: slot || art ? Math.round(17 * LAYOUT_SCALE) : Math.round(21 * LAYOUT_SCALE),
        fill: slot ? bondNameFill(bondTotal) : art ? 0xd4d4d4 : 0x9ca3af,
        align: 'center',
        lineHeight: Math.round(22 * LAYOUT_SCALE),
        fontWeight: slot || art ? '600' : '400',
        wordWrap: true,
        wordWrapWidth: Math.max(32, m.cell - Math.round(8 * LAYOUT_SCALE)),
        breakWords: true,
      },
    });
    t.anchor.set(0.5, 1);
    t.position.set(m.cell / 2, m.cell - Math.round(8 * LAYOUT_SCALE));
    wrap.addChild(t);
    parent.addChild(wrap);
  }

  const sepX = m.originX + m.gridW + HERO_RAIL_GAP / 2 + Math.round(15 * LAYOUT_SCALE);
  const sepG = new Graphics();
  sepG
    .moveTo(sepX, m.originY)
    .lineTo(sepX, m.originY + m.gridH + Math.round(25 * LAYOUT_SCALE))
    .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: 0x475569, alpha: 0.95 });
  parent.addChild(sepG);

  const railX = m.originX + m.gridW + HERO_RAIL_GAP + Math.round(15 * LAYOUT_SCALE);
  const slotH = Math.round((m.cell * 3 + m.gap * 2) / 3);
  const gapY = Math.round(8 * LAYOUT_SCALE);
  const heroSlots = lineup.heroDeploy;

  for (let s = 0; s < 3; s++) {
    const wrap = new Container();
    wrap.position.set(railX, m.originY + s * (slotH + gapY));
    const g = new Graphics();
    g.roundRect(0, 0, HERO_RAIL_W, slotH, Math.round(12 * LAYOUT_SCALE))
      .fill(BOARD_CELL_FILL)
      .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: BOARD_STROKE_MUTED });
    wrap.addChild(g);

    const hid: HeroId | null = heroSlots[s] ?? null;
    if (hid) {
      const def = getHeroDef(hid);
      if (def) {
        const dia = Math.min(HERO_RAIL_W * 0.72, slotH * 0.62);
        const portrait = createDraftHeroToken(hid, def.allyClass, dia);
        portrait.position.set(HERO_RAIL_W / 2, slotH * 0.42 + dia / 2);
        wrap.addChild(portrait);
        const nm = heroDisplayNameWithSkillTier(def.name, stacksBy[def.allyClass]);
        const lab = new Text({
          text: `${ALLY_DEFS[def.allyClass].name}英雄 ${nm}`,
          style: {
            fontFamily: FF,
            fontSize: Math.round(14 * LAYOUT_SCALE),
            fill: heroQualityAccent(def.quality),
            align: 'center',
            lineHeight: Math.round(18 * LAYOUT_SCALE),
            wordWrap: true,
            wordWrapWidth: HERO_RAIL_W - 6,
          },
        });
        lab.anchor.set(0.5, 1);
        lab.position.set(HERO_RAIL_W / 2, slotH - Math.round(4 * LAYOUT_SCALE));
        wrap.addChild(lab);
      }
    } else {
      const t = new Text({
        text: '空\n栏位',
        style: {
          fontFamily: FF,
          fontSize: Math.round(15 * LAYOUT_SCALE),
          fill: 0x64748b,
          align: 'center',
          lineHeight: Math.round(20 * LAYOUT_SCALE),
          wordWrap: true,
          wordWrapWidth: HERO_RAIL_W - 4,
        },
      });
      t.anchor.set(0.5, 0.5);
      t.position.set(HERO_RAIL_W / 2, slotH / 2);
      wrap.addChild(t);
    }
    parent.addChild(wrap);
  }

  return { bottomY: m.originY + m.gridH };
}
