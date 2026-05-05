import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * Vite dev 对 `public/foo/index.html` 访问 `/foo/` 时会误落到根 `index.html`（SPA 回退）。
 * 将 `/character-prompts` 与 `/character-prompts/` 重写到静态页，与 `npm run preview` 行为一致。
 */
function characterPromptsDevRewrite() {
  return {
    name: 'character-prompts-dev-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const p = req.url?.split('?')[0] ?? '';
        if (p === '/character-prompts' || p === '/character-prompts/') {
          const file = path.join(server.config.root, 'public/character-prompts/index.html');
          if (fs.existsSync(file)) req.url = '/character-prompts/index.html';
        }
        next();
      });
    },
  };
}

/**
 * 生产用相对路径，避免「子目录部署 / 根目录部署 / 访问时少写尾斜杠」导致脚本 404 白屏。
 * 本地 `vite dev` 仍用 `/`。
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: command === 'serve' ? [characterPromptsDevRewrite()] : [],
}));
