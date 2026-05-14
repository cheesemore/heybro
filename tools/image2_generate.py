#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文生图：OpenAI 兼容中转。默认从仓库根目录读取 secrets_openai.txt（HeyBro 根目录）。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = "https://vip.auto-code.net/v1"
DEFAULT_RESOURCE = "images/generations"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_KEY_FILE = _REPO_ROOT / "secrets_openai.txt"


def load_api_key(key_file: Path | None) -> str:
    if key_file and key_file.is_file():
        return key_file.read_text(encoding="utf-8").strip()
    if DEFAULT_KEY_FILE.is_file():
        return DEFAULT_KEY_FILE.read_text(encoding="utf-8").strip()
    for env in ("OPENAI_API_KEY", "AUTO_CODE_API_KEY"):
        v = os.environ.get(env)
        if v:
            return v.strip()
    print(
        "未找到 API Key：在仓库根放置 secrets_openai.txt，或设置环境变量 OPENAI_API_KEY",
        file=sys.stderr,
    )
    raise SystemExit(2)


def request_json_post(url: str, headers: dict[str, str], body: bytes) -> dict[str, Any]:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body) if err_body else {}
        except json.JSONDecodeError:
            parsed = err_body
        raise RuntimeError(f"HTTP {e.code} {e.reason}: {parsed}") from e


def write_images(
    data: dict[str, Any],
    out_path: Path,
    output_format: str,
    *,
    on_empty: str = "exit",
) -> list[Path]:
    """on_empty: 'exit' | 'raise'"""
    items = data.get("data") or []
    if not items:
        msg = json.dumps(data, ensure_ascii=False, indent=2)[:8000]
        if on_empty == "raise":
            raise RuntimeError(f"Empty image response: {msg}")
        print(msg, file=sys.stderr)
        raise SystemExit(1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    ext = output_format or "png"
    written: list[Path] = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        raw: bytes | None = None
        b64 = item.get("b64_json")
        if b64:
            raw = base64.standard_b64decode(b64)
        elif item.get("url"):
            with urllib.request.urlopen(str(item["url"]), timeout=600) as r:
                raw = r.read()
        if raw is None:
            if on_empty == "raise":
                raise RuntimeError("No b64_json or url in item; keys: " + str(list(item.keys())))
            print("响应项无 b64_json/url，keys:", list(item.keys()), file=sys.stderr)
            raise SystemExit(1)

        path = (
            out_path
            if len(items) == 1
            else out_path.with_name(f"{out_path.stem}_{idx + 1}{out_path.suffix or '.' + ext}")
        )
        path.write_bytes(raw)
        written.append(path.resolve())
        print("已保存", path)

    usage = data.get("usage")
    if usage:
        print("usage:", json.dumps(usage, ensure_ascii=False))
    return written


def generate_to_file(
    prompt: str,
    out_path: Path,
    *,
    key_file: Path | None = None,
    base_url: str | None = None,
    resource: str | None = None,
    model: str | None = None,
    size: str = "1024x1024",
    quality: str | None = None,
    background: str | None = None,
    output_format: str = "png",
) -> Path:
    """调用 images/generations，写入单张（n=1）。成功返回最终文件绝对路径。"""
    key = load_api_key(key_file)
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    res = str(resource or DEFAULT_RESOURCE).lstrip("/")
    url = f"{base}/{res}"

    payload: dict[str, Any] = {
        "model": model or DEFAULT_MODEL,
        "prompt": prompt,
        "n": 1,
        "size": size,
    }
    if quality:
        payload["quality"] = quality
    if background:
        payload["background"] = background
    if output_format:
        payload["output_format"] = output_format

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    data = request_json_post(url, headers=headers, body=body)
    if not isinstance(data, dict):
        raise RuntimeError("非 JSON 对象响应")
    paths = write_images(data, out_path.expanduser().resolve(), output_format, on_empty="raise")
    return paths[0] if paths else out_path.resolve()


def main() -> int:
    p = argparse.ArgumentParser(description="中转文生图（gpt-image-2 等）")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL)
    p.add_argument("--resource", default=DEFAULT_RESOURCE)
    p.add_argument("--key-file", type=Path, default=None)
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--prompt", required=True)
    p.add_argument("--size", default="1024x1024")
    p.add_argument("--n", type=int, default=1)
    p.add_argument("--quality", default=None)
    p.add_argument("--background", default=None)
    p.add_argument("--output-format", default="png")
    p.add_argument("--out", default="out_image2.png")
    args = p.parse_args()

    key = load_api_key(args.key_file)
    base = args.base_url.rstrip("/")
    res = str(args.resource).lstrip("/")
    url = f"{base}/{res}"

    payload: dict[str, Any] = {
        "model": args.model,
        "prompt": args.prompt,
        "n": args.n,
        "size": args.size,
    }
    if args.quality:
        payload["quality"] = args.quality
    if args.background:
        payload["background"] = args.background
    if args.output_format:
        payload["output_format"] = args.output_format

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    data = request_json_post(url, headers=headers, body=body)
    if not isinstance(data, dict):
        print("非 JSON 对象响应", file=sys.stderr)
        return 1

    write_images(data, Path(args.out).expanduser().resolve(), args.output_format, on_empty="exit")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
