import { Container, Graphics, Text } from 'pixi.js';
import {
  ARENA_DRAFT_STARTING_GOLD,
  ARENA_MAX_LOSSES,
  arenaAwaitingClaim,
  arenaCanBattle,
  claimArenaRewards,
  getArenaDraftProgress,
  getArenaLockedLineup,
  getArenaRunRecord,
} from '../arenaStorage';
import { getArenaUsername } from '../arenaUsername';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';
import { mountArenaLineupPanel } from '../ui/arenaLineupPanel';
import { createStyledGameButton } from '../ui/gameButtons';
import { drawGoldenSolidPanel, GOLDEN_PANEL_BODY, GOLDEN_PANEL_TITLE } from '../ui/goldenSolidPanel';
import type { ModalLayer } from './ModalLayer';

const FF = 'system-ui, Segoe UI, Roboto, "Microsoft YaHei", sans-serif';
const PAD = Math.round(24 * LAYOUT_SCALE);

export class ArenaScreen extends Container {
  private readonly onBack: () => void;
  private readonly onConfigure: () => void;
  private readonly onStartBattle: () => void;
  private readonly modal: ModalLayer;
  private contentLayer = new Container();

  constructor(
    onBack: () => void,
    onConfigure: () => void,
    onStartBattle: () => void,
    modal: ModalLayer,
  ) {
    super();
    this.onBack = onBack;
    this.onConfigure = onConfigure;
    this.onStartBattle = onStartBattle;
    this.modal = modal;
    this.sortableChildren = true;

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0a0f1c);
    this.addChild(bg);

