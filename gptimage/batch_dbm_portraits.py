#!/usr/bin/env python3
"""
批量 5 职业胸像：调用同目录 image2_generate.py（gpt-image-2，1024x1024）。

输出（仅此目录，不会动游戏工程）：
  ./out_dbm/<warrior|mage|hunter|priest|paladin>.png
  ./out_dbm/circle/<stem>_circle_<N>.png（Pillow 裁圆，默认 N=256）

不会自动写入 `public/`、`src/` 或任何游戏内资源路径；进游戏需你手动拷贝或走单独的发布/处理脚本。

断点续跑（默认，与 batch_enemy_portraits 等一致）：
  - 方图已存在 → 不调文生图（除非 `--force`）。
  - 圆图已存在 → 不重复裁切（除非 `--force-circle`）。

可选把中转参数原样传给 image2_generate.py：
  python batch_dbm_portraits.py --base-url https://xxx/v1 --resource images/generations
"""

from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import time
from pathlib import Path

IMAGE2 = Path(__file__).resolve().parent / "image2_generate.py"
CIRCLE = Path(__file__).resolve().parent / "circle_avatar.py"
OUTDIR = Path(__file__).resolve().parent / "out_dbm"

DEFAULT_MAX_ATTEMPTS = 3
RETRY_SLEEP_SEC = 1.5
DEFAULT_CIRCLE_SIZE = 256

_GPTIMG = Path(__file__).resolve().parent
if str(_GPTIMG) not in sys.path:
    sys.path.insert(0, str(_GPTIMG))
from dont_starve_style import STYLE_CORE

NEG = (
    "circular badge overlay, round avatar frame, hard circular vignette, fisheye circle, "
    "UI, watermark, text, logo, duplicate faces, deformed hands, low resolution, "
    "busy sharp background, readable dungeon environment, photoreal skin, anime glossy highlights"
)

JOBS: list[tuple[str, str]] = [
    (
        "warrior",
        "Square 1:1 bust portrait, rectangular framing, face and eyes at geometric center. "
        "NO circular badge, NO round frame, NO hard circular vignette. "
        f"{STYLE_CORE} "
        "Human fantasy warrior in heavy plate armor (original design), slightly awkward heroic silhouette. "
        "~45° three-quarter view. Stern focused expression, no smile, inked brows. "
        "Greatsword rested on shoulder, blade diagonal, crossguard readable as bold ink shapes. "
        "Heavily blurred bokeh background dominated by warrior class tan #C69B6D, low saturation, "
        "slightly darker brown edge falloff. Side key + rim as simple ink edge, not soft bloom. "
        "Readable at small size; rough paper-game illustration feel.",
    ),
    (
        "mage",
        "Square 1:1 bust portrait, face centered, no circular badge mask. "
        f"{STYLE_CORE} "
        "Human mage in fantasy cloth robes (original design), slightly gaunt stylized face. "
        "~45° three-quarter view, intense calm eyes with ink outlines. "
        "Staff top or arcane focus held near shoulder, silhouette readable as cut-paper shapes. "
        "Heavily blurred bokeh dominated by mage class cyan #3FC7EB, deeper desaturated teal toward edges, "
        "not neon cyberpunk. Tiny arcane sparks as sparse ink ticks near hands, restrained. "
        "Cross-hatched or flat shadow blocks, no glossy gradients.",
    ),
    (
        "hunter",
        "Square 1:1 bust portrait, face centered, no round frame. "
        f"{STYLE_CORE} "
        "Human hunter in leather and light gear (original design). ~45° three-quarter view, alert narrow eyes. "
        "Bow stave or crossbow top visible near shoulder with clear readable silhouette, class identity clear. "
        "Steady calm expression. Blurred bokeh background dominated by hunter class green #ABD473, "
        "darker muted olive at edges. Natural side key + rim as ink edges, not beauty lighting. "
        "Slightly scruffy ink texture, survival-sketch mood.",
    ),
    (
        "priest",
        "Square 1:1 bust portrait, face centered, no circular badge. "
        f"{STYLE_CORE} "
        "Human priest in cloth vestments (original design), not plate armor. "
        "~45° three-quarter view, serene compassionate restrained expression, soft ink smile line optional. "
        "Optional small tome or staff top; holy shimmer as faint cross-hatched white strokes, not overwhelming glow. "
        "Heavily blurred bokeh centered on priest white #FFFFFF, fade to very pale cool gray or "
        "pale lavender-gray at edges for depth (still reads as priest white family), avoid flat empty white. "
        "Gentle ink shadows only, no soft airbrush porcelain skin.",
    ),
    (
        "paladin",
        "Square 1:1 bust portrait, face centered, no hard circular vignette. "
        f"{STYLE_CORE} "
        "Human paladin in fantasy plate armor (original design), subtle clean cross or holy sigil geometry "
        "as small ink accents, NO huge golden holy explosion. ~45° three-quarter view, righteous calm composed expression, "
        "no smug smirk. Optional two-handed hammer or sword on shoulder, readable metal as hatched gray shapes. "
        "Blurred bokeh dominated by paladin class pink #F58CBA, slightly deeper rose/mauve toward edges, desaturated. "
        "Side key + mild rim as ink edges; holy light only as faint tick marks, "
        "must not overpower the pink class background.",
    ),
]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Batch DBM-hue class portraits via image2_generate.py + circular export")
    p.add_argument(
        "--skip-generate",
        action="store_true",
        help="跳过文生图，只对已有方图做圆形导出",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="方图已存在时仍重新调文生图覆盖",
    )
    p.add_argument(
        "--force-circle",
        action="store_true",
        help="圆图已存在时仍重新裁切覆盖",
    )
    p.add_argument(
        "--base-url",
        default=None,
        help="转发给 image2_generate.py（默认用其中转默认值）",
    )
    p.add_argument(
        "--resource",
        default=None,
        help="转发给 image2_generate.py，如 images/generations",
    )
    p.add_argument(
        "--key-file",
        type=Path,
        default=None,
        help="转发给 image2_generate.py",
    )
    p.add_argument(
        "--model",
        default="gpt-image-2",
        help="转发给 image2_generate.py",
    )
    p.add_argument("--size", default="1024x1024", help="转发给 image2_generate.py")
    p.add_argument(
        "--circle-size",
        type=int,
        default=DEFAULT_CIRCLE_SIZE,
        help=f"圆形输出直径像素（默认 {DEFAULT_CIRCLE_SIZE}）",
    )
    p.add_argument(
        "--max-attempts",
        type=int,
        default=DEFAULT_MAX_ATTEMPTS,
        metavar="N",
        help=f"文生图 / 裁圆失败时的重试次数（默认 {DEFAULT_MAX_ATTEMPTS}）",
    )
    p.add_argument(
        "--outdir",
        type=Path,
        default=OUTDIR,
        help=f"输出目录（默认 {OUTDIR}）",
    )
    return p


