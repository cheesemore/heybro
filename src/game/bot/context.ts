/** 本地 bot 测试页：只读真实存档，不注入作弊。 */

let botModeActive = false;
let botLogSink: ((line: string) => void) | null = null;
const sessionLogLines: string[] = [];
const BOT_LOG_STORAGE_KEY = 'heybro.bot.sessionLog.v1';
const BOT_LOG_STORAGE_MAX = 8000;

function persistLogLine(entry: string): void {
  try {
    const prev = localStorage.getItem(BOT_LOG_STORAGE_KEY) ?? '';
    const merged = prev ? `${prev}\n${entry}` : entry;
    const trimmed =
      merged.length > BOT_LOG_STORAGE_MAX ? merged.slice(merged.length - BOT_LOG_STORAGE_MAX) : merged;
    localStorage.setItem(BOT_LOG_STORAGE_KEY, trimmed);
  } catch {
    /* quota / private mode */
  }
}

export function setBotModeActive(on: boolean): void {
  botModeActive = on;
}

export function isBotModeActive(): boolean {
  return botModeActive;
}

export function setBotLogSink(sink: ((line: string) => void) | null): void {
  botLogSink = sink;
}

export function clearBotSessionLog(): void {
  sessionLogLines.length = 0;
  try {
    localStorage.removeItem(BOT_LOG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function botLog(line: string): void {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry = `[${ts}] ${line}`;
  sessionLogLines.push(entry);
  persistLogLine(entry);
  botLogSink?.(entry);
}

/** 将当前会话日志写入 localStorage（停止时与每条日志实时写入配合） */
export function flushBotSessionLogToStorage(stopReason: string): void {
  const body = [
    '# HeyBro 关卡难度自动测试日志',
    `# 停止原因: ${stopReason}`,
    `# 保存时间: ${new Date().toISOString()}`,
    '',
    ...sessionLogLines,
    '',
  ].join('\n');
  try {
    localStorage.setItem(BOT_LOG_STORAGE_KEY, body);
  } catch {
    /* ignore */
  }
}

function formatLogFilenameStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** 终止或自动停止时下载本次会话日志（文件名含时间） */
export function exportBotSessionLog(stopReason: string): string {
  flushBotSessionLogToStorage(stopReason);
  const stamp = formatLogFilenameStamp(new Date());
  const filename = `heybro-bot-${stamp}.log`;
  const body = [
    '# HeyBro 关卡难度自动测试日志',
    `# 停止原因: ${stopReason}`,
    `# 导出时间: ${new Date().toISOString()}`,
    `# 说明: 同时已写入 localStorage 键 ${BOT_LOG_STORAGE_KEY}`,
    '',
    ...sessionLogLines,
    '',
  ].join('\n');
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}
