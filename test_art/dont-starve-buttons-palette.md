# dont-starve-buttons-palette.html · 使用说明

对应页面：`dont-starve-buttons-palette.html`（与本 `.md` 同名，方便一起找）。

## 这是什么

饥荒（Don’t Starve）风格 **12 套配色**按钮图鉴：**纯 HTML/CSS**，带左上/右下斜切、`clip-path` 粗黑边；悬停有 **轻微放大 + 随机小角度**（页尾一小段脚本设置 `--tilt`）。**不依赖 Pixi / React**。

## 怎么打开

1. **双击** `dont-starve-buttons-palette.html`，用 Chrome / Edge 打开即可（无需联网即可看样式；无外链字体）。
2. **推荐**：在本目录开静态服务，避免个别环境对 `file://` 的限制：

```bash
cd /d E:\cursor\heybro\test_art
python -m http.server 8765
```

浏览器打开：`http://127.0.0.1:8765/dont-starve-buttons-palette.html`

## 怎么用到项目里

- 每个按钮下方有 **HEX**，可复制到项目的 CSS 变量、Tailwind `bg-[#...]` / `text-[#...]` 等。
- 外形与动效：看页面里 **`.dst-btn`** 的 `clip-path`、`--fill` / `--ink`，以及底部 **`pointerenter` / `pointerleave`** 脚本；集成到 React/Vue 时请把脚本改成组件事件或 hooks。
- 若系统缺楷体，会回退到宋体等，可在自己项目里统一指定 `font-family`。

## 小提示

改完样式后浏览器 **`Ctrl+F5`** 强刷再看效果。
