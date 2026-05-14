import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT_SCALE } from '../constants';
import { createEnemyBodyDisplay } from '../enemyBodyFactory';
import { battlePreviewPortraitEntries, type ChapterIntelCardParts } from '../nextBattlePreview';
import type { RoundMeta } from '../types';
import { clampMapPreviewTokenDiameter, enemyTokenDiameterForVariant } from '../unitCircleTokens';
import {
  GOLDEN_PANEL_BODY,
  GOLDEN_PANEL_INSET,
  GOLDEN_PANEL_INSET_STROKE,
  GOLDEN_PANEL_TITLE,
} from './goldenSolidPanel';

/** 章节情报详情 / 关卡地图「敌方情报」共用：改此处即可两处同步 */
function layoutMetrics() {
  return {
    mobRowGap: Math.round(18 * LAYOUT_SCALE),
    cardPad: Math.round(14 * LAYOUT_SCALE),
    portraitColW: Math.round(128 * LAYOUT_SCALE),
    portraitSlotH: Math.round(118 * LAYOUT_SCALE),
    colGap: Math.round(18 * LAYOUT_SCALE),
    cornerRadius: Math.round(14 * LAYOUT_SCALE),
    tokenScale: 1.3,
    tokenMaxFrac: 0.9,
  };
}

function nameStyleForCard(portraitColW: number) {
  return {
    fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
    fontSize: Math.round(16 * LAYOUT_SCALE),
    fill: GOLDEN_PANEL_TITLE,
    fontWeight: '700' as const,
    align: 'center' as const,
    wordWrap: true,
    wordWrapWidth: portraitColW - Math.round(6 * LAYOUT_SCALE),
    breakWords: true,
  };
}

function statStyleForCard(textW: number) {
  return {
    fontFamily: 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif',
    fontSize: Math.round(17 * LAYOUT_SCALE),
    fill: GOLDEN_PANEL_BODY,
    lineHeight: Math.round(26 * LAYOUT_SCALE),
    wordWrap: true,
    wordWrapWidth: textW,
    breakWords: true,
  };
}

/**
 * 在 `parent` 内追加一张「章节情报式」敌方单位卡（金色框 + 放大头像 + 名下置 + 两行数值 + 技能）。
 * @returns 下一张卡可用的 `topY`（已含卡间距）
 */
export function appendChapterIntelUnitCardRow(
  parent: Container,
  args: {
    parts: ChapterIntelCardParts;
    singleEnemyMeta: RoundMeta;
    bookChapterId: number;
    /** 卡片左上角 x（相对 parent） */
    originX: number;
    /** 卡片左上角 y（相对 parent） */
    topY: number;
    /** 卡片总宽 */
    rowW: number;
  },
): number {
  const { parts, singleEnemyMeta, bookChapterId, originX, topY, rowW } = args;
  if (!parts.name) return topY;

  const m = layoutMetrics();
  const ent = battlePreviewPortraitEntries(singleEnemyMeta, bookChapterId)[0]!;
  const baseD = clampMapPreviewTokenDiameter(
    enemyTokenDiameterForVariant('chapterMini', ent.paint.startsWith('boss_')),
    m.portraitColW,
    m.portraitSlotH,
  );
  const tokenD = Math.min(
    Math.round(baseD * m.tokenScale),
    Math.round(Math.min(m.portraitColW, m.portraitSlotH) * m.tokenMaxFrac),
  );

  const leftCol = new Container();
  leftCol.position.set(m.cardPad, m.cardPad);
  const bodyG = createEnemyBodyDisplay(ent.paint, 'chapterMini', tokenD, {
    wowCirclePortraitUid: ent.wowCirclePortraitUid,
  });
  bodyG.position.set(m.portraitColW / 2, m.portraitSlotH - Math.round(8 * LAYOUT_SCALE));
  leftCol.addChild(bodyG);

  const nameTf = new Text({ text: parts.name, style: nameStyleForCard(m.portraitColW) });
  nameTf.anchor.set(0.5, 0);
  nameTf.position.set(m.portraitColW / 2, m.portraitSlotH + Math.round(6 * LAYOUT_SCALE));
  leftCol.addChild(nameTf);

  const textW = Math.max(120, rowW - m.cardPad * 2 - m.portraitColW - m.colGap);
  const skillBlock = parts.skillLines.length > 0 ? `\n\n${parts.skillLines.join('\n')}` : '';
  const statTf = new Text({
    text: `${parts.statLine1}\n${parts.statLine2}${skillBlock}`,
    style: statStyleForCard(textW),
  });
  statTf.position.set(m.cardPad + m.portraitColW + m.colGap, m.cardPad);

  const leftH = m.portraitSlotH + nameTf.height + Math.round(10 * LAYOUT_SCALE);
  const rowInnerH = Math.max(leftH, statTf.height);
  const rowH = rowInnerH + m.cardPad * 2;

  const card = new Container();
  card.position.set(originX, topY);
  const cardBg = new Graphics();
  cardBg
    .roundRect(0, 0, rowW, rowH, m.cornerRadius)
    .fill(GOLDEN_PANEL_INSET)
    .stroke({ width: Math.max(2, Math.round(2 * LAYOUT_SCALE)), color: GOLDEN_PANEL_INSET_STROKE });
  card.addChild(cardBg);
  card.addChild(leftCol);
  card.addChild(statTf);
  parent.addChild(card);

  return topY + rowH + m.mobRowGap;
}
