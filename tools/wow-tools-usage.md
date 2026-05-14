# WoW 五人副本 — 提示词与立绘工具说明

本文档说明 `tools/` 目录下与 **魔兽世界五人副本** 提示词 Markdown、文生图 GUI、圆切相关的脚本用法，以及后续可补充的方向。

---

## 依赖与先决条件

| 项目 | 说明 |
|------|------|
| Python 3 | 运行本目录下 `.py` 脚本 |
| Pillow | 圆切需要：`pip install pillow` |
| tkinter | `wow_portrait_gui.py` 图形界面（多数 Python 自带） |
| API Key | 仓库根目录 `secrets_openai.txt`，或环境变量 `OPENAI_API_KEY` / `AUTO_CODE_API_KEY`（与 `image2_generate.py` 一致） |
| 游戏表数据 | `src/game/config/wowBookMonsters.json`、`wowBookBosses.json`；关卡设计 `docs/reference-classic-vanilla-wow-roguelike-level-design.json` |

---

## 模块关系（简图）

```text
wowBook JSON + reference JSON
        │
        ▼
generate_wow_famine_prompt_md.py  ──►  docs/魔兽世界5人副本_饥荒风提示词大全.md
        │                                      │
        │                                      ▼
        │                         wow_md_parse_jobs.parse_wow_prompt_md
        ▼                                      │
wow_book_art_jobs（JSON 直读 / 提示词同源）      │
        │                                      ▼
        └──────────────────────────►  wow_portrait_gui.py
                                              │
                    image2_generate.py ◄──────┤（文生图）
                                              │
                    wow_portrait_circle.py ◄──┘（方图 → 圆图）
```

---

## 脚本一览与用法

### 1. `generate_wow_famine_prompt_md.py` — 生成提示词大全 Markdown

从 `wowBookMonsters.json`、`wowBookBosses.json` 与 reference JSON 生成与解析器兼容的 MD；生成后会校验 `monsterUid` / `bossUid` 与解析结果一致。

**推荐（仓库根目录）：**

```bash
npm run gen:wow-famine-md
```

**等价命令：**

```bash
python tools/generate_wow_famine_prompt_md.py
```

常用参数：

```bash
python tools/generate_wow_famine_prompt_md.py --root . --out docs/魔兽世界5人副本_饥荒风提示词大全.md
```

表结构变更后应先执行 `npm run gen:wow-book`（若你维护表时有此步骤），再重新生成 MD。

---

### 2. `wow_portrait_gui.py` — 批量文生图 + 自动圆切（GUI）

**启动（仓库根目录）：**

```bash
python tools/wow_portrait_gui.py
```

**流程建议：**

1. **数据源**：选「Markdown 大全」或「wowBook JSON」。
2. **输出根目录**：默认 `temp/wow-portraits-staging/`（已在 `.gitignore` 中忽略整棵临时树）。
3. 点击 **「① 生成清单」** → 在同目录写入 `manifest.tsv`、`manifest.json`、`manifest_full.json`。
4. 设置 **序号从 / 到**（1-based）；配置 Model、Size、**圆切直径**（默认 256）。
5. **「跳过已有（方图+圆图齐全才跳过）」**：仅当方图与圆图都存在时跳过整条；只有方图没有圆图时 **只补圆切**；没有方图则文生图，**成功后立刻圆切**。
6. 点击 **「② 开始生成」**。

**输出路径约定：**

| 类型 | 相对路径（在输出根下） |
|------|------------------------|
| 方图 | `wow-mobs/<UID>.png`、`wow-bosses/<UID>.png` |
| 圆图 | `wow-mobs-circle/<UID>.png`、`wow-bosses-circle/<UID>.png` |

发布到游戏时，将 **圆图** 按项目约定复制到 `public/assets` 下对应目录（与运行时 URL 一致即可）。

**挂机策略（内置）：**

- 文生图每条最多 3 次；圆切每条最多 3 次；重试间隔约 2 秒。
- 连续 3 条仍失败后冷却约 10 分钟，冷却结束会 **自动再试同一条**；仍失败则进入下一条。
- 可随时 **「取消当前任务」**。

---

### 3. `wow_portrait_circle.py` — 方图转圆图（库）

供 GUI 内部调用：加载 `gptimage/circle_avatar.py`，将方图裁成圆形透明 PNG。

若需在其它脚本中复用：

```python
from wow_portrait_circle import circle_output_path_for_square, write_circle_from_square

sq = Path("temp/wow-portraits-staging/wow-mobs/U000001.png")
ci = circle_output_path_for_square(sq)
write_circle_from_square(sq, ci, 256)
```

---

### 4. `image2_generate.py` — 命令行单次文生图

不打开 GUI、适合单条调试：

```bash
python tools/image2_generate.py --prompt "你的提示词" --out out_test.png --size 1024x1024
```

可选：`--key-file`、`--base-url`、`--model` 等，详见脚本内 `argparse` 定义。

---

### 5. 其它支持模块（通常不单独执行）

| 文件 | 作用 |
|------|------|
| `wow_md_parse_jobs.py` | 解析 MD 中的 `monsterUid` / `bossUid`、相对路径、写 manifest |
| `wow_book_art_jobs.py` | 从 JSON 合并 reference、生成与 MD 同源的提示词任务 |
| `wow_trash_cn_en_map.py` | 小怪中文名 → 英文 / slug 用词，避免 `unnamed` 文件名 |

---

## 后续可补充的内容（建议 backlog）

1. **发布脚本**：从 `temp/wow-portraits-staging/wow-*-circle/` 一键同步到 `public/assets/`，并可选校验 UID 与表一致。
2. **清单增强**：在 `manifest.tsv` / JSON 中增加 **圆图相对路径** 列，便于对账与外部批处理。
3. **可配置重试**：文生图 / 圆切的次数与冷却时间通过 GUI 或配置文件暴露，避免改常量。
4. **副本主题插画（SCENE）**：`generate_wow_famine_prompt_md.py` 文档中标注暂缓；若产品需要，可在 MD 与解析器、GUI 中贯通 SCENE 条目。
5. **非交互 CI**：对 `parse_wow_prompt_md` / `load_wow_book_art_jobs` 做轻量单测，防止表与 MD 漂移。
6. **游戏资源约定文档**：在 `docs/` 或本文件补充「运行时加载的 URL / 文件名」与 staging 目录的对应表（小怪 `U`+六位、首领 `B`+六位等）。

---

## 相关 npm 脚本（仓库根）

| 命令 | 含义 |
|------|------|
| `npm run gen:wow-book` | 生成/更新 wowBook 表（见 `scripts/generate-wow-book-tables.mjs`） |
| `npm run gen:wow-famine-md` | 生成饥荒风提示词大全 MD |

若文档或脚本路径有变更，以仓库内 `package.json` 与脚本头部注释为准。
