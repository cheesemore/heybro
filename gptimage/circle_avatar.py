#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将方形图片中心裁成正方形后缩放，再输出为「圆形透明底」PNG（适合 UI 头像）。

依赖：pip install pillow

单张：
  python circle_avatar.py --input warrior.png --out warrior_circle_128.png --size 128

批量（某目录下所有 png）：
  python circle_avatar.py --input-dir out_dbm --pattern "*.png" --out-dir out_dbm/circle --size 256

说明：
  - 先按短边做居中 crop 成正方形，再 resize 到 size×size
  - 圆外像素 alpha=0；圆内保留原图 alpha
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("请先安装 Pillow: pip install pillow", file=sys.stderr)
    raise SystemExit(2) from None


def _resample() -> int:
    try:
        return Image.Resampling.LANCZOS  # Pillow >= 9.1
    except AttributeError:
        return Image.LANCZOS


def square_crop_center(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def to_circle_rgba(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGBA")
    im = square_crop_center(im)
    im = im.resize((size, size), _resample())

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def circle_rgba_from_path(src: Path, size: int) -> Image.Image:
    """从方图路径读取并裁成圆形 RGBA（不写盘）。供批处理脚本在「是否写入」前调用。"""
    im = Image.open(src)
    return to_circle_rgba(im, size)


def process_one(src: Path, dst: Path, size: int) -> None:
    out = circle_rgba_from_path(src, size)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "PNG")
    print("Wrote", dst)


def main() -> int:
    p = argparse.ArgumentParser(description="Crop to circular PNG avatar and resize")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--input", type=Path, help="单张输入图")
    g.add_argument("--input-dir", type=Path, help="批量输入目录")

    p.add_argument("--out", type=Path, help="单张输出路径（与 --input 同用）")
    p.add_argument("--out-dir", type=Path, help="批量输出目录（与 --input-dir 同用）")
    p.add_argument("--pattern", default="*.png", help="批量时 glob，默认 *.png")
    p.add_argument("--size", type=int, default=128, help="输出直径像素，默认 128")
    args = p.parse_args()

    if args.size < 8 or args.size > 8192:
        print("--size 应在合理范围（如 64–1024）", file=sys.stderr)
        return 2

    if args.input:
        if not args.out:
            print("单张模式需要 --out", file=sys.stderr)
            return 2
        src = args.input.expanduser().resolve()
        if not src.is_file():
            print("找不到输入:", src, file=sys.stderr)
            return 2
        process_one(src, args.out.expanduser().resolve(), args.size)
        return 0

    indir = args.input_dir.expanduser().resolve()
    if not indir.is_dir():
        print("不是目录:", indir, file=sys.stderr)
        return 2
    if not args.out_dir:
        print("批量模式需要 --out-dir", file=sys.stderr)
        return 2
    out_dir = args.out_dir.expanduser().resolve()

    paths = sorted(indir.glob(args.pattern))
    if not paths:
        print("未匹配到文件:", indir / args.pattern, file=sys.stderr)
        return 1

    for src in paths:
        if not src.is_file():
            continue
        dst = out_dir / f"{src.stem}_circle_{args.size}.png"
        process_one(src, dst, args.size)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
