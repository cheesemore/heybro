import type { ArenaCommRecord } from './arenaComm';
import { parseArenaOpponentRecord } from './arenaComm';

export const ARENA_MATCH_POLL_MS = 10_000;

const DEFAULT_ARENA_MATCH_URL = 'https://game.immortalis.cn/heybro/back/v1/match';
/** 本地 dev 走 Vite 代理，避免浏览器跨域拦截 POST */
const DEV_ARENA_MATCH_URL = '/heybro/back/v1/match';

export function getArenaApiUrl(): string {
  const url = import.meta.env.VITE_ARENA_API_URL?.trim();
  if (url) return url;
  if (import.meta.env.DEV) return DEV_ARENA_MATCH_URL;
  return DEFAULT_ARENA_MATCH_URL;
}

export type ArenaMatchPostResult =
  | { kind: 'ok'; opponent: ArenaCommRecord }
  | { kind: 'no_opposite' }
  | { kind: 'old_data' }
  | { kind: 'network_error' };

function parseArenaMatchJson(json: unknown): ArenaMatchPostResult | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const msg = typeof o.msg === 'string' ? o.msg : '';
  if (msg === 'no_opposite') return { kind: 'no_opposite' };
  if (msg === 'old_data') return { kind: 'old_data' };
  if (msg === 'ok') {
    const opponent = parseArenaOpponentRecord(o.data);
    if (!opponent) return null;
    return { kind: 'ok', opponent };
  }
  return null;
}

/** POST 竞技场存档；HTTP/解析失败返回 network_error（飘字「服务器错误」） */
export async function postArenaMatch(record: ArenaCommRecord): Promise<ArenaMatchPostResult> {
  const url = getArenaApiUrl();
  if (!url) {
    return { kind: 'network_error' };
  }
  const body = JSON.stringify(record);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      credentials: 'omit',
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[arena] POST failed', url, e);
    return { kind: 'network_error' };
  }
  const text = await res.text();
  if (import.meta.env.DEV) {
    console.info('[arena] POST', url, res.status, text.slice(0, 500));
  }
  if (!text.trim()) {
    return { kind: 'network_error' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'network_error' };
  }
  const parsed = parseArenaMatchJson(json);
  if (parsed) return parsed;
  return { kind: 'network_error' };
}
