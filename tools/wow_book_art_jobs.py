#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 HeyBro `wowBookMonsters.json` + `wowBookBosses.json` 构建文生图任务列表，
可选合并 `reference-classic-vanilla-wow-roguelike-level-design.json` 中的外观/技能文案。

输出路径约定（与 `enemyPortraitTextures` / 生成脚本 editConvention 一致）：
- 小怪：`wow-mobs/<monsterUid>.png`（例 `U000042.png`）
- 首领：`wow-bosses/<bossUid>.png`（例 `B000001.png`）

背景：小怪用冷灰 bokeh；**全部首领**立绘统一暗红/酒红 bokeh（与饥荒风大全一致）。
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from wow_md_parse_jobs import WowImageJob

STYLE_CN = (
    "饥荒（Don't Starve）/ Klei 手绘感：墨线勾边、线宽略抖、低饱和大地色系、"
    "平涂或轻排线、木偶感比例、阴郁怪趣味。"
)
STYLE_EN = (
    "Klei Don't Starve style: hand-ink outlines, slightly jittery line weight, "
    "flat or lightly hatched fills, desaturated earthy palette, "
    "puppet-like stylized proportions, subtle grim whimsy. "
    "NOT photoreal, NOT glossy anime cel, NOT soft airbrush beauty, NOT clean Pixar 3D."
)
AVOID = (
    "Avoid: circular badge UI frame, watermark, readable text, photoreal skin, "
    "glossy anime highlights, Octane 3D, busy sharp readable full dungeon map as background, gore."
)
# 与 STYLE 中整体「饥荒大地色」并存：主体设色拉饱和与对比，背景仍虚化低饱和。
SUBJECT_VIVID_CONTRAST_CN = (
    "主体设色：角色与装备用色鲜艳醒目、饱和度高，明暗与色块对比强烈、轮廓与色块交界利落；"
    "与虚化低饱和背景形成清晰层次分离，缩略图一眼可读。勿把全身涂成灰褐糊成一团。"
)
SUBJECT_VIVID_CONTRAST_EN = (
    "Subject coloring: vivid saturated hues on character and gear, strong value/chroma contrast, crisp shapes; "
    "clear figure/ground separation from soft desaturated bokeh. Must read as a colorful silhouette at thumbnail size."
)
GRAY_BG = (
    "背景为高度虚化的统一冷灰 bokeh（石板灰 #94a3a8 系），低饱和、边缘略压暗炭灰 #475569，"
    "无职业色光晕、无整块抢镜彩色氛围。 Heavily blurred bokeh background dominated by unified "
    "cool neutral gray (#94a3a8, slate), low saturation, slightly darker charcoal #475569 at edges, "
    "no colored class glow."
)
RED_BG = (
    "背景为高度虚化的统一暗红与酒红 bokeh（#450a0a、#7f1d1d 系），阴郁低饱和、边缘略发黑，"
    "避免亮橙火焰铺满。 Heavily blurred bokeh background dominated by unified dark crimson and "
    "burgundy (#450a0a, #7f1d1d), ominous low saturation, slightly blackened edges, no bright orange flames."
)
# 首领专用：与 RED_BG 叠用，避免模型按「饥荒低饱和」误画成冷灰底。
BOSS_BG_MUST_CN = (
    "【首领立绘硬性要求】背景必须是暗红/酒红虚化 bokeh，禁止冷灰、石板灰、蓝灰 bokeh；"
    "勿与小怪共用灰色背景。"
)
BOSS_BG_MUST_EN = (
    "MANDATORY for dungeon boss portrait: background MUST be dark crimson/burgundy bokeh only; "
    "NOT cool gray, slate, or blue-gray bokeh; NOT the same neutral gray as trash mobs."
)


def slug(s: str) -> str:
    t = re.sub(r"[^a-z0-9]+", "_", (s or "unknown").lower())
    t = t.strip("_")[:48]
    return t or "x"


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_reference_indexes(
    book: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[tuple[str, int], dict[str, Any]], dict[str, tuple[str, str]]]:
    """refKey -> mob_pool 条目；(dungeonId, stage_number) -> boss 对象；dungeonId -> (cn, en)"""
    mob_by_refkey: dict[str, Any] = {}
    boss_by_stage: dict[tuple[str, int], dict[str, Any]] = {}
    dungeon_names: dict[str, tuple[str, str]] = {}
    for d in book:
        did = slug(str(d.get("name_en") or d.get("name_cn") or "dungeon"))
        dungeon_names[did] = (str(d.get("name_cn") or ""), str(d.get("name_en") or ""))
        for mob in d.get("mob_pool") or []:
            mk = f"{did}::{slug(str(mob.get('name_en') or mob.get('name_cn') or 'mob'))}"
            mob_by_refkey[mk] = mob
        for st in d.get("stages") or []:
            sn = int(st.get("stage_number") or 0)
            b = st.get("boss") or {}
            if sn > 0 and isinstance(b, dict):
                boss_by_stage[(did, sn)] = b
    return mob_by_refkey, boss_by_stage, dungeon_names


