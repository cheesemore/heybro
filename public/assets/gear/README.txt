装备图标目录（与 gearItems.json 的 gearId 一一对应）

文件名：<gearId>.png
  例：ragefire_chasm.head.png、deadmines.mainHand.png

稳定主键 gearId 格式：<dungeonId>.<slotKind>
  - dungeonId 与 wowBookRegistry.dungeons[].dungeonId 一致
  - slotKind 见 src/game/gearSlots.ts（head、mainHand、trinket 等）

替换正式美术：覆盖同名 PNG 即可，无需改表。
占位图由 npm run gear:placeholders 生成（图上印有 gearId 便于核对）。

代码读取（待接 UI）：src/game/gearIconAssets.ts → publicAssetUrl('assets/gear/<gearId>.png')
