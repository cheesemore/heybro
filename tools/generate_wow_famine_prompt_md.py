#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 `wowBookMonsters.json` + `wowBookBosses.json` + `reference-classic-vanilla-wow-roguelike-level-design.json`
生成《魔兽世界5人副本_饥荒风提示词大全.md》，结构与 `wow_md_parse_jobs.parse_wow_prompt_md` 兼容。

- 每副本一节：`## 中文（English）`；`####` 小怪；**该副本下全部关卡首领**各一条 `### 最终首领 — 提示词`
  （按 `chapterIndex` 升序；含 `isFinalBoss` 与非最终；`bossUid` / `表 id` 供解析器输出 `wow-bosses/B*.png`）。
- 若表中有怪未出现在任何 reference `mob_pool`（极少见），追加 `## 增补怪物` 一节并瞎编提示词。
- 同文件含「通用（Dungeon backgrounds）」**18 条副本背景图** fenced 提示词（不另建独立 MD）；`wow_md_parse_jobs` 不会将其解析为小怪任务。
- 不含「副本主题插画」小节（暂缓）；批量 scene 可继续用 `wow_book_art_jobs` JSON。
- 提示词与 `wow_book_art_jobs` 同源；reference 缺字段时用 `fabricated_*` 补全。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import re

from wow_book_art_jobs import build_reference_indexes, prompt_boss_row, prompt_monster_mob, slug
from wow_md_parse_jobs import parse_wow_prompt_md
from wow_trash_cn_en_map import resolve_unit_english_for_slug

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent

# 各副本背景一句话环境（中文）；按 dungeonId 索引。
DUNGEON_BG_ENV: dict[str, str] = {
    "ragefire_chasm": "地下熔岩裂隙洞窟：暗红砖岩与脚浅哑色熔岩细流，热浪微微扭曲远景。",
    "deadmines": "废弃矿道与木支架、积水与矿车剪影，零星矿灯余烬般的暖点。",
    "wailing_caverns": "盘根巨型洞窟：幽绿苔原与钟乳石，远处洞口一线冷白薄光。",
    "shadowfang_keep": "哥特式石堡内廊：尖拱、剥落的灰石与狭窗外青冷月色。",
    "blackfathom_deeps": "浸水神庙石窟：幽蓝绿浊水反光、残柱与触手状暗影在深处蠕动感（不写实）。",
    "gnomeregan": "诺莫瑞根废墟走廊：锈铁管道、酸绿薄雾与歪斜齿轮剪影。",
    "razorfen_kraul": "荆棘野猪人泥沼洞厅：木栅、兽骨图腾与闷湿棕灰泥墙。",
    "scarlet_monastery": "血色礼拜石厅：暗红地毯褪色、烛台冷焰与肃穆尖拱。",
    "razorfen_downs": "剃刀高地石厅：开阔梁影、风沙从裂口渗入的一线昏黄天光。",
    "uldaman": "泰坦遗迹掘进廊道：砂尘土色方石、矮人脚手架与远处微光门洞。",
    "zul_farrak": "沙怒祭坛庭院式内景：晒裂砂岩、粗糙图腾柱与烈日漂白的高墙剪影。",
    "maraudon": "紫水晶腐蚀洞窟：巨型根脉与晶簇斑块，毒绿与灰紫雾低伏地面。",
    "sunken_temple": "沉没神庙阶梯厅：湿滑黑石台阶、藻膜与水下幽绿漫射光。",
    "blackrock_depths": "黑石深渊熔铸廊：铁链、暗红炉火余烬与熏黑岩壁。",
    "dire_maul": "厄运残垣拱廊：断壁常春藤、淡紫奥术尘雾与歪斜巨石门框。",
    "stratholme": "斯坦索姆废城街廊：碎裂石板、瘟疫绿雾与焦黑屋影。",
    "scholomance": "通灵学院阴冷回廊：剥漆木栏、烛泪与骨饰浮雕仅作暗示。",
    "lower_blackrock_spire": "黑石塔下层陡梯峡道：窄窗投下刀状阴影、铁栅与龙人鳞片冷反光（远景仅虚影）。",
}


