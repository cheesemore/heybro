import { Container, Graphics, Rectangle, Sprite, Text, Ticker } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH, LAYOUT_SCALE } from '../constants';
import {
  cheatAddGearFarmStamina,
  GEAR_FARM_STAMINA_MAX,
  formatGearFarmRecoveryCountdown,
  getGearFarmNextRecoveryCountdownMs,
  getGearFarmStamina,
  syncGearFarmStamina,
  trySpendGearFarmStamina,
} from '../gearFarmStaminaStorage';
import { autoSettlePlayerGear, handleObtainedPlayerGear } from '../gearEquipFlow';
import {
  buildGearFarmSlotPreviews,
  gearFarmDungeonIdForProgress,
  GEAR_QUALITY_COLORS,
  rollGearFarmLoot,
} from '../gearFarmDrops';
import { loadGearIconTexture } from '../gearIconAssets';
import { createPlayerGearInstanceFromFarmRoll } from '../playerGearInstance';
import type { PlayerGearInstance } from '../playerGearInstance';
import { formatGearGsRaidLeaderHint } from '../gearCombatBonus';
import { getEquippedGear, sumEquippedGearGs } from '../playerGearStorage';
import {
  gearFarmPreviewGridMetrics,
  mountGearFarmPreviewGrid,
} from '../ui/gearFarmPreviewSlot';
import { mountGearSlotLevelBadge } from '../ui/gearSlotLevelBadge';
import { GEAR_EQUIPMENT_SLOTS, type GearSlotDef, type GearSlotKind } from '../gearSlots';
import type { ModalLayer } from './ModalLayer';
import { GAME_TERM_ZH } from '../gameTerminology';
import { drawGoldenSolidPanel, GOLDEN_PANEL_TITLE } from '../ui/goldenSolidPanel';
import { createStyledGameButton, redrawGameButtonFromStyle, type GameButton } from '../ui/gameButtons';
import { gearSlotLocalCenter } from '../gearSlotLayout';
import { playGearReplaceFx } from '../ui/gearEquipReplaceFx';
import { spawnFloatingGameTip } from '../ui/floatingGameTip';
import { attachScreenDebugLabel } from '../ui/screenDebugLabel';

const PAD = Math.round(24 * LAYOUT_SCALE);
const FF = 'system-ui, "Microsoft YaHei", Segoe UI, sans-serif';
const GEAR_SLOTS_OFFSET_Y = Math.round(30 * LAYOUT_SCALE);
const FARM_PREVIEW_ROW_COUNT = Math.ceil(14 / 5);
const AUTO_FARM_INTERVAL_MS = 500;

/** 上方 12 槽：3 行 × 4 列（不含主手、饰品） */
function mountGearSlotGrid(
  slotsRoot: Container,
  slotNormal: number,
  slotLarge: number,
  equippedOf: (kind: GearSlotKind) => PlayerGearInstance | null,
  onEquippedTap?: (gear: PlayerGearInstance) => void,
): number {
  const gridSlots = GEAR_EQUIPMENT_SLOTS.filter((s) => !s.large);
  const colGap = Math.round(18 * LAYOUT_SCALE);
  const rowGap = Math.round(28 * LAYOUT_SCALE);
  const colStep = slotNormal + colGap;
  const rowStep = slotNormal + rowGap;
  const gridW = 4 * colStep - colGap;
  const startX = -gridW / 2 + slotNormal / 2;

  for (let i = 0; i < gridSlots.length; i++) {
    const def = gridSlots[i]!;
    const col = i % 4;
    const row = Math.floor(i / 4);
    drawGearSlot(
      slotsRoot,
      startX + col * colStep,
      row * rowStep,
      slotNormal,
      def,
      false,
      equippedOf(def.kind),
      onEquippedTap,
    );
  }

  const largeRowY = 3 * rowStep + Math.round(14 * LAYOUT_SCALE);
  const largeGap = Math.round(36 * LAYOUT_SCALE);
  const pairW = slotLarge * 2 + largeGap;
  const mainDef = GEAR_EQUIPMENT_SLOTS.find((s) => s.kind === 'mainHand')!;
  const trinketDef = GEAR_EQUIPMENT_SLOTS.find((s) => s.kind === 'trinket')!;
  drawGearSlot(
    slotsRoot,
    -pairW / 2 + slotLarge / 2,
    largeRowY,
    slotLarge,
    mainDef,
    true,
    equippedOf(mainDef.kind),
    onEquippedTap,
  );
  drawGearSlot(
    slotsRoot,
    pairW / 2 - slotLarge / 2,
    largeRowY,
    slotLarge,
    trinketDef,
    true,
    equippedOf(trinketDef.kind),
    onEquippedTap,
  );

  return largeRowY + slotLarge + rowGap;
}

