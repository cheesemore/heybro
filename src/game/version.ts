/**
 * 构建号：`npm install` 后由 `.husky/pre-commit` 在每次 git commit 前自动 +1。
 * 界面左上角展示 `gameVersionLabel()`。
 */
export const GAME_BUILD = 7;

export function gameVersionLabel(): string {
  return `v0.${String(GAME_BUILD).padStart(4, '0')}`;
}
