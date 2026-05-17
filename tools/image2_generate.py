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


def generations_url(base_url: str | None = None, resource: str | None = None) -> str:
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    res = str(resource or DEFAULT_RESOURCE).lstrip("/")
    return f"{base}/{res}"


def format_api_error(exc: BaseException, *, url: str | None = None) -> str:
    """将 urllib / WinError 等整理为可读多行说明（供 GUI 日志）。"""
    lines: list[str] = []
    if url:
        lines.append(f"请求 URL: {url}")

    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        lines.append(f"{type(cur).__name__}: {cur}")

        reason = getattr(cur, "reason", None)
        if isinstance(cur, urllib.error.URLError) and isinstance(reason, OSError):
            winerr = getattr(reason, "winerror", None)
            if winerr == 10061:
                lines.append(
                    "【WinError 10061 连接被拒绝】本机连不上上述地址（对端未监听或被防火墙拦截）。"
                    "请检查：① Base URL 是否完整正确（含 https://，无多余空格）；"
                    "② 若用本地代理，代理是否已启动且端口一致；"
                    "③ 浏览器能否打开该域名；④ Key 文件路径是否正确（连不上与 Key 无关时也会是此错误）。"
                )
            elif winerr == 10060:
                lines.append("【WinError 10060 超时】网络过慢或目标无响应，可稍后重试或换网络。")
            elif winerr == 11001:
                lines.append("【WinError 11001 主机未知】Base URL 域名无法解析，请检查拼写。")

        cur = cur.__cause__ if cur.__cause__ is not cur else None

    return "\n".join(lines)


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
        raise RuntimeError(f"HTTP {e.code} {e.reason} @ {url}\n{parsed}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(format_api_error(e, url=url)) from e
    except TimeoutError as e:
        raise RuntimeError(format_api_error(e, url=url)) from e


def write_images(
    data: dict[str, Any],
    out_path: Path,
    output_format: str,
    *,
    on_empty: str = "exit",
    single_only: bool = False,
) -> list[Path]:
    """on_empty: 'exit' | 'raise'；single_only 为 True 时仅落盘 API 返回的第一张图。"""
    items = data.get("data") or []
    if single_only and len(items) > 1:
        items = items[:1]
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
            img_url = str(item["url"])
            try:
                with urllib.request.urlopen(img_url, timeout=600) as r:
                    raw = r.read()
            except urllib.error.URLError as e:
                raise RuntimeError(
                    format_api_error(e, url=img_url) + "\n（下载生成结果图片失败）"
                ) from e
        if raw is None:
            if on_empty == "raise":
                raise RuntimeError("No b64_json or url in item; keys: " + str(list(item.keys())))
            print("响应项无 b64_json/url，keys:", list(item.keys()), file=sys.stderr)
            raise SystemExit(1)

        # 第一张始终写入目标路径；额外张才加 _2、_3 后缀（避免 API 返回多张时主文件缺失）
        if idx == 0:
            path = out_path
        else:
            path = out_path.with_name(f"{out_path.stem}_{idx + 1}{out_path.suffix or '.' + ext}")
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
) -> tuple[Path, str | None]:
    """调用 images/generations，请求 n=1。成功返回 (文件路径, 多图提示或 None)。"""
    key = load_api_key(key_file)
    url = generations_url(base_url, resource)

    payload: dict[str, Any] = {
        "model": model or DEFAULT_MODEL,
        "prompt": prompt,
        "n": 1,
        "size": size,
    }
    # 部分中转仍可能返回多张；写入时由 single_only 只保留第一张
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
    returned_n = len(data.get("data") or [])
    target = out_path.expanduser().resolve()
    paths = write_images(data, target, output_format, on_empty="raise", single_only=True)
    multi_hint = (
        f"（请求 n=1，API 返回 {returned_n} 张，已仅保存第 1 张）" if returned_n > 1 else None
    )
    if not paths:
        raise RuntimeError(f"文生图响应未写入任何文件（目标 {target}）")
    primary = paths[0]
    if not primary.is_file():
        raise RuntimeError(f"文生图声称成功但文件不存在：{primary}")
    return primary, multi_hint


def probe_api_connection(
    *,
    key_file: Path | None = None,
    base_url: str | None = None,
    timeout_sec: float = 20,
) -> str:
    """
    探测 Base URL 是否可达。先 GET /models，失败再 GET 根路径。
    返回多行中文说明（成功或失败详情）。
    """
    key = load_api_key(key_file)
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    headers = {"Authorization": f"Bearer {key}"}
    tried: list[str] = []
    last_detail = ""

    for label, url in (("models", f"{base}/models"), ("root", base)):
        tried.append(url)
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                code = getattr(resp, "status", 200)
                return (
                    f"连接成功（{label}）\n"
                    f"  HTTP {code}\n"
                    f"  URL: {url}\n"
                    f"  文生图将 POST: {generations_url(base_url)}"
                )
        except urllib.error.HTTPError as e:
            body = e.read(800).decode("utf-8", errors="replace")
            if e.code in (401, 403):
                return (
                    f"服务器可达，但鉴权失败 HTTP {e.code}（{label}）\n"
                    f"  URL: {url}\n"
                    f"  请检查 secrets_openai.txt 中的 Key 是否有效。\n"
                    f"  响应摘要: {body[:400]}"
                )
            last_detail = f"HTTP {e.code} {e.reason} @ {url}\n{body[:400]}"
        except Exception as e:
            last_detail = format_api_error(e, url=url)

    return (
        "连接失败，已尝试：\n  "
        + "\n  ".join(tried)
        + "\n\n"
        + (last_detail or "未知错误")
        + f"\n\n文生图实际地址: {generations_url(base_url)}"
    )


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
