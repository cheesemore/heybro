#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英雄单位半身像：流程对齐 **`batch_enemy_portraits.py`**（先方图 → 再裁圆），**只写入 `gptimage/`**，不进入游戏。

与 **`batch_dbm_portraits.py`** 职业代币胸像的区别：
  - 同样：饥荒/Klei 线稿风（`dont_starve_style.STYLE_CORE`）、DBM 职业色虚化背景、方图后裁圆。
  - 英雄专属：每位至少一件「华丽」视觉锚点（华服 / 头饰帽冠 / 标志性武器，按编号轮换强调）。
  - 5 套轮换保证男女都有（3 女 + 2 男）；德鲁伊人形态为熊脸人形（与职业代币 `druid` 一致）。
  - 德鲁伊另生成 5 张熊形态战斗头像：`druid_01_bear` … `druid_05_bear`（对齐 `heroRegistry` id + `_bear`）。

游戏侧映射：**archer = 猎人底稿**，**knight = 圣骑士底稿**（文件名用 archer_* / knight_*）。

输出：
  - 方图：`gptimage/out_heroes_square/<id>.png`（含 `druid_01_bear` 等）
  - 圆图：`gptimage/out_heroes_circle/<id>.png`（`circle_avatar.py` 裁切，默认直径 512）

依赖：`gptimage/image2_generate.py`（经 `gptimage/batch_image2_api.py`）、`gptimage/secrets_openai.txt` 或仓库根 `secrets_openai.txt`、`pip install pillow`

用法（仓库根 HeyBro）：
  python gptimage/generate_hero_unit_portraits.py
  python gptimage/generate_hero_unit_portraits.py --only warrior
  python gptimage/generate_hero_unit_portraits.py --only druid
  python gptimage/generate_hero_unit_portraits.py --only-bear
  python gptimage/generate_hero_unit_portraits.py --skip-generate
  python gptimage/generate_hero_unit_portraits.py --skip-bear
  python gptimage/generate_hero_unit_portraits.py --force
  python gptimage/generate_hero_unit_portraits.py --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
CIRCLE = SCRIPT_DIR / "circle_avatar.py"
OUT_SQUARE = ROOT / "gptimage" / "out_heroes_square"
OUT_CIRCLE = ROOT / "gptimage" / "out_heroes_circle"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from batch_image2_api import generate_square_with_retries
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
    "plain peasant clothes, unadorned generic soldier, boring flat armor with no hero accent, "
    "low resolution, busy sharp readable environment, gore"
)

# 英雄比职业代币更华丽：每位至少一件可读锚点（具体强调见 __FLAIR__）
_HERO_ORNAMENT = (
    "Named HERO bust — must look richer than a generic class token. "
    "Include at least ONE bold thumbnail-readable showpiece (inked, not photoreal gems): "
    "elaborate costume with embroidery/gold trim/cape OR distinctive hat/crown/helm with plume "
    "OR signature ornate weapon near shoulder. __FLAIR__ "
    "All ornament stays Don't Starve paper-cut / cross-hatch, no glossy 3D metal."
)

# 5 套编号轮换「华丽」侧重点（与 VARIANTS 一一对应）
VARIANT_FLAIR: list[str] = [
    "Primary showpiece: elaborate layered costume — ceremonial tabard, jeweled collar, fur-lined cape, ornate pauldrons.",
    "Primary showpiece: distinctive headwear — feathered officer hat, circlet, horned helm, or tall antler crown.",
    "Primary showpiece: signature legendary weapon — rune greatsword, gem staff top, enchanted bow limb at shoulder.",
    "Primary showpiece: elaborate costume plus subtle second accent (brooch, sash, epaulettes).",
    "Primary showpiece: ornate headwear with plume or antlers AND one visible garment trim.",
]

