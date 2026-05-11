#!/usr/bin/env python3
"""
Call Auto-Code relay (OpenAI-compatible) for images.

- Text-to-image: POST /v1/images/generations
- Image-to-image: POST /v1/images/edits (JSON + data URL source image)

Default base URL: https://vip.auto-code.net/v1

Exploration (no image cost): list models and print image-related ids.

API reference (parameters mirror upstream Images API): https://developers.openai.com/api/reference/resources/images
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://vip.auto-code.net/v1"
DEFAULT_KEY_FILE = Path(__file__).resolve().parent / "secrets_openai.txt"

IMAGE_MODEL_HINTS = ("image", "dall", "flux", "sd", "stable", "midjourney")


def load_api_key(args: argparse.Namespace) -> str:
    if getattr(args, "api_key", None):
        return str(args.api_key).strip()
    key_file = Path(args.api_key_file).expanduser() if args.api_key_file else DEFAULT_KEY_FILE
    if key_file.is_file():
        return key_file.read_text(encoding="utf-8").strip()
    for env in ("OPENAI_API_KEY", "AUTO_CODE_API_KEY"):
        v = os.environ.get(env)
        if v:
            return v.strip()
    print(
        "No API key: pass --api-key, set OPENAI_API_KEY, or put key in",
        DEFAULT_KEY_FILE,
        file=sys.stderr,
    )
    raise SystemExit(2)


def _request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: bytes | None = None,
) -> tuple[int, Any]:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw = resp.read().decode("utf-8")
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "application/json" in ctype or raw.lstrip().startswith("{"):
                return resp.status, json.loads(raw) if raw else {}
            return resp.status, raw
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body) if err_body else {}
        except json.JSONDecodeError:
            parsed = err_body
        raise RuntimeError(f"HTTP {e.code} {e.reason}: {parsed}") from e


def cmd_list_models(args: argparse.Namespace) -> int:
    key = load_api_key(args)
    base = args.base_url.rstrip("/")
    url = f"{base}/models"
    status, data = _request_json("GET", url, headers={"Authorization": f"Bearer {key}"})
    if status != 200:
        print("Unexpected status", status, data, file=sys.stderr)
        return 1
    rows = data.get("data") or []
    ids = sorted(str(m.get("id", "")) for m in rows if m.get("id"))
    print(f"Total models: {len(ids)}")
    hinted = [i for i in ids if any(h in i.lower() for h in IMAGE_MODEL_HINTS)]
    print("\nLikely image / edit / generation models:")
    for i in hinted:
        print(" ", i)
    if args.all_models:
        print("\nAll model ids:")
        for i in ids:
            print(" ", i)
    return 0


def _mime_for_path(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


def _image_to_data_url(path: Path) -> str:
    b64 = base64.standard_b64encode(path.read_bytes()).decode("ascii")
    mime = _mime_for_path(path)
    return f"data:{mime};base64,{b64}"


def _write_generation_items(data: Any, out_path: Path, output_format: str) -> int:
    """Parse /v1/images/generations response; write b64_json or download url."""
    if not isinstance(data, dict):
        print("Unexpected response (not JSON object):", str(data)[:2000], file=sys.stderr)
        return 1
    items = data.get("data") or []
    if not items:
        print("Unexpected response:", json.dumps(data, ensure_ascii=False, indent=2)[:8000])
        return 1

    out_dir = out_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = output_format or "png"

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        b64 = item.get("b64_json")
        raw: bytes | None = None
        if b64:
            raw = base64.standard_b64decode(b64)
        elif item.get("url"):
            u = str(item["url"])
            try:
                with urllib.request.urlopen(u, timeout=600) as r:
                    raw = r.read()
            except urllib.error.URLError as e:
                print("Failed to download url image:", e, file=sys.stderr)
                return 1
        if raw is None:
            print("No b64_json or url in item; keys:", list(item.keys()), file=sys.stderr)
            return 1
        path = out_path if len(items) == 1 else out_path.with_name(f"{out_path.stem}_{idx + 1}{out_path.suffix or '.' + ext}")
        path.write_bytes(raw)
        print("Wrote", path)

    usage = data.get("usage")
    if usage:
        print("Usage:", json.dumps(usage, ensure_ascii=False))
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    """OpenAI-style POST /v1/images/generations."""
    key = load_api_key(args)
    base = args.base_url.rstrip("/")

    payload: dict[str, Any] = {
        "prompt": args.prompt,
        "model": args.model,
        "n": args.n,
    }
    if args.size:
        payload["size"] = args.size
    if args.quality:
        payload["quality"] = args.quality
    if args.background:
        payload["background"] = args.background
    if args.output_format:
        payload["output_format"] = args.output_format
    if args.output_compression is not None:
        payload["output_compression"] = args.output_compression
    if args.user:
        payload["user"] = args.user
    if args.stream:
        print("Streaming mode is not fully handled; omit --stream.", file=sys.stderr)
        return 2

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    url = f"{base}/images/generations"
    _, data = _request_json("POST", url, headers=headers, body=body)
    out_path = Path(args.out).expanduser().resolve()
    return _write_generation_items(data, out_path, args.output_format or "png")


def cmd_edit_json(args: argparse.Namespace) -> int:
    """OpenAI-style JSON body for /v1/images/edits (images[].image_url can be a data URL)."""
    key = load_api_key(args)
    base = args.base_url.rstrip("/")
    src = Path(args.image).expanduser().resolve()
    if not src.is_file():
        print("Source image not found:", src, file=sys.stderr)
        return 2

    payload: dict[str, Any] = {
        "images": [{"image_url": _image_to_data_url(src)}],
        "prompt": args.prompt,
        "model": args.model,
        "n": args.n,
    }
    if args.size:
        payload["size"] = args.size
    if args.quality:
        payload["quality"] = args.quality
    if args.background:
        payload["background"] = args.background
    if args.output_format:
        payload["output_format"] = args.output_format
    if args.output_compression is not None:
        payload["output_compression"] = args.output_compression
    if args.input_fidelity:
        payload["input_fidelity"] = args.input_fidelity
    if args.moderation:
        payload["moderation"] = args.moderation
    if args.user:
        payload["user"] = args.user
    if args.stream:
        payload["stream"] = True

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    url = f"{base}/images/edits"
    if args.stream:
        print("Streaming mode is not fully handled in this script; omit --stream for a single PNG.", file=sys.stderr)
        return 2

    _, data = _request_json("POST", url, headers=headers, body=body)
    out_path = Path(args.out).expanduser().resolve()
    return _write_generation_items(data, out_path, args.output_format or "png")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Auto-Code VIP images: generations (text-to-image) + edits (image-to-image)")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"OpenAI-compatible base (default: {DEFAULT_BASE_URL})")
    p.add_argument(
        "--api-key-file",
        default=str(DEFAULT_KEY_FILE),
        help="Plaintext file containing the API key (default: secrets_openai.txt next to this script)",
    )
    p.add_argument("--api-key", default=None, help="API key inline (overrides file/env)")

    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("list-models", help="GET /v1/models and print image-related model ids")
    pl.add_argument("--all-models", action="store_true", help="Print every model id")
    pl.set_defaults(func=cmd_list_models)

    pg = sub.add_parser("generate", help="POST /v1/images/generations (text-to-image)")
    pg.add_argument("--prompt", required=True, help="Generation prompt")
    pg.add_argument(
        "--model",
        default="gpt-image-2",
        help='Model id (e.g. "gpt-image-2")',
    )
    pg.add_argument("--n", type=int, default=1, help="Number of images (gateway limits apply)")
    pg.add_argument("--size", default="1024x1024", help='e.g. "1024x1024", "1536x1024", "auto"')
    pg.add_argument("--quality", default=None, help='For GPT image models: "low"|"medium"|"high"|"auto"')
    pg.add_argument("--background", default=None, help='"transparent"|"opaque"|"auto"')
    pg.add_argument("--output-format", default="png", help='"png"|"jpeg"|"webp"')
    pg.add_argument("--output-compression", type=int, default=None, help="0-100 for jpeg/webp")
    pg.add_argument("--user", default=None, help="End-user id string for abuse tracking")
    pg.add_argument("--stream", action="store_true", help="(Not implemented)")
    pg.add_argument("--out", default="out_generate.png", help="Output image path")
    pg.set_defaults(func=cmd_generate)

    pe = sub.add_parser("edit", help="POST /v1/images/edits (JSON + data URL source image)")
    pe.add_argument("--image", required=True, help="Path to source image (png/jpeg/webp)")
    pe.add_argument("--prompt", required=True, help="Edit / transformation instruction")
    pe.add_argument(
        "--model",
        default="gpt-image-2",
        help="Model id (this relay exposes gpt-image-2, gpt-image-2-2026-04-21, gpt-image-1*, etc.)",
    )
    pe.add_argument("--n", type=int, default=1, help="Number of output images (gateway/model limits apply)")
    pe.add_argument("--size", default=None, help='e.g. "1024x1024", "1536x1024", "auto", or WxH for gpt-image-2')
    pe.add_argument("--quality", default=None, help='For GPT image models: "low"|"medium"|"high"|"auto"')
    pe.add_argument("--background", default=None, help='"transparent"|"opaque"|"auto"')
    pe.add_argument("--output-format", default="png", help='"png"|"jpeg"|"webp"')
    pe.add_argument("--output-compression", type=int, default=None, help="0-100 for jpeg/webp")
    pe.add_argument("--input-fidelity", default=None, help='"high"|"low"')
    pe.add_argument("--moderation", default=None, help='"low"|"auto"')
    pe.add_argument("--user", default=None, help="End-user id string for abuse tracking")
    pe.add_argument("--stream", action="store_true", help="(Not implemented) would request streaming")
    pe.add_argument("--out", default="out_edit.png", help="Output image path (.png/.jpg/.webp)")
    pe.set_defaults(func=cmd_edit_json)

    return p


def main() -> int:
    args = build_parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
