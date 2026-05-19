import { clearArenaCommRecord, saveArenaCommLineupLocal } from './arenaComm';
import { arenaTicketsForWinCount } from './arenaRewards';
import { getDeployedHeroIds } from './heroMetaStorage';
import { getHeroDef, type HeroId } from './heroRegistry';
import type { ArtifactKind } from './strategyTypes';
import type { BoardCell } from './types';
import type { AllyClass } from './types';
import type { RunState } from './runState';

const STORAGE_KEY = 'heybro.arena.v1';

export const ARENA_DRAFT_STARTING_GOLD = 500;
export const ARENA_MAX_LOSSES = 3;

export type ArenaLineupSnapshot = {
  board: BoardCell[];
  artifactBySlot: (ArtifactKind | null)[];
  /** 保存阵容时锁定的英雄栏（最多 3 格） */
  heroDeploy: (HeroId | null)[];
};

export type ArenaDraftProgress = {
  board: BoardCell[];
  artifactBySlot: (ArtifactKind | null)[];
  gold: number;
  picksThisRound: number;
};

export type ArenaSaveFile = {
  version: 1;
  /** 进行中的选阵（未锁定） */
  draft: ArenaDraftProgress | null;
  /** 已锁定阵容；与 draft 互斥 */
  lockedLineup: ArenaLineupSnapshot | null;
  wins: number;
  losses: number;
  /** 累计历史胜场（每次竞技场胜利 +1） */
  lifetimeWins: number;
  /** 竞技场额外招募券（与章节星招募券分开计数） */
  arenaRecruitTickets: number;
};

function emptyBoard(): BoardCell[] {
  return Array.from({ length: 9 }, () => null);
}

function emptyArtifacts(): (ArtifactKind | null)[] {
  return Array.from({ length: 9 }, () => null);
}

function cloneBoard(b: BoardCell[]): BoardCell[] {
  return b.map((c) => (c ? { kind: c.kind, stacks: c.stacks } : null));
}

function cloneArtifacts(a: (ArtifactKind | null)[]): (ArtifactKind | null)[] {
  return [...a];
}

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function defaultSave(): ArenaSaveFile {
  return {
    version: 1,
    draft: null,
    lockedLineup: null,
    wins: 0,
    losses: 0,
    lifetimeWins: 0,
    arenaRecruitTickets: 0,
  };
}

function parse(raw: string | null): ArenaSaveFile {
  if (!raw) return defaultSave();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.version !== 1) return defaultSave();
    const draft = parseDraft(o.draft);
    const locked = parseLineup(o.lockedLineup);
    return {
      version: 1,
      draft: locked ? null : draft,
      lockedLineup: locked,
      wins: typeof o.wins === 'number' ? Math.max(0, Math.floor(o.wins)) : 0,
      losses: typeof o.losses === 'number' ? Math.max(0, Math.floor(o.losses)) : 0,
      lifetimeWins: typeof o.lifetimeWins === 'number' ? Math.max(0, Math.floor(o.lifetimeWins)) : 0,
      arenaRecruitTickets:
        typeof o.arenaRecruitTickets === 'number' ? Math.max(0, Math.floor(o.arenaRecruitTickets)) : 0,
    };
  } catch {
    return defaultSave();
  }
}

function parseBoard(raw: unknown): BoardCell[] | null {
  if (!Array.isArray(raw) || raw.length !== 9) return null;
  const out: BoardCell[] = [];
  for (let i = 0; i < 9; i++) {
    const c = raw[i];
    if (c == null) {
      out.push(null);
      continue;
    }
    if (typeof c !== 'object') return null;
    const cell = c as Record<string, unknown>;
    const kind = cell.kind;
    const stacks = cell.stacks;
    if (typeof kind !== 'string' || typeof stacks !== 'number') return null;
    out.push({ kind: kind as AllyClass, stacks: Math.floor(stacks) });
  }
  return out;
}

function parseArtifacts(raw: unknown): (ArtifactKind | null)[] | null {
  if (!Array.isArray(raw) || raw.length !== 9) return null;
  return raw.map((x) => (x === null ? null : (x as ArtifactKind)));
}

function parseHeroDeploy(raw: unknown): (HeroId | null)[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const out: (HeroId | null)[] = [];
  for (const x of raw) {
    if (x === null) {
      out.push(null);
      continue;
    }
    if (typeof x === 'string' && getHeroDef(x as HeroId)) {
      out.push(x as HeroId);
    } else {
      return null;
    }
  }
  return out;
}

function defaultHeroDeployFromMeta(): (HeroId | null)[] {
  const d = getDeployedHeroIds();
  return [d[0] ?? null, d[1] ?? null, d[2] ?? null];
}

function parseLineup(raw: unknown): ArenaLineupSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const board = parseBoard(o.board);
  const artifactBySlot = parseArtifacts(o.artifactBySlot);
  if (!board || !artifactBySlot) return null;
  const heroDeploy = parseHeroDeploy(o.heroDeploy) ?? defaultHeroDeployFromMeta();
  return { board, artifactBySlot, heroDeploy };
}

function parseDraft(raw: unknown): ArenaDraftProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const board = parseBoard(o.board);
  const artifactBySlot = parseArtifacts(o.artifactBySlot);
  if (!board || !artifactBySlot) return null;
  return {
    board,
    artifactBySlot,
    gold: typeof o.gold === 'number' ? Math.max(0, Math.floor(o.gold)) : ARENA_DRAFT_STARTING_GOLD,
    picksThisRound: typeof o.picksThisRound === 'number' ? Math.max(0, Math.floor(o.picksThisRound)) : 0,
  };
}

