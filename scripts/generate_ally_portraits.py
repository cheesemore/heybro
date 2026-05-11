#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HeyBro 盟友 5 职业头像：gpt-image-2 → 品红底抠图 → 128² RGBA 居中缩放。

依赖：E:\\gptimage\\image2_generate.py、E:\\gptimage\\secrets_openai.txt
      pip install pillow

输出：<项目根>/public/portraits/ally/warrior.png 等（文件名小写固定）。
"""

from __future__ import annotations

import math
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("请先安装: pip install pillow", file=sys.stderr)
    raise SystemExit(2) from None

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = PROJECT_ROOT / "public" / "portraits" / "ally"
IMAGE2 = Path(r"E:\gptimage\image2_generate.py")
KEY_FILE = Path(r"E:\gptimage\secrets_openai.txt")

_GPTIMG = PROJECT_ROOT / "gptimage"
if _GPTIMG.is_dir() and str(_GPTIMG) not in sys.path:
    sys.path.insert(0, str(_GPTIMG))
try:
    from dont_starve_style import STYLE_CORE
except ImportError:
    STYLE_CORE = (
        "Art style like Klei's Don't Starve: hand-ink outlines, slightly jittery line weight, "
        "flat or lightly hatched fills, desaturated earthy palette, puppet-like stylized proportions."
    )

CANVAS = 128
SAFE_RADIUS = (CANVAS * 0.83) / 2.0
CHROMA = (255, 0, 255)
CHROMA_TOL = 42

NEG = (
    "text, watermark, logo, UI, circular frame, round badge overlay, "
    "busy background, detailed background, photoreal skin pores, glossy anime cel, soft airbrush beauty, "
    "multiple characters, extra faces, deformed hands"
)


def chroma_to_alpha(im: Image.Image, rgb: tuple[int, int, int], tol: int) -> Image.Image:
    im = im.convert("RGBA")
    r0, g0, b0 = rgb
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - r0) <= tol and abs(g - g0) <= tol and abs(b - b0) <= tol:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, a)
    return im


def trim_alpha(im: Image.Image, threshold: int = 8) -> Image.Image:
    im = im.convert("RGBA")
    alpha = im.split()[3]
    bbox = alpha.point(lambda p: 255 if p > threshold else 0).getbbox()
    if not bbox:
        return im
    return im.crop(bbox)


def fit_center_on_canvas(im: Image.Image, canvas: int, safe_radius: float) -> Image.Image:
    im = trim_alpha(im)
    w, h = im.size
    if w < 1 or h < 1:
        raise ValueError("empty image after trim")
    half_diag = math.hypot(w, h) / 2.0
    scale = safe_radius / half_diag
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    x = (canvas - nw) // 2
    y = (canvas - nh) // 2
    out.paste(im, (x, y), im)
    return out


JOBS: list[tuple[str, str]] = [
    (
        "warrior",
        f"{STYLE_CORE} "
        "Centered game character bust portrait, human fantasy warrior in simplified heavy plate armor, "
        "~45° three-quarter view, stern focused expression, hand-ink outlines, hatched or flat shadow blocks, "
        "readable silhouette at tiny size, isolated on solid flat magenta background ONLY #FF00FF, "
        "no gradients in background, no ground, no shadow on background.",
    ),
    (
        "mage",
        f"{STYLE_CORE} "
        "Centered game character bust portrait, human fantasy mage in simplified cloth robes, staff top or crystal focus "
        "near shoulder with clear silhouette, calm intense eyes, ink outlines, flat fills, "
        "isolated on solid flat magenta background ONLY #FF00FF, no gradients, no shadow on background.",
    ),
    (
        "priest",
        f"{STYLE_CORE} "
        "Centered game character bust portrait, human fantasy priest in simplified cloth vestments, serene gentle expression, "
        "optional small tome or staff top, faint cross-hatched light strokes only, "
        "isolated on solid flat magenta background ONLY #FF00FF, no gradients, no shadow on background.",
    ),
    (
        "archer",
        f"{STYLE_CORE} "
        "Centered game character bust portrait, human fantasy archer in simplified leather armor, alert eyes, "
        "bow stave clearly readable near shoulder, jittery ink line weight, survival-sketch mood, "
        "isolated on solid flat magenta background ONLY #FF00FF, no gradients, no shadow on background.",
    ),
    (
        "knight",
        f"{STYLE_CORE} "
        "Centered game character bust portrait, human fantasy knight in simplified polished plate armor, noble composed expression, "
        "optional subtle pink cloth accents small, metal as hatched gray shapes, "
        "isolated on solid flat magenta background ONLY #FF00FF, no gradients, no shadow on background.",
    ),
]


def run_image2(prompt: str, out_png: Path) -> None:
    if not IMAGE2.is_file():
        raise FileNotFoundError(f"缺少 {IMAGE2}")
    cmd = [
        sys.executable,
        str(IMAGE2),
        "--key-file",
        str(KEY_FILE),
        "--model",
        "gpt-image-2",
        "--size",
        "1024x1024",
        "--out",
        str(out_png),
        "--prompt",
        f"{prompt} Avoid: {NEG}",
    ]
    r = subprocess.run(cmd, check=False)
    if r.returncode != 0:
        raise RuntimeError(f"image2_generate 失败 exit={r.returncode}")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stem, body in JOBS:
        out_final = OUT_DIR / f"{stem}.png"
        with tempfile.TemporaryDirectory() as td:
            raw_path = Path(td) / f"{stem}_raw.png"
            print("=== generate", stem, flush=True)
            run_image2(body, raw_path)
            im = Image.open(raw_path)
            im = chroma_to_alpha(im, CHROMA, CHROMA_TOL)
            im = fit_center_on_canvas(im, CANVAS, SAFE_RADIUS)
            im.save(out_final, "PNG")
            print("Wrote", out_final, flush=True)
    print("Done:", OUT_DIR)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
