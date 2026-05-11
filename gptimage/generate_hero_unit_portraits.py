#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英雄单位半身像：流程对齐 **`batch_enemy_portraits.py`**（先方图 → 再裁圆），**只写入 `gptimage/`**，不进入游戏。

提示词以 **`batch_dbm_portraits.py`** 的 5 职业胸像为基底（DBM 色相虚化背景、饥荒式手绘线稿风、禁止圆形徽章等），
再叠「性别 + 高颜值种族」轮换；游戏侧映射：**archer = 猎人底稿**，**knight = 圣骑士底稿**（文件名用 archer_* / knight_*）。

输出：
  - 方图：`gptimage/out_heroes_square/<id>.png`
  - 圆图：`gptimage/out_heroes_circle/<id>.png`（`circle_avatar.py` 裁切，默认直径 512）

依赖：`gptimage/image2_generate.py`、`gptimage/secrets_openai.txt`（或 `--key-file`）、`pip install pillow`

用法（仓库根 HeyBro）：
  python gptimage/generate_hero_unit_portraits.py
  python gptimage/generate_hero_unit_portraits.py --only warrior
  python gptimage/generate_hero_unit_portraits.py --skip-generate
  python gptimage/generate_hero_unit_portraits.py --force
  python gptimage/generate_hero_unit_portraits.py --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
IMAGE2 = SCRIPT_DIR / "image2_generate.py"
CIRCLE = SCRIPT_DIR / "circle_avatar.py"
OUT_SQUARE = ROOT / "gptimage" / "out_heroes_square"
OUT_CIRCLE = ROOT / "gptimage" / "out_heroes_circle"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from dont_starve_style import STYLE_CORE

DEFAULT_MAX_ATTEMPTS = 3
RETRY_SLEEP_SEC = 1.5

# 与 batch_enemy_portraits 对齐的否定项（饥荒风仍排除照片与油光赛璐璐）
COMMON_NEG = (
    "circular badge overlay, round avatar frame, hard circular vignette, fisheye circle, "
    "UI, watermark, text, logo, readable letters, duplicate faces, deformed anatomy, "
    "photorealistic, hyperrealistic, cinematic realism, DSLR, documentary photo, "
    "8k ultra-detailed skin, skin pores, micro-wrinkles, subsurface scattering realism, "
    "Octane ultra-realistic 3D render, uncanny valley, glossy anime cel, soft airbrush beauty, "
    "low resolution, busy sharp readable environment, gore"
)

# 与 batch_dbm_portraits / dont_starve_style 同源（__SUBJECT__ = 性别+种族行）
_DBM_WARRIOR = (
    "Square 1:1 bust portrait, rectangular framing, face and eyes at geometric center. "
    "NO circular badge, NO round frame, NO hard circular vignette. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy warrior in heavy plate armor (original design), slightly awkward heroic silhouette. "
    "~45° three-quarter view. Stern focused expression, no smile, inked brows. "
    "Greatsword rested on shoulder, blade diagonal, crossguard readable as bold ink shapes. "
    "Heavily blurred bokeh background dominated by warrior class tan #C69B6D, low saturation, "
    "slightly darker brown edge falloff. Side key + rim as simple ink edge, not soft bloom. "
    "Readable at small size; rough paper-game illustration feel."
)

_DBM_MAGE = (
    "Square 1:1 bust portrait, face centered, no circular badge mask. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy mage in cloth robes (original design), slightly gaunt stylized face. "
    "~45° three-quarter view, intense calm eyes with ink outlines. "
    "Staff top or arcane focus held near shoulder, silhouette readable as cut-paper shapes. "
    "Heavily blurred bokeh dominated by mage class cyan #3FC7EB, deeper desaturated teal toward edges, "
    "not neon cyberpunk. Tiny arcane sparks as sparse ink ticks near hands, restrained. "
    "Cross-hatched or flat shadow blocks, no glossy gradients."
)

_DBM_HUNTER = (
    "Square 1:1 bust portrait, face centered, no round frame. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy hunter in leather and light gear (original design). ~45° three-quarter view, alert narrow eyes. "
    "Bow stave or crossbow top visible near shoulder with clear readable silhouette, class identity clear. "
    "Steady calm expression. Blurred bokeh background dominated by hunter class green #ABD473, "
    "darker muted olive at edges. Natural side key + rim as ink edges, not beauty lighting. "
    "Slightly scruffy ink texture, survival-sketch mood."
)

_DBM_PRIEST = (
    "Square 1:1 bust portrait, face centered, no circular badge. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy priest in cloth vestments (original design), not plate armor. "
    "~45° three-quarter view, serene compassionate restrained expression, soft ink smile line optional. "
    "Optional small tome or staff top; holy shimmer as faint cross-hatched white strokes, not overwhelming glow. "
    "Heavily blurred bokeh centered on priest white #FFFFFF, fade to very pale cool gray or "
    "pale lavender-gray at edges for depth (still reads as priest white family), avoid flat empty white. "
    "Gentle ink shadows only, no soft airbrush porcelain skin."
)