function save(data: ArenaSaveFile): void {
  const ls = safeLs();
  if (!ls) return;
  ls.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadArenaSave(): ArenaSaveFile {
  const ls = safeLs();
  return parse(ls?.getItem(STORAGE_KEY) ?? null);
}

export function clearPersistedArena(): void {
  safeLs()?.removeItem(STORAGE_KEY);
}

export function getArenaRecruitTickets(): number {
  return loadArenaSave().arenaRecruitTickets;
}

export function getArenaLifetimeWins(): number {
  return loadArenaSave().lifetimeWins;
}

export function arenaHasLockedLineup(): boolean {
  return loadArenaSave().lockedLineup != null;
}

export function arenaIsRetired(): boolean {
  const s = loadArenaSave();
  return s.lockedLineup != null && s.losses >= ARENA_MAX_LOSSES;
}

export function arenaCanBattle(): boolean {
  const s = loadArenaSave();
  return s.lockedLineup != null && s.losses < ARENA_MAX_LOSSES;
}

export function arenaAwaitingClaim(): boolean {
  return arenaIsRetired();
}

export function getArenaRunRecord(): { wins: number; losses: number } {
  const s = loadArenaSave();
  return { wins: s.wins, losses: s.losses };
}

export function getArenaLockedLineup(): ArenaLineupSnapshot | null {
  const s = loadArenaSave();
  if (!s.lockedLineup) return null;
  const l = s.lockedLineup;
  return {
    board: cloneBoard(l.board),
    artifactBySlot: cloneArtifacts(l.artifactBySlot),
    heroDeploy: [...l.heroDeploy],
  };
}

/** 从当前招募棋盘与英雄栏生成待锁定快照（保存阵容时调用） */
export function buildArenaLineupSnapshotFromRun(run: RunState): ArenaLineupSnapshot {
  const dep = getDeployedHeroIds();
  return {
    board: cloneBoard(run.board),
    artifactBySlot: cloneArtifacts(run.artifactBySlot),
    heroDeploy: [dep[0] ?? null, dep[1] ?? null, dep[2] ?? null],
  };
}

export function getArenaDraftProgress(): ArenaDraftProgress | null {
  const s = loadArenaSave();
  if (!s.draft || s.lockedLineup) return null;
  return {
    board: cloneBoard(s.draft.board),
    artifactBySlot: cloneArtifacts(s.draft.artifactBySlot),
    gold: s.draft.gold,
    picksThisRound: s.draft.picksThisRound,
  };
}

export function startNewArenaDraft(): ArenaDraftProgress {
  const s = loadArenaSave();
  if (s.lockedLineup) return getArenaDraftProgress() ?? createFreshDraft();
  const draft: ArenaDraftProgress = createFreshDraft();
  s.draft = draft;
  s.lockedLineup = null;
  s.wins = 0;
  s.losses = 0;
  save(s);
  return { ...draft, board: cloneBoard(draft.board), artifactBySlot: cloneArtifacts(draft.artifactBySlot) };
}

function createFreshDraft(): ArenaDraftProgress {
  return {
    board: emptyBoard(),
    artifactBySlot: emptyArtifacts(),
    gold: ARENA_DRAFT_STARTING_GOLD,
    picksThisRound: 0,
  };
}

export function persistArenaDraft(draft: ArenaDraftProgress): void {
  const s = loadArenaSave();
  if (s.lockedLineup) return;
  s.draft = {
    board: cloneBoard(draft.board),
    artifactBySlot: cloneArtifacts(draft.artifactBySlot),
    gold: draft.gold,
    picksThisRound: draft.picksThisRound,
  };
  save(s);
}

export function abandonArenaDraft(): void {
  const s = loadArenaSave();
  s.draft = null;
  save(s);
}

export function lockArenaLineup(snapshot: ArenaLineupSnapshot): void {
  const s = loadArenaSave();
  s.draft = null;
  s.lockedLineup = {
    board: cloneBoard(snapshot.board),
    artifactBySlot: cloneArtifacts(snapshot.artifactBySlot),
    heroDeploy: [...snapshot.heroDeploy],
  };
  s.wins = 0;
  s.losses = 0;
  save(s);
  saveArenaCommLineupLocal(s.lockedLineup);
}

/** @returns 本次是否第 3 败（阵容作废，应领奖） */
export function recordArenaBattleWin(): boolean {
  const s = loadArenaSave();
  if (!s.lockedLineup || s.losses >= ARENA_MAX_LOSSES) return false;
  s.wins += 1;
  s.lifetimeWins += 1;
  save(s);
  return false;
}

export function recordArenaBattleLoss(): boolean {
  const s = loadArenaSave();
  if (!s.lockedLineup || s.losses >= ARENA_MAX_LOSSES) return false;
  s.losses += 1;
  save(s);
  return s.losses >= ARENA_MAX_LOSSES;
}

/** 领奖并结束本轮竞技场；返回本次获得的竞技场招募券 */
export function claimArenaRewards(): number {
  const s = loadArenaSave();
  const gained = arenaTicketsForWinCount(s.wins);
  s.arenaRecruitTickets += gained;
  s.lockedLineup = null;
  s.wins = 0;
  s.losses = 0;
  s.draft = null;
  save(s);
  clearArenaCommRecord();
  return gained;
}
