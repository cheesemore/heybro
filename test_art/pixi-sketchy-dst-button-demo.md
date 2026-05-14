# pixi-sketchy-dst-button-demo.html · 使用说明

对应页面：`pixi-sketchy-dst-button-demo.html`（与本 `.md` 同名，方便一起找）。

## 这是什么

用 **PixiJS 7**（CDN：`pixi.js@7.4.2`）画的一个 **斜切「确定」** 演示：曾尝试 GPU 滤镜模拟手绘边，在部分内嵌浏览器里不稳定，当前以 **顶点抖动重绘 `Graphics`** 为主（勾选「手绘边缘」时）。**需要联网**加载 CDN 上的 Pixi。

## 怎么打开

1. **必须能访问外网**（加载 jsdelivr）。双击 HTML 或用 Chrome / Edge 打开。
2. **推荐**：在本目录起静态服务：

```bash
cd /d E:\cursor\heybro\test_art
python -m http.server 8765
```

浏览器打开：`http://127.0.0.1:8765/pixi-sketchy-dst-button-demo.html`

## 怎么用到项目里

- 逻辑全在页面 **内联 `<script>`**：可把「画斜切 + 文本 + ticker 重绘」抽成你工程里的模块；Pixi 版本建议与项目一致（示例 7.4.2）。
- 若正式项目要 **稳定手绘扭曲边**，更常见是：美术贴图、DOM+SVG 滤镜、或单独在桌面 Chrome 上调通 `@pixi/filter-displacement` 再评估移动端/内嵌 WebView。

## 小提示

改脚本后 **`Ctrl+F5`** 强刷。内嵌浏览器若表现异常，用系统 Chrome 打开同一 URL 对比。