def _load_circle_avatar_module():
    spec = importlib.util.spec_from_file_location("circle_avatar_batch_dbm", CIRCLE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {CIRCLE}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def write_circle_png(square: Path, out_png: Path, circle_size: int) -> int:
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


def write_circle_with_retries(
    square: Path,
    circle_png: Path,
    circle_size: int,
    stem: str,
    *,
    max_attempts: int,
) -> bool:
    for attempt in range(1, max_attempts + 1):
        print(f"=== circle {stem} attempt {attempt}/{max_attempts} -> {circle_png}", flush=True)
        rc = write_circle_png(square, circle_png, circle_size)
        if rc == 0 and circle_png.is_file():
            print("Wrote", circle_png.resolve(), flush=True)
            return True
        print(
            f"circle failed: {stem} exit={rc} attempt={attempt}/{max_attempts}",
            file=sys.stderr,
        )
        if attempt < max_attempts:
            time.sleep(RETRY_SLEEP_SEC)
    return False


def main() -> int:
    args = build_parser().parse_args()
    if args.max_attempts < 1:
        print("--max-attempts must be >= 1", file=sys.stderr)
        return 2
    if args.circle_size < 8 or args.circle_size > 8192:
        print("--circle-size 应在合理范围", file=sys.stderr)
        return 2
    if not IMAGE2.is_file():
        print("Missing:", IMAGE2, file=sys.stderr)
        return 2
    if not CIRCLE.is_file():
        print("Missing:", CIRCLE, file=sys.stderr)
        return 2

    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    circle_root = outdir / "circle"
    circle_root.mkdir(parents=True, exist_ok=True)

    py = sys.executable
    skipped_generate_reuse = 0
    skipped_circle_reuse = 0
    missing_square_skip = 0
    skipped_after_failed_generate = 0
    skipped_after_failed_circle = 0

    for stem, body in JOBS:
        prompt = f"{body} Avoid: {NEG}"
        square = outdir / f"{stem}.png"
        circle_png = circle_root / f"{stem}_circle_{args.circle_size}.png"

        if args.skip_generate:
            if not square.is_file():
                print(
                    "=== skip (--skip-generate, no square):",
                    stem,
                    "(expected",
                    square,
                    ")",
                    flush=True,
                )
                missing_square_skip += 1
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
                    skipped_after_failed_generate += 1
                    continue
            else:
                print(
                    "=== skip generate (square exists, delete or use --force to redo):",
                    stem,
                    "->",
                    square,
                    flush=True,
                )
                skipped_generate_reuse += 1

        if not square.is_file():
            print("Missing square image after step:", square, file=sys.stderr)
            return 1

        need_circle = bool(args.force_circle or not circle_png.is_file())
        if not need_circle:
            print(
                "=== skip circle (exists, delete or use --force-circle to redo):",
                stem,
                "->",
                circle_png,
                flush=True,
            )
            skipped_circle_reuse += 1
            continue

        if not write_circle_with_retries(
            square,
            circle_png,
            args.circle_size,
            stem,
            max_attempts=args.max_attempts,
        ):
            print("=== skip (circle failed after retries):", stem, flush=True)
            skipped_after_failed_circle += 1
            continue

    print("Done. Squares in", outdir, "| circles in", circle_root)
    print("(Not written to game public/; copy manually or use a separate publish pipeline.)")
    if (
        skipped_generate_reuse
        or skipped_circle_reuse
        or missing_square_skip
        or skipped_after_failed_generate
        or skipped_after_failed_circle
    ):
        print(
            "Summary: skip_generate_reuse_square=",
            skipped_generate_reuse,
            " skip_circle_reuse=",
            skipped_circle_reuse,
            " skip_missing_square=",
            missing_square_skip,
            " skip_after_failed_generate=",
            skipped_after_failed_generate,
            " skip_after_failed_circle=",
            skipped_after_failed_circle,
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
