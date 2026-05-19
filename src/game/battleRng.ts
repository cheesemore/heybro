/** 可复现战斗用 PRNG（mulberry32）；seed 为任意整数 */
export function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseArenaBattleSeed(timestamp: string): number {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return Math.floor(n) >>> 0;
  let h = 0;
  for (let i = 0; i < timestamp.length; i++) {
    h = (Math.imul(31, h) + timestamp.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}