function drawGearSlot(
  parent: Container,
  x: number,
  y: number,
  size: number,
  def: GearSlotDef,
  large: boolean,
  equipped: PlayerGearInstance | null,
  onEquippedTap?: (gear: PlayerGearInstance) => void,
): void {
  const slot = new Container();
  slot.position.set(x, y);

  const qColor = equipped ? GEAR_QUALITY_COLORS[equipped.quality] : null;
  const strokeColor = qColor ?? (large ? 0x94a3b8 : 0x475569);

  const bg = new Graphics();
  const r = Math.round(12 * LAYOUT_SCALE);
  bg.roundRect(-size / 2, -size / 2, size, size, r).fill(0x1e293b).stroke({
    width: Math.max(2, Math.round(2 * LAYOUT_SCALE)),
    color: strokeColor,
  });
  slot.addChild(bg);

  const iconHost = new Container();
  slot.addChild(iconHost);

  const inner = size * 0.88;
  const iconPlaceholder = new Graphics();
  iconPlaceholder
    .roundRect(-inner / 2, -inner / 2, inner, inner, Math.round(8 * LAYOUT_SCALE))
    .fill(equipped ? { color: qColor!, alpha: 0.35 } : 0x334155);
  iconHost.addChild(iconPlaceholder);

  if (equipped) {
    void loadGearIconTexture(equipped.gearId).then((tex) => {
      if (!tex || slot.destroyed) return;
      const spr = new Sprite(tex);
      const fit = inner * 0.92;
      const scale = Math.min(fit / spr.texture.width, fit / spr.texture.height);
      spr.scale.set(scale);
      spr.anchor.set(0.5);
      iconHost.addChild(spr);
    });
    mountGearSlotLevelBadge(slot, size / 2, equipped.level, strokeColor);
    if (onEquippedTap) {
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.hitArea = new Rectangle(-size / 2, -size / 2, size, size);
      slot.on('pointertap', (e) => {
        e.stopPropagation();
        onEquippedTap(equipped);
      });
    }
  } else {
    const numT = new Text({
      text: String(def.slotNo),
      style: {
        fontFamily: FF,
        fontSize: Math.round((large ? 30 : 24) * LAYOUT_SCALE),
        fill: 0xf1f5f9,
        fontWeight: '800',
      },
    });
    numT.anchor.set(0.5);
    slot.addChild(numT);
  }

  const lab = new Text({
    text: equipped ? equipped.nameCn : def.labelCn,
    style: {
      fontFamily: FF,
      fontSize: Math.round((large ? 13 : 11) * LAYOUT_SCALE),
      fill: equipped ? (qColor ?? 0xe2e8f0) : 0x94a3b8,
      fontWeight: '600',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: size + Math.round(24 * LAYOUT_SCALE),
    },
  });
  lab.anchor.set(0.5, 0);
  lab.position.set(0, size / 2 + Math.round(4 * LAYOUT_SCALE));
  slot.addChild(lab);

  parent.addChild(slot);
}

/**
 * 副本刷装：上方 14 空槽，中部可掉落说明，底部刷装按钮（消耗体力）。
 */
export class GearFarmScreen extends Container {
  private readonly onBack: () => void;
  private readonly modal: ModalLayer;
  private readonly farmDungeonId: string;
  private readonly farmBtn: GameButton;
  private readonly autoBtn: GameButton;
  private readonly farmBtnW: number;
  private readonly farmBtnH: number;
  private readonly autoBtnW: number;
  private autoFarmActive = false;
  private autoFarmAccumMs = 0;
  private readonly recoveryLabel: Text;
  private readonly slotsRoot: Container;
  private readonly farmPreviewHost: Container;
  private readonly slotNormal: number;
  private readonly slotLarge: number;
  private readonly slotsTopY: number;
  private farmPreviewIconsY = 0;
  private farmPreviewRowW = 0;
  private readonly tickHandler: () => void;
  private readonly totalGsLabel: Text;
  private readonly gsHintLabel: Text;
  private lastShownStamina = -1;

