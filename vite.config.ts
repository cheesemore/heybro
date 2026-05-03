import { defineConfig } from 'vite';

/**
 * 生产用相对路径，避免「子目录部署 / 根目录部署 / 访问时少写尾斜杠」导致脚本 404 白屏。
 * 本地 `vite dev` 仍用 `/`。
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
}));
