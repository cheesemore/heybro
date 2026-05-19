import { allBondStacks, classBondHpAtkMultiplier, druidBondTeamMultiplier, priestBondTeamMultiplier, shamanBondTeamMultiplier } from './battleBonds';
import { BOARD_CELL_MAX_STACKS } from './constants';
import type { ArenaLineupSnapshot } from './arenaStorage';
import { ensureArenaUsername } from './arenaUsername';
import { getHeroDef, heroStarStatMult, type HeroId } from './heroRegistry';
import type { ArtifactKind } from './strategyTypes';
import type { AllyClass, BoardCell } from './types';
import { ALLY_DEFS } from './unitDefs';
import { ALLY_CLASSES } from './constants';

const COMM_STORAGE_KEY = 'heybro.arena.comm.v1';

/** 与通信协议一致；不含胜场等本地进度 */
export type ArenaBattleData = {
  version: 1;
  lineup: {
    board: Array<{ kind: AllyClass; stacks: number } | null>;
    artifactBySlot: (ArtifactKind | null)[];
    heroDeploy: (HeroId | null)[];
  };
  bonds: Record<AllyClass, number>;
  atk: number;
  def: number;
};

export type ArenaCommRecord = {
  username: string;
  timestamp: string;
  battle_data: ArenaBattleData;
};

export type ArenaMatchApiResponse = {
  opponent?: ArenaCommRecord;
  /** 部分服务端可能直接返回对手存档根对象 */
  username?: string;
  timestamp?: string;
  battle_data?: ArenaBattleData;
};

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function cloneBoard(b: BoardCell[]): BoardCell[] {
  return b.map((c) => (c ? { kind: c.kind, stacks: c.stacks } : null));
}

function lineupToBattleData(lineup: ArenaLineupSnapshot): ArenaBattleData {
  const bonds = allBondStacks(lineup.board);
  const teamM =
    priestBondTeamMultiplier(bonds.priest) *
    shamanBondTeamMultiplier(bonds.shaman) *
    druidBondTeamMultiplier(bonds.druid);
  let atk = 0;
  let def = 0;
  for (let slot = 0; slot < 9; slot++) {
    const cell = lineup.board[slot];
    if (!cell) continue;
    const defU = ALLY_DEFS[cell.kind];
    const stacks = Math.min(cell.stacks, BOARD_CELL_MAX_STACKS);
    const classM = classBondHpAtkMultiplier(bonds[cell.kind]);
    const mult = classM * teamM;
    const n = Math.max(1, stacks);
    atk += Math.round(defU.atk * mult) * n;
    def += Math.round(defU.maxHp * mult) * n;
  }
  const cap = Math.min(3, lineup.heroDeploy.length);
  for (let s = 0; s < cap; s++) {
    const hid = lineup.heroDeploy[s];
    if (!hid) continue;
    const hd = getHeroDef(hid);
    if (!hd) continue;
    const starM = heroStarStatMult(1);
    const classM = classBondHpAtkMultiplier(bonds[hd.allyClass]);
    const mult = classM * teamM;
    atk += Math.round(hd.atk * starM * mult);
    def += Math.round(hd.maxHp * starM * mult);
  }
  return {
    version: 1,
    lineup: {
      board: cloneBoard(lineup.board).map((c) =>
        c ? { kind: c.kind, stacks: c.stacks } : null,
      ),
      artifactBySlot: [...lineup.artifactBySlot],
      heroDeploy: [...lineup.heroDeploy],
    },
    bonds,
    atk: Math.max(1, atk),
    def: Math.max(1, def),
  };
}

/** 锁定阵容写入本地通信档（timestamp 留空，点「对战」时再生成） */
export function saveArenaCommLineupLocal(lineup: ArenaLineupSnapshot): void {
  saveArenaCommRecordLocal({
    username: ensureArenaUsername(),
    timestamp: '',
    battle_data: lineupToBattleData(lineup),
  });
}

/**
 * 预览即将 POST 的 body（不写本地 timestamp、不发起请求）。
 * timestamp 为空时用当前时间展示「若点对战将提交的值」。
 */
export function previewArenaPostBody(lineup: ArenaLineupSnapshot): ArenaCommRecord {
  const existing = getArenaLocalTimestamp();
  return {
    username: ensureArenaUsername(),
    timestamp: existing || String(Date.now()),
    battle_data: lineupToBattleData(lineup),
  };
}

/** 模拟服务端 `ok` 响应里的 `data` 字段（己方 battle_data 走序列化，用于测试解析开战） */
export function buildArenaTestMatchData(lineup: ArenaLineupSnapshot): ArenaCommRecord {
  const post = previewArenaPostBody(lineup);
  return {
    username: `${post.username}_test`,
    timestamp: post.timestamp,
    battle_data: post.battle_data,
  };
}

export function defenderLineupFromMatchData(
  data: unknown,
):
  | { ok: true; record: ArenaCommRecord; lineup: ArenaLineupSnapshot }
  | { ok: false; error: string } {
  const record = parseArenaOpponentRecord(data);
  if (!record) {
    return { ok: false, error: 'data 格式无法解析，请检查 username / timestamp / battle_data' };
  }
  if (!arenaBattleDataHasPlayableLineup(record.battle_data)) {
    return {
      ok: false,
      error: 'battle_data 无法开战：缺少完整 lineup（仅 atk/def 不够）',
    };
  }
  return { ok: true, record, lineup: arenaLineupFromBattleData(record.battle_data) };
}