  constructor(onBack: () => void, modal: ModalLayer) {
    super();
    this.onBack = onBack;
    this.modal = modal;
    this.farmDungeonId = gearFarmDungeonIdForProgress();
    this.sortableChildren = true;

    const bg = new Graphics();
    bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x0f172a);
    this.addChild(bg);

    const titleT = new Text({
      text: GAME_TERM_ZH.farmDungeonButton,
      style: {
        fontFamily: FF,
        fontSize: Math.round(34 * LAYOUT_SCALE),
        fill: 0xf8fafc,
        fontWeight: '800',
      },
    });
    titleT.position.set(PAD, Math.round(52 * LAYOUT_SCALE));
    this.addChild(titleT);

    const cheatBtnW = Math.round(168 * LAYOUT_SCALE);
    const cheatBtnH = Math.round(44 * LAYOUT_SCALE);
    const cheatBtn = createStyledGameButton('classicMuted', {
      text: '作弊+50体',
      width: cheatBtnW,
      height: cheatBtnH,
      fontSize: Math.round(16 * LAYOUT_SCALE),
      onTap: () => {
        cheatAddGearFarmStamina(50);
        this.refreshFarmButtonLabel();
        this.refreshRecoveryLabel();
      },
    });
    cheatBtn.position.set((GAME_WIDTH - cheatBtnW) / 2, Math.round(48 * LAYOUT_SCALE));
    this.addChild(cheatBtn);

