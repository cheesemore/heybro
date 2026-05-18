import type { HeroId } from '../game/heroRegistry';
import {
  ARCHER_STRONG_STRIKE_BLUE_ID,
  KNIGHT_HOLY_SANCTION_BLUE_ID,
  MAGE_ARCANE_BLUE_ID,
  MULAN_HERO_ID,
  PRIEST_SHELTER_BLUE_ID,
} from '../game/heroRegistry';
import { getResolvedRoundMeta } from '../game/roundResolve';
import type { RunState } from '../game/runState';
import { ROUNDS, roundsForBookChapter } from '../game/roundConfig';
import type { AllyClass, RoundMeta } from '../game/types';
import { getWowChapterByBookId, wowFinalBossNameCn } from '../game/wowBookData';
import {
  CLASS_BALANCE_BATTLE_TIME_SCALE,
  CLASS_BALANCE_MIDDLE_SLOTS,
  CLASS_BALANCE_STACKS_PER_CLASS,
} from './classBalanceTestCore';

export const CLASS_BALANCE_BLUE_HERO: Record<AllyClass, HeroId> = {
  warrior: MULAN_HERO_ID,
  mage: MAGE_ARCANE_BLUE_ID,
  priest: PRIEST_SHELTER_BLUE_ID,
  archer: ARCHER_STRONG_STRIKE_BLUE_ID,
  knight: KNIGHT_HOLY_SANCTION_BLUE_ID,
  warlock: 'warlock_01',
  shaman: 'shaman_01',
  assassin: 'assassin_01',
  druid: 'druid_01',
};

export type ClassBalanceDeadminesPresetId = 'dm_s3' | 'dm_s4' | 'dm_s5' | 'dm_s6';

export type ClassBalanceDeadminesPreset = {
  id: ClassBalanceDeadminesPresetId;
  bookChapterId: number;
  stageLabelCn: string;
  roundChapter: 3;
  roundSub: number;
  kind: 'normal' | 'boss';
  hudLine: string;
};

function roundIndexForWorldNode(chapter: number, sub: number): number {
  const i = ROUNDS.findIndex((r) => r.chapter === chapter && r.sub === sub);
  return i >= 0 ? i : 0;
}

/** 死亡矿井第 1 章各「书本章节」关底首领战（第 3–6 关 → 书本 7–10） */
const DEADMINES_CH1_STAGE_PRESETS: ClassBalanceDeadminesPreset[] = [
  {
    id: 'dm_s3',
    bookChapterId: 7,
    stageLabelCn: '死亡矿井·第3关 · 基尔尼格',
    roundChapter: 3,
    roundSub: 6,
    kind: 'boss',
    hudLine: '关底首领战（书本第 7 章）',
  },
  {
    id: 'dm_s4',
    bookChapterId: 8,
    stageLabelCn: '死亡矿井·第4关 · 重拳先生',
    roundChapter: 3,
    roundSub: 6,
    kind: 'boss',
    hudLine: '关底首领战（书本第 8 章）',
  },
  {
    id: 'dm_s5',
    bookChapterId: 9,
    stageLabelCn: '死亡矿井·第5关 · 绿皮队长',
    roundChapter: 3,
    roundSub: 6,
    kind: 'boss',
    hudLine: '关底首领战（书本第 9 章）',
  },
  {
    id: 'dm_s6',
    bookChapterId: 10,
    stageLabelCn: '死亡矿井·第6关 · 范克里夫',
    roundChapter: 3,
    roundSub: 6,
    kind: 'boss',
    hudLine: '关底首领战（书本第 10 章）',
  },
];

export const CLASS_BALANCE_DEADMINES_PRESETS: Record<
  ClassBalanceDeadminesPresetId,
  ClassBalanceDeadminesPreset
> = Object.fromEntries(DEADMINES_CH1_STAGE_PRESETS.map((p) => [p.id, p])) as Record<
  ClassBalanceDeadminesPresetId,
  ClassBalanceDeadminesPreset
>;

export const DEFAULT_CLASS_BALANCE_PRESET_ID: ClassBalanceDeadminesPresetId = 'dm_s3';

