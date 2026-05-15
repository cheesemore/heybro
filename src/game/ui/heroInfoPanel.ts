import { Container, FederatedPointerEvent, FederatedWheelEvent, Graphics, Rectangle, Text } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { buildHeroIntroBodySegments, type HeroIntroBondLineTintMode } from '../heroIntroCopy';
import type { HeroId } from '../heroRegistry';
import { getHeroDef } from '../heroRegistry';
import { createDraftHeroToken } from '../unitCircleTokens';
import { GOLDEN_PANEL_TITLE } from './goldenSolidPanel';

export type MountHeroInfoPanelContentOpts = {
  parent: Container;
  /** 金面板左上角（与 drawGoldenSolidPanel 一致） */
  px: number;
  py: number;
  pw: number;
  ph: number;
  padX: number;
  padTop: number;
  /** 为 null 时不绘制标题行 */
  titleText: string | null;
  titleFontSize: number;
  titleAlign: 'left' | 'center';
  heroId: HeroId;
  /** 备战该职业总层数；无棋盘上下文用 0 */
  classStacksOnBoard: number;
  /**
   * 穆兰羁绊 6/10/15 行着色：`respectStacks` 未达层数灰色；`allActive` 一律激活色（招募/强化等无棋盘时）。
   */
  heroIntroBondLineTint?: HeroIntroBondLineTintMode;
  tokenDia: number;
  gapAfterTitle: number;
  gapAfterToken: number;
  bodyFontSize: number;
  bodyLineHeight: number;
  /**
   * 从面板底边 `py+ph` 向上预留的高度（按钮区等），
   * 正文滚动区下沿为 `py + ph - footerReserve - gapAboveFooter`。
   */
  footerReserve: number;
  gapAboveFooter?: number;
};

/**
 * 在 `parent` 上追加：可选标题 + 头像代币 + **可滚轮/拖拽**的正文区（`buildHeroIntroBodySegments`）。
 * 坐标均为与 `parent` 相同的屏幕空间（通常为全屏 overlay 根）。
 * @returns `dispose` 须在移除 `parent` 子节点前调用，以卸载 wheel / document 监听。
 */
export function mountHeroInfoPanelContent(o: MountHeroInfoPanelContentOpts): () => void {
  const gapAboveFooter = o.gapAboveFooter ?? Math.round(10 * LAYOUT_SCALE);
  const scrollBottomY = o.py + o.ph - o.footerReserve - gapAboveFooter;
  const wrapW = o.pw - o.padX * 2;
  const bondLineTint = o.heroIntroBondLineTint ?? 'allActive';

  let cursorY = o.py + o.padTop;
  let title: Text | null = null;
  if (o.titleText) {
    title = new Text({
      text: o.titleText,
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: o.titleFontSize,
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: wrapW,
      },
    });
    title.anchor.set(o.titleAlign === 'center' ? 0.5 : 0, 0);
    title.position.set(
      o.titleAlign === 'center' ? o.px + o.pw / 2 : o.px + o.padX,
      cursorY,
    );
    o.parent.addChild(title);
    cursorY += title.height + o.gapAfterTitle;
  }

  const def = getHeroDef(o.heroId);
  if (!def) {
    return () => {
      if (title) {
        o.parent.removeChild(title);
        title.destroy();
      }
    };
  }

  const tok = createDraftHeroToken(o.heroId, def.allyClass, o.tokenDia);
  tok.position.set(o.px + o.pw / 2, cursorY + o.tokenDia);
  o.parent.addChild(tok);
  cursorY += 2 * o.tokenDia + o.gapAfterToken;

  const scrollTopY = cursorY;
  const scrollH = Math.max(Math.round(48 * LAYOUT_SCALE), scrollBottomY - scrollTopY);

  const viewport = new Container();
  viewport.position.set(o.px + o.padX, scrollTopY);
  viewport.eventMode = 'static';
  viewport.cursor = 'grab';
  viewport.hitArea = new Rectangle(0, 0, wrapW, scrollH);

  const maskG = new Graphics();
  maskG.rect(0, 0, wrapW, scrollH).fill(0xffffff);
  viewport.addChild(maskG);
  viewport.mask = maskG;

  const scrollContent = new Container();
  scrollContent.eventMode = 'passive';

  const segments = buildHeroIntroBodySegments(o.heroId, o.classStacksOnBoard, { bondLineTint });
  let bodyY = 0;
  for (const seg of segments) {
    const t = new Text({
      text: seg.text,
      style: {
        fontFamily: 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif',
        fontSize: o.bodyFontSize,
        fill: seg.fill,
        wordWrap: true,
        wordWrapWidth: wrapW,
        lineHeight: o.bodyLineHeight,
        breakWords: true,
      },
    });
    t.position.set(0, bodyY);
    bodyY += t.height + (seg.marginBottom ?? 0);
    scrollContent.addChild(t);
  }

  const bodyHeight = bodyY;
  viewport.addChild(scrollContent);

  const scrollMinY = (): number => Math.min(0, scrollH - bodyHeight);

  const clampScroll = (): void => {
    scrollContent.y = Math.min(0, Math.max(scrollMinY(), scrollContent.y));
    viewport.cursor = scrollMinY() < -0.5 ? 'grab' : 'default';
  };
  clampScroll();

  const onWheel = (e: FederatedWheelEvent): void => {
    e.preventDefault();
    let dy = typeof e.deltaY === 'number' ? e.deltaY : 0;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 96;
    scrollContent.y -= dy * 0.85;
    clampScroll();
  };
  viewport.on('wheel', onWheel);

  let dragActive = false;
  let dragPointerId: number | null = null;
  let dragStartClientY = 0;
  let dragStartContentY = 0;

  const boundMove = (ev: PointerEvent): void => {
    if (!dragActive || ev.pointerId !== dragPointerId) return;
    const dy = ev.clientY - dragStartClientY;
    scrollContent.y = dragStartContentY + dy;
    clampScroll();
  };

  const boundUp = (ev: PointerEvent): void => {
    if (!dragActive || ev.pointerId !== dragPointerId) return;
    dragActive = false;
    dragPointerId = null;
    document.removeEventListener('pointermove', boundMove);
    document.removeEventListener('pointerup', boundUp);
    document.removeEventListener('pointercancel', boundUp);
    viewport.cursor = scrollMinY() < -0.5 ? 'grab' : 'default';
  };

  const onPointerDown = (e: FederatedPointerEvent): void => {
    if (scrollMinY() >= -0.5) return;
    dragActive = true;
    dragPointerId = e.pointerId;
    dragStartClientY = e.client.y;
    dragStartContentY = scrollContent.y;
    document.addEventListener('pointermove', boundMove, { passive: true });
    document.addEventListener('pointerup', boundUp, { passive: true });
    document.addEventListener('pointercancel', boundUp, { passive: true });
    viewport.cursor = 'grabbing';
  };

  viewport.on('pointerdown', onPointerDown);

  o.parent.addChild(viewport);

  return (): void => {
    viewport.off('wheel', onWheel);
    viewport.off('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', boundMove);
    document.removeEventListener('pointerup', boundUp);
    document.removeEventListener('pointercancel', boundUp);
    if (title) {
      o.parent.removeChild(title);
      title.destroy();
      title = null;
    }
    o.parent.removeChild(tok);
    tok.destroy({ children: true });
    o.parent.removeChild(viewport);
    viewport.destroy({ children: true });
  };
}