    this.recoveryLabel = new Text({
      text: '',
      style: {
        fontFamily: FF,
        fontSize: Math.round(16 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        fontWeight: '600',
        align: 'right',
      },
    });
    this.recoveryLabel.anchor.set(1, 0);
    this.recoveryLabel.position.set(GAME_WIDTH - PAD, Math.round(58 * LAYOUT_SCALE));
    this.addChild(this.recoveryLabel);

    const panelW = GAME_WIDTH - PAD * 2;
    const panelRowW = panelW - Math.round(32 * LAYOUT_SCALE);
    const { rowStride: previewRowStride } = gearFarmPreviewGridMetrics(panelRowW);
    const panelTitleH = Math.round(52 * LAYOUT_SCALE);
    const panelBottomPad = Math.round(20 * LAYOUT_SCALE);
    const panelH =
      panelTitleH + FARM_PREVIEW_ROW_COUNT * previewRowStride + panelBottomPad;
    const bottomMargin = Math.round(16 * LAYOUT_SCALE);
    const sectionGap = Math.round(20 * LAYOUT_SCALE);

    this.farmBtnH = Math.round(80 * LAYOUT_SCALE);
    this.farmBtnW = Math.round(300 * LAYOUT_SCALE);
    this.autoBtnW = Math.round(140 * LAYOUT_SCALE);
    const backW = Math.round(140 * LAYOUT_SCALE);
    const actionGap = Math.round(16 * LAYOUT_SCALE);
    const actionRowW = backW + actionGap + this.farmBtnW + actionGap + this.autoBtnW;
    const actionRowX = (GAME_WIDTH - actionRowW) / 2;
    const actionRowY = GAME_HEIGHT - bottomMargin - this.farmBtnH;

    const panelTop = actionRowY - sectionGap - panelH;

    this.slotsTopY = Math.round(168 * LAYOUT_SCALE) + GEAR_SLOTS_OFFSET_Y;
    this.slotsRoot = new Container();
    this.slotsRoot.position.set(GAME_WIDTH / 2, this.slotsTopY);
    this.addChild(this.slotsRoot);

    this.slotNormal = Math.round(76 * LAYOUT_SCALE);
    this.slotLarge = Math.round(104 * LAYOUT_SCALE);

    this.totalGsLabel = new Text({
      text: '',
      style: {
        fontFamily: FF,
        fontSize: Math.round(30 * LAYOUT_SCALE),
        fill: 0xfbbf24,
        fontWeight: '900',
      },
    });
    this.totalGsLabel.anchor.set(0.5, 1);
    this.gsHintLabel = new Text({
      text: formatGearGsRaidLeaderHint(0),
      style: {
        fontFamily: FF,
        fontSize: Math.round(15 * LAYOUT_SCALE),
        fill: 0x94a3b8,
        fontWeight: '600',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: panelW - Math.round(32 * LAYOUT_SCALE),
      },
    });
    this.gsHintLabel.anchor.set(0.5, 1);

    const gsBlockGap = Math.round(12 * LAYOUT_SCALE);
    this.gsHintLabel.position.set(GAME_WIDTH / 2, panelTop - gsBlockGap);
    this.totalGsLabel.position.set(
      GAME_WIDTH / 2,
      panelTop - gsBlockGap - this.gsHintLabel.height - Math.round(6 * LAYOUT_SCALE),
    );
    this.addChild(this.totalGsLabel);
    this.addChild(this.gsHintLabel);

    this.refreshEquippedSlots();

    const backBtn = createStyledGameButton('cta', {
      text: '返回',
      width: backW,
      height: this.farmBtnH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
    });
    backBtn.position.set(actionRowX, actionRowY);
    backBtn.on('pointertap', () => this.onBack());
    this.addChild(backBtn);

    this.farmBtn = createStyledGameButton('accent', {
      text: GAME_TERM_ZH.farmDungeonButton,
      width: this.farmBtnW,
      height: this.farmBtnH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
    });
    this.farmBtn.position.set(actionRowX + backW + actionGap, actionRowY);
    this.farmBtn.on('pointertap', () => this.runFarmOnce(false));
    this.addChild(this.farmBtn);

    this.autoBtn = createStyledGameButton('classicMuted', {
      text: '自动',
      width: this.autoBtnW,
      height: this.farmBtnH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
    });
    this.autoBtn.position.set(actionRowX + backW + actionGap + this.farmBtnW + actionGap, actionRowY);
    this.autoBtn.on('pointertap', () => this.toggleAutoFarm());
    this.addChild(this.autoBtn);

    const plate = new Graphics();
    const frame = new Graphics();
    drawGoldenSolidPanel(plate, frame, panelW, panelH, LAYOUT_SCALE);
    plate.position.set(PAD, panelTop);
    frame.position.set(PAD, panelTop);
    this.addChild(plate);
    this.addChild(frame);

    const panelTitle = new Text({
      text: '可掉落最强装备',
      style: {
        fontFamily: FF,
        fontSize: Math.round(20 * LAYOUT_SCALE),
        fill: GOLDEN_PANEL_TITLE,
        fontWeight: '800',
      },
    });
    panelTitle.position.set(PAD + Math.round(20 * LAYOUT_SCALE), panelTop + Math.round(14 * LAYOUT_SCALE));
    this.addChild(panelTitle);

    this.farmPreviewHost = new Container();
    this.farmPreviewIconsY = panelTop + panelTitleH;
    this.farmPreviewRowW = panelRowW;
    this.addChild(this.farmPreviewHost);
    this.refreshFarmPreviewGrid();

    this.refreshFarmButtonLabel();
    this.refreshRecoveryLabel();
    attachScreenDebugLabel(this, 'GearFarm');

    this.tickHandler = () => this.onTick();
    Ticker.shared.add(this.tickHandler);
  }

  private onTick(): void {
    const before = this.lastShownStamina >= 0 ? this.lastShownStamina : getGearFarmStamina();
    const after = syncGearFarmStamina();
    if (after !== before) {
      this.refreshFarmButtonLabel();
    }
    this.refreshRecoveryLabel();

    if (!this.autoFarmActive) return;
    this.autoFarmAccumMs += Ticker.shared.deltaMS;
    while (this.autoFarmActive && this.autoFarmAccumMs >= AUTO_FARM_INTERVAL_MS) {
      this.autoFarmAccumMs -= AUTO_FARM_INTERVAL_MS;
      if (!this.runFarmOnce(true)) {
        this.stopAutoFarm();
        break;
      }
    }
  }

  private refreshRecoveryLabel(): void {
    const remainMs = getGearFarmNextRecoveryCountdownMs();
    const clock = formatGearFarmRecoveryCountdown(remainMs);
    this.recoveryLabel.text = `下次体力恢复时间 ${clock}`;
  }

