# HeyBro

竖版自走棋（Pixi + TypeScript + Vite）。

## 本地开发

```bash
npm ci
npm run dev
```

## 敌方贴图（全兵种，可选）

贴图路径：**[`public/assets/enemies/<EnemyPaintKind>.png`](public/assets/enemies/)**（文件名与 [`battleVisuals.ts`](src/game/battleVisuals.ts) 中 `EnemyPaintKind` 一致，如 `grunt.png`、`boss_farseer.png`）。风格提示词见 [`scripts/enemy-art-style.mjs`](scripts/enemy-art-style.mjs) 与 [`scripts/enemy-art-subjects.mjs`](scripts/enemy-art-subjects.mjs)。

### 生成（OpenAI，需 Key）

1. `.env.local` 中设置 `OPENAI_API_KEY`。
2. **`npm run enemy:art -- --id grunt`** 生成单张；**`npm run enemy:art:all`** 按表生成全部（调用多次 API，注意费用）。
3. 流水线：`dall-e-3` 1024 → `sharp` **trim** + **最长边 ≤128px** + 高压缩 PNG。**禁止**对资源做「先缩到 32 再放大」类不可逆实验。

### 导入已有 PNG（无 OpenAI）

将任意大图放到本机路径后执行：

`npm run enemy:import-png -- <输入图路径> <paintId>`

例：`npm run enemy:import-png -- C:/path/in.png grunt`

### 圆形半身像（gpt-image-2 / 中转，与盟友流程一致）

1. 在 `gptimage/secrets_openai.txt` 写入 Key（或设置 `OPENAI_API_KEY`），并 `pip install pillow`（裁圆用）。
2. **出图（不写入游戏目录）**：执行 **`npm run enemy:portraits:batch`** → 方图 **`gptimage/out_enemies_square/<id>.png`**，圆图 **`gptimage/out_enemies_circle/<id>.png`**（裁圆会覆盖 staging 内同名文件）。文生图 / 裁圆失败会自动重试（默认各 **3** 次，**`--max-attempts N`** 可调），仍失败则跳过该 id。**`--force`** 只影响是否重调大模型覆盖方图。
3. **校验通过后发布到游戏**：**`npm run enemy:portraits:publish`**（或 `python gptimage/publish_enemy_portraits_to_game.py`），从 `out_enemies_circle` **覆盖复制**到 **`public/assets/enemies/`**（默认一律覆盖已存在 PNG；若需跳过已存在则加脚本参数 **`--skip-existing`**）。
4. **`--skip-generate`**：不调接口；仍对方图裁圆写入 `out_enemies_circle`。

### 游戏内显示

有对应 PNG 时，战斗与地图代币**自动**在圆内显示贴图；缺文件则回退为灰盘 / 浅红盘 +「敌」「首」字。**不再依赖** `VITE_ENEMY_TEXTURES`（该开关及 `VITE_ENEMY_GRUNT_TEXTURE` 已废弃，仅为兼容保留导出）。

### 还原

删除 `public/assets/enemies/` 下不需要的 PNG（或整目录只留 `.gitkeep`），即恢复全矢量绘制。

### 占位

- **`npm run enemy:placeholder-grunt`**：仅 `grunt.png`。
- **`npm run enemy:placeholders:all`**：为 [`scripts/enemy-art-subjects.mjs`](scripts/enemy-art-subjects.mjs) 中全部 paint id 各写一张**色块占位**（无 API，用于立刻验证资源路径）。

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
