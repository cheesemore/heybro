用书怪立绘（PNG）
================

命名规则（与 `src/game/config/wowBookMonsters.json` 对齐）
--------------------------------------------------------

**推荐（出图/唯一编号）**：文件名 = 表中该怪的 **`monsterUid`** + `.png`（例 `U000042.png`）。`monsterUid` 在表内全局唯一；重新跑 `scripts/generate-wow-book-tables.mjs` 时，同一 `id` 会尽量保留原 `monsterUid`（便于已导出的资源不重命名）。

**兼容**：也可用 **`id`** + `.png`（与 `id` 完全一致，含 `mob_` 前缀、下划线、大小写）。

- 放在本目录：`public/assets/wow-mobs/<monsterUid 或 id>.png`。

与参考表副本的对应
------------------

- 字段 **`refKey`** = `dungeonId::怪名 slug`，与 `docs/reference-classic-vanilla-wow-roguelike-level-design.json` 里该副本的 `slug(name_en|name_cn)` + 该条 `mob_pool` 的怪名 slug 一致；legacy 十二兵种为 `legacy::<id>`。

示例
----

| `monsterUid` | `id`                 | 推荐文件名        | 兼容文件名              |
|--------------|----------------------|-------------------|-------------------------|
| U000104      | mob_ragefire_trogg   | U000104.png      | mob_ragefire_trogg.png  |
| U000088      | mob_molten_elemental | U000088.png      | mob_molten_elemental.png|
| U000007      | grunt                | U000007.png      | grunt.png               |

运行时：若未提供对应 PNG，界面仍会用 `enemyPaint` 模板回退到 `public/assets/enemies/<paint>.png`（如 `grunt.png`）。
