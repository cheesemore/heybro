const STORAGE_KEY = 'heybro.arena.username.v1';

function safeLs(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function randomUsername(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `p_${hex}`;
}

/** 首次进入竞技场时生成并持久化随机用户名 */
export function ensureArenaUsername(): string {
  const ls = safeLs();
  const existing = ls?.getItem(STORAGE_KEY);
  if (existing && typeof existing === 'string' && existing.length >= 3) return existing;
  const name = randomUsername();
  ls?.setItem(STORAGE_KEY, name);
  return name;
}

export function getArenaUsername(): string | null {
  const v = safeLs()?.getItem(STORAGE_KEY);
  return v && v.length >= 3 ? v : null;
}