/** 对战 POST 前：刷新 battle_data；若 timestamp 为空则立即赋值并落盘 */
export function prepareArenaPostRecord(lineup: ArenaLineupSnapshot): ArenaCommRecord {
  const battle_data = lineupToBattleData(lineup);
  const username = ensureArenaUsername();
  const prev = loadArenaCommRecordLocal();
  const record: ArenaCommRecord = {
    username,
    timestamp: prev?.timestamp?.trim() ? prev.timestamp : '',
    battle_data,
  };
  if (!record.timestamp) {
    record.timestamp = String(Date.now());
  }
  saveArenaCommRecordLocal(record);
  return record;
}

export function clearArenaLocalTimestamp(): void {
  const r = loadArenaCommRecordLocal();
  if (!r) return;
  r.timestamp = '';
  saveArenaCommRecordLocal(r);
}

export function getArenaLocalTimestamp(): string {
  return loadArenaCommRecordLocal()?.timestamp?.trim() ?? '';
}

/** 对手 battle_data 是否含可开战九宫（服务端若只回 atk/def 则不可用） */
export function arenaBattleDataHasPlayableLineup(data: ArenaBattleData): boolean {
  return data.lineup.board.some((c) => c != null);
}

export function saveArenaCommRecordLocal(record: ArenaCommRecord): void {
  safeLs()?.setItem(COMM_STORAGE_KEY, JSON.stringify(record));
}

/** 领奖 / 放弃本轮后清空本地 POST 通信档（username 仍保留） */
export function clearArenaCommRecord(): void {
  safeLs()?.removeItem(COMM_STORAGE_KEY);
}

export function loadArenaCommRecordLocal(): ArenaCommRecord | null {
  const raw = safeLs()?.getItem(COMM_STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseArenaCommRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseArenaCommRecord(raw: unknown): ArenaCommRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.username !== 'string' || typeof o.timestamp !== 'string') return null;
  const bd = parseArenaBattleData(o.battle_data);
  if (!bd) return null;
  return { username: o.username, timestamp: o.timestamp, battle_data: bd };
}

export function parseArenaMatchResponse(raw: unknown): ArenaCommRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as ArenaMatchApiResponse;
  if (o.opponent) return parseArenaCommRecord(o.opponent);
  if (typeof o.username === 'string' && typeof o.timestamp === 'string' && o.battle_data) {
    return parseArenaCommRecord(o);
  }
  return null;
}

function parseArenaBattleData(raw: unknown): ArenaBattleData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const atk = typeof o.atk === 'number' ? Math.max(1, Math.floor(o.atk)) : 0;
  const def = typeof o.def === 'number' ? Math.max(1, Math.floor(o.def)) : 0;
  const lineupRaw = o.lineup;
  if (!lineupRaw || typeof lineupRaw !== 'object') {
    if (atk <= 0 && def <= 0) return null;
    const bonds = {} as Record<AllyClass, number>;
    for (const k of ALLY_CLASSES) bonds[k] = 0;
    return {
      version: 1,
      lineup: {
        board: Array.from({ length: 9 }, () => null),
        artifactBySlot: Array.from({ length: 9 }, () => null),
        heroDeploy: [null, null, null],
      },
      bonds,
      atk: Math.max(1, atk),
      def: Math.max(1, def),
    };
  }
  const lu = lineupRaw as Record<string, unknown>;
  if (!Array.isArray(lu.board) || lu.board.length !== 9) return null;
  if (!Array.isArray(lu.artifactBySlot) || lu.artifactBySlot.length !== 9) return null;
  if (!Array.isArray(lu.heroDeploy) || lu.heroDeploy.length !== 3) return null;
  const board: ArenaBattleData['lineup']['board'] = [];
  for (const c of lu.board) {
    if (c == null) {
      board.push(null);
      continue;
    }
    if (typeof c !== 'object') return null;
    const cell = c as Record<string, unknown>;
    if (typeof cell.kind !== 'string' || typeof cell.stacks !== 'number') return null;
    board.push({ kind: cell.kind as AllyClass, stacks: Math.floor(cell.stacks) });
  }
  const bondsRaw = o.bonds;
  const bonds = {} as Record<AllyClass, number>;
  if (!bondsRaw || typeof bondsRaw !== 'object') return null;
  for (const k of ALLY_CLASSES) {
    const v = (bondsRaw as Record<string, unknown>)[k];
    bonds[k] = typeof v === 'number' ? Math.max(0, Math.floor(v)) : 0;
  }
  return {
    version: 1,
    lineup: {
      board,
      artifactBySlot: lu.artifactBySlot as (ArtifactKind | null)[],
      heroDeploy: lu.heroDeploy as (HeroId | null)[],
    },
    bonds,
    atk: Math.max(1, Math.floor(atk || 1)),
    def: Math.max(1, Math.floor(def || 1)),
  };
}

/** 解析服务端 `data` 字段（ok 时对手信息） */
export function parseArenaOpponentRecord(raw: unknown): ArenaCommRecord | null {
  return parseArenaCommRecord(raw);
}

export function arenaLineupFromBattleData(data: ArenaBattleData): ArenaLineupSnapshot {
  return {
    board: data.lineup.board.map((c) => (c ? { kind: c.kind, stacks: c.stacks } : null)),
    artifactBySlot: [...data.lineup.artifactBySlot],
    heroDeploy: [...data.lineup.heroDeploy],
  };
}
