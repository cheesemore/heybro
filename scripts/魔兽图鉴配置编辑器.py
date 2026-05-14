#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
魔兽图鉴 / 战斗配置编辑器（Tkinter，仅标准库）。

功能：
  - 编辑 src/game/config/skills.json：技能增删改；实现状态「待修改」由策划在界面手工选择，不会在保存时自动改写。
  - 编辑 src/game/config/wowBookMonsters.json：小怪数值与 skillIds。
  - 编辑 src/game/config/bosses.json：首领数值与 skillIds。

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


class WowBookConfigEditorApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("HeyBro — 怪物 / 首领 / 技能 配置编辑器")
        self.geometry("1100x720")
        self.minsize(920, 560)

        root = repo_root()
        self.path_skills = root / "src" / "game" / "config" / "skills.json"
        self.path_monsters = root / "src" / "game" / "config" / "wowBookMonsters.json"
        self.path_bosses = root / "src" / "game" / "config" / "bosses.json"

        self.data_skills: Dict[str, Any] = {}
        self.data_monsters_doc: Dict[str, Any] = {}
        self.data_bosses: Dict[str, Any] = {}

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
        nb.add(self.tab_bosses, text="首领 bosses.json")

        self._build_skills_tab()
        self._build_monsters_tab()
        self._build_bosses_tab()

        self.reload_all_files()

    # --- load / save all ---

    def reload_all_files(self) -> None:
        try:
            self.data_skills = load_json(self.path_skills)
            self.data_monsters_doc = load_json(self.path_monsters)
            self.data_bosses = load_json(self.path_bosses)
        except Exception as e:
            messagebox.showerror("加载失败", str(e))
            return
        self._refresh_skill_list()
        self._refresh_monster_list()
        self._refresh_boss_list()
        messagebox.showinfo("已重载", "已从磁盘重新加载三个 JSON 文件。")

    def reload_all_files_silent(self) -> None:
        self.data_skills = load_json(self.path_skills)
        self.data_monsters_doc = load_json(self.path_monsters)
        self.data_bosses = load_json(self.path_bosses)
        self._refresh_skill_list()
        self._refresh_monster_list()
        self._refresh_boss_list()

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
        right.rowconfigure(4, weight=1)
        right.rowconfigure(5, weight=1)

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

    def _refresh_skill_list(self) -> None:
        self.skill_list.delete(0, tk.END)
        skills: List[Dict[str, Any]] = self.data_skills.get("skills") or []
        for s in skills:
            sid = s.get("id", "?")
            st = s.get("codeStatus")
            if st is None and "implemented" in s:
                st = "written" if s.get("implemented") else "missing"
            tag = st or "?"
            self.skill_list.insert(tk.END, f"{sid}  [{tag}]")

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
            "codeStatus": "missing",
            "descriptionCn": "",
            "logicEffectCn": "",
            "params": [],
        }
        skills.append(blank)
        self._refresh_skill_list()
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

    def _read_skill_from_form(self) -> Dict[str, Any]:
        params_raw = self.skill_params.get("1.0", tk.END).strip()
        params = parse_params_json(params_raw) if params_raw else []
        return {
            "id": self.skill_id.get().strip(),
            "nameCn": self.skill_name.get().strip(),
            "limit": self.skill_limit.get() or "any",
            "codeStatus": self._skill_status_code_from_ui(),
            "descriptionCn": self.skill_desc.get("1.0", tk.END).rstrip("\n"),
            "logicEffectCn": self.skill_logic.get("1.0", tk.END).rstrip("\n"),
            "params": params,
        }

    def skill_apply_to_memory(self) -> None:
        try:
            rec = self._read_skill_from_form()
        except Exception as e:
            messagebox.showerror("params 错误", str(e))
            return
        if not rec["id"]:
            messagebox.showerror("错误", "id 不能为空。")
            return
        if rec["limit"] not in SKILL_LIMITS:
            messagebox.showerror("错误", f"limit 必须是 {SKILL_LIMITS} 之一。")
            return

        ui_status = self._skill_status_code_from_ui()
        if ui_status not in ("written", "missing", "pending_changes"):
            messagebox.showerror("错误", "codeStatus 无效。")
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
            return

        rec["codeStatus"] = ui_status

        if snapshot is None:
            ex = self._find_skill_index(rec["id"])
            if ex >= 0:
                skills[ex] = rec
            else:
                skills.append(rec)
        else:
            if idx_old >= 0:
                skills[idx_old] = rec
            else:
                skills.append(rec)

        rec.pop("implemented", None)
        self._skill_is_new = False
        self._skill_snapshot = copy.deepcopy(rec)
        self._refresh_skill_list()
        messagebox.showinfo("已应用", "已写入内存中的 skills 列表。请点「保存 skills.json」写盘。")

    def save_skills_file(self) -> None:
        try:
            save_json(self.path_skills, self.data_skills)
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            return
        messagebox.showinfo("已保存", str(self.path_skills))

    # ========== 小怪 ==========

    def _build_monsters_tab(self) -> None:
        top = ttk.Frame(self.tab_monsters)
        top.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(top, text="重载全部 JSON", command=self.reload_all_files).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="保存 wowBookMonsters.json", command=self.save_monsters_file).pack(side=tk.LEFT, padx=2)
        ttk.Label(top, text="筛选 id / 中文名:").pack(side=tk.LEFT, padx=(12, 2))
        self.monster_filter = ttk.Entry(top, width=28)
        self.monster_filter.pack(side=tk.LEFT, padx=2)
        self.monster_filter.bind("<KeyRelease>", lambda _e: self._refresh_monster_list())

        paned = ttk.PanedWindow(self.tab_monsters, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        left = ttk.Frame(paned, width=240)
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
            ("hitRadius", "hitRadius"),
            ("baseMaxHp", "baseMaxHp"),
            ("baseAtk", "baseAtk"),
            ("attackSpeed", "attackSpeed"),
            ("range", "range"),
            ("moveSpeed", "moveSpeed"),
            ("skillIds（逗号分隔）", "skillIds_text"),
        ]:
            ttk.Label(right, text=label).grid(row=row, column=0, sticky=tk.W, padx=4, pady=2)
            ent = ttk.Entry(right, width=56)
            ent.grid(row=row, column=1, sticky=tk.EW, padx=4, pady=2)
            if "只读" in label:
                ent.configure(state="readonly")
            self.monster_fields[key] = ent
            row += 1
        right.columnconfigure(1, weight=1)

        ttk.Button(right, text="应用当前小怪到内存", command=self.monster_apply_to_memory).grid(
            row=row, column=1, sticky=tk.W, padx=4, pady=8
        )

    def _all_monsters(self) -> List[Dict[str, Any]]:
        return list(self.data_monsters_doc.get("monsters") or [])

    def _refresh_monster_list(self) -> None:
        self.monster_list.delete(0, tk.END)
        q = self.monster_filter.get().strip().lower()
        for m in self._all_monsters():
            mid = str(m.get("id", ""))
            cn = str(m.get("nameCn", ""))
            if q and q not in mid.lower() and q not in cn.lower():
                continue
            self.monster_list.insert(tk.END, f"{mid}  {cn}")

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
            if key == "skillIds_text":
                sids = m.get("skillIds") or []
                val = ", ".join(sids) if isinstance(sids, list) else str(sids)
                ent.configure(state="normal")
                ent.delete(0, tk.END)
                ent.insert(0, val)
            else:
                ent.configure(state="normal")
                ent.delete(0, tk.END)
                ent.insert(0, str(m.get(key, "")))
                if key in ro:
                    ent.configure(state="readonly")

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
            return
        sids = parse_skill_ids(self.monster_fields["skillIds_text"].get())
        monsters = self.data_monsters_doc.setdefault("monsters", [])
        idx = next((i for i, x in enumerate(monsters) if x.get("id") == oid), -1)
        if idx < 0:
            messagebox.showerror("错误", "找不到该小怪。")
            return
        new = copy.deepcopy(monsters[idx])
        new["nameCn"] = self.monster_fields["nameCn"].get().strip()
        new["nameEn"] = self.monster_fields["nameEn"].get().strip()
        new["dungeonId"] = self.monster_fields["dungeonId"].get().strip()
        new["hitRadius"] = hit
        new["baseMaxHp"] = hp
        new["baseAtk"] = atk
        new["attackSpeed"] = asp
        new["range"] = rng
        new["moveSpeed"] = mv
        new["skillIds"] = sids
        monsters[idx] = new
        self._monster_snapshot = copy.deepcopy(new)
        self._refresh_monster_list()
        messagebox.showinfo("已应用", "已更新内存中的小怪。请保存 wowBookMonsters.json 写盘。")

    def save_monsters_file(self) -> None:
        try:
            save_json(self.path_monsters, self.data_monsters_doc)
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            return
        messagebox.showinfo("已保存", str(self.path_monsters))

    # ========== 首领 ==========

    def _build_bosses_tab(self) -> None:
        top = ttk.Frame(self.tab_bosses)
        top.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(top, text="重载全部 JSON", command=self.reload_all_files).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="保存 bosses.json", command=self.save_bosses_file).pack(side=tk.LEFT, padx=2)

        paned = ttk.PanedWindow(self.tab_bosses, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        left = ttk.Frame(paned, width=200)
        paned.add(left, weight=0)
        self.boss_list = tk.Listbox(left, exportselection=False)
        self.boss_list.pack(fill=tk.BOTH, expand=True)
        self.boss_list.bind("<<ListboxSelect>>", lambda _e: self.boss_load_selection())

        right = ttk.Frame(paned)
        paned.add(right, weight=1)

        self.boss_fields: Dict[str, ttk.Entry] = {}
        row = 0
        for label, key in [
            ("boss key（只读）", "boss_key"),
            ("name", "name"),
            ("hitRadius", "hitRadius"),
            ("baseMaxHp", "baseMaxHp"),
            ("baseAtk", "baseAtk"),
            ("attackSpeed", "attackSpeed"),
            ("range", "range"),
            ("moveSpeed", "moveSpeed"),
            ("skillIds（逗号分隔）", "skillIds_text"),
        ]:
            ttk.Label(right, text=label).grid(row=row, column=0, sticky=tk.W, padx=4, pady=2)
            ent = ttk.Entry(right, width=56)
            ent.grid(row=row, column=1, sticky=tk.EW, padx=4, pady=2)
            if "只读" in label:
                ent.configure(state="readonly")
            self.boss_fields[key] = ent
            row += 1
        right.columnconfigure(1, weight=1)
        ttk.Button(right, text="应用当前首领到内存", command=self.boss_apply_to_memory).grid(
            row=row, column=1, sticky=tk.W, padx=4, pady=8
        )

    def _refresh_boss_list(self) -> None:
        self.boss_list.delete(0, tk.END)
        for k in sorted(self.data_bosses.keys()):
            self.boss_list.insert(tk.END, k)

    def boss_load_selection(self) -> None:
        sel = self.boss_list.curselection()
        if not sel:
            return
        bid = self.boss_list.get(sel[0])
        b = self.data_bosses.get(bid)
        if not isinstance(b, dict):
            return
        self._boss_snapshot = {"boss_key": bid, **copy.deepcopy(b)}
        self.boss_fields["boss_key"].configure(state="normal")
        self.boss_fields["boss_key"].delete(0, tk.END)
        self.boss_fields["boss_key"].insert(0, bid)
        self.boss_fields["boss_key"].configure(state="readonly")
        for key in ("name", "hitRadius", "baseMaxHp", "baseAtk", "attackSpeed", "range", "moveSpeed"):
            self.boss_fields[key].delete(0, tk.END)
            self.boss_fields[key].insert(0, str(b.get(key, "")))
        sids = b.get("skillIds") or []
        self.boss_fields["skillIds_text"].delete(0, tk.END)
        self.boss_fields["skillIds_text"].insert(0, ", ".join(sids) if isinstance(sids, list) else str(sids))

    def boss_apply_to_memory(self) -> None:
        snap = self._boss_snapshot
        if not snap or "boss_key" not in snap:
            messagebox.showwarning("提示", "请先选择一个首领。")
            return
        bid = snap["boss_key"]
        try:
            hit = int(float(self.boss_fields["hitRadius"].get()))
            hp = int(float(self.boss_fields["baseMaxHp"].get()))
            atk = int(float(self.boss_fields["baseAtk"].get()))
            asp = float(self.boss_fields["attackSpeed"].get())
            rng = int(float(self.boss_fields["range"].get()))
            mv = int(float(self.boss_fields["moveSpeed"].get()))
        except ValueError as e:
            messagebox.showerror("数值错误", str(e))
            return
        sids = parse_skill_ids(self.boss_fields["skillIds_text"].get())
        b = self.data_bosses.get(bid)
        if not isinstance(b, dict):
            messagebox.showerror("错误", f"找不到首领: {bid}")
            return
        b["name"] = self.boss_fields["name"].get().strip()
        b["hitRadius"] = hit
        b["baseMaxHp"] = hp
        b["baseAtk"] = atk
        b["attackSpeed"] = asp
        b["range"] = rng
        b["moveSpeed"] = mv
        b["skillIds"] = sids
        self._boss_snapshot = {"boss_key": bid, **copy.deepcopy(b)}
        messagebox.showinfo("已应用", "已更新内存中的首领。请保存 bosses.json 写盘。")

    def save_bosses_file(self) -> None:
        try:
            save_json(self.path_bosses, self.data_bosses)
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            return
        messagebox.showinfo("已保存", str(self.path_bosses))


def main() -> None:
    app = WowBookConfigEditorApp()
    app.mainloop()


if __name__ == "__main__":
    main()
