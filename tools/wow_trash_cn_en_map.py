#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《魔兽世界副本大全.md》里 **副本怪物** 常见中文词条 → 英文展示名 / 文件名 slug 用词；
并覆盖少量「仅中文分区名」的精英槽位（如血色修道院四区）。

供 `generate_wow_5man_prompt_pack.py` 写入 MD 标题括号；`wow_md_parse_jobs.py` 用同一套逻辑避免 `unnamed` 文件名。
"""

from __future__ import annotations

import zlib

# 键为 strip 后的中文；值为英文词组（ASCII；最终文件名由 slug_ascii 再规范化）
TRASH_CN_TO_EN: dict[str, str] = {
    "丧尸": "Zombie",
    "云人": "Cloud_Spirit",
    "亡灵": "Undead",
    "亡灵天灾": "Scourge_Undead",
    "亡灵学生": "Undead_Student",
    "亡灵角斗士": "Undead_Gladiator",
    "仆人": "Servant",
    "信徒": "Cultist",
    "傀儡": "Construct",
    "傲慢者": "Pridefiend",
    "僵尸": "Zombie",
    "元素": "Elemental",
    "农场动物": "Farm_Animal",
    "冰霜巨魔": "Ice_Troll",
    "凶恶的软泥怪": "Vicious_Slime",
    "凶恶的鱼人": "Vicious_Murloc",
    "半人马幽魂": "Centaur_Specter",
    "卓格巴尔": "Trogg",
    "变异体": "Mutant",
    "变异植物": "Mutated_Plant",
    "各种异界生物": "Otherworldly_Creature",
    "各种时空生物": "Temporal_Creature",
    "各种神秘生物": "Arcane_Anomaly",
    "各种被囚禁的恶魔": "Imprisoned_Demon",
    "吸血鬼": "Vampire",
    "囚犯": "Prisoner",
    "土灵": "Earth_Spirit",
    "圣武士": "Holy_Warrior",
    "地精": "Goblin",
    "堕落德莱尼": "Broken_Draenei",
    "堕落灵": "Fallen_Spirit",
    "夜之子": "Nightborne",
    "娜迦": "Naga",
    "娜迦奴隶主": "Naga_Slavemaster",
    "娜迦技师": "Naga_Technician",
    "学徒": "Apprentice",
    "守望者": "Warden",
    "岩浆元素": "Magma_Elemental",
    "岩石傀儡": "Rock_Construct",
    "岩石元素": "Rock_Elemental",
    "幽灵": "Specter",
    "幽魂": "Wraith",
    "恐龙": "Dinosaur",
    "恶魔": "Demon",
    "恶魔入侵者": "Demon_Invader",
    "托维尔人": "Tolvir",
    "旧人类士兵": "Human_Militia",
    "暗影萨满": "Dark_Shaman",
    "暴动囚犯": "Riot_Prisoner",
    "木精": "Botani",
    "术士": "Warlock",
    "机器人": "Robot",
    "机械": "Mechanical",
    "机械侏儒": "Leper_Gnome",
    "机械傀儡": "Clockwork_Construct",
    "梦境生物": "Dream_Creature",
    "梦魇生物": "Nightmare_Creature",
    "森林巨魔": "Forest_Troll",
    "植物生物": "Plant_Creature",
    "死亡骑士": "Death_Knight",
    "毒菇": "Toxic_Fungus",
    "沙怒巨魔": "Sandfury_Troll",
    "沙漠元素": "Desert_Elemental",
    "沙蝎": "Sand_Scorpion",
    "沼泽生物": "Swamp_Creature",
    "法师": "Mage",
    "法师傀儡": "Arcane_Construct",
    "泰坦傀儡": "Titan_Construct",
    "洞穴人": "Cave_Dweller",
    "海元素": "Sea_Elemental",
    "海拉仆从": "Helheim_Servant",
    "海盗": "Pirate",
    "涨潮师": "Tidecaller",
    "火焰元素": "Fire_Elemental",
    "煞魔": "Sha",
    "熊猫人": "Pandaren",
    "熊猫人武僧": "Pandaren_Monk",
    "狼人": "Worgen",
    "猎人犬": "Mastiff",
    "猢狲": "Hozen",
    "猪人": "Quillboar",
    "畸形妖": "Deviate_Fiend",
    "盗贼": "Bandit",
    "石头傀儡": "Stone_Construct",
    "石灵": "Stone_Spirit",
    "矿工": "Miner",
    "秃鹫": "Vulture",
    "章鱼": "Kraken_Tentacle",
    "红龙": "Red_Dragon",
    "纳鲁": "Naaru",
    "织雾者": "Mistweaver",
    "维库人": "Vrykul",
    "腐化植物": "Corrupted_Plant",
    "腐烂生物": "Rotting_Creature",
    "自然元素": "Nature_Elemental",
    "蒸汽傀儡": "Steam_Construct",
    "蓝龙": "Blue_Dragon",
    "蓝龙军团": "Blue_Dragonflight",
    "蘑菇人": "Fungal_Humanoid",
    "虚空存在": "Void_Entity",
    "虚空生物": "Void_Creature",
    "虫子": "Burrower",
    "蚂蚁": "Giant_Ant",
    "蛇": "Serpent",
    "蛇人": "Sethrak",
    "蛛魔": "Nerubian",
    "蝙蝠": "Bat",
    "螳螂人": "Mantid",
    "血神信徒": "Blood_God_Cultist",
    "血精灵": "Blood_Elf",
    "血精灵法师": "Blood_Elf_Mage",
    "血色十字军士兵": "Scarlet_Crusader",
    "血谷战士": "Bleeding_Hollow_Warrior",
    "被囚禁的恶魔": "Jailed_Demon",
    "被腐化的灵魂": "Corrupted_Soul",
    "诅咒神教成员": "Cult_of_the_Damned",
    "诅咒者": "Accursed",
    "诺库德战士": "Nokhud_Warrior",
    "豺狼人": "Gnoll",
    "贵族": "Noble",
    "赞达拉巨魔": "Zandalari_Troll",
    "软泥怪": "Ooze",
    "迅猛龙": "Raptor",
    "迪菲亚船员": "Defias_Sailor",
    "邪能傀儡": "Fel_Construct",
    "邪能兽人": "Fel_Orc",
    "酿酒元素": "Alemental",
    "野猪人": "Razorfen_Quillboar",
    "钢铁兽人": "Iron_Horde_Orc",
    "陆行鸟": "Tallstrider",
    "风元素": "Air_Elemental",
    "风暴巨人": "Storm_Giant",
    "风暴鸦": "Storm_Raven",
    "食人魔": "Ogre",
    "食尸鬼": "Ghoul",
    "骑士": "Knight",
    "骷髅": "Skeleton",
    "骷髅战士": "Skeletal_Warrior",
    "骷髅法师": "Skeletal_Mage",
    "鬼魂": "Ghost",
    "魔古": "Mogu",
    "魔法傀儡": "Arcane_Golem",
    "魔法元素": "Arcane_Elemental",
    "鱼人": "Murloc",
    "鸦人": "Arakkoa",
    "黑石兽人": "Blackrock_Orc",
    "黑铁兽人": "Dark_Iron_Orc",
    "黑铁矮人": "Dark_Iron_Dwarf",
    "龙": "Dragon",
    "龙人": "Dragonspawn",
    "龙喉兽人": "Dragonmaw_Orc",
    "龙类": "Drake",
}

# 源文档里用分区名代替具名首领时的精英槽（血色修道院等）
ELITE_ZONE_CN_TO_EN: dict[str, str] = {
    "墓穴区": "Graveyard_Wing",
    "图书馆区": "Library_Wing",
    "武器库区": "Armory_Wing",
    "教堂区": "Cathedral_Wing",
}


def resolve_unit_english_for_slug(ucn: str, uen: str) -> str:
    """有英文用英文；否则小怪表 → 分区表 → 稳定占位（保证可 slug、不撞 unnamed）。"""
    t = (uen or "").strip()
    if t:
        return t
    key = (ucn or "").strip()
    if key in TRASH_CN_TO_EN:
        return TRASH_CN_TO_EN[key]
    if key in ELITE_ZONE_CN_TO_EN:
        return ELITE_ZONE_CN_TO_EN[key]
    ad = zlib.adler32(key.encode("utf-8")) & 0xFFFFFFFF
    return f"WoW_Unit_{ad:08X}"


def trash_token_english(cn: str) -> str:
    """兼容旧名：等价于 resolve_unit_english_for_slug(cn, '')。"""
    return resolve_unit_english_for_slug(cn, "")