export function classBalancePresetFromSearch(search: string): ClassBalanceDeadminesPreset {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const stage = params.get('stage')?.toLowerCase();
  if (stage === '3' || stage === 's3' || stage === 'dm_s3') return CLASS_BALANCE_DEADMINES_PRESETS.dm_s3;
  if (stage === '4' || stage === 's4' || stage === 'dm_s4') return CLASS_BALANCE_DEADMINES_PRESETS.dm_s4;
  if (stage === '5' || stage === 's5' || stage === 'dm_s5') return CLASS_BALANCE_DEADMINES_PRESETS.dm_s5;
  if (stage === '6' || stage === 's6' || stage === 'dm_s6') return CLASS_BALANCE_DEADMINES_PRESETS.dm_s6;
  const ch = Number(params.get('chapter'));
  if (ch === 7) return CLASS_BALANCE_DEADMINES_PRESETS.dm_s3;
  if (ch === 8) return CLASS_BALANCE_DEADMINES_PRESETS.dm_s4;
  if (ch === 9) return CLASS_BALANCE_DEADMINES_PRESETS.dm_s5;
  if (ch === 10) return CLASS_BALANCE_DEADMINES_PRESETS.dm_s6;
  return CLASS_BALANCE_DEADMINES_PRESETS[DEFAULT_CLASS_BALANCE_PRESET_ID];
}

/** 中间列站位：slots[0] 为上格、slots[2] 为下格 */
export function buildMiddleColumnBoard(
  topToBottom: readonly [AllyClass, AllyClass, AllyClass],
  stacks = CLASS_BALANCE_STACKS_PER_CLASS,
): RunState['board'] {
  const board: RunState['board'] = Array.from({ length: 9 }, () => null);
  for (let i = 0; i < 3; i++) {
    board[CLASS_BALANCE_MIDDLE_SLOTS[i]!] = { kind: topToBottom[i]!, stacks };
  }
  return board;
}

export function seedClassBalanceTestRun(
  run: RunState,
  preset: ClassBalanceDeadminesPreset,
  formation: readonly [AllyClass, AllyClass, AllyClass],
  globalCorrectionPct: number,
): RoundMeta {
  run.resetRun();
  run.bookChapterId = preset.bookChapterId;
  const roundIndex = roundIndexForWorldNode(preset.roundChapter, preset.roundSub);
  run.currentRoundIndex = roundIndex;
  run.board = buildMiddleColumnBoard(formation);
  const mult = Math.max(0.01, globalCorrectionPct / 100);
  run.externalGrowth = { permanentDamageMult: mult, permanentMaxHpMult: mult };
  run.devBattleHooks = {
    heroDeploy: formation.map((c) => CLASS_BALANCE_BLUE_HERO[c]),
    heroSlotCap: 3,
    postSpawnHpMult: 1,
    gearGsBattleOverride: 0,
    battleTimeScale: CLASS_BALANCE_BATTLE_TIME_SCALE,
    battleFinishPostDelaySec: 0.12,
  };

  const rounds = roundsForBookChapter(preset.bookChapterId);
  const base = rounds[roundIndex] ?? ROUNDS[roundIndex]!;
  const baseMeta: RoundMeta = {
    ...base,
    kind: preset.kind,
    label: `平衡测试：${preset.stageLabelCn}`,
  };
  const resolved = getResolvedRoundMeta(run, roundIndex, baseMeta);
  const ch = getWowChapterByBookId(preset.bookChapterId);
  const stageName = ch?.stageNameCn ?? preset.stageLabelCn;
  const bossName = wowFinalBossNameCn(preset.bookChapterId) || '首领';
  return {
    ...resolved,
    label: `平衡测试：${stageName} · ${bossName} · ${formationLabelFromFormation(formation)} · 全局${globalCorrectionPct}%`,
    skipBattleOpeningCountdown: true,
  };
}

function formationLabelFromFormation(formation: readonly [AllyClass, AllyClass, AllyClass]): string {
  const map: Record<AllyClass, string> = {
    warrior: '战',
    mage: '法',
    priest: '牧',
    archer: '射',
    knight: '骑',
    warlock: '术',
    shaman: '萨',
    assassin: '刺',
    druid: '德',
  };
  return formation.map((c) => map[c]).join('');
}
