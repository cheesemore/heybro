#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将校验目录里的圆形敌方头像复制到游戏资源目录。

默认来源：**`gptimage/out_enemies_circle/<id>.png`**
默认目标：**`public/assets/enemies/<id>.png`**

默认**始终覆盖**目标目录中已存在的同名 PNG（保证每次导入生效）。

  python gptimage/publish_enemy_portraits_to_game.py
  python gptimage/publish_enemy_portraits_to_game.py --skip-existing   # 已存在则跳过
  python gptimage/publish_enemy_portraits_to_game.py --dry-run
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAGING = ROOT / "gptimage" / "out_enemies_circle"
GAME = ROOT / "public" / "assets" / "enemies"


def main() -> int:
    p = argparse.ArgumentParser(
        description="Publish staged enemy circle PNGs into public/assets/enemies/ (overwrite by default).",
    )
    p.add_argument("--source", type=Path, default=STAGING, help="圆图来源目录")
    p.add_argument("--dest", type=Path, default=GAME, help="游戏内目标目录")
    p.add_argument(
        "--skip-existing",
        action="store_true",
        help="若目标已存在同名 PNG 则跳过（默认不启用：一律覆盖）",
    )
    p.add_argument("--dry-run", action="store_true", help="只打印将要执行的操作")
    args = p.parse_args()

    src_dir = args.source.expanduser().resolve()
    dst_dir = args.dest.expanduser().resolve()
    if not src_dir.is_dir():
        print("Not a directory:", src_dir, file=sys.stderr)
        return 2

    paths = sorted(src_dir.glob("*.png"))
    if not paths:
        print("No PNG in", src_dir, file=sys.stderr)
        return 1

    dst_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    skipped = 0
    for src in paths:
        if not src.is_file():
            continue
        dst = dst_dir / src.name
        if dst.is_file() and args.skip_existing:
            print("skip (exists):", dst, flush=True)
            skipped += 1
            continue
        if args.dry_run:
            print("would copy", src, "->", dst, flush=True)
        else:
            shutil.copy2(src, dst)
            print("copied", src.name, "->", dst, flush=True)
        copied += 1

    print("Done. copied=", copied, " skipped_existing=", skipped, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