# 职业胸像基底 + 英雄华丽层（__SUBJECT__ = 性别+种族，__FLAIR__ = 上表）
_DBM_WARRIOR = (
    "Square 1:1 bust portrait, rectangular framing, face and eyes at geometric center. "
    "NO circular badge, NO round frame, NO hard circular vignette. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy warrior in heavy plate (original design), slightly awkward heroic silhouette. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view. Stern focused expression, no smile, inked brows. "
    "Heavily blurred bokeh background dominated by warrior class tan #C69B6D, low saturation, "
    "slightly darker brown edge falloff. Side key + rim as simple ink edge, not soft bloom. "
    "Readable at small size; rough paper-game illustration feel."
)

_DBM_MAGE = (
    "Square 1:1 bust portrait, face centered, no circular badge mask. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy mage in cloth robes (original design), slightly gaunt stylized face. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, intense calm eyes with ink outlines. "
    "Heavily blurred bokeh dominated by mage class cyan #3FC7EB, deeper desaturated teal toward edges, "
    "not neon cyberpunk. Tiny arcane sparks as sparse ink ticks near hands, restrained. "
    "Cross-hatched or flat shadow blocks, no glossy gradients."
)

_DBM_HUNTER = (
    "Square 1:1 bust portrait, face centered, no round frame. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy hunter in leather and light gear (original design). "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, alert narrow eyes, steady calm expression. "
    "Blurred bokeh background dominated by hunter class green #ABD473, "
    "darker muted olive at edges. Natural side key + rim as ink edges, not beauty lighting. "
    "Slightly scruffy ink texture, survival-sketch mood."
)

_DBM_PRIEST = (
    "Square 1:1 bust portrait, face centered, no circular badge. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy priest in cloth vestments (original design), not plate armor. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, serene compassionate restrained expression, soft ink smile line optional. "
    "Holy shimmer as faint cross-hatched white strokes, not overwhelming glow. "
    "Heavily blurred bokeh centered on priest white #FFFFFF, fade to very pale cool gray or "
    "pale lavender-gray at edges for depth (still reads as priest white family), avoid flat empty white. "
    "Gentle ink shadows only, no soft airbrush porcelain skin."
)

_DBM_PALADIN = (
    "Square 1:1 bust portrait, face centered, no hard circular vignette. "
    f"{STYLE_CORE} "
    "__SUBJECT__, fantasy paladin in plate armor (original design), subtle clean cross or holy sigil geometry "
    "as small ink accents, NO huge golden holy explosion. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, righteous calm composed expression, no smug smirk. "
    "Prefer a mounted-on-warhorse composition within the square bust frame: paladin upper body together with "
    "horse head, neck, or shoulders, heroic charging or rearing, still readable at thumbnail size; horse also ink-styled. "
    "Blurred bokeh dominated by paladin class pink #F58CBA, slightly deeper rose/mauve toward edges, desaturated. "
    "Side key + mild rim as ink edges; holy light only as faint tick marks, "
    "must not overpower the pink class background."
)

_DBM_WARLOCK = (
    "Square 1:1 bust portrait, face centered, no circular badge mask. "
    f"{STYLE_CORE} "
    "__SUBJECT__, warlock in dark flowing robes (original design), slightly gaunt stylized face. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, intense guarded eyes with ink outlines, faint fel-green under-eye shadow "
    "as sparse ink ticks only, no green fire explosion. "
    "Heavily blurred bokeh dominated by warlock class purple #8787ED, deeper desaturated violet toward edges, "
    "not neon cyberpunk. Cross-hatched shadow blocks, no glossy gradients."
)

_DBM_SHAMAN = (
    "Square 1:1 bust portrait, face centered, no round frame. "
    f"{STYLE_CORE} "
    "__SUBJECT__, shaman in tribal robes and fur shoulder trim (original design). "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, weathered stern expression, inked brows. "
    "Heavily blurred bokeh dominated by shaman class blue #0070DE, deeper indigo-navy toward edges, "
    "low saturation. Side key + rim as simple ink edge, readable at small size."
)

