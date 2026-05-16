const STORAGE_KEY = 'heybro.gearFarmStamina.v1';

export const GEAR_FARM_STAMINA_MAX = 60;
export const GEAR_FARM_STAMINA_INITIAL = 20;
/** 每恢复 1 点体力所需毫秒（10 分钟） */
export const GEAR_FARM_STAMINA_RECOVERY_MS = 10 * 60 * 1000;

type GearFarmStaminaFile = {
  version: 1;
  stamina: number;
  /** 体力恢复时间锚点（毫秒时间戳） */
  lastRecoveryAtMs: number;
  initialized?: boolean;
};

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function parse(raw: string | null): GearFarmStaminaFile | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return null;
    const o = j as Record<string, unknown>;
    if (o.version !== 1) return null;
    const stamina = typeof o.stamina === 'number' ? Math.floor(o.stamina) : NaN;
    const lastRecoveryAtMs =
      typeof o.lastRecoveryAtMs === 'number' ? Math.floor(o.lastRecoveryAtMs) : NaN;
    if (!Number.isFinite(stamina) || !Number.isFinite(lastRecoveryAtMs)) return null;
    return {
      version: 1,
      stamina: Math.max(0, Math.min(GEAR_FARM_STAMINA_MAX, stamina)),
      lastRecoveryAtMs,
      initialized: o.initialized === true,
    };
  } catch {
    return null;
  }
}

function save(data: GearFarmStaminaFile): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 配额满或隐私模式 */
  }
}

function defaultFirstEntry(now: number): GearFarmStaminaFile {
  return {
    version: 1,
    stamina: GEAR_FARM_STAMINA_INITIAL,
    lastRecoveryAtMs: now,
    initialized: true,
  };
}

/**
 * 按离线/在线经过时间结算体力，并写回「上次恢复体力的时间锚点」。
 * - 未满：锚点 = 当前时刻 − 余数分钟（保留距下一点进度）
 * - 已满或结算后达到上限：体力 = 60，锚点 = 当前时刻
 */
export function syncGearFarmStamina(nowMs: number = Date.now()): number {
  const now = Math.floor(nowMs);
  const parsed = parse(safeLs()?.getItem(STORAGE_KEY) ?? null);

  if (!parsed?.initialized) {
    const first = defaultFirstEntry(now);
    save(first);
    return first.stamina;
  }

  let stamina = parsed.stamina;
  let anchor = parsed.lastRecoveryAtMs;
  const elapsed = Math.max(0, now - anchor);
  const recovered = Math.floor(elapsed / GEAR_FARM_STAMINA_RECOVERY_MS);

  if (recovered > 0) {
    const next = Math.min(GEAR_FARM_STAMINA_MAX, stamina + recovered);
    if (next >= GEAR_FARM_STAMINA_MAX) {
      stamina = GEAR_FARM_STAMINA_MAX;
      anchor = now;
    } else {
      stamina = next;
      const remainder = elapsed % GEAR_FARM_STAMINA_RECOVERY_MS;
      anchor = now - remainder;
    }
    save({ version: 1, stamina, lastRecoveryAtMs: anchor, initialized: true });
  }

  return stamina;
}

/** 进入刷副本界面或刷新展示前调用 */
export function getGearFarmStamina(): number {
  return syncGearFarmStamina();
}

/** 距下一点体力恢复的剩余毫秒；已满则 0 */
export function getGearFarmNextRecoveryCountdownMs(nowMs: number = Date.now()): number {
  const now = Math.floor(nowMs);
  const stamina = syncGearFarmStamina(now);
  if (stamina >= GEAR_FARM_STAMINA_MAX) return 0;

  const parsed = parse(safeLs()?.getItem(STORAGE_KEY) ?? null);
  if (!parsed?.initialized) return GEAR_FARM_STAMINA_RECOVERY_MS;

  const elapsed = Math.max(0, now - parsed.lastRecoveryAtMs);
  const mod = elapsed % GEAR_FARM_STAMINA_RECOVERY_MS;
  if (mod === 0) return 0;
  return GEAR_FARM_STAMINA_RECOVERY_MS - mod;
}

export function formatGearFarmRecoveryCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 消耗体力；成功时写回存档（先结算恢复再扣除） */
export function trySpendGearFarmStamina(amount = 1): boolean {
  const cost = Math.max(1, Math.floor(amount));
  const now = Date.now();
  const cur = syncGearFarmStamina(now);
  if (cur < cost) return false;

  const parsed = parse(safeLs()?.getItem(STORAGE_KEY) ?? null);
  const anchor = parsed?.lastRecoveryAtMs ?? now;
  save({
    version: 1,
    stamina: cur - cost,
    lastRecoveryAtMs: anchor,
    initialized: true,
  });
  return true;
}

/** 开发/作弊：增加体力（先结算自然恢复，再 +amount，不超过上限） */
export function cheatAddGearFarmStamina(amount: number): number {
  const add = Math.max(0, Math.floor(amount));
  const now = Date.now();
  const cur = syncGearFarmStamina(now);
  const parsed = parse(safeLs()?.getItem(STORAGE_KEY) ?? null) ?? defaultFirstEntry(now);
  const next = Math.min(GEAR_FARM_STAMINA_MAX, cur + add);
  save({
    version: 1,
    stamina: next,
    lastRecoveryAtMs: parsed.lastRecoveryAtMs,
    initialized: true,
  });
  return next;
}

export function clearPersistedGearFarmStamina(): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
