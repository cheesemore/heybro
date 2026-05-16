import { Container, Text } from 'pixi.js';
import { GAME_HEIGHT, LAYOUT_SCALE } from '../constants';

/** 与 `attachScreenDebugLabel` 传入的 `screenId` 一致 → 左下角中文标注（方便沟通/输入法） */
const SCREEN_DEBUG_LABEL_ZH: Record<string, string> = {
  TitleScreen: '封面',
  ChapterSelectScreen: '选关',
  'ChapterSelectScreen.detail': '关卡情报',
  LevelMapScreen: '节点地图',
  BattleScreen: '战斗',
  DraftScreen: '招募',
  StrategyPickScreen: '策略抉择',
  StrengthenScreen: '强化',
  SynergyOverlay: '羁绊',
  'ModalLayer.alert': '弹窗',
};

function screenDebugLabelText(screenId: string): string {
  return SCREEN_DEBUG_LABEL_ZH[screenId] ?? screenId;
}

/**
 * 左下角小字：与人对齐界面时用；现为中文简称 + 略大字号。
 * 使用较高 zIndex，需在 root 上 `sortableChildren = true` 才生效。
 */
export function attachScreenDebugLabel(root: Container, screenId: string): void {
  root.sortableChildren = true;
  const label = new Text({
    text: screenDebugLabelText(screenId),
    style: {
      fontFamily:
        'system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
      fontSize: Math.round(12 * LAYOUT_SCALE),
      fill: 0x64748b,
      fontWeight: '600',
    },
  });
  label.eventMode = 'none';
  label.alpha = 0.92;
  label.anchor.set(0, 1);
  label.position.set(Math.round(6 * LAYOUT_SCALE), GAME_HEIGHT - Math.round(6 * LAYOUT_SCALE));
  label.zIndex = 100_000;
  root.addChild(label);
}
