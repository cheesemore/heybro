# pixijs-game 参考 UI（独立预览）

把 **pixijs-game** 仓库里的文件**整份复制到本目录**（本目录下应直接出现 `package.json`、`src/` 等，而不是再多套一层 `pixijs-game/pixijs-game/`）。

## 1. 复制内容

从另一台机器或路径，例如：

- `/workspaces/default/code/pixijs-game/*`  
  或你本机的 `pixijs-game` 根目录  

**全选复制**到：

`HeyBro/temp/pixijs-game/`

复制完成后应存在：

- `temp/pixijs-game/package.json`
- `temp/pixijs-game/src/main.ts`
- …（与原仓库一致）

## 2. 安装依赖并启动

在本目录打开终端：

```bash
cd temp/pixijs-game
pnpm install
pnpm dev
```

若该项目用 npm：

```bash
cd temp/pixijs-game
npm install
npm run dev
```

浏览器打开终端里提示的地址（一般为 `http://localhost:5173`）。

## 3. 与 HeyBro 主项目同时跑（端口冲突）

HeyBro 根目录 `npm run dev` 默认也会占 **5173**。请先停掉其中一个，或在 **pixijs-game** 里改端口，例如：

```bash
pnpm dev -- --port 5174
```

或在该子项目的 `vite.config` 里写死 `server.port: 5174`。

## 4. 与正式迁移的关系

这里仅作 **样式与交互参考**；合并进 HeyBro 时应在 `src/game/` 里按现有 `GameRoot`、`*Screen.ts` 逐步对接，而不是长期依赖双仓库。

本目录已列入 `.gitignore`，**默认不会提交**到 Git（避免误提交 `node_modules` 与整份参考工程）。
