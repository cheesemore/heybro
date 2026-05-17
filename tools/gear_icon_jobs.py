# -*- coding: utf-8 -*-
"""装备图标任务与饥荒风提示词（供 GUI / 脚本共用）。"""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent

DEFAULT_STAGING = ROOT / "temp" / "gear-icons-staging"
# 游戏内装备图标发布目录（与 gearIconAssets.ts / gearId 文件名一致）
GEAR_ICON_PUBLISH_DIR = ROOT / "public" / "assets" / "gear"
CLASSIC_JSON = TOOLS / "classic-vanilla-dungeon-equipment.json"
GEAR_ITEMS_JSON = ROOT / "src" / "game" / "config" / "gearItems.json"
REGISTRY_JSON = ROOT / "src" / "game" / "config" / "wowBookRegistry.json"
DONT_STARVE_STYLE = ROOT / "gptimage" / "dont_starve_style.py"

ICON_SIZE = 64
PER_JOB_MAX_TRIES = 3
RETRY_GAP_SEC = 2.0
CONSECUTIVE_FAILS_COOLDOWN = 3
COOLDOWN_SEC = 600

SLOT_MAP = {
    "helm": "head",
    "necklace": "neck",
    "shoulder": "shoulder",
    "chest": "chest",
    "belt": "waist",
    "legs": "legs",
    "boots": "feet",
    "bracers": "wrist",
    "gloves": "hands",
    "ring": "finger",
    "cloak": "back",
    "offhand": "offHand",
    "weapon": "mainHand",
    "trinket": "trinket",
}

_STRIP_FROM_TABLE_PROMPT = re.compile(
    r"World of Warcraft aesthetic|World of Warcraft|"
    r"fantasy RPG game item illustration,?\s*detailed,?\s*|"
    r"detailed,?\s*dark fantasy style,?\s*|"
    r"dark fantasy RPG game item illustration,?\s*detailed,?\s*",
    re.IGNORECASE,
)


@dataclass
class GearIconJob:
    index: int
    gear_id: str
    dungeon_id: str
    dungeon_name_cn: str
    slot_kind: str
    name_cn: str
    name_en: str
    table_prompt: str


