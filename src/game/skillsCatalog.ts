import { LAYOUT_SCALE } from './constants';
import skillsDoc from './config/skills.json';

export type SkillLimit = 'minion' | 'boss' | 'any';

/** 与战斗代码同步状态：已接 / 未接 / 待修改（仅手工标记，表示需程序跟进） */
export type SkillCodeStatus = 'written' | 'missing' | 'pending_changes';

/** 技能附加参数：顺序与含义以各条 `logicEffectCn` 为准；最多 5 个 */
export type SkillParamValue = string | number | boolean;

export type SkillDef = {
  id: string;
  nameCn: string;
  limit: SkillLimit;
  codeStatus: SkillCodeStatus;
  /** @deprecated 使用 `codeStatus`；兼容旧 JSON */
  implemented?: boolean;
  /** 给玩家看的说明（图鉴、预览等 UI） */
  descriptionCn: string;
  /** 给程序/策划看的实际规则、触发点与调参含义，便于接战斗与 AI 推理 */
  logicEffectCn: string;
  /** 可选调参；最多 5 项，顺序见 `logicEffectCn` 内约定 */
  params?: readonly SkillParamValue[];
};

function normalizeSkillDef(raw: SkillDef): SkillDef {
  let codeStatus: SkillCodeStatus | undefined = raw.codeStatus;
  if (codeStatus == null || !(['written', 'missing', 'pending_changes'] as const).includes(codeStatus)) {
    if (typeof raw.implemented === 'boolean') {
      codeStatus = raw.implemented ? 'written' : 'missing';
    } else {
      codeStatus = 'missing';
    }
  }
  return { ...raw, codeStatus };
}

const doc = skillsDoc as { skills: SkillDef[] };
const rows: SkillDef[] = doc.skills.map((raw) => normalizeSkillDef(raw as SkillDef));

const ALLOWED_CODE: SkillCodeStatus[] = ['written', 'missing', 'pending_changes'];
for (const s of rows) {
  if (!ALLOWED_CODE.includes(s.codeStatus)) {
    throw new Error(`[skills.json] ${s.id}: 非法 codeStatus: ${String(s.codeStatus)}`);
  }
  if (s.params != null && s.params.length > 5) {
    throw new Error(`[skills.json] ${s.id}: params 最多 5 项，当前 ${s.params.length}`);
  }
}

/** 首领周期技等：未写不接；已写与「待修改」（手工标记、提醒程序对齐）仍按已接施放 */
export function skillFiresInBattle(def: SkillDef | undefined): boolean {
  if (!def) return false;
  const st = def.codeStatus ?? (def.implemented === true ? 'written' : def.implemented === false ? 'missing' : undefined);
  if (st == null || st === 'missing') return false;
  return st === 'written' || st === 'pending_changes';
}

const byId = new Map<string, SkillDef>(rows.map((s) => [s.id, s]));

export function getSkillById(id: string): SkillDef | undefined {
  return byId.get(id);
}

/** `params` 第 `index` 项转数字；缺省或非数字时用 `fallback`（表侧宜只放伤害/范围/冷却等关键调参）。 */
export function skillParamNumber(def: SkillDef | undefined, index: number, fallback: number): number {
  const arr = def?.params;
  if (arr == null || index < 0 || index >= arr.length) return fallback;
  const v = arr[index];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return fallback;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** 表中「设计像素」与 hitRadius 一致：`Math.round(设计值 * LAYOUT_SCALE)` */
export function skillParamDesignPx(def: SkillDef | undefined, index: number, fallbackDesign: number): number {
  return Math.round(skillParamNumber(def, index, fallbackDesign) * LAYOUT_SCALE);
}

/** 预览/说明：按 id 取中文名，未知 id 原样回退 */
export function formatSkillNamesCn(skillIds: readonly string[]): string {
  return skillIds.map((id) => byId.get(id)?.nameCn ?? id).join('、');
}

/** 与 `BattleScreen` 中首领周期技 CD 一致（秒） */
export const BOSS_SKILL_COOLDOWN_SEC: Record<string, number> = {
  skill_farseer_chain_lightning: 5,
  skill_farseer_summon_grunts: 15,
  skill_tauren_shockwave: 5.5,
  skill_tauren_stomp: 7.5,
  skill_blademaster_bladestorm: 2.4,
};
