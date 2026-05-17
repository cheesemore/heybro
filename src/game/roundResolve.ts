import { mobIdsForBookChapter } from './bookChapterConfig';
import type { RunState } from './runState';
import type { BossId, RoundMeta } from './types';
import { legacyProgressRoundIndex, roundsForBookChapter } from './roundConfig';
import { mulberry32 } from './seedRandom';
import { getWowMob, wowFinalBossNameCn, wowMobEnemyPaint } from './wowBookData';

/** 与旧版普通关类似：总兵数随进度增加 */
function normalEnemyTotal(scaleRoundIndex: number): number {
  return 4 + 2 * scaleRoundIndex;
}

/**
 * 书本第 3 章及以后：本章倒数第 2 / 第 1 个普通战节点总量 +25% / +40%（四舍五入）。
 * 「普通战」不含策略、奖励、首领节点。
 */
function normalEnemyCountMultiplierForRound(bookChapterId: number, roundIndex: number): number {
  if (bookChapterId < 3) return 1;
  const rounds = roundsForBookChapter(bookChapterId);
  const normalIndices: number[] = [];
  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i]!.kind === 'normal') normalIndices.push(i);
  }
  if (normalIndices.length < 2) return 1;
  const last = normalIndices[normalIndices.length - 1]!;
  const secondLast = normalIndices[normalIndices.length - 2]!;
  if (roundIndex === secondLast) return 1.25;
  if (roundIndex === last) return 1.4;
  return 1;
}

function resolveNormalEnemyTotal(
  bookChapterId: number,
  roundIndex: number,
  scaleRoundIndex: number,
): number {
  const base = normalEnemyTotal(scaleRoundIndex);
  const mult = normalEnemyCountMultiplierForRound(bookChapterId, roundIndex);
  return mult === 1 ? base : Math.round(base * mult);
}

function pickThreeMobIdsFromPool(pool: readonly string[], rnd: () => number): [string, string, string] {
  const n = pool.length;
  if (!n) {
    throw new Error('[roundResolve] mob pool empty');
  }
  let i0: number;
  let i1: number;
  let i2: number;
  if (n >= 3) {
    const ix = Array.from({ length: n }, (_, i) => i);
    for (let i = ix.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = ix[i]!;
      ix[i] = ix[j]!;
      ix[j] = t;
    }
    i0 = ix[0]!;
    i1 = ix[1]!;
    i2 = ix[2]!;
  } else if (n === 2) {
    i0 = 0;
    i1 = 1;
    i2 = rnd() < 0.5 ? 0 : 1;
  } else {
    i0 = 0;
    i1 = 0;
    i2 = 0;
  }
  return [pool[i0]!, pool[i1]!, pool[i2]!];
}

function normalWaveFromWowMobPool(
  total: number,
  mobIds: readonly string[],
  rnd: () => number,
): RoundMeta['enemies'] {
  const kinds = pickThreeMobIdsFromPool(mobIds, rnd);

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

  const row = (id: string, count: number): RoundMeta['enemies'][number] => {
    const mob = getWowMob(id);
    const paint = mob ? wowMobEnemyPaint(mob) : 'grunt';
    return { type: paint, count, wowMobId: id };
  };

  const out: RoundMeta['enemies'] = [];
  if (c0 > 0) out.push(row(kinds[0]!, c0));
  if (c1 > 0) out.push(row(kinds[1]!, c1));
  if (c2 > 0) out.push(row(kinds[2]!, c2));
  return out;
}

function waveSeed(bookChapterId: number, roundIndex: number): number {
  return (bookChapterId >>> 0) * 1000003 + (roundIndex >>> 0) * 7919 + 24601;
}

function effectiveMobPool(bookChapterId: number): readonly string[] {
  let pool = mobIdsForBookChapter(bookChapterId);
  if (pool.length > 0) return pool;
  pool = mobIdsForBookChapter(1);
  return pool.length > 0 ? pool : ['mob_ragefire_trogg'];
}

/** 为普通战/首领战生成敌阵（小怪来自用书表；关底首领用 `white` 作 bossId，数值与技能仅来自 `wowBookBosses` 该章行 + 代码表底缺省） */
export function resolveCombatRoundEnemies(run: RunState, roundIndex: number, meta: RoundMeta): RoundMeta['enemies'] {
  if (meta.kind === 'boss') {
    const bossId: BossId = 'white';
    const wowBossDisplayName = wowFinalBossNameCn(run.bookChapterId);
    return [{ type: 'boss', count: 1, bossId, wowBossDisplayName: wowBossDisplayName || undefined }];
  }
  if (meta.kind !== 'normal') return [];
  const pool = effectiveMobPool(run.bookChapterId);
  const rnd = mulberry32(waveSeed(run.bookChapterId, roundIndex));
  const scaleRi = legacyProgressRoundIndex(run.bookChapterId, roundIndex);
  const total = resolveNormalEnemyTotal(run.bookChapterId, roundIndex, scaleRi);
  return normalWaveFromWowMobPool(total, pool, rnd);
}

/** 深拷贝关卡元数据并填入本局敌阵（勿修改 ROUNDS 静态表） */
export function getResolvedRoundMeta(run: RunState, roundIndex: number, base: RoundMeta): RoundMeta {
  const enemies = resolveCombatRoundEnemies(run, roundIndex, base);
  return { ...base, enemies };
}
