#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
魔兽图鉴 / 战斗配置编辑器（Tkinter，仅标准库）。

功能：
  - 编辑 src/game/config/skills.json：技能增删改；`powerTag`（强/中/弱/负面）供图鉴强度重算；实现状态「待修改」由策划手工选择。
  - 编辑 src/game/config/wowBookMonsters.json：小怪数值与 skillIds 等。
  - 读取 src/game/config/wowBookChapters.json：小怪/首领列表按主线章节与副本顺序排序。
  - 左侧列表：已「应用」到内存但与上次保存的 JSON 不一致的条目以蓝色显示；刷新列表时尽量保持选中项与左侧焦点；弹窗关闭后会再次把焦点拉回列表。
  - 编辑 src/game/config/wowBookBosses.json：书本关卡首领元数据与战斗基准（血攻防速射程等）；缺省字段由运行时 WOW_BOOK_BOSS_TABLE_DEFAULT 补齐；首领页「设置基础属性」一键写入与上表一致的表底数值（射程按近战/远程推断）。combatBossId 仅作文案/兼容字段。

用法（在项目根目录）:
  python scripts/魔兽图鉴配置编辑器.py
  py scripts\\魔兽图鉴配置编辑器.py
"""

from __future__ import annotations

import copy
import json
import re
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from tkinter.scrolledtext import ScrolledText
from typing import Any, Dict, List, Optional, Tuple

SKILL_CODE_STATUS: Tuple[Tuple[str, str], ...] = (
    ("written", "已写（战斗已接）"),
    ("missing", "未写（战斗未接）"),
    ("pending_changes", "待修改（手工标记，程序待对齐）"),
)
SKILL_LIMITS = ("minion", "boss", "any")

# 与策划约定：多条技能时百分比「加法」叠到 1.0 上（见 unit-stat-design-baseline 特技乘区）
SKILL_POWER_TAGS: Tuple[Tuple[str, str], ...] = (
    ("strong", "强"),
    ("medium", "中"),
    ("weak", "弱"),
    ("negative", "负面"),
)
SKILL_POWER_DELTA: Dict[str, float] = {
    "strong": -0.2,
    "medium": -0.1,
    "weak": -0.05,
    "negative": 0.2,
}


def nudge_int_pair_product(hp: int, atk: int, target_k: float) -> Tuple[int, int]:
    """在等比取整后微调整数 hp/atk，使 hp*atk 尽量接近 target_k。"""
    best_h, best_a = hp, atk
    best_err = abs(hp * atk - target_k)
    for dh in range(-3, 4):
        for da in range(-3, 4):
            nh, na = hp + dh, atk + da
            if nh < 1 or na < 1:
                continue
            err = abs(nh * na - target_k)
            if err < best_err:
                best_err = err
                best_h, best_a = nh, na
    return best_h, best_a


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(text + "\n", encoding="utf-8")


def parse_params_json(s: str) -> List[Any]:
    s = s.strip()
    if not s:
        return []
    data = json.loads(s)
    if not isinstance(data, list):
        raise ValueError("params 必须是 JSON 数组")
    if len(data) > 5:
        raise ValueError("params 最多 5 项")
    return data


def format_params_json(params: Any) -> str:
    if params is None:
        return ""
    if not isinstance(params, list):
        return json.dumps(params, ensure_ascii=False)
    return json.dumps(params, ensure_ascii=False)


def parse_skill_ids(s: str) -> List[str]:
    parts = re.split(r"[,，\s]+", s.strip())
    return [p for p in parts if p]


def parse_skill_id_list_json(s: str) -> List[str]:
    """wowBookBosses.json 的 skillIds：JSON 数组，元素为 skill id 字符串（与 wowBookMonsters.skillIds 一致）。"""
    s = s.strip()
    if not s:
        return []
    data = json.loads(s)
    if not isinstance(data, list):
        raise ValueError("skills 必须是 JSON 数组")
    out: List[str] = []
    for i, x in enumerate(data):
        if not isinstance(x, str):
            raise ValueError(f"skills[{i}] 必须是字符串（skill id）")
        out.append(x)
    return out


def format_skill_id_list_json(skills: Any) -> str:
    if skills is None:
        return "[]"
    if isinstance(skills, list):
        return json.dumps(skills, ensure_ascii=False)
    return json.dumps(skills, ensure_ascii=False)


# 与 docs/unit-stat-design-baseline.md 第一节、第二节及 src/game/battleBonds.ts 对齐
RANGED_ATTACK_RANGE_THRESHOLD = 100
MELEE_BASELINE_HP_ATK_INTERVAL = (270, 11, 0.62)
RANGED_BASELINE_HP_ATK_INTERVAL = (268, 14, 0.78)

# 与 src/game/wowBookData.ts WOW_BOOK_BOSS_TABLE_DEFAULT、scripts/generate-wow-book-tables.mjs DEFAULT_BOOK_BOSS_COMBAT 一致
BOOK_BOSS_TABLE_DEFAULT_COMBAT: Dict[str, Any] = {
    "hitRadius": 80,
    "baseMaxHp": 22740,
    "baseAtk": 46,
    "attackSpeed": 0.65,
    "moveSpeed": 540,
}
BOOK_BOSS_MELEE_DEFAULT_RANGE = 10
BOOK_BOSS_RANGED_DEFAULT_RANGE = 210


def book_boss_baseline_range_px(boss: Dict[str, Any]) -> int:
    """按 attackType；否则按当前 range 是否≥阈值 推断近战/远程，返回默认射程（像素）。"""
    at = str(boss.get("attackType") or "").strip()
    if at == "远程":
        return BOOK_BOSS_RANGED_DEFAULT_RANGE
    if at == "近战":
        return BOOK_BOSS_MELEE_DEFAULT_RANGE
    try:
        rng = int(float(boss.get("range")))
    except (TypeError, ValueError):
        rng = 0
    return BOOK_BOSS_RANGED_DEFAULT_RANGE if rng >= RANGED_ATTACK_RANGE_THRESHOLD else BOOK_BOSS_MELEE_DEFAULT_RANGE


def baseline_hp_atk_attack_speed(mob: Dict[str, Any]) -> Tuple[int, int, float]:
    """按 attackType；否则按射程阈值推断近战/远程，返回 (baseMaxHp, baseAtk, attackSpeed)。"""
    at = str(mob.get("attackType") or "").strip()
    if at == "远程":
        return RANGED_BASELINE_HP_ATK_INTERVAL
    if at == "近战":
        return MELEE_BASELINE_HP_ATK_INTERVAL
    try:
        rng = int(float(mob.get("range")))
    except (TypeError, ValueError):
        rng = 0
    if rng >= RANGED_ATTACK_RANGE_THRESHOLD:
        return RANGED_BASELINE_HP_ATK_INTERVAL
    return MELEE_BASELINE_HP_ATK_INTERVAL


def baseline_strength_product(mob: Dict[str, Any]) -> float:
    """设计基准强度：生命×攻击÷攻击间隔（与 baseline.md 一致）。"""
    bhp, batk, basp = baseline_hp_atk_attack_speed(mob)
    if basp <= 0:
        return 0.0
    return (bhp * batk) / basp


LIST_DIRTY_FG = "#1565C0"


def stable_json_blob(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


class WowBookConfigEditorApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("HeyBro — 怪物 / 首领 / 技能 配置编辑器")
        self.geometry("1100x720")
        self.minsize(920, 560)

        root = repo_root()
        self.path_skills = root / "src" / "game" / "config" / "skills.json"
        self.path_monsters = root / "src" / "game" / "config" / "wowBookMonsters.json"
        self.path_chapters = root / "src" / "game" / "config" / "wowBookChapters.json"
        self.path_wow_bosses = root / "src" / "game" / "config" / "wowBookBosses.json"

        self.data_skills: Dict[str, Any] = {}
        self.data_monsters_doc: Dict[str, Any] = {}
        self.data_wow_bosses_doc: Dict[str, Any] = {}
        self._dungeon_first_chapter: Dict[str, int] = {}
        self._mob_first_in_book: Dict[str, int] = {}

        self._skills_saved_doc: Dict[str, Any] = {}
        self._monsters_saved_doc: Dict[str, Any] = {}
        self._wow_bosses_saved_doc: Dict[str, Any] = {}
        self._list_fg_normal = ""

        self._skill_snapshot: Optional[Dict[str, Any]] = None
        self._skill_is_new = False
        self._monster_snapshot: Optional[Dict[str, Any]] = None
        self._boss_snapshot: Optional[Dict[str, Any]] = None

        nb = ttk.Notebook(self)
        nb.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

        self.tab_skills = ttk.Frame(nb)
        self.tab_monsters = ttk.Frame(nb)
        self.tab_bosses = ttk.Frame(nb)
        nb.add(self.tab_skills, text="技能 skills.json")
        nb.add(self.tab_monsters, text="小怪 wowBookMonsters.json")
        nb.add(self.tab_bosses, text="首领 wowBookBosses.json")

        self._build_skills_tab()
        self._build_monsters_tab()
        self._build_bosses_tab()

        self._list_fg_normal = self.skill_list.cget("foreground") or "#000000"

        self.reload_all_files()

    # --- load / save all ---

    def reload_all_files(self) -> None:
        ks = self._listbox_selected_top_id(self.skill_list)
        km = self._listbox_selected_top_id(self.monster_list)
        kb = self._listbox_selected_top_id(self.boss_list)
        try:
            self.data_skills = load_json(self.path_skills)
            self.data_monsters_doc = load_json(self.path_monsters)
            self.data_wow_bosses_doc = load_json(self.path_wow_bosses)
        except Exception as e:
            messagebox.showerror("加载失败", str(e))
            return
        self._sync_disk_snapshots()
        self._rebuild_chapter_sort_index()
        self._refresh_skill_list(keep_id=ks)
        self._refresh_monster_list(keep_id=km)
        self._refresh_boss_list(keep_id=kb)
        messagebox.showinfo("已重载", "已从磁盘重新加载配置 JSON（含章节排序索引）。")
        self._defer_restore_listbox(self.skill_list, ks)
        self._defer_restore_listbox(self.monster_list, km)
        self._defer_restore_listbox(self.boss_list, kb)

    def reload_all_files_silent(self) -> None:
        self.data_skills = load_json(self.path_skills)
        self.data_monsters_doc = load_json(self.path_monsters)
        self.data_wow_bosses_doc = load_json(self.path_wow_bosses)
        self._sync_disk_snapshots()
        self._rebuild_chapter_sort_index()
        self._refresh_skill_list()
        self._refresh_monster_list()
        self._refresh_boss_list()

    def _rebuild_chapter_sort_index(self) -> None:
        """按 wowBookChapters 主线顺序：副本首次出现章节号、怪在章节池中的首次出现次序。"""
        self._dungeon_first_chapter = {}
        self._mob_first_in_book = {}
        try:
            doc = load_json(self.path_chapters)
        except Exception:
            return
        chapters = list(doc.get("chapters") or [])
        chapters.sort(key=lambda c: int(c.get("chapterIndex") or 0))
        mob_seq = 0
        for ch in chapters:
            did = str(ch.get("dungeonId") or "")
            ci = int(ch.get("chapterIndex") or 0)
            if did and did not in self._dungeon_first_chapter:
                self._dungeon_first_chapter[did] = ci
            for mid in ch.get("monsterGroup") or []:
                ms = str(mid)
                if ms not in self._mob_first_in_book:
                    self._mob_first_in_book[ms] = mob_seq
                    mob_seq += 1

    def _sync_disk_snapshots(self) -> None:
        """与磁盘已对齐的快照（用于未保存行蓝色标记）。"""
        self._skills_saved_doc = copy.deepcopy(self.data_skills)
        self._monsters_saved_doc = copy.deepcopy(self.data_monsters_doc)
        self._wow_bosses_saved_doc = copy.deepcopy(self.data_wow_bosses_doc)

    def _listbox_selected_top_id(self, lb: tk.Listbox) -> Optional[str]:
        sel = lb.curselection()
        if not sel or lb.size() == 0:
            return None
        line = lb.get(sel[0])
        return line.split()[0] if line.strip() else None

    def _restore_listbox_selection(self, lb: tk.Listbox, item_id: Optional[str]) -> None:
        if not item_id:
            return
        for i in range(lb.size()):
            if lb.get(i).split()[0] == item_id:
                lb.selection_clear(0, tk.END)
                lb.selection_set(i)
                lb.see(i)
                lb.focus_set()
                return

    def _defer_restore_listbox(self, lb: tk.Listbox, item_id: Optional[str]) -> None:
        if not item_id:
            return

        def _go() -> None:
            self._restore_listbox_selection(lb, item_id)

        self.after_idle(_go)

    def _skill_row_dirty(self, sid: str) -> bool:
        cur = next((s for s in (self.data_skills.get("skills") or []) if s.get("id") == sid), None)
        old = next((s for s in (self._skills_saved_doc.get("skills") or []) if s.get("id") == sid), None)
        if cur is None:
            return False
        if old is None:
            return True
        return stable_json_blob(cur) != stable_json_blob(old)

    def _monster_row_dirty(self, mid: str) -> bool:
        cur = next((m for m in (self.data_monsters_doc.get("monsters") or []) if m.get("id") == mid), None)
        old = next((m for m in (self._monsters_saved_doc.get("monsters") or []) if m.get("id") == mid), None)
        if cur is None:
            return False
        if old is None:
            return True
        return stable_json_blob(cur) != stable_json_blob(old)

    def _boss_row_dirty(self, bid: str) -> bool:
        cur = next((b for b in (self.data_wow_bosses_doc.get("bosses") or []) if b.get("id") == bid), None)
        old = next((b for b in (self._wow_bosses_saved_doc.get("bosses") or []) if b.get("id") == bid), None)
        if cur is None:
            return False
        if old is None:
            return True
        return stable_json_blob(cur) != stable_json_blob(old)

    def _apply_skill_list_row_colors(self) -> None:
        fg = self._list_fg_normal
        for i in range(self.skill_list.size()):
            sid = self.skill_list.get(i).split()[0]
            self.skill_list.itemconfig(i, foreground=LIST_DIRTY_FG if self._skill_row_dirty(sid) else fg)

    def _apply_monster_list_row_colors(self) -> None:
        fg = self._list_fg_normal
        for i in range(self.monster_list.size()):
            mid = self.monster_list.get(i).split()[0]
            self.monster_list.itemconfig(i, foreground=LIST_DIRTY_FG if self._monster_row_dirty(mid) else fg)

    def _apply_boss_list_row_colors(self) -> None:
        fg = self._list_fg_normal
        for i in range(self.boss_list.size()):
            bid = self.boss_list.get(i).split()[0]
            self.boss_list.itemconfig(i, foreground=LIST_DIRTY_FG if self._boss_row_dirty(bid) else fg)

    # ========== 技能 ==========

    def _build_skills_tab(self) -> None:
        top = ttk.Frame(self.tab_skills)
        top.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(top, text="重载全部 JSON", command=self.reload_all_files).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="保存 skills.json", command=self.save_skills_file).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="新增技能", command=self.skill_new).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="删除当前技能", command=self.skill_delete).pack(side=tk.LEFT, padx=2)

        paned = ttk.PanedWindow(self.tab_skills, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        left = ttk.Frame(paned, width=220)
        paned.add(left, weight=0)
        self.skill_list = tk.Listbox(left, exportselection=False)
        self.skill_list.pack(fill=tk.BOTH, expand=True)
        self.skill_list.bind("<<ListboxSelect>>", lambda _e: self.skill_load_selection())

        right = ttk.Frame(paned)
        paned.add(right, weight=1)

        r = 0
        ttk.Label(right, text="id").grid(row=r, column=0, sticky=tk.W, padx=4, pady=2)
        self.skill_id = ttk.Entry(right, width=48)
        self.skill_id.grid(row=r, column=1, sticky=tk.EW, padx=4, pady=2)
        r += 1

        ttk.Label(right, text="nameCn").grid(row=r, column=0, sticky=tk.W, padx=4, pady=2)
        self.skill_name = ttk.Entry(right, width=48)
        self.skill_name.grid(row=r, column=1, sticky=tk.EW, padx=4, pady=2)
        r += 1

        ttk.Label(right, text="limit").grid(row=r, column=0, sticky=tk.W, padx=4, pady=2)
        self.skill_limit = ttk.Combobox(right, values=list(SKILL_LIMITS), width=20, state="readonly")
        self.skill_limit.grid(row=r, column=1, sticky=tk.W, padx=4, pady=2)
        r += 1

        ttk.Label(right, text="强度标签 powerTag").grid(row=r, column=0, sticky=tk.W, padx=4, pady=2)
        self.skill_power = ttk.Combobox(
            right, values=[f"{a}  {b}" for a, b in SKILL_POWER_TAGS], width=20, state="readonly"
        )
        self.skill_power.grid(row=r, column=1, sticky=tk.W, padx=4, pady=2)
        r += 1

        ttk.Label(right, text="实现状态 codeStatus").grid(row=r, column=0, sticky=tk.NW, padx=4, pady=2)
        self.skill_status = ttk.Combobox(
            right, values=[f"{a}  {b}" for a, b in SKILL_CODE_STATUS], width=44, state="readonly"
        )
        self.skill_status.grid(row=r, column=1, sticky=tk.W, padx=4, pady=2)
        r += 1

        ttk.Label(right, text="descriptionCn（玩家）").grid(row=r, column=0, sticky=tk.NW, padx=4, pady=2)
        self.skill_desc = ScrolledText(right, height=4, wrap=tk.WORD)
        self.skill_desc.grid(row=r, column=1, sticky=tk.NSEW, padx=4, pady=2)
        r += 1

        ttk.Label(right, text="logicEffectCn（逻辑）").grid(row=r, column=0, sticky=tk.NW, padx=4, pady=2)
        self.skill_logic = ScrolledText(right, height=5, wrap=tk.WORD)
        self.skill_logic.grid(row=r, column=1, sticky=tk.NSEW, padx=4, pady=2)
        r += 1

        ttk.Label(right, text='params（JSON 数组，≤5 项）').grid(row=r, column=0, sticky=tk.NW, padx=4, pady=2)
        self.skill_params = ScrolledText(right, height=3, wrap=tk.NONE, font=("Consolas", 10))
        self.skill_params.grid(row=r, column=1, sticky=tk.EW, padx=4, pady=2)
        r += 1

        right.columnconfigure(1, weight=1)
        right.rowconfigure(5, weight=1)
        right.rowconfigure(6, weight=1)

        bot = ttk.Frame(self.tab_skills)
        bot.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(bot, text="应用当前编辑到内存（不写盘）", command=self.skill_apply_to_memory).pack(side=tk.LEFT, padx=2)

    def _skill_status_code_from_ui(self) -> str:
        raw = self.skill_status.get()
        return raw.split()[0] if raw else "missing"

    def _set_skill_status_ui(self, code: str) -> None:
        for a, b in SKILL_CODE_STATUS:
            if a == code:
                self.skill_status.set(f"{a}  {b}")
                return
        self.skill_status.set(f"{SKILL_CODE_STATUS[1][0]}  {SKILL_CODE_STATUS[1][1]}")

    def _skill_power_code_from_ui(self) -> str:
        raw = self.skill_power.get()
        code = raw.split()[0] if raw else "medium"
        return code if code in SKILL_POWER_DELTA else "medium"

    def _set_skill_power_ui(self, code: str) -> None:
        for a, b in SKILL_POWER_TAGS:
            if a == code:
                self.skill_power.set(f"{a}  {b}")
                return
        self.skill_power.set(f"{SKILL_POWER_TAGS[1][0]}  {SKILL_POWER_TAGS[1][1]}")

    def _refresh_skill_list(self, keep_id: Optional[str] = None) -> None:
        kid = keep_id if keep_id is not None else self._listbox_selected_top_id(self.skill_list)
        self.skill_list.delete(0, tk.END)
        skills: List[Dict[str, Any]] = self.data_skills.get("skills") or []
        for s in skills:
            sid = s.get("id", "?")
            name_cn = str(s.get("nameCn", "")).strip() or "（无中文名）"
            st = s.get("codeStatus")
            if st is None and "implemented" in s:
                st = "written" if s.get("implemented") else "missing"
            tag = st or "?"
            pt = str(s.get("powerTag") or "medium")
            if pt not in SKILL_POWER_DELTA:
                pt = "medium"
            pt_cn = next((b for a, b in SKILL_POWER_TAGS if a == pt), pt)
            self.skill_list.insert(tk.END, f"{sid}  {name_cn}  [{tag}]  {pt_cn}")
        self._apply_skill_list_row_colors()
        self._restore_listbox_selection(self.skill_list, kid)

    def _find_skill_index(self, skill_id: str) -> int:
        skills: List[Dict[str, Any]] = self.data_skills.get("skills") or []
        for i, s in enumerate(skills):
            if s.get("id") == skill_id:
                return i
        return -1

    def skill_load_selection(self) -> None:
        sel = self.skill_list.curselection()
        if not sel:
            return
        line = self.skill_list.get(sel[0])
        skill_id = line.split()[0]
        skills: List[Dict[str, Any]] = self.data_skills.get("skills") or []
        sk = next((s for s in skills if s.get("id") == skill_id), None)
        if not sk:
            return
        self._skill_is_new = False
        self._skill_snapshot = copy.deepcopy(sk)
        self.skill_id.delete(0, tk.END)
        self.skill_id.insert(0, str(sk.get("id", "")))
        self.skill_name.delete(0, tk.END)
        self.skill_name.insert(0, str(sk.get("nameCn", "")))
        lim = sk.get("limit", "any")
        self.skill_limit.set(lim if lim in SKILL_LIMITS else "any")
        st = sk.get("codeStatus")
        if st is None and "implemented" in sk:
            st = "written" if sk.get("implemented") else "missing"
        self._set_skill_status_ui(str(st or "missing"))
        pt = str(sk.get("powerTag") or "medium")
        self._set_skill_power_ui(pt if pt in SKILL_POWER_DELTA else "medium")
        self.skill_desc.delete("1.0", tk.END)
        self.skill_desc.insert(tk.END, str(sk.get("descriptionCn", "")))
        self.skill_logic.delete("1.0", tk.END)
        self.skill_logic.insert(tk.END, str(sk.get("logicEffectCn", "")))
        self.skill_params.delete("1.0", tk.END)
        self.skill_params.insert(tk.END, format_params_json(sk.get("params")))

    def skill_new(self) -> None:
        skills: List[Dict[str, Any]] = self.data_skills.setdefault("skills", [])
        n = 1
        while any(s.get("id") == f"skill_new_{n}" for s in skills):
            n += 1
        nid = f"skill_new_{n}"
        blank = {
            "id": nid,
            "nameCn": "新技能",
            "limit": "minion",
            "powerTag": "medium",
            "codeStatus": "missing",
            "descriptionCn": "",
            "logicEffectCn": "",
            "params": [],
        }
        skills.append(blank)
        self._refresh_skill_list(keep_id=nid)
        for i in range(self.skill_list.size()):
            if self.skill_list.get(i).startswith(nid):
                self.skill_list.selection_clear(0, tk.END)
                self.skill_list.selection_set(i)
                self.skill_list.see(i)
                break
        self._skill_is_new = True
        self._skill_snapshot = None
        self.skill_load_selection()

    def skill_delete(self) -> None:
        sel = self.skill_list.curselection()
        if not sel:
            messagebox.showwarning("提示", "请先选择一个技能。")
            return
        line = self.skill_list.get(sel[0])
        skill_id = line.split()[0]
        if not messagebox.askyesno("确认删除", f"确定从内存中删除技能 {skill_id}？\n保存 skills.json 后才会写盘。"):
            return
        skills: List[Dict[str, Any]] = self.data_skills.get("skills") or []
        self.data_skills["skills"] = [s for s in skills if s.get("id") != skill_id]
        self._skill_snapshot = None
        self._skill_is_new = False
        self._refresh_skill_list()
        self.after_idle(lambda: self.skill_list.focus_set())

    def _read_skill_from_form(self) -> Dict[str, Any]:
        params_raw = self.skill_params.get("1.0", tk.END).strip()
        params = parse_params_json(params_raw) if params_raw else []
        return {
            "id": self.skill_id.get().strip(),
            "nameCn": self.skill_name.get().strip(),
            "limit": self.skill_limit.get() or "any",
            "powerTag": self._skill_power_code_from_ui(),
            "codeStatus": self._skill_status_code_from_ui(),
            "descriptionCn": self.skill_desc.get("1.0", tk.END).rstrip("\n"),
            "logicEffectCn": self.skill_logic.get("1.0", tk.END).rstrip("\n"),
            "params": params,
        }

    def skill_apply_to_memory(self) -> None:
        kid = self._listbox_selected_top_id(self.skill_list)
        try:
            rec = self._read_skill_from_form()
        except Exception as e:
            messagebox.showerror("params 错误", str(e))
            self._defer_restore_listbox(self.skill_list, kid)
            return
        if not rec["id"]:
            messagebox.showerror("错误", "id 不能为空。")
            self._defer_restore_listbox(self.skill_list, kid)
            return
        if rec["limit"] not in SKILL_LIMITS:
            messagebox.showerror("错误", f"limit 必须是 {SKILL_LIMITS} 之一。")
            self._defer_restore_listbox(self.skill_list, kid)
            return

        ui_status = self._skill_status_code_from_ui()
        if ui_status not in ("written", "missing", "pending_changes"):
            messagebox.showerror("错误", "codeStatus 无效。")
            self._defer_restore_listbox(self.skill_list, kid)
            return

        pt = self._skill_power_code_from_ui()
        if pt not in SKILL_POWER_DELTA:
            messagebox.showerror("错误", "powerTag 无效。")
            self._defer_restore_listbox(self.skill_list, kid)
            return

        skills: List[Dict[str, Any]] = self.data_skills.setdefault("skills", [])
        snapshot = copy.deepcopy(self._skill_snapshot) if self._skill_snapshot else None
        if snapshot and "implemented" in snapshot:
            del snapshot["implemented"]

        old_id = snapshot.get("id") if snapshot else None
        idx_old = self._find_skill_index(old_id) if old_id else -1

        new_idx = self._find_skill_index(rec["id"])
        if rec["id"] != old_id and new_idx >= 0:
            messagebox.showerror("错误", f"id 已被其他条目占用: {rec['id']}")
            self._defer_restore_listbox(self.skill_list, kid)
            return

        rec["codeStatus"] = ui_status
        rec["powerTag"] = pt

        merged: Dict[str, Any] = copy.deepcopy(snapshot) if snapshot else {}
        merged.update(rec)
        merged.pop("implemented", None)

        if snapshot is None:
            ex = self._find_skill_index(rec["id"])
            if ex >= 0:
                skills[ex] = merged
            else:
                skills.append(merged)
        else:
            if idx_old >= 0:
                skills[idx_old] = merged
            else:
                skills.append(merged)

        merged.pop("implemented", None)
        self._skill_is_new = False
        self._skill_snapshot = copy.deepcopy(merged)
        sid_keep = str(merged.get("id", ""))
        self._refresh_skill_list(keep_id=sid_keep or None)
        self._defer_restore_listbox(self.skill_list, sid_keep or None)

    def save_skills_file(self) -> None:
        try:
            save_json(self.path_skills, self.data_skills)
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            return
        self._skills_saved_doc = copy.deepcopy(self.data_skills)
        kid = self._listbox_selected_top_id(self.skill_list)
        self._refresh_skill_list(keep_id=kid)
        messagebox.showinfo("已保存", str(self.path_skills))
        self._defer_restore_listbox(self.skill_list, kid)

    def _valid_skill_id_set(self) -> frozenset:
        return frozenset(str(s.get("id")) for s in (self.data_skills.get("skills") or []) if s.get("id"))

    def _validate_skill_ids_unknown(self, ids: List[str]) -> List[str]:
        known = self._valid_skill_id_set()
        return [x for x in ids if x not in known]

    def _validate_skill_limits_for_minion(self, ids: List[str]) -> List[str]:
        bad: List[str] = []
        for sid in ids:
            sk = next((s for s in (self.data_skills.get("skills") or []) if s.get("id") == sid), None)
            lim = str((sk or {}).get("limit") or "any").strip()
            if lim not in SKILL_LIMITS:
                lim = "any"
            if lim not in ("minion", "any"):
                bad.append(sid)
        return bad

    def _validate_skill_limits_for_boss(self, ids: List[str]) -> List[str]:
        bad: List[str] = []
        for sid in ids:
            sk = next((s for s in (self.data_skills.get("skills") or []) if s.get("id") == sid), None)
            lim = str((sk or {}).get("limit") or "any").strip()
            if lim not in SKILL_LIMITS:
                lim = "any"
            if lim not in ("boss", "any"):
                bad.append(sid)
        return bad

    def _skill_power_tag_code_for_id(self, sid: str) -> str:
        sk = next((s for s in (self.data_skills.get("skills") or []) if s.get("id") == sid), None)
        if not sk:
            return "medium"
        pt = str(sk.get("powerTag") or "medium")
        return pt if pt in SKILL_POWER_DELTA else "medium"

    def _skill_mount_budget_factor(self, skill_ids: List[str]) -> float:
        delta = sum(SKILL_POWER_DELTA[self._skill_power_tag_code_for_id(x)] for x in skill_ids)
        return max(0.05, 1.0 + delta)

    def _open_skill_picker(self, initial: List[str], *, for_boss: bool) -> Optional[List[str]]:
        rows = list(self.data_skills.get("skills") or [])
        rows.sort(key=lambda s: str(s.get("id", "")))

        def limit_ok(lim: Any) -> bool:
            lim = str(lim or "any").strip()
            if lim not in SKILL_LIMITS:
                lim = "any"
            if for_boss:
                return lim in ("boss", "any")
            return lim in ("minion", "any")

        dlg = tk.Toplevel(self)
        dlg.title("选择挂载技能（首领）" if for_boss else "选择挂载技能（小怪）")
        dlg.geometry("580x460")
        dlg.transient(self)
        dlg.grab_set()

        selected: List[str] = list(initial)

        topf = ttk.Frame(dlg, padding=6)
        topf.pack(fill=tk.X)
        ttk.Label(topf, text="筛选 id / 中文名:").pack(side=tk.LEFT)
        filt = ttk.Entry(topf, width=28)
        filt.pack(side=tk.LEFT, padx=6)

        mid = ttk.Frame(dlg, padding=6)
        mid.pack(fill=tk.BOTH, expand=True)

        lf = ttk.LabelFrame(mid, text="可选技能")
        lf.grid(row=0, column=0, sticky=tk.NSEW, padx=(0, 4))
        av = tk.Listbox(lf, selectmode=tk.EXTENDED, exportselection=False, height=15)
        av.pack(fill=tk.BOTH, expand=True)

        bf = ttk.Frame(mid)
        bf.grid(row=0, column=1, sticky=tk.NS, padx=4)
        rf = ttk.LabelFrame(mid, text="已选（顺序即挂载顺序）")
        rf.grid(row=0, column=2, sticky=tk.NSEW, padx=(4, 0))
        sv = tk.Listbox(rf, selectmode=tk.EXTENDED, exportselection=False, height=15)
        sv.pack(fill=tk.BOTH, expand=True)

        mid.columnconfigure(0, weight=1)
        mid.columnconfigure(2, weight=1)
        mid.rowconfigure(0, weight=1)

        def skill_label(sid: str) -> str:
            sk = next((s for s in rows if s.get("id") == sid), None)
            name = (sk or {}).get("nameCn") or ""
            lim = (sk or {}).get("limit") or "?"
            pt = self._skill_power_tag_code_for_id(sid)
            ptcn = next((b for a, b in SKILL_POWER_TAGS if a == pt), pt)
            return f"{sid}  {name}  [{lim}/{ptcn}]"

        def refresh_available(*_a: Any) -> None:
            q = filt.get().strip().lower()
            av.delete(0, tk.END)
            for s in rows:
                sid = str(s.get("id", ""))
                if not sid or not limit_ok(s.get("limit")):
                    continue
                if sid in selected:
                    continue
                nm = str(s.get("nameCn", "")).lower()
                if q and q not in sid.lower() and q not in nm:
                    continue
                av.insert(tk.END, skill_label(sid))

        def refresh_selected(*_a: Any) -> None:
            sv.delete(0, tk.END)
            for sid in selected:
                sv.insert(tk.END, skill_label(sid))

        def line_sid(line: str) -> str:
            return line.split()[0] if line else ""

        def add_sel() -> None:
            sel_i = av.curselection()
            if not sel_i:
                return
            for i in sel_i:
                sid = line_sid(av.get(i))
                if sid and sid not in selected:
                    selected.append(sid)
            refresh_available()
            refresh_selected()

        def remove_sel() -> None:
            sel_i = sv.curselection()
            if not sel_i:
                return
            to_remove = [selected[i] for i in sel_i]
            for sid in to_remove:
                if sid in selected:
                    selected.remove(sid)
            refresh_available()
            refresh_selected()

        def move_up() -> None:
            sel_i = sv.curselection()
            if not sel_i or sel_i[0] <= 0:
                return
            i = int(sel_i[0])
            selected[i - 1], selected[i] = selected[i], selected[i - 1]
            refresh_selected()
            sv.selection_set(i - 1)

        def move_dn() -> None:
            sel_i = sv.curselection()
            if not sel_i or sel_i[0] >= len(selected) - 1:
                return
            i = int(sel_i[0])
            selected[i + 1], selected[i] = selected[i], selected[i + 1]
            refresh_selected()
            sv.selection_set(i + 1)

        ttk.Button(bf, text="添加 →", command=add_sel).pack(pady=4)
        ttk.Button(bf, text="← 移除", command=remove_sel).pack(pady=4)
        ttk.Button(bf, text="上移", command=move_up).pack(pady=4)
        ttk.Button(bf, text="下移", command=move_dn).pack(pady=4)

        filt.bind("<KeyRelease>", refresh_available)

        out: Dict[str, Optional[List[str]]] = {"v": None}

        bot = ttk.Frame(dlg, padding=6)
        bot.pack(fill=tk.X)

        def on_ok() -> None:
            out["v"] = list(selected)
            dlg.destroy()

        def on_cancel() -> None:
            out["v"] = None
            dlg.destroy()

        ttk.Button(bot, text="确定", command=on_ok).pack(side=tk.RIGHT, padx=4)
        ttk.Button(bot, text="取消", command=on_cancel).pack(side=tk.RIGHT)

        refresh_available()
        refresh_selected()

        self.wait_window(dlg)
        return out["v"]

    def monster_pick_skills(self) -> None:
        keep = self._listbox_selected_top_id(self.monster_list)
        cur = parse_skill_ids(self.monster_skill_ids_entry.get())
        got = self._open_skill_picker(cur, for_boss=False)
        if got is None:
            self._defer_restore_listbox(self.monster_list, keep)
            return
        self.monster_skill_ids_entry.configure(state="normal")
        self.monster_skill_ids_entry.delete(0, tk.END)
        self.monster_skill_ids_entry.insert(0, ", ".join(got))
        self.monster_skill_ids_entry.configure(state="readonly")
        self._defer_restore_listbox(self.monster_list, keep)

    def boss_pick_skills(self) -> None:
        keep = self._listbox_selected_top_id(self.boss_list)
        cur = parse_skill_ids(self.boss_skill_ids_entry.get())
        got = self._open_skill_picker(cur, for_boss=True)
        if got is None:
            self._defer_restore_listbox(self.boss_list, keep)
            return
        self.boss_skill_ids_entry.configure(state="normal")
        self.boss_skill_ids_entry.delete(0, tk.END)
        self.boss_skill_ids_entry.insert(0, ", ".join(got))
        self.boss_skill_ids_entry.configure(state="readonly")
        self._defer_restore_listbox(self.boss_list, keep)

    # ========== 小怪 ==========

    def _build_monsters_tab(self) -> None:
        top = ttk.Frame(self.tab_monsters)
        top.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(top, text="重载全部 JSON", command=self.reload_all_files).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="保存 wowBookMonsters.json", command=self.save_monsters_file).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="恢复基准命/攻/间隔", command=self.monster_restore_baseline_stats).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="属性重算", command=self.monster_recalc_strength_stats).pack(side=tk.LEFT, padx=2)
        ttk.Label(top, text="筛选 id / 中文名 / 副本名 / 标签:").pack(side=tk.LEFT, padx=(12, 2))
        self.monster_filter = ttk.Entry(top, width=28)
        self.monster_filter.pack(side=tk.LEFT, padx=2)
        self.monster_filter.bind("<KeyRelease>", lambda _e: self._refresh_monster_list())

        paned = ttk.PanedWindow(self.tab_monsters, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        left = ttk.Frame(paned, width=280)
        paned.add(left, weight=0)
        self.monster_list = tk.Listbox(left, exportselection=False)
        self.monster_list.pack(fill=tk.BOTH, expand=True)
        self.monster_list.bind("<<ListboxSelect>>", lambda _e: self.monster_load_selection())

        right = ttk.Frame(paned)
        paned.add(right, weight=1)

        self.monster_fields: Dict[str, ttk.Entry] = {}
        row = 0
        for label, key in [
            ("id（只读）", "id"),
            ("monsterUid（只读）", "monsterUid"),
            ("refKey（只读）", "refKey"),
            ("nameCn", "nameCn"),
            ("nameEn", "nameEn"),
            ("dungeonId", "dungeonId"),
            ("dungeonNameCn（副本中文名）", "dungeonNameCn"),
            ("attackType", "attackType"),
            ("role", "role"),
            ("creatureType", "creatureType"),
            ("hitRadius", "hitRadius"),
            ("baseMaxHp", "baseMaxHp"),
            ("baseAtk", "baseAtk"),
            ("attackSpeed", "attackSpeed"),
            ("range", "range"),
            ("moveSpeed", "moveSpeed"),
        ]:
            ttk.Label(right, text=label).grid(row=row, column=0, sticky=tk.W, padx=4, pady=2)
            ent = ttk.Entry(right, width=56)
            ent.grid(row=row, column=1, sticky=tk.EW, padx=4, pady=2)
            if "只读" in label:
                ent.configure(state="readonly")
            self.monster_fields[key] = ent
            row += 1

        ttk.Label(right, text='traits（标签，JSON 字符串数组）').grid(row=row, column=0, sticky=tk.NW, padx=4, pady=2)
        self.monster_traits = ScrolledText(right, height=3, wrap=tk.NONE, font=("Consolas", 10))
        self.monster_traits.grid(row=row, column=1, sticky=tk.EW, padx=4, pady=2)
        row += 1

        ttk.Label(right, text="skillIds（skills.json）").grid(row=row, column=0, sticky=tk.W, padx=4, pady=2)
        skill_row = ttk.Frame(right)
        skill_row.grid(row=row, column=1, sticky=tk.EW, padx=4, pady=2)
        skill_row.columnconfigure(0, weight=1)
        self.monster_skill_ids_entry = ttk.Entry(skill_row, width=36)
        self.monster_skill_ids_entry.grid(row=0, column=0, sticky=tk.EW)
        ttk.Button(skill_row, text="选择技能…", command=self.monster_pick_skills, width=11).grid(
            row=0, column=1, padx=(4, 0)
        )
        row += 1

        right.columnconfigure(1, weight=1)

        ttk.Button(right, text="应用当前小怪到内存", command=self.monster_apply_to_memory).grid(
            row=row, column=1, sticky=tk.W, padx=4, pady=8
        )

    def _all_monsters(self) -> List[Dict[str, Any]]:
        return list(self.data_monsters_doc.get("monsters") or [])

    def _mainline_monster_sort_key(self, m: Dict[str, Any]) -> Tuple[int, int, str, str]:
        """wowBookChapters：副本首次出现章节 → 怪在章节池首次出现次序 → 名称 → id。"""
        did = str(m.get("dungeonId") or "")
        mid = str(m.get("id") or "")
        d_rank = self._dungeon_first_chapter.get(did, 10**9)
        m_rank = self._mob_first_in_book.get(mid, 10**9)
        return (d_rank, m_rank, str(m.get("nameCn") or ""), mid)

    def _monsters_sorted_for_list(self) -> List[Dict[str, Any]]:
        return sorted(self._all_monsters(), key=self._mainline_monster_sort_key)

    def _refresh_monster_list(self, keep_id: Optional[str] = None) -> None:
        kid = keep_id if keep_id is not None else self._listbox_selected_top_id(self.monster_list)
        self.monster_list.delete(0, tk.END)
        q = self.monster_filter.get().strip().lower()
        for m in self._monsters_sorted_for_list():
            mid = str(m.get("id", ""))
            cn = str(m.get("nameCn", ""))
            dname = str(m.get("dungeonNameCn", "")).strip() or str(m.get("dungeonId", "")).strip() or "?"
            if q:
                tr = m.get("traits")
                tr_s = " ".join(tr).lower() if isinstance(tr, list) else ""
                dn_full = f"{dname} {m.get('dungeonId', '')}".lower()
                if (
                    q not in mid.lower()
                    and q not in cn.lower()
                    and q not in dname.lower()
                    and q not in dn_full
                    and q not in tr_s
                ):
                    continue
            tr = m.get("traits")
            hint = ""
            if isinstance(tr, list) and tr:
                joined = "、".join(str(t) for t in tr[:4])
                if len(tr) > 4:
                    joined += "…"
                hint = f"  ·{joined}"
            self.monster_list.insert(tk.END, f"{mid}  {cn}  [{dname}]{hint}")
        self._apply_monster_list_row_colors()
        self._restore_listbox_selection(self.monster_list, kid)

    def monster_load_selection(self) -> None:
        sel = self.monster_list.curselection()
        if not sel:
            return
        line = self.monster_list.get(sel[0])
        mid = line.split()[0]
        m = next((x for x in self._all_monsters() if x.get("id") == mid), None)
        if not m:
            return
        self._monster_snapshot = copy.deepcopy(m)
        ro = {"id", "monsterUid", "refKey"}
        for key, ent in self.monster_fields.items():
            ent.configure(state="normal")
            ent.delete(0, tk.END)
            ent.insert(0, str(m.get(key, "")))
            if key in ro:
                ent.configure(state="readonly")
        sids = m.get("skillIds") or []
        val = ", ".join(sids) if isinstance(sids, list) else str(sids)
        self.monster_skill_ids_entry.configure(state="normal")
        self.monster_skill_ids_entry.delete(0, tk.END)
        self.monster_skill_ids_entry.insert(0, val)
        self.monster_skill_ids_entry.configure(state="readonly")
        self.monster_traits.delete("1.0", tk.END)
        self.monster_traits.insert(tk.END, format_skill_id_list_json(m.get("traits")))

    def monster_apply_to_memory(self) -> None:
        if not self._monster_snapshot:
            messagebox.showwarning("提示", "请先选择一个小怪。")
            return
        oid = self._monster_snapshot.get("id")
        try:
            hit = int(float(self.monster_fields["hitRadius"].get()))
            hp = int(float(self.monster_fields["baseMaxHp"].get()))
            atk = int(float(self.monster_fields["baseAtk"].get()))
            asp = float(self.monster_fields["attackSpeed"].get())
            rng = int(float(self.monster_fields["range"].get()))
            mv = int(float(self.monster_fields["moveSpeed"].get()))
        except ValueError as e:
            messagebox.showerror("数值错误", str(e))
            self._defer_restore_listbox(self.monster_list, oid)
            return
        try:
            traits = parse_skill_id_list_json(self.monster_traits.get("1.0", tk.END))
        except Exception as e:
            messagebox.showerror("traits 格式错误", str(e))
            self._defer_restore_listbox(self.monster_list, oid)
            return
        sids = parse_skill_ids(self.monster_skill_ids_entry.get())
        unk = self._validate_skill_ids_unknown(sids)
        if unk:
            messagebox.showerror("未知 skill id", "未在 skills.json 中定义：\n" + "\n".join(unk))
            self._defer_restore_listbox(self.monster_list, oid)
            return
        badlim = self._validate_skill_limits_for_minion(sids)
        if badlim:
            messagebox.showerror("limit 不适用小怪", "以下技能为 boss 专用，不能挂给小怪：\n" + "\n".join(badlim))
            self._defer_restore_listbox(self.monster_list, oid)
            return
        monsters = self.data_monsters_doc.setdefault("monsters", [])
        idx = next((i for i, x in enumerate(monsters) if x.get("id") == oid), -1)
        if idx < 0:
            messagebox.showerror("错误", "找不到该小怪。")
            self._defer_restore_listbox(self.monster_list, oid)
            return
        new = copy.deepcopy(monsters[idx])
        new["nameCn"] = self.monster_fields["nameCn"].get().strip()
        new["nameEn"] = self.monster_fields["nameEn"].get().strip()
        new["dungeonId"] = self.monster_fields["dungeonId"].get().strip()
        new["dungeonNameCn"] = self.monster_fields["dungeonNameCn"].get().strip()
        new["attackType"] = self.monster_fields["attackType"].get().strip()
        new["role"] = self.monster_fields["role"].get().strip()
        new["creatureType"] = self.monster_fields["creatureType"].get().strip()
        new["traits"] = traits
        new["hitRadius"] = hit
        new["baseMaxHp"] = hp
        new["baseAtk"] = atk
        new["attackSpeed"] = asp
        new["range"] = rng
        new["moveSpeed"] = mv
        new["skillIds"] = sids
        monsters[idx] = new
        self._monster_snapshot = copy.deepcopy(new)
        self._refresh_monster_list(keep_id=oid)
        self._defer_restore_listbox(self.monster_list, oid)

    def monster_restore_baseline_stats(self) -> None:
        """按 unit-stat-design-baseline 近战/远程快照，恢复当前小怪生命、攻击、攻击间隔（直接写内存）。"""
        sel = self.monster_list.curselection()
        if not sel:
            messagebox.showwarning("提示", "请先选择一个小怪。")
            return
        line = self.monster_list.get(sel[0])
        mid = line.split()[0]
        monsters = self.data_monsters_doc.setdefault("monsters", [])
        idx = next((i for i, x in enumerate(monsters) if x.get("id") == mid), -1)
        if idx < 0:
            messagebox.showerror("错误", "找不到该小怪。")
            return
        mob = monsters[idx]
        hp, atk, asp = baseline_hp_atk_attack_speed(mob)
        snap = "远程" if (hp, atk, asp) == RANGED_BASELINE_HP_ATK_INTERVAL else "近战"
        if not messagebox.askyesno(
            "恢复基准三维",
            f"将「{mid}」按「{snap}」设计快照写入内存：\n"
            f"生命={hp}，攻击={atk}，攻击间隔={asp}（秒/次）\n\n"
            "依据 attackType；若无则按射程是否≥100 推断。\n"
            "确定后请保存 wowBookMonsters.json。",
        ):
            self._defer_restore_listbox(self.monster_list, mid)
            return
        mob["baseMaxHp"] = hp
        mob["baseAtk"] = atk
        mob["attackSpeed"] = asp
        monsters[idx] = mob
        self._monster_snapshot = copy.deepcopy(mob)
        self.monster_fields["baseMaxHp"].configure(state="normal")
        self.monster_fields["baseMaxHp"].delete(0, tk.END)
        self.monster_fields["baseMaxHp"].insert(0, str(hp))
        self.monster_fields["baseAtk"].configure(state="normal")
        self.monster_fields["baseAtk"].delete(0, tk.END)
        self.monster_fields["baseAtk"].insert(0, str(atk))
        self.monster_fields["attackSpeed"].configure(state="normal")
        self.monster_fields["attackSpeed"].delete(0, tk.END)
        self.monster_fields["attackSpeed"].insert(0, str(asp))
        self._refresh_monster_list(keep_id=mid)
        self._defer_restore_listbox(self.monster_list, mid)

    def monster_recalc_strength_stats(self) -> None:
        """按基准强度×技能乘区，等比调整生命与攻击（不改攻击间隔），使生命×攻击/间隔对齐目标。"""
        sel = self.monster_list.curselection()
        if not sel:
            messagebox.showwarning("提示", "请先选择一个小怪。")
            return
        line = self.monster_list.get(sel[0])
        mid = line.split()[0]
        monsters = self.data_monsters_doc.setdefault("monsters", [])
        idx = next((i for i, x in enumerate(monsters) if x.get("id") == mid), -1)
        if idx < 0:
            messagebox.showerror("错误", "找不到该小怪。")
            self._defer_restore_listbox(self.monster_list, mid)
            return
        mob = monsters[idx]
        sids = parse_skill_ids(self.monster_skill_ids_entry.get())
        unk = self._validate_skill_ids_unknown(sids)
        if unk:
            messagebox.showerror("未知 skill id", "无法重算：以下 id 不在 skills.json：\n" + "\n".join(unk))
            self._defer_restore_listbox(self.monster_list, mid)
            return
        badlim = self._validate_skill_limits_for_minion(sids)
        if badlim:
            messagebox.showerror("limit 错误", "以下为小怪不可挂载的 boss 技能：\n" + "\n".join(badlim))
            self._defer_restore_listbox(self.monster_list, mid)
            return

        try:
            asp = float(self.monster_fields["attackSpeed"].get())
            hp = int(float(self.monster_fields["baseMaxHp"].get()))
            atk = int(float(self.monster_fields["baseAtk"].get()))
            rng = int(float(self.monster_fields["range"].get()))
        except ValueError as e:
            messagebox.showerror("数值错误", f"请先填写合法的生命/攻击/攻击间隔：{e}")
            self._defer_restore_listbox(self.monster_list, mid)
            return
        if asp <= 0:
            messagebox.showerror("错误", "攻击间隔必须大于 0。")
            self._defer_restore_listbox(self.monster_list, mid)
            return

        mob_for_base = dict(mob)
        mob_for_base["attackType"] = self.monster_fields["attackType"].get().strip()
        mob_for_base["range"] = rng

        p_base = baseline_strength_product(mob_for_base)
        fac = self._skill_mount_budget_factor(sids)
        target_p = p_base * fac
        target_k = target_p * asp
        cur_k = hp * atk
        if cur_k <= 0 or target_k <= 0:
            messagebox.showerror("错误", "当前生命×攻击或目标强度无效。")
            self._defer_restore_listbox(self.monster_list, mid)
            return
        r = (target_k / cur_k) ** 0.5
        nh = max(1, round(hp * r))
        na = max(1, round(atk * r))
        nh, na = nudge_int_pair_product(nh, na, target_k)
        delta_sum = sum(SKILL_POWER_DELTA[self._skill_power_tag_code_for_id(x)] for x in sids)
        msg = (
            f"小怪「{mid}」\n"
            f"基准强度 P0=生命×攻击÷间隔 ≈ {p_base:.2f}\n"
            f"技能乘区（各 powerTag 百分比加法）: 1 + ({delta_sum:+.2f}) = {fac:.3f}\n"
            f"目标强度 P* = P0 × 乘区 ≈ {target_p:.2f}  →  目标 生命×攻击 = {target_k:.2f}\n"
            f"当前 生命×攻击 = {cur_k}，等比缩放 √({target_k:.2f}/{cur_k}) ≈ {r:.4f}\n"
            f"拟写入：生命 {hp} → {nh}，攻击 {atk} → {na}（不改间隔 {asp}）\n\n"
            "是否写入内存？"
        )
        if not messagebox.askyesno("属性重算", msg):
            self._defer_restore_listbox(self.monster_list, mid)
            return
        mob["baseMaxHp"] = nh
        mob["baseAtk"] = na
        monsters[idx] = mob
        self._monster_snapshot = copy.deepcopy(mob)
        for key, val in (("baseMaxHp", nh), ("baseAtk", na)):
            self.monster_fields[key].configure(state="normal")
            self.monster_fields[key].delete(0, tk.END)
            self.monster_fields[key].insert(0, str(val))
        self._refresh_monster_list(keep_id=mid)
        self._defer_restore_listbox(self.monster_list, mid)

    def save_monsters_file(self) -> None:
        try:
            save_json(self.path_monsters, self.data_monsters_doc)
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            return
        self._monsters_saved_doc = copy.deepcopy(self.data_monsters_doc)
        kid = self._listbox_selected_top_id(self.monster_list)
        self._refresh_monster_list(keep_id=kid)
        messagebox.showinfo("已保存", str(self.path_monsters))
        self._defer_restore_listbox(self.monster_list, kid)

    # ========== 首领 wowBookBosses.json ==========

    def _bind_vertical_scroll_wheel(self, canvas: tk.Canvas, root_widget: tk.Misc) -> None:
        """在控件子树上绑定滚轮，使表单区可纵向滚动（Windows MouseWheel / Linux Button-4/5）。"""

        def on_wheel(event: tk.Event) -> str:
            if getattr(event, "delta", 0):
                canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
            elif getattr(event, "num", None) == 4:
                canvas.yview_scroll(-1, "units")
            elif getattr(event, "num", None) == 5:
                canvas.yview_scroll(1, "units")
            return "break"

        def bind_tree(w: tk.Misc) -> None:
            w.bind("<MouseWheel>", on_wheel)
            w.bind("<Button-4>", on_wheel)
            w.bind("<Button-5>", on_wheel)
            try:
                for c in w.winfo_children():
                    bind_tree(c)
            except tk.TclError:
                pass

        bind_tree(root_widget)
        canvas.bind("<MouseWheel>", on_wheel)
        canvas.bind("<Button-4>", on_wheel)
        canvas.bind("<Button-5>", on_wheel)

    def _build_bosses_tab(self) -> None:
        top = ttk.Frame(self.tab_bosses)
        top.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(top, text="重载全部 JSON", command=self.reload_all_files).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="保存 wowBookBosses.json", command=self.save_wow_bosses_file).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="设置基础属性", command=self.boss_set_table_default_combat).pack(side=tk.LEFT, padx=2)
        ttk.Label(top, text="筛选 id / 名 / 副本 / 关卡:").pack(side=tk.LEFT, padx=(12, 2))
        self.boss_filter = ttk.Entry(top, width=26)
        self.boss_filter.pack(side=tk.LEFT, padx=2)
        self.boss_filter.bind("<KeyRelease>", lambda _e: self._refresh_boss_list())

        ttk.Label(
            self.tab_bosses,
            text="战场数值（血攻防速射程等）在本表逐章填写；缺项由游戏内 WOW_BOOK_BOSS_TABLE_DEFAULT 补齐。combatBossId 为历史兼容字段，运行时不读 bosses.json。右侧表单可滚轮或拖动滚动条。",
            wraplength=900,
        ).pack(fill=tk.X, padx=10, pady=(0, 4))

        paned = ttk.PanedWindow(self.tab_bosses, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        left = ttk.Frame(paned, width=300)
        paned.add(left, weight=0)
        self.boss_list = tk.Listbox(left, exportselection=False)
        self.boss_list.pack(fill=tk.BOTH, expand=True)
        self.boss_list.bind("<<ListboxSelect>>", lambda _e: self.boss_load_selection())

        right = ttk.Frame(paned)
        paned.add(right, weight=1)
        right.rowconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)

        boss_canvas = tk.Canvas(right, highlightthickness=0, bd=0)
        try:
            boss_canvas.configure(bg=ttk.Style(self).lookup("TFrame", "background"))
        except tk.TclError:
            pass
        boss_vsb = ttk.Scrollbar(right, orient=tk.VERTICAL, command=boss_canvas.yview)
        boss_canvas.configure(yscrollcommand=boss_vsb.set)
        boss_canvas.grid(row=0, column=0, sticky=tk.NSEW)
        boss_vsb.grid(row=0, column=1, sticky=tk.NS)

        form = ttk.Frame(boss_canvas)
        boss_inner_win = boss_canvas.create_window((0, 0), window=form, anchor=tk.NW)

        def _boss_inner_configure(_e: tk.Event) -> None:
            boss_canvas.configure(scrollregion=boss_canvas.bbox("all"))

        def _boss_canvas_configure(e: tk.Event) -> None:
            boss_canvas.itemconfigure(boss_inner_win, width=max(int(e.width) - 2, 1))

        form.bind("<Configure>", _boss_inner_configure)
        boss_canvas.bind("<Configure>", _boss_canvas_configure)

        self.boss_fields = {}
        row = 0
        for label, key, readonly in [
            ("id（只读）", "id", True),
            ("bossUid（只读）", "bossUid", True),
            ("chapterIndex（只读，书本章节号）", "chapterIndex", True),
            ("stageNumber（关内序号）", "stageNumber", False),
            ("stageNameCn", "stageNameCn", False),
            ("dungeonId", "dungeonId", False),
            ("dungeonNameCn", "dungeonNameCn", False),
            ("dungeonNameEn", "dungeonNameEn", False),
            ("nameCn", "nameCn", False),
            ("nameEn", "nameEn", False),
            ("attackType", "attackType", False),
            ("role", "role", False),
            ("creatureType", "creatureType", False),
            ("hitRadius（碰撞/代币半径）", "hitRadius", False),
            ("baseMaxHp（表底生命，直接进场）", "baseMaxHp", False),
            ("baseAtk（表底攻击，战场再乘 GLOBAL）", "baseAtk", False),
            ("attackSpeed（秒/次）", "attackSpeed", False),
            ("range（设计射程 px）", "range", False),
            ("moveSpeed", "moveSpeed", False),
            ("combatBossId（战场模板 id）", "combatBossId", False),
        ]:
            ttk.Label(form, text=label).grid(row=row, column=0, sticky=tk.W, padx=4, pady=2)
            ent = ttk.Entry(form, width=56)
            ent.grid(row=row, column=1, sticky=tk.EW, padx=4, pady=2)
            if readonly:
                ent.configure(state="readonly")
            self.boss_fields[key] = ent
            row += 1

        ttk.Label(form, text="isFinalBoss").grid(row=row, column=0, sticky=tk.W, padx=4, pady=2)
        self.boss_is_final = tk.BooleanVar(value=False)
        ttk.Checkbutton(form, variable=self.boss_is_final).grid(row=row, column=1, sticky=tk.W, padx=4, pady=2)
        row += 1

        ttk.Label(form, text="skillIds（skills.json）").grid(
            row=row, column=0, columnspan=2, sticky=tk.W, padx=4, pady=(6, 2)
        )
        row += 1
        boss_skill_row = ttk.Frame(form)
        boss_skill_row.grid(row=row, column=0, columnspan=2, sticky=tk.EW, padx=4, pady=2)
        boss_skill_row.columnconfigure(0, weight=1)
        self.boss_skill_ids_entry = ttk.Entry(boss_skill_row, width=48)
        self.boss_skill_ids_entry.grid(row=0, column=0, sticky=tk.EW)
        ttk.Button(boss_skill_row, text="选择技能…", command=self.boss_pick_skills, width=11).grid(
            row=0, column=1, padx=(4, 0)
        )
        row += 1

        form.columnconfigure(1, weight=1)
        ttk.Button(form, text="应用当前首领到内存", command=self.boss_apply_to_memory).grid(
            row=row, column=1, sticky=tk.W, padx=4, pady=8
        )

        self._bind_vertical_scroll_wheel(boss_canvas, form)

    def boss_set_table_default_combat(self) -> None:
        """将当前首领的战斗表底字段设为与 WOW_BOOK_BOSS_TABLE_DEFAULT 一致；射程按近战/远程推断（不改元数据与 skillIds）。"""
        sel = self.boss_list.curselection()
        if not sel:
            messagebox.showwarning("提示", "请先选择一个首领。")
            return
        line = self.boss_list.get(sel[0])
        bid = line.split()[0]
        bosses = self.data_wow_bosses_doc.setdefault("bosses", [])
        idx = next((i for i, x in enumerate(bosses) if x.get("id") == bid), -1)
        if idx < 0:
            messagebox.showerror("错误", "找不到该首领。")
            self._defer_restore_listbox(self.boss_list, bid)
            return
        b = bosses[idx]
        rng = book_boss_baseline_range_px(b)
        snap = "远程" if rng >= RANGED_ATTACK_RANGE_THRESHOLD else "近战"
        d = BOOK_BOSS_TABLE_DEFAULT_COMBAT
        if not messagebox.askyesno(
            "设置基础属性",
            f"将「{bid}」表底战斗字段写入与 WOW_BOOK_BOSS_TABLE_DEFAULT 一致（射程按「{snap}」）：\n"
            f"hitRadius={d['hitRadius']}, baseMaxHp={d['baseMaxHp']}, baseAtk={d['baseAtk']}, "
            f"attackSpeed={d['attackSpeed']}, range={rng}, moveSpeed={d['moveSpeed']}\n\n"
            "不改 id、名称、副本、skillIds 等；确定后请保存 wowBookBosses.json。",
        ):
            self._defer_restore_listbox(self.boss_list, bid)
            return
        b["hitRadius"] = int(d["hitRadius"])
        b["baseMaxHp"] = int(d["baseMaxHp"])
        b["baseAtk"] = int(d["baseAtk"])
        b["attackSpeed"] = float(d["attackSpeed"])
        b["range"] = int(rng)
        b["moveSpeed"] = int(d["moveSpeed"])
        bosses[idx] = b
        self._boss_snapshot = copy.deepcopy(b)
        self.boss_load_selection()
        self._refresh_boss_list(keep_id=bid)
        self._defer_restore_listbox(self.boss_list, bid)

    def _all_wow_bosses(self) -> List[Dict[str, Any]]:
        return list(self.data_wow_bosses_doc.get("bosses") or [])

    def _mainline_boss_sort_key(self, b: Dict[str, Any]) -> Tuple[int, int, str]:
        did = str(b.get("dungeonId") or "")
        ci = int(b.get("chapterIndex") or 0)
        d_rank = self._dungeon_first_chapter.get(did, 10**9)
        return (d_rank, ci, str(b.get("id") or ""))

    def _wow_bosses_sorted_for_list(self) -> List[Dict[str, Any]]:
        return sorted(self._all_wow_bosses(), key=self._mainline_boss_sort_key)

    def _refresh_boss_list(self, keep_id: Optional[str] = None) -> None:
        kid = keep_id if keep_id is not None else self._listbox_selected_top_id(self.boss_list)
        self.boss_list.delete(0, tk.END)
        q = self.boss_filter.get().strip().lower()
        for b in self._wow_bosses_sorted_for_list():
            bid = str(b.get("id", ""))
            cn = str(b.get("nameCn", ""))
            dname = str(b.get("dungeonNameCn", "")).strip() or str(b.get("dungeonId", "")).strip() or "?"
            stg = str(b.get("stageNameCn", ""))
            ci = int(b.get("chapterIndex") or 0)
            if q:
                blob = f"{bid} {cn} {dname} {stg} {ci}".lower()
                if q not in blob:
                    continue
            self.boss_list.insert(tk.END, f"{bid}  第{ci}章  {cn}  [{dname}]")
        self._apply_boss_list_row_colors()
        self._restore_listbox_selection(self.boss_list, kid)

    def boss_load_selection(self) -> None:
        sel = self.boss_list.curselection()
        if not sel:
            return
        line = self.boss_list.get(sel[0])
        bid = line.split()[0]
        b = next((x for x in self._all_wow_bosses() if x.get("id") == bid), None)
        if not isinstance(b, dict):
            return
        self._boss_snapshot = copy.deepcopy(b)

        ro = {"id", "bossUid", "chapterIndex"}
        for key, ent in self.boss_fields.items():
            ent.configure(state="normal")
            ent.delete(0, tk.END)
            if key == "stageNumber":
                ent.insert(0, str(b.get("stageNumber", "")))
            elif key == "chapterIndex":
                ent.insert(0, str(b.get("chapterIndex", "")))
            else:
                ent.insert(0, str(b.get(key, "")))
            if key in ro:
                ent.configure(state="readonly")

        self.boss_is_final.set(bool(b.get("isFinalBoss")))
        skills = b.get("skillIds") or b.get("skills") or []
        sids = skills if isinstance(skills, list) else []
        sids = [str(x) for x in sids if isinstance(x, str)]
        val = ", ".join(sids)
        self.boss_skill_ids_entry.configure(state="normal")
        self.boss_skill_ids_entry.delete(0, tk.END)
        self.boss_skill_ids_entry.insert(0, val)
        self.boss_skill_ids_entry.configure(state="readonly")

    def boss_apply_to_memory(self) -> None:
        if not self._boss_snapshot:
            messagebox.showwarning("提示", "请先选择一个首领。")
            return
        oid = self._boss_snapshot.get("id")
        if not oid:
            messagebox.showerror("错误", "当前条目缺少 id。")
            return
        try:
            stn = int(float(self.boss_fields["stageNumber"].get()))
        except ValueError as e:
            messagebox.showerror("数值错误", f"stageNumber: {e}")
            self._defer_restore_listbox(self.boss_list, str(oid))
            return
        skills = parse_skill_ids(self.boss_skill_ids_entry.get())
        unk = self._validate_skill_ids_unknown(skills)
        if unk:
            messagebox.showerror("未知 skill id", "未在 skills.json 中定义：\n" + "\n".join(unk))
            self._defer_restore_listbox(self.boss_list, str(oid))
            return
        badlim = self._validate_skill_limits_for_boss(skills)
        if badlim:
            messagebox.showerror("limit 不适用首领", "以下技能为 minion 专用，不能挂给书本首领：\n" + "\n".join(badlim))
            self._defer_restore_listbox(self.boss_list, str(oid))
            return

        try:
            hit = int(float(self.boss_fields["hitRadius"].get()))
            hp = int(float(self.boss_fields["baseMaxHp"].get()))
            atk = int(float(self.boss_fields["baseAtk"].get()))
            asp = float(self.boss_fields["attackSpeed"].get())
            rng = int(float(self.boss_fields["range"].get()))
            mv = int(float(self.boss_fields["moveSpeed"].get()))
        except ValueError as e:
            messagebox.showerror("数值错误", str(e))
            self._defer_restore_listbox(self.boss_list, str(oid))
            return
        if hit < 1 or hp < 1 or atk < 1 or rng < 0 or mv < 1 or asp <= 0:
            messagebox.showerror(
                "数值错误",
                "请检查：hitRadius/baseMaxHp/baseAtk ≥1，range≥0，moveSpeed≥1，attackSpeed>0。",
            )
            self._defer_restore_listbox(self.boss_list, str(oid))
            return

        bosses = self.data_wow_bosses_doc.setdefault("bosses", [])
        idx = next((i for i, x in enumerate(bosses) if x.get("id") == oid), -1)
        if idx < 0:
            messagebox.showerror("错误", "找不到该首领条目。")
            self._defer_restore_listbox(self.boss_list, str(oid))
            return

        new = copy.deepcopy(bosses[idx])
        new["stageNumber"] = stn
        new["stageNameCn"] = self.boss_fields["stageNameCn"].get().strip()
        new["dungeonId"] = self.boss_fields["dungeonId"].get().strip()
        new["dungeonNameCn"] = self.boss_fields["dungeonNameCn"].get().strip()
        new["dungeonNameEn"] = self.boss_fields["dungeonNameEn"].get().strip()
        new["nameCn"] = self.boss_fields["nameCn"].get().strip()
        new["nameEn"] = self.boss_fields["nameEn"].get().strip()
        new["attackType"] = self.boss_fields["attackType"].get().strip()
        new["role"] = self.boss_fields["role"].get().strip()
        new["creatureType"] = self.boss_fields["creatureType"].get().strip()
        new["hitRadius"] = hit
        new["baseMaxHp"] = hp
        new["baseAtk"] = atk
        new["attackSpeed"] = asp
        new["range"] = rng
        new["moveSpeed"] = mv
        new["combatBossId"] = self.boss_fields["combatBossId"].get().strip()
        new["isFinalBoss"] = bool(self.boss_is_final.get())
        new["skillIds"] = skills
        if "skills" in new:
            del new["skills"]
        bosses[idx] = new
        self._boss_snapshot = copy.deepcopy(new)
        self._refresh_boss_list(keep_id=str(oid))
        self._defer_restore_listbox(self.boss_list, str(oid))

    def save_wow_bosses_file(self) -> None:
        try:
            save_json(self.path_wow_bosses, self.data_wow_bosses_doc)
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            return
        self._wow_bosses_saved_doc = copy.deepcopy(self.data_wow_bosses_doc)
        kid = self._listbox_selected_top_id(self.boss_list)
        self._refresh_boss_list(keep_id=kid)
        messagebox.showinfo("已保存", str(self.path_wow_bosses))
        self._defer_restore_listbox(self.boss_list, kid)


def main() -> None:
    app = WowBookConfigEditorApp()
    app.mainloop()


if __name__ == "__main__":
    main()