def _load_style_core() -> str:
    spec = importlib.util.spec_from_file_location("dont_starve_style_gear", DONT_STARVE_STYLE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {DONT_STARVE_STYLE}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return str(getattr(mod, "STYLE_CORE", "")).strip()


STYLE_CORE = _load_style_core()

# 装备图标统一底色（浅灰 slate-200，小图对比度优于深灰底）
GEAR_ICON_BG_HEX = "#e2e8f0"

GEAR_ICON_PROMPT_CN = (
    "饥荒（Don't Starve）/ Klei 手绘装备图标：单件道具居中、无角色手部、无文字；"
    "墨线勾边、线宽略抖、平涂或轻排线；道具本体设色可鲜艳醒目；"
    f"背景必须为统一纯色浅灰底 {GEAR_ICON_BG_HEX}，无渐变、无纹理、无场景、无阴影投射到背景上，小图可读剪影。"
)
GEAR_ICON_PROMPT_EN = (
    "Single inventory equipment icon, one centered object, no hands, no readable text, "
    f"flat uniform light gray background exactly {GEAR_ICON_BG_HEX} (cool neutral slate-200), "
    "no gradient, no paper texture, no environment, no cast shadow on backdrop, "
    "square composition, readable at 64px. "
)


def _clean_table_prompt(raw: str) -> str:
    t = _STRIP_FROM_TABLE_PROMPT.sub("", raw or "")
    return " ".join(t.split()).strip()


def build_gear_icon_prompt(job: GearIconJob) -> str:
    specific = _clean_table_prompt(job.table_prompt)
    bits = [
        GEAR_ICON_PROMPT_EN,
        STYLE_CORE,
        GEAR_ICON_PROMPT_CN,
        f"Item name (do not render as text): {job.name_cn} ({job.name_en}).",
        f"Dungeon theme: {job.dungeon_name_cn}.",
    ]
    if specific:
        bits.append(f"Appearance: {specific}")
    bits.append(
        f"Background must stay flat {GEAR_ICON_BG_HEX} only. "
        "Avoid: circular UI badge frame, watermark, readable letters, photoreal metal, "
        "glossy anime cel highlights, Octane 3D, dark or black background, gradient backdrop, "
        "busy scene, character portrait."
    )
    return " ".join(bits)


def load_gear_icon_jobs() -> list[GearIconJob]:
    ref = json.loads(CLASSIC_JSON.read_text(encoding="utf-8"))
    gear_doc = json.loads(GEAR_ITEMS_JSON.read_text(encoding="utf-8"))
    reg = json.loads(REGISTRY_JSON.read_text(encoding="utf-8"))
    cn_to_id = {d["nameCn"]: d["dungeonId"] for d in reg.get("dungeons", [])}
    by_gear_id = {row["gearId"]: row for row in gear_doc.get("items", [])}

    jobs: list[GearIconJob] = []
    idx = 0
    for dungeon in ref:
        did = cn_to_id.get(dungeon["dungeon_name_cn"])
        if not did:
            raise RuntimeError(f"副本未在 registry：{dungeon['dungeon_name_cn']}")
        for eq in dungeon.get("equipment", []):
            sk = SLOT_MAP.get(eq.get("slot_en", ""))
            if not sk:
                raise RuntimeError(f"未知 slot_en：{eq.get('slot_en')} @ {dungeon['dungeon_name_cn']}")
            gear_id = f"{did}.{sk}"
            row = by_gear_id.get(gear_id)
            if not row:
                raise RuntimeError(f"gearItems 缺少：{gear_id}")
            idx += 1
            jobs.append(
                GearIconJob(
                    index=idx,
                    gear_id=gear_id,
                    dungeon_id=did,
                    dungeon_name_cn=dungeon["dungeon_name_cn"],
                    slot_kind=sk,
                    name_cn=str(row.get("nameCn") or eq.get("name_cn", "")),
                    name_en=str(row.get("nameEn") or eq.get("name_en", "")),
                    table_prompt=str(eq.get("image_prompt") or ""),
                )
            )
    if len(jobs) != len(by_gear_id):
        raise RuntimeError(f"任务数 {len(jobs)} ≠ gearItems {len(by_gear_id)}")
    return jobs


def write_manifest(jobs: list[GearIconJob], staging: Path) -> tuple[Path, Path]:
    staging.mkdir(parents=True, exist_ok=True)
    lines = ["index\tgearId\tdungeon\tnameCn\tslotKind\ticonPath\n"]
    rows_json = []
    for j in jobs:
        rel = f"icons/{j.gear_id}.png"
        lines.append(f"{j.index}\t{j.gear_id}\t{j.dungeon_name_cn}\t{j.name_cn}\t{j.slot_kind}\t{rel}\n")
        rows_json.append(
            {
                "index": j.index,
                "gearId": j.gear_id,
                "dungeonId": j.dungeon_id,
                "dungeonNameCn": j.dungeon_name_cn,
                "nameCn": j.name_cn,
                "slotKind": j.slot_kind,
                "iconRelPath": rel,
            }
        )
    tsv = staging / "manifest.tsv"
    fullj = staging / "manifest.json"
    tsv.write_text("".join(lines), encoding="utf-8")
    fullj.write_text(
        json.dumps({"jobs": rows_json}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return tsv, fullj


def icon_ready(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 256


@dataclass
class GearIconImportResult:
    copied: int
    missing: int
    dest_dir: Path
    manifest_rebuilt: bool
    manifest_error: str | None


def import_gear_icons_to_project(
    staging: Path,
    *,
    rebuild_asset_manifest: bool = True,
) -> GearIconImportResult:
    """将 staging/icons/<gearId>.png 复制到 public/assets/gear/，始终覆盖。按 gearItems 清单遍历。"""
    icons_dir = staging / "icons"
    if not icons_dir.is_dir():
        raise FileNotFoundError(f"未找到裁切目录：{icons_dir}")

    dest_dir = GEAR_ICON_PUBLISH_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    copied = 0
    missing = 0
    for job in load_gear_icon_jobs():
        src = icons_dir / f"{job.gear_id}.png"
        dst = dest_dir / f"{job.gear_id}.png"
        if not icon_ready(src):
            missing += 1
            continue
        shutil.copy2(src, dst)
        copied += 1

    manifest_rebuilt = False
    manifest_error: str | None = None
    if rebuild_asset_manifest and copied > 0:
        script = ROOT / "scripts" / "build-asset-manifest.mjs"
        try:
            subprocess.run(
                ["node", str(script)],
                cwd=str(ROOT),
                check=True,
                capture_output=True,
                text=True,
            )
            manifest_rebuilt = True
        except (OSError, subprocess.CalledProcessError) as e:
            manifest_error = str(e)

    return GearIconImportResult(
        copied=copied,
        missing=missing,
        dest_dir=dest_dir,
        manifest_rebuilt=manifest_rebuilt,
        manifest_error=manifest_error,
    )


def process_icon_png(src: Path, dst: Path, size: int) -> None:
    try:
        from PIL import Image
    except ImportError as e:
        raise RuntimeError("裁切需要 Pillow：pip install pillow") from e

    im = Image.open(src).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
    im = im.resize((size, size), resample)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "PNG")