def skills_cn_for_boss(boss: dict[str, Any]) -> str:
    parts: list[str] = []
    for sk in boss.get("skills") or []:
        if not isinstance(sk, dict):
            continue
        n = str(sk.get("name_cn") or "").strip()
        desc = str(sk.get("description") or "").strip()
        if n:
            parts.append(f"{n}" + (f"：{desc}" if desc else ""))
    return "；".join(parts)


def fabricated_mob_pool_row(m: dict[str, Any]) -> dict[str, str]:
    """reference 无 mob_pool 条目时，用表字段写短设定（非剧情考据）。"""
    cn = str(m.get("nameCn") or "").strip()
    ct = str(m.get("creatureType") or "未知").strip() or "未知"
    atk = str(m.get("attackType") or "").strip() or "近战"
    role = str(m.get("role") or "").strip() or "输出"
    dn = str(m.get("dungeonNameCn") or "").strip() or "地下城"
    return {
        "appearance": f"（表驱动补全）{cn}：剪影夸张、肢体略木偶化；装备/武器轮廓贴合名称与《魔兽世界》路人想象，避免写实电影脸。",
        "description": f"出没于「{dn}」战场的敌方单位；{ct}系，{atk}，战职偏{role}。",
        "signature_skill": f"以{atk}姿态做出代表性攻击预备或挥击瞬间；不必写技能名。",
    }


def fabricated_boss_stage(b: dict[str, Any]) -> dict[str, Any]:
    """reference 无对应 stage.boss 时补外观（技能列表空）。"""
    cn = str(b.get("nameCn") or "").strip()
    st = str(b.get("stageNameCn") or "").strip()
    return {
        "appearance": f"（表驱动补全）{cn}：关底首领体量，轮廓强剪影；气质阴郁、线稿饥荒风；与关卡「{st}」氛围呼应。",
        "skills": [],
    }


def prompt_monster_mob(
    m: dict[str, Any],
    ref_mob: dict[str, Any] | None,
    dungeon_en: str,
) -> str:
    name_cn = str(m.get("nameCn") or "")
    name_en = str(m.get("nameEn") or "")
    dungeon_cn = str(m.get("dungeonNameCn") or "")
    tags = (
        f"设定标签（勿在画面写文字）：{m.get('attackType') or ''}，{m.get('creatureType') or '其他'}，{m.get('role') or '输出'}"
    )
    base = fabricated_mob_pool_row(m)
    if isinstance(ref_mob, dict):
        for k in ("appearance", "description", "signature_skill"):
            v = str(ref_mob.get(k) or "").strip()
            if v:
                base[k] = v
    appearance = str(base.get("appearance") or "").strip()
    desc = str(base.get("description") or "").strip()
    sig = str(base.get("signature_skill") or "").strip()
    bits = [x for x in (appearance, desc, sig) if x]
    extra = " ".join(bits)

    head = (
        f"【书怪小怪｜{dungeon_cn}（{dungeon_en}）】{name_cn}（{name_en}）。"
        "魔兽世界地下城设定下的单体角色立绘或小场景胸像，方图构图、主体居中、剪影在缩略图尺度可读。"
    )
    mid = (
        GRAY_BG
        + " "
        + STYLE_CN
        + " "
        + STYLE_EN
        + " "
        + SUBJECT_VIVID_CONTRAST_CN
        + " "
        + SUBJECT_VIVID_CONTRAST_EN
        + " "
    )
    tail = (
        "World of Warcraft fantasy creature, readable silhouette at thumbnail size, "
        "inked rim light not soft bloom. " + AVOID + " " + tags
    )
    body = f"外观与设定要点：{extra}"
    return f"{head} {mid} {body} {tail}".strip()


def prompt_boss_row(
    b: dict[str, Any],
    ref_boss: dict[str, Any] | None,
) -> str:
    name_cn = str(b.get("nameCn") or "")
    name_en = str(b.get("nameEn") or "")
    dungeon_cn = str(b.get("dungeonNameCn") or "")
    dungeon_en = str(b.get("dungeonNameEn") or "")
    stage_cn = str(b.get("stageNameCn") or "")
    is_final = bool(b.get("isFinalBoss"))
    tags = (
        f"设定标签（勿在画面写文字）：{b.get('attackType') or ''}，{b.get('creatureType') or '其他'}，{b.get('role') or '输出'}"
    )
    base = fabricated_boss_stage(b)
    if isinstance(ref_boss, dict):
        ap = str(ref_boss.get("appearance") or "").strip()
        if ap:
            base["appearance"] = ap
        sk = ref_boss.get("skills")
        if isinstance(sk, list) and sk:
            base["skills"] = sk
    appearance = str(base.get("appearance") or "").strip()
    skills_txt = skills_cn_for_boss(base)
    role_line = "最终首领" if is_final else "关卡首领"
    head = (
        f"【{role_line}】{name_cn}（{name_en}）。地下城：{dungeon_cn} / {dungeon_en}。"
        f"关卡语境：{stage_cn}。首领需要更强剪影与略大魄力，仍为饥荒手绘线稿风而非写实 Boss 海报。"
    )
    mid = (
        RED_BG
        + " "
        + BOSS_BG_MUST_CN
        + " "
        + BOSS_BG_MUST_EN
        + " "
        + STYLE_CN
        + " "
        + STYLE_EN
        + " "
        + SUBJECT_VIVID_CONTRAST_CN
        + " "
        + SUBJECT_VIVID_CONTRAST_EN
        + " "
    )
    body_parts = [x for x in (appearance, skills_txt) if x]
    body = ("设定要点：" + " ".join(body_parts)) if body_parts else ""
    tail = (
        "World of Warcraft dungeon boss portrait, dramatic puppet-like stylization, "
        "dark red burgundy bokeh background required. "
        + AVOID
        + " "
        + tags
    )
    return f"{head} {mid} {body} {tail}".strip()


