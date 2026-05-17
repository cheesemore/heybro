# HeyBro 文生图接口与 `tools/` 批量 GUI 约定

> **给 Agent / 维护者**：在 `tools/` 下新增或修改**文生图、批量出图 GUI** 前，**必须先阅读本文**。  
> 本项目长期出图统一走 **`tools/image2_generate.py`**（OpenAI 兼容中转）。

---

## 三条标准流程（必读）

HeyBro 批量出图 GUI 应遵循同一套三段式流程（与「直接写进 `public/`」区分开）：

```
API 文生图 → 临时目录 raw/（大图） → 裁切/圆切 → 临时目录 icons/ 等 → 【一键导入】→ public/assets/
```

| 步骤 | 要求 | 装备图标 GUI | 立绘 GUI |
|------|------|--------------|----------|
| ① 接口出图 | 见下文 §1 | `temp/gear-icons-staging/raw/<gearId>.png` | `temp/wow-portraits-staging/wow-mobs/`、`wow-bosses/` |
| ② 切图 | 不调 API，Pillow | `raw/` → `icons/`（默认 64×64，可改边长） | 方图 → `wow-mobs-circle/`、`wow-bosses-circle/`（圆切，默认 256） |
| ③ 一键导入 | 覆盖复制到游戏资源目录 | **有**：按钮「一键导入项目」 | **无内置按钮**：需手动复制到 `public/assets/`（见该 GUI 说明） |

新写的批量 GUI：**必须**实现 ①②；若资源要进 `public/assets/`，**必须**提供类似「一键导入」按钮（可复制 `gear_icon_jobs.import_gear_icons_to_project` 的模式）。

---

## 1. 接口使用方法与注意事项

### 1.1 用什么

| 项 | 说明 |
|----|------|
| 封装 | `tools/image2_generate.py` |
| Key | 仓库根 `secrets_openai.txt`（一行），或 `OPENAI_API_KEY` |
| 探测 | `probe_api_connection(key_file=, base_url=)` → GUI「测试 API 连接」 |
| 出图 | `generate_to_file(prompt, out_path, ...)` → 返回 `(实际路径, 多图提示或 None)` |
| 错误文案 | `format_api_error(exc, url=generations_url(...))` |

### 1.2 默认连接参数（界面可改）

| 项 | 默认值 |
|----|--------|
| Base URL | `https://vip.auto-code.net/v1` |
| POST | `{BaseURL}/images/generations` |
| Model | `gpt-image-2` |
| 文生图 Size | `1024x1024` |

### 1.3 请求体（当前中转已验证）

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "n": 1,
  "size": "1024x1024",
  "output_format": "png"
}
```

**注意：**

- **`n` 必须为 1**（代码已写死）；勿增大。
- **不要**默认传 `background: "#xxxxxx"` 等字段 → 易报 **「请求参数不正确」**；背景色写在 **prompt**（装备：`gear_icon_jobs.GEAR_ICON_BG_HEX`，当前 `#d3d1b0`）。
- `quality` 仅在有需要且中转支持时再传。
- 「测试 API 连接」通过 **≠** 文生图一定成功；单张常 **30s～数分钟**。

### 1.4 响应与落盘注意

- 中转可能仍返回 **多张** → `write_images(..., single_only=True)` **只保存第一张**到目标文件名。
- 裁切前必须用 **`generate_to_file` 的返回值** 或 `resolve_raw_image_path()`，不要假定路径一定是 `raw/xxx.png`。
- 图片数据：`b64_json` 优先，否则从 `url` 下载。
- 超时：POST/下载 600s；探测 20s。

### 1.5 常见错误

| 现象 | 处理 |
|------|------|
| WinError 10061 | Base URL / 代理 / 防火墙；与 Key 无关也会出现 |
| 请求参数不正确 | 去掉 `background` 等多余字段 |
| 文生图成功但找不到 raw 文件 | 用返回路径；查是否误存为 `*_1.png` |
| GUI 测试后批量无日志 | `alert` 消息须 `title, body, ok = msg[1]`；子线程禁止 `var.get()` / `_log()` |

CLI 单张测试：

```bash
cd d:\HeyBro
python tools/image2_generate.py --prompt "..." --out temp/test.png
```

---

## 2. 出图到临时目录，再切图

**原则：API 只写临时目录的大图；游戏用小图在本地裁切生成，确认满意后再导入 `public/`。**

### 2.1 装备图标（参考实现）

