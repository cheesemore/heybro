import { bossIdForBookChapter, enemyPoolForBookChapter } from './bookChapterConfig';
import type { RunState } from './runState';
import type { BossId, EnemyClass, RoundMeta } from './types';
import { mulberry32 } from './seedRandom';

/** 与旧版普通关类似：总兵数随进度增加 */
function normalEnemyTotal(scaleRoundIndex: number): number {
  return 4 + 2 * scaleRoundIndex;
}

function pickThreeEnemyKindsFromPool(pool: readonly EnemyClass[], rnd: () => number): [EnemyClass, EnemyClass, EnemyClass] {
  const ix = [0, 1, 2, 3, 4, 5];
  for (let i = ix.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = ix[i]!;
    ix[i] = ix[j]!;
    ix[j] = t;
  }
  return [pool[ix[0]!]!, pool[ix[1]!]!, pool[ix[2]!]!];
}

function normalWaveFromPool(scaleRoundIndex: number, pool: readonly EnemyClass[], rnd: () => number): RoundMeta['enemies'] {
  const total = normalEnemyTotal(scaleRoundIndex);
  const kinds = pickThreeEnemyKindsFromPool(pool, rnd);

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

function waveSeed(bookChapterId: number, roundIndex: number): number {
  return (bookChapterId >>> 0) * 1000003 + (roundIndex >>> 0) * 7919 + 24601;
}

/** 为普通战/首领战生成敌阵（首领按外部章节轮换） */
export function resolveCombatRoundEnemies(run: RunState, roundIndex: number, meta: RoundMeta): RoundMeta['enemies'] {
  if (meta.kind === 'boss') {
    const bossId: BossId = bossIdForBookChapter(run.bookChapterId);
    return [{ type: 'boss', count: 1, bossId }];
  }
  if (meta.kind !== 'normal') return [];
  const pool = enemyPoolForBookChapter(run.bookChapterId);
  const rnd = mulberry32(waveSeed(run.bookChapterId, roundIndex));
  return normalWaveFromPool(roundIndex, pool, rnd);
}

/** 深拷贝关卡元数据并填入本局敌阵（勿修改 ROUNDS 静态表） */
export function getResolvedRoundMeta(run: RunState, roundIndex: number, base: RoundMeta): RoundMeta {
  const enemies = resolveCombatRoundEnemies(run, roundIndex, base);
  return { ...base, enemies };
}
