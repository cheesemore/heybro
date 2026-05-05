# HeyBro

竖版自走棋（Pixi + TypeScript + Vite）。

## 本地开发

```bash
npm ci
npm run dev
```

开发或预览服务器启动后，在浏览器打开 **`/character-prompts/`** 或 **`/character-prompts/index.html`**（例如 `http://localhost:5173/character-prompts/` ，端口以终端为准）可浏览并一键复制 50 套角色生图提示词：**第一步**单张 **王者荣耀式** 带景立绘；**第二步**（以立绘为参考）**4×4** 小人精灵表（待机 / 行走 / 攻击 / 倒下）。数据见 [`public/character-prompts/manifest.json`](public/character-prompts/manifest.json)，改 [`prompt-template.txt`](public/character-prompts/prompt-template.txt)、[`sprite-sheet-template.txt`](public/character-prompts/sprite-sheet-template.txt) 或 [`scripts/characterSetsData.mjs`](scripts/characterSetsData.mjs) 后执行 `npm run build:character-prompts` 或随 `npm run build` 自动重新生成。（说明：旧版 Vite dev 曾把 `/character-prompts/` 误指到游戏首页，已在 [`vite.config.ts`](vite.config.ts) 用中间件修正。）

## GitHub Pages（避免「能打开但白屏」）

仓库根目录的 `index.html` 里有：

```html
<script type="module" src="/src/main.ts"></script>
```

这是给 **Vite 开发服务器** 用的：本地 `npm run dev` 时会即时编译 TypeScript。

**GitHub 不会自动编译这份源码。** 若在 Pages 里选择「从分支部署 → 使用 `main` 根目录」，发布出去的就是**未打包的源码**，浏览器无法直接执行 `.ts`，页面会空白，且控制台往往没有明显报错。

### 正确做法（推荐，本仓库已配好）

1. 打开仓库 **Settings → Pages**
2. **Build and deployment** 里 **Source** 选 **GitHub Actions**（不要选 “Deploy from a branch” 指向仓库根目录）
3. 推送 `main` 后，工作流 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) 会执行：
   - `npm ci`
   - `npm run build`（生成 `dist/`，内含已打包的 `index.html` 与 `assets/*.js`）
   - 将 **`dist` 目录内容** 作为站点根目录发布

手动本地验证构建结果：

```bash
npm run build
npm run preview
```

浏览器应能正常进入游戏；`dist/index.html` 中不应再出现 `/src/main.ts` 引用。

### 手动发布（不推荐）

若不用 Actions，必须在本地执行 `npm run build`，再把 **`dist/` 下全部文件**（不是源码根目录）推到用于 Pages 的分支或目录。