_DBM_PALADIN = (
    "Square 1:1 bust portrait, face centered, no hard circular vignette. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy paladin in plate armor (original design), subtle clean cross or holy sigil geometry "
    "as small ink accents, NO huge golden holy explosion. ~45° three-quarter view, righteous calm composed expression, "
    "no smug smirk. Optional two-handed hammer or sword on shoulder, readable metal as hatched gray shapes. "
    "Prefer a mounted-on-warhorse composition within the square bust frame: paladin upper body together with "
    "horse head, neck, or shoulders, heroic charging or rearing, still readable at thumbnail size; horse also ink-styled. "
    "Blurred bokeh dominated by paladin class pink #F58CBA, slightly deeper rose/mauve toward edges, desaturated. "
    "Side key + mild rim as ink edges; holy light only as faint tick marks, "
    "must not overpower the pink class background."
)

# (游戏文件名前缀, DBM 模板 key)
_CLASS_ORDER: list[tuple[str, str]] = [
    ("warrior", "warrior"),
    ("archer", "hunter"),
    ("priest", "priest"),
    ("mage", "mage"),
    ("knight", "paladin"),
]

_DBM_BODY: dict[str, str] = {
    "warrior": _DBM_WARRIOR,
    "mage": _DBM_MAGE,
    "hunter": _DBM_HUNTER,
    "priest": _DBM_PRIEST,
    "paladin": _DBM_PALADIN,
}

# 5 套：性别 + 种族（高颜值奇幻）
VARIANTS: list[tuple[str, str]] = [
    ("female", "human — elegant noble features, varied skin tone"),
    ("male", "blood elf — sharp features, subtle fel-green eyes optional"),
    ("female", "night elf — purple-blue skin, long ears, silver hair"),
    ("male", "draenei — blue skin, forehead tendrils, glowing eyes, bust only"),
    ("female", "void elf — pale skin, subtle void purple in hair, confident gaze"),
]


def subject_line(gender: str, race_desc: str) -> str:
    return f"{gender.capitalize()} hero ({race_desc})"


def build_prompt_body(class_key: str, gender: str, race_desc: str) -> str:
    sub = subject_line(gender, race_desc)
    raw = _DBM_BODY[class_key]
    return raw.replace("__SUBJECT__", sub)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Hero bust portraits (Don't Starve style, shared STYLE_CORE) → square + circle under gptimage/ only.",
    )
    p.add_argument(
        "--only",
        choices=[c[0] for c in _CLASS_ORDER],
        help="只跑某一职业前缀（warrior/mage/priest/archer/knight）",
    )
    p.add_argument("--skip-generate", action="store_true", help="跳过文生图，只对已有方图裁圆写入 out_heroes_circle")
    p.add_argument("--force", action="store_true", help="方图存在也重调接口；圆图也会覆盖")
    p.add_argument("--dry-run", action="store_true", help="只列出将处理的任务")
    p.add_argument("--base-url", default=None)
    p.add_argument("--resource", default=None)
    p.add_argument("--key-file", type=Path, default=None)
    p.add_argument("--model", default="gpt-image-2")
    p.add_argument("--size", default="1024x1024")
    p.add_argument("--circle-size", type=int, default=512, help="圆形输出直径像素")
    p.add_argument(
        "--max-attempts",
        type=int,
        default=DEFAULT_MAX_ATTEMPTS,
        metavar="N",
        help=f"文生图 / 裁圆失败重试次数（默认 {DEFAULT_MAX_ATTEMPTS}）",
    )
    return p


