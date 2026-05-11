#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文生图：OpenAI 兼容中转（同目录 secrets_openai.txt 读 Key）。

默认：
  base_url = https://vip.auto-code.net/v1
  请求 URL = {base_url}/{resource}   例如 .../v1/images/generations
  model    = gpt-image-2

你可改的只有「中转根地址」和「v1 后面的路径片段」：
  --base-url   需包含 /v1（或你的网关等价前缀）
  --resource   默认 images/generations（不要前导 /）

示例：
  python image2_generate.py --prompt "a red apple" --out out.png
  python image2_generate.py --base-url https://example.com/proxy/v1 --resource images/generations --size 1024x1024 --out out.png --prompt "..."
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

DEFAULT_BASE_URL = "https://vip.auto-code.net/v1"
DEFAULT_RESOURCE = "images/generations"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_KEY_FILE = Path(__file__).resolve().parent / "secrets_openai.txt"


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
        "未找到 API Key：在同目录放置 secrets_openai.txt，或设置环境变量 OPENAI_API_KEY",
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


def write_images(data: dict[str, Any], out_path: Path, output_format: str) -> None:
    items = data.get("data") or []
    if not items:
        print(json.dumps(data, ensure_ascii=False, indent=2)[:8000], file=sys.stderr)
        raise SystemExit(1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    ext = output_format or "png"

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
            print("响应项无 b64_json/url，keys:", list(item.keys()), file=sys.stderr)
            raise SystemExit(1)

        path = out_path if len(items) == 1 else out_path.with_name(f"{out_path.stem}_{idx + 1}{out_path.suffix or '.' + ext}")
        path.write_bytes(raw)
        print("已保存", path)

    usage = data.get("usage")
    if usage:
        print("usage:", json.dumps(usage, ensure_ascii=False))


def main() -> int:
    p = argparse.ArgumentParser(description="中转文生图（gpt-image-2 等）")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"含 /v1 的根（默认 {DEFAULT_BASE_URL}）")
    p.add_argument(
        "--resource",
        default=DEFAULT_RESOURCE,
        help=f"v1 后的路径，默认 {DEFAULT_RESOURCE}（勿以 / 开头）",
    )
    p.add_argument(
        "--key-file",
        type=Path,
        default=None,
        help=f"密钥文件（默认同目录 {DEFAULT_KEY_FILE.name}）",
    )
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"默认 {DEFAULT_MODEL}")
    p.add_argument("--prompt", required=True, help="提示词")
    p.add_argument("--size", default="1024x1024", help="如 1024x1024")
    p.add_argument("--n", type=int, default=1, help="张数（受网关限制）")
    p.add_argument("--quality", default=None, help='可选 low|medium|high|auto')
    p.add_argument(
        "--background",
        default=None,
        help='可选 opaque|transparent|auto（若网关/模型支持）',
    )
    p.add_argument("--output-format", default="png", help="png|jpeg|webp")
    p.add_argument("--out", default="out_image2.png", help="输出路径")
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

    write_images(data, Path(args.out).expanduser().resolve(), args.output_format)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
