import { ENEMY_CLASSES } from './constants';
import type { BossId, EnemyClass, RoundKind, RoundMeta } from './types';

function label(ch: 1 | 2 | 3, sub: number): string {
  return `${ch}-${sub}`;
}

function mk(
  chapter: 1 | 2 | 3,
  sub: number,
  kind: RoundKind,
  enemies: RoundMeta['enemies'],
): RoundMeta {
  return { label: label(chapter, sub), chapter, sub, kind, enemies };
}

/** 全局战斗回合索引：0 = 1-1，23 = 3-8 */
export function battleRoundIndex(chapter: 1 | 2 | 3, sub: number): number {
  return (chapter - 1) * 8 + (sub - 1);
}

/** 普通关总敌人数：首关 4，之后每全局关 +2 */
function normalEnemyTotal(roundIndex: number): number {
  return 4 + 2 * roundIndex;
}

/** 每关随机 3 种不同敌人（从 12 种里取），数量按总兵力拆分；每关最多 3 种。 */
function pickThreeEnemyKinds(roundIndex: number, chapter: 1 | 2 | 3): [EnemyClass, EnemyClass, EnemyClass] {
  const n = ENEMY_CLASSES.length;
  const picked: EnemyClass[] = [];
  let k = (roundIndex * 17 + chapter * 13 + 5) % n;
  for (let tries = 0; picked.length < 3 && tries < n * 3; tries++) {
    const t = ENEMY_CLASSES[k % n]!;
    if (!picked.includes(t)) picked.push(t);
    k = (k * 5 + 11) % n;
  }
  while (picked.length < 3) {
    for (const t of ENEMY_CLASSES) {
      if (!picked.includes(t)) {
        picked.push(t);
        break;
      }
    }
  }
  return [picked[0]!, picked[1]!, picked[2]!];
}

function normalWave(roundIndex: number, chapter: 1 | 2 | 3): RoundMeta['enemies'] {
  const total = normalEnemyTotal(roundIndex);
  const kinds = pickThreeEnemyKinds(roundIndex, chapter);

  let c0 = Math.max(1, Math.round(total * 0.52));
  let c1 = Math.max(1, Math.round(total * 0.3));
  let c2 = total - c0 - c1;
  if (c2 < 1) {
    c2 = 1;
    c1 = Math.max(1, total - c0 - c2);
  }
  if (c0 + c1 + c2 > total) {
    let over = c0 + c1 + c2 - total;
    while (over > 0 && c0 > 1) {
      c0--;
      over--;
    }
    while (over > 0 && c1 > 1) {
      c1--;
      over--;
    }
  }
  while (c0 + c1 + c2 < total) c0++;

  const out: RoundMeta['enemies'] = [];
  if (c0 > 0) out.push({ type: kinds[0], count: c0 });
  if (c1 > 0) out.push({ type: kinds[1], count: c1 });
  if (c2 > 0) out.push({ type: kinds[2], count: c2 });
  return out;
}

/** 24 关：1-1..1-8, 2-1..2-8, 3-1..3-8 */
export const ROUNDS: RoundMeta[] = [];

for (let chapter = 1 as 1 | 2 | 3; chapter <= 3; chapter++) {
  for (let sub = 1; sub <= 8; sub++) {
    const idx = battleRoundIndex(chapter, sub);
    const kind: RoundKind =
      sub === 3 ? 'strategy' : sub === 7 ? 'reward' : sub === 8 ? 'boss' : 'normal';
    if (kind === 'boss') {
      const bossId: BossId = chapter === 1 ? 'farseer' : chapter === 2 ? 'tauren' : 'blademaster';
      ROUNDS.push(mk(chapter, sub, 'boss', [{ type: 'boss', count: 1, bossId }]));
    } else if (kind === 'strategy' || kind === 'reward') {
      ROUNDS.push(mk(chapter, sub, kind, []));
    } else {
      ROUNDS.push(mk(chapter, sub, 'normal', normalWave(idx, chapter)));
    }
  }
}

export function defeatDamageMultiplier(roundIndex: number): number {
  if (roundIndex >= 8 && roundIndex <= 15) return 2;
  if (roundIndex >= 16) return 3;
  return 1;
}

export function bossDisplayName(id: BossId): string {
  switch (id) {
    case 'farseer':
      return '先知';
    case 'tauren':
      return '牛头人酋长';
    case 'blademaster':
      return '剑圣';
    default:
      return id;
  }
}
