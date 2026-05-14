#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方图 → 圆形透明 PNG，复用 `gptimage/circle_avatar.py`（Pillow）。"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_CIRCLE_SCRIPT = _REPO_ROOT / "gptimage" / "circle_avatar.py"


def circle_output_path_for_square(square: Path) -> Path:
    """
    与 staging 约定一致：
    - `.../wow-mobs/<id>.png` → `.../wow-mobs-circle/<id>.png`
    - `.../wow-bosses/<id>.png` → `.../wow-bosses-circle/<id>.png`
    其它目录则落在同目录下 `circle/<name>`。
    """
    parent = square.parent
    name = square.name
    if parent.name == "wow-mobs":
        return parent.parent / "wow-mobs-circle" / name
    if parent.name == "wow-bosses":
        return parent.parent / "wow-bosses-circle" / name
    return parent / "circle" / name


def _load_circle_avatar_module():
    spec = importlib.util.spec_from_file_location("circle_avatar_wow_portrait", _CIRCLE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {_CIRCLE_SCRIPT}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def write_circle_from_square(square: Path, out_png: Path, diameter: int) -> None:
    """读取方图，裁圆写入 out_png（覆盖已存在）。"""
    if not _CIRCLE_SCRIPT.is_file():
        raise FileNotFoundError(f"缺少圆切脚本: {_CIRCLE_SCRIPT}")
    if not square.is_file():
        raise FileNotFoundError(f"缺少方图: {square}")
    if diameter < 8 or diameter > 8192:
        raise ValueError(f"diameter 超出范围: {diameter}")
    mod = _load_circle_avatar_module()
    circ = mod.circle_rgba_from_path(square.resolve(), diameter)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    circ.save(out_png.resolve(), "PNG")