_DBM_ASSASSIN = (
    "Square 1:1 bust portrait, face centered, no round frame. "
    f"{STYLE_CORE} "
    "__SUBJECT__, ROGUE appearance in dark leather, hood optional pushed back so face is fully visible. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view, sharp alert eyes, subtle confident ink smirk optional. "
    "Class reads as World of Warcraft rogue/thief not plate warrior. "
    "Blurred bokeh dominated by rogue class yellow #FFF569, darker muted gold-olive at edges. "
    "Natural side key + rim as ink edges, slightly scruffy survival-sketch mood."
)

_DBM_DRUID = (
    "Square 1:1 bust portrait, face and eyes at geometric center, no circular badge. "
    f"{STYLE_CORE} "
    "__SUBJECT__, humanoid druid in leather and fur-trim gear (original design); "
    "Warcraft III Claw Druid HUMANOID form — bear-like face on bipedal body: "
    "broad rounded bear snout, bear muzzle, small bear ears, strong jaw, fierce calm eyes; "
    "optional short antlers as ink accents. "
    "NOT full bear beast form, NOT quadruped, NOT furry monster body. "
    f"{_HERO_ORNAMENT} "
    "~45° three-quarter view. "
    "Heavily blurred bokeh dominated by druid class orange #FF7D0A, deeper burnt sienna toward edges, "
    "desaturated. Readable at small size; rough paper-game illustration feel."
)

# 熊形态战斗头像（5 英雄各一张；与 batch_dbm `druid_bear` 同形态，但保留英雄 __FLAIR__）
_DBM_DRUID_BEAR = (
    "Square 1:1 bust portrait, bear face centered with generous empty margin (head occupies ~70% of frame, "
    "15% padding on all sides so circle crop does not clip ears). "
    "NO circular badge, NO round frame, NO hard circular vignette. "
    f"{STYLE_CORE} "
    "__SUBJECT__ as BEAR FORM druid: grizzly bear head and shoulders, thick fur as ink cross-hatch, "
    "fierce forward eyes, snout as bold ink shapes not photoreal fur. "
    "NO human face, NO bipedal elf body — reads as beast bear avatar for druid bear combat form. "
    "Hero identity via __FLAIR__ on fur, collar, antlers, or claw jewelry (inked cut-paper, not glossy 3D). "
    "~45° three-quarter view. "
    "Heavily blurred bokeh dominated by druid class orange #FF7D0A, burnt sienna edges, desaturated. "
    "Readable at small token size; paired with same-number humanoid `druid_NN` hero portrait."
)

# (游戏 allyClass / 文件名前缀, batch_dbm_portraits.py 模板 key)
_CLASS_ORDER: list[tuple[str, str]] = [
    ("warrior", "warrior"),
    ("archer", "hunter"),
    ("priest", "priest"),
    ("mage", "mage"),
    ("knight", "paladin"),
    ("warlock", "warlock"),
    ("shaman", "shaman"),
    ("assassin", "assassin"),
    ("druid", "druid"),
]

_DBM_BODY: dict[str, str] = {
    "warrior": _DBM_WARRIOR,
    "mage": _DBM_MAGE,
    "hunter": _DBM_HUNTER,
    "priest": _DBM_PRIEST,
    "paladin": _DBM_PALADIN,
    "warlock": _DBM_WARLOCK,
    "shaman": _DBM_SHAMAN,
    "assassin": _DBM_ASSASSIN,
    "druid": _DBM_DRUID,
    "druid_bear": _DBM_DRUID_BEAR,
}

# 5 套：性别 + 种族（3 女 + 2 男，与 VARIANT_FLAIR 下标一一对应）
VARIANTS: list[tuple[str, str]] = [
    ("female", "human — elegant noble features, varied skin tone"),
    ("male", "blood elf — sharp features, subtle fel-green eyes optional"),
    ("female", "night elf — purple-blue skin, long ears, silver hair"),
    ("male", "draenei — blue skin, forehead tendrils, glowing eyes, bust only"),
    ("female", "void elf — pale skin, subtle void purple in hair, confident gaze"),
]


