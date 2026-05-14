#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
魔兽世界五人副本提示词 — 批量文生图 GUI

依赖：仓库根目录 secrets_openai.txt（或自选路径）；tkinter；圆切需 Pillow（`pip install pillow`）。

用法：
  cd d:\\HeyBro
  python tools/wow_portrait_gui.py

流程：
  1. 数据源二选一（条目数一致时任选其一即可）：
     - **Markdown**（默认）：`docs/魔兽世界5人副本_饥荒风提示词大全.md`（须先 `npm run gen:wow-famine-md`）
     - **wowBook JSON**：直接读表，不依赖 MD
  2. 默认输出到仓库 `temp/wow-portraits-staging/`：方图 `wow-mobs/`、`wow-bosses/`；圆图 `wow-mobs-circle/`、`wow-bosses-circle/`（方图写出或已存在后立刻圆切）。拷入游戏前可将圆图复制到 `public/assets` 下对应目录。
  3. 点击「生成清单」→ manifest.tsv / manifest.json / manifest_full.json
  4. 设置起止序号（1-based），勾选「跳过已存在」（仅当方图与圆图都已存在时才跳过整条；有方图无圆图则只补圆切）
  5. 「开始生成」…

重试与冷却（适合半夜挂机）：
  - 文生图单条最多 3 次；圆切单条最多 3 次；每次重试间隔约 2s。
  - 若连续 3 条在耗尽重试后仍失败，则休息 10 分钟；**冷却结束后自动再试同一「清单条目」**（最多再试一轮），仍失败则进入下一条。
  - 任一条成功或方图+圆图均已存在跳过，会清零「连续失败」计数。
