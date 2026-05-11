#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量敌方兵种 / 首领半身像：只写入 **`gptimage/`** 下目录供你校验，**不**写入 `public/assets/enemies/`。

画风与 **`dont_starve_style.py` / `batch_dbm_portraits.py`** 一致：饥荒式手绘线稿、低饱和、非照片。

- 方图：`gptimage/out_enemies_square/<id>.png`（大模型）
- 圆图：`gptimage/out_enemies_circle/<id>.png`（Pillow 裁切）

校验满意后，用 **`python gptimage/publish_enemy_portraits_to_game.py`** 复制到游戏目录（默认覆盖已存在文件；**`--skip-existing`** 可跳过）。

- 普通兵：背景统一为「冷灰」虚化 bokeh（#94a3a8 / slate 系）。
- 首领（boss_*）：背景统一为「暗红」虚化 bokeh（#450a0a / #7f1d1d 系）。

用法（需在 gptimage/secrets_openai.txt 或环境变量中配置 Key）：
  cd HeyBro
  python gptimage/batch_enemy_portraits.py

可选：
  python gptimage/batch_enemy_portraits.py --skip-generate   # 仅对已存在的方图做圆形导出到 out_enemies_circle
  python gptimage/batch_enemy_portraits.py --base-url https://xxx/v1
  python gptimage/batch_enemy_portraits.py --force          # 方图在也重调接口；圆图在 staging 目录也会覆盖

断点续跑（默认）：
  - **`gptimage/out_enemies_square/<id>.png` 没有** → 调大模型生成方图（有方图且未 `--force` 则跳过接口）。
  - **裁圆**：只要有方图就裁，**写入** `gptimage/out_enemies_circle/<id>.png`（已存在则覆盖，便于反复看效果）。
  - 文生图或裁圆单次失败会自动重试，默认最多 **3** 次，仍失败则跳过该 id（可用 **`--max-attempts N`** 调整）。