def _load_circle_avatar_module():
    spec = importlib.util.spec_from_file_location("circle_avatar_heroes", CIRCLE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {CIRCLE}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def write_circle_staging(square: Path, out_png: Path, circle_size: int) -> int:
    try:
        mod = _load_circle_avatar_module()
        circ = mod.circle_rgba_from_path(square.resolve(), circle_size)
        out_png.parent.mkdir(parents=True, exist_ok=True)
        circ.save(out_png.resolve(), "PNG")
        return 0
    except Exception as e:
        print("circle_avatar failed:", e, file=sys.stderr)
        return 1


def run_generate_with_retries(
    cmd: list[str],
    square: Path,
    stem: str,
    *,
    max_attempts: int,
) -> bool:
    for attempt in range(1, max_attempts + 1):
        print(f"=== generate {stem} attempt {attempt}/{max_attempts} -> {square}", flush=True)
        r = subprocess.run(cmd, check=False)
        if r.returncode == 0 and square.is_file():
            return True
        print(
            f"generate failed: {stem} exit={r.returncode} attempt={attempt}/{max_attempts}",
            file=sys.stderr,
        )
        if attempt < max_attempts:
            time.sleep(RETRY_SLEEP_SEC)
    return False


def write_circle_staging_with_retries(
    square: Path,
    staging_png: Path,
    circle_size: int,
    stem: str,
    *,
    max_attempts: int,
) -> bool:
    for attempt in range(1, max_attempts + 1):
        print(f"=== circle {stem} attempt {attempt}/{max_attempts} -> {staging_png}", flush=True)
        rc = write_circle_staging(square, staging_png, circle_size)
        if rc == 0 and staging_png.is_file():
            print("Wrote", staging_png.resolve(), flush=True)
            return True
        print(
            f"circle failed: {stem} exit={rc} attempt={attempt}/{max_attempts}",
            file=sys.stderr,
        )
        if attempt < max_attempts:
            time.sleep(RETRY_SLEEP_SEC)
    return False


def iter_jobs(only: str | None) -> list[tuple[str, str, str, str, str]]:
    """stem, file_class, dbm_key, gender, race"""
    out: list[tuple[str, str, str, str, str]] = []
    for file_class, dbm_key in _CLASS_ORDER:
        if only and only != file_class:
            continue
        for i, (gender, race_desc) in enumerate(VARIANTS, start=1):
            stem = f"{file_class}_{i:02d}"
            out.append((stem, file_class, dbm_key, gender, race_desc))
    return out


def main() -> int:
    args = build_parser().parse_args()
    if args.max_attempts < 1:
        print("--max-attempts must be >= 1", file=sys.stderr)
        return 2
    if not IMAGE2.is_file():
        print("Missing:", IMAGE2, file=sys.stderr)
        return 2
    if not CIRCLE.is_file():
        print("Missing:", CIRCLE, file=sys.stderr)
        return 2

    jobs = iter_jobs(args.only)
    print(f"共 {len(jobs)} 张。方图: {OUT_SQUARE}  圆图: {OUT_CIRCLE}", flush=True)

    if args.dry_run:
        for stem, *_ in jobs:
            print("[dry-run]", stem, flush=True)
        print("Dry-run 结束。")
        return 0

    OUT_SQUARE.mkdir(parents=True, exist_ok=True)
    OUT_CIRCLE.mkdir(parents=True, exist_ok=True)

    py = sys.executable
    skipped_square_reuse = 0
    missing_square = 0
    skip_failed_gen = 0
    skip_failed_circle = 0

    for stem, _fc, dbm_key, gender, race_desc in jobs:
        body = build_prompt_body(dbm_key, gender, race_desc)
        prompt = f"{body} Avoid: {COMMON_NEG}"
        square = OUT_SQUARE / f"{stem}.png"
        circle_png = OUT_CIRCLE / f"{stem}.png"

        if args.skip_generate:
            if not square.is_file():
                print("=== skip (--skip-generate, no square):", stem, square, flush=True)
                missing_square += 1
                continue
        else:
            need_api = bool(args.force or not square.is_file())
            if need_api:
                cmd: list[str] = [
                    py,
                    str(IMAGE2),
                    "--model",
                    args.model,
                    "--size",
                    args.size,
                    "--out",
                    str(square),
                    "--prompt",
                    prompt,
                ]
                if args.base_url:
                    cmd += ["--base-url", args.base_url]
                if args.resource:
                    cmd += ["--resource", args.resource]
                if args.key_file:
                    cmd += ["--key-file", str(Path(args.key_file).expanduser())]

                if not run_generate_with_retries(cmd, square, stem, max_attempts=args.max_attempts):
                    print("=== skip (generate failed after retries):", stem, flush=True)
                    skip_failed_gen += 1
                    continue
            else:
                print("=== skip generate (square exists, use --force to redo):", stem, square, flush=True)
                skipped_square_reuse += 1

        if not square.is_file():
            print("Missing square:", square, file=sys.stderr)
            return 1

        if not write_circle_staging_with_retries(
            square,
            circle_png,
            args.circle_size,
            stem,
            max_attempts=args.max_attempts,
        ):
            print("=== skip (circle failed after retries):", stem, flush=True)
            skip_failed_circle += 1
            continue

    print("Done. Square:", OUT_SQUARE, " Circle:", OUT_CIRCLE)
    if skipped_square_reuse or missing_square or skip_failed_gen or skip_failed_circle:
        print(
            "Summary: skip_square_reuse=",
            skipped_square_reuse,
            " skip_missing_square=",
            missing_square,
            " skip_failed_generate=",
            skip_failed_gen,
            " skip_failed_circle=",
            skip_failed_circle,
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