def subject_line(gender: str, race_desc: str) -> str:
    return f"{gender.capitalize()} hero ({race_desc})"


def build_prompt_body(class_key: str, gender: str, race_desc: str, variant_index: int) -> str:
    """variant_index: 1..5，对应 warrior_01 / druid_03_bear 等编号与 VARIANT_FLAIR。"""
    sub = subject_line(gender, race_desc)
    flair = VARIANT_FLAIR[(variant_index - 1) % len(VARIANT_FLAIR)]
    raw = _DBM_BODY[class_key]
    return raw.replace("__SUBJECT__", sub).replace("__FLAIR__", flair)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Hero bust portraits: Don't Starve ink style, DBM class-color bokeh, "
            "gender-rotating races, ornate flair per slot → gptimage/out_heroes_* only."
        ),
    )
    p.add_argument(
        "--only",
        choices=[c[0] for c in _CLASS_ORDER],
        help="只跑某一职业前缀（含 warlock/shaman/assassin/druid；druid 时默认含 5 张 *_bear）",
    )
    p.add_argument(
        "--only-bear",
        action="store_true",
        help="只跑德鲁伊熊形态（druid_01_bear … druid_05_bear）",
    )
    p.add_argument(
        "--skip-bear",
        action="store_true",
        help="跳过德鲁伊熊形态（仍跑 druid_01 … druid_05 人形态）",
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


def iter_jobs(
    only: str | None,
    *,
    only_bear: bool = False,
    skip_bear: bool = False,
) -> list[tuple[str, str, str, str, str, int]]:
    """stem, file_class, dbm_key, gender, race, variant_index (1..5)"""
    out: list[tuple[str, str, str, str, str, int]] = []

    def append_druid_bears() -> None:
        if skip_bear:
            return
        for i, (gender, race_desc) in enumerate(VARIANTS, start=1):
            stem = f"druid_{i:02d}_bear"
            out.append((stem, "druid", "druid_bear", gender, race_desc, i))

    if only_bear:
        append_druid_bears()
        return out

    for file_class, dbm_key in _CLASS_ORDER:
        if only and only != file_class:
            continue
        for i, (gender, race_desc) in enumerate(VARIANTS, start=1):
            stem = f"{file_class}_{i:02d}"
            out.append((stem, file_class, dbm_key, gender, race_desc, i))
        if file_class == "druid" and (only is None or only == "druid"):
            append_druid_bears()
    return out


def main() -> int:
    args = build_parser().parse_args()
    if args.max_attempts < 1:
        print("--max-attempts must be >= 1", file=sys.stderr)
        return 2
    if not CIRCLE.is_file():
        print("Missing:", CIRCLE, file=sys.stderr)
        return 2

    if args.only_bear and args.only:
        print("Cannot use --only-bear with --only", file=sys.stderr)
        return 2
    jobs = iter_jobs(args.only, only_bear=args.only_bear, skip_bear=args.skip_bear)
    print(f"共 {len(jobs)} 张。方图: {OUT_SQUARE}  圆图: {OUT_CIRCLE}", flush=True)

    if args.dry_run:
        for stem, _fc, _dk, gender, race_desc, vi in jobs:
            flair = VARIANT_FLAIR[(vi - 1) % len(VARIANT_FLAIR)]
            print(f"[dry-run] {stem}  {gender}  flair={flair[:48]}…", flush=True)
        print("Dry-run 结束。")
        return 0

    OUT_SQUARE.mkdir(parents=True, exist_ok=True)
    OUT_CIRCLE.mkdir(parents=True, exist_ok=True)

    skipped_square_reuse = 0
    missing_square = 0
    skip_failed_gen = 0
    skip_failed_circle = 0

    for stem, _fc, dbm_key, gender, race_desc, variant_index in jobs:
        body = build_prompt_body(dbm_key, gender, race_desc, variant_index)
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