"""

from __future__ import annotations

import queue
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
# 先落盘到临时根目录（圆切 / 修图后再复制到 public/assets）；相对路径与正式资源一致
WOW_PORTRAIT_STAGING_ROOT = ROOT / "temp" / "wow-portraits-staging"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import image2_generate as img2  # noqa: E402
from wow_book_art_jobs import load_wow_book_art_jobs  # noqa: E402
from wow_md_parse_jobs import WowImageJob, parse_wow_prompt_md, write_manifest  # noqa: E402
from wow_portrait_circle import circle_output_path_for_square, write_circle_from_square  # noqa: E402

# 单张最多请求次数；连续多少「整张失败」后进入冷却；冷却秒数；同一张重试间隔
PER_IMAGE_MAX_TRIES = 3
CIRCLE_MAX_TRIES = 3
CONSECUTIVE_JOB_FAILS_BEFORE_COOLDOWN = 3
COOLDOWN_SECONDS = 600
RETRY_GAP_SECONDS = 2.0


def _sleep_cancellable(
    total_sec: int,
    cancel: threading.Event,
    log_put,
    *,
    tick_sec: float = 5.0,
) -> bool:
    """
    睡眠 total_sec 秒，期间每 tick_sec 检查 cancel。
    经 log_put(str) 写日志（建议走队列）。
    若被用户取消返回 True，否则 False。
    """
    elapsed = 0.0
    next_log = 60.0
    while elapsed < total_sec:
        if cancel.is_set():
            log_put(f"[冷却] 用户在等待中取消（已等待 {int(elapsed)}s）。")
            return True
        step = min(tick_sec, total_sec - elapsed)
        time.sleep(step)
        elapsed += step
        if elapsed >= next_log:
            log_put(f"[冷却] 已等待 {int(elapsed)}/{total_sec}s，接口恢复中…")
            next_log += 60.0
    log_put(f"[冷却] 已满 {total_sec}s，继续任务。")
    return False


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("WoW 五人副本 — 文生图批量工具")
        self.geometry("1000x720")
        self._jobs: list[WowImageJob] = []
        self._cancel = threading.Event()
        self._q: queue.Queue = queue.Queue()
        self._worker: threading.Thread | None = None

        f = ttk.Frame(self, padding=8)
        f.pack(fill=tk.BOTH, expand=True)

        r0a = ttk.Frame(f)
        r0a.pack(fill=tk.X, pady=2)
        self.var_source = tk.StringVar(value="md")
        ttk.Label(r0a, text="数据源：").pack(side=tk.LEFT)
        ttk.Radiobutton(
            r0a,
            text="wowBook JSON（U* 小怪 + B* 首领）",
            variable=self.var_source,
            value="json",
            command=self._sync_source_widgets,
        ).pack(side=tk.LEFT, padx=4)
        ttk.Radiobutton(
            r0a,
            text="Markdown 大全",
            variable=self.var_source,
            value="md",
            command=self._sync_source_widgets,
        ).pack(side=tk.LEFT, padx=4)

        r0 = ttk.Frame(f)
        r0.pack(fill=tk.X, pady=2)
        ttk.Label(r0, text="提示词 MD：").pack(side=tk.LEFT)
        self.var_md = tk.StringVar(value=str(ROOT / "docs" / "魔兽世界5人副本_饥荒风提示词大全.md"))
        self.ent_md = ttk.Entry(r0, textvariable=self.var_md, width=72)
        self.ent_md.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
        self.btn_md = ttk.Button(r0, text="浏览…", command=self._browse_md)
        self.btn_md.pack(side=tk.LEFT)

        r1 = ttk.Frame(f)
        r1.pack(fill=tk.X, pady=2)
        ttk.Label(r1, text="输出目录：").pack(side=tk.LEFT)
        self.var_out = tk.StringVar(value=str(WOW_PORTRAIT_STAGING_ROOT))
        ttk.Entry(r1, textvariable=self.var_out, width=72).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
        ttk.Button(r1, text="浏览…", command=self._browse_out).pack(side=tk.LEFT)
        r1h = ttk.Frame(f)
        r1h.pack(fill=tk.X, pady=(0, 4))
        ttk.Label(
            r1h,
            text=(
                "说明：默认写入临时根目录；方图 wow-mobs/、wow-bosses/；圆图 wow-mobs-circle/、wow-bosses-circle/。"
                "文生图成功或方图已存在后会立刻裁圆。发布时可将圆图拷入 public/assets。"
            ),
            wraplength=920,
            justify=tk.LEFT,
        ).pack(anchor=tk.W)

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
        ttk.Label(r3, text="Size：").pack(side=tk.LEFT)
        self.var_size = tk.StringVar(value="1024x1024")
        ttk.Entry(r3, textvariable=self.var_size, width=14).pack(side=tk.LEFT, padx=4)
        ttk.Label(r3, text="圆切直径：").pack(side=tk.LEFT, padx=(8, 0))
        self.var_circle_size = tk.StringVar(value="256")
        ttk.Entry(r3, textvariable=self.var_circle_size, width=6).pack(side=tk.LEFT, padx=2)
        self.var_scene = tk.BooleanVar(value=False)
        self.chk_scene = ttk.Checkbutton(r3, text="包含副本环境插画（SCENE）", variable=self.var_scene)
        self.chk_scene.pack(side=tk.LEFT, padx=12)
        self.var_skip = tk.BooleanVar(value=True)
        ttk.Checkbutton(r3, text="跳过已有（方图+圆图齐全才跳过）", variable=self.var_skip).pack(side=tk.LEFT, padx=8)

        r4 = ttk.Frame(f)
        r4.pack(fill=tk.X, pady=4)
        ttk.Label(r4, text="生成序号从").pack(side=tk.LEFT)
        self.var_from = tk.StringVar(value="1")
        ttk.Entry(r4, textvariable=self.var_from, width=8).pack(side=tk.LEFT, padx=2)
        ttk.Label(r4, text="到").pack(side=tk.LEFT)
        self.var_to = tk.StringVar(value="")
        ttk.Entry(r4, textvariable=self.var_to, width=8).pack(side=tk.LEFT, padx=2)
        ttk.Label(r4, text="（留空「到」= 到最后一条）").pack(side=tk.LEFT, padx=6)

        r5 = ttk.Frame(f)
        r5.pack(fill=tk.X, pady=6)
        ttk.Button(r5, text="① 生成清单", command=self._on_manifest).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="② 开始生成", command=self._on_generate).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="取消当前任务", command=self._on_cancel).pack(side=tk.LEFT, padx=2)
        ttk.Button(r5, text="仅测第 1 条", command=self._on_test_one).pack(side=tk.LEFT, padx=2)

        self.var_status = tk.StringVar(value="就绪。请先点「生成清单」（JSON 或 Markdown）。")
        ttk.Label(f, textvariable=self.var_status, foreground="#0b57d0").pack(fill=tk.X, pady=4)

        self.prog = ttk.Progressbar(f, mode="determinate")
        self.prog.pack(fill=tk.X, pady=2)

        lf = ttk.LabelFrame(f, text="日志（含完整保存路径）")
        lf.pack(fill=tk.BOTH, expand=True, pady=4)
        self.log = tk.Text(lf, height=22, wrap=tk.WORD, font=("Consolas", 9))
        sb = ttk.Scrollbar(lf, command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        self.log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        tvf = ttk.LabelFrame(f, text="任务预览（前 500 行）")
        tvf.pack(fill=tk.BOTH, expand=False, pady=4)
        cols = ("idx", "file", "uid", "dungeon", "unit", "cat")
        self.tree = ttk.Treeview(tvf, columns=cols, show="headings", height=8)
        self.tree.heading("idx", text="#")
        self.tree.heading("file", text="相对路径")
        self.tree.heading("uid", text="UID")
        self.tree.heading("dungeon", text="副本")
        self.tree.heading("unit", text="单位")
        self.tree.heading("cat", text="类型")
        self.tree.column("idx", width=40)
        self.tree.column("file", width=260)
        self.tree.column("uid", width=72)
        self.tree.column("dungeon", width=100)
        self.tree.column("unit", width=140)
        self.tree.column("cat", width=56)
        self.tree.pack(fill=tk.BOTH, expand=True)

        self.after(200, self._pump_queue)
        self._sync_source_widgets()

    def _sync_source_widgets(self) -> None:
        use_md = self.var_source.get() == "md"
        state = tk.NORMAL if use_md else tk.DISABLED
        self.ent_md.configure(state=state)
        self.btn_md.configure(state=state)
        self.chk_scene.configure(state=state)

    def _browse_md(self) -> None:
        p = filedialog.askopenfilename(
            title="选择提示词 Markdown",
            filetypes=[("Markdown", "*.md"), ("All", "*.*")],
            initialdir=str(ROOT),
        )
        if p:
            self.var_md.set(p)

    def _browse_out(self) -> None:
        cur = Path(self.var_out.get().strip() or str(WOW_PORTRAIT_STAGING_ROOT))
        initial = cur if cur.is_dir() else WOW_PORTRAIT_STAGING_ROOT
        if not initial.is_dir():
            initial = ROOT if ROOT.is_dir() else Path.home()
        p = filedialog.askdirectory(title="选择输出根目录（建议临时目录）", initialdir=str(initial))
        if p:
            self.var_out.set(p)

    def _log(self, s: str) -> None:
        self.log.insert(tk.END, s + "\n")
        self.log.see(tk.END)

    def _load_jobs(self) -> list[WowImageJob]:
        if self.var_source.get() == "json":
            return load_wow_book_art_jobs(ROOT)
        md = Path(self.var_md.get().strip())
        if not md.is_file():
            raise FileNotFoundError(str(md))
        text = md.read_text(encoding="utf-8")
        return parse_wow_prompt_md(text, include_scene=self.var_scene.get())

    def _on_manifest(self) -> None:
        try:
            self._jobs = self._load_jobs()
        except FileNotFoundError as e:
            messagebox.showerror(
                "找不到 Markdown",
                f"{e}\n\n若尚未生成，请在仓库根执行：\n  npm run gen:wow-famine-md\n或：\n  python tools/generate_wow_famine_prompt_md.py",
            )
            return
        except Exception as e:
            messagebox.showerror("解析失败", str(e))
            return
        out = Path(self.var_out.get().strip())
        try:
            tsv, fullj = write_manifest(self._jobs, out)
        except Exception as e:
            messagebox.showerror("写入清单失败", str(e))
            return
        self.var_to.set(str(len(self._jobs)))
        self._refresh_tree()
        self._log(f"清单已写入：\n  {tsv}\n  {fullj}\n共 {len(self._jobs)} 条任务。")
        self.var_status.set(f"已解析 {len(self._jobs)} 条；清单目录：{out.resolve()}")
        messagebox.showinfo("完成", f"共 {len(self._jobs)} 条。\nmanifest.tsv 即「文件名 ↔ 单位」对照表。")

    def _refresh_tree(self) -> None:
        for x in self.tree.get_children():
            self.tree.delete(x)
        for i, j in enumerate(self._jobs[:500], start=1):
            uid = j.asset_uid or "—"
            self.tree.insert("", tk.END, values=(i, j.rel_path, uid, j.dungeon_cn, j.unit_cn, j.category))
        if len(self._jobs) > 500:
            self.tree.insert(
                "",
                tk.END,
                values=("…", f"其余 {len(self._jobs) - 500} 条见 manifest.tsv", "", "", "", ""),
            )

    def _slice_jobs(self) -> list[tuple[int, WowImageJob]]:
        if not self._jobs:
            try:
                self._jobs = self._load_jobs()
            except FileNotFoundError as e:
                messagebox.showerror(
                    "找不到 Markdown",
                    f"{e}\n\n请先运行：npm run gen:wow-famine-md",
                )
                return []
            except Exception as e:
                messagebox.showerror("请先加载清单", str(e))
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

    def _on_cancel(self) -> None:
        self._cancel.set()
        self._log("已请求取消（当前张重试结束或冷却切片结束后停止）…")

    def _on_test_one(self) -> None:
        self.var_from.set("1")
        self.var_to.set("1")
        self._on_generate()

    def _on_generate(self) -> None:
        if self._worker and self._worker.is_alive():
            messagebox.showwarning("忙", "已有任务在运行。")
            return
        pairs = self._slice_jobs()
        if not pairs:
            return
        out_root = Path(self.var_out.get().strip())
        key_file = Path(self.var_key.get().strip())
        self._cancel.clear()
        self.prog["maximum"] = len(pairs)
        self.prog["value"] = 0

        try:
            circle_diameter = int(self.var_circle_size.get().strip())
        except ValueError:
            circle_diameter = 256
        circle_diameter = max(8, min(circle_diameter, 8192))

        def run() -> None:
            done = 0
            consecutive_job_fails = 0

            def qlog(s: str) -> None:
                self._q.put(("log", s))

            def handle_job_failure(title: str, last_err: BaseException | None) -> str:
                """返回 break / continue / next。"""
                nonlocal i, done, consecutive_job_fails
                if self._cancel.is_set():
                    self._q.put(("log", "用户取消，停止批量。"))
                    i += 1
                    done += 1
                    self._q.put(("prog", done))
                    return "break"
                self._q.put(("log", f"{title}\n  最后错误: {last_err!s}"))
                consecutive_job_fails += 1
                if consecutive_job_fails >= CONSECUTIVE_JOB_FAILS_BEFORE_COOLDOWN:
                    self._q.put(
                        (
                            "status",
                            f"连续 {CONSECUTIVE_JOB_FAILS_BEFORE_COOLDOWN} 条失败，"
                            f"冷却 {COOLDOWN_SECONDS}s（可点「取消」中断）…",
                        )
                    )
                    qlog(
                        f"[策略] 已连续 {CONSECUTIVE_JOB_FAILS_BEFORE_COOLDOWN} 条失败，"
                        f"休息 {COOLDOWN_SECONDS // 60} 分钟后再继续…"
                    )
                    interrupted = _sleep_cancellable(
                        COOLDOWN_SECONDS, self._cancel, qlog
                    )
                    if interrupted or self._cancel.is_set():
                        self._q.put(("log", "冷却期间或之后已取消，停止批量。"))
                        i += 1
                        done += 1
                        self._q.put(("prog", done))
                        return "break"
                    consecutive_job_fails = 0
                    qlog(
                        f"[重试] 冷却结束，自动再试上一张（清单第 {idx} 条）：{job.rel_path} | {job.unit_cn}"
                    )
                    return "continue"
                i += 1
                done += 1
                self._q.put(("prog", done))
                return "next"

            def try_circle_step() -> tuple[bool, BaseException | None]:
                last_exc: BaseException | None = None
                for catt in range(1, CIRCLE_MAX_TRIES + 1):
                    if self._cancel.is_set():
                        return False, None
                    try:
                        write_circle_from_square(target_sq, target_ci, circle_diameter)
                        self._q.put(("log", f"[圆切] 成功 → {target_ci}"))
                        return True, None
                    except ModuleNotFoundError as e:
                        last_exc = e
                        if getattr(e, "name", None) == "PIL" or "PIL" in str(e):
                            self._q.put(
                                ("log", "[圆切] 未安装 Pillow，请在当前 Python 环境执行：pip install pillow")
                            )
                        else:
                            self._q.put(("log", f"[圆切] 尝试 {catt}/{CIRCLE_MAX_TRIES} 失败: {e!s}"))
                    except Exception as e:
                        last_exc = e
                        msg = str(e)
                        if "No module named 'PIL'" in msg or "cannot import name 'Image'" in msg:
                            self._q.put(
                                ("log", "[圆切] 未安装 Pillow，请在当前 Python 环境执行：pip install pillow")
                            )
                        self._q.put(("log", f"[圆切] 尝试 {catt}/{CIRCLE_MAX_TRIES} 失败: {e!s}"))
                    if catt < CIRCLE_MAX_TRIES:
                        time.sleep(RETRY_GAP_SECONDS)
                self._q.put(("log", f"[圆切] 放弃（已试 {CIRCLE_MAX_TRIES} 次）→ {target_ci}"))
                return False, last_exc

            def generate_square_step() -> tuple[bool, BaseException | None]:
                last_err: BaseException | None = None
                for attempt in range(1, PER_IMAGE_MAX_TRIES + 1):
                    if self._cancel.is_set():
                        self._q.put(("log", f"已取消（第 {attempt} 次尝试前），本条不再重试。"))
                        return False, None
                    try:
                        p = img2.generate_to_file(
                            job.prompt,
                            target_sq,
                            key_file=key_file if key_file.is_file() else None,
                            base_url=self.var_base.get().strip(),
                            model=self.var_model.get().strip(),
                            size=self.var_size.get().strip(),
                        )
                        self._q.put(("log", f"[文生图成功] 第{attempt}/{PER_IMAGE_MAX_TRIES}次尝试 → {p}"))
                        return True, None
                    except Exception as e:
                        last_err = e
                        self._q.put(
                            ("log", f"[文生图尝试 {attempt}/{PER_IMAGE_MAX_TRIES} 失败] {target_sq}\n  {e!s}")
                        )
                        if attempt < PER_IMAGE_MAX_TRIES:
                            time.sleep(RETRY_GAP_SECONDS)
                return False, last_err

            i = 0
            while i < len(pairs):
                if self._cancel.is_set():
                    self._q.put(("log", f"已取消。已完成 {done}/{len(pairs)}。"))
                    break
                idx, job = pairs[i]
                uid = job.asset_uid or "—"
                self._q.put(("log", f"---- 总清单第 {idx} 条 [{uid}] {job.rel_path} | {job.unit_cn} ----"))
                target_sq = (out_root / job.rel_path).resolve()
                target_ci = circle_output_path_for_square(target_sq)
                skip = self.var_skip.get()

                if skip and target_sq.is_file() and target_ci.is_file():
                    self._q.put(
                        (
                            "log",
                            f"[跳过] 方图与圆图已存在\n  方: {target_sq}\n  圆: {target_ci}",
                        )
                    )
                    consecutive_job_fails = 0
                    i += 1
                    done += 1
                    self._q.put(("prog", done))
                    continue

                need_generate = (not skip) or (not target_sq.is_file())
                square_ok = False
                gen_last: BaseException | None = None

                if need_generate:
                    self._q.put(("status", f"正在文生图 批次内 [{done + 1}/{len(pairs)}] → {target_sq}"))
                    square_ok, gen_last = generate_square_step()
                else:
                    self._q.put(("status", f"仅圆切 批次内 [{done + 1}/{len(pairs)}] → {target_ci}"))
                    square_ok = True

                if not square_ok:
                    act = handle_job_failure(
                        f"[整条放弃] 文生图已试 {PER_IMAGE_MAX_TRIES} 次仍失败 → {target_sq}",
                        gen_last,
                    )
                    if act == "break":
                        break
                    if act == "continue":
                        continue
                    continue

                if not target_sq.is_file():
                    act = handle_job_failure(
                        f"[整条放弃] 文生图未写出文件 → {target_sq}",
                        FileNotFoundError(str(target_sq)),
                    )
                    if act == "break":
                        break
                    if act == "continue":
                        continue
                    continue

                c_ok, c_err = try_circle_step()
                if not c_ok:
                    if self._cancel.is_set():
                        self._q.put(("log", "用户取消，停止批量。"))
                        i += 1
                        done += 1
                        self._q.put(("prog", done))
                        break
                    act = handle_job_failure(
                        f"[整条放弃] 圆切已试 {CIRCLE_MAX_TRIES} 次仍失败 → {target_ci}",
                        c_err,
                    )
                    if act == "break":
                        break
                    if act == "continue":
                        continue
                    continue

                consecutive_job_fails = 0
                i += 1
                done += 1
                self._q.put(("prog", done))
            self._q.put(("done",))

        self._worker = threading.Thread(target=run, daemon=True)
        self._worker.start()
        self._log(
            f"开始批量：共 {len(pairs)} 条（方图 + 圆切），圆切直径 {circle_diameter}px，输出根目录 {out_root.resolve()}"
        )

    def _pump_queue(self) -> None:
        try:
            while True:
                msg = self._q.get_nowait()
                if msg[0] == "log":
                    self._log(msg[1])
                elif msg[0] == "status":
                    self.var_status.set(msg[1])
                elif msg[0] == "prog":
                    self.prog["value"] = msg[1]
                elif msg[0] == "done":
                    self.var_status.set("本轮结束。")
                    self._log("—— 本轮结束 ——")
        except queue.Empty:
            pass
        self.after(200, self._pump_queue)


def main() -> None:
    App().mainloop()


if __name__ == "__main__":
    main()
