#!/usr/bin/env python3
"""
批量职业胸像（DBM 职业色虚化背景 + 饥荒式线稿风）：经 `batch_image2_api` 调用 `gptimage/image2_generate`（gpt-image-2，1024x1024）。

首批 5 职业（与 WoW 原版职业色对齐）：warrior / mage / hunter(游戏射手) / priest / paladin(游戏骑士)
扩展 4 职业（死亡矿井后解锁，占位胸像）：warlock / shaman / assassin(盗贼样貌) / druid(魔兽争霸利爪德鲁伊人形态熊脸)
德鲁伊变体：`druid_bear` 为熊形态战斗代币专用立绘（与 `druid` 人形态分支并存；游戏内 `allyPortraitVariants` + `public/portraits/ally/druid_bear.png`）

DBM 职业色参考（Deadly Boss Mods / WoW 职业色，用于 bokeh 背景）：
  warrior #C69B6D | mage #3FC7EB | hunter #ABD473 | priest #FFFFFF | paladin #F58CBA
  warlock #8787ED | shaman #0070DE | rogue(assassin) #FFF569 | druid #FF7D0A

输出（仅此目录，不会动游戏工程）：
  ./out_dbm/<stem>.png
  ./out_dbm/circle/<stem>_circle_<N>.png（Pillow 裁圆，默认 N=256）

不会自动写入 `public/`、`src/` 或任何游戏内资源路径；进游戏需你手动拷贝或走单独的发布/处理脚本。

断点续跑（默认，与 batch_enemy_portraits 等一致）：
  - 方图已存在 → 不调文生图（除非 `--force`）。
  - 圆图已存在 → 不重复裁切（除非 `--force-circle`）。

可选中转参数（与 gptimage/image2_generate 一致）：
  python batch_dbm_portraits.py --base-url https://xxx/v1 --resource images/generations
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
import time
from pathlib import Path

CIRCLE = Path(__file__).resolve().parent / "circle_avatar.py"
OUTDIR = Path(__file__).resolve().parent / "out_dbm"

DEFAULT_MAX_ATTEMPTS = 3
RETRY_SLEEP_SEC = 1.5
DEFAULT_CIRCLE_SIZE = 256

_GPTIMG = Path(__file__).resolve().parent
if str(_GPTIMG) not in sys.path:
    sys.path.insert(0, str(_GPTIMG))
from batch_image2_api import generate_square_with_retries
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
    (
        "warlock",
        "Square 1:1 bust portrait, face centered, no circular badge mask. "
        f"{STYLE_CORE} "
        "Human warlock in dark flowing robes (original design), slightly gaunt stylized face. "
        "~45° three-quarter view, intense guarded eyes with ink outlines, faint fel-green under-eye shadow "
        "as sparse ink ticks only, no green fire explosion. "
        "Fel focus or staff top near shoulder, silhouette readable as cut-paper shapes. "
        "Heavily blurred bokeh dominated by warlock class purple #8787ED, deeper desaturated violet toward edges, "
        "not neon cyberpunk. Cross-hatched shadow blocks, no glossy gradients.",
    ),
    (
        "shaman",
        "Square 1:1 bust portrait, face centered, no round frame. "
        f"{STYLE_CORE} "
        "Orc or troll shaman in tribal robes and fur shoulder trim (original fantasy design). "
        "~45° three-quarter view, weathered stern expression, inked brows. "
        "Totem staff top or lightning crackle motif near shoulder as bold ink shapes, restrained sparks. "
        "Heavily blurred bokeh dominated by shaman class blue #0070DE, deeper indigo-navy toward edges, "
        "low saturation. Side key + rim as simple ink edge, readable at small size.",
    ),
    (
        "assassin",
        "Square 1:1 bust portrait, face centered, no round frame. "
        f"{STYLE_CORE} "
        "Human or elf ROGUE appearance: dark leather armor, hood optional pushed back so face is fully visible. "
        "~45° three-quarter view, sharp alert narrow eyes, subtle confident ink smirk optional. "
        "Dual daggers or one dagger at shoulder, bandolier and leather straps as readable ink silhouettes, "
        "class reads as World of Warcraft rogue/thief not plate warrior. "
        "Blurred bokeh dominated by rogue class yellow #FFF569, darker muted gold-olive at edges. "
        "Natural side key + rim as ink edges, slightly scruffy survival-sketch mood.",
    ),
    (
        "druid",
        "Square 1:1 bust portrait, face and eyes at geometric center, no circular badge. "
        f"{STYLE_CORE} "
        "Humanoid druid in leather and fur-trim gear (original design), Warcraft III Claw Druid HUMANOID form: "
        "bear-like face on humanoid body — broad rounded bear snout, bear muzzle, small bear ears, strong jaw, "
        "fierce calm eyes; optional short antlers as ink accents. "
        "NOT full bear beast form, NOT quadruped, NOT furry monster body, must read as bipedal druid with bear face. "
        "~45° three-quarter view. Nature staff or clawed glove near shoulder as cut-paper shapes. "
        "Heavily blurred bokeh dominated by druid class orange #FF7D0A, deeper burnt sienna toward edges, "
        "desaturated. Readable at small size; rough paper-game illustration feel.",
    ),
    (
        "druid_bear",
        "Square 1:1 bust portrait, face centered, no circular badge. "
        f"{STYLE_CORE} "
        "BEAR FORM druid: grizzly bear head and shoulders filling the frame, thick fur as ink cross-hatch, "
        "fierce forward eyes, snout suggested with bold ink shapes not photoreal fur. "
        "NO human face, NO bipedal elf — reads as beast bear avatar for druid bear combat form. "
        "~45° three-quarter view. "
        "Heavily blurred bokeh dominated by druid class orange #FF7D0A, burnt sienna edges. "
        "Readable at small token size; branch asset paired with `druid` in game.",
    ),
]

JOB_STEMS = [stem for stem, _ in JOBS]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Batch DBM-hue class portraits via tools/image2_generate + circular export",
    )
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
        help="转发给 tools/image2_generate（默认用其中转默认值）",
    )
    p.add_argument(
        "--resource",
        default=None,
        help="转发给 tools/image2_generate，如 images/generations",
    )
    p.add_argument(
        "--key-file",
        type=Path,
        default=None,
        help="转发给 tools/image2_generate",
    )
    p.add_argument(
        "--model",
        default="gpt-image-2",
        help="转发给 tools/image2_generate",
    )
    p.add_argument("--size", default="1024x1024", help="转发给 tools/image2_generate")
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
    p.add_argument(
        "--only",
        choices=JOB_STEMS,
        nargs="+",
        help="只跑指定 stem（可多个），如 --only warlock druid assassin shaman",
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
    if not CIRCLE.is_file():
        print("Missing:", CIRCLE, file=sys.stderr)
        return 2

    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    circle_root = outdir / "circle"
    circle_root.mkdir(parents=True, exist_ok=True)

    skipped_generate_reuse = 0
    skipped_circle_reuse = 0
    missing_square_skip = 0
    skipped_after_failed_generate = 0
    skipped_after_failed_circle = 0

    only_set = set(args.only) if args.only else None
    jobs = [(s, b) for s, b in JOBS if only_set is None or s in only_set]
    if only_set:
        unknown = only_set - {s for s, _ in jobs}
        if unknown:
            print("Unknown --only stems:", ", ".join(sorted(unknown)), file=sys.stderr)
            return 2

    for stem, body in jobs:
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
                if not generate_square_with_retries(
                    prompt,
                    square,
                    stem,
                    model=args.model,
                    size=args.size,
                    base_url=args.base_url,
                    resource=args.resource,
                    key_file=args.key_file,
                    max_attempts=args.max_attempts,
                    retry_sleep_sec=RETRY_SLEEP_SEC,
                ):
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
