/**
 * 与 src/game/gearScore.ts、gearCombatBonus.ts 保持同步（生成脚本用）
 */
export const GEAR_LEVEL_GROWTH = 1.07;
export const GS_TO_COMBAT_PERCENT_DIVISOR = 200;

const QUALITY_MULT = {
  common: 100,
  uncommon: 120,
  rare: 150,
  epic: 190,
  legendary: 250,
};

const QUALITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const SLOT_KINDS = [
  'head',
  'neck',
  'shoulder',
  'chest',
  'waist',
  'legs',
  'feet',
  'wrist',
  'hands',
  'finger',
  'trinket',
  'back',
  'mainHand',
  'offHand',
];

export function highestGearQuality(qualities) {
  let pick = qualities[0] ?? 'common';
  let rank = -1;
  for (const q of qualities) {
    const i = QUALITY_ORDER.indexOf(q);
    if (i > rank) {
      rank = i;
      pick = q;
    }
  }
  return pick;
}

function pieceGs(level, quality, slotKind) {
  const base = Math.max(
    1,
    Math.round(Math.pow(GEAR_LEVEL_GROWTH, level) * (QUALITY_MULT[quality] ?? 100)),
  );
  return slotKind === 'mainHand' || slotKind === 'trinket' ? base * 2 : base;
}

/** 14 件满级满 roll 全套 GS */
export function computeDungeonTopGearSetGs(levelMax, qualities) {
  const q = highestGearQuality(qualities);
  let total = 0;
  for (const kind of SLOT_KINDS) {
    total += pieceGs(levelMax, q, kind);
  }
  return total;
}

/** 0 GS = 100；与 gearCombatBonus.gsCombatPowerIndex 一致 */
export function combatPowerIndexFromGearSetGs(fullSetGs) {
  const gs = Math.max(0, Math.floor(fullSetGs));
  return Math.round((100 + gs / GS_TO_COMBAT_PERCENT_DIVISOR) * 100) / 100;
}

function nodeProgressMaxForQualities(qualities) {
  if (qualities.includes('legendary')) return 9.6;
  if (qualities.includes('epic')) return 8;
  return 6.5;
}

export function enrichDungeonCombatStats(rule) {
  const topGearSetGs = computeDungeonTopGearSetGs(rule.levelMax, rule.qualities);
  const nodeProgressMax =
    typeof rule.nodeProgressMax === 'number' ? rule.nodeProgressMax : nodeProgressMaxForQualities(rule.qualities);
  return {
    ...rule,
    topGearSetGs,
    nodeProgressMax,
    combatPowerIndex: combatPowerIndexFromGearSetGs(topGearSetGs),
  };
}
