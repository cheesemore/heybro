/**
 * 从 wowBookRegistry.json（副本列表）+ gearSlotPartNames.json（部位名）
 * + gearGenerationRules.json（等级区间、品质概率）
 * 生成 src/game/config/gearItems.json：每副本恰好 14 件装备（每部位 1 件）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichDungeonCombatStats } from './lib-gear-dungeon-gs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REGISTRY = path.join(root, 'src/game/config/wowBookRegistry.json');
const SLOT_PARTS = path.join(root, 'src/game/config/gearSlotPartNames.json');
const GEN_RULES = path.join(root, 'src/game/config/gearGenerationRules.json');
const OUT = path.join(root, 'src/game/config/gearItems.json');

function gearIdFor(dungeonId, slotKind) {
  return `${dungeonId}.${slotKind}`;
}

function loadPrev() {
  /** @type {Map<string, string>} */
  const nameCnByGearId = new Map();
  /** @type {Map<string, object>} */
  const dungeonById = new Map();
  if (!fs.existsSync(OUT)) return { nameCnByGearId, dungeonById };
  try {
    const raw = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const row of raw.items || []) {
      if (typeof row.gearId === 'string' && typeof row.nameCn === 'string') {
        nameCnByGearId.set(row.gearId, row.nameCn);
      }
    }
    for (const d of raw.dungeons || []) {
      if (typeof d.dungeonId === 'string') dungeonById.set(d.dungeonId, d);
    }
  } catch {
    /* ignore */
  }
  return { nameCnByGearId, dungeonById };
}

function levelRangeForOrdinal(ordinal, levelRangeCfg) {
  const n = Math.max(1, Math.floor(ordinal)) - 1;
  const step = levelRangeCfg.levelStepPerDungeon ?? 3;
  const min0 = levelRangeCfg.firstDungeonMin ?? 1;
  const max0 = levelRangeCfg.firstDungeonMax ?? 5;
  return {
    levelMin: min0 + n * step,
    levelMax: max0 + n * step,
  };
}

/** @param {number} levelMax @param {object[]} tiers */
function qualityTierForMaxLevel(levelMax, tiers) {
  const sorted = [...tiers].sort(
    (a, b) => (a.whenMaxLevelBelow ?? Infinity) - (b.whenMaxLevelBelow ?? Infinity),
  );
  for (const t of sorted) {
    if (t.whenMaxLevelBelow == null) continue;
    if (levelMax < t.whenMaxLevelBelow) return t;
  }
  return sorted[sorted.length - 1];
}

function nodeProgressMaxForQualities(qualities) {
  if (qualities.includes('legendary')) return 9.6;
  if (qualities.includes('epic')) return 8;
  return 6.5;
}

function assertWeightsSum100(weights, ctx) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`${ctx} 品质概率合计 ${sum}%，须为 100%`);
  }
}

