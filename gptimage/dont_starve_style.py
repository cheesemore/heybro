"""
Don't Starve / Klei-style prompt fragment shared by gptimage portrait pipelines.

Import from repo root or gptimage/ (see each script's sys.path insert).
"""

STYLE_CORE = (
    "Art style like Klei's Don't Starve: hand-ink outlines, slightly jittery line weight, "
    "flat or lightly hatched fills, desaturated earthy palette, puppet-like stylized proportions, "
    "subtle grim whimsy, NOT photoreal, NOT glossy anime cel, NOT soft airbrush beauty render, "
    "NOT clean Pixar 3D."
)

# 副本背景大场景：与 docs《饥荒风提示词大全》一致；**无前景小怪群**，仅远景关底首领虚影。
STYLE_SCENE_DUNGEON = (
    "Don't Starve / Klei loading-screen: environment-first dungeon mood; thick ink outlines, "
    "flat or short-hatched shadows, desaturated earthy palette, paper-theatre depth; "
    "**NO** foreground or midground patrol mobs / trash packs; **only** a tiny faint far "
    "vanishing-point boss silhouette (5–8% frame height), merged into darkness, NOT readable face; "
    "chalky muted lava/magic with inked edges, NOT neon; NO volumetric god rays, NO lens flare, "
    "NO photoreal rock microdetail, NO WoW cinematic trailer polish."
)
