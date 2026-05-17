import type { HeroId } from '../game/heroRegistry';
import type { RunState } from '../game/runState';
import { roundsForBookChapter } from '../game/roundConfig';
import type { RoundMeta } from '../game/types';
import { wowFinalBossNameCn } from '../game/wowBookData';

export const BOSS_SKILL_TEST_ALLY_HP_MULT = 3;
export const BOSS_SKILL_TEST_BOSS_HP_MULT = 3;

export type BossSkillTestPresetId = 'rhahk' | 'bazzalan' | 'sneed' | 'gilnid' | 'smite' | 'greenskin' | 'vancleef';

export type BossSkillTestPreset = {
  id: BossSkillTestPresetId;
  bookChapterId: number;
  bossNameCn: string;
  skillSummaryCn: string;
  heroDeploy: readonly [HeroId, HeroId, HeroId];
  bondStacksBattleOverride: { warrior?: number; mage?: number; priest?: number; knight?: number };
  board: RunState['board'];
  statusLine: string;
  hudBlurb: string;
};

const RHAKH: BossSkillTestPreset = {
  id: 'rhahk',
  bookChapterId: 5,
  bossNameCn: '拉克佐',
  skillSummaryCn: '猛击 / 顺劈斩 / 战吼',
  heroDeploy: ['warrior_01', 'mage_02', 'priest_02'],
  bondStacksBattleOverride: { warrior: 21, mage: 21, priest: 21 },
  board: [
    { kind: 'warrior', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    { kind: 'priest', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine:
    '战斗中：第5章死亡矿井·拉克佐；战6法6牧6；英雄 穆兰/紫法/紫牧；我方×3血；首领×3血。',
  hudBlurb:
    '第 5 章关底首领「拉克佐」（猛击 / 顺劈斩 / 战吼）；备战战/法/牧各 <strong>6</strong> 层，上阵 <strong>穆兰 / 紫法师 / 紫牧师</strong>，便于测近战顺劈与战吼叠攻。',
};

const GILNID: BossSkillTestPreset = {
  id: 'gilnid',
  bookChapterId: 7,
  bossNameCn: '基尔尼格',
  skillSummaryCn: '过载爆炸 / 超载激光 / 机械先驱',
  heroDeploy: ['warrior_01', 'mage_02', 'priest_02'],
  bondStacksBattleOverride: { warrior: 21, mage: 21, priest: 21 },
  board: [
    { kind: 'warrior', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    { kind: 'priest', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine: '战斗中：第7章死亡矿井·基尔尼格；战6法6牧6；我方×3血；首领×3血。',
  hudBlurb:
    '第 7 章关底首领「基尔尼格」（过载爆炸 / 超载激光 / 机械先驱被动）；备战战/法/牧各 <strong>6</strong> 层。',
};

const SNEED: BossSkillTestPreset = {
  id: 'sneed',
  bookChapterId: 6,
  bossNameCn: '斯尼德',
  skillSummaryCn: '剑刃风暴 / 闪现刀扇 / 淬毒',
  heroDeploy: ['warrior_01', 'mage_02', 'priest_02'],
  bondStacksBattleOverride: { warrior: 21, mage: 21, priest: 21 },
  board: [
    { kind: 'warrior', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    { kind: 'priest', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine:
    '战斗中：第6章死亡矿井·斯尼德；战6法6牧6；我方×3血；首领×3血。',
  hudBlurb:
    '第 6 章关底首领「斯尼德」（剑刃风暴 / 闪现刀扇 / 淬毒被动）；备战战/法/牧各 <strong>6</strong> 层。',
};

const VANCLEEF: BossSkillTestPreset = {
  id: 'vancleef',
  bookChapterId: 10,
  bossNameCn: '艾德温·范克里夫',
  skillSummaryCn: '消失·伏击 / 召唤援军 / 迪菲亚之心',
  heroDeploy: ['archer_01', 'mage_02', 'priest_02'],
  bondStacksBattleOverride: { mage: 21, priest: 21, warrior: 21 },
  board: [
    { kind: 'archer', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    { kind: 'priest', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine: '战斗中：第10章死亡矿井·范克里夫；弓6法6牧6；我方×3血；首领×3血。',
  hudBlurb:
    '第 10 章关底首领「艾德温·范克里夫」（消失·伏击 / 召唤援军 / 迪菲亚之心被动）；备战弓/法/牧各 <strong>6</strong> 层；首领血量压低可测 50% 召唤。',
};

const SMITE: BossSkillTestPreset = {
  id: 'smite',
  bookChapterId: 8,
  bossNameCn: '重拳先生',
  skillSummaryCn: '蓄力轰击 / 踩地板 / 冲击波',
  heroDeploy: ['warrior_01', 'mage_02', 'priest_02'],
  bondStacksBattleOverride: { warrior: 21, mage: 21, priest: 21 },
  board: [
    { kind: 'warrior', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    { kind: 'priest', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine: '战斗中：第8章死亡矿井·重拳先生；战6法6牧6；我方×3血；首领×3血。',
  hudBlurb:
    '第 8 章关底首领「重拳先生」（蓄力轰击 / 踩地板 / 冲击波）；备战战/法/牧各 <strong>6</strong> 层，便于测大范围践踏与直线冲击波。',
};

const GREENSKIN: BossSkillTestPreset = {
  id: 'greenskin',
  bookChapterId: 9,
  bossNameCn: '绿皮队长',
  skillSummaryCn: '砰砰炸弹 / 喷气背包突击 / 导弹防卫系统',
  heroDeploy: ['archer_01', 'mage_02', 'priest_02'],
  bondStacksBattleOverride: { mage: 21, priest: 21, warrior: 21 },
  board: [
    { kind: 'archer', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    { kind: 'priest', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine: '战斗中：第9章死亡矿井·绿皮队长；弓6法6牧6；我方×3血；首领×3血。',
  hudBlurb:
    '第 9 章关底首领「绿皮队长」（砰砰炸弹 / 喷气背包突击 / 导弹防卫系统）；备战弓/法/牧各 <strong>6</strong> 层，便于测炸弹与远程反击。',
};

const BAZZALAN: BossSkillTestPreset = {
  id: 'bazzalan',
  bookChapterId: 4,
  bossNameCn: '巴扎兰',
  skillSummaryCn: '群体暗影箭 / 群体精神鞭笞 / 暗影闪现',
  heroDeploy: ['mage_02', 'priest_02', 'knight_01'],
  bondStacksBattleOverride: { mage: 21, priest: 21, knight: 21 },
  board: [
    { kind: 'warrior', stacks: 1 },
    { kind: 'priest', stacks: 1 },
    { kind: 'archer', stacks: 6 },
    { kind: 'mage', stacks: 6 },
    null,
    null,
    null,
    null,
    null,
  ],
  statusLine:
    '战斗中：第4章怒焰裂谷·巴扎兰；战1牧1弓6法6；英雄 紫法/紫牧/蓝骑；我方×3血；首领×3血。',
  hudBlurb:
    '第 4 章关底首领「巴扎兰」（群体暗影箭 / 群体精神鞭笞 / 暗影闪现）；备战战/牧各 <strong>1</strong>、弓 <strong>6</strong>、法 <strong>6</strong>，上阵 <strong>紫法师 / 紫牧师 / 蓝骑士</strong>。',
};

export const BOSS_SKILL_TEST_PRESETS: Record<BossSkillTestPresetId, BossSkillTestPreset> = {
  rhahk: RHAKH,
  bazzalan: BAZZALAN,
  sneed: SNEED,
  gilnid: GILNID,
  smite: SMITE,
  greenskin: GREENSKIN,
  vancleef: VANCLEEF,
};

export const DEFAULT_BOSS_SKILL_TEST_PRESET_ID: BossSkillTestPresetId = 'rhahk';

export function bossSkillTestPresetFromSearch(search: string): BossSkillTestPreset {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const boss = params.get('boss')?.toLowerCase();
  if (boss === 'bazzalan' || boss === 'baz' || boss === 'ch4') return BAZZALAN;
  if (boss === 'rhahk' || boss === 'rhahkzor' || boss === 'ch5') return RHAKH;
  if (boss === 'sneed' || boss === 'ch6') return SNEED;
  if (boss === 'gilnid' || boss === 'ch7') return GILNID;
  if (boss === 'smite' || boss === 'mr_smite' || boss === 'ch8') return SMITE;
  if (boss === 'greenskin' || boss === 'ch9') return GREENSKIN;
  if (boss === 'vancleef' || boss === 'edwin' || boss === 'ch10') return VANCLEEF;
  const chapter = Number(params.get('chapter'));
  if (chapter === 4) return BAZZALAN;
  if (chapter === 5) return RHAKH;
  if (chapter === 6) return SNEED;
  if (chapter === 7) return GILNID;
  if (chapter === 8) return SMITE;
  if (chapter === 9) return GREENSKIN;
  if (chapter === 10) return VANCLEEF;
  return RHAKH;
}

export function seedBossSkillTestRun(run: RunState, preset: BossSkillTestPreset): RoundMeta {
  run.resetRun();
  run.bookChapterId = preset.bookChapterId;
  const rounds = roundsForBookChapter(preset.bookChapterId);
  run.currentRoundIndex = Math.max(0, rounds.length - 1);
  run.board = preset.board.map((c) => (c ? { ...c } : null));
  run.devBattleHooks = {
    heroDeploy: [...preset.heroDeploy],
    heroSlotCap: 3,
    postSpawnHpMult: BOSS_SKILL_TEST_ALLY_HP_MULT,
    postSpawnHpMultSkipBoss: true,
    postSpawnBossHpMult: BOSS_SKILL_TEST_BOSS_HP_MULT,
    bondStacksBattleOverride: { ...preset.bondStacksBattleOverride },
  };
  const bossCn = wowFinalBossNameCn(preset.bookChapterId) || preset.bossNameCn;
  return {
    label: `开发：第${preset.bookChapterId}章首领${bossCn} · ${preset.skillSummaryCn} · 我方血×${BOSS_SKILL_TEST_ALLY_HP_MULT} · 首领血×${BOSS_SKILL_TEST_BOSS_HP_MULT}`,
    chapter: 3,
    sub: 6,
    kind: 'boss',
    enemies: [{ type: 'boss', count: 1, bossId: 'white', wowBossDisplayName: bossCn }],
    skipBattleOpeningCountdown: true,
  };
}