def _final_boss_cn_en(
    bosses_by_dungeon: dict[str, list[dict[str, Any]]], dungeon_id: str
) -> tuple[str, str]:
    lst = bosses_by_dungeon.get(dungeon_id) or []
    if not lst:
        return "未知首领", "Unknown boss"
    b = lst[-1]
    cn = str(b.get("nameCn") or "").strip() or "未知首领"
    en = str(b.get("nameEn") or "").strip() or "Unknown boss"
    return cn, en


def _dungeon_background_section(
    book: list[Any], bosses_by_dungeon: dict[str, list[dict[str, Any]]]
) -> list[str]:
    """18 副本各一条背景图 ```text```，挂在 ## 通用（Dungeon backgrounds） 下。"""
    out: list[str] = [
        "## 通用（Dungeon backgrounds）",
        "",
        "> 本节 `##` 标题以 `通用` 开头，`wow_md_parse_jobs` **不会**当作正式副本小节解析。下列每条 ```text``` 供**该副本一张氛围/背景图**使用（非单怪立绘）。**不另建**独立「副本背景图.md」。",
        "",
        "### 使用说明（重要）",
        "",
        "- **不要**在中近景画巡逻小怪、小怪群或战斗阵型；场景以**环境、地貌、光线**为主，宁可空无一人。",
        "- **仅在远景深处**（洞口尽头/廊道消失点）留一团 **5%～8% 画面高度** 的**关底首领剪影虚影**，融入暗部：无五官可读、无肌肉特写、不做第二主体。关底首领取 `wowBookBosses.json` 中该副本 **chapterIndex 最大** 的一条。",
        "- 画风锚点请叠用上方「## 通用画风关键词」整段。",
        "",
    ]
    for d in book:
        if not isinstance(d, dict):
            continue
        dcn = str(d.get("name_cn") or "").strip()
        den = str(d.get("name_en") or "").strip()
        did = slug(den or dcn)
        if not dcn:
            continue
        bcn, ben = _final_boss_cn_en(bosses_by_dungeon, did)
        env = DUNGEON_BG_ENV.get(did, "石拱走廊与潮湿岩壁，远处一线天光或冷炉火。")
        body = (
            f"【副本背景图｜{dcn}（{den}）】魔兽世界五人副本氛围场景：{env} "
            "**以环境、地形与光线为主**；**中近景不出现巡逻小怪与小怪集群**（可无人物）。"
            "仅在**远景尽头/洞口深处**留一团**极淡、剪影化、融入暗部**的关底首领虚影："
            f"**{bcn}（{ben}）**——约占画面高度 **5%～8%** 的斑块剪影，无面孔可读、无肌肉渲染、不成为第二视觉中心。\n"
            "Klei Don't Starve loading-screen: thick hand-ink outlines, flat or lightly hatched shadows, "
            "desaturated earthy palette; **only** a tiny vague far boss silhouette at vanishing point; "
            "chalky lava/magic accents with inked edges, NO neon glow, NO volumetric god rays, NO lens flare.\n"
            "Avoid: foreground mob packs, midground trash patrols, readable boss portrait, WoW cinematic trailer, "
            "photoreal rock microdetail, watermark, readable text."
        )
        out += [
            f"### {dcn}（{den}）",
            "",
            _md_fence(body),
            "",
        ]
    return out