  private refreshAutoButtonLabel(): void {
    const style = this.autoFarmActive ? 'accent' : 'classicMuted';
    const text = this.autoFarmActive ? '自动中' : '自动';
    redrawGameButtonFromStyle(this.autoBtn, style, {
      text,
      width: this.autoBtnW,
      height: this.farmBtnH,
      fontSize: Math.round(22 * LAYOUT_SCALE),
    });
  }

  private toggleAutoFarm(): void {
    if (this.autoFarmActive) {
      this.stopAutoFarm();
      return;
    }
    this.autoFarmActive = true;
    this.autoFarmAccumMs = AUTO_FARM_INTERVAL_MS;
    this.refreshAutoButtonLabel();
  }

  private stopAutoFarm(tip?: string): void {
    if (!this.autoFarmActive && !tip) return;
    this.autoFarmActive = false;
    this.autoFarmAccumMs = 0;
    this.refreshAutoButtonLabel();
    if (tip) spawnFloatingGameTip(this, tip);
  }

  private refreshFarmButtonLabel(): void {
    const n = getGearFarmStamina();
    this.lastShownStamina = n;
    redrawGameButtonFromStyle(this.farmBtn, 'accent', {
      text: `${GAME_TERM_ZH.farmDungeonButton}（${n}/${GEAR_FARM_STAMINA_MAX}）`,
      width: this.farmBtnW,
      height: this.farmBtnH,
      fontSize: Math.round(26 * LAYOUT_SCALE),
    });
  }

  private refreshEquippedSlots(): void {
    this.slotsRoot.removeChildren();
    mountGearSlotGrid(
      this.slotsRoot,
      this.slotNormal,
      this.slotLarge,
      (kind) => getEquippedGear(kind),
      (gear) => this.modal.showGearDetail(gear),
    );
    this.refreshTotalGsLabel();
  }

  private refreshTotalGsLabel(): void {
    const total = sumEquippedGearGs();
    this.totalGsLabel.text = `总GS${total}`;
    this.gsHintLabel.text = formatGearGsRaidLeaderHint(total);
  }

  private playGearReplaceFx(gear: PlayerGearInstance): void {
    const local = gearSlotLocalCenter(gear.slotKind, this.slotNormal, this.slotLarge);
    const x = GAME_WIDTH / 2 + local.x;
    const y = this.slotsTopY + local.y;
    playGearReplaceFx(this, x, y, GEAR_QUALITY_COLORS[gear.quality]);
  }

  private refreshFarmPreviewGrid(): void {
    this.farmPreviewHost.removeChildren();
    mountGearFarmPreviewGrid(
      this.farmPreviewHost,
      PAD + Math.round(16 * LAYOUT_SCALE),
      this.farmPreviewIconsY,
      this.farmPreviewRowW,
      buildGearFarmSlotPreviews(this.farmDungeonId),
    );
  }

  /** @returns 是否成功消耗体力并完成一次刷本 */
  private runFarmOnce(auto: boolean): boolean {
    if (!trySpendGearFarmStamina(1)) {
      if (!auto) spawnFloatingGameTip(this, '体力不足');
      else this.stopAutoFarm('体力不足，已停止自动');
      return false;
    }
    this.refreshFarmButtonLabel();
    this.refreshRecoveryLabel();
    const roll = rollGearFarmLoot(this.farmDungeonId);
    if (!roll) {
      const msg = '当前副本暂无掉落配置';
      if (!auto) spawnFloatingGameTip(this, msg);
      else this.stopAutoFarm(msg);
      return false;
    }
    const instance = createPlayerGearInstanceFromFarmRoll(roll);
    if (auto) {
      const kind = autoSettlePlayerGear(instance);
      this.refreshEquippedSlots();
      this.refreshFarmPreviewGrid();
      if (kind === 'replace') this.playGearReplaceFx(instance);
      this.refreshTotalGsLabel();
    } else {
      spawnFloatingGameTip(this, roll.displayLine, { fill: roll.tipColor });
      handleObtainedPlayerGear(instance, this.modal, (kind, gear) => {
        this.refreshEquippedSlots();
        this.refreshFarmPreviewGrid();
        if (kind === 'replace') {
          this.playGearReplaceFx(gear);
        }
        this.refreshTotalGsLabel();
      });
    }
    return true;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.stopAutoFarm();
    Ticker.shared.remove(this.tickHandler);
    super.destroy(options);
  }
}
