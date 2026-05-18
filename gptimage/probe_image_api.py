#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
诊断文生图 Key / 分组是否开通 images/generations。

用法（仓库根）：
  python gptimage/probe_image_api.py
  python gptimage/probe_image_api.py --key-file gptimage/secrets_openai.txt
  python gptimage/probe_image_api.py --try-generate
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import image2_generate as ig2  # noqa: E402
from batch_image2_api import resolve_key_file  # noqa: E402

PERMISSION_HINT = """
【403 / Image generation is not enabled for this group】

这是中转账号「分组」未开通文生图，不是脚本 bug，也不是 prompt 问题。
/chat、/models 可能正常，但 POST /v1/images/generations 会被拒绝。

建议：
  1. 用控制台或客服开通该 Key 所属分组的「图像生成 / gpt-image」权限；
  2. 确认 secrets 里是「带图权限」的 Key（gptimage/secrets_openai.txt 优先于仓库根）；
  3. 技术支持 QQ 群：790910470（错误信息里提供的号码）；
  4. 换 Key 后重跑：python gptimage/probe_image_api.py --try-generate

批量出图（英雄/DBM）与单张 CLI 走同一接口，Key 不通则全部失败。
"""


def _mask_key(key: str) -> str:
    k = key.strip()
    if len(k) <= 8:
        return "***"
    return f"{k[:4]}…{k[-4:]}"


def cmd_list_image_models(key_file: Path | None, base_url: str | None) -> int:
    key = ig2.load_api_key(key_file)
    base = (base_url or ig2.DEFAULT_BASE_URL).rstrip("/")
    url = f"{base}/models"
    import urllib.request

    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"GET /models 失败: {e}")
        return 1

    rows = data.get("data") or []
    ids = sorted(str(m.get("id", "")) for m in rows if m.get("id"))
    hints = ("image", "dall", "gpt-image", "flux")
    image_ids = [i for i in ids if any(h in i.lower() for h in hints)]
    print(f"共 {len(ids)} 个 model id；疑似图像相关 {len(image_ids)} 个：")
    for i in image_ids:
        print(f"  {i}")
    if not image_ids:
        print("  （列表中未见 image 类 model — 该 Key 可能未分配图像模型）")
    return 0


def cmd_try_generate(key_file: Path | None, base_url: str | None, model: str) -> int:
    out = _SCRIPT_DIR / "out_probe_test.png"
    prompt = "simple red circle on white background, flat icon, no text"
    url = ig2.generations_url(base_url, None)
    print(f"POST {url}")
    print(f"model={model} size=256x256 n=1")
    try:
        path, hint = ig2.generate_to_file(
            prompt,
            out,
            key_file=key_file,
            base_url=base_url,
            model=model,
            size="256x256",
        )
        print(f"成功: {path}")
        if hint:
            print(hint)
        return 0
    except Exception as e:
        msg = str(e)
        print(f"失败: {msg}")
        if "403" in msg or "not enabled for this group" in msg.lower():
            print(PERMISSION_HINT)
        return 1


def main() -> int:
    p = argparse.ArgumentParser(description="Probe Auto-Code image generations API")
    p.add_argument("--key-file", type=Path, default=None)
    p.add_argument("--base-url", default=None)
    p.add_argument("--model", default=ig2.DEFAULT_MODEL)
    p.add_argument("--try-generate", action="store_true", help="发一张最小 256 文生图实测")
    p.add_argument("--list-models", action="store_true", help="列出 /models 里含 image 的 id")
    args = p.parse_args()

    resolved = resolve_key_file(args.key_file)
    print("Key file:", resolved or ig2.DEFAULT_KEY_FILE)
    if resolved and resolved.is_file():
        key = resolved.read_text(encoding="utf-8").strip()
        print("Key preview:", _mask_key(key))
    elif ig2.DEFAULT_KEY_FILE.is_file():
        key = ig2.DEFAULT_KEY_FILE.read_text(encoding="utf-8").strip()
        print("Key preview:", _mask_key(key), "(gptimage 默认)")
    else:
        print("Key: 环境变量 OPENAI_API_KEY / AUTO_CODE_API_KEY")

    print("Base URL:", args.base_url or ig2.DEFAULT_BASE_URL)
    print("Generations:", ig2.generations_url(args.base_url, None))

    if args.list_models or not args.try_generate:
        cmd_list_image_models(resolved, args.base_url)
    if args.try_generate:
        return cmd_try_generate(resolved, args.base_url, args.model)
    print("\n加 --try-generate 会实测 POST images/generations。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
