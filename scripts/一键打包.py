#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HeyBro 一键打包（Tkinter GUI）

- 执行 npm run build，将 dist/ 打成 zip 放到 release/
- 若存在 scripts/credentials.json，将 dist/ 同步到 RustFS（S3）桶供内网玩家访问
- 日志显示进度、产物体积；单张图片 > 1 MiB 时输出【提醒】
- release/ 与 dist/ 已在 .gitignore，不纳入版本库

用法（项目根目录）:
  python scripts/一键打包.py
  npm run 一键打包

内网上传：复制 scripts/credentials.example.json 为 credentials.json 并填入密钥。
"""

from __future__ import annotations

import io
import json
import mimetypes
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from tkinter import END, messagebox, ttk
from tkinter.scrolledtext import ScrolledText
import tkinter as tk
from urllib.parse import urlparse

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
LARGE_IMAGE_BYTES = 1024 * 1024  # 1 MiB

DEFAULT_S3_ENDPOINT = "http://192.168.1.10:9011"
DEFAULT_S3_BUCKET = "heybro"
DEFAULT_PUBLIC_BASE_URL = "http://192.168.1.10:9011/heybro/"

CONTENT_TYPE_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


def script_dir() -> Path:
    return Path(__file__).resolve().parent


def repo_root() -> Path:
    return script_dir().parent


def credentials_path() -> Path:
    return script_dir() / "credentials.json"


def read_package_version(root: Path) -> str:
    pkg = root / "package.json"
    try:
        data = json.loads(pkg.read_text(encoding="utf-8"))
        v = data.get("version")
        if isinstance(v, str) and v.strip():
            return v.strip()
    except (OSError, json.JSONDecodeError):
        pass
    return "0.0.0"


def fmt_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KiB"
    return f"{n / (1024 * 1024):.2f} MiB"


def dir_size(path: Path) -> int:
    total = 0
    if not path.is_dir():
        return 0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def find_large_images(root: Path) -> list[tuple[Path, int]]:
    out: list[tuple[Path, int]] = []
    if not root.is_dir():
        return out
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in IMAGE_EXTS:
            continue
        try:
            sz = p.stat().st_size
        except OSError:
            continue
        if sz > LARGE_IMAGE_BYTES:
            out.append((p, sz))
    out.sort(key=lambda x: -x[1])
    return out


def zip_dist(dist_dir: Path, zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for file_path in sorted(dist_dir.rglob("*")):
            if not file_path.is_file():
                continue
            arc = file_path.relative_to(dist_dir).as_posix()
            zf.write(file_path, arc)


def npm_executable() -> str:
    for name in ("npm.cmd", "npm"):
        found = shutil.which(name)
        if found:
            return found
    return "npm.cmd" if os.name == "nt" else "npm"


def _cred_field(data: dict, *keys: str) -> str | None:
    for k in keys:
        v = data.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


@dataclass(frozen=True)
class S3UploadConfig:
    access_key: str
    secret_key: str
    endpoint: str
    bucket: str
    region: str
    prefix: str
    public_base_url: str
    signature_version: str
    addressing_style: str
    object_acl: str | None  # 例如 public-read；None 表示不设 ACL，仅靠桶策略


def load_s3_upload_config() -> S3UploadConfig | None:
    path = credentials_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise ValueError(f"无法读取 {path.name}：{e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} 须为 JSON 对象。")

    access_key = _cred_field(data, "accessKey", "access_key", "AccessKeyId")
    secret_key = _cred_field(data, "secretKey", "secret_key", "SecretAccessKey")
    if not access_key or not secret_key:
        raise ValueError(f"{path.name} 缺少 accessKey / secretKey。")

    endpoint = _cred_field(data, "endpoint", "url", "s3Endpoint") or DEFAULT_S3_ENDPOINT
    bucket = _cred_field(data, "bucket", "Bucket") or DEFAULT_S3_BUCKET
    region = _cred_field(data, "region", "Region") or "us-east-1"
    prefix = (_cred_field(data, "prefix", "keyPrefix") or "").strip().strip("/")
    public_base = _cred_field(data, "publicBaseUrl", "publicUrl") or DEFAULT_PUBLIC_BASE_URL
    if not public_base.endswith("/"):
        public_base += "/"

    api = (_cred_field(data, "api") or "s3v4").lower()
    signature_version = "s3v4" if api in ("s3v4", "v4", "s4") else "s3"

    path_mode = (_cred_field(data, "path") or "auto").lower()
    addressing_style = resolve_addressing_style(endpoint, path_mode)

    acl_raw = data.get("objectAcl", data.get("object_acl", "public-read"))
    object_acl: str | None
    if acl_raw is None or (isinstance(acl_raw, str) and acl_raw.strip().lower() in ("", "none", "false", "off")):
        object_acl = None
    elif isinstance(acl_raw, str):
        object_acl = acl_raw.strip()
    else:
        object_acl = "public-read"

    return S3UploadConfig(
        access_key=access_key,
        secret_key=secret_key,
        endpoint=endpoint.rstrip("/"),
        bucket=bucket,
        region=region,
        prefix=prefix,
        public_base_url=public_base,
        signature_version=signature_version,
        addressing_style=addressing_style,
        object_acl=object_acl,
    )


def resolve_addressing_style(endpoint: str, path_setting: str) -> str:
    if path_setting in ("path", "virtual"):
        return path_setting
    host = (urlparse(endpoint).hostname or "").lower()
    if not host:
        return "path"
    if host in ("localhost", "127.0.0.1"):
        return "path"
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
        return "path"
    return "virtual"


def guess_content_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in CONTENT_TYPE_OVERRIDES:
        return CONTENT_TYPE_OVERRIDES[ext]
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def object_key_for_dist_file(dist_dir: Path, file_path: Path, prefix: str) -> str:
    rel = file_path.relative_to(dist_dir).as_posix()
    if prefix:
        return f"{prefix}/{rel}"
    return rel


def inject_html_base_href(html: str, base_href: str) -> str:
    """桶子路径部署时插入 <base href>，避免访问 /heybro 无尾斜杠导致 ./assets 解析到根路径。"""
    if not base_href.endswith("/"):
        base_href += "/"
    if re.search(r"<base\s", html, re.IGNORECASE):
        return html
    escaped = base_href.replace('"', "%22")
    tag = f'    <base href="{escaped}" />\n'
    m = re.search(r"<head[^>]*>", html, re.IGNORECASE)
    if m:
        pos = m.end()
        return html[:pos] + "\n" + tag + html[pos:]
    return tag + html


def read_file_for_upload(file_path: Path, cfg: S3UploadConfig) -> tuple[bytes | None, Path | None]:
    """返回 (bytes, None) 表示用内存上传； (None, path) 表示直接传文件。"""
    if file_path.suffix.lower() != ".html":
        return None, file_path
    base = cfg.public_base_url.strip()
    if not base:
        return None, file_path
    text = file_path.read_text(encoding="utf-8")
    patched = inject_html_base_href(text, base)
    if patched == text:
        return None, file_path
    return patched.encode("utf-8"), None


def make_s3_client(cfg: S3UploadConfig):
    try:
        import boto3
        from botocore.config import Config
    except ImportError as e:
        raise RuntimeError("未安装 boto3，请执行：pip install boto3") from e
    return boto3.client(
        "s3",
        endpoint_url=cfg.endpoint,
        aws_access_key_id=cfg.access_key,
        aws_secret_access_key=cfg.secret_key,
        region_name=cfg.region,
        config=Config(
            signature_version=cfg.signature_version,
            s3={"addressing_style": cfg.addressing_style},
        ),
    )


def upload_extra_args(
    cfg: S3UploadConfig, content_type: str, use_acl: bool, file_path: Path
) -> dict:
    extra: dict = {
        "ContentType": content_type,
        "ContentDisposition": "inline",
    }
    if file_path.suffix.lower() in (".js", ".css", ".wasm", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2"):
        extra["CacheControl"] = "public, max-age=31536000, immutable"
    elif file_path.suffix.lower() == ".html":
        extra["CacheControl"] = "no-cache"
    if use_acl and cfg.object_acl:
        extra["ACL"] = cfg.object_acl
    return extra


def sync_dist_to_s3(dist_dir: Path, cfg: S3UploadConfig, log: Callable[[str], None]) -> tuple[int, int]:
    from botocore.exceptions import ClientError

    client = make_s3_client(cfg)
    use_acl = bool(cfg.object_acl)

    files = sorted(p for p in dist_dir.rglob("*") if p.is_file())
    total = len(files)
    if total == 0:
        raise RuntimeError("dist/ 内没有可上传的文件。")

    uploaded = 0
    bytes_sum = 0
    acl_disabled = False
    for i, file_path in enumerate(files, 1):
        key = object_key_for_dist_file(dist_dir, file_path, cfg.prefix)
        content_type = guess_content_type(file_path)
        sz = file_path.stat().st_size
        body, upload_path = read_file_for_upload(file_path, cfg)
        extra = upload_extra_args(cfg, content_type, use_acl and not acl_disabled, file_path)
        try:
            if body is not None:
                client.upload_fileobj(io.BytesIO(body), cfg.bucket, key, ExtraArgs=extra)
            else:
                assert upload_path is not None
                client.upload_file(str(upload_path), cfg.bucket, key, ExtraArgs=extra)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if use_acl and not acl_disabled and code in ("AccessDenied", "InvalidRequest", "NotImplemented"):
                if uploaded == 0:
                    log("      服务端不支持或未允许 ACL，改为仅依赖桶策略公开读。", "warn")
                acl_disabled = True
                extra = upload_extra_args(cfg, content_type, False, file_path)
                if body is not None:
                    client.upload_fileobj(io.BytesIO(body), cfg.bucket, key, ExtraArgs=extra)
                else:
                    client.upload_file(str(upload_path), cfg.bucket, key, ExtraArgs=extra)
            else:
                raise
        uploaded += 1
        bytes_sum += sz
        if i == 1 or i == total or i % 25 == 0:
            log(f"      上传 {i}/{total}  {key}  ({fmt_bytes(sz)})")

    if cfg.object_acl and not acl_disabled:
        log(f"      已设置对象 ACL：{cfg.object_acl}")
    log(f"      HTML 已注入 <base href=\"{cfg.public_base_url}\">（若尚未存在）")
    log("      玩家请打开带 index.html 的链接；勿只打开 /heybro（无尾斜杠）。")
    log("      若浏览器仍 AccessDenied，请运行：python scripts/配置内网桶公开读.py")
    return uploaded, bytes_sum


class PackagerApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.root_dir = repo_root()
        self.version = read_package_version(self.root_dir)
        self.release_dir = self.root_dir / "release"
        self.dist_dir = self.root_dir / "dist"
        self._s3_cfg: S3UploadConfig | None = None
        self._upload_target = "未配置（无 scripts/credentials.json）"
        try:
            self._s3_cfg = load_s3_upload_config()
            if self._s3_cfg:
                self._upload_target = (
                    f"{self._s3_cfg.endpoint}  桶 {self._s3_cfg.bucket}"
                    + (f"  前缀 {self._s3_cfg.prefix}/" if self._s3_cfg.prefix else "")
                )
        except ValueError as e:
            self._upload_target = f"配置错误：{e}"
        self._log_queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._running = False

        self.title(f"HeyBro 一键打包 · v{self.version}")
        self.geometry("720x560")
        self.minsize(560, 420)

        top = ttk.Frame(self, padding=8)
        top.pack(fill=tk.X)
        ttk.Label(top, text=f"项目：{self.root_dir}").pack(anchor=tk.W)
        ttk.Label(top, text=f"输出目录：{self.release_dir}  （已 gitignore）").pack(anchor=tk.W)
        ttk.Label(top, text=f"内网发布：{self._upload_target}").pack(anchor=tk.W)

        btn_row = ttk.Frame(self, padding=(8, 0))
        btn_row.pack(fill=tk.X)
        self.btn_start = ttk.Button(btn_row, text="开始打包", command=self.start_pack)
        self.btn_start.pack(side=tk.LEFT, padx=(0, 8))
        self.btn_open = ttk.Button(btn_row, text="打开 release 文件夹", command=self.open_release, state=tk.DISABLED)
        self.btn_open.pack(side=tk.LEFT)

        self.status_var = tk.StringVar(value="就绪。点击「开始打包」。")
        ttk.Label(self, textvariable=self.status_var, padding=(8, 4)).pack(anchor=tk.W)

        log_frame = ttk.LabelFrame(self, text="打包日志", padding=4)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=8, pady=4)
        self.log = ScrolledText(log_frame, height=20, wrap=tk.WORD, font=("Consolas", 10))
        self.log.pack(fill=tk.BOTH, expand=True)

        self.after(100, self._drain_log_queue)
        self._configure_tags()

    def log_line(self, msg: str, tag: str = "") -> None:
        self._log_queue.put((msg, tag))

    def _drain_log_queue(self) -> None:
        while True:
            try:
                msg, tag = self._log_queue.get_nowait()
            except queue.Empty:
                break
            self.log.insert(END, msg + "\n", tag if tag else ())
            self.log.see(END)
        self.after(100, self._drain_log_queue)

    def open_release(self) -> None:
        self.release_dir.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(self.release_dir)  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", str(self.release_dir)], check=False)

    def start_pack(self) -> None:
        if self._running:
            return
        if not (self.root_dir / "package.json").is_file():
            messagebox.showerror("错误", f"未找到 package.json：\n{self.root_dir}")
            return
        self._running = True
        self.btn_start.configure(state=tk.DISABLED)
        self.btn_open.configure(state=tk.DISABLED)
        self.log.delete("1.0", END)
        self.status_var.set("打包进行中…")
        self._worker = threading.Thread(target=self._pack_worker, daemon=True)
        self._worker.start()

    def _pack_worker(self) -> None:
        t0 = time.time()
        ok = False
        upload_ok = False
        zip_path: Path | None = None
        play_url = ""
        try:
            self.log_line(f"=== HeyBro 一键打包  v{self.version}  {datetime.now():%Y-%m-%d %H:%M:%S} ===")
            self.log_line("")

            npm = npm_executable()
            self.log_line(f"[1/5] 执行构建：{npm} run build")
            self.log_line(f"      工作目录：{self.root_dir}")
            self.log_line("")

            proc = subprocess.Popen(
                [npm, "run", "build"],
                cwd=str(self.root_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=False,
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                self.log_line(line.rstrip("\n\r"))
            code = proc.wait()
            if code != 0:
                self.log_line("")
                self.log_line(f"【失败】构建退出码 {code}，未生成 zip。", "fail")
                self._set_status("构建失败。")
                return

            if not self.dist_dir.is_dir() or not (self.dist_dir / "index.html").is_file():
                self.log_line("【失败】dist/ 不存在或缺少 index.html。", "fail")
                self._set_status("dist 无效。")
                return

            dist_bytes = dir_size(self.dist_dir)
            self.log_line("")
            self.log_line(f"[2/5] 构建完成。dist/ 合计：{fmt_bytes(dist_bytes)}（{self._count_files(self.dist_dir)} 个文件）")

            self.log_line("")
            self.log_line("[3/5] 扫描大图（单张 > 1 MiB）…")
            large = find_large_images(self.dist_dir)
            if not large:
                self.log_line("      未发现超过 1 MiB 的图片。")
            else:
                self.log_line(f"      共 {len(large)} 张，建议压缩或降分辨率：", "warn")
                for p, sz in large:
                    rel = p.relative_to(self.dist_dir).as_posix()
                    self.log_line(f"      【提醒】{rel}  →  {fmt_bytes(sz)}", "warn")

            self.log_line("")
            self.log_line("[4/5] 正在压缩为 zip…")
            self.release_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            zip_name = f"heybro-dist-v{self.version}-{stamp}.zip"
            zip_path = self.release_dir / zip_name
            zip_dist(self.dist_dir, zip_path)
            zip_bytes = zip_path.stat().st_size

            upload_ok = False
            play_url = ""
            self.log_line("")
            if self._s3_cfg is None:
                self.log_line("[5/5] 跳过上传：未找到 scripts/credentials.json", "warn")
            else:
                self.log_line("[5/5] 上传到内网 RustFS（S3）…")
                self.log_line(f"      端点：{self._s3_cfg.endpoint}")
                self.log_line(f"      桶：{self._s3_cfg.bucket}")
                try:
                    n_files, n_bytes = sync_dist_to_s3(self.dist_dir, self._s3_cfg, self.log_line)
                    upload_ok = True
                    play_url = f"{self._s3_cfg.public_base_url}index.html"
                    self.log_line("")
                    self.log_line(f"      已上传 {n_files} 个文件，合计 {fmt_bytes(n_bytes)}", "ok")
                    self.log_line(f"      玩家入口：{play_url}", "ok")
                except Exception as up_err:
                    self.log_line(f"      【上传失败】{up_err}", "fail")

            elapsed = time.time() - t0
            self.log_line("")
            self.log_line("=== 打包成功 ===", "ok")
            self.log_line(f"  zip 路径：{zip_path}")
            self.log_line(f"  zip 大小：{fmt_bytes(zip_bytes)}")
            self.log_line(f"  dist 大小：{fmt_bytes(dist_bytes)}")
            if upload_ok and play_url:
                self.log_line(f"  内网游玩：{play_url}")
            elif self._s3_cfg and not upload_ok:
                self.log_line("  内网桶：上传失败，请检查 RustFS 与 credentials.json。", "warn")
            self.log_line(f"  耗时：{elapsed:.1f} 秒")
            ok = True
            status = f"完成 · zip {fmt_bytes(zip_bytes)}"
            if upload_ok:
                status += " · 已上传内网桶"
            elif self._s3_cfg:
                status += " · 上传失败"
            self._set_status(status)
        except Exception as e:
            self.log_line("")
            self.log_line(f"【异常】{e}", "fail")
            self._set_status("打包异常。")
        finally:
            def done() -> None:
                self._running = False
                self.btn_start.configure(state=tk.NORMAL)
                if ok:
                    self.btn_open.configure(state=tk.NORMAL)
                if ok and zip_path:
                    extra = ""
                    if upload_ok and play_url:
                        extra = f"\n\n内网游玩：\n{play_url}"
                    elif self._s3_cfg and not upload_ok:
                        extra = "\n\n内网桶上传失败，请查看日志。"
                    messagebox.showinfo(
                        "打包完成",
                        f"版本 v{self.version}\n\n"
                        f"zip：{zip_path.name}\n"
                        f"大小：{fmt_bytes(zip_path.stat().st_size)}\n\n"
                        f"目录：{self.release_dir}{extra}",
                    )

            self.after(0, done)

    def _set_status(self, text: str) -> None:
        self.after(0, lambda: self.status_var.set(text))

    @staticmethod
    def _count_files(root: Path) -> int:
        return sum(1 for p in root.rglob("*") if p.is_file())

    def _configure_tags(self) -> None:
        self.log.tag_configure("ok", foreground="#15803d")
        self.log.tag_configure("warn", foreground="#b45309")
        self.log.tag_configure("fail", foreground="#b91c1c")


def main() -> None:
    app = PackagerApp()
    app.mainloop()


if __name__ == "__main__":
    main()
