#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
饥荒风格装备图标生成 — 批量文生图 GUI

依赖：仓库根 secrets_openai.txt；tkinter；裁切需 Pillow（pip install pillow）。

用法：
  cd d:\\HeyBro
  python tools/饥荒风格装备图标生成.py

数据：classic-vanilla-dungeon-equipment.json + gearItems.json + wowBookRegistry.json
输出：temp/gear-icons-staging/（raw/ 原图，icons/ 64×64 图标，边长可在界面改）
画风：饥荒 / Klei Don't Starve（gptimage/dont_starve_style.py）；图标底 #d3d1b0 暖灰绿卡其纯色

发布：将 icons/<gearId>.png 复制到 public/assets/gear/<gearId>.png
"""

from __future__ import annotations

import queue
import sys
import threading
import time
import traceback
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import image2_generate as img2  # noqa: E402
from gear_icon_jobs import (  # noqa: E402
    COOLDOWN_SEC,
    CONSECUTIVE_FAILS_COOLDOWN,
    DEFAULT_STAGING,
    ICON_SIZE,
    GearIconJob,
    PER_JOB_MAX_TRIES,
    RETRY_GAP_SEC,
    GEAR_ICON_BG_HEX,
    GEAR_ICON_PUBLISH_DIR,
    build_gear_icon_prompt,
    icon_ready,
    import_gear_icons_to_project,
    load_gear_icon_jobs,
    process_icon_png,
    resolve_raw_image_path,
    write_manifest,
)


def _sleep_cancellable(
    total_sec: int,
    cancel: threading.Event,
    log_put,
    *,
    tick_sec: float = 5.0,
) -> bool:
    elapsed = 0.0
    next_log = 60.0
    while elapsed < total_sec:
        if cancel.is_set():
            log_put(f"[冷却] 用户取消（已等待 {int(elapsed)}s）。")
            return True
        step = min(tick_sec, total_sec - elapsed)
        time.sleep(step)
        elapsed += step
        if elapsed >= next_log:
            log_put(f"[冷却] 已等待 {int(elapsed)}/{total_sec}s…")
            next_log += 60.0
    log_put(f"[冷却] 已满 {total_sec}s，继续任务。")
    return False


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("饥荒风格装备图标生成")
        self.geometry("1000x720")
        self._jobs: list[GearIconJob] = []
        self._cancel = threading.Event()
        self._q: queue.Queue = queue.Queue()
        self._worker: threading.Thread | None = None

        f = ttk.Frame(self, padding=8)
        f.pack(fill=tk.BOTH, expand=True)

        r0 = ttk.Frame(f)
        r0.pack(fill=tk.X, pady=2)
        ttk.Label(
            r0,
            text=f"从 classic 装备表 + gearItems 读取 252 件；饥荒/Klei 手绘风；统一底色 {GEAR_ICON_BG_HEX}（暖灰绿卡其）。",
            wraplength=920,
        ).pack(anchor=tk.W)
        ttk.Label(
            r0,
            text=(
                "文生图需能访问 Base URL（默认中转）。若日志出现 WinError 10061「连接被拒绝」，"
                "多为地址错误、代理未开或网络拦截——请先点「测试 API 连接」。"
                "已有 raw 图可勾选「仅裁切」不调 API。"
            ),
            wraplength=920,
            foreground="#64748b",
        ).pack(anchor=tk.W, pady=(2, 0))

        r1 = ttk.Frame(f)
        r1.pack(fill=tk.X, pady=2)
        ttk.Label(r1, text="输出目录：").pack(side=tk.LEFT)
        self.var_out = tk.StringVar(value=str(DEFAULT_STAGING))
        ttk.Entry(r1, textvariable=self.var_out, width=72).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
        ttk.Button(r1, text="浏览…", command=self._browse_out).pack(side=tk.LEFT)
        ttk.Label(
            f,
            text=f"子目录 raw/（API 原图）→ icons/（裁切为图标边长，默认 {ICON_SIZE}×{ICON_SIZE}）；清单 manifest.tsv / manifest.json",
            wraplength=920,
        ).pack(anchor=tk.W, pady=(0, 4))

        r2 = ttk.Frame(f)
        r2.pack(fill=tk.X, pady=2)
        ttk.Label(r2, text="API Key 文件：").pack(side=tk.LEFT)
        self.var_key = tk.StringVar(value=str(ROOT / "secrets_openai.txt"))
        ttk.Entry(r2, textvariable=self.var_key, width=56).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
        ttk.Label(r2, text="Base URL：").pack(side=tk.LEFT)
        self.var_base = tk.StringVar(value=img2.DEFAULT_BASE_URL)
        ttk.Entry(r2, textvariable=self.var_base, width=36).pack(side=tk.LEFT, padx=4)

        r3 = ttk.Frame(f)
        r3.pack(fill=tk.X, pady=2)
        ttk.Label(r3, text="Model：").pack(side=tk.LEFT)
        self.var_model = tk.StringVar(value=img2.DEFAULT_MODEL)
        ttk.Entry(r3, textvariable=self.var_model, width=20).pack(side=tk.LEFT, padx=4)
        ttk.Label(r3, text="文生图 Size：").pack(side=tk.LEFT)
        self.var_size = tk.StringVar(value="1024x1024")
        ttk.Entry(r3, textvariable=self.var_size, width=14).pack(side=tk.LEFT, padx=4)
        ttk.Label(r3, text="图标边长：").pack(side=tk.LEFT, padx=(8, 0))
        self.var_icon_size = tk.StringVar(value=str(ICON_SIZE))
        ttk.Entry(r3, textvariable=self.var_icon_size, width=6).pack(side=tk.LEFT, padx=2)

        r3b = ttk.Frame(f)
        r3b.pack(fill=tk.X, pady=2)
        self.var_skip = tk.BooleanVar(value=True)
        ttk.Checkbutton(r3b, text="跳过已有 icons/", variable=self.var_skip).pack(side=tk.LEFT, padx=4)
        self.var_force = tk.BooleanVar(value=False)
        ttk.Checkbutton(r3b, text="强制覆盖已有图标", variable=self.var_force).pack(side=tk.LEFT, padx=8)
        self.var_reprocess = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            r3b,
            text="仅裁切（从 raw/ 到 icons/，不调 API）",
            variable=self.var_reprocess,
        ).pack(side=tk.LEFT, padx=8)

        r4 = ttk.Frame(f)
        r4.pack(fill=tk.X, pady=4)
        ttk.Label(r4, text="生成序号从").pack(side=tk.LEFT)
        self.var_from = tk.StringVar(value="1")
        ttk.Entry(r4, textvariable=self.var_from, width=8).pack(side=tk.LEFT, padx=2)
        ttk.Label(r4, text="到").pack(side=tk.LEFT)
        self.var_to = tk.StringVar(value="")
        ttk.Entry(r4, textvariable=self.var_to, width=8).pack(side=tk.LEFT, padx=2)
        ttk.Label(r4, text="（「到」留空 = 最后一条）").pack(side=tk.LEFT, padx=6)

        r5 = ttk.Frame(f)
        r5.pack(fill=tk.X, pady=6)
        ttk.Button(r5, text="① 生成清单", command=self._on_manifest).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="② 开始生成", command=self._on_generate).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="取消当前任务", command=self._on_cancel).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="仅测第 1 条", command=self._on_test_one).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="查看第 1 条提示词", command=self._on_preview_prompt).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="测试 API 连接", command=self._on_test_api).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="一键导入项目", command=self._on_import_project).pack(side=tk.LEFT, padx=8)

        self.var_status = tk.StringVar(value="就绪。建议先「测试 API 连接」，再「生成清单」→「开始生成」。")
        ttk.Label(f, textvariable=self.var_status, foreground="#0b57d0").pack(fill=tk.X, pady=4)

        self.prog = ttk.Progressbar(f, mode="determinate")
        self.prog.pack(fill=tk.X, pady=2)

        lf = ttk.LabelFrame(f, text="日志")
        lf.pack(fill=tk.BOTH, expand=True, pady=4)
        self.log = tk.Text(lf, height=16, wrap=tk.WORD, font=("Consolas", 9))
        sb = ttk.Scrollbar(lf, command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        self.log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        tvf = ttk.LabelFrame(f, text="任务预览（前 500 行）")
        tvf.pack(fill=tk.BOTH, expand=False, pady=4)
        cols = ("idx", "gearId", "dungeon", "nameCn", "slot")
        self.tree = ttk.Treeview(tvf, columns=cols, show="headings", height=8)
        self.tree.heading("idx", text="#")
        self.tree.heading("gearId", text="gearId")
        self.tree.heading("dungeon", text="副本")
        self.tree.heading("nameCn", text="装备名")
        self.tree.heading("slot", text="部位")
        self.tree.column("idx", width=40)
        self.tree.column("gearId", width=200)
        self.tree.column("dungeon", width=120)
        self.tree.column("nameCn", width=180)
        self.tree.column("slot", width=72)
        self.tree.pack(fill=tk.BOTH, expand=True)

        self.after(200, self._pump_queue)

    def _browse_out(self) -> None:
        cur = Path(self.var_out.get().strip() or str(DEFAULT_STAGING))
        initial = cur if cur.is_dir() else DEFAULT_STAGING
        if not initial.is_dir():
            initial = ROOT if ROOT.is_dir() else Path.home()
        p = filedialog.askdirectory(title="选择输出目录", initialdir=str(initial))
        if p:
            self.var_out.set(p)

    def _log(self, s: str) -> None:
        self.log.insert(tk.END, s + "\n")
        self.log.see(tk.END)

    def _ensure_jobs(self) -> bool:
        if self._jobs:
            return True
        try:
            self._jobs = load_gear_icon_jobs()
            return True
        except Exception as e:
            messagebox.showerror("加载失败", str(e))
            return False

    def _on_manifest(self) -> None:
        try:
            self._jobs = load_gear_icon_jobs()
        except Exception as e:
            messagebox.showerror("加载失败", str(e))
            return
        out = Path(self.var_out.get().strip())
        try:
            tsv, fullj = write_manifest(self._jobs, out)
        except Exception as e:
            messagebox.showerror("写入清单失败", str(e))
            return
        self.var_to.set(str(len(self._jobs)))
        self._refresh_tree()
        self._log(f"清单已写入：\n  {tsv}\n  {fullj}\n共 {len(self._jobs)} 件装备。")
        self.var_status.set(f"已加载 {len(self._jobs)} 件；输出：{out.resolve()}")
        messagebox.showinfo("完成", f"共 {len(self._jobs)} 件。\n对照表：manifest.tsv")

    def _refresh_tree(self) -> None:
        for x in self.tree.get_children():
            self.tree.delete(x)
        for j in self._jobs[:500]:
            self.tree.insert(
                "",
                tk.END,
                values=(j.index, j.gear_id, j.dungeon_name_cn, j.name_cn, j.slot_kind),
            )
        if len(self._jobs) > 500:
            self.tree.insert("", tk.END, values=("…", f"其余 {len(self._jobs) - 500} 条见 manifest", "", "", ""))

    def _slice_jobs(self) -> list[tuple[int, GearIconJob]]:
        if not self._ensure_jobs():
            return []
        n = len(self._jobs)
        try:
            a = int(self.var_from.get().strip() or "1")
        except ValueError:
            a = 1
        a = max(1, min(a, n))
        to_raw = self.var_to.get().strip()
        b = int(to_raw) if to_raw else n
        b = max(a, min(b, n))
        return [(i, self._jobs[i - 1]) for i in range(a, b + 1)]

    def _icon_size(self) -> int:
        try:
            v = int(self.var_icon_size.get().strip())
        except ValueError:
            v = ICON_SIZE
        return max(32, min(v, 512))

    def _on_cancel(self) -> None:
        self._cancel.set()
        self._log("已请求取消…")

    def _on_test_one(self) -> None:
        self.var_from.set("1")
        self.var_to.set("1")
        self._on_generate()

    def _api_endpoint(self) -> str:
        return img2.generations_url(self.var_base.get().strip())

    def _log_exception(self, prefix: str, e: BaseException, *, url: str | None = None) -> None:
        detail = img2.format_api_error(e, url=url or self._api_endpoint())
        self._log(f"{prefix}\n{detail}")
        cause = e.__cause__
        if cause and cause is not e:
            self._log(f"  原因链: {type(cause).__name__}: {cause}")

    def _on_test_api(self) -> None:
        key_file = Path(self.var_key.get().strip())
        base = self.var_base.get().strip()
        if not key_file.is_file():
            messagebox.showerror("缺少 Key", f"未找到 API Key 文件：\n{key_file}")
            return
        self._log("---- 测试 API 连接 ----")
        self._log(f"Base URL: {base}")
        self._log(f"文生图 endpoint: {self._api_endpoint()}")
        self.var_status.set("正在测试 API 连接…")
        self.update_idletasks()

        def work() -> None:
            try:
                msg = img2.probe_api_connection(key_file=key_file, base_url=base)
                ok = msg.startswith("连接成功")
                self._q.put(("log", msg))
                self._q.put(("status", "API 连接正常" if ok else "API 连接失败，见日志"))
                self._q.put(("alert", ("连接成功" if ok else "连接失败", msg, ok)))
            except SystemExit as e:
                self._q.put(("log", f"无法读取 Key：{e}"))
                self._q.put(("alert", ("缺少 Key", "请配置 secrets_openai.txt 或环境变量。", False)))
            except Exception as e:
                detail = img2.format_api_error(e, url=img2.generations_url(base))
                self._q.put(("log", f"[测试失败]\n{detail}"))
                self._q.put(("status", "API 测试异常"))
                self._q.put(("alert", ("测试异常", detail, False)))

        threading.Thread(target=work, daemon=True).start()

    def _on_import_project(self) -> None:
        out_root = Path(self.var_out.get().strip()).resolve()
        icons_dir = out_root / "icons"
        if not icons_dir.is_dir():
            messagebox.showerror("导入失败", f"未找到裁切目录：\n{icons_dir}\n请先完成裁切或检查输出目录。")
            return
        dest = GEAR_ICON_PUBLISH_DIR.resolve()
        if not messagebox.askyesno(
            "一键导入",
            f"将把已裁切图标从：\n  {icons_dir}\n复制到：\n  {dest}\n\n"
            "按 gearItems 清单匹配 gearId；目标文件将强制覆盖。\n是否继续？",
        ):
            return
        try:
            result = import_gear_icons_to_project(out_root)
        except Exception as e:
            messagebox.showerror("导入失败", str(e))
            return
        self._log(f"[导入] 已复制 {result.copied} 个 → {result.dest_dir}")
        if result.missing:
            self._log(f"[导入] icons/ 缺失 {result.missing} 件（未复制）")
        if result.manifest_rebuilt:
            self._log("[导入] 已刷新 assetManifest.json")
        elif result.manifest_error:
            self._log(f"[导入] assetManifest 未刷新：{result.manifest_error}")
        self.var_status.set(f"已导入 {result.copied} 个图标到 public/assets/gear/")
        msg = f"已覆盖复制 {result.copied} 个图标。\n目标：{dest}"
        if result.missing:
            msg += f"\n\nicons/ 中缺少 {result.missing} 件（见日志）。"
        if result.manifest_rebuilt:
            msg += "\n\n已更新 assetManifest.json。"
        elif result.manifest_error:
            msg += f"\n\nassetManifest 未自动更新，请手动运行 npm run build:asset-manifest。\n{result.manifest_error}"
        messagebox.showinfo("导入完成", msg)

    def _on_preview_prompt(self) -> None:
        if not self._ensure_jobs():
            return
        p = build_gear_icon_prompt(self._jobs[0])
        win = tk.Toplevel(self)
        win.title("第 1 条提示词预览")
        win.geometry("720x400")
        t = tk.Text(win, wrap=tk.WORD, font=("Consolas", 9))
        t.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)
        t.insert("1.0", p)
        t.configure(state=tk.DISABLED)

    def _on_generate(self) -> None:
        if self._worker and self._worker.is_alive():
            messagebox.showwarning("忙", "已有任务在运行。")
            return
        pairs = self._slice_jobs()
        if not pairs:
            return

        out_root = Path(self.var_out.get().strip()).resolve()
        key_file = Path(self.var_key.get().strip())
        reprocess = self.var_reprocess.get()
        if not reprocess and key_file and not key_file.is_file():
            messagebox.showerror("缺少 Key", f"未找到：{key_file}")
            return

        icon_size = self._icon_size()
        skip = self.var_skip.get()
        force = self.var_force.get()
        # Tk 变量只能在主线程读取；后台线程访问会导致 Windows 上界面卡死
        base_url = self.var_base.get().strip()
        api_model = self.var_model.get().strip()
        api_gen_size = self.var_size.get().strip()
        api_url = img2.generations_url(base_url)
        key_for_api = key_file if key_file.is_file() else None

        self._cancel.clear()
        self.prog["maximum"] = len(pairs)
        self.prog["value"] = 0

        def run() -> None:
            done = 0
            consecutive_fails = 0

            def qlog(s: str) -> None:
                self._q.put(("log", s))

            qlog("[任务] 后台线程已启动")
            (out_root / "raw").mkdir(parents=True, exist_ok=True)
            (out_root / "icons").mkdir(parents=True, exist_ok=True)
            if not reprocess:
                qlog(f"[API] 文生图 POST → {api_url}")
                qlog(f"[API] Model={api_model} Size={api_gen_size}")

            i = 0
            while i < len(pairs):
                if self._cancel.is_set():
                    qlog(f"用户取消。已完成 {done}/{len(pairs)}。")
                    break

                idx, job = pairs[i]
                raw_path = (out_root / "raw" / f"{job.gear_id}.png").resolve()
                icon_path = (out_root / "icons" / f"{job.gear_id}.png").resolve()

                qlog(f"---- 第 {idx} 条 {job.gear_id} | {job.name_cn} ({job.dungeon_name_cn}) ----")

                if skip and not force and icon_ready(icon_path):
                    qlog(f"[跳过] 图标已存在 → {icon_path}")
                    consecutive_fails = 0
                    i += 1
                    done += 1
                    self._q.put(("prog", done))
                    continue

                if reprocess:
                    raw_src = resolve_raw_image_path(raw_path)
                    if not raw_src.is_file():
                        qlog(f"[跳过] 无 raw：{raw_path}")
                        i += 1
                        done += 1
                        self._q.put(("prog", done))
                        continue
                    try:
                        if force and icon_path.is_file():
                            icon_path.unlink()
                        process_icon_png(raw_src, icon_path, icon_size)
                        qlog(f"[裁切成功] {raw_src.name} → {icon_path}")
                        consecutive_fails = 0
                    except Exception as e:
                        qlog(f"[裁切失败] {e!s}")
                        consecutive_fails += 1
                    i += 1
                    done += 1
                    self._q.put(("prog", done))
                    if consecutive_fails >= CONSECUTIVE_FAILS_COOLDOWN:
                        self._q.put(("status", f"连续失败，冷却 {COOLDOWN_SEC}s…"))
                        if _sleep_cancellable(COOLDOWN_SEC, self._cancel, qlog):
                            break
                        consecutive_fails = 0
                    continue

                self._q.put(("status", f"文生图 [{done + 1}/{len(pairs)}] {job.name_cn}"))
                last_err: BaseException | None = None
                ok = False
                for attempt in range(1, PER_JOB_MAX_TRIES + 1):
                    if self._cancel.is_set():
                        break
                    try:
                        if force and icon_path.is_file():
                            icon_path.unlink()
                        raw_for_crop = raw_path
                        if not icon_ready(raw_path):
                            prompt = build_gear_icon_prompt(job)
                            qlog(f"[提示词] {prompt[:200]}…")
                            qlog("[API] 正在请求文生图（单张约 30s～数分钟，请稍候）…")
                            raw_for_crop, multi_hint = img2.generate_to_file(
                                prompt,
                                raw_path,
                                key_file=key_for_api,
                                base_url=base_url,
                                model=api_model,
                                size=api_gen_size,
                            )
                            qlog(f"[文生图成功] 第{attempt}次 → {raw_for_crop}")
                            if multi_hint:
                                qlog(f"[API] {multi_hint}")
                        raw_for_crop = resolve_raw_image_path(raw_for_crop)
                        if not raw_for_crop.is_file():
                            raise FileNotFoundError(
                                f"裁切前找不到原图：{raw_path}\n"
                                f"已检查：{raw_path.name}、{raw_path.stem}_1{raw_path.suffix}"
                            )
                        process_icon_png(raw_for_crop, icon_path, icon_size)
                        qlog(f"[图标] → {icon_path}")
                        ok = True
                        consecutive_fails = 0
                        break
                    except Exception as e:
                        last_err = e
                        qlog(
                            f"[尝试 {attempt}/{PER_JOB_MAX_TRIES}] 失败\n"
                            f"{img2.format_api_error(e, url=api_url)}"
                        )
                        if attempt >= PER_JOB_MAX_TRIES:
                            qlog("[堆栈]\n" + traceback.format_exc().rstrip())
                        if attempt < PER_JOB_MAX_TRIES:
                            time.sleep(RETRY_GAP_SEC)

                if ok:
                    i += 1
                    done += 1
                    self._q.put(("prog", done))
                    continue

                if self._cancel.is_set():
                    break

                if last_err is not None:
                    qlog(f"[放弃] 本条最后错误\n{img2.format_api_error(last_err, url=api_url)}")
                consecutive_fails += 1
                if consecutive_fails >= CONSECUTIVE_FAILS_COOLDOWN:
                    self._q.put(("status", f"连续 {CONSECUTIVE_FAILS_COOLDOWN} 条失败，冷却 {COOLDOWN_SEC}s…"))
                    qlog(f"[策略] 休息 {COOLDOWN_SEC // 60} 分钟…")
                    if _sleep_cancellable(COOLDOWN_SEC, self._cancel, qlog):
                        break
                    consecutive_fails = 0
                    qlog(f"[重试] 冷却结束，再试第 {idx} 条")
                    continue

                i += 1
                done += 1
                self._q.put(("prog", done))

            self._q.put(("done",))

        self._worker = threading.Thread(target=run, daemon=True)
        self._worker.start()
        mode = "仅裁切" if reprocess else "文生图+裁切"
        self._log(f"开始批量（{mode}）：{len(pairs)} 条，图标 {icon_size}px，输出 {out_root}")
        self.var_status.set(f"批量进行中（{mode}）…")
        self.update_idletasks()

    def _dispatch_queue_msg(self, msg: tuple) -> None:
        kind = msg[0]
        if kind == "log":
            self._log(msg[1])
        elif kind == "status":
            self.var_status.set(msg[1])
        elif kind == "prog":
            self.prog["value"] = msg[1]
        elif kind == "alert":
            title, body, ok = msg[1]
            if ok:
                messagebox.showinfo(title, body)
            else:
                messagebox.showerror(title, body)
        elif kind == "done":
            self.var_status.set("本轮结束。")
            self._log("—— 本轮结束 ——")
            self._log("裁切完成；可点「一键导入项目」复制到 public/assets/gear/")

    def _pump_queue(self) -> None:
        try:
            while True:
                msg = self._q.get_nowait()
                try:
                    self._dispatch_queue_msg(msg)
                except Exception as e:
                    self._log(f"[界面队列处理错误] {type(e).__name__}: {e}\n  原始消息: {msg!r}")
        except queue.Empty:
            pass
        self.after(100, self._pump_queue)


def main() -> None:
    App().mainloop()


if __name__ == "__main__":
    main()