| 阶段 | 目录 | 说明 |
|------|------|------|
| 默认临时根 | `temp/gear-icons-staging/` | GUI「输出目录」可改 |
| 文生图 | `raw/<gearId>.png` | API 原图，如 1024×1024 |
| 裁切后 | `icons/<gearId>.png` | `process_icon_png()`，默认边长 **64**（界面「图标边长」） |
| 清单 | `manifest.tsv`、`manifest.json` | 「生成清单」 |

**GUI 操作：**

1. 「开始生成」：文生图 + 自动裁切（`raw` → `icons`）。
2. 已有 `raw`、不想再调 API：勾选 **「仅裁切（从 raw/ 到 icons/）」**。
3. 「跳过已有 icons/」：已有裁切图则跳过整条。

裁切实现：`gear_icon_jobs.process_icon_png`（居中裁方 + 缩放到边长）。

### 2.2 立绘（方图 + 圆切）

| 阶段 | 目录 |
|------|------|
| 临时根 | `temp/wow-portraits-staging/` |
| 方图 | `wow-mobs/`、`wow-bosses/` |
| 圆切 | `wow-mobs-circle/`、`wow-bosses-circle/`（默认直径 256） |

方图写出或已存在后会自动圆切；**无**独立「一键导入」按钮，需按 GUI 顶部说明复制到 `public/assets/wow-mobs*` 等。

### 2.3 新工具约定

- 临时根建议放在 `temp/<任务名>-staging/`，下挂 `raw/` 与裁切结果子目录。
- 裁切逻辑可复用 `process_icon_png` 或 `wow_portrait_circle.write_circle_from_square`。
- **禁止**让 `generate_to_file` 直接写入 `public/assets/`（除非用户明确要求跳过 staging）。

---

## 3. 一键导入项目

**原则：裁切满意后，一键把临时目录里的成品**强制覆盖**复制到游戏资源路径，并视需要刷新 `assetManifest.json`。**

### 3.1 装备图标（已实现）

- **GUI 按钮**：「一键导入项目」
- **代码**：`gear_icon_jobs.import_gear_icons_to_project(staging_dir)`
- **来源**：`<staging>/icons/<gearId>.png`（按 `gearItems.json` 清单匹配）
- **目标**：`public/assets/gear/<gearId>.png`（**始终覆盖**）
- **成功后**：自动执行 `node scripts/build-asset-manifest.mjs` 更新 `src/game/config/assetManifest.json`
- **缺失**：清单里有但 `icons/` 没有的条目会计入「缺失」，不删除 `public/` 里旧文件

运行前会确认对话框；日志输出复制数量与缺失数。

### 3.2 新工具如何实现导入

复用模式即可：

```python
from gear_icon_jobs import import_gear_icons_to_project

result = import_gear_icons_to_project(Path("temp/xxx-staging"))
# result.copied, result.missing, result.manifest_rebuilt
```

其他资源类型（如立绘）可仿照：读清单 → `shutil.copy2` 到对应 `public/assets/...` → 可选跑 manifest 脚本。

---

## 4. Tkinter GUI 规范（必遵守）

1. **禁止在后台线程读写 Tk**（`var.get()`、`_log()`、`messagebox`）→ 启动线程前快照配置；`queue` + `_pump_queue`。
2. **alert 队列**：`("alert", (title, body, ok))` → 处理用 `title, body, ok = msg[1]`。
3. **依赖**：`pip install pillow`（裁切/圆切）。

---

## 5. 已有脚本速查

| 脚本 | ① API | ② 切图 | ③ 一键导入 |
|------|-------|--------|------------|
| `tools/饥荒风格装备图标生成.py` | ✓ `raw/` | ✓ → `icons/` | ✓ → `public/assets/gear/` |
| `tools/wow_portrait_gui.py` | ✓ 方图目录 | ✓ 圆切 | ✗ 手动复制 |

```bash
python tools/饥荒风格装备图标生成.py
python tools/wow_portrait_gui.py
```

共用模块：`image2_generate.py`、`gear_icon_jobs.py`、`wow_md_parse_jobs.py`、`wow_portrait_circle.py`。

---

## 6. 新工具检查清单

- [ ] 已读本文 **§1～§3**
- [ ] 复用 `image2_generate.generate_to_file` / `probe_api_connection`
- [ ] 文生图只写 **临时目录**（如 `raw/`），再裁切
- [ ] 提供 **一键导入** 到 `public/assets/`（或说明为何不导入）
- [ ] Tk 线程与队列约定（§4）
- [ ] 更新本文 **§5 表格**

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 初版 |
| 2026-05 | 增补三条标准流程：接口注意、临时目录+切图、一键导入；对照装备/立绘 GUI |
