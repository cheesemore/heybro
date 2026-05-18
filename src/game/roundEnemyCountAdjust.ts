import adjustDoc from './config/roundEnemyCountAdjust.json';

type AdjustDoc = {
  deltaByNodeLabel?: Record<string, number>;
  deltaByBookChapterId?: Record<string, Record<string, number>>;
};

const doc = adjustDoc as AdjustDoc;

const deltaByLabel = new Map<string, number>(
  Object.entries(doc.deltaByNodeLabel ?? {}).map(([k, v]) => [k, Math.floor(Number(v))]),
);

const deltaByChapter = new Map<number, Map<string, number>>(
  Object.entries(doc.deltaByBookChapterId ?? {}).map(([ch, labels]) => [
    Number(ch),
    new Map(Object.entries(labels).map(([k, v]) => [k, Math.floor(Number(v))])),
  ]),
);

/** 普通战节点对总兵数的配置加减；章内覆盖优先于全局 label */
export function roundEnemyCountDelta(bookChapterId: number, nodeLabel: string): number {
  const chapterMap = deltaByChapter.get(bookChapterId);
  if (chapterMap?.has(nodeLabel)) return chapterMap.get(nodeLabel)!;
  return deltaByLabel.get(nodeLabel) ?? 0;
}
