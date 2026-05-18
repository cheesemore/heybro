import type { Application } from 'pixi.js';

/** 供 Pixi 使用的分辨率上限，避免超高 DPR 设备显存过大 */
export const RENDERER_RESOLUTION_CAP = 2.5;

/**
 * 部分内网 WebView / 微信浏览器会把 devicePixelRatio 报成 1，画布被 CSS 放大后整体发糊、文字描边像黑影。
 * 在宽屏手机上若 DPR 偏低，则至少使用 2x 渲染。
 */
export function getRendererResolution(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  let r = Math.max(1, dpr);
  if (r < 2) {
    const sw = window.screen?.width ?? 0;
    const iw = window.innerWidth || 0;
    if (iw >= 360 || sw >= 390) {
      r = 2;
    }
  }
  return Math.min(r, RENDERER_RESOLUTION_CAP);
}

export function syncRendererDensity(app: Application): void {
  const next = getRendererResolution();
  if (Math.abs(app.renderer.resolution - next) > 0.01) {
    app.renderer.resolution = next;
  }
  app.resize();
}
