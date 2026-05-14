#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从《魔兽世界5人副本_饥荒风提示词大全.md》解析每条可生图任务：
- 小怪/精英：#### N. 标题 后的 ```text 提示词
- 最终首领：### 最终首领 段内 ```text（同一副本可重复多段，对应多关卡首领）
- 可选：副本主题插画 ```text（【副本主题插画…）

若小节内存在元数据行 `- **monsterUid**：`U000042`` / `- **bossUid**：`B000001``，
则 `rel_path` 分别为 `wow-mobs/<uid>.png`、`wow-bosses/<uid>.png`（与 JSON 管线一致）；
否则沿用旧路径 `副本slug/副本slug__unit_…` 或 `__BOSS__…`。
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from wow_trash_cn_en_map import resolve_unit_english_for_slug


@dataclass
class WowImageJob:
    """一条生图任务。"""

    dungeon_cn: str
    dungeon_en: str
    category: str  # unit | boss | scene
    unit_cn: str
    unit_en: str
    rel_path: str  # posix 相对输出根目录
    prompt: str
    # 出图 UID：`U000042` / `B000001`；Markdown 来源时为空。
    asset_uid: str = ""
    # 表内行 id：`mob_*` / `boss_ch*` / legacy `grunt` 等。
    row_id: str = ""


def slug_ascii(s: str) -> str:
    t = re.sub(r"[^a-zA-Z0-9]+", "_", s or "")
    t = t.strip("_")
    return t or "unnamed"


_UID_MON = re.compile(r"^\-\s+\*\*monsterUid\*\*[：:]\s*`(U\d{6})`\s*$")
_UID_BOSS = re.compile(r"^\-\s+\*\*bossUid\*\*[：:]\s*`(B\d{6})`\s*$")
_ROW_ID = re.compile(r"^\-\s+\*\*表\s*id\*\*[：:]\s*`([^`]+)`\s*$")


def _parse_meta_between(lines: list[str], lo: int, hi: int) -> dict[str, str]:
    out: dict[str, str] = {}
    for k in range(lo, hi):
        s = lines[k].strip()
        m = _UID_MON.match(s)
        if m:
            out["monster_uid"] = m.group(1)
            continue
        m = _UID_BOSS.match(s)
        if m:
            out["boss_uid"] = m.group(1)
            continue
        m = _ROW_ID.match(s)
        if m:
            out["row_id"] = m.group(1)
    return out


def _extract_text_fence(lines: list[str], fence_start: int) -> tuple[str | None, int]:
    """从 fence_start 行（应为 ```text）起读取到闭合 ```，返回 (内容, 闭合行索引)。"""
    if fence_start >= len(lines):
        return None, fence_start
    if lines[fence_start].strip() != "```text":
        return None, fence_start
    i = fence_start + 1
    buf: list[str] = []
    while i < len(lines):
        if lines[i].strip() == "```":
            return "\n".join(buf).strip(), i
        buf.append(lines[i])
        i += 1
    return None, fence_start


def parse_wow_prompt_md(text: str, *, include_scene: bool = False) -> list[WowImageJob]:
    lines = text.splitlines()
    jobs: list[WowImageJob] = []
    i = 0
    cur_cn: str | None = None
    cur_en: str | None = None
    dungeon_slug = ""

    header_re = re.compile(r"^## (.+)（([^）]+)）\s*$")
    unit_re = re.compile(r"^#### (\d+)\. (.+)\s*$")
    boss_line_re = re.compile(r"^\-\s+\*\*首领\*\*[：:]\s*(.+)\s*$")

    while i < len(lines):
        line = lines[i]
        hm = header_re.match(line)
        if hm:
            cur_cn, cur_en = hm.group(1).strip(), hm.group(2).strip()
            if cur_cn.startswith("通用"):
                cur_cn, cur_en = None, None
                dungeon_slug = ""
            else:
                dungeon_slug = slug_ascii(cur_en)
            i += 1
            continue

        if cur_cn is None or cur_en is None:
            i += 1
            continue

        if include_scene and line.strip() == "### 副本主题插画 — 提示词":
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```text":
                j += 1
            prompt, end = _extract_text_fence(lines, j)
            if prompt and "【副本主题插画" in prompt:
                rel = f"{dungeon_slug}/{dungeon_slug}__SCENE.png"
                jobs.append(
                    WowImageJob(
                        dungeon_cn=cur_cn,
                        dungeon_en=cur_en,
                        category="scene",
                        unit_cn=f"{cur_cn}·环境",
                        unit_en="scene",
                        rel_path=rel,
                        prompt=prompt,
                    )
                )
            i = end + 1 if end > j else i + 1
            continue

        um = unit_re.match(line)
        if um:
            idx = int(um.group(1))
            rest = um.group(2).strip()
            um2 = re.match(r"^(.+)（([^）]+)）\s*$", rest)
            if um2:
                ucn, uen = um2.group(1).strip(), um2.group(2).strip()
            else:
                ucn, uen = rest, ""
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```text":
                j += 1
            prompt, end = _extract_text_fence(lines, j)
            if prompt:
                meta = _parse_meta_between(lines, i + 1, j)
                monster_uid = meta.get("monster_uid", "")
                row_id = meta.get("row_id", "")
                us = slug_ascii(resolve_unit_english_for_slug(ucn, uen)) or f"unit_{idx:02d}"
                if re.match(r"^U\d{6}$", monster_uid):
                    rel = f"wow-mobs/{monster_uid}.png"
                    asset = monster_uid
                else:
                    rel = f"{dungeon_slug}/{dungeon_slug}__unit_{idx:02d}__{us}.png"
                    asset = ""
                jobs.append(
                    WowImageJob(
                        dungeon_cn=cur_cn,
                        dungeon_en=cur_en,
                        category="unit",
                        unit_cn=ucn,
                        unit_en=uen,
                        rel_path=rel,
                        prompt=prompt,
                        asset_uid=asset,
                        row_id=row_id,
                    )
                )
            i = end + 1 if end > j else i + 1
            continue

        if line.strip() == "### 最终首领 — 提示词":
            j = i + 1
            boss_cn, boss_en = "", ""
            while j < len(lines):
                if lines[j].strip() == "```text":
                    break
                bm = boss_line_re.match(lines[j])
                if bm:
                    raw = bm.group(1).strip()
                    bm2 = re.match(r"^(.+)（([^）]+)）\s*$", raw)
                    if bm2:
                        boss_cn, boss_en = bm2.group(1).strip(), bm2.group(2).strip()
                    else:
                        boss_cn, boss_en = raw, ""
                j += 1
            prompt, end = _extract_text_fence(lines, j)
            if prompt and boss_cn:
                meta = _parse_meta_between(lines, i + 1, j)
                boss_uid = meta.get("boss_uid", "")
                row_id = meta.get("row_id", "")
                bs = slug_ascii(resolve_unit_english_for_slug(boss_cn, boss_en)) or "boss"
                if re.match(r"^B\d{6}$", boss_uid):
                    rel = f"wow-bosses/{boss_uid}.png"
                    asset = boss_uid
                else:
                    rel = f"{dungeon_slug}/{dungeon_slug}__BOSS__{bs}.png"
                    asset = ""
                jobs.append(
                    WowImageJob(
                        dungeon_cn=cur_cn,
                        dungeon_en=cur_en,
                        category="boss",
                        unit_cn=boss_cn,
                        unit_en=boss_en,
                        rel_path=rel,
                        prompt=prompt,
                        asset_uid=asset,
                        row_id=row_id,
                    )
                )
            i = end + 1 if end > j else i + 1
            continue

        i += 1

    return jobs


def write_manifest(jobs: list[WowImageJob], out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    tsv = out_dir / "manifest.tsv"
    js = out_dir / "manifest.json"
    with tsv.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(
            [
                "relative_file",
                "asset_uid",
                "row_id",
                "dungeon_cn",
                "dungeon_en",
                "category",
                "unit_cn",
                "unit_en",
            ]
        )
        for j in jobs:
            w.writerow(
                [
                    j.rel_path,
                    j.asset_uid,
                    j.row_id,
                    j.dungeon_cn,
                    j.dungeon_en,
                    j.category,
                    j.unit_cn,
                    j.unit_en,
                ]
            )
    short = [
        {
            "rel_path": j.rel_path,
            "asset_uid": j.asset_uid,
            "row_id": j.row_id,
            "dungeon_cn": j.dungeon_cn,
            "dungeon_en": j.dungeon_en,
            "category": j.category,
            "unit_cn": j.unit_cn,
            "unit_en": j.unit_en,
        }
        for j in jobs
    ]
    js.write_text(json.dumps(short, ensure_ascii=False, indent=2), encoding="utf-8")
    full_json = out_dir / "manifest_full.json"
    full_json.write_text(json.dumps([asdict(x) for x in jobs], ensure_ascii=False, indent=2), encoding="utf-8")
    return tsv, full_json
