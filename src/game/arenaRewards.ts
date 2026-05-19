/** 竞技场结算：胜利 n 场获得 1+2+…+n 张竞技场招募券 */
export function arenaTicketsForWinCount(wins: number): number {
  const w = Math.max(0, Math.floor(wins));
  return (w * (w + 1)) / 2;
}