    const title = new Text({
      text: '竞技场',
      style: {
        fontFamily: FF,
        fontSize: Math.round(36 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    title.position.set(PAD, Math.round(48 * LAYOUT_SCALE));
    this.addChild(title);

    const uname = getArenaUsername();
    if (uname) {
      const userLab = new Text({
        text: `ID · ${uname}`,
        style: {
          fontFamily: FF,
          fontSize: Math.round(17 * LAYOUT_SCALE),
          fill: 0x94a3b8,
        },
      });
      userLab.position.set(PAD, Math.round(92 * LAYOUT_SCALE));
      this.addChild(userLab);
    }

    const backW = Math.round(140 * LAYOUT_SCALE);
    const backH = Math.round(50 * LAYOUT_SCALE);
    const backBtn = createStyledGameButton('classic', {
      text: '返回',
      width: backW,
      height: backH,
      fontSize: Math.round(20 * LAYOUT_SCALE),
      onTap: () => this.onBack(),
    });
    backBtn.position.set(GAME_WIDTH - backW - PAD, Math.round(44 * LAYOUT_SCALE));
    this.addChild(backBtn);

    this.contentLayer.position.set(0, Math.round(108 * LAYOUT_SCALE));
    this.addChild(this.contentLayer);

    this.rebuild();
    attachScreenDebugLabel(this, 'Arena');
  }

  private rebuild(): void {
    this.contentLayer.removeChildren();
    const lineup = getArenaLockedLineup();
    if (!lineup) {
      this.buildNoLineup();
      return;
    }
    this.buildHub(lineup);
  }

  private buildNoLineup(): void {
    const hasDraft = getArenaDraftProgress() != null;
    const panelW = GAME_WIDTH - PAD * 2;
    const panelH = Math.round(320 * LAYOUT_SCALE);
    const panelWrap = new Container();
    panelWrap.position.set(PAD, 0);
    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, panelW, panelH, LAYOUT_SCALE);
    panelWrap.addChild(plate);
    panelWrap.addChild(frame);
    this.contentLayer.addChild(panelWrap);

    const hint = new Text({
      text: hasDraft
        ? '你有进行中的竞技场选阵。\n继续配置并保存后锁定阵容。'
        : `你还没有竞技场阵容。\n使用 ${ARENA_DRAFT_STARTING_GOLD} 金币招募并布置九宫阵容，保存后锁定；\n最多败 3 场后需领奖结束本轮。`,
      style: {
        fontFamily: FF,
        fontSize: Math.round(22 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_BODY,
        align: 'center',
        lineHeight: Math.round(32 * LAYOUT_SCALE),
        wordWrap: true,
        wordWrapWidth: panelW - Math.round(48 * LAYOUT_SCALE),
      },
    });
    hint.anchor.set(0.5, 0);
    hint.position.set(GAME_WIDTH / 2, Math.round(40 * LAYOUT_SCALE));
    this.contentLayer.addChild(hint);

    const btnW = Math.round(320 * LAYOUT_SCALE);
    const btnH = Math.round(72 * LAYOUT_SCALE);
    const btn = createStyledGameButton('cta', {
      text: hasDraft ? '继续配置' : '配置阵容',
      width: btnW,
      height: btnH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
      onTap: () => this.onConfigure(),
    });
    btn.position.set((GAME_WIDTH - btnW) / 2, Math.round(200 * LAYOUT_SCALE));
    this.contentLayer.addChild(btn);
  }

  private buildHub(lineup: NonNullable<ReturnType<typeof getArenaLockedLineup>>): void {
    const { wins, losses } = getArenaRunRecord();
    const retired = arenaAwaitingClaim();

    const gridTop = Math.round(8 * LAYOUT_SCALE);
    const { bottomY } = mountArenaLineupPanel(this.contentLayer, lineup, gridTop);

    const recordY = bottomY + Math.round(20 * LAYOUT_SCALE);
    const winsLab = new Text({
      text: `本套阵容 · 胜 ${wins} 场`,
      style: {
        fontFamily: FF,
        fontSize: Math.round(24 * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '700',
        align: 'center',
      },
    });
    winsLab.anchor.set(0.5, 0);
    winsLab.position.set(GAME_WIDTH / 2, recordY);
    this.contentLayer.addChild(winsLab);

    const xRow = new Container();
    xRow.position.set(GAME_WIDTH / 2, recordY + Math.round(40 * LAYOUT_SCALE));
    for (let i = 0; i < ARENA_MAX_LOSSES; i++) {
      const mark = new Text({
        text: i < losses ? '✕' : '○',
        style: {
          fontFamily: FF,
          fontSize: Math.round(30 * LAYOUT_SCALE),
          fill: i < losses ? 0xef4444 : 0x475569,
          fontWeight: '800',
        },
      });
      mark.anchor.set(0.5, 0.5);
      mark.position.set((i - 1) * Math.round(48 * LAYOUT_SCALE), 0);
      xRow.addChild(mark);
    }
    this.contentLayer.addChild(xRow);

    const btnW = Math.round(360 * LAYOUT_SCALE);
    const btnH = Math.round(76 * LAYOUT_SCALE);
    const btnGap = Math.round(14 * LAYOUT_SCALE);
    const btnY = GAME_HEIGHT - Math.round(200 * LAYOUT_SCALE) - Math.round(108 * LAYOUT_SCALE);

    if (retired) {
      const claimBtn = createStyledGameButton('cta', {
        text: '领奖',
        width: btnW,
        height: btnH,
        fontSize: Math.round(28 * LAYOUT_SCALE),
        onTap: () => this.onClaim(),
      });
      claimBtn.position.set((GAME_WIDTH - btnW) / 2, btnY);
      this.contentLayer.addChild(claimBtn);
      return;
    }

    const abandonW = Math.round(220 * LAYOUT_SCALE);
    const abandonBtn = createStyledGameButton('classic', {
      text: '放弃并领奖',
      width: abandonW,
      height: Math.round(58 * LAYOUT_SCALE),
      fontSize: Math.round(22 * LAYOUT_SCALE),
      onTap: () => this.onAbandon(),
    });
    const abandonRowY = btnY - Math.round(58 * LAYOUT_SCALE) - btnGap;
    abandonBtn.position.set((GAME_WIDTH - abandonW) / 2, abandonRowY);
    this.contentLayer.addChild(abandonBtn);

    const battleBtn = createStyledGameButton('danger', {
      text: '对战',
      width: btnW,
      height: btnH,
      fontSize: Math.round(28 * LAYOUT_SCALE),
      onTap: () => this.onBattle(),
    });
    battleBtn.position.set((GAME_WIDTH - btnW) / 2, btnY);
    if (!arenaCanBattle()) {
      battleBtn.eventMode = 'passive';
      battleBtn.cursor = 'default';
    }
    this.contentLayer.addChild(battleBtn);
  }

  private onBattle(): void {
    if (!arenaCanBattle()) return;
    this.onStartBattle();
  }

  private finishClaimAndGoDraft(wins: number, gained: number, title: string): void {
    this.modal.alert(
      `${title}：${gained} 张竞技场招募券\n（本场 ${wins} 胜）`,
      () => this.onConfigure(),
    );
  }

  private onClaim(): void {
    const { wins } = getArenaRunRecord();
    const gained = claimArenaRewards();
    this.finishClaimAndGoDraft(wins, gained, '已领取竞技场奖励');
  }

  private onAbandon(): void {
    this.modal.confirmDestructive(
      '确定放弃本轮竞技场？\n将按当前胜场发放招募券并结束，随后可重新布阵。',
      () => {
        const { wins } = getArenaRunRecord();
        const gained = claimArenaRewards();
        this.finishClaimAndGoDraft(wins, gained, '已放弃并领取');
      },
      undefined,
      { confirmText: '放弃并领奖' },
    );
  }

  refresh(): void {
    this.rebuild();
  }
}
