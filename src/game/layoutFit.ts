import { GAME_WIDTH, LAYOUT_SCALE } from './constants';

export type FitThreeRow = {
  sideW: number;
  midW: number;
  btnGap: number;
  rowX: number;
  rowW: number;
};

/** 中间主按钮 + 两侧副按钮，整体落在 `[pad, GAME_WIDTH - pad]` 内（避免横屏/窄逻辑宽超框） */
export function fitChapterBottomButtonRow(
  pad: number,
  baseSideW: number,
  baseMidW: number,
  baseGap: number,
): FitThreeRow {
  const maxRowW = GAME_WIDTH - pad * 2;
  let sideW = baseSideW;
  let midW = baseMidW;
  let btnGap = baseGap;
  let rowW = sideW + btnGap + midW + btnGap + sideW;
  if (rowW <= maxRowW) {
    return { sideW, midW, btnGap, rowX: (GAME_WIDTH - rowW) / 2, rowW };
  }
  const scale = maxRowW / rowW;
  sideW = Math.max(Math.round(130 * LAYOUT_SCALE), Math.floor(sideW * scale));
  midW = Math.max(Math.round(220 * LAYOUT_SCALE), Math.floor(midW * scale));
  btnGap = Math.max(Math.round(10 * LAYOUT_SCALE), Math.floor(btnGap * scale));
  rowW = sideW + btnGap + midW + btnGap + sideW;
  if (rowW > maxRowW) {
    midW = Math.max(Math.round(200 * LAYOUT_SCALE), midW - (rowW - maxRowW));
    rowW = sideW + btnGap + midW + btnGap + sideW;
  }
  return { sideW, midW, btnGap, rowX: (GAME_WIDTH - rowW) / 2, rowW };
}

export type FitTwoRow = {
  leftW: number;
  rightW: number;
  btnGap: number;
  startX: number;
  totalW: number;
};

/** 底部「退出 | 进入」一行，保证不超出可用宽度 */
export function fitMapBottomEnterRow(
  pad: number,
  baseExitW: number,
  baseEnterW: number,
  baseGap: number,
): FitTwoRow {
  const maxW = GAME_WIDTH - pad * 2;
  let exitW = baseExitW;
  let enterW = baseEnterW;
  let btnGap = baseGap;
  let totalW = exitW + btnGap + enterW;
  if (totalW <= maxW) {
    return { leftW: exitW, rightW: enterW, btnGap, startX: (GAME_WIDTH - totalW) / 2, totalW };
  }
  const scale = maxW / totalW;
  exitW = Math.max(Math.round(110 * LAYOUT_SCALE), Math.floor(exitW * scale));
  enterW = Math.max(Math.round(260 * LAYOUT_SCALE), Math.floor(enterW * scale));
  btnGap = Math.max(Math.round(10 * LAYOUT_SCALE), Math.floor(btnGap * scale));
  totalW = exitW + btnGap + enterW;
  if (totalW > maxW) {
    enterW = Math.max(Math.round(220 * LAYOUT_SCALE), enterW - (totalW - maxW));
    totalW = exitW + btnGap + enterW;
  }
  return { leftW: exitW, rightW: enterW, btnGap, startX: (GAME_WIDTH - totalW) / 2, totalW };
}