def _read(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def _md_fence(text: str) -> str:
    return "```text\n" + text.strip() + "\n```"


def generate(repo_root: Path, out_md: Path) -> None:
    root = repo_root.resolve()
    ref_path = root / "docs/reference-classic-vanilla-wow-roguelike-level-design.json"
    mon_path = root / "src/game/config/wowBookMonsters.json"
    boss_path = root / "src/game/config/wowBookBosses.json"

    book = _read(ref_path)
    if not isinstance(book, list):
        raise ValueError("reference JSON 须为数组")
    mon_doc = _read(mon_path)
    boss_doc = _read(boss_path)
    if not isinstance(mon_doc, dict) or not isinstance(boss_doc, dict):
        raise ValueError("wowBook JSON 格式错误")

    monsters: list[dict[str, Any]] = list(mon_doc.get("monsters") or [])
    bosses: list[dict[str, Any]] = list(boss_doc.get("bosses") or [])
    mob_by_refkey: dict[str, dict[str, Any]] = {}
    for m in monsters:
        rk = str(m.get("refKey") or "")
        if rk:
            mob_by_refkey[rk] = m

    ref_mobs, ref_boss_by_stage, dungeon_names = build_reference_indexes(book)

    pool_refkeys: set[str] = set()
    for d in book:
        didp = slug(str(d.get("name_en") or d.get("name_cn") or ""))
        for mob in d.get("mob_pool") or []:
            if isinstance(mob, dict):
                pool_refkeys.add(f"{didp}::{slug(str(mob.get('name_en') or mob.get('name_cn') or ''))}")

    bosses_by_dungeon: dict[str, list[dict[str, Any]]] = {}
    for b in bosses:
        did = str(b.get("dungeonId") or "")
        if not did:
            continue
        bosses_by_dungeon.setdefault(did, []).append(b)
    for lst in bosses_by_dungeon.values():
        lst.sort(key=lambda x: int(x.get("chapterIndex") or 0))

    lines: list[str] = [
        "# 魔兽世界五人副本 — 饥荒风插画与角色提示词大全（HeyBro）",
        "",
        "> **生成**：`python tools/generate_wow_famine_prompt_md.py`",
        "> **数据**：`wowBookMonsters.json`、`wowBookBosses.json`、`reference-classic-vanilla-wow-roguelike-level-design.json`",
        "> **副本背景图**：见下「## 通用（Dungeon backgrounds）」共 18 条 fenced 提示词（**不另建**独立副本背景 md）。可与 `wow_book_art_jobs` scene JSON 并存。",
        "> **副本主题插画**：`### 副本主题插画` 暂缓；`wow_md_parse_jobs` 需 `include_scene` 才解析。",
        "> **UID**：小怪 `monsterUid`（`U*`），首领 `bossUid`（`B*`）；与 `scripts/generate-wow-book-tables.mjs` 一致。",
        "> **画风**：与 `gptimage/dont_starve_style.py` 的 `STYLE_CORE` 及下方「通用画风」块一致。",
        "> **敌方立绘背景**：小怪为冷灰 bokeh；`### 最终首领` 段内提示词按 `isFinalBoss` 切换灰/红底（与 `wow_book_art_jobs` 一致）。",
        "",
        "---",
        "",
        "## 通用画风关键词（可粘贴到任意条目前）",
        "",
        "> 本节以 `通用` 开头，**不会被** `wow_md_parse_jobs` 当作副本任务解析。",
        "",
        "- **中文**：饥荒（Don't Starve）/ Klei 手绘感：墨线勾边、线宽略抖、低饱和大地色系、平涂或轻排线、木偶感比例、阴郁怪趣味。",
        "- **English**：`Klei Don't Starve style: hand-ink outlines, slightly jittery line weight, flat or lightly hatched fills, desaturated earthy palette, puppet-like stylized proportions, subtle grim whimsy. NOT photoreal, NOT glossy anime cel, NOT soft airbrush beauty, NOT clean Pixar 3D.`",
        "- **否定**：Avoid: circular badge UI frame, watermark, readable text, photoreal skin, glossy anime highlights, Octane 3D, busy sharp readable full dungeon map as background, gore.",
        "",
        "### 通用｜副本背景图（补充文风，叠用在各副本背景 fenced 前后）",
        "",
        "- **中文**：饥荒 Klei **加载画式 2D**：粗墨线、平涂或**短排线阴影**、哑色大地系；**纸片景深**（中景笔触概括，远景更淡）。熔岩/邪能等为**粉画感低饱和**、**墨线收边**，忌霓虹辉光。可极轻纸张肌理；忌 8K 写实岩石金属、忌电影体积光与镜头眩光。",
        "- **English**：`DS/Klei loading-screen: ink outlines, flat or short-hatched shadows, desaturated earthy palette, paper-theatre depth (brushy midground, softer distance). Chalky muted lava/magic with INKED edges, NOT neon. NO volumetric god rays, NO lens flare, NO photoreal rock microdetail, NO cinematic trailer polish.`",
        "- **否定（追加）**：Avoid: foreground mob packs or patrol squads, midground trash clusters, WoW cinematic, Hearthstone splash gloss, strong lava bloom.",
        "",
        "---",
        "",
    ]

    lines += _dungeon_background_section(book, bosses_by_dungeon)
    lines += [
        "---",
        "",
    ]

    legacy = [m for m in monsters if str(m.get("dungeonId")) == "legacy"]
    def uid_key(m: dict[str, Any]) -> int:
        u = str(m.get("monsterUid") or "")
        if len(u) >= 2 and u[0] == "U" and u[1:].isdigit():
            return int(u[1:])
        return 10**9

    legacy.sort(key=uid_key)

    if legacy:
        lines += [
            "## 模板兵种（Legacy）",
            "",
            "### 小怪与精英",
            "",
        ]
        for i, m in enumerate(legacy, start=1):
            uen = resolve_unit_english_for_slug(str(m.get("nameCn") or ""), str(m.get("nameEn") or ""))
            uid = str(m.get("monsterUid") or "")
            mid = str(m.get("id") or "")
            pr = prompt_monster_mob(m, None, "Legacy")
            lines += [
                f"#### {i}. {m.get('nameCn')}（{uen}）",
                f"- **类型**：模板兵种",
                f"- **表 id**：`{mid}`",
                f"- **monsterUid**：`{uid}`",
                "",
                _md_fence(pr),
                "",
            ]
        lines += [
            "---",
            "",
        ]

    for d in book:
        dcn = str(d.get("name_cn") or "").strip()
        den = str(d.get("name_en") or "").strip()
        did = slug(den or dcn)
        if not dcn:
            continue
        lines += [
            f"## {dcn}（{den}）",
            "",
            f"- **dungeonId**：`{did}`",
            "",
            "### 小怪与精英",
            "",
        ]
        mob_pool = d.get("mob_pool") or []
        for i, mob in enumerate(mob_pool, start=1):
            if not isinstance(mob, dict):
                continue
            mcn = str(mob.get("name_cn") or "").strip()
            men = str(mob.get("name_en") or "").strip()
            rk = f"{did}::{slug(men or mcn)}"
            row = mob_by_refkey.get(rk)
            ref_m = ref_mobs.get(rk) if isinstance(ref_mobs.get(rk), dict) else None
            if not row:
                lines += [
                    f"#### {i}. {mcn}（{resolve_unit_english_for_slug(mcn, men)}）",
                    f"- **警告**：`wowBookMonsters.json` 中缺少 `refKey={rk}`，未生成 fenced 提示词。",
                    "",
                ]
                continue
            _, den_row = dungeon_names.get(did, (dcn, den))
            uen = resolve_unit_english_for_slug(str(row.get("nameCn") or ""), str(row.get("nameEn") or ""))
            pr = prompt_monster_mob(row, ref_m, den_row or den)
            lines += [
                f"#### {i}. {row.get('nameCn')}（{uen}）",
                f"- **类型**：小怪",
                f"- **表 id**：`{row.get('id')}`",
                f"- **monsterUid**：`{row.get('monsterUid')}`",
                f"- **refKey**：`{rk}`",
                "",
                _md_fence(pr),
                "",
            ]

        d_bosses = bosses_by_dungeon.get(did) or []
        if d_bosses:
            for fb in d_bosses:
                sn = int(fb.get("stageNumber") or 0)
                ref_boss = ref_boss_by_stage.get((did, sn))
                if not isinstance(ref_boss, dict):
                    ref_boss = None
                uen_b = resolve_unit_english_for_slug(str(fb.get("nameCn") or ""), str(fb.get("nameEn") or ""))
                pr_b = prompt_boss_row(fb, ref_boss)
                tag = "最终关底" if fb.get("isFinalBoss") else "关卡首领"
                lines += [
                    "### 最终首领 — 提示词",
                    "",
                    f"- **首领**：{fb.get('nameCn')}（{uen_b}）",
                    f"- **类型**：{tag}",
                    f"- **bossUid**：`{fb.get('bossUid')}`",
                    f"- **表 id**：`{fb.get('id')}`",
                    "",
                    _md_fence(pr_b),
                    "",
                ]
        else:
            lines += [
                "<!-- 本副本在 wowBookBosses 中无对应 dungeonId 条目 -->",
                "",
            ]

        lines += [
            "---",
            "",
        ]

    orphans = [
        m
        for m in monsters
        if str(m.get("dungeonId")) != "legacy"
        and re.match(r"^U\d{6}$", str(m.get("monsterUid") or ""))
        and str(m.get("refKey") or "") not in pool_refkeys
    ]
    if orphans:
        lines += [
            "## 增补怪物（表内未挂任何副本池）",
            "",
            "### 小怪与精英",
            "",
        ]
        for i, m in enumerate(orphans, start=1):
            uen = resolve_unit_english_for_slug(str(m.get("nameCn") or ""), str(m.get("nameEn") or ""))
            den_row = str(m.get("dungeonNameCn") or "未知副本")
            pr = prompt_monster_mob(m, None, den_row)
            lines += [
                f"#### {i}. {m.get('nameCn')}（{uen}）",
                f"- **类型**：增补",
                f"- **表 id**：`{m.get('id')}`",
                f"- **monsterUid**：`{m.get('monsterUid')}`",
                f"- **refKey**：`{m.get('refKey')}`",
                "",
                _md_fence(pr),
                "",
            ]
        lines += ["---", ""]

    out_md.parent.mkdir(parents=True, exist_ok=True)
    text_out = "\n".join(lines).rstrip() + "\n"
    out_md.write_text(text_out, encoding="utf-8")

    jobs = parse_wow_prompt_md(text_out)
    want_u = {str(m.get("monsterUid")) for m in monsters if re.match(r"^U\d{6}$", str(m.get("monsterUid") or ""))}
    want_b = {str(b.get("bossUid")) for b in bosses if re.match(r"^B\d{6}$", str(b.get("bossUid") or ""))}
    got_u = {j.asset_uid for j in jobs if j.category == "unit" and j.asset_uid}
    got_b = {j.asset_uid for j in jobs if j.category == "boss" and j.asset_uid}
    if want_u != got_u:
        raise RuntimeError(f"monsterUid 覆盖不一致: 缺 {want_u - got_u} 多 {got_u - want_u}")
    if want_b != got_b:
        raise RuntimeError(f"bossUid 覆盖不一致: 缺 {want_b - got_b} 多 {got_b - want_b}")


def main() -> int:
    ap = argparse.ArgumentParser(description="生成饥荒风提示词大全 MD（HeyBro wowBook）")
    ap.add_argument("--root", type=Path, default=ROOT, help="仓库根目录")
    ap.add_argument(
        "--out",
        type=Path,
        default=ROOT / "docs" / "魔兽世界5人副本_饥荒风提示词大全.md",
        help="输出 Markdown 路径",
    )
    args = ap.parse_args()
    generate(args.root, args.out)
    print("Wrote", args.out.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