def load_wow_book_art_jobs(
    repo_root: Path,
    *,
    monsters_json: Path | None = None,
    bosses_json: Path | None = None,
    reference_json: Path | None = None,
) -> list[WowImageJob]:
    """
    合并小怪 + 首领任务；顺序为：全部小怪（按 monsterUid 排序）后接全部首领（按 bossUid 排序）。
    """
    root = repo_root.resolve()
    p_mon = monsters_json or (root / "src/game/config/wowBookMonsters.json")
    p_boss = bosses_json or (root / "src/game/config/wowBookBosses.json")
    p_ref = reference_json or (root / "docs/reference-classic-vanilla-wow-roguelike-level-design.json")

    mon_doc = _read_json(p_mon)
    bosses_doc = _read_json(p_boss)
    if not isinstance(mon_doc, dict) or not isinstance(bosses_doc, dict):
        raise ValueError("wowBook JSON 根须为对象")
    monsters: list[dict[str, Any]] = list(mon_doc.get("monsters") or [])
    bosses: list[dict[str, Any]] = list(bosses_doc.get("bosses") or [])

    mob_by_refkey: dict[str, Any] = {}
    boss_by_stage: dict[tuple[str, int], dict[str, Any]] = {}
    dungeon_names: dict[str, tuple[str, str]] = {}
    if p_ref.is_file():
        book = _read_json(p_ref)
        if isinstance(book, list):
            mob_by_refkey, boss_by_stage, dungeon_names = build_reference_indexes(book)

    jobs: list[WowImageJob] = []

    def uid_sort_key(u: str) -> tuple[int, str]:
        if len(u) >= 2 and u[0] in "BU" and u[1:].isdigit():
            return (int(u[1:]), u)
        return (10**9, u)

    monsters_sorted = sorted(
        monsters,
        key=lambda m: uid_sort_key(str(m.get("monsterUid") or "")),
    )
    for m in monsters_sorted:
        uid = str(m.get("monsterUid") or "").strip()
        mid = str(m.get("id") or "").strip()
        if not uid or not re.match(r"^U\d{6}$", uid):
            continue
        did = str(m.get("dungeonId") or "")
        dcn, den = dungeon_names.get(did, (str(m.get("dungeonNameCn") or ""), did.replace("_", " ").title()))
        if not dcn:
            dcn = str(m.get("dungeonNameCn") or "")
        ref_mob = mob_by_refkey.get(str(m.get("refKey") or ""))
        prompt = prompt_monster_mob(m, ref_mob if isinstance(ref_mob, dict) else None, den or did)
        jobs.append(
            WowImageJob(
                dungeon_cn=dcn or "（未命名副本）",
                dungeon_en=den or did,
                category="unit",
                unit_cn=str(m.get("nameCn") or mid),
                unit_en=str(m.get("nameEn") or ""),
                rel_path=f"wow-mobs/{uid}.png",
                prompt=prompt,
                asset_uid=uid,
                row_id=mid,
            )
        )

    bosses_sorted = sorted(bosses, key=lambda b: uid_sort_key(str(b.get("bossUid") or "")))
    for b in bosses_sorted:
        uid = str(b.get("bossUid") or "").strip()
        bid = str(b.get("id") or "").strip()
        if not uid or not re.match(r"^B\d{6}$", uid):
            continue
        did = str(b.get("dungeonId") or "")
        sn = int(b.get("stageNumber") or 0)
        ref_boss = boss_by_stage.get((did, sn))
        if not isinstance(ref_boss, dict):
            ref_boss = None
        prompt = prompt_boss_row(b, ref_boss)
        jobs.append(
            WowImageJob(
                dungeon_cn=str(b.get("dungeonNameCn") or ""),
                dungeon_en=str(b.get("dungeonNameEn") or ""),
                category="boss",
                unit_cn=str(b.get("nameCn") or bid),
                unit_en=str(b.get("nameEn") or ""),
                rel_path=f"wow-bosses/{uid}.png",
                prompt=prompt,
                asset_uid=uid,
                row_id=bid,
            )
        )

    return jobs
