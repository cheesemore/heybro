import { defineConfig } from 'vite';

/** 生产构建用于 https://cheesemore.github.io/heybro/ ；本地 dev 仍为根路径 `/` */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/heybro/' : '/',
}));
