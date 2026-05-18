#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gptimage 批量脚本共用文生图入口：调用同目录 `image2_generate.generate_to_file`。

与 `batch_enemy_portraits.py`（子进程调本目录 CLI）对齐：
  - 请求体仅 model / prompt / n / size，默认不传 output_format；
  - 长 prompt 走内存直调，不经 Windows 命令行；
  - Key：显式 --key-file > gptimage/secrets_openai.txt > 仓库根 secrets_openai.txt。
"""

from __future__ import annotations

import ast
import json
import sys
import time
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import image2_generate as ig2  # noqa: E402

GPTIMAGE_SECRETS = _SCRIPT_DIR / "secrets_openai.txt"
ROOT_SECRETS = _REPO_ROOT / "secrets_openai.txt"


def resolve_key_file(key_file: Path | None) -> Path | None:
    if key_file is not None:
        p = Path(key_file).expanduser()
        return p if p.is_file() else None
    if GPTIMAGE_SECRETS.is_file():
        return GPTIMAGE_SECRETS
    if ROOT_SECRETS.is_file():
        return ROOT_SECRETS
    return None


_PERMISSION_HINT = (
    "\n【说明】此为中转账号分组未开通文生图（403 permission_error），"
    "与 prompt/脚本无关。请换带图像权限的 Key，或联系 Auto-Code 开通 gpt-image。"
    "诊断：python gptimage/probe_image_api.py --try-generate"
)


def format_api_error(exc: BaseException) -> str:
    if isinstance(exc, RuntimeError):
        msg = str(exc)
        try:
            if "HTTP" in msg and "{" in msg:
                start = msg.index("{")
                blob = msg[start:]
                try:
                    parsed = json.loads(blob)
                except json.JSONDecodeError:
                    parsed = ast.literal_eval(blob)
                if isinstance(parsed, dict):
                    err = parsed.get("error")
                    if isinstance(err, dict):
                        code = str(err.get("code", ""))
                        display = err.get("display_message") or err.get("message") or ""
                        if code == "permission_error" or "not enabled for this group" in str(display).lower():
                            return f"{display}{_PERMISSION_HINT}"
                        if display:
                            return str(display)
        except (ValueError, SyntaxError, json.JSONDecodeError):
            pass
        if "403" in msg and "not enabled for this group" in msg.lower():
            return msg + _PERMISSION_HINT
        return msg
    return f"{type(exc).__name__}: {exc}"


def generate_square_with_retries(
    prompt: str,
    square: Path,
    stem: str,
    *,
    model: str = "gpt-image-2",
    size: str = "1024x1024",
    base_url: str | None = None,
    resource: str | None = None,
    key_file: Path | None = None,
    max_attempts: int = 3,
    retry_sleep_sec: float = 1.5,
) -> bool:
    """调用中转文生图，成功则 square 存在。"""
    target = square.expanduser().resolve()
    resolved_key = resolve_key_file(key_file)
    url = ig2.generations_url(base_url, resource)
    for attempt in range(1, max_attempts + 1):
        print(f"=== generate {stem} attempt {attempt}/{max_attempts} -> {target}", flush=True)
        if attempt == 1:
            print(f"  API URL: {url}", flush=True)
            print(f"  Key file: {resolved_key or '(default gptimage secrets / env)'}", flush=True)
        try:
            path, hint = ig2.generate_to_file(
                prompt,
                target,
                key_file=resolved_key,
                base_url=base_url,
                resource=resource,
                model=model,
                size=size,
            )
            if hint:
                print(hint, flush=True)
            if path.is_file():
                return True
            print(f"generate failed: {stem} — 未写出文件 {path}", file=sys.stderr)
        except Exception as e:
            print(f"generate failed: {stem}\n{format_api_error(e)}", file=sys.stderr)
        if attempt < max_attempts:
            time.sleep(retry_sleep_sec)
    return False