function buildDungeonRule(d, levelRangeCfg, qualityTiers, prevDungeon) {
  const { levelMin, levelMax } = levelRangeForOrdinal(d.dungeonOrdinal, levelRangeCfg);
  const tier = qualityTierForMaxLevel(levelMax, qualityTiers);
  const qualityWeightsPercent = { ...tier.weightsPercent };
  assertWeightsSum100(
    qualityWeightsPercent,
    `副本 ${d.dungeonId}（levelMax=${levelMax}，${tier.tierId}）`,
  );
  const qualities = Object.keys(qualityWeightsPercent);

  const base = {
    dungeonId: d.dungeonId,
    dungeonOrdinal: d.dungeonOrdinal,
    nameCn: d.nameCn,
    levelMin,
    levelMax,
    qualityTierId: tier.tierId,
    qualities,
    qualityWeightsPercent,
    strengthIncrement:
      typeof prevDungeon?.strengthIncrement === 'number' ? prevDungeon.strengthIncrement : 1.02,
    nodeProgressMax: nodeProgressMaxForQualities(qualities),
  };

  if (prevDungeon?.manual === true) {
    return {
      ...base,
      ...prevDungeon,
      dungeonId: d.dungeonId,
      dungeonOrdinal: d.dungeonOrdinal,
      nameCn: d.nameCn,
      manual: true,
      nodeProgressMax:
        typeof prevDungeon.nodeProgressMax === 'number'
          ? prevDungeon.nodeProgressMax
          : nodeProgressMaxForQualities(prevDungeon.qualities ?? qualities),
    };
  }
  return base;
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const slotDoc = JSON.parse(fs.readFileSync(SLOT_PARTS, 'utf8'));
  const rulesDoc = JSON.parse(fs.readFileSync(GEN_RULES, 'utf8'));
  const slots = slotDoc.slots || [];
  if (slots.length !== 14) {
    throw new Error(`gearSlotPartNames.json 须含 14 个部位，当前 ${slots.length}`);
  }

  const levelRangeCfg = rulesDoc.levelRange ?? {};
  const qualityTiers = rulesDoc.qualityTiers ?? [];
  const qualityLabelsCn = rulesDoc.qualityLabelsCn ?? {};

  const dungeons = registry.dungeons || [];
  const { nameCnByGearId, dungeonById: prevDungeonById } = loadPrev();

  /** @type {object[]} */
  const dungeonRules = [];
  /** @type {object[]} */
  const items = [];

  for (const d of dungeons) {
    const dungeonId = d.dungeonId;
    const dungeonOrdinal = d.dungeonOrdinal;
    const nameCn = d.nameCn;
    if (!dungeonId || !nameCn) continue;

    const rule = enrichDungeonCombatStats(
      buildDungeonRule(d, levelRangeCfg, qualityTiers, prevDungeonById.get(dungeonId)),
    );
    dungeonRules.push(rule);

    for (const s of slots) {
      const id = gearIdFor(dungeonId, s.kind);
      const defaultName = `${nameCn}·${s.partNameCn}`;
      items.push({
        gearId: id,
        dungeonId,
        dungeonOrdinal,
        slotKind: s.kind,
        slotNo: s.slotNo,
        nameCn: nameCnByGearId.get(id) ?? defaultName,
        levelMin: rule.levelMin,
        levelMax: rule.levelMax,
        qualities: rule.qualities,
        qualityWeightsPercent: rule.qualityWeightsPercent,
      });
    }
  }

  const doc = {
    schemaVersion: 2,
    generator: 'scripts/generate-gear-items.mjs',
    purpose:
      '副本装备表：每件装备有稳定 gearId；每座副本固定 14 条。dungeons[] 为副本级等级区间与品质概率；items[] 冗余相同字段便于查表。规则源见 gearGenerationRules.json。',
    editConvention:
      '【自动生成】dungeons / items 的等级与品质字段由 gearGenerationRules + registry 生成；dungeons[].topGearSetGs、combatPowerIndex 由脚本按 GS 公式写入；nodeProgressMax 默认 6.5（关内节点进度曲线上限）。【可手填】items[].nameCn；dungeons[] 整条设 manual:true 可锁定该副本规则不被覆盖。【可手填】dungeons[].drops 等扩展字段（重跑时保留 manual 副本）。',
    relatedTables: {
      wowBookRegistry: '副本列表与 dungeonId',
      gearGenerationRules: '等级步进与品质分档概率',
      gearSlotPartNames: '部位名 partNameCn',
      gearSlots: '部位 kind / slotNo'
    },
    qualityLabelsCn,
    levelRangeRule: levelRangeCfg,
    slotCount: 14,
    dungeonCount: dungeons.length,
    itemCount: items.length,
    dungeons: dungeonRules,
    items,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${items.length} gear items, ${dungeonRules.length} dungeon rules → ${path.relative(root, OUT)}`,
  );
}

main();
