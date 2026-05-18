import { GAME_WIDTH, LAYOUT_SCALE } from './constants';

/** 整场可玩区域整体下移（逻辑像素，已乘 `LAYOUT_SCALE`） */
export const BATTLE_PLAYFIELD_Y_OFFSET_PX = Math.round(30 * LAYOUT_SCALE);

/**
 * 可玩战场竖直范围（非整屏）：顶 = 战斗 HUD 棕色板下缘；底 = 与 `BattleScreen` 击退/跃迁 clamp 一致。
 * 中线取该区间几何中心，不用 `GAME_HEIGHT / 2`。
 */
export const BATTLE_PLAYFIELD_TOP_PX = Math.round((126 + 20 + 10) * LAYOUT_SCALE);
export const BATTLE_PLAYFIELD_BOTTOM_PX = Math.round(1100 * LAYOUT_SCALE);

/** 与 `DraftScreen.boardGridMetrics` 一致的单格尺寸 */
export const BOARD_GRID_CELL = Math.round(124 * LAYOUT_SCALE);
export const BOARD_GRID_GAP = Math.round(18 * LAYOUT_SCALE);

export function boardGridSpan(): { gridW: number; gridH: number } {
  const gridW = BOARD_GRID_CELL * 3 + BOARD_GRID_GAP * 2;
  const gridH = BOARD_GRID_CELL * 3 + BOARD_GRID_GAP * 2;
  return { gridW, gridH };
}

export type BattleArenaMetrics = {
  /** 可玩战场上缘（HUD 板下） */
  playfieldTop: number;
  /** 可玩战场下缘 */
  playfieldBottom: number;
  playfieldH: number;
  margin: number;
  /** 双方阵容相对中线的留白（略远离中线） */
  halfGap: number;
  /** 可玩战场竖直中线（非屏幕中心） */
  midY: number;
  minX: number;
  maxX: number;
};

/**
 * 我方九宫格左上角：整盘落在我方半场（y ≥ 中线）内，
 * 几何中心与半场中心重合 → slot 4 格心与半场中心对齐。
 */
export function allyBattleGridOrigin(): { originX: number; originY: number } {
  const { gridW, gridH } = boardGridSpan();
  const m = battleArenaMetrics();
  const originX = (GAME_WIDTH - gridW) / 2;
  const allyTop = m.midY;
  const allyBottom = m.playfieldBottom;
  const allyCenterY = (allyTop + allyBottom) * 0.5;
  let originY = allyCenterY - gridH * 0.5;
  originY = Math.max(allyTop, Math.min(allyBottom - gridH, originY));
  return { originX, originY };
}

export function battleArenaMetrics(): BattleArenaMetrics {
  const arenaPad = Math.round(12 * LAYOUT_SCALE);
  const playfieldTop = BATTLE_PLAYFIELD_TOP_PX + BATTLE_PLAYFIELD_Y_OFFSET_PX;
  const playfieldBottom = BATTLE_PLAYFIELD_BOTTOM_PX + BATTLE_PLAYFIELD_Y_OFFSET_PX;
  const playfieldH = Math.max(BOARD_GRID_CELL, playfieldBottom - playfieldTop);
  const margin = Math.round(52 * LAYOUT_SCALE);
  const halfGap = Math.round(88 * LAYOUT_SCALE);
  return {
    playfieldTop,
    playfieldBottom,
    playfieldH,
    margin,
    halfGap,
    midY: playfieldTop + playfieldH * 0.5,
    minX: arenaPad + margin,
    maxX: GAME_WIDTH - arenaPad - margin,
  };
}

export function clampBattleSpawnXY(x: number, y: number): { x: number; y: number } {
  const m = battleArenaMetrics();
  const minY = m.playfieldTop + m.margin;
  const maxY = m.playfieldBottom - m.margin;
  return {
    x: Math.max(m.minX, Math.min(m.maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * 我方九宫格中心（slot 0–8，与 Draft 相同：col 左→右，row 0 上→2 下；
 * row 2 / slot 6–8 为前排，靠近战场中线；row 0 为后排，靠屏幕下方）。
 * 整盘居于我方半场，slot 4 与半场中心对齐。
 */
export function allyBattleSlotCenter(slot: number): { x: number; y: number } {
  const col = slot % 3;
  const row = Math.floor(slot / 3);
  const { originX, originY } = allyBattleGridOrigin();
  const x = originX + col * (BOARD_GRID_CELL + BOARD_GRID_GAP) + BOARD_GRID_CELL / 2;
  const y = originY + row * (BOARD_GRID_CELL + BOARD_GRID_GAP) + BOARD_GRID_CELL / 2;
  return clampBattleSpawnXY(x, y);
}

/** 敌方首领：可玩战场上半区正中 */
export function enemyBossSpawnCenter(): { x: number; y: number } {
  const m = battleArenaMetrics();
  const y = m.playfieldTop + m.playfieldH * 0.25;
  return clampBattleSpawnXY(GAME_WIDTH / 2, y);
}

/**
 * 敌方小怪：上半场内、略远离中线；`rank` 0=远程靠上缘，1=近战靠中线侧。
 */
export function enemyMinionSpawnXY(
  rank: number,
  index: number,
  _waveOrder: number,
  scatterJx: number,
  scatterJy: number,
): { x: number; y: number } {
  const m = battleArenaMetrics();
  const zoneTop = m.playfieldTop + m.margin;
  const zoneBottom = m.midY - m.halfGap;
  const zoneH = Math.max(BOARD_GRID_CELL, zoneBottom - zoneTop);
  const yRanged = zoneTop + zoneH * 0.22;
  const yMelee = zoneTop + zoneH * 0.72;
  const rawY = yRanged + rank * (yMelee - yRanged);
  const clusterW = Math.round(212 * LAYOUT_SCALE);
  const gold = (index * 0.6180339887498949) % 1;
  const rawX = GAME_WIDTH / 2 + (gold - 0.5) * clusterW;
  return clampBattleSpawnXY(rawX + scatterJx * 0.32, rawY + scatterJy * 0.32);
}

/** 英雄上阵栏 0–2 → 前排九宫 slot 6、7、8 */
export function heroDeployBattleSlot(deploySlotIndex: number): number {
  return 6 + Math.min(2, Math.max(0, deploySlotIndex));
}