"""

from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGE2 = Path(__file__).resolve().parent / "image2_generate.py"
CIRCLE = Path(__file__).resolve().parent / "circle_avatar.py"
OUT_SQUARE = ROOT / "gptimage" / "out_enemies_square"
OUT_CIRCLE_STAGING = ROOT / "gptimage" / "out_enemies_circle"

_GPTIMG = Path(__file__).resolve().parent
if str(_GPTIMG) not in sys.path:
    sys.path.insert(0, str(_GPTIMG))
from dont_starve_style import STYLE_CORE

DEFAULT_MAX_ATTEMPTS = 3
RETRY_SLEEP_SEC = 1.5

COMMON_NEG = (
    "circular badge overlay, round avatar frame, hard circular vignette, fisheye circle, "
    "UI, watermark, text, logo, readable letters, duplicate faces, deformed anatomy, "
    "photorealistic, hyperrealistic, cinematic realism, DSLR, documentary photo, "
    "8k ultra-detailed skin, skin pores, micro-wrinkles, subsurface scattering realism, "
    "Octane ultra-realistic 3D render, uncanny valley, glossy anime cel, soft airbrush beauty, "
    "low resolution, busy sharp readable environment, gore, "
    "identical generic green-gray orc skin reused from other portraits in this batch"
)

# 小兵：统一灰底（虚化方式与 out_dbm 盟友批次一致：重虚化、低饱和）
BG_MINION = (
    "Heavily blurred bokeh background dominated by unified cool neutral gray (#94a3a8, slate), "
    "low saturation, slightly darker charcoal #475569 at edges, no colored class glow."
)

# 首领：暗红底
BG_BOSS = (
    "Heavily blurred bokeh background dominated by unified dark crimson and burgundy "
    "(#450a0a, #7f1d1d), ominous low saturation, slightly blackened edges, no bright orange flames."
)

# 画风：与 batch_dbm_portraits / dont_starve_style 一致（饥荒式线稿、低饱和、非照片）
PREFIX = (
    "Square 1:1 bust portrait, rectangular framing, face and eyes near geometric center. "
    "NO circular badge mask, NO round UI frame, NO hard circular vignette. "
    "~45° three-quarter view for humanoids; slightly more frontal for beasts if clearer silhouette. "
    f"{STYLE_CORE} "
    "Bold readable shapes at thumbnail size; rim as ink edge ticks, not soft beauty bloom. "
    "IMPORTANT: each unit must read DISTINCT at thumbnail size — push ONE dominant skin hue OR one dominant weapon/metal "
    "accent color per id (flat or hatched fills), NOT the same olive-orc green for every portrait. "
)

# (file_stem, prompt_body, is_boss)  — stem 须与 EnemyPaintKind / assets/enemies/<stem>.png 一致
JOBS: list[tuple[str, str, bool]] = [
    (
        "grunt",
        PREFIX
        + "Brutish fantasy orc infantry bust. SKIN: desaturated olive-brown #5c6b4a (NOT default bright greens). "
        "WEAPON: heavy cleaver with warm rust iron head #92400e and dark walnut haft #3f2e1e, readable silhouette. "
        "Tusked jaw, heavy brow, worn leather pauldrons. Fierce glare. "
        + BG_MINION,
        False,
    ),
    (
        "wolf",
        PREFIX
        + "Fantasy worgen-like beast soldier bust. FUR: cool blue-violet gray base #6d5ebd with icy lavender highlights #c4b5fd on mane tips. "
        "CLAWS/trim: blue-steel #64748b (different from any bronze weapon on other ids). Lupine snout, pointed ears, tribal leather straps. "
        + BG_MINION,
        False,
    ),
    (
        "dread_warrior",
        PREFIX
        + "Undead heavy warrior bust. SKIN: pale blue-gray ash #94a3b8 with faint periwinkle shadows #818cf8. "
        "EYES: small cold cyan pinpoints #22d3ee (not green). ARMOR: brown rust chain #78716c, NO bright green anywhere. "
        "Hollow stern expression, torn tabard. "
        + BG_MINION,
        False,
    ),
    (
        "raider",
        PREFIX
        + "Fantasy wolf-rider raider bust (rider focus). SKIN: burnt terracotta #c2410c with warm peach highlights #fdba74. "
        "WEAPON: short curved scimitar with brass guard #ca8a04 blade silver #cbd5e1 (must differ from grunt axe rust). "
        "Fur collar, braided hair, wild alert eyes. "
        + BG_MINION,
        False,
    ),
    (
        "beserker",
        PREFIX
        + "Orc berserker bust. SKIN: deep crimson undertone #b91c1c with scar stripes in near-black #1c1917. "
        "WEAPONS: twin axes with bright chartreuse-yellow painted hafts #a3e635 and soot-black heads #0f172a — highly distinct from other weapon metals. "
        "Bare shoulders, roaring-tense jaw. "
        + BG_MINION,
        False,
    ),
    (
        "kodo",
        PREFIX
        + "Massive fantasy beast (kodo-like) bust. HIDE: golden mustard #d97706 with chocolate shadow plates #78350f. "
        "HORNS: pale bone #fef9c3 (warm, not steel-blue). Eyes small angry black-brown. Harness leather burnt orange #9a3412. "
        + BG_MINION,
        False,
    ),
    (
        "ultralisk",
        PREFIX
        + "Colossal alien armored beast bust. CHITIN: vivid royal violet #7c3aed with deep magenta recesses #86198f. "
        "Shoulder scythes read as black-violet #312e81 edges, NOT gray metal like grunt. Insectoid head, tiny glossy red eyes #ef4444. "
        + BG_MINION,
        False,
    ),
    (
        "abomination",
        PREFIX
        + "Undead abomination bust. FLESH: sick yellow-lime #a3e635 stitched into murky teal-green #14532d patches (NOT same as grunt olive). "
        "METAL: corroded copper hooks #b45309. EYES: toxic yellow #facc15. Crooked stitches, no gore. "
        + BG_MINION,
        False,
    ),
    (
        "headhunter",
        PREFIX
        + "Forest troll headhunter bust. SKIN: bright orange-amber #fb923c with cool crimson war paint #be123c. "
        "WEAPON: throwing glaive with turquoise enamel blade #06b6d4 and rattan brown grip #92400e — color jump vs teal darkspear. "
        "Tall ears, feather necklace, cunning eyes. "
        + BG_MINION,
        False,
    ),
    (
        "darkspear",
        PREFIX
        + "Tribal jungle hunter bust. SKIN: strong jade-teal #0f766e with lime-yellow accent dots #bef264 (NOT orange like headhunter). "
        "WEAPON: spear obsidian-black tip #0f172a with neon lime binding #84cc16 — must not reuse headhunter turquoise blade. "
        "Sharp tusks, sleek braids. "
        + BG_MINION,
        False,
    ),
    (
        "shaman",
        PREFIX
        + "Orc shaman bust. ROBES: saturated royal blue #2563eb with indigo shadows #1e3a8a. FACE PAINT: acid yellow-green #bef264 zigzags. "
        "FETISH ORBS: hot magenta #db2777 glow (distinct from wolf purple fur). Wooden mask edge #78350f. "
        + BG_MINION,
        False,
    ),
    (
        "batrider",
        PREFIX
        + "Small troll aerial raider bust. SKIN: golden ochre #facc15 with magenta war stripes #c026d3. "
        "PROPS: bright safety-orange fuse #ea580c and soot-black goggles #111827 — unique warm triad vs other units. "
        "Leather cap straps, mischievous eyes. "
        + BG_MINION,
        False,
    ),
    (
        "catapult",
        PREFIX
        + "Siege engineer bust (orc or grizzled goblin). SKIN: stone-gray green #57534e (ashy, NOT vibrant orc green). "
        "METAL: weathered pewter #94a3b8 on winch; rope natural hemp #d6d3d1; wooden beam tan #a16207 — industrial palette distinct from warriors. "
        "Determined squint, wood dust. "
        + BG_MINION,
        False,
    ),
    (
        "mirror",
        PREFIX
        + "Arcane mirror illusion bust. SKIN/TINT: pale lavender-gray #e9d5ff with iris-less soft violet eyes #a855f7. "
        "MAGIC EDGE: thin electric orchid outline #d946ef (no orange/red weapon colors). Subtle double-exposure hint, ethereal calm. "
        + BG_MINION,
        False,
    ),
    (
        "boss_farseer",
        PREFIX
        + "Legendary orc mystic chieftain bust. FUR TRIM: storm slate #475569 with SNOW white braids #f8fafc. "
        "LIGHTNING JEWELRY: bright cyan #06b6d4 arcs (strong contrast on dark-red boss background). Ornate shoulder runes, wise stern eyes. "
        + BG_BOSS,
        True,
    ),
    (
        "boss_tauren",
        PREFIX
        + "Tauren chieftain bust. FUR: rich honey gold #f59e0b with chocolate muzzle #78350f. "
        "HORNS: cream #fef3c3 with carved BRONZE rings #b45309 (warmer than kodo bone). Totem pendant jade #059669 stone. "
        + BG_BOSS,
        True,
    ),
    (
        "boss_blademaster",
        PREFIX
        + "Elite blademaster orc bust. SKIN: ember orange #ea580c (NOT olive green). "
        "SWORDS: bright silver blades #e2e8f0 with vermilion lacquer hilts #dc2626 and gold fittings #fbbf24 — triad pops on dark-red boss background. "
        "Crimson banner cloth on shoulder, proud calm killer eyes. "
        + BG_BOSS,
        True,
    ),
]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Batch enemy bust portraits + circular export")
    p.add_argument("--skip-generate", action="store_true", help="跳过文生图，只对 out_enemies_square 里已有 PNG 做圆形")
    p.add_argument(
        "--force",
        action="store_true",
        help="方图已存在时仍重新调文生图覆盖；staging 圆图也会按裁圆步骤覆盖写入",
    )
    p.add_argument("--base-url", default=None)
    p.add_argument("--resource", default=None)
    p.add_argument("--key-file", type=Path, default=None)
    p.add_argument("--model", default="gpt-image-2")
    p.add_argument("--size", default="1024x1024")
    p.add_argument("--circle-size", type=int, default=256, help="圆形输出直径像素")
    p.add_argument(
        "--max-attempts",
        type=int,
        default=DEFAULT_MAX_ATTEMPTS,
        metavar="N",
        help=f"每张图文生图 / 裁圆失败时的重试次数（默认 {DEFAULT_MAX_ATTEMPTS}），用尽仍失败则跳过该 id",
    )
    return p


def _load_circle_avatar_module():
    spec = importlib.util.spec_from_file_location("circle_avatar_batch", CIRCLE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {CIRCLE}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def write_circle_staging(square: Path, out_png: Path, circle_size: int) -> int:
    """有方图则裁圆并写入 gptimage/out_enemies_circle（覆盖已存在 staging 文件）。"""
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
    """最多尝试 max_attempts 次文生图；成功且方图文件存在则 True。"""
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
    """最多尝试 max_attempts 次裁圆写入 staging。"""
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

    OUT_SQUARE.mkdir(parents=True, exist_ok=True)
    OUT_CIRCLE_STAGING.mkdir(parents=True, exist_ok=True)

    py = sys.executable
    skipped_generate_reuse = 0
    missing_square_skip = 0
    skipped_after_failed_generate = 0
    skipped_after_failed_circle = 0

    for stem, body, _is_boss in JOBS:
        square = OUT_SQUARE / f"{stem}.png"
        staging_png = OUT_CIRCLE_STAGING / f"{stem}.png"

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
                prompt = f"{body} Avoid: {COMMON_NEG}"
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
                    "=== skip generate (square exists, delete square or use --force to redo):",
                    stem,
                    "->",
                    square,
                    flush=True,
                )
                skipped_generate_reuse += 1

        if not square.is_file():
            print("Missing square image after step:", square, file=sys.stderr)
            return 1

        if not write_circle_staging_with_retries(
            square,
            staging_png,
            args.circle_size,
            stem,
            max_attempts=args.max_attempts,
        ):
            print("=== skip (circle failed after retries):", stem, flush=True)
            skipped_after_failed_circle += 1
            continue

    print("Done. Staging circles in", OUT_CIRCLE_STAGING, "(use publish_enemy_portraits_to_game.py to copy into game)")
    if (
        skipped_generate_reuse
        or missing_square_skip
        or skipped_after_failed_generate
        or skipped_after_failed_circle
    ):
        print(
            "Summary: skip_generate_reuse_square=",
            skipped_generate_reuse,
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
